#!/usr/bin/env node
// Fase 8 del plan de implementación: verifica checkConflict()
// (web/lib/conflictCheck.ts) — decide si un rango [start,end) propuesto cabe
// dentro de los huecos libres de un día, y arma sugerencias cercanas cuando
// no cabe. Nunca decide mover nada, solo calcula candidatos.
//
// Reimplementa aquí la misma lógica (sin tipos TS) para probarla sin
// depender del runtime de Next.js. Si el contrato cambia en el archivo real,
// este script debe actualizarse igual.
//
// Uso: node scripts/verify-conflict-check.mjs

function checkConflict(start, end, day) {
  if (!day) return { hasConflict: false, suggestions: [] };
  if (day.free) return { hasConflict: false, suggestions: [] };

  const durationMs = end.getTime() - start.getTime();
  const blocks = day.free_blocks.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  const fits = blocks.some((b) => start >= b.start && end <= b.end);
  if (fits) return { hasConflict: false, suggestions: [] };

  const suggestions = blocks
    .filter((b) => b.end.getTime() - b.start.getTime() >= durationMs)
    .map((b) => ({
      start: b.start,
      end: new Date(b.start.getTime() + durationMs),
      distance: Math.abs(b.start.getTime() - start.getTime()),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((c) => ({ start: c.start.toISOString(), end: c.end.toISOString() }));

  return { hasConflict: true, suggestions };
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

// Día con un hueco libre 11:00-16:00 (el resto ocupado)
const day = {
  date: "2026-07-21",
  free: false,
  free_blocks: [{ start: "2026-07-21T17:00:00.000Z", end: "2026-07-21T22:00:00.000Z" }], // 11:00-16:00 America/Mexico_City (UTC-6)
};

// 1) Propuesta que cabe completa dentro del hueco libre -> sin conflicto
check(
  "cabe dentro del hueco libre -> sin conflicto",
  checkConflict(new Date("2026-07-21T18:00:00.000Z"), new Date("2026-07-21T19:00:00.000Z"), day),
  { hasConflict: false, suggestions: [] }
);

// 2) Propuesta que empalma con lo ocupado (antes de las 11:00 local) -> conflicto, sugiere el hueco libre
check(
  "empalma con ocupado -> conflicto con sugerencia",
  checkConflict(new Date("2026-07-21T15:00:00.000Z"), new Date("2026-07-21T16:00:00.000Z"), day),
  {
    hasConflict: true,
    suggestions: [{ start: "2026-07-21T17:00:00.000Z", end: "2026-07-21T18:00:00.000Z" }],
  }
);

// 3) Día completamente libre -> nunca hay conflicto, sin llamar free_blocks
check(
  "día completamente libre -> sin conflicto",
  checkConflict(new Date("2026-07-21T15:00:00.000Z"), new Date("2026-07-21T16:00:00.000Z"), {
    date: "2026-07-21",
    free: true,
    free_blocks: [],
  }),
  { hasConflict: false, suggestions: [] }
);

// 4) Sin datos del día (undefined) -> no bloquea, sin conflicto
check("sin datos del día -> sin conflicto", checkConflict(new Date(), new Date(), undefined), {
  hasConflict: false,
  suggestions: [],
});

// 5) Duración solicitada más larga que cualquier hueco libre -> conflicto sin sugerencias
check(
  "ningún hueco alcanza la duración -> conflicto sin sugerencias",
  checkConflict(new Date("2026-07-21T15:00:00.000Z"), new Date("2026-07-21T21:30:00.000Z"), day),
  { hasConflict: true, suggestions: [] }
);

// 6) Dos huecos que alcanzan; se ordenan por cercanía al inicio propuesto
const twoBlocksDay = {
  date: "2026-07-21",
  free: false,
  free_blocks: [
    { start: "2026-07-21T21:00:00.000Z", end: "2026-07-21T23:00:00.000Z" }, // 15:00-17:00 local
    { start: "2026-07-21T17:00:00.000Z", end: "2026-07-21T19:00:00.000Z" }, // 11:00-13:00 local
  ],
};
check(
  "ordena sugerencias por cercanía, no por orden de llegada",
  checkConflict(new Date("2026-07-21T20:00:00.000Z"), new Date("2026-07-21T20:30:00.000Z"), twoBlocksDay),
  {
    hasConflict: true,
    suggestions: [
      { start: "2026-07-21T21:00:00.000Z", end: "2026-07-21T21:30:00.000Z" },
      { start: "2026-07-21T17:00:00.000Z", end: "2026-07-21T17:30:00.000Z" },
    ],
  }
);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
