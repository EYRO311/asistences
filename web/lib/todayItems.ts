import type { Item } from "@/lib/types";
import { wallToUTC } from "@/lib/freeSlots";

// Helpers timezone-aware para determinar qué items "ocurren hoy" para un
// usuario — incluye tanto items con start_time normal como rutinas
// recurrentes, cuyo start_time queda fijo en la última ocurrencia calculada
// y por lo tanto NO se puede filtrar con un simple rango de fechas en SQL.

export function todayString(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // "YYYY-MM-DD"
}

export function localDateStr(isoDate: string, tz: string): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone: tz });
}

export function todayISOWeekday(todayStr: string): number {
  // Parse the date string as local date to get weekday
  const [y, m, d] = todayStr.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function isTodayItem(item: Item, todayStr: string, weekday: number, tz: string): boolean {
  if (item.start_time && localDateStr(item.start_time, tz) === todayStr) return true;
  if (
    item.recurrence_days?.length &&
    item.recurrence_start_time &&
    item.recurrence_end_time &&
    item.start_time
  ) {
    const startStr = localDateStr(item.start_time, tz);
    if (startStr <= todayStr && item.recurrence_days.includes(weekday)) return true;
  }
  return false;
}

export function occurrenceToday(item: Item, todayStr: string, tz: string): Item {
  if (!item.recurrence_days?.length) return item;
  // wallToUTC (no new Date(y, m, d, h, m)) porque esto puede correr en un
  // Server Component en Vercel (UTC) — new Date(...) local hubiera tratado
  // "09:00" como 9am UTC en vez de 9am en la zona `tz` del usuario.
  const start = wallToUTC(todayStr, item.recurrence_start_time!, tz);
  const end = wallToUTC(todayStr, item.recurrence_end_time!, tz);
  return { ...item, start_time: start.toISOString(), end_time: end.toISOString() };
}

/**
 * true si `isoDate` cae en un día calendario ANTERIOR a hoy en la zona `tz`.
 * Se usa para no generar recomendaciones (clima/outfit) de tareas atrasadas
 * o importadas con fecha pasada — el pronóstico ya no aplica para ese día.
 */
export function isPastDay(isoDate: string, tz: string): boolean {
  return localDateStr(isoDate, tz) < todayString(tz);
}

/** Filtra y proyecta los items de `items` que ocurren hoy en la zona `tz`. */
export function getTodayItems(items: Item[], tz: string): Item[] {
  const todayStr = todayString(tz);
  const weekday = todayISOWeekday(todayStr);
  return items
    .filter((i) => isTodayItem(i, todayStr, weekday, tz))
    .map((i) => occurrenceToday(i, todayStr, tz));
}
