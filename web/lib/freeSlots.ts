// Puerto directo del algoritmo que antes vivía en calendar-service/freebusy/services.py.

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface DayFreeSlot {
  date: string; // YYYY-MM-DD en hora local del usuario
  free: boolean;
  free_blocks: { start: string; end: string }[];
}

/** Devuelve la fecha local "YYYY-MM-DD" para un instante UTC en la zona dada. */
function toLocalDateStr(utcDate: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(utcDate);
}

/** Día ISO (1=lun … 7=dom) de una cadena "YYYY-MM-DD". */
function isoWeekday(dateStr: string): number {
  const jsDay = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Convierte una hora de pared local (ej. "06:00" en "America/Mexico_City"
 * el día "2026-06-30") al Date UTC correspondiente.
 *
 * Técnica: crea un Date "naïve" (la hora local como si fuera UTC), pregunta
 * al formateador qué hora local representa ese UTC en la zona objetivo y
 * corrige la diferencia.  Funciona correctamente para horas dentro del día
 * estándar y es inmune a la mayoría de las transiciones de horario de verano
 * porque la corrección se calcula en el mismo instante en que se aplica.
 */
function wallToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const naive = new Date(
    Date.UTC(
      +dateStr.slice(0, 4),
      +dateStr.slice(5, 7) - 1,
      +dateStr.slice(8, 10),
      h,
      m,
      0
    )
  );

  const localStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(naive);

  const [lh, lm] = localStr.split(":").map(Number);
  const diffMs = ((h * 60 + m) - (lh * 60 + lm)) * 60_000;
  return new Date(naive.getTime() + diffMs);
}

/** Resta los intervalos ocupados de [windowStart, windowEnd] y devuelve los libres. */
function subtractBusy(
  windowStart: Date,
  windowEnd: Date,
  busyIntervals: BusyInterval[]
): BusyInterval[] {
  const overlapping = busyIntervals
    .filter((b) => b.start < windowEnd && b.end > windowStart)
    .map((b) => ({
      start: new Date(Math.max(b.start.getTime(), windowStart.getTime())),
      end: new Date(Math.min(b.end.getTime(), windowEnd.getTime())),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const free: BusyInterval[] = [];
  let cursor = windowStart;

  for (const { start, end } of overlapping) {
    if (start > cursor) free.push({ start: cursor, end: start });
    if (end > cursor) cursor = end;
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  return free;
}

/**
 * Calcula, día a día entre timeMin y timeMax, los bloques de tiempo libre
 * dentro del horario laboral indicado, restando los intervalos ocupados.
 *
 * workingHoursByWeekday: {"1": {start:"06:00", end:"23:59"}, ...}  (1=lun…7=dom)
 */
export function computeFreeSlots(
  busyIntervals: BusyInterval[],
  timeMin: Date,
  timeMax: Date,
  tzName: string,
  workingHoursByWeekday: Record<string, { start: string; end: string }>
): DayFreeSlot[] {
  const defaultHours = { start: "06:00", end: "23:59" };
  const days: DayFreeSlot[] = [];

  let curDateStr = toLocalDateStr(timeMin, tzName);
  // time_max es límite exclusivo: el último día es el que contiene (time_max - 1 ms)
  const lastDateStr = toLocalDateStr(new Date(timeMax.getTime() - 1), tzName);

  while (curDateStr <= lastDateStr) {
    const weekday = isoWeekday(curDateStr);
    const hours = workingHoursByWeekday[String(weekday)] ?? defaultHours;

    const dayStart = wallToUTC(curDateStr, hours.start, tzName);
    const dayEnd = wallToUTC(curDateStr, hours.end, tzName);

    const freeBlocks = subtractBusy(dayStart, dayEnd, busyIntervals);
    const totalMs = dayEnd.getTime() - dayStart.getTime();
    const freeMs = freeBlocks.reduce(
      (s, b) => s + b.end.getTime() - b.start.getTime(),
      0
    );

    days.push({
      date: curDateStr,
      free: freeMs >= totalMs,
      free_blocks: freeBlocks.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
      })),
    });

    // Avanzar al siguiente día local usando el mediodía UTC como referencia
    const ref = new Date(curDateStr + "T12:00:00Z");
    ref.setUTCDate(ref.getUTCDate() + 1);
    curDateStr = toLocalDateStr(ref, tzName);
  }

  return days;
}
