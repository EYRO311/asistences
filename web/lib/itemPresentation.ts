import type { Category, Effort, Item, ItemType, PreferredTransport, Priority, TaskStatus } from "@/lib/types";
import { IconCar, IconBike, IconBus, IconWalk } from "@tabler/icons-react";
import type { FC, CSSProperties } from "react";

export type TablerIcon = FC<{
  size?: number | string;
  stroke?: number | string;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export const TYPE_LABELS: Record<ItemType, string> = {
  compromiso: "Compromiso",
  personal: "Personal",
  evento: "Evento",
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

export const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "pequeno", label: "Pequeño" },
  { value: "media", label: "Media" },
  { value: "grande", label: "Grande" },
];

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "sin_empezar", label: "Sin empezar" },
  { value: "en_curso", label: "En curso" },
  { value: "listo", label: "Listo" },
];

export const TRANSPORT_OPTIONS: { value: PreferredTransport; label: string; Icon: TablerIcon }[] = [
  { value: "car", label: "Auto", Icon: IconCar as TablerIcon },
  { value: "bike", label: "Bici", Icon: IconBike as TablerIcon },
  { value: "public_transport", label: "Transporte público", Icon: IconBus as TablerIcon },
  { value: "walking", label: "A pie", Icon: IconWalk as TablerIcon },
];

export const CATEGORY_OPTIONS: Category[] = [
  "Trabajo",
  "Escuela",
  "Cursos extras",
  "Personal",
  "Salud",
  "Hogar",
  "Otro",
];

// Categorías que activan el panel de horario recurrente (días + hora).
export const RECURRING_CATEGORIES: Category[] = ["Trabajo", "Escuela", "Cursos extras"];

// Tag correspondiente en la columna "rutina" (multi_select) de Notion.
export const RECURRING_CATEGORY_NOTION_TAG: Record<string, string> = {
  Trabajo: "trabajo",
  Escuela: "escuela",
  "Cursos extras": "curso",
};

// 1=lunes ... 7=domingo (ISO weekday), consistente con el resto de la app.
export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

// Para construir la regla de recurrencia (RRULE) de Google Calendar.
export const WEEKDAY_RRULE_CODES: Record<number, string> = {
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
  7: "SU",
};

// Etiquetas exactas usadas en las propiedades "select"/"status" de Notion.
export const PRIORITY_NOTION_LABELS: Record<Priority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const EFFORT_NOTION_LABELS: Record<Effort, string> = {
  pequeno: "Pequeño",
  media: "Media",
  grande: "Grande",
};

export const TASK_STATUS_NOTION_LABELS: Record<TaskStatus, string> = {
  sin_empezar: "Sin empezar",
  en_curso: "En curso",
  listo: "Listo",
};

// Inversos: de la etiqueta de Notion a nuestro valor interno (para importar
// páginas creadas/editadas directo en Notion).
export const PRIORITY_FROM_NOTION_LABEL: Record<string, Priority> = {
  Alta: "alta",
  Media: "media",
  Baja: "baja",
};

export const EFFORT_FROM_NOTION_LABEL: Record<string, Effort> = {
  Pequeño: "pequeno",
  Media: "media",
  Grande: "grande",
};

export const TASK_STATUS_FROM_NOTION_LABEL: Record<string, TaskStatus> = {
  "Sin empezar": "sin_empezar",
  "En curso": "en_curso",
  Listo: "listo",
};

// Claro: pastel (rosa / marrón / lavanda). Oscuro: "eléctrico" sobre fondo negro (rojo / azul / morado).
export const TYPE_BADGE_COLORS: Record<ItemType, string> = {
  compromiso: "bg-pink-100 text-pink-800 dark:bg-red-500/15 dark:text-red-400 dark:ring-1 dark:ring-red-500/60",
  personal: "bg-stone-200 text-stone-800 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-1 dark:ring-blue-500/60",
  evento: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-1 dark:ring-purple-500/60",
};

export const TYPE_NOTE_COLORS: Record<ItemType, string> = {
  compromiso:
    "bg-pink-100 border-pink-300 text-pink-900 dark:bg-red-500/10 dark:border-red-500 dark:text-red-300 dark:shadow-[0_0_10px_-2px_rgba(239,68,68,0.7)]",
  personal:
    "bg-stone-200 border-stone-400 text-stone-900 dark:bg-blue-500/10 dark:border-blue-500 dark:text-blue-300 dark:shadow-[0_0_10px_-2px_rgba(59,130,246,0.7)]",
  evento:
    "bg-purple-100 border-purple-300 text-purple-900 dark:bg-purple-500/10 dark:border-purple-500 dark:text-purple-300 dark:shadow-[0_0_10px_-2px_rgba(168,85,247,0.7)]",
};

// Día libre en "Disponibilidad de la semana": teal pastel (claro) / cian eléctrico con brillo (oscuro).
export const FREE_DAY_CARD_COLORS =
  "border-teal-300 bg-teal-50 dark:border-cyan-500 dark:bg-cyan-500/10 dark:shadow-[0_0_10px_-2px_rgba(34,211,238,0.7)]";
export const FREE_DAY_TEXT_COLORS = "text-teal-700 dark:text-cyan-300";
export const FREE_DAY_DOT_COLOR = "bg-teal-500 dark:bg-cyan-400";

// Bloques ocupados dentro del día: rosa/rojo, en contraste con el libre (teal/cian).
export const BUSY_TEXT_COLORS = "text-rose-700 dark:text-red-400";
export const BUSY_DOT_COLOR = "bg-rose-500 dark:bg-red-500";

export const TYPE_DOT_COLORS: Record<ItemType, string> = {
  compromiso: "bg-pink-400 dark:bg-red-500",
  personal: "bg-stone-500 dark:bg-blue-500",
  evento: "bg-purple-400 dark:bg-purple-500",
};

export const STATUS_LABELS: Record<Item["status"], string> = {
  draft: "Borrador",
  syncing: "Sincronizando",
  confirmed: "Confirmado",
  failed: "Error de sincronización",
  cancelled: "Cancelado",
};

export function formatTimeRange(item: Item): string {
  if (!item.start_time) return "Sin fecha";
  if (item.all_day) return "Todo el día";

  const start = new Date(item.start_time);
  const timeFormatter = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

  if (!item.end_time) return timeFormatter.format(start);

  const end = new Date(item.end_time);
  return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

export function formatDateRange(item: Item): string {
  // Rutinas recurrentes: mostrar el horario semanal ("Lun a Vie, 09:00–18:00")
  if (item.recurrence_days?.length && item.recurrence_start_time && item.recurrence_end_time) {
    const sorted = [...item.recurrence_days].sort((a, b) => a - b);
    const labelOf = (d: number) => WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? String(d);
    const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    const daysText =
      isContiguous && sorted.length > 1
        ? `${labelOf(sorted[0])} a ${labelOf(sorted[sorted.length - 1])}`
        : sorted.map(labelOf).join(", ");
    return `${daysText}, ${item.recurrence_start_time}–${item.recurrence_end_time}`;
  }

  if (!item.start_time) return "Sin fecha";

  const start = new Date(item.start_time);
  const formatter = new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: item.all_day ? undefined : "2-digit",
    minute: item.all_day ? undefined : "2-digit",
  });

  if (!item.end_time) return formatter.format(start);

  const end = new Date(item.end_time);
  return `${formatter.format(start)} - ${new Intl.DateTimeFormat("es-MX", {
    hour: item.all_day ? undefined : "2-digit",
    minute: item.all_day ? undefined : "2-digit",
  }).format(end)}`;
}
