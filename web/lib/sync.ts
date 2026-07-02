import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getValidGoogleAccessToken,
  listCalendarEvents,
} from "@/lib/google";
import {
  archiveItemNotionPage,
  createItemNotionPage,
  getNotionAccessToken,
  listNotionPagesWithEventDate,
} from "@/lib/notion";
import type { Item, Profile } from "@/lib/types";

const SYNC_WINDOW_PAST_DAYS = 30;
const SYNC_WINDOW_FUTURE_DAYS = 90;

export interface SyncResult {
  importedFromGoogle: number;
  importedFromNotion: number;
  mergedDuplicates: number;
  errors: string[];
}

function duplicateKey(title: string, startTime: string | null): string | null {
  if (!startTime) return null;
  return `${title.trim().toLowerCase()}|${startTime}`;
}

/** Extrae "HH:mm" de un ISO datetime como "2026-07-01T09:00:00-06:00". */
function extractHHMM(isoDatetime: string): string | null {
  const match = isoDatetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/**
 * Clave de duplicado para tareas con rutina (recurrence_days no vacío): se
 * basa en título + días de la semana, no en start_time exacto, porque cada
 * ocurrencia de la misma rutina puede tener un start_time distinto (p. ej.
 * filas remanentes de una rutina que antes se guardaba una vez por día).
 */
function routineDuplicateKey(item: Item): string | null {
  if (!item.recurrence_days || item.recurrence_days.length === 0) return null;
  const days = [...item.recurrence_days].sort((a, b) => a - b).join(",");
  return `routine|${item.title.trim().toLowerCase()}|${days}`;
}

/**
 * Importa a Supabase los eventos de Google Calendar y las páginas de Notion
 * que no fueron creados desde la app, crea su contraparte en el otro
 * servicio para mantener todo espejado, y al final junta cualquier tarea
 * duplicada (mismo título, misma fecha/hora) en una sola, conservando la
 * que tenga más información.
 *
 * Solo crea/junta — no actualiza ediciones de algo que ya estaba bien
 * vinculado (eso queda para una futura mejora).
 */
export async function runFullSync(userId: string): Promise<SyncResult> {
  const supabase = createServiceRoleClient();
  const errors: string[] = [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, notion_database_id")
    .eq("id", userId)
    .single<Pick<Profile, "timezone" | "notion_database_id">>();

  const { data: existingItemsRaw } = await supabase.from("items").select("*").eq("user_id", userId);
  const existingItems = (existingItemsRaw ?? []) as Item[];

  const knownGoogleIds = new Set(existingItems.map((i) => i.google_event_id).filter(Boolean));
  const knownNotionIds = new Set(existingItems.map((i) => i.notion_page_id).filter(Boolean));
  const byDuplicateKey = new Map<string, Item>();
  for (const item of existingItems) {
    const key = duplicateKey(item.title, item.start_time);
    if (key) byDuplicateKey.set(key, item);
  }

  // Mapa para detectar rutinas locales que coincidan con eventos recurrentes de
  // Google: clave = "título normalizado|HH:mm" usando recurrence_start_time.
  const routineByTitleAndTime = new Map<string, Item>();
  for (const item of existingItems) {
    if (item.recurrence_days?.length && item.recurrence_start_time) {
      const key = `${item.title.trim().toLowerCase()}|${item.recurrence_start_time}`;
      routineByTitleAndTime.set(key, item);
    }
  }

  let importedFromGoogle = 0;
  let importedFromNotion = 0;

  // --- Google Calendar -> app (+ espejo en Notion) ---
  try {
    const googleToken = await getValidGoogleAccessToken(userId);
    const now = new Date();
    const timeMin = new Date(now.getTime() - SYNC_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + SYNC_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const events = await listCalendarEvents(googleToken, timeMin, timeMax);

    // Eventos recurrentes externos (no creados por la app) cuya serie ya fue importada esta ronda.
    const importedRecurringIds = new Set<string>();

    for (const event of events) {
      if (knownGoogleIds.has(event.id)) continue;

      // Ocurrencia de un evento recurrente cuyo maestro ya está en la BD (lo creó la app):
      // Google expande el RRULE en instancias individuales al listar con singleEvents=true;
      // la ID maestra es la que guardamos en items.google_event_id, no las instancias.
      if (event.recurringEventId && knownGoogleIds.has(event.recurringEventId)) continue;

      // Serie recurrente externa (creada fuera de la app): solo importar la primera ocurrencia
      // para que quede como referencia, ignorar el resto de la serie.
      if (event.recurringEventId) {
        if (importedRecurringIds.has(event.recurringEventId)) continue;

        // Si ya existe una rutina local con el mismo nombre y mismo horario
        // (HH:mm), considerarlas la misma — no crear un duplicado en Notion.
        if (!event.allDay) {
          const eventHHMM = extractHHMM(event.start);
          if (eventHHMM) {
            const routineKey = `${event.title.trim().toLowerCase()}|${eventHHMM}`;
            const matchingRoutine = routineByTitleAndTime.get(routineKey);
            if (matchingRoutine) {
              importedRecurringIds.add(event.recurringEventId);
              // Vincular el evento de Google a la rutina si aún no está vinculada.
              if (!matchingRoutine.google_event_id) {
                const masterGoogleId = event.recurringEventId;
                await supabase.from("items").update({ google_event_id: masterGoogleId }).eq("id", matchingRoutine.id);
                knownGoogleIds.add(masterGoogleId);
              }
              continue;
            }
          }
        }

        importedRecurringIds.add(event.recurringEventId);
      }

      // Ya existe una tarea con el mismo título y fecha/hora: no duplicar,
      // solo enlazar este evento si a esa tarea le faltaba.
      const existingMatch = byDuplicateKey.get(duplicateKey(event.title, event.start) ?? "");
      if (existingMatch) {
        const patch: Record<string, unknown> = {};
        if (!existingMatch.google_event_id) patch.google_event_id = event.id;
        if (!existingMatch.description && event.description) patch.description = event.description;
        if (Object.keys(patch).length > 0) {
          await supabase.from("items").update(patch).eq("id", existingMatch.id);
        }
        continue;
      }

      const { data: item, error } = await supabase
        .from("items")
        .insert({
          user_id: userId,
          type: "evento",
          title: event.title,
          description: event.description,
          start_time: event.start,
          end_time: event.end,
          all_day: event.allDay,
          add_to_calendar: true,
          status: "syncing",
          google_event_id: event.recurringEventId ?? event.id,
          source: "google_sync",
        })
        .select("*")
        .single<Item>();

      if (error || !item) {
        errors.push(`Google "${event.title}": ${error?.message ?? "no se pudo guardar"}`);
        continue;
      }

      try {
        if (profile?.notion_database_id) {
          const notionToken = await getNotionAccessToken(userId);
          const { pageId, url } = await createItemNotionPage(notionToken, profile.notion_database_id, item);
          await supabase
            .from("items")
            .update({ notion_page_id: pageId, notion_url: url, status: "confirmed" })
            .eq("id", item.id);
        } else {
          await supabase.from("items").update({ status: "confirmed" }).eq("id", item.id);
        }
      } catch (err) {
        errors.push(`Notion (espejo de "${event.title}"): ${err instanceof Error ? err.message : "error"}`);
        await supabase.from("items").update({ status: "failed" }).eq("id", item.id);
      }

      byDuplicateKey.set(duplicateKey(item.title, item.start_time) ?? "", item);
      importedFromGoogle += 1;
    }
  } catch (err) {
    errors.push(`Google Calendar: ${err instanceof Error ? err.message : "no se pudo sincronizar"}`);
  }

  // --- Notion -> app (+ espejo en Google Calendar) ---
  try {
    if (profile?.notion_database_id) {
      const notionToken = await getNotionAccessToken(userId);
      const pages = await listNotionPagesWithEventDate(notionToken, profile.notion_database_id);

      for (const page of pages) {
        if (knownNotionIds.has(page.pageId)) continue;

        const existingMatch = byDuplicateKey.get(duplicateKey(page.title, page.startTime) ?? "");
        if (existingMatch) {
          const patch: Record<string, unknown> = {};
          if (!existingMatch.notion_page_id) {
            patch.notion_page_id = page.pageId;
            patch.notion_url = page.url;
          }
          if (!existingMatch.description && page.description) patch.description = page.description;
          if (!existingMatch.priority && page.priority) patch.priority = page.priority;
          if (!existingMatch.effort && page.effort) patch.effort = page.effort;
          if ((existingMatch.categories ?? []).length === 0 && page.categories.length > 0) {
            patch.categories = page.categories;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("items").update(patch).eq("id", existingMatch.id);
          }
          continue;
        }

        const { data: item, error } = await supabase
          .from("items")
          .insert({
            user_id: userId,
            type: "personal",
            title: page.title,
            description: page.description,
            start_time: page.startTime,
            end_time: page.endTime,
            all_day: page.allDay,
            add_to_calendar: true,
            status: "syncing",
            notion_page_id: page.pageId,
            notion_url: page.url,
            priority: page.priority,
            effort: page.effort,
            task_status: page.taskStatus ?? "sin_empezar",
            categories: page.categories,
            source: "notion_sync",
          })
          .select("*")
          .single<Item>();

        if (error || !item) {
          errors.push(`Notion "${page.title}": ${error?.message ?? "no se pudo guardar"}`);
          continue;
        }

        try {
          const googleToken = await getValidGoogleAccessToken(userId);
          const googleEventId = await createCalendarEvent(googleToken, {
            title: item.title,
            description: item.description ?? undefined,
            start: item.start_time!,
            end: item.end_time ?? item.start_time!,
            allDay: item.all_day,
            timeZone: profile?.timezone ?? "America/Mexico_City",
          });
          await supabase
            .from("items")
            .update({ google_event_id: googleEventId, status: "confirmed" })
            .eq("id", item.id);
        } catch (err) {
          errors.push(`Google Calendar (espejo de "${page.title}"): ${err instanceof Error ? err.message : "error"}`);
          await supabase.from("items").update({ status: "failed" }).eq("id", item.id);
        }

        byDuplicateKey.set(duplicateKey(item.title, item.start_time) ?? "", item);
        importedFromNotion += 1;
      }
    }
  } catch (err) {
    errors.push(`Notion: ${err instanceof Error ? err.message : "no se pudo sincronizar"}`);
  }

  let mergedDuplicates = 0;
  try {
    mergedDuplicates = await mergeDuplicateItems(userId);
  } catch (err) {
    errors.push(`Unir duplicados: ${err instanceof Error ? err.message : "error"}`);
  }

  return { importedFromGoogle, importedFromNotion, mergedDuplicates, errors };
}

/**
 * Busca tareas con el mismo título y la misma fecha/hora de inicio y las
 * junta en una sola: conserva la que tenga más información llena (o la más
 * antigua si hay un empate) y le copia los datos que le faltaban de las
 * demás. Borra las filas sobrantes y limpia su evento de Google / página de
 * Notion si eran distintos a los que se quedó la tarea conservada (para que
 * no se vuelvan a importar como "nuevos" en la próxima sincronización).
 */
async function mergeDuplicateItems(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data: itemsRaw } = await supabase.from("items").select("*").eq("user_id", userId);
  const items = (itemsRaw ?? []) as Item[];
  if (items.length < 2) return 0;

  const groups = new Map<string, Item[]>();
  for (const item of items) {
    // Las rutinas se agrupan por título + días, no por start_time exacto
    // (ver routineDuplicateKey); el resto sigue agrupándose por título + hora.
    const key = routineDuplicateKey(item) ?? duplicateKey(item.title, item.start_time);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const richness = (i: Item) =>
    [
      i.description,
      i.priority,
      i.effort,
      i.categories?.length ? "x" : null,
      i.location,
      i.due_date,
      i.outfit_suggestion,
    ].filter(Boolean).length;

  let mergedCount = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => richness(b) - richness(a) || a.created_at.localeCompare(b.created_at));
    const [keeper, ...rest] = sorted;

    const patch: Record<string, unknown> = {};
    for (const other of rest) {
      if (!keeper.description && other.description) patch.description = other.description;
      if (!keeper.priority && other.priority) patch.priority = other.priority;
      if (!keeper.effort && other.effort) patch.effort = other.effort;
      if ((keeper.categories ?? []).length === 0 && (other.categories ?? []).length > 0) {
        patch.categories = other.categories;
      }
      if (!keeper.location && other.location) patch.location = other.location;
      if (!keeper.due_date && other.due_date) patch.due_date = other.due_date;
      if (!keeper.outfit_suggestion && other.outfit_suggestion) patch.outfit_suggestion = other.outfit_suggestion;
      if (!keeper.google_event_id && other.google_event_id) patch.google_event_id = other.google_event_id;
      if (!keeper.notion_page_id && other.notion_page_id) {
        patch.notion_page_id = other.notion_page_id;
        patch.notion_url = other.notion_url;
      }
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("items").update(patch).eq("id", keeper.id);
    }

    const finalGoogleId = (patch.google_event_id as string | undefined) ?? keeper.google_event_id;
    const finalNotionId = (patch.notion_page_id as string | undefined) ?? keeper.notion_page_id;

    for (const other of rest) {
      if (other.google_event_id && other.google_event_id !== finalGoogleId) {
        try {
          const token = await getValidGoogleAccessToken(userId);
          await deleteCalendarEvent(token, other.google_event_id);
        } catch {
          // si no se puede borrar, lo dejamos huérfano antes que detener la unión
        }
      }
      if (other.notion_page_id && other.notion_page_id !== finalNotionId) {
        try {
          const token = await getNotionAccessToken(userId);
          await archiveItemNotionPage(token, other.notion_page_id);
        } catch {
          // idem
        }
      }
      await supabase.from("items").delete().eq("id", other.id);
      mergedCount += 1;
    }
  }

  return mergedCount;
}
