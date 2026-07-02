import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { deleteItem, SagaError } from "@/lib/saga/createItem";
import { getValidGoogleAccessToken, updateCalendarEvent } from "@/lib/google";
import { getNotionAccessToken, updateItemNotionPage } from "@/lib/notion";
import { suggestOutfitForNotion } from "@/lib/gemini";
import { resolveLocationAndWeather } from "@/lib/weather";
import type { Item, Profile } from "@/lib/types";

const updateItemSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  all_day: z.boolean().optional(),
  due_date: z.string().datetime().optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  effort: z.enum(["pequeno", "media", "grande"]).optional(),
  task_status: z.enum(["sin_empezar", "en_curso", "listo"]).optional(),
  categories: z.array(z.enum(["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro"])).optional(),
  location: z.string().optional(),
  recurrence_days: z.array(z.number().int().min(1).max(7)).optional(),
  recurrence_start_time: z.string().optional(),
  recurrence_end_time: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Actualiza un item. Si el item ya tiene evento de Google o página de
 * Notion asociados, también se actualizan para mantenerlos sincronizados.
 *
 * NOTA: a diferencia de la creación, esta operación no implementa rollback
 * completo (saga) — si la actualización en Supabase tiene éxito pero la
 * sincronización con Google/Notion falla, el item queda marcado como
 * 'failed' para revisión manual.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceRoleClient();

  const { data: existing, error: fetchError } = await service
    .from("items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<Item>();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  // Solo invalida la caché si cambiaron campos que afectan las recomendaciones
  // (título, descripción, ubicación, fecha). Cambios en prioridad/estado/etc.
  // no requieren volver a quemar tokens de Gemini ni recalcular clima/rutas.
  const RECOMMENDATION_FIELDS = ["title", "description", "location", "start_time"] as const;
  const affectsRecommendations = RECOMMENDATION_FIELDS.some(
    (f) => f in parsed.data && parsed.data[f as keyof typeof parsed.data] !== existing[f]
  );

  const { data: updated, error: updateError } = await service
    .from("items")
    .update({ ...parsed.data, ...(affectsRecommendations ? { cached_recommendation: null } : {}) })
    .eq("id", id)
    .select("*")
    .single<Item>();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "No se pudo actualizar" }, { status: 500 });
  }

  // Si a la tarea le falta la vestimenta sugerida (p. ej. se importó por
  // sincronización, o falló al crearla), la generamos ahora al guardar con clima.
  let outfitSuggestion = updated.outfit_suggestion;
  if (!outfitSuggestion) {
    const { data: profileForOutfit } = await service
      .from("profiles")
      .select("location, full_name, age, gender")
      .eq("id", user.id)
      .single<Pick<Profile, "location" | "full_name" | "age" | "gender">>();
    const { location: resolvedLoc, weather: outfitWeather } = await resolveLocationAndWeather(
      updated.location ?? profileForOutfit?.location ?? null,
      updated.start_time
    ).catch(() => ({ location: updated.location ?? null, weather: null }));
    outfitSuggestion = await suggestOutfitForNotion(
      updated.title, updated.description, resolvedLoc, outfitWeather,
      profileForOutfit ? { name: profileForOutfit.full_name, age: profileForOutfit.age, gender: profileForOutfit.gender } : null
    ).catch(() => null);
    if (outfitSuggestion) {
      await service.from("items").update({ outfit_suggestion: outfitSuggestion }).eq("id", id);
      updated.outfit_suggestion = outfitSuggestion;
    }
  }

  let syncStatus: Item["status"] = "confirmed";

  try {
    if (updated.google_event_id) {
      const { data: profile } = await service
        .from("profiles")
        .select("timezone")
        .eq("id", user.id)
        .single<Pick<Profile, "timezone">>();

      const accessToken = await getValidGoogleAccessToken(user.id);
      await updateCalendarEvent(accessToken, updated.google_event_id, {
        title: updated.title,
        description: updated.description ?? undefined,
        start: updated.start_time!,
        end: updated.end_time!,
        allDay: updated.all_day,
        timeZone: profile?.timezone ?? "America/Mexico_City",
        recurrenceDays: updated.recurrence_days,
      });
    }

    if (updated.notion_page_id) {
      const { data: profile } = await service
        .from("profiles")
        .select("notion_database_id, location")
        .eq("id", user.id)
        .single<Pick<Profile, "notion_database_id" | "location">>();

      if (profile?.notion_database_id) {
        // La columna "vestimenta" de Notion sí valida contra clima/ubicación;
        // la sugerencia simple (sin clima) solo se usa dentro de la app.
        const { location: resolvedLocation, weather } = await resolveLocationAndWeather(
          updated.location ?? profile.location ?? null,
          updated.start_time
        ).catch(() => ({ location: updated.location ?? profile.location ?? null, weather: null }));

        const notionOutfitSuggestion =
          (await suggestOutfitForNotion(updated.title, updated.description, resolvedLocation, weather).catch(
            () => null
          )) ?? outfitSuggestion;

        const notionToken = await getNotionAccessToken(user.id);
        await updateItemNotionPage(notionToken, updated.notion_page_id, profile.notion_database_id, updated, {
          outfitSuggestion: notionOutfitSuggestion,
        });
      }
    }
  } catch {
    syncStatus = "failed";
  }

  if (syncStatus !== updated.status) {
    await service.from("items").update({ status: syncStatus }).eq("id", id);
  }

  return NextResponse.json({ item: { ...updated, status: syncStatus } });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    await deleteItem(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SagaError) {
      return NextResponse.json({ error: err.message, step: err.step }, { status: 422 });
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
