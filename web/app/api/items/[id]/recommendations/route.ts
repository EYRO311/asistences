import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRecommendations } from "@/lib/gemini";
import { geocodeLocation, getDailyWeather } from "@/lib/weather";
import { estimateTravel } from "@/lib/travel";
import type { CachedRecommendation, Item, Profile } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Genera recomendaciones (vestimenta + clima + ubicación + cómo llegar) para
 * una tarea. Se cachea en `items.cached_recommendation` para no volver a
 * llamar a Gemini/clima/rutas cada vez que se abre el modal — solo se
 * recalcula si la tarea se edita (lo invalida el PATCH) o si no hay cache.
 */
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .single<Item>();

  if (itemError || !item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  if (item.cached_recommendation && !forceRefresh) {
    return NextResponse.json(item.cached_recommendation);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("location, preferred_transport, extra_buffer_minutes")
    .eq("id", user.id)
    .single<Pick<Profile, "location" | "preferred_transport" | "extra_buffer_minutes">>();

  const originText = profile?.location || null;
  const destinationText = item.location || originText;
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

  // Solo calcula trayecto si la tarea tiene una ubicación propia distinta a
  // la del usuario (si no, ya está "ahí", no hay traslado que sugerir).
  const hasDistinctDestination = Boolean(item.location && originText && item.location.trim() !== originText.trim());

  if (hasDistinctDestination && destination && originText) {
    const origin = await geocodeLocation(originText);
    if (origin && (origin.latitude !== destination.latitude || origin.longitude !== destination.longitude)) {
      const raw = await estimateTravel(origin, destination).catch(() => null);
      if (raw && extraBuffer > 0) {
        // Suma el buffer personal del usuario a cada modo de transporte.
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

  const recommendation = await getRecommendations({
    title: item.title,
    description: item.description,
    locationName: destination?.name ?? destinationText,
    originName: originText,
    weather,
    travel,
    preferredTransport: effectiveTransport,
  });

  const result: CachedRecommendation = {
    recommendation,
    outfit_suggestion: item.outfit_suggestion,
    location: destination?.name ?? destinationText,
    weather,
    travel,
    preferredTransport: effectiveTransport ?? null,
  };

  const service = createServiceRoleClient();
  await service.from("items").update({ cached_recommendation: result }).eq("id", id);

  return NextResponse.json(result);
}
