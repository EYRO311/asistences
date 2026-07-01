import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash";

/**
 * Sugiere brevemente qué tipo de vestimenta es apropiada para una tarea,
 * analizando su título y descripción con Gemini. Es un "extra": si falla
 * (sin API key, error de red, etc.) devuelve null y no debe abortar la saga.
 */
export async function suggestOutfit(title: string, description?: string | null): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const prompt = [
    "Sugiere en máximo 12 palabras qué tipo de vestimenta usar para esta tarea/evento.",
    "Responde solo con la sugerencia, sin explicaciones ni comillas.",
    `Título: ${title}`,
    description ? `Descripción: ${description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({ model, input: prompt });
    return interaction.output_text?.trim() || null;
  } catch (err) {
    console.error("Gemini suggestOutfit failed:", err);
    return null;
  }
}

export interface WeatherSummary {
  description: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbability: number;
}

/**
 * Igual que `suggestOutfit`, pero validando la sugerencia contra el clima y
 * la ubicación reales del día de la tarea (cuando se conocen). Esta es la
 * versión que se guarda en la columna "vestimenta" de Notion; la sugerencia
 * simple de `suggestOutfit` (sin clima) es la que se muestra dentro de la app.
 */
export async function suggestOutfitForNotion(
  title: string,
  description: string | null | undefined,
  locationName: string | null,
  weather: WeatherSummary | null
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const prompt = [
    "Sugiere en máximo 15 palabras qué tipo de vestimenta usar para esta tarea/evento,",
    "tomando en cuenta el clima y la ubicación si los tengo disponibles (ej. si va a llover o hace frío, dilo).",
    "Responde solo con la sugerencia, sin explicaciones ni comillas.",
    `Título: ${title}`,
    description ? `Descripción: ${description}` : null,
    locationName ? `Ubicación: ${locationName}` : null,
    weather
      ? `Clima ese día: ${weather.description}, máx ${Math.round(weather.tempMaxC)}°C, mín ${Math.round(
          weather.tempMinC
        )}°C, probabilidad de lluvia ${weather.precipitationProbability}%.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({ model, input: prompt });
    return interaction.output_text?.trim() || null;
  } catch (err) {
    console.error("Gemini suggestOutfitForNotion failed:", err);
    return null;
  }
}

export interface RecommendationContext {
  title: string;
  description?: string | null;
  locationName?: string | null;
  originName?: string | null;
  weather?: {
    description: string;
    tempMaxC: number;
    tempMinC: number;
    precipitationProbability: number;
  } | null;
  travel?: {
    distanceKm: number;
    car: { minutes: number; leaveMinutesBefore: number };
    bike: { minutes: number; leaveMinutesBefore: number };
    publicTransport: { minutes: number; leaveMinutesBefore: number };
  } | null;
  preferredTransport?: "car" | "bike" | "public_transport" | "walking" | null;
}

/**
 * Genera recomendaciones más completas (vestimenta + qué llevar + cómo y
 * cuándo salir) validando contra el clima real, la ubicación de la tarea y
 * el tiempo de traslado desde la ubicación del usuario. Es un "extra" igual
 * que `suggestOutfit`: si falla, devuelve null.
 */
export async function getRecommendations(context: RecommendationContext): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const prompt = [
    "Da recomendaciones breves (máximo 5-6 líneas) de vestimenta, qué llevar, y cómo/cuándo salir",
    "para esta tarea/evento, tomando en cuenta el clima, la ubicación y el tiempo de traslado si los",
    "tengo disponibles. Si el clima sugiere algo distinto a lo obvio por el tipo de tarea (ej. frío,",
    "lluvia, calor extremo), acláralo explícitamente. Si hay datos de traslado, di con cuánta",
    "anticipación salir según el medio de transporte (los minutos de 'leaveMinutesBefore' ya incluyen",
    "margen de espera/imprevistos, úsalos directo, no los recalcules).",
    "Responde directo con las recomendaciones, sin encabezados ni comillas.",
    `Título: ${context.title}`,
    context.description ? `Descripción: ${context.description}` : null,
    context.locationName ? `Ubicación del evento: ${context.locationName}` : null,
    context.originName && context.originName !== context.locationName
      ? `Saliendo desde: ${context.originName}`
      : null,
    context.weather
      ? `Clima ese día: ${context.weather.description}, máx ${Math.round(context.weather.tempMaxC)}°C, mín ${Math.round(
          context.weather.tempMinC
        )}°C, probabilidad de lluvia ${context.weather.precipitationProbability}%.`
      : null,
    context.travel
      ? `Traslado: ${context.travel.distanceKm} km. En auto: ${context.travel.car.minutes} min de viaje, sal con ${context.travel.car.leaveMinutesBefore} min de anticipación. En bici: ${context.travel.bike.minutes} min de viaje, sal con ${context.travel.bike.leaveMinutesBefore} min de anticipación. En transporte público (estimado): ${context.travel.publicTransport.minutes} min de viaje, sal con ${context.travel.publicTransport.leaveMinutesBefore} min de anticipación.`
      : null,
    context.preferredTransport
      ? `Medio de transporte preferido del usuario: ${
          context.preferredTransport === "car" ? "auto" :
          context.preferredTransport === "bike" ? "bici" :
          context.preferredTransport === "public_transport" ? "transporte público" : "a pie"
        }. Enfoca la sugerencia de salida en ese medio.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({ model, input: prompt });
    return interaction.output_text?.trim() || null;
  } catch (err) {
    console.error("Gemini getRecommendations failed:", err);
    return null;
  }
}
