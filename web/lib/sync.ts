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

// Mínimo de días de la semana distintos para considerar eventos no-recurrentes como rutina virtual.
const VIRTUAL_ROUTINE_MIN_WEEKDAYS = 2;

export interface SyncResult {
  importedFromGoogle: number;
  importedFromNotion: number;
  mergedDuplicates: number;
  errors: string[];
}

/** Normaliza cualquier ISO datetime a UTC para comparaciones sin importar el offset. */
function normalizeISO(ts: string): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return ts;
  }
}

function duplicateKey(title: string, startTime: string | null): string | null {
  if (!startTime) return null;
  return `${title.trim().toLowerCase()}|${normalizeISO(startTime)}`;
}

/** Extrae "HH:mm" de un ISO datetime como "2026-07-01T09:00:00-06:00". Devuelve null para fechas sin hora. */
function extractHHMM(isoDatetime: string): string | null {
  const match = isoDatetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** Día ISO (1=lun…7=dom) de una cadena de fecha "YYYY-MM-DD". */
function isoWeekdayFromDateStr(dateStr: string): number {
  const jsDay = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Clave de duplicado para tareas con rutina (recurrence_days no vacío): se
 * basa en título + días de la semana, no en start_time exacto, porque cada
 * ocurrencia de la misma rutina puede tener un start_time distinto.
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
 * Reglas para eventos recurrentes de Google Calendar:
 * - Si coincide (por título normalizado + HH:mm) con una rutina o ítem existente → enlazar y omitir.
 * - Si es nuevo → crear UN SOLO ítem con recurrence_days/recurrence_start_time/recurrence_end_time.
 * - Eventos no-recurrentes que aparezcan en 2+ días de la semana distintos con el mismo nombre y
 *   horario → tratarlos igual que una rutina (crear un solo ítem con recurrence_days).
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

  // Rutinas locales: clave = "título_lower|HH:mm" (usando recurrence_start_time).
  const routineByTitleAndTime = new Map<string, Item>();
  for (const item of existingItems) {
    if (item.recurrence_days?.length && item.recurrence_start_time) {
      const key = `${item.title.trim().toLowerCase()}|${item.recurrence_start_time}`;
      routineByTitleAndTime.set(key, item);
    }
  }

  // Ítems google_sync sin recurrence_days que podrían tener ID de instancia antigua.
  const googleSyncByTitleAndTime = new Map<string, Item>();
  for (const item of existingItems) {
    if (item.source === "google_sync" && item.start_time) {
      const hhmm = extractHHMM(item.start_time);
      if (hhmm) {
        const key = `${item.title.trim().toLowerCase()}|${hhmm}`;
        googleSyncByTitleAndTime.set(key, item);
      }
    }
  }

  // Fallback: cualquier ítem con recurrence_days no vacío (para cuando no hay recurrence_start_time).
  const routineByTitle = new Map<string, Item>();
  for (const item of existingItems) {
    if (item.recurrence_days?.length) {
      const key = item.title.trim().toLowerCase();
      if (!routineByTitle.has(key)) routineByTitle.set(key, item);
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
    type CalEvent = (typeof events)[0];

    // Pre-proceso 1: agrupar instancias de eventos recurrentes por ID maestro.
    const timedInstancesByMasterId = new Map<string, CalEvent[]>();
    for (const event of events) {
      if (!event.recurringEventId || event.allDay) continue;
      const list = timedInstancesByMasterId.get(event.recurringEventId) ?? [];
      list.push(event);
      timedInstancesByMasterId.set(event.recurringEventId, list);
    }

    // Pre-proceso 2: agrupar eventos no-recurrentes con hora por "título_lower|HH:mm".
    const nonRecurringByTitleTime = new Map<string, CalEvent[]>();
    for (const event of events) {
      if (event.recurringEventId || event.allDay) continue;
      const hhmm = extractHHMM(event.start);
      if (!hhmm) continue;
      const key = `${event.title.trim().toLowerCase()}|${hhmm}`;
      const list = nonRecurringByTitleTime.get(key) ?? [];
      list.push(event);
      nonRecurringByTitleTime.set(key, list);
    }

    // "Rutinas virtuales": grupos no-recurrentes que aparecen en 2+ días de la semana distintos.
    const virtualRoutineKeys = new Set<string>();
    for (const [key, instances] of nonRecurringByTitleTime.entries()) {
      const weekdays = new Set(instances.map((inst) => isoWeekdayFromDateStr(inst.start.slice(0, 10))));
      if (weekdays.size >= VIRTUAL_ROUTINE_MIN_WEEKDAYS) virtualRoutineKeys.add(key);
    }

    /** Deduce los días ISO (1=lun…7=dom) en que aparece una lista de instancias. */
    function deriveRecurrenceDays(eventList: CalEvent[]): number[] {
      const days = new Set<number>();
      for (const inst of eventList) {
        days.add(isoWeekdayFromDateStr(inst.start.slice(0, 10)));
      }
      return [...days].sort((a, b) => a - b);
    }

    // Sets para evitar procesar la misma serie más de una vez en este sync.
    const importedRecurringIds = new Set<string>();
    const importedVirtualRoutineKeys = new Set<string>();

    // Función compartida: crea el ítem de rutina en Supabase y su espejo en Notion.
    async function createRoutineFromGoogle(params: {
      title: string;
      description: string | null;
      firstStart: string;
      firstEnd: string | null;
      googleEventId: string;
      meetLink: string | null | undefined;
      recurrenceDays: number[];
      recurrenceStartTime: string;
      recurrenceEndTime: string | null;
    }): Promise<void> {
      const { data: item, error } = await supabase
        .from("items")
        .insert({
          user_id: userId,
          type: "evento",
          title: params.title,
          description: params.description,
          start_time: params.firstStart,
          end_time: params.firstEnd,
          all_day: false,
          add_to_calendar: true,
          status: "syncing",
          google_event_id: params.googleEventId,
          meet_link: params.meetLink ?? null,
          source: "google_sync",
          recurrence_days: params.recurrenceDays,
          recurrence_start_time: params.recurrenceStartTime,
          recurrence_end_time: params.recurrenceEndTime,
        })
        .select("*")
        .single<Item>();

      if (error || !item) {
        errors.push(`Google "${params.title}": ${error?.message ?? "no se pudo guardar"}`);
        return;
      }

      // Registrar en los mapas locales para que el resto de este sync los reconozca.
      const titleKey = params.title.trim().toLowerCase();
      routineByTitleAndTime.set(`${titleKey}|${params.recurrenceStartTime}`, item);
      routineByTitle.set(titleKey, item);

      try {
        if (profile?.notion_database_id) {
          const notionToken = await getNotionAccessToken(userId);
          const { pageId, url } = await createItemNotionPage(notionToken, profile.notion_database_id, item);
          await supabase
            .from("items")
            .update({ notion_page_id: pageId, notion_url: url, status: "confirmed" })
            .eq("id", item.id);
          knownNotionIds.add(pageId);
        } else {
          await supabase.from("items").update({ status: "confirmed" }).eq("id", item.id);
        }
      } catch (err) {
        errors.push(`Notion (espejo de "${params.title}"): ${err instanceof Error ? err.message : "error"}`);
        await supabase.from("items").update({ status: "failed" }).eq("id", item.id);
      }

      importedFromGoogle += 1;
    }

    for (const event of events) {
      // Ya conocido por su ID de instancia o por el ID maestro de su serie.
      if (knownGoogleIds.has(event.id)) continue;
      if (event.recurringEventId && knownGoogleIds.has(event.recurringEventId)) continue;

      // ── Evento recurrente (tiene recurringEventId) ──────────────────────
      if (event.recurringEventId) {
        if (importedRecurringIds.has(event.recurringEventId)) continue;

        const masterGoogleId = event.recurringEventId;
        const eventHHMM = event.allDay ? null : extractHHMM(event.start);
        const titleKey = event.title.trim().toLowerCase();
        const titleTimeKey = eventHHMM ? `${titleKey}|${eventHHMM}` : null;

        // Buscar coincidencia en rutinas o ítems existentes (comparación case-insensitive).
        const matchingItem =
          (titleTimeKey
            ? (routineByTitleAndTime.get(titleTimeKey) ?? googleSyncByTitleAndTime.get(titleTimeKey))
            : null) ?? routineByTitle.get(titleKey);

        if (matchingItem) {
          // Ya existe una rutina equivalente: sólo enlazar al ID maestro si hace falta.
          importedRecurringIds.add(masterGoogleId);
          if (matchingItem.google_event_id !== masterGoogleId) {
            await supabase
              .from("items")
              .update({ google_event_id: masterGoogleId })
              .eq("id", matchingItem.id);
            knownGoogleIds.add(masterGoogleId);
          }
          continue;
        }

        // Serie nueva: marcar como importada para ignorar el resto de sus instancias.
        importedRecurringIds.add(masterGoogleId);
        knownGoogleIds.add(masterGoogleId);

        // Evento recurrente con hora → crear como rutina con recurrence_days.
        if (!event.allDay && eventHHMM) {
          const allInstances = timedInstancesByMasterId.get(masterGoogleId) ?? [event];
          const recurrenceDays = deriveRecurrenceDays(allInstances);
          const endHHMM = event.end ? extractHHMM(event.end) : null;

          await createRoutineFromGoogle({
            title: event.title,
            description: event.description,
            firstStart: event.start,
            firstEnd: event.end,
            googleEventId: masterGoogleId,
            meetLink: event.meetLink,
            recurrenceDays,
            recurrenceStartTime: eventHHMM,
            recurrenceEndTime: endHHMM,
          });
          continue;
        }

        // Evento recurrente de día completo: cae al código de evento individual (sin recurrence_days).
        // La serie completa queda representada por esta primera instancia.
      }

      // ── Rutina virtual (no-recurrente, mismo nombre+hora en 2+ días de la semana) ──
      if (!event.recurringEventId && !event.allDay) {
        const hhmm = extractHHMM(event.start);
        if (hhmm) {
          const vKey = `${event.title.trim().toLowerCase()}|${hhmm}`;
          if (virtualRoutineKeys.has(vKey)) {
            if (importedVirtualRoutineKeys.has(vKey)) continue;

            const titleKey = event.title.trim().toLowerCase();
            const matchingItem =
              routineByTitleAndTime.get(`${titleKey}|${hhmm}`) ??
              routineByTitle.get(titleKey);

            if (matchingItem) {
              // Ya existe rutina equivalente; no hace falta crear nada.
              importedVirtualRoutineKeys.add(vKey);
              continue;
            }

            importedVirtualRoutineKeys.add(vKey);
            const instances = nonRecurringByTitleTime.get(vKey) ?? [event];
            const recurrenceDays = deriveRecurrenceDays(instances);
            const endHHMM = event.end ? extractHHMM(event.end) : null;

            await createRoutineFromGoogle({
              title: event.title,
              description: event.description,
              firstStart: event.start,
              firstEnd: event.end,
              googleEventId: event.id,
              meetLink: event.meetLink,
              recurrenceDays,
              recurrenceStartTime: hhmm,
              recurrenceEndTime: endHHMM,
            });
            continue;
          }
        }
      }

      // ── Evento individual normal ────────────────────────────────────────
      // Ya existe una tarea con el mismo título y fecha/hora: no duplicar.
      const existingMatch = byDuplicateKey.get(duplicateKey(event.title, event.start) ?? "");
      if (existingMatch) {
        const patch: Record<string, unknown> = {};
        const googleIdToStore = event.recurringEventId ?? event.id;
        if (!existingMatch.google_event_id) patch.google_event_id = googleIdToStore;
        if (!existingMatch.description && event.description) patch.description = event.description;
        if (event.meetLink && !existingMatch.meet_link) patch.meet_link = event.meetLink;
        if (Object.keys(patch).length > 0) {
          await supabase.from("items").update(patch).eq("id", existingMatch.id);
        }
        if (event.recurringEventId) {
          importedRecurringIds.add(event.recurringEventId);
          knownGoogleIds.add(event.recurringEventId);
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
          meet_link: event.meetLink ?? null,
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
          knownNotionIds.add(pageId);
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
    const msg = err instanceof Error ? err.message : "no se pudo sincronizar";
    if (!msg.includes("no tiene conectada")) {
      errors.push(`Google Calendar: ${msg}`);
    }
  }

  // --- Notion -> app (+ espejo en Google Calendar) ---
  try {
    if (profile?.notion_database_id) {
      const notionToken = await getNotionAccessToken(userId);
      const pages = await listNotionPagesWithEventDate(notionToken, profile.notion_database_id);

      for (const page of pages) {
        if (knownNotionIds.has(page.pageId)) continue;

        const existingMatch =
          byDuplicateKey.get(duplicateKey(page.title, page.startTime) ?? "") ??
          routineByTitle.get(page.title.trim().toLowerCase());
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
          knownGoogleIds.add(googleEventId);
        } catch (err) {
          errors.push(`Google Calendar (espejo de "${page.title}"): ${err instanceof Error ? err.message : "error"}`);
          await supabase.from("items").update({ status: "failed" }).eq("id", item.id);
        }

        byDuplicateKey.set(duplicateKey(item.title, item.start_time) ?? "", item);
        importedFromNotion += 1;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "no se pudo sincronizar";
    if (!msg.includes("no tiene conectada")) {
      errors.push(`Notion: ${msg}`);
    }
  }

  let mergedDuplicates = 0;
  try {
    mergedDuplicates = await mergeDuplicateItems(userId);
  } catch (err) {
    errors.push(`Unir duplicados: ${err instanceof Error ? err.message : "error"}`);
  }

  try {
    mergedDuplicates += await cleanupRoutineOccurrenceDuplicates(userId);
  } catch (err) {
    errors.push(`Limpiar duplicados de rutina: ${err instanceof Error ? err.message : "error"}`);
  }

  return { importedFromGoogle, importedFromNotion, mergedDuplicates, errors };
}

/**
 * Elimina ítems de google_sync que son ocurrencias individuales (por día) de
 * una serie recurrente que ya existe como rutina en la app (con recurrence_days).
 *
 * Criterio: ítem con source="google_sync", sin recurrence_days, cuyo título +
 * HH:mm del start_time coincide con alguna rutina existente (comparación case-insensitive).
 */
async function cleanupRoutineOccurrenceDuplicates(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data: itemsRaw } = await supabase.from("items").select("*").eq("user_id", userId);
  const items = (itemsRaw ?? []) as Item[];

  const routines = items.filter((i) => i.recurrence_days?.length && i.recurrence_start_time);
  if (routines.length === 0) return 0;

  const routineKeys = new Set(
    routines.map((r) => `${r.title.trim().toLowerCase()}|${r.recurrence_start_time}`)
  );

  const toDelete = items.filter((item) => {
    if (item.source !== "google_sync") return false;
    if (item.recurrence_days?.length) return false;
    if (!item.start_time) return false;
    const hhmm = extractHHMM(item.start_time);
    if (!hhmm) return false;
    return routineKeys.has(`${item.title.trim().toLowerCase()}|${hhmm}`);
  });

  if (toDelete.length === 0) return 0;

  let count = 0;
  for (const item of toDelete) {
    if (item.notion_page_id) {
      const matchKey = (() => {
        const hhmm = extractHHMM(item.start_time!);
        return hhmm ? `${item.title.trim().toLowerCase()}|${hhmm}` : null;
      })();
      const routine = matchKey
        ? routines.find((r) => `${r.title.trim().toLowerCase()}|${r.recurrence_start_time}` === matchKey)
        : undefined;
      if (!routine?.notion_page_id || routine.notion_page_id !== item.notion_page_id) {
        try {
          const token = await getNotionAccessToken(userId);
          await archiveItemNotionPage(token, item.notion_page_id);
        } catch {
          // Si falla el archivo de Notion, igual borramos el ítem local
        }
      }
    }
    await supabase.from("items").delete().eq("id", item.id);
    count++;
  }

  return count;
}

/**
 * Busca tareas con el mismo título y la misma fecha/hora de inicio y las
 * junta en una sola, conservando la que tenga más información llena.
 */
async function mergeDuplicateItems(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data: itemsRaw } = await supabase.from("items").select("*").eq("user_id", userId);
  const items = (itemsRaw ?? []) as Item[];
  if (items.length < 2) return 0;

  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key =
      routineDuplicateKey(item) ??
      (item.google_event_id ? `gid|${item.google_event_id}` : null) ??
      duplicateKey(item.title, item.start_time);
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
      i.outfit_suggestion,
    ].filter(Boolean).length;

  let mergedCount = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort(
      (a, b) => richness(b) - richness(a) || a.created_at.localeCompare(b.created_at)
    );
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
