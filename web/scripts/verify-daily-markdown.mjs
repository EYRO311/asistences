#!/usr/bin/env node
// Verifica formatDailyMarkdown() (web/lib/dailyMarkdown.ts) — checklist en
// markdown de las tareas de hoy para pegar en una nota diaria de Obsidian.
//
// Reimplementa aquí la misma lógica (sin tipos TS) para probarla sin
// depender del runtime de Next.js. Si el contrato cambia en el archivo real,
// este script debe actualizarse igual.
//
// Uso: node scripts/verify-daily-markdown.mjs

function formatTimeInTZ(iso, tz) {
  return new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
}

function toTag(category) {
  return `#${category.toLowerCase().replace(/\s+/g, "-")}`;
}

function formatDailyMarkdown(items, dateLabel, tz) {
  const lines = [`## Tareas — ${dateLabel}`, ""];

  if (items.length === 0) {
    lines.push("Sin tareas para hoy.");
    return lines.join("\n");
  }

  for (const item of items) {
    const checked = item.task_status === "listo" ? "x" : " ";
    const time = !item.all_day && item.start_time ? `${formatTimeInTZ(item.start_time, tz)} ` : "";
    const tags = item.categories.map(toTag).join(" ");
    lines.push(`- [${checked}] ${time}${item.title}${tags ? ` ${tags}` : ""}`);
  }

  return lines.join("\n");
}

const TZ = "America/Mexico_City";
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`OK   ${name}`);
    passed++;
  } else {
    console.log(`FAIL ${name}\n     esperado:\n${expected}\n     obtuvo:\n${actual}`);
    failed++;
  }
}

check("sin tareas", formatDailyMarkdown([], "lunes, 21 de julio", TZ), "## Tareas — lunes, 21 de julio\n\nSin tareas para hoy.");

check(
  "tarea con hora, categoría y pendiente",
  formatDailyMarkdown(
    [
      {
        title: "Junta de equipo",
        start_time: "2026-07-21T16:00:00.000Z", // 10:00 local
        all_day: false,
        task_status: "en_curso",
        categories: ["Trabajo"],
      },
    ],
    "martes, 21 de julio",
    TZ
  ),
  "## Tareas — martes, 21 de julio\n\n- [ ] 10:00 Junta de equipo #trabajo"
);

check(
  "tarea completada se marca [x]",
  formatDailyMarkdown(
    [
      {
        title: "Enviar reporte",
        start_time: "2026-07-21T20:00:00.000Z", // 14:00 local
        all_day: false,
        task_status: "listo",
        categories: [],
      },
    ],
    "martes, 21 de julio",
    TZ
  ),
  "## Tareas — martes, 21 de julio\n\n- [x] 14:00 Enviar reporte"
);

check(
  "tarea de todo el día no muestra hora",
  formatDailyMarkdown(
    [
      {
        title: "Cumpleaños de mamá",
        start_time: "2026-07-21T06:00:00.000Z",
        all_day: true,
        task_status: "sin_empezar",
        categories: ["Personal"],
      },
    ],
    "martes, 21 de julio",
    TZ
  ),
  "## Tareas — martes, 21 de julio\n\n- [ ] Cumpleaños de mamá #personal"
);

check(
  "categoría con espacio se convierte en tag sin espacios",
  formatDailyMarkdown(
    [
      {
        title: "Tarea de curso",
        start_time: null,
        all_day: true,
        task_status: "sin_empezar",
        categories: ["Cursos extras"],
      },
    ],
    "martes, 21 de julio",
    TZ
  ),
  "## Tareas — martes, 21 de julio\n\n- [ ] Tarea de curso #cursos-extras"
);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
