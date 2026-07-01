import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getValidGoogleAccessToken,
} from "@/lib/google";
import {
  archiveItemNotionPage,
  createItemNotionPage,
  getNotionAccessToken,
} from "@/lib/notion";
import { suggestOutfit, suggestOutfitForNotion } from "@/lib/gemini";
import { resolveLocationAndWeather } from "@/lib/weather";
import type { CreateItemInput, Item, Profile } from "@/lib/types";

const TYPES_WITH_CALENDAR_BY_DEFAULT = new Set(["compromiso", "evento"]);

export class SagaError extends Error {
  step: string;

  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "SagaError";
  }
}

/**
 * Orquesta la creación de un item siguiendo el patrón Saga:
 *  1. Inserta la fila en Supabase (status = 'draft').
 *  2. Si aplica, crea el evento en Google Calendar.
 *  3. Crea la página de Notion asociada.
 *  4. Marca el item como 'confirmed'.
 *
 * Si un paso falla, se compensan (revierten) los pasos previos en orden
 * inverso y no queda ningún rastro del item.
 */
export async function createItem(userId: string, input: CreateItemInput): Promise<Item> {
  const supabase = createServiceRoleClient();

  const shouldUseCalendar =
    input.add_to_calendar ?? TYPES_WITH_CALENDAR_BY_DEFAULT.has(input.type);

  if (shouldUseCalendar && (!input.start_time || !input.end_time)) {
    throw new SagaError(
      "validation",
      "start_time y end_time son requeridos para crear un evento de calendario"
    );
  }

  // --- Paso 1: insertar en Supabase como 'draft' ---
  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      user_id: userId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      all_day: input.all_day ?? false,
      add_to_calendar: shouldUseCalendar,
      status: "draft",
      due_date: input.due_date ?? null,
      priority: input.priority ?? null,
      effort: input.effort ?? null,
      task_status: input.task_status ?? "sin_empezar",
      categories: input.categories ?? [],
      location: input.location ?? null,
      recurrence_days: input.recurrence_days ?? [],
      recurrence_start_time: input.recurrence_start_time ?? null,
      recurrence_end_time: input.recurrence_end_time ?? null,
    })
    .select("*")
    .single<Item>();

  if (insertError || !item) {
    throw new SagaError("supabase_insert", insertError?.message ?? "No se pudo crear el item");
  }

  let googleEventId: string | null = null;

  try {
    // --- Paso 2: crear evento en Google Calendar (si aplica) ---
    if (shouldUseCalendar) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .single<Pick<Profile, "timezone">>();

      const accessToken = await getValidGoogleAccessToken(userId);

      googleEventId = await createCalendarEvent(accessToken, {
        title: item.title,
        description: item.description ?? undefined,
        start: item.start_time!,
        end: item.end_time!,
        allDay: item.all_day,
        timeZone: profile?.timezone ?? "America/Mexico_City",
        recurrenceDays: item.recurrence_days,
      });

      await supabase
        .from("items")
        .update({ google_event_id: googleEventId, status: "syncing" })
        .eq("id", item.id);
    }

    // --- Paso 3: crear página en Notion ---
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notion_database_id, location")
      .eq("id", userId)
      .single<Pick<Profile, "notion_database_id" | "location">>();

    if (profileError || !profile?.notion_database_id) {
      throw new SagaError(
        "notion_config",
        "El usuario no tiene configurada una base de datos de Notion (profiles.notion_database_id)"
      );
    }

    // Sugerencia simple (sin clima): se guarda en Supabase y es la que se ve dentro de la app.
    const outfitSuggestion = await suggestOutfit(item.title, item.description).catch(() => null);

    // Sugerencia validada contra clima/ubicación: solo se guarda en la columna "vestimenta" de Notion.
    const { location: resolvedLocation, weather } = await resolveLocationAndWeather(
      item.location ?? profile.location ?? null,
      item.start_time
    ).catch(() => ({ location: item.location ?? profile.location ?? null, weather: null }));

    const notionOutfitSuggestion =
      (await suggestOutfitForNotion(item.title, item.description, resolvedLocation, weather).catch(() => null)) ??
      outfitSuggestion;

    const notionToken = await getNotionAccessToken(userId);
    const { pageId, url } = await createItemNotionPage(notionToken, profile.notion_database_id, item, {
      outfitSuggestion: notionOutfitSuggestion,
    });

    // --- Paso 4: confirmar ---
    const { data: confirmedItem, error: confirmError } = await supabase
      .from("items")
      .update({
        notion_page_id: pageId,
        notion_url: url,
        google_event_id: googleEventId,
        outfit_suggestion: outfitSuggestion,
        status: "confirmed",
      })
      .eq("id", item.id)
      .select("*")
      .single<Item>();

    if (confirmError || !confirmedItem) {
      throw new SagaError("supabase_confirm", confirmError?.message ?? "No se pudo confirmar el item");
    }

    return confirmedItem;
  } catch (err) {
    // --- Compensación: revertir todo lo creado hasta el momento ---
    await compensate(userId, item.id, googleEventId);

    if (err instanceof SagaError) throw err;
    throw new SagaError("unknown", err instanceof Error ? err.message : "Error desconocido en la saga");
  }
}

async function compensate(userId: string, itemId: string, googleEventId: string | null) {
  const supabase = createServiceRoleClient();

  if (googleEventId) {
    try {
      const accessToken = await getValidGoogleAccessToken(userId);
      await deleteCalendarEvent(accessToken, googleEventId);
    } catch {
      // Si no se puede revertir el evento de Google, continuamos para al
      // menos limpiar la fila de Supabase; quedará huérfano en Calendar.
    }
  }

  await supabase.from("items").delete().eq("id", itemId);
}

/**
 * Elimina un item revirtiendo primero sus integraciones externas
 * (Notion y Google Calendar) y, al final, la fila en Supabase.
 */
export async function deleteItem(userId: string, itemId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single<Item>();

  if (error || !item) {
    throw new SagaError("supabase_lookup", "Item no encontrado");
  }

  if (item.notion_page_id) {
    const notionToken = await getNotionAccessToken(userId);
    await archiveItemNotionPage(notionToken, item.notion_page_id);
  }

  if (item.google_event_id) {
    const accessToken = await getValidGoogleAccessToken(userId);
    await deleteCalendarEvent(accessToken, item.google_event_id);
  }

  const { error: deleteError } = await supabase.from("items").delete().eq("id", itemId);
  if (deleteError) {
    throw new SagaError("supabase_delete", deleteError.message);
  }
}
