import { GoogleGenAI, createUserContent, createPartFromBase64, createPartFromText, type ContentListUnion } from "@google/genai";
import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";
import type { Category, Gender } from "@/lib/types";

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

// Tries the configured model first; if it fails for ANY reason (quota,
// deprecated/not-found, etc.), falls through FALLBACK_MODELS until one works
// or all fail. A model being deprecated is just as valid a reason to move to
// the next candidate as hitting a quota limit — so every failure is treated
// the same way here instead of only retrying on 429s.
async function generateWithFallback(apiKey: string, contents: ContentListUnion): Promise<string | null> {
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

  const ai = new GoogleGenAI({ apiKey });

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Gemini [${model}] failed, trying next model...`, msg.slice(0, 200));
    }
  }

  console.error("Gemini: all models exhausted or failed.");
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
  // Respuestas a preguntas puntuales que la app (no Gemini) decidió hacerle al
  // usuario según la categoría de la tarea (ver getPersonalizedQuestions).
  personalizedAnswers?: { question: string; answer: string }[];
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
    context.personalizedAnswers?.length
      ? [
          "El usuario respondió estas preguntas puntuales sobre la tarea — úsalas para afinar la",
          "recomendación (por ejemplo, si dio un código de vestimenta, respétalo en vez de adivinar):",
          ...context.personalizedAnswers
            .filter((a) => a.answer.trim())
            .map((a) => `- ${a.question} → ${a.answer.trim()}`),
        ].join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return generateWithFallback(apiKey, prompt);
}

export interface DailyLeg {
  fromLabel: string;
  toLabel: string;
  // Minutos libres entre que termina "fromLabel" y empieza "toLabel"; null si
  // no se pudo calcular (p. ej. es el primer traslado del día).
  gapMinutes: number | null;
  // Solo presentes cuando las ubicaciones de origen/destino son distintas.
  distanceKm?: number;
  car?: { minutes: number; leaveMinutesBefore: number };
  bike?: { minutes: number; leaveMinutesBefore: number };
  publicTransport?: { minutes: number; leaveMinutesBefore: number };
}

export interface DailyRecommendationContext {
  items: { title: string; categories: string[]; description?: string | null }[];
  // Traslados/huecos entre actividades consecutivas (y desde la ubicación del
  // usuario a la primera), para que el modelo pueda avisar si el tiempo entre
  // una y otra no alcanza para llegar.
  legs?: DailyLeg[];
  locationName?: string | null;
  weather?: WeatherSummary | null;
  preferredTransport?: "car" | "bike" | "public_transport" | "walking" | null;
  // null cuando solo hay una tarea (la pregunta se omite); si hay varias,
  // true/false según lo que respondió el usuario.
  sameOutfitForAll?: boolean | null;
  // Código de vestimenta u outfit que el usuario ya tenía pensado — si viene,
  // Gemini solo lo valida/ajusta con el clima en vez de inventarlo (menos tokens).
  outfitIdea?: string | null;
  userProfile?: UserProfile | null;
}

/**
 * Recomendación única para todo el día (botón "Recomendación automática" en
 * Inicio), en vez de una por tarea. El prompt usa título, categorías y
 * descripción (ya desencriptada por el caller) de cada tarea de hoy, y las
 * respuestas puntuales del usuario (transporte, outfit ya pensado) en vez de
 * pedirle a Gemini que las adivine, para gastar menos tokens.
 */
export async function getDailyRecommendation(context: DailyRecommendationContext): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "Da una recomendación breve (máximo 6-7 líneas) para el día completo del usuario: qué ponerse,",
    "qué llevar, y cómo/cuándo salir, tomando en cuenta el clima y el transporte si los tengo disponibles.",
    "Si el clima sugiere algo distinto a lo obvio (frío, lluvia, calor extremo), acláralo explícitamente.",
    "Si el tiempo libre entre dos actividades no alcanza para el traslado estimado entre ellas, adviértelo",
    "explícitamente (por ejemplo, sugiriendo salir antes de que termine la actividad previa o usar un medio más rápido).",
    "Adapta las sugerencias al perfil del usuario si está disponible.",
    "Responde directo con las recomendaciones, sin encabezados ni comillas.",
    userProfileLine(context.userProfile),
    "Tareas de hoy:",
    ...context.items.map(
      (i) =>
        `- ${i.title}${i.categories.length ? ` (${i.categories.join(", ")})` : ""}${
          i.description ? `: ${i.description}` : ""
        }`
    ),
    context.legs?.length
      ? [
          "Traslados y tiempos entre actividades:",
          ...context.legs.map((l) => {
            const parts = [`De "${l.fromLabel}" a "${l.toLabel}"`];
            if (l.gapMinutes !== null) parts.push(`${l.gapMinutes} min libres entre ambas`);
            if (l.distanceKm !== undefined && l.car) {
              parts.push(
                `ubicaciones distintas: ${l.distanceKm} km, ~${l.car.minutes} min en auto (sal con ${l.car.leaveMinutesBefore} min de anticipación), ~${l.bike?.minutes} min en bici, ~${l.publicTransport?.minutes} min en transporte público`
              );
            }
            return `- ${parts.join(": ")}`;
          }),
        ].join("\n")
      : null,
    context.locationName ? `Ubicación: ${context.locationName}` : null,
    context.weather
      ? `Clima hoy: ${context.weather.description}, máx ${Math.round(context.weather.tempMaxC)}°C, mín ${Math.round(
          context.weather.tempMinC
        )}°C, probabilidad de lluvia ${context.weather.precipitationProbability}%.`
      : null,
    context.preferredTransport
      ? `Medio de transporte: ${
          context.preferredTransport === "car" ? "auto" :
          context.preferredTransport === "bike" ? "bici" :
          context.preferredTransport === "public_transport" ? "transporte público" : "a pie"
        }. Enfoca la sugerencia de salida en ese medio.`
      : null,
    context.sameOutfitForAll === false
      ? "El usuario prefiere variar de outfit entre tareas: sugiere una base versátil y qué ajustar entre una tarea y otra."
      : context.sameOutfitForAll === true
      ? "El usuario quiere un solo outfit para todas sus tareas de hoy."
      : null,
    context.outfitIdea
      ? `El usuario ya tiene esto pensado para su outfit/código de vestimenta de hoy: "${context.outfitIdea}". No lo inventes desde cero, solo valídalo o ajústalo según el clima.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return generateWithFallback(apiKey, prompt);
}

// ── Fase 4 del plan de implementación: crear una tarea hablando ─────────────
// (extendido después para crear una tarea a partir de una imagen — mismo
// contrato de salida, comparte coerceExtraction)

export interface TaskExtraction {
  title: string;
  category: Category | null;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:mm"
  allDay: boolean;
  location: string | null;
  description: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Compara ignorando mayúsculas/acentos, para que "trabajo" o "Cursos Extras" también matcheen. */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function coerceCategory(value: unknown): Category | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeForMatch(value);
  return CATEGORY_OPTIONS.find((c) => normalizeForMatch(c) === normalized) ?? null;
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return DATE_RE.test(trimmed) ? trimmed : null;
}

function coerceTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return TIME_RE.test(trimmed) ? trimmed : null;
}

/**
 * Arma el resultado campo por campo en vez de validar todo el objeto de una
 * sola vez: si Gemini responde con una categoría que no coincide exactamente,
 * o una fecha/hora en un formato distinto, ese campo se descarta a null en
 * vez de tirar TODA la extracción (incluido el título, que suele venir bien
 * aunque algún otro campo no calce). Es la causa más probable de que "a
 * veces funcione y a veces no": un solo campo imperfecto no debería perder
 * el resto.
 */
function coerceExtraction(parsed: unknown, fallbackTitle: string): TaskExtraction {
  const obj = (parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : fallbackTitle;
  const time = coerceTime(obj.time);
  return {
    title,
    category: coerceCategory(obj.category),
    date: coerceDate(obj.date),
    time,
    allDay: typeof obj.allDay === "boolean" ? obj.allDay : time === null,
    location: typeof obj.location === "string" && obj.location.trim() ? obj.location.trim() : null,
    description: typeof obj.description === "string" && obj.description.trim() ? obj.description.trim() : null,
  };
}

/** Recorta la transcripción cruda a un título razonable cuando Gemini no da nada usable. */
function titleFromTranscript(transcript: string): string {
  const trimmed = transcript.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

/**
 * Extrae de una transcripción de voz los datos para prellenar el formulario
 * de "Nueva tarea": título, categoría, fecha y hora. El usuario revisa y
 * confirma en el formulario normal antes de guardar — esto solo prellena,
 * no crea la tarea directamente (si Gemini entiende mal algo, el usuario lo
 * corrige antes de que se guarde nada).
 *
 * Nunca devuelve null: si Gemini no responde, o responde algo imposible de
 * interpretar, se regresa un resultado de respaldo con el título tomado
 * directo de la transcripción — así el dictado nunca se pierde del todo,
 * peor caso el usuario solo tiene que poner fecha/hora/categoría a mano.
 */
export async function extractTaskFromSpeech(
  transcript: string,
  context: { todayDate: string; nowTime: string; weekday: string }
): Promise<TaskExtraction> {
  const fallback: TaskExtraction = {
    title: titleFromTranscript(transcript),
    category: null,
    date: null,
    time: null,
    allDay: true,
    location: null,
    description: null,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const prompt = [
    "Extrae de esta transcripción de voz los datos de una tarea/evento para una agenda personal.",
    "Responde ÚNICAMENTE con un objeto JSON (sin texto adicional, sin comillas triples, sin explicación), con esta forma exacta:",
    '{"title": string, "category": string|null, "date": "YYYY-MM-DD"|null, "time": "HH:mm"|null, "allDay": boolean}',
    `"category" debe ser exactamente una de estas opciones, o null si ninguna aplica claramente: ${CATEGORY_OPTIONS.join(", ")}.`,
    "Resuelve fechas y horas relativas ('mañana', 'el viernes que viene', 'en dos horas', 'a mediodía') usando la fecha/hora actual dadas abajo.",
    "Si no se menciona ninguna hora específica, usa allDay=true y time=null. Si no se menciona fecha ni algo relativo a hoy, usa date=null.",
    `Fecha actual: ${context.todayDate} (${context.weekday}). Hora actual: ${context.nowTime}.`,
    `Transcripción: "${transcript.replace(/"/g, "'")}"`,
  ].join("\n");

  const raw = await generateWithFallback(apiKey, prompt);
  if (!raw) return fallback;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return coerceExtraction(parsed, fallback.title);
  } catch {
    return fallback;
  }
}

// ── Crear una tarea a partir de una imagen (volante, invitación, captura de
// pantalla, nota escrita a mano, etc.) ──────────────────────────────────────

/**
 * Extrae de una imagen los datos para prellenar el formulario de "Nueva
 * tarea", igual que extractTaskFromSpeech pero a partir de una foto/captura
 * en vez de una transcripción — mismo contrato de salida y misma regla de
 * seguridad: solo prellena, el usuario revisa y confirma con el botón de
 * crear antes de que se guarde nada.
 *
 * Nunca devuelve null: si Gemini no responde o no da nada interpretable, se
 * regresa un resultado de respaldo genérico — el usuario llena a mano en
 * vez de perder el intento por completo.
 */
export async function extractTaskFromImage(
  imageBase64: string,
  mimeType: string,
  context: { todayDate: string; nowTime: string; weekday: string }
): Promise<TaskExtraction> {
  const fallback: TaskExtraction = {
    title: "Tarea desde imagen",
    category: null,
    date: null,
    time: null,
    allDay: true,
    location: null,
    description: null,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const prompt = [
    "Esta imagen puede ser una invitación, un volante, una captura de pantalla, una nota escrita a mano, un boleto, o cualquier otra fuente con información de una tarea/evento para una agenda personal.",
    "Extrae de la imagen los datos de esa tarea/evento.",
    "Responde ÚNICAMENTE con un objeto JSON (sin texto adicional, sin comillas triples, sin explicación), con esta forma exacta:",
    '{"title": string, "category": string|null, "date": "YYYY-MM-DD"|null, "time": "HH:mm"|null, "allDay": boolean, "location": string|null, "description": string|null}',
    `"category" debe ser exactamente una de estas opciones, o null si ninguna aplica claramente: ${CATEGORY_OPTIONS.join(", ")}.`,
    "\"location\" es la dirección o lugar del evento si aparece en la imagen, o null si no aparece.",
    "\"description\" es cualquier detalle adicional relevante y breve (máximo 200 caracteres), o null si no hay nada que agregar.",
    "Resuelve fechas y horas relativas ('mañana', 'el próximo sábado') usando la fecha/hora actual dadas abajo.",
    "Si no hay ninguna hora específica visible, usa allDay=true y time=null. Si no hay fecha visible ni se puede inferir, usa date=null.",
    "Si la imagen no parece contener información de una tarea o evento, responde con title=\"Tarea desde imagen\" y el resto en null.",
    `Fecha actual: ${context.todayDate} (${context.weekday}). Hora actual: ${context.nowTime}.`,
  ].join("\n");

  const contents = createUserContent([createPartFromText(prompt), createPartFromBase64(imageBase64, mimeType)]);

  const raw = await generateWithFallback(apiKey, contents);
  if (!raw) return fallback;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return coerceExtraction(parsed, fallback.title);
  } catch {
    return fallback;
  }
}
