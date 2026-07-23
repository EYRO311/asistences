#!/usr/bin/env node
// Verifica coerceExtraction() y sus helpers (web/lib/gemini.ts) — el fix a
// "a veces funciona, a veces no" en la creación de tareas hablando: antes,
// si UN campo de la respuesta de Gemini no matcheaba exactamente (categoría
// con otra capitalización, fecha/hora en formato distinto), se descartaba
// TODA la extracción, incluido el título. Ahora cada campo se resuelve por
// separado y nunca se pierde el título/transcripción.
//
// Reimplementa aquí la misma lógica (sin tipos TS) para probarla sin
// depender del runtime de Next.js ni de una llamada real a Gemini (esa
// prueba en vivo vive en verify-voice-extraction.mjs). Si el contrato
// cambia en el archivo real, este script debe actualizarse igual.
//
// Uso: node scripts/verify-voice-coercion.mjs

const CATEGORY_OPTIONS = ["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro", "Evento"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function normalizeForMatch(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function coerceCategory(value) {
  if (typeof value !== "string") return null;
  const normalized = normalizeForMatch(value);
  return CATEGORY_OPTIONS.find((c) => normalizeForMatch(c) === normalized) ?? null;
}

function coerceDate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return DATE_RE.test(trimmed) ? trimmed : null;
}

function coerceTime(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return TIME_RE.test(trimmed) ? trimmed : null;
}

function titleFromTranscript(transcript) {
  const trimmed = transcript.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function coerceExtraction(parsed, fallbackTitle) {
  const obj = parsed && typeof parsed === "object" ? parsed : {};
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : fallbackTitle;
  const time = coerceTime(obj.time);
  return {
    title,
    category: coerceCategory(obj.category),
    date: coerceDate(obj.date),
    time,
    allDay: typeof obj.allDay === "boolean" ? obj.allDay : time === null,
  };
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`OK   ${name}`);
    passed++;
  } else {
    console.log(`FAIL ${name}\n     esperado: ${e}\n     obtuvo:   ${a}`);
    failed++;
  }
}

// 1) Categoría con otra capitalización/sin acento -> igual matchea
check(
  "categoría en minúsculas matchea",
  coerceExtraction({ title: "Junta", category: "trabajo", date: "2026-07-21", time: "10:00", allDay: false }, "Junta"),
  { title: "Junta", category: "Trabajo", date: "2026-07-21", time: "10:00", allDay: false }
);

// 2) Categoría inventada por el modelo (no está en la lista) -> null, NO tira toda la extracción
check(
  "categoría no reconocida cae a null sin perder el resto",
  coerceExtraction({ title: "Cine", category: "Entretenimiento", date: "2026-07-21", time: "19:00", allDay: false }, "Cine"),
  { title: "Cine", category: null, date: "2026-07-21", time: "19:00", allDay: false }
);

// 3) Fecha en formato raro -> null en vez de descartar todo
check(
  "fecha con formato inválido cae a null sin perder el título",
  coerceExtraction({ title: "Pago", category: "Personal", date: "21 de julio", time: "10:00", allDay: false }, "Pago"),
  { title: "Pago", category: "Personal", date: null, time: "10:00", allDay: false }
);

// 4) Título vacío/ausente -> usa el de respaldo (transcripción)
check(
  "título ausente usa el de respaldo",
  coerceExtraction({ category: "Trabajo", date: "2026-07-21", time: "10:00", allDay: false }, "Junta de equipo mañana"),
  { title: "Junta de equipo mañana", category: "Trabajo", date: "2026-07-21", time: "10:00", allDay: false }
);

// 5) JSON completamente vacío -> respaldo total, nada revienta
check(
  "objeto vacío no revienta, usa respaldo completo",
  coerceExtraction({}, "recordarme comprar pan"),
  { title: "recordarme comprar pan", category: null, date: null, time: null, allDay: true }
);

// 6) Transcripción muy larga se recorta para el título de respaldo
const longTranscript = "a".repeat(100);
check("título de respaldo se recorta a 80 caracteres", titleFromTranscript(longTranscript).length, 80);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
