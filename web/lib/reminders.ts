// Fase 6 del plan de implementación: lógica pura para decidir si un item
// necesita un recordatorio push ahora mismo. Separada de la ruta que la usa
// (web/app/api/push/send-due/route.ts) para poder probarla sin red ni DB —
// ver web/scripts/verify-reminders.mjs.

export interface ReminderCandidate {
  start_time: string | null;
  all_day: boolean;
  recurrence_days: number[];
  recurrence_start_time: string | null;
  recurrence_end_time: string | null;
  last_reminder_date: string | null;
}

export interface LocalDateInfo {
  dateStr: string; // "YYYY-MM-DD" en la zona horaria dada
  minutesOfDay: number;
  isoWeekday: number; // 1=lunes ... 7=domingo
}

/**
 * Fecha/hora "de pared" de `from` en la zona `tz`, sin depender de la zona
 * horaria del servidor (Vercel corre en UTC) — mismo patrón que
 * web/app/page.tsx usa para "tiempo libre hoy".
 */
export function getLocalDateInfo(tz: string, from: Date = new Date()): LocalDateInfo {
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
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const minutesOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  // Mediodía UTC de esa fecha evita cualquier ambigüedad de DST al sacar el día de la semana.
  const isoWeekday = ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

  return { dateStr, minutesOfDay, isoWeekday };
}

/**
 * ¿Debe enviarse un recordatorio para este item ahora mismo? Cubre tareas
 * puntuales (start_time) y rutinas recurrentes (recurrence_days +
 * recurrence_start_time), y evita repetir el aviso el mismo día local del
 * usuario vía last_reminder_date.
 */
export function isReminderDue(
  item: ReminderCandidate,
  tz: string,
  windowMinutes: number,
  now: Date = new Date()
): boolean {
  if (item.all_day) return false;

  const { dateStr, minutesOfDay, isoWeekday } = getLocalDateInfo(tz, now);
  if (item.last_reminder_date === dateStr) return false;

  let occurrenceMinutes: number | null = null;

  const isRecurring =
    item.recurrence_days.length > 0 && Boolean(item.recurrence_start_time) && Boolean(item.recurrence_end_time);

  if (isRecurring) {
    if (item.recurrence_days.includes(isoWeekday)) {
      const [h, m] = item.recurrence_start_time!.split(":").map(Number);
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
