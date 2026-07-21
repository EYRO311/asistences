#!/usr/bin/env node
// Fase 7 del plan de implementación: verifica computeWeeklyReport/getWeekRange
// (web/lib/productivityReport.ts) — resumen semanal de tareas/metas a partir
// de datos que ya existen, sin nueva captura.
//
// Reimplementa aquí la misma lógica (sin tipos TS, sin el import de
// CATEGORY_OPTIONS) para probarla sin depender del runtime de Next.js. Si el
// contrato cambia en el archivo real, este script debe actualizarse igual.
//
// Uso: node scripts/verify-productivity-report.mjs

const CATEGORY_OPTIONS = ["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro", "Evento"];
const PRIORITIES = ["alta", "media", "baja"];

function getLocalDate(tz, from) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(from)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const isoWeekday = ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return { dateStr, isoWeekday };
}

function getWeekRange(tz, now = new Date(), weeksAgo = 0) {
  const { dateStr, isoWeekday } = getLocalDate(tz, now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() - (isoWeekday - 1) - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function computeWeeklyReport(items, goalItems, goals, tz, weekStart, weekEnd) {
  const inWeek = items.filter((item) => {
    if (item.all_day || item.status === "cancelled" || !item.start_time) return false;
    if (item.recurrence_days.length > 0) return false;
    const { dateStr } = getLocalDate(tz, new Date(item.start_time));
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  const tasksTotal = inWeek.length;
  const tasksCompleted = inWeek.filter((i) => i.task_status === "listo").length;
  const completionRate = tasksTotal === 0 ? 0 : tasksCompleted / tasksTotal;

  const byCategory = CATEGORY_OPTIONS.map((category) => {
    const inCategory = inWeek.filter((i) => i.categories.includes(category));
    return { category, total: inCategory.length, completed: inCategory.filter((i) => i.task_status === "listo").length };
  }).filter((c) => c.total > 0);

  const byPriority = PRIORITIES.map((priority) => {
    const inPriority = inWeek.filter((i) => i.priority === priority);
    return { priority, total: inPriority.length, completed: inPriority.filter((i) => i.task_status === "listo").length };
  }).filter((p) => p.total > 0);

  const goalItemsInWeek = goalItems.filter((gi) => {
    if (!gi.completed || !gi.completed_at) return false;
    const { dateStr } = getLocalDate(tz, new Date(gi.completed_at));
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  const byGoal = goals
    .map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      completed: goalItemsInWeek.filter((gi) => gi.goal_id === goal.id).length,
    }))
    .filter((g) => g.completed > 0);

  return {
    weekStart,
    weekEnd,
    tasksTotal,
    tasksCompleted,
    completionRate,
    byCategory,
    byPriority,
    goalItemsCompleted: goalItemsInWeek.length,
    byGoal,
  };
}

const TZ = "America/Mexico_City";
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

// martes 2026-07-21 15:00 UTC = 09:00 local (America/Mexico_City)
const NOW = new Date("2026-07-21T15:00:00Z");

// 1) getWeekRange: la semana (lunes-domingo) que contiene el martes 21 debe
// ser 2026-07-20 (lunes) a 2026-07-26 (domingo).
check("getWeekRange semana actual", getWeekRange(TZ, NOW), { start: "2026-07-20", end: "2026-07-26" });

// 2) getWeekRange con weeksAgo=1 debe retroceder 7 días exactos.
check("getWeekRange semana pasada", getWeekRange(TZ, NOW, 1), { start: "2026-07-13", end: "2026-07-19" });

const items = [
  // Dentro de la semana, completada, categoría Trabajo, prioridad alta
  {
    start_time: "2026-07-21T15:00:00Z", // martes, dentro de la semana
    all_day: false,
    status: "confirmed",
    task_status: "listo",
    priority: "alta",
    categories: ["Trabajo"],
    recurrence_days: [],
  },
  // Dentro de la semana, no completada, categoría Personal, prioridad media
  {
    start_time: "2026-07-22T15:00:00Z",
    all_day: false,
    status: "confirmed",
    task_status: "en_curso",
    priority: "media",
    categories: ["Personal"],
    recurrence_days: [],
  },
  // Cancelada -> se excluye por completo
  {
    start_time: "2026-07-21T18:00:00Z",
    all_day: false,
    status: "cancelled",
    task_status: "sin_empezar",
    priority: "alta",
    categories: ["Trabajo"],
    recurrence_days: [],
  },
  // Todo el día -> se excluye
  {
    start_time: "2026-07-21T06:00:00Z",
    all_day: true,
    status: "confirmed",
    task_status: "listo",
    priority: null,
    categories: [],
    recurrence_days: [],
  },
  // Rutina recurrente -> se excluye (no hay completion por ocurrencia)
  {
    start_time: null,
    all_day: false,
    status: "confirmed",
    task_status: "en_curso",
    priority: null,
    categories: ["Trabajo"],
    recurrence_days: [1, 2, 3, 4, 5],
  },
  // Fuera de la semana (semana pasada)
  {
    start_time: "2026-07-10T15:00:00Z",
    all_day: false,
    status: "confirmed",
    task_status: "listo",
    priority: "baja",
    categories: ["Salud"],
    recurrence_days: [],
  },
];

const goals = [
  { id: "g1", title: "Leer más" },
  { id: "g2", title: "Ejercicio" },
];

const goalItems = [
  { goal_id: "g1", completed: true, completed_at: "2026-07-21T20:00:00Z" }, // dentro de la semana
  { goal_id: "g1", completed: true, completed_at: "2026-07-10T20:00:00Z" }, // semana pasada
  { goal_id: "g2", completed: false, completed_at: null }, // no completado
  { goal_id: "g2", completed: true, completed_at: "2026-07-23T20:00:00Z" }, // dentro de la semana
];

const report = computeWeeklyReport(items, goalItems, goals, TZ, "2026-07-20", "2026-07-26");

check("tasksTotal excluye cancelada/todo el día/rutina/fuera de semana", report.tasksTotal, 2);
check("tasksCompleted", report.tasksCompleted, 1);
check("completionRate", report.completionRate, 0.5);
check("byCategory solo incluye categorías con datos esta semana", report.byCategory, [
  { category: "Trabajo", total: 1, completed: 1 },
  { category: "Personal", total: 1, completed: 0 },
]);
check("byPriority solo incluye prioridades con datos esta semana", report.byPriority, [
  { priority: "alta", total: 1, completed: 1 },
  { priority: "media", total: 1, completed: 0 },
]);
check("goalItemsCompleted solo cuenta los de esta semana", report.goalItemsCompleted, 2);
check("byGoal desglosa por meta", report.byGoal, [
  { goalId: "g1", title: "Leer más", completed: 1 },
  { goalId: "g2", title: "Ejercicio", completed: 1 },
]);

// Semana sin ninguna tarea -> completionRate 0, no división por cero
const emptyReport = computeWeeklyReport([], [], goals, TZ, "2026-01-05", "2026-01-11");
check("semana vacía no divide por cero", emptyReport.completionRate, 0);
check("semana vacía no tiene categorías", emptyReport.byCategory, []);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
