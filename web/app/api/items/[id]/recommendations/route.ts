import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRecommendations } from "@/lib/gemini";
import { geocodeLocation, getDailyWeather } from "@/lib/weather";
import { estimateTravel } from "@/lib/travel";
import { decrypt } from "@/lib/crypto";
import type { Item, Profile, Recommendation } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const VALID_TRANSPORTS = ["car", "bike", "public_transport", "walking"] as const;
  type ValidTransport = (typeof VALID_TRANSPORTS)[number];
  const transportParam = request.nextUrl.searchParams.get("transport");
  const transportOverride: ValidTransport | null =
    transportParam && (VALID_TRANSPORTS as readonly string[]).includes(transportParam)
      ? (transportParam as ValidTransport)
      : null;

  // Auth: cookie session (web) OR Bearer token (mobile)
  const service = createServiceRoleClient();
  let userId: string | undefined;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await service.auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  } else {
    const cookieSupabase = await createClient();
    const { data: { user } } = await cookieSupabase.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: item, error: itemError } = await service
    .from("items")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single<Item>();

  if (itemError || !item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  // Desencripta campos sensibles del item para usarlos en el prompt de Gemini
  const itemLocation = decrypt(item.location);
  const itemDescription = decrypt(item.description);

  // Busca recomendación existente en la nueva tabla
  const { data: existing } = await service
    .from("recommendations")
    .select("*")
    .eq("item_id", id)
    .single<Recommendation>();

  if (existing && !forceRefresh) {
    return NextResponse.json({
      recommendation: existing.full_text,
      outfit_suggestion: existing.outfit_brief,
      location: existing.location_name,
      weather: existing.weather,
      travel: existing.travel,
      preferredTransport: existing.preferred_transport,
    });
  }

  const { data: profile } = await service
    .from("profiles")
    .select("location, preferred_transport, extra_buffer_minutes, full_name, age, gender")
    .eq("id", userId)
    .single<Pick<Profile, "location" | "preferred_transport" | "extra_buffer_minutes" | "full_name" | "age" | "gender">>();

  const originText = profile?.location ?? null;
  const destinationText = itemLocation ?? originText;
  const extraBuffer = profile?.extra_buffer_minutes ?? 0;

  let destination = null;
  let weather = null;
  let travel = null;

  if (destinationText) {
    destination = await geocodeLocation(destinationText);
    if (destination && item.start_time) {
      weather = await getDailyWeather(destination.latitude, destination.longitude, item.start_time);
    }
  }

  const hasDistinctDestination = Boolean(
    itemLocation && originText && itemLocation.trim() !== originText.trim()
  );

  if (hasDistinctDestination && destination && originText) {
    const origin = await geocodeLocation(originText);
    if (origin && (origin.latitude !== destination.latitude || origin.longitude !== destination.longitude)) {
      const raw = await estimateTravel(origin, destination).catch(() => null);
      if (raw && extraBuffer > 0) {
        travel = {
          distanceKm: raw.distanceKm,
          car: { minutes: raw.car.minutes, leaveMinutesBefore: raw.car.leaveMinutesBefore + extraBuffer },
          bike: { minutes: raw.bike.minutes, leaveMinutesBefore: raw.bike.leaveMinutesBefore + extraBuffer },
          publicTransport: {
            minutes: raw.publicTransport.minutes,
            leaveMinutesBefore: raw.publicTransport.leaveMinutesBefore + extraBuffer,
          },
        };
      } else {
        travel = raw;
      }
    }
  }

  const effectiveTransport = transportOverride ?? profile?.preferred_transport ?? undefined;

  const fullText = await getRecommendations({
    title: item.title,
    description: itemDescription,
    locationName: destination?.name ?? destinationText,
    originName: originText,
    weather,
    travel,
    preferredTransport: effectiveTransport,
    userProfile: profile ? { name: profile.full_name, age: profile.age, gender: profile.gender } : null,
  });

  const locationName = destination?.name ?? destinationText;

  // Guarda o actualiza en la tabla recommendations
  await service.from("recommendations").upsert(
    {
      item_id: id,
      outfit_brief: item.outfit_suggestion,
      full_text: fullText,
      location_name: locationName,
      weather,
      travel,
      preferred_transport: effectiveTransport ?? null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "item_id" }
  );

  return NextResponse.json({
    recommendation: fullText,
    outfit_suggestion: item.outfit_suggestion,
    location: locationName,
    weather,
    travel,
    preferredTransport: effectiveTransport ?? null,
  });
}
