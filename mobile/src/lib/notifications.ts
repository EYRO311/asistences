import { LocalNotifications } from "@capacitor/local-notifications";
import type { Item } from "@/lib/types";

// Equivalente mobile de web/components/NotificationSettings.tsx +
// web/lib/reminders.ts + web/app/api/push/send-due/route.ts: en vez de Web
// Push (necesita servidor + suscripción por navegador), mobile programa
// notificaciones LOCALES con @capacitor/local-notifications — funciona
// offline y no depende de que el usuario tenga la app abierta ni de un cron.
// Se reprograma todo desde cero cada vez que cambian los items o las
// preferencias, así siempre queda en sync con el estado real.

export const REMINDER_OPTIONS = [5, 10, 15, 30, 60];

export interface ReminderSettings {
  enabled: boolean;
  minutesBefore: number;
}

// Namespace de IDs: todas las notificaciones que programa la app caen en
// este rango, así se pueden cancelar en bloque sin tocar notificaciones de
// otras features futuras (getPending() + cancel() filtrado por rango).
function hashId(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(h) % 1_000_000; // cabe en un int32 con margen
}

export async function canScheduleNotifications(): Promise<boolean> {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display === "granted";
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions();
  return display === "granted";
}

// Resta minutos a un HH:mm y devuelve { hour, minute, dayShift } — dayShift
// es -1 si el resultado cruzó medianoche hacia atrás (relevante para rutinas,
// donde hay que correr el día de la semana del aviso).
function subtractMinutes(hhmm: string, minutes: number): { hour: number; minute: number; dayShift: number } {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m - minutes;
  const dayShift = total < 0 ? -1 : 0;
  const normalized = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(normalized / 60), minute: normalized % 60, dayShift };
}

export async function rescheduleReminders(items: Item[], settings: ReminderSettings): Promise<void> {
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) }).catch(() => {});
  }

  if (!settings.enabled) return;
  if (!(await canScheduleNotifications())) return;

  const notifications: {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date } | { on: { weekday: number; hour: number; minute: number } };
  }[] = [];

  const now = new Date();

  for (const item of items) {
    if (item.all_day || item.status === "cancelled") continue;

    const isRecurring = item.recurrence_days.length > 0 && Boolean(item.recurrence_start_time);

    if (isRecurring) {
      const { hour, minute, dayShift } = subtractMinutes(item.recurrence_start_time!, settings.minutesBefore);
      for (const weekday of item.recurrence_days) {
        // recurrence_days: 1=lunes...7=domingo → Capacitor/JS: 1=domingo...7=sábado
        const jsWeekday = weekday === 7 ? 1 : weekday + 1;
        const shiftedWeekday = ((jsWeekday - 1 + dayShift + 7) % 7) + 1;
        notifications.push({
          id: hashId(`${item.id}:${weekday}`),
          title: item.title,
          body: `Empieza a las ${item.recurrence_start_time}`,
          schedule: { on: { weekday: shiftedWeekday, hour, minute } },
        });
      }
      continue;
    }

    if (!item.start_time) continue;
    const start = new Date(item.start_time);
    const triggerAt = new Date(start.getTime() - settings.minutesBefore * 60_000);
    if (triggerAt <= now) continue;

    notifications.push({
      id: hashId(item.id),
      title: item.title,
      body: `Empieza a las ${start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
      schedule: { at: triggerAt },
    });
  }

  if (notifications.length === 0) return;
  await LocalNotifications.schedule({ notifications }).catch((err) => {
    console.error("No se pudieron programar los recordatorios:", err);
  });
}
