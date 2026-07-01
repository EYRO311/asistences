// Open-Meteo: geocodificación y clima gratuitos, sin necesidad de API key.

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "despejado",
  1: "mayormente despejado",
  2: "parcialmente nublado",
  3: "nublado",
  45: "neblina",
  48: "neblina con escarcha",
  51: "llovizna ligera",
  53: "llovizna moderada",
  55: "llovizna intensa",
  61: "lluvia ligera",
  63: "lluvia moderada",
  65: "lluvia intensa",
  71: "nieve ligera",
  73: "nieve moderada",
  75: "nieve intensa",
  80: "lluvias aisladas",
  81: "lluvias moderadas",
  82: "lluvias intensas",
  95: "tormenta",
  96: "tormenta con granizo",
  99: "tormenta fuerte con granizo",
};

export interface GeocodedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface DailyWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbability: number;
  description: string;
}

/**
 * Convierte un texto de ubicación (ciudad, dirección, "Ciudad, País", etc.)
 * en coordenadas. Usa la palabra más relevante (normalmente la ciudad) si la
 * búsqueda completa no encuentra nada.
 */
export async function geocodeLocation(location: string): Promise<GeocodedLocation | null> {
  const tryQuery = async (query: string): Promise<GeocodedLocation | null> => {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "es");

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;

    return {
      name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
      latitude: result.latitude,
      longitude: result.longitude,
    };
  };

  try {
    const direct = await tryQuery(location);
    if (direct) return direct;

    // Si es una dirección completa, intenta de nuevo solo con el último
    // segmento (suele ser la ciudad/país en direcciones tipo "Calle, Ciudad, País").
    const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return await tryQuery(parts[parts.length - 1]);
    }

    return null;
  } catch (err) {
    console.error("geocodeLocation failed:", err);
    return null;
  }
}

/**
 * Clima diario (máx/mín/probabilidad de lluvia) para una fecha específica.
 * Si la fecha está fuera del rango de pronóstico (~16 días), regresa null.
 */
export async function getDailyWeather(
  latitude: number,
  longitude: number,
  dateISO: string
): Promise<DailyWeather | null> {
  const date = dateISO.slice(0, 10);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    const idx = data?.daily?.time?.indexOf(date);
    if (idx === undefined || idx < 0) return null;

    const code = data.daily.weathercode[idx];

    return {
      date,
      tempMaxC: data.daily.temperature_2m_max[idx],
      tempMinC: data.daily.temperature_2m_min[idx],
      precipitationProbability: data.daily.precipitation_probability_max[idx],
      description: WMO_DESCRIPTIONS[code] ?? "clima variable",
    };
  } catch (err) {
    console.error("getDailyWeather failed:", err);
    return null;
  }
}

export interface LocationWeatherContext {
  location: string | null;
  weather: DailyWeather | null;
}

/**
 * Resuelve nombre de ubicación + clima del día a partir de un texto de
 * ubicación y una fecha. Es "best-effort": si falla geocodificar o no hay
 * pronóstico para esa fecha, regresa lo que sí se pudo resolver sin lanzar.
 */
export async function resolveLocationAndWeather(
  locationText: string | null,
  dateISO: string | null
): Promise<LocationWeatherContext> {
  if (!locationText) return { location: null, weather: null };

  const geocoded = await geocodeLocation(locationText);
  if (!geocoded) return { location: locationText, weather: null };

  const weather = dateISO ? await getDailyWeather(geocoded.latitude, geocoded.longitude, dateISO) : null;
  return { location: geocoded.name, weather };
}
