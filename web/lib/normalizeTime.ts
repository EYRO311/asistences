/**
 * Normaliza campos de tiempo para evitar que medianoche exacta (00:00:00 UTC)
 * sea rechazada por Supabase o Google Calendar, o cause ambigüedad de día.
 * Se aplica a end_time y due_date (no a start_time, donde medianoche es válida).
 */

/** ISO datetime "…T00:00:00.000Z" → "…T23:59:00.000Z" del mismo día UTC. */
export function fixMidnightISO(iso: string | null | undefined): string | null | undefined {
  if (!iso) return iso;
  const d = new Date(iso);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    d.setUTCHours(23, 59, 0, 0);
    return d.toISOString();
  }
  return iso;
}

/** Cadena de hora "00:00" → "23:59". Deja intactas las demás. */
export function fixMidnightTime(time: string | null | undefined): string | null | undefined {
  return time === "00:00" ? "23:59" : time;
}
