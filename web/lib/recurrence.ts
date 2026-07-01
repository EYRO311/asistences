import type { Item } from "@/lib/types";
import { WEEKDAY_OPTIONS } from "@/lib/itemPresentation";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Si el item es recurrente (ej. "Trabajo") y `date` cae en uno de sus días
 * (en o después de su fecha de inicio), o si `date` es su fecha original,
 * devuelve una versión del item con `start_time`/`end_time` ajustados a ese
 * día. Si no aplica para esa fecha, devuelve null.
 */
export function occurrenceForDate(item: Item, date: Date): Item | null {
  if (item.start_time && isSameDay(new Date(item.start_time), date)) {
    return item;
  }

  if (
    item.recurrence_days.length > 0 &&
    item.recurrence_start_time &&
    item.recurrence_end_time &&
    item.start_time &&
    date >= startOfDay(new Date(item.start_time)) &&
    item.recurrence_days.includes(isoWeekday(date))
  ) {
    const [startHour, startMinute] = item.recurrence_start_time.split(":").map(Number);
    const [endHour, endMinute] = item.recurrence_end_time.split(":").map(Number);

    const start = new Date(date);
    start.setHours(startHour, startMinute, 0, 0);
    const end = new Date(date);
    end.setHours(endHour, endMinute, 0, 0);

    return { ...item, start_time: start.toISOString(), end_time: end.toISOString() };
  }

  return null;
}

/**
 * Encuentra la próxima fecha (desde `from`, inclusive) cuyo día ISO de la
 * semana (1=lunes..7=domingo) esté en `days`, y le aplica las horas dadas.
 * Se usa para anclar el primer evento de un horario recurrente (ej. trabajo).
 */
export function nextOccurrence(
  days: number[],
  startTime: string,
  endTime: string,
  from: Date = new Date()
): { start: Date; end: Date } | null {
  if (days.length === 0 || !startTime || !endTime) return null;

  const base = new Date(from);
  base.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + i);
    const isoWeekday = candidate.getDay() === 0 ? 7 : candidate.getDay();

    if (days.includes(isoWeekday)) {
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);

      const start = new Date(candidate);
      start.setHours(startHour, startMinute, 0, 0);

      const end = new Date(candidate);
      end.setHours(endHour, endMinute, 0, 0);

      return { start, end };
    }
  }

  return null;
}

/**
 * Texto legible del horario recurrente, ej. "Lun a Vie, 09:00-18:00",
 * para guardar en la columna "fechas" (texto) de Notion.
 */
export function formatRecurrenceSchedule(
  days: number[],
  startTime: string | null,
  endTime: string | null
): string | null {
  if (days.length === 0 || !startTime || !endTime) return null;

  const sorted = [...days].sort((a, b) => a - b);
  const labelOf = (day: number) => WEEKDAY_OPTIONS.find((o) => o.value === day)?.label ?? String(day);

  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const daysText =
    isContiguous && sorted.length > 1
      ? `${labelOf(sorted[0])} a ${labelOf(sorted[sorted.length - 1])}`
      : sorted.map(labelOf).join(", ");

  return `${daysText}, ${startTime}-${endTime}`;
}
