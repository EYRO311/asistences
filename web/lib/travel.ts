// OSRM (router.project-osrm.org): rutas de auto/bici gratis, sin API key.
// No hay API gratuita confiable de transporte público sin key; se estima
// a partir del tiempo en auto + margen de espera/transbordos.

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface TravelModeEstimate {
  minutes: number;
  leaveMinutesBefore: number;
}

export interface RideshareEstimate {
  minutes: number;
  leaveMinutesBefore: number;
  /** Rango de costo estimado en MXN [mín, máx] — orientativo, varía por ciudad y hora. */
  costRangeMXN: [number, number];
}

export interface TravelEstimate {
  distanceKm: number;
  car: TravelModeEstimate;
  bike: TravelModeEstimate;
  publicTransport: TravelModeEstimate;
  rideshare?: RideshareEstimate;
}

const CAR_BUFFER_MIN = 10; // estacionarse, bajar, etc.
const BIKE_BUFFER_MIN = 5;
const PUBLIC_TRANSPORT_BUFFER_MIN = 10; // espera/transbordos
const RIDESHARE_PICKUP_MIN = 5; // espera del conductor

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function osrmDurationMinutes(
  profile: "driving" | "cycling",
  origin: Coordinates,
  destination: Coordinates
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const seconds = data?.routes?.[0]?.duration;
    return typeof seconds === "number" ? Math.round(seconds / 60) : null;
  } catch (err) {
    console.error(`OSRM (${profile}) falló:`, err);
    return null;
  }
}

/**
 * Estima distancia y tiempo de viaje (auto, bici, transporte público) entre
 * dos puntos. Es "best-effort": si OSRM no responde, usa una velocidad
 * promedio como respaldo en vez de fallar.
 */
export async function estimateTravel(origin: Coordinates, destination: Coordinates): Promise<TravelEstimate> {
  const distanceKm = haversineKm(origin, destination);

  const [carMinutesRaw, bikeMinutesRaw] = await Promise.all([
    osrmDurationMinutes("driving", origin, destination),
    osrmDurationMinutes("cycling", origin, destination),
  ]);

  const carMinutes = carMinutesRaw ?? Math.max(Math.round((distanceKm / 30) * 60), 1); // ~30 km/h de respaldo
  const bikeMinutes = bikeMinutesRaw ?? Math.max(Math.round((distanceKm / 15) * 60), 1); // ~15 km/h de respaldo
  const publicTransportMinutes = Math.round(carMinutes * 1.6);

  // Rideshare (Didi/Uber): mismo tiempo de ruta que auto + espera del conductor.
  // Costo estimado en MXN (tarifa base + por km) — solo referencial.
  const rideshareMinutes = carMinutes + RIDESHARE_PICKUP_MIN;
  const costMin = Math.round((22 + 3.5 * distanceKm) / 5) * 5;
  const costMax = Math.round((38 + 5.5 * distanceKm) / 5) * 5;

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    car: { minutes: carMinutes, leaveMinutesBefore: carMinutes + CAR_BUFFER_MIN },
    bike: { minutes: bikeMinutes, leaveMinutesBefore: bikeMinutes + BIKE_BUFFER_MIN },
    publicTransport: {
      minutes: publicTransportMinutes,
      leaveMinutesBefore: publicTransportMinutes + PUBLIC_TRANSPORT_BUFFER_MIN,
    },
    rideshare: {
      minutes: rideshareMinutes,
      leaveMinutesBefore: rideshareMinutes + 5,
      costRangeMXN: [Math.max(costMin, 30), Math.max(costMax, 50)],
    },
  };
}
