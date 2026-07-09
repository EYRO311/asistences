import { GoogleGenAI } from "@google/genai";
import type { Gender } from "@/lib/types";

// Primary model from env, then fallback chain in order
const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

export interface UserProfile {
  name?: string | null;
  age?: number | null;
  gender?: Gender | null;
}

function userProfileLine(profile?: UserProfile | null): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.name) parts.push(profile.name);
  if (profile.age) parts.push(`${profile.age} años`);
  if (profile.gender && profile.gender !== "prefiero_no_decir") {
    const label = { masculino: "masculino", femenino: "femenino", no_binario: "no binario / otro" }[profile.gender];
    if (label) parts.push(`género: ${label}`);
  }
  return parts.length ? `Usuario: ${parts.join(", ")}.` : null;
}

// Tries the configured model first; if it fails (quota/rate limit), falls back
// through FALLBACK_MODELS until one works or all fail.
async function generateWithFallback(apiKey: string, prompt: string): Promise<string | null> {
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

  const ai = new GoogleGenAI({ apiKey });

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 429 = quota/rate limit → try next model; anything else → stop
      if (!msg.includes('"code":429') && !msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED")) {
        console.error(`Gemini [${model}] failed (non-quota):`, msg.slice(0, 200));
        return null;
      }
      console.warn(`Gemini [${model}] quota exceeded, trying next model...`);
    }
  }

  console.error("Gemini: all models exhausted or quota exceeded.");
  return null;
}

/**
 * Sugiere brevemente qué tipo de vestimenta es apropiada para una tarea,
 * analizando su título y descripción con Gemini. Es un "extra": si falla
 * (sin API key, error de red, etc.) devuelve null y no debe abortar la saga.
 */
export async function suggestOutfit(title: string, description?: string | null): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "Sugiere en máximo 12 palabras qué tipo de vestimenta usar para esta tarea/evento.",
    "Responde solo con la sugerencia, sin explicaciones ni comillas.",
    `Título: ${title}`,
    description ? `Descripción: ${description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return generateWithFallback(apiKey, prompt);
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
  weather: WeatherSummary | null,
  userProfile?: UserProfile | null
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "Sugiere en máximo 15 palabras qué tipo de vestimenta usar para esta tarea/evento,",
    "tomando en cuenta el clima y la ubicación si los tengo disponibles (ej. si va a llover o hace frío, dilo).",
    "Adapta la sugerencia al perfil del usuario si está disponible.",
    "Responde solo con la sugerencia, sin explicaciones ni comillas.",
    userProfileLine(userProfile),
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

  return generateWithFallback(apiKey, prompt);
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
  userProfile?: UserProfile | null;
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

  const prompt = [
    "Da recomendaciones breves (máximo 5-6 líneas) de vestimenta, qué llevar, y cómo/cuándo salir",
    "para esta tarea/evento, tomando en cuenta el clima, la ubicación y el tiempo de traslado si los",
    "tengo disponibles. Si el clima sugiere algo distinto a lo obvio por el tipo de tarea (ej. frío,",
    "lluvia, calor extremo), acláralo explícitamente. Si hay datos de traslado, di con cuánta",
    "anticipación salir según el medio de transporte (los minutos de 'leaveMinutesBefore' ya incluyen",
    "margen de espera/imprevistos, úsalos directo, no los recalcules).",
    "Adapta las sugerencias de vestimenta al perfil del usuario si está disponible.",
    "Responde directo con las recomendaciones, sin encabezados ni comillas.",
    userProfileLine(context.userProfile),
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

  return generateWithFallback(apiKey, prompt);
}
