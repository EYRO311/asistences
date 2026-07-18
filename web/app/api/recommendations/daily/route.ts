import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getDailyRecommendation, type DailyLeg } from "@/lib/gemini";
import { geocodeLocation, getDailyWeather, type GeocodedLocation } from "@/lib/weather";
import { estimateTravel } from "@/lib/travel";
import { toLocalDateStr } from "@/lib/freeSlots";
import { getTodayItems } from "@/lib/todayItems";
import { decrypt } from "@/lib/crypto";
import type { Item, Profile } from "@/lib/types";

interface TimedTodayItem {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
}

/**
 * Construye los traslados entre actividades del día (y desde tu ubicación a
 * la primera), con el tiempo libre disponible y la distancia/tiempo estimado
 * cuando las ubicaciones cambian, para que el modelo pueda avisar si el hueco
 * entre una actividad y otra no alcanza para llegar.
 */
async function buildDailyLegs(
  timedItems: TimedTodayItem[],
  originLocation: string | null
): Promise<DailyLeg[]> {
  const legs: DailyLeg[] = [];
  const geocodeCache = new Map<string, GeocodedLocation | null>();

  async function resolve(location: string | null): Promise<GeocodedLocation | null> {
    if (!location) return null;
    const key = location.trim().toLowerCase();
    if (!geocodeCache.has(key)) {
      geocodeCache.set(key, await geocodeLocation(location).catch(() => null));
    }
    return geocodeCache.get(key) ?? null;
  }

  let prevLabel = "Tu ubicación";
  let prevLocation = originLocation;
  let prevEnd: Date | null = null;

  for (const item of timedItems) {
    const gapMinutes = prevEnd ? Math.round((item.start.getTime() - prevEnd.getTime()) / 60_000) : null;
    const sameLocation = Boolean(
      prevLocation && item.location && prevLocation.trim().toLowerCase() === item.location.trim().toLowerCase()
    );

    let leg: DailyLeg | null = null;
    if (prevLocation && item.location && !sameLocation) {
      const [from, to] = await Promise.all([resolve(prevLocation), resolve(item.location)]);
      if (from && to) {
        const travel = await estimateTravel(from, to).catch(() => null);
        if (travel) {
          leg = {
            fromLabel: prevLabel,
            toLabel: item.title,
            gapMinutes,
            distanceKm: travel.distanceKm,
            car: travel.car,
            bike: travel.bike,
            publicTransport: travel.publicTransport,
          };
        }
      }
    } else if (gapMinutes !== null) {
      // Misma ubicación (o falta en alguna) — igual reporta el tiempo libre,
      // sin datos de traslado.
      leg = { fromLabel: prevLabel, toLabel: item.title, gapMinutes };
    }
    if (leg) legs.push(leg);

    prevLabel = item.title;
    // Si el evento no tiene ubicación registrada, se asume que sigues donde estabas.
    prevLocation = item.location ?? prevLocation;
    prevEnd = item.end;
  }

  return legs;
}

const VALID_TRANSPORTS = ["car", "bike", "public_transport", "walking"] as const;
type ValidTransport = (typeof VALID_TRANSPORTS)[number];

async function authenticate(request: NextRequest): Promise<string | null> {
  const service = createServiceRoleClient();
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await service.auth.getUser(authHeader.slice(7));
    return data.user?.id ?? null;
  }
  const cookieSupabase = await createClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return user?.id ?? null;
}

// GET: recomendación del día ya generada (si existe), sin disparar preguntas.
export async function GET(request: NextRequest) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single<Pick<Profile, "timezone">>();

  const todayStr = toLocalDateStr(new Date(), profile?.timezone ?? "America/Mexico_City");

  const { data } = await service
    .from("daily_recommendations")
    .select("full_text, generated_at")
    .eq("user_id", userId)
    .eq("date", todayStr)
    .single();

  return NextResponse.json({
    recommendation: data?.full_text ?? null,
    generatedAt: data?.generated_at ?? null,
  });
}

const postSchema = z.object({
  sameOutfitForAll: z.boolean().optional(),
  transport: z.enum(VALID_TRANSPORTS).optional(),
  outfitIdea: z.string().optional(),
});

// POST /api/recommendations/daily — "Recomendación automática": genera una
// sola recomendación para todas las tareas del día a partir de preguntas
// puntuales (no se le pide a Gemini que las adivine, para gastar menos tokens).
export async function POST(request: NextRequest) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceRoleClient();

  const { data: profile } = await service
    .from("profiles")
    .select("location, timezone, preferred_transport, full_name, age, gender")
    .eq("id", userId)
    .single<Pick<Profile, "location" | "timezone" | "preferred_transport" | "full_name" | "age" | "gender">>();

  const timezone = profile?.timezone ?? "America/Mexico_City";
  const todayStr = toLocalDateStr(new Date(), timezone);

  // Trae todos los items activos y filtra "hoy" en la app (no en SQL): las
  // rutinas recurrentes guardan su start_time fijo en la última ocurrencia
  // calculada, así que un simple rango de fechas nunca las encuentra — hay
  // que usar la misma lógica que ya usa Inicio para resolverlas.
  const { data: allItemsRaw } = await service
    .from("items")
    .select("title, description, location, categories, start_time, end_time, all_day, recurrence_days, recurrence_start_time, recurrence_end_time")
    .eq("user_id", userId)
    .neq("status", "cancelled");

  const todayItems = getTodayItems((allItemsRaw ?? []) as Item[], timezone);

  if (todayItems.length === 0) {
    return NextResponse.json({ error: "No tienes tareas hoy" }, { status: 422 });
  }

  // Traslados entre actividades con hora (para huecos y estimación de tiempos);
  // los de todo el día no aplican para esto.
  const timedTodayItems: TimedTodayItem[] = todayItems
    .filter((i): i is Item & { start_time: string } => !i.all_day && Boolean(i.start_time))
    .map((i) => ({
      title: i.title,
      start: new Date(i.start_time),
      end: i.end_time ? new Date(i.end_time) : new Date(new Date(i.start_time).getTime() + 60 * 60 * 1000),
      location: decrypt(i.location),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const legs = await buildDailyLegs(timedTodayItems, profile?.location ?? null);

  const effectiveTransport: ValidTransport | null = parsed.data.transport ?? profile?.preferred_transport ?? null;

  const { location: resolvedLocation, weather } = profile?.location
    ? await geocodeLocation(profile.location)
        .then(async (geo) =>
          geo ? { location: geo.name, weather: await getDailyWeather(geo.latitude, geo.longitude, todayStr) } : { location: profile.location, weather: null }
        )
        .catch(() => ({ location: profile.location, weather: null }))
    : { location: null, weather: null };

  const fullText = await getDailyRecommendation({
    items: todayItems.map((i) => ({
      title: i.title,
      categories: i.categories ?? [],
      description: decrypt(i.description),
    })),
    legs,
    locationName: resolvedLocation,
    weather,
    preferredTransport: effectiveTransport,
    sameOutfitForAll: todayItems.length > 1 ? parsed.data.sameOutfitForAll ?? null : null,
    outfitIdea: parsed.data.outfitIdea?.trim() || null,
    userProfile: profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null,
  });

  if (!fullText) {
    return NextResponse.json({ error: "No se pudo generar la recomendación" }, { status: 502 });
  }

  const { error: upsertError } = await service.from("daily_recommendations").upsert(
    {
      user_id: userId,
      date: todayStr,
      full_text: fullText,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  );
  if (upsertError) {
    console.error("daily_recommendations upsert failed:", upsertError.message);
  }

  return NextResponse.json({ recommendation: fullText, generatedAt: new Date().toISOString() });
}
