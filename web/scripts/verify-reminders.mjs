#!/usr/bin/env node
// Fase 6 del plan de implementación: verifica isReminderDue/getLocalDateInfo
// (web/lib/reminders.ts) — decide si una tarea puntual o una rutina
// recurrente necesita un recordatorio push ahora mismo, en la hora local del
// usuario (no la del servidor), sin repetir el aviso el mismo día.
//
// Reimplementa aquí la misma lógica (sin tipos TS) para probarla sin
// depender del runtime de Next.js. Si el contrato cambia en el archivo real,
// este script debe actualizarse igual.
//
// Uso: node scripts/verify-reminders.mjs

function getLocalDateInfo(tz, from = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(from)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const minutesOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const isoWeekday = ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

  return { dateStr, minutesOfDay, isoWeekday };
}

function isReminderDue(item, tz, windowMinutes, now = new Date()) {
  if (item.all_day) return false;

  const { dateStr, minutesOfDay, isoWeekday } = getLocalDateInfo(tz, now);
  if (item.last_reminder_date === dateStr) return false;

  let occurrenceMinutes = null;

  const isRecurring =
    item.recurrence_days.length > 0 && Boolean(item.recurrence_start_time) && Boolean(item.recurrence_end_time);

  if (isRecurring) {
    if (item.recurrence_days.includes(isoWeekday)) {
      const [h, m] = item.recurrence_start_time.split(":").map(Number);
      occurrenceMinutes = h * 60 + m;
    }
  } else if (item.start_time) {
    const startInfo = getLocalDateInfo(tz, new Date(item.start_time));
    if (startInfo.dateStr === dateStr) occurrenceMinutes = startInfo.minutesOfDay;
  }

  if (occurrenceMinutes === null) return false;

  const diff = occurrenceMinutes - minutesOfDay;
  return diff >= 0 && diff <= windowMinutes;
}

const TZ = "America/Mexico_City";
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`OK   ${name}`);
    passed++;
  } else {
    console.log(`FAIL ${name} (esperado ${expected}, obtuvo ${actual})`);
    failed++;
  }
}

// "Ahora" fijo para que las pruebas sean deterministas: martes 2026-07-21,
// 09:50 en America/Mexico_City = 15:50 UTC.
const NOW = new Date("2026-07-21T15:50:00Z"); // martes, isoWeekday=2

// 1) Tarea puntual que empieza en 10 min, ventana de 15 -> debe avisar
check(
  "tarea puntual dentro de la ventana",
  isReminderDue(
    {
      start_time: "2026-07-21T16:00:00Z", // 10:00 local
      all_day: false,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  true
);

// 2) Misma tarea pero ya se avisó hoy -> no debe repetir
check(
  "no repite si ya se avisó hoy",
  isReminderDue(
    {
      start_time: "2026-07-21T16:00:00Z",
      all_day: false,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: "2026-07-21",
    },
    TZ,
    15,
    NOW
  ),
  false
);

// 3) Tarea puntual mañana -> no debe avisar hoy
check(
  "tarea puntual de mañana no avisa hoy",
  isReminderDue(
    {
      start_time: "2026-07-22T16:00:00Z",
      all_day: false,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  false
);

// 4) Rutina recurrente hoy (martes=2) a las 10:00 local, ventana 15 -> avisa
check(
  "rutina recurrente hoy dentro de la ventana",
  isReminderDue(
    {
      start_time: null,
      all_day: false,
      recurrence_days: [1, 2, 3, 4, 5],
      recurrence_start_time: "10:00",
      recurrence_end_time: "18:00",
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  true
);

// 5) Rutina recurrente que no incluye el día de hoy -> no avisa
check(
  "rutina recurrente que no aplica hoy",
  isReminderDue(
    {
      start_time: null,
      all_day: false,
      recurrence_days: [6, 7], // sábado y domingo, hoy es martes
      recurrence_start_time: "10:00",
      recurrence_end_time: "18:00",
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  false
);

// 6) Tarea de todo el día -> nunca avisa
check(
  "tarea de todo el día nunca avisa",
  isReminderDue(
    {
      start_time: "2026-07-21T06:00:00Z",
      all_day: true,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  false
);

// 7) Tarea que ya empezó hace 20 min (fuera de ventana hacia atrás) -> no avisa
check(
  "tarea que ya empezó no avisa",
  isReminderDue(
    {
      start_time: "2026-07-21T15:30:00Z", // 09:30 local, ya pasó
      all_day: false,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  false
);

// 8) Tarea justo en el borde de la ventana (exactamente 15 min) -> avisa
check(
  "borde exacto de la ventana avisa",
  isReminderDue(
    {
      start_time: "2026-07-21T16:05:00Z", // 10:05 local, faltan exactamente 15 min
      all_day: false,
      recurrence_days: [],
      recurrence_start_time: null,
      recurrence_end_time: null,
      last_reminder_date: null,
    },
    TZ,
    15,
    NOW
  ),
  true
);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
