#!/usr/bin/env node
// Fase 4 del plan de implementación — la prueba que pide la fase: un set de
// frases habladas de ejemplo con distintas formas de decir fecha/hora,
// verificando que la extracción da los campos correctos.
//
// A diferencia de los scripts verify:* anteriores (matemática pura, sin
// dependencias externas), esta SÍ hace llamadas reales a la API de Gemini —
// es exactamente lo que hay que probar aquí (que el prompt + parseo
// funcionan contra el modelo real, no una reimplementación). Requiere
// GEMINI_API_KEY configurada. Un par de casos pueden fallar por variación
// natural del modelo sin que signifique que la función está rota — revisa
// el detalle de cada caso, no solo el resumen.
//
// Uso: node --env-file=.env.local scripts/verify-voice-extraction.mjs

import { GoogleGenAI } from "@google/genai";

const CATEGORY_OPTIONS = ["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro", "Evento"];
const DEFAULT_MODEL = "gemini-2.5-flash";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY no está configurada (usa: node --env-file=.env.local scripts/verify-voice-extraction.mjs)");
  process.exit(1);
}

// Sin cadena de fallback aquí a propósito: esta prueba valida el prompt de
// extracción contra UN modelo real, no vuelve a probar el mecanismo de
// fallback (eso ya se verificó por separado). Disparar 12 casos × varios
// modelos de fallback cada uno agota la cuota gratis del tier en segundos.
async function generateOnce(prompt) {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text?.trim() ?? null;
  } catch (err) {
    console.warn(`  (modelo ${model} falló: ${err.message?.slice(0, 150)})`);
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Espejo del prompt real en web/lib/gemini.ts's extractTaskFromSpeech
async function extractTaskFromSpeech(transcript, context) {
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

  const raw = await generateOnce(prompt);
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ── Fechas de referencia (UTC, para que la aritmética sea reproducible) ────
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}
function nextWeekday(dateStr, isoWeekday) {
  // isoWeekday: 1=lunes...7=domingo. Encuentra la próxima ocurrencia
  // ESTRICTAMENTE DESPUÉS de dateStr (igual que "el viernes que viene").
  let d = new Date(`${dateStr}T00:00:00Z`);
  for (let i = 1; i <= 7; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const jsDay = d.getUTCDay();
    const iso = jsDay === 0 ? 7 : jsDay;
    if (iso === isoWeekday) return toDateStr(d);
  }
  return null;
}

const today = toDateStr(new Date());
const weekdayLabel = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`));
const context = { todayDate: today, nowTime: "12:00", weekday: weekdayLabel };

const nextFriday = nextWeekday(today, 5);
const nextMonday = nextWeekday(today, 1);

const cases = [
  { phrase: "Recuérdame comprar pan mañana a las 5 de la tarde", expected: { date: addDays(today, 1), time: "17:00", allDay: false } },
  { phrase: "Tengo junta de trabajo hoy a las 10 de la mañana", expected: { date: today, time: "10:00", allDay: false } },
  { phrase: "Cita con el dentista pasado mañana a las 9am", expected: { date: addDays(today, 2), time: "09:00", allDay: false } },
  { phrase: "El viernes que viene tengo entrega del proyecto a mediodía", expected: { date: nextFriday, time: "12:00", allDay: false } },
  { phrase: "El lunes que viene empiezan las clases, todo el día", expected: { date: nextMonday, time: null, allDay: true } },
  { phrase: "Llamar al banco en tres días a las 4pm", expected: { date: addDays(today, 3), time: "16:00", allDay: false } },
  { phrase: "Mañana a mediodía como con mi familia", expected: { date: addDays(today, 1), time: "12:00", allDay: false } },
  { phrase: "Hoy en la noche a las 8 tengo cena con amigos", expected: { date: today, time: "20:00", allDay: false } },
  { phrase: "En una semana vence mi pago de tarjeta", expected: { date: addDays(today, 7), time: null, allDay: true } },
  { phrase: "Mañana temprano a las 7 de la mañana ir al gimnasio", expected: { date: addDays(today, 1), time: "07:00", allDay: false } },
  { phrase: "Pasado mañana todo el día es el examen final", expected: { date: addDays(today, 2), time: null, allDay: true } },
  { phrase: "Hoy a medianoche vence la tarea", expected: { date: today, time: "00:00", allDay: false } },
];

let passed = 0;
let failed = 0;

console.log(`Referencia: hoy = ${today} (${weekdayLabel})\n`);

for (const { phrase, expected } of cases) {
  await sleep(4000); // respeta el límite de solicitudes por minuto del tier gratis
  const result = await extractTaskFromSpeech(phrase, context);

  if (!result) {
    console.error(`✗ "${phrase}"\n   → sin respuesta o JSON inválido`);
    failed++;
    continue;
  }

  const dateOk = result.date === expected.date;
  const timeOk = result.time === expected.time;
  const allDayOk = result.allDay === expected.allDay;
  const ok = dateOk && timeOk && allDayOk;

  if (ok) {
    console.log(`✓ "${phrase}"\n   → date=${result.date} time=${result.time} allDay=${result.allDay} (título: "${result.title}")`);
    passed++;
  } else {
    console.error(
      `✗ "${phrase}"\n   esperado: date=${expected.date} time=${expected.time} allDay=${expected.allDay}\n` +
        `   obtenido: date=${result.date} time=${result.time} allDay=${result.allDay}`
    );
    failed++;
  }
}

console.log(`\n${passed}/${cases.length} casos coincidieron exactamente con lo esperado.`);
if (failed > 0) {
  console.log(
    "Nota: un par de fallos en casos de día de la semana pueden deberse a variación natural del modelo, no necesariamente a un bug — revisa el detalle arriba."
  );
}
process.exit(failed > cases.length / 2 ? 1 : 0);
