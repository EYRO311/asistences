#!/usr/bin/env node
// Regresión: occurrenceToday() (web/lib/todayItems.ts) construía la
// ocurrencia de hoy de una rutina recurrente con `new Date(y, m, d, h, m)`,
// que usa la zona horaria del proceso que ejecuta el código — correcta en el
// navegador, pero Vercel corre los Server Components en UTC, así que una
// rutina de "09:00 a 18:00" en America/Mexico_City (UTC-6) terminaba
// guardándose/mostrándose como "03:00 a.m. - 12:00 p.m.". El fix usa
// wallToUTC (misma técnica que ya usa /api/calendar/free-slots) en vez de un
// constructor de Date local-naive.
//
// Reimplementa aquí wallToUTC + occurrenceToday (sin tipos TS) para probarlo
// sin depender del runtime de Next.js. Si el contrato cambia en los archivos
// reales, este script debe actualizarse igual.
//
// Uso: node scripts/verify-today-items-tz.mjs

function wallToUTC(dateStr, timeStr, tz) {
  const [h, m] = timeStr.split(":").map(Number);
  const naive = new Date(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), h, m, 0));

  const localStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(naive);
  const [lh, lm] = localStr.split(":").map(Number);
  const diffMinutes = (h * 60 + m) - (lh * 60 + lm);
  return new Date(naive.getTime() + diffMinutes * 60_000);
}

function occurrenceToday(item, todayStr, tz) {
  if (!item.recurrence_days?.length) return item;
  const start = wallToUTC(todayStr, item.recurrence_start_time, tz);
  const end = wallToUTC(todayStr, item.recurrence_end_time, tz);
  return { ...item, start_time: start.toISOString(), end_time: end.toISOString() };
}

const TZ = "America/Mexico_City";
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`OK   ${name}`);
    passed++;
  } else {
    console.log(`FAIL ${name}\n     esperado: ${expected}\n     obtuvo:   ${actual}`);
    failed++;
  }
}

// Rutina "09:00-18:00" en America/Mexico_City (UTC-6) el 2026-07-21 debe
// quedar en 15:00-00:00 UTC, NUNCA en 09:00-18:00 UTC (ese era el bug: 6h
// antes de lo real, ej. "03:00 a.m." en vez de "09:00 a.m." al mostrarse
// en el navegador del usuario).
const routine = {
  recurrence_days: [1, 2, 3, 4, 5],
  recurrence_start_time: "09:00",
  recurrence_end_time: "18:00",
};

const result = occurrenceToday(routine, "2026-07-21", TZ);
check("inicio de rutina en UTC correcto (9am Mexico = 15:00 UTC)", result.start_time, "2026-07-21T15:00:00.000Z");
check("fin de rutina en UTC correcto (18:00 Mexico = 00:00 UTC del día siguiente)", result.end_time, "2026-07-22T00:00:00.000Z");

// Item sin recurrencia no debe tocarse
const plain = { recurrence_days: [], start_time: "2026-07-21T20:00:00.000Z" };
check("item no recurrente pasa sin cambios", occurrenceToday(plain, "2026-07-21", TZ), plain);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
