import type { FreeSlot } from "@/lib/types";

// Fase 8 del plan de implementación: sugerencia REACTIVA de conflictos de
// horario contra /api/calendar/free-slots (ya existe) — nunca mueve nada
// automáticamente, solo ofrece horarios libres cercanos para que el usuario
// decida. Lógica pura, sin red. ESPEJO de web/lib/conflictCheck.ts —
// mantener ambas copias idénticas si una cambia (probado allá con
// web/scripts/verify-conflict-check.mjs).

export interface ConflictSuggestion {
  start: string; // ISO
  end: string; // ISO
}

export interface ConflictResult {
  hasConflict: boolean;
  suggestions: ConflictSuggestion[];
}

/**
 * ¿El rango [start, end) propuesto cabe completo dentro de algún free_block
 * del día? Si no, junta hasta 3 huecos libres del mismo día con al menos la
 * duración solicitada, ordenados por cercanía al inicio propuesto.
 */
export function checkConflict(start: Date, end: Date, day: FreeSlot | undefined): ConflictResult {
  if (!day) return { hasConflict: false, suggestions: [] };
  if (day.free) return { hasConflict: false, suggestions: [] };

  const durationMs = end.getTime() - start.getTime();
  const blocks = day.free_blocks.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  const fits = blocks.some((b) => start >= b.start && end <= b.end);
  if (fits) return { hasConflict: false, suggestions: [] };

  const suggestions: ConflictSuggestion[] = blocks
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
