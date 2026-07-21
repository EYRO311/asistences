import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getValidGoogleAccessToken,
} from "@/lib/google";
import { archiveItemNotionPage, getNotionAccessToken } from "@/lib/notion";
import { createNotionPageForItem } from "@/lib/notionSync";
import { suggestOutfitForNotion, getRecommendations } from "@/lib/gemini";
import { resolveLocationAndWeather, geocodeLocation, getDailyWeather } from "@/lib/weather";
import { estimateTravel } from "@/lib/travel";
import { decrypt } from "@/lib/crypto";
import { isPastDay } from "@/lib/todayItems";
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
  // description y location se guardan encriptados; el resto en claro
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

  // Valores desencriptados para uso en servicios externos (Calendar, Notion, Gemini)
  const plainDescription = decrypt(item.description);
  const plainLocation = decrypt(item.location);

  let googleEventId: string | null = null;
  let notionPageId: string | null = null;
  let notionUrl: string | null = null;
  let outfitSuggestion: string | null = null;

  try {
    // --- Paso 2: crear evento en Google Calendar (si aplica y si está conectado) ---
    if (shouldUseCalendar) {
      try {
        const { data: calProfile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .single<Pick<Profile, "timezone">>();

        const accessToken = await getValidGoogleAccessToken(userId);

        googleEventId = await createCalendarEvent(accessToken, {
          title: item.title,
          description: plainDescription ?? undefined,
          start: item.start_time!,
          end: item.end_time!,
          allDay: item.all_day,
          timeZone: calProfile?.timezone ?? "America/Mexico_City",
          recurrenceDays: item.recurrence_days,
        });

        await supabase
          .from("items")
          .update({ google_event_id: googleEventId, status: "syncing" })
          .eq("id", item.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Si no tiene Google conectado lo saltamos; cualquier otro error sí falla
        if (!msg.includes("no tiene conectada")) throw err;
      }
    }

    // --- Paso 3: crear página en Notion (si está configurado y conectado) ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("notion_database_id, location, full_name, age, gender, preferred_transport, extra_buffer_minutes, timezone")
      .eq("id", userId)
      .single<Pick<Profile, "notion_database_id" | "location" | "full_name" | "age" | "gender" | "preferred_transport" | "extra_buffer_minutes" | "timezone">>();

    // Tareas con fecha ya pasada (importadas o registradas después de que
    // ocurrieron): el pronóstico del clima ya no aplica, así que no se genera
    // outfit ni recomendación para ellas.
    const isPastItemDay = item.start_time
      ? isPastDay(item.start_time, profile?.timezone ?? "America/Mexico_City")
      : false;

    // Resuelve ubicación y clima una vez — se reutiliza en Notion y en la recomendación
    const originText = profile?.location ?? null;
    const destinationText = plainLocation ?? originText;
    const { location: resolvedLocation, weather } = isPastItemDay
      ? { location: destinationText, weather: null }
      : await resolveLocationAndWeather(destinationText, item.start_time).catch(() => ({
          location: destinationText,
          weather: null,
        }));

    if (profile?.notion_database_id) {
      try {
        const userProfile = { name: profile.full_name, age: profile.age, gender: profile.gender };

        outfitSuggestion = isPastItemDay
          ? null
          : await suggestOutfitForNotion(
              item.title, plainDescription, resolvedLocation, weather, userProfile
            ).catch(() => null);

        const notionToken = await getNotionAccessToken(userId);
        // createNotionPageForItem desencripta description/location
        // internamente — se pasa el item tal cual, sin resolverlo a mano.
        const result = await createNotionPageForItem(
          notionToken,
          profile.notion_database_id,
          item,
          { outfitSuggestion }
        );
        notionPageId = result.pageId;
        notionUrl = result.url;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("no tiene conectada")) throw err;
      }
    } else if (destinationText && !isPastItemDay) {
      // Sin Notion: igualmente genera el outfit para mostrarlo en la app
      outfitSuggestion = await suggestOutfitForNotion(
        item.title, plainDescription, resolvedLocation, weather,
        profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null
      ).catch(() => null);
    }

    // --- Paso 4: confirmar ---
    const { data: confirmedItem, error: confirmError } = await supabase
      .from("items")
      .update({
        notion_page_id: notionPageId,
        notion_url: notionUrl,
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

    // --- Paso 5: generar recomendación completa y guardarla (best-effort, no revierte) ---
    // Se omite para tareas con fecha ya pasada — no aplica pronóstico ni tiene
    // sentido sugerir qué llevar para un día que ya ocurrió.
    if (!isPastItemDay) {
      generateAndSaveRecommendation(supabase, confirmedItem.id, {
        title: confirmedItem.title,
        description: plainDescription,
        originText,
        destinationText,
        resolvedLocation,
        weather,
        startTime: confirmedItem.start_time,
        outfitBrief: outfitSuggestion,
        preferredTransport: profile?.preferred_transport ?? null,
        extraBuffer: profile?.extra_buffer_minutes ?? 0,
        userProfile: profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null,
      }).catch(() => null);
    }

    return confirmedItem;
  } catch (err) {
    // --- Compensación: revertir todo lo creado hasta el momento ---
    await compensate(userId, item.id, googleEventId);

    if (err instanceof SagaError) throw err;
    throw new SagaError("unknown", err instanceof Error ? err.message : "Error desconocido en la saga");
  }
}

// Genera la recomendación completa (clima + traslado + IA) y la guarda en la
// tabla recommendations. Se llama fire-and-forget después de confirmar el item;
// si falla no afecta la creación del item.
async function generateAndSaveRecommendation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  itemId: string,
  ctx: {
    title: string;
    description: string | null;
    originText: string | null;
    destinationText: string | null;
    resolvedLocation: string | null;
    weather: Awaited<ReturnType<typeof getDailyWeather>> | null;
    startTime: string | null;
    outfitBrief: string | null;
    preferredTransport: string | null;
    extraBuffer: number;
    userProfile: import("@/lib/gemini").UserProfile | null;
  }
): Promise<void> {
  let travel = null;

  const hasDistinctDestination = Boolean(
    ctx.destinationText && ctx.originText && ctx.destinationText.trim() !== ctx.originText.trim()
  );

  if (hasDistinctDestination && ctx.destinationText && ctx.originText) {
    const [dest, orig] = await Promise.all([
      geocodeLocation(ctx.destinationText),
      geocodeLocation(ctx.originText),
    ]);
    if (dest && orig) {
      const raw = await estimateTravel(orig, dest).catch(() => null);
      if (raw && ctx.extraBuffer > 0) {
        travel = {
          distanceKm: raw.distanceKm,
          car: { minutes: raw.car.minutes, leaveMinutesBefore: raw.car.leaveMinutesBefore + ctx.extraBuffer },
          bike: { minutes: raw.bike.minutes, leaveMinutesBefore: raw.bike.leaveMinutesBefore + ctx.extraBuffer },
          publicTransport: {
            minutes: raw.publicTransport.minutes,
            leaveMinutesBefore: raw.publicTransport.leaveMinutesBefore + ctx.extraBuffer,
          },
        };
      } else {
        travel = raw;
      }
    }
  }

  const fullText = await getRecommendations({
    title: ctx.title,
    description: ctx.description,
    locationName: ctx.resolvedLocation,
    originName: ctx.originText,
    weather: ctx.weather,
    travel,
    preferredTransport: ctx.preferredTransport as Parameters<typeof getRecommendations>[0]["preferredTransport"],
    userProfile: ctx.userProfile,
  });

  if (!fullText) return;

  await supabase.from("recommendations").upsert(
    {
      item_id: itemId,
      outfit_brief: ctx.outfitBrief,
      full_text: fullText,
      location_name: ctx.resolvedLocation,
      weather: ctx.weather,
      travel,
      preferred_transport: ctx.preferredTransport,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "item_id" }
  );
}

/**
 * Fase 1 del plan de implementación: mobile crea items directo en Supabase
 * (offline-first, ver mobile/src/lib/sync.ts) sin pasar por createItem() —
 * antes eso significaba que NUNCA se creaba el evento de Google Calendar ni
 * la página de Notion para nada creado desde mobile, y el item se marcaba
 * "confirmed" de todas formas (supuesto implícito, no había ningún aviso).
 *
 * Esta función corre los mismos pasos 2-4 del saga (Google Calendar, Notion,
 * confirmar, recomendación) mobile lea PARA UN ITEM QUE YA EXISTE — a
 * diferencia de createItem(), si Google/Notion fallan NO se revierte nada
 * (el usuario ya ve el item en su app; borrarlo sería más confuso que
 * dejarlo en 'failed' para poder reintentar). Es idempotente: si el item ya
 * tiene google_event_id/notion_page_id, no los vuelve a crear.
 */
export async function syncItemExternal(userId: string, itemId: string): Promise<Item> {
  const supabase = createServiceRoleClient();

  const { data: item, error: fetchError } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single<Item>();

  if (fetchError || !item) {
    throw new SagaError("supabase_lookup", "Item no encontrado");
  }

  const plainDescription = decrypt(item.description);
  const plainLocation = decrypt(item.location);

  let googleEventId: string | null = item.google_event_id;
  let notionPageId: string | null = item.notion_page_id;
  let notionUrl: string | null = item.notion_url;
  let outfitSuggestion: string | null = item.outfit_suggestion;
  let hadFailure = false;

  if (item.add_to_calendar && !googleEventId && item.start_time && item.end_time) {
    try {
      const { data: calProfile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .single<Pick<Profile, "timezone">>();

      const accessToken = await getValidGoogleAccessToken(userId);
      googleEventId = await createCalendarEvent(accessToken, {
        title: item.title,
        description: plainDescription ?? undefined,
        start: item.start_time,
        end: item.end_time,
        allDay: item.all_day,
        timeZone: calProfile?.timezone ?? "America/Mexico_City",
        recurrenceDays: item.recurrence_days,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("no tiene conectada")) hadFailure = true;
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("notion_database_id, location, full_name, age, gender, preferred_transport, extra_buffer_minutes, timezone")
    .eq("id", userId)
    .single<Pick<Profile, "notion_database_id" | "location" | "full_name" | "age" | "gender" | "preferred_transport" | "extra_buffer_minutes" | "timezone">>();

  const isPastItemDay = item.start_time
    ? isPastDay(item.start_time, profile?.timezone ?? "America/Mexico_City")
    : false;

  const originText = profile?.location ?? null;
  const destinationText = plainLocation ?? originText;
  const { location: resolvedLocation, weather } = isPastItemDay
    ? { location: destinationText, weather: null }
    : await resolveLocationAndWeather(destinationText, item.start_time).catch(() => ({
        location: destinationText,
        weather: null,
      }));

  if (profile?.notion_database_id && !notionPageId) {
    try {
      const userProfile = { name: profile.full_name, age: profile.age, gender: profile.gender };

      if (!outfitSuggestion && !isPastItemDay) {
        outfitSuggestion = await suggestOutfitForNotion(
          item.title, plainDescription, resolvedLocation, weather, userProfile
        ).catch(() => null);
      }

      const notionToken = await getNotionAccessToken(userId);
      // createNotionPageForItem desencripta description/location
      // internamente — se pasa el item tal cual, sin resolverlo a mano.
      const result = await createNotionPageForItem(
        notionToken,
        profile.notion_database_id,
        item,
        { outfitSuggestion }
      );
      notionPageId = result.pageId;
      notionUrl = result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("no tiene conectada")) hadFailure = true;
    }
  } else if (!profile?.notion_database_id && destinationText && !outfitSuggestion && !isPastItemDay) {
    outfitSuggestion = await suggestOutfitForNotion(
      item.title, plainDescription, resolvedLocation, weather,
      profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null
    ).catch(() => null);
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from("items")
    .update({
      google_event_id: googleEventId,
      notion_page_id: notionPageId,
      notion_url: notionUrl,
      outfit_suggestion: outfitSuggestion,
      status: hadFailure ? "failed" : "confirmed",
    })
    .eq("id", itemId)
    .select("*")
    .single<Item>();

  if (updateError || !updatedItem) {
    throw new SagaError("supabase_confirm", updateError?.message ?? "No se pudo confirmar el item");
  }

  if (!isPastItemDay) {
    generateAndSaveRecommendation(supabase, updatedItem.id, {
      title: updatedItem.title,
      description: plainDescription,
      originText,
      destinationText,
      resolvedLocation,
      weather,
      startTime: updatedItem.start_time,
      outfitBrief: outfitSuggestion,
      preferredTransport: profile?.preferred_transport ?? null,
      extraBuffer: profile?.extra_buffer_minutes ?? 0,
      userProfile: profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null,
    }).catch(() => null);
  }

  return updatedItem;
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
