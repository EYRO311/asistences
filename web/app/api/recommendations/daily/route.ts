import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getDailyRecommendation } from "@/lib/gemini";
import { geocodeLocation, getDailyWeather } from "@/lib/weather";
import { toLocalDateStr, wallToUTC } from "@/lib/freeSlots";
import type { Item, Profile } from "@/lib/types";

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
  const dayStart = wallToUTC(todayStr, "00:00", timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: itemsRaw } = await service
    .from("items")
    .select("title, categories, start_time")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .gte("start_time", dayStart.toISOString())
    .lt("start_time", dayEnd.toISOString());

  const todayItems = (itemsRaw ?? []) as Pick<Item, "title" | "categories" | "start_time">[];

  if (todayItems.length === 0) {
    return NextResponse.json({ error: "No tienes tareas hoy" }, { status: 422 });
  }

  const effectiveTransport: ValidTransport | null = parsed.data.transport ?? profile?.preferred_transport ?? null;

  const { location: resolvedLocation, weather } = profile?.location
    ? await geocodeLocation(profile.location)
        .then(async (geo) =>
          geo ? { location: geo.name, weather: await getDailyWeather(geo.latitude, geo.longitude, todayStr) } : { location: profile.location, weather: null }
        )
        .catch(() => ({ location: profile.location, weather: null }))
    : { location: null, weather: null };

  const fullText = await getDailyRecommendation({
    items: todayItems.map((i) => ({ title: i.title, categories: i.categories ?? [] })),
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

  await service.from("daily_recommendations").upsert(
    {
      user_id: userId,
      date: todayStr,
      full_text: fullText,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  );

  return NextResponse.json({ recommendation: fullText, generatedAt: new Date().toISOString() });
}
