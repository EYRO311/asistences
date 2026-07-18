import type { Item, TaskStatus } from "@/lib/types";

/**
 * Estado esperado de una tarea según la hora actual, comparando contra su
 * start_time/end_time: "listo" si ya terminó, "en_curso" si ya empezó y no
 * ha terminado, "sin_empezar" si todavía no empieza. Devuelve null cuando no
 * aplica (sin fecha, o rutina recurrente — su start_time es solo la última
 * ocurrencia calculada, no "hoy", así que no se puede comparar así).
 */
export function computeAutoTaskStatus(
  item: Pick<Item, "start_time" | "end_time" | "recurrence_days">,
  now: Date
): TaskStatus | null {
  if (!item.start_time) return null;
  if (item.recurrence_days?.length) return null;

  const start = new Date(item.start_time);
  const end = item.end_time ? new Date(item.end_time) : new Date(start.getTime() + 60 * 60 * 1000);

  if (end.getTime() < now.getTime()) return "listo";
  if (start.getTime() <= now.getTime()) return "en_curso";
  return "sin_empezar";
}
