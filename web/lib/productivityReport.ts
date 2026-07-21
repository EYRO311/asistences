import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";
import type { Category, ItemStatus, Priority, TaskStatus } from "@/lib/types";

// Fase 7 del plan de implementación: resumen semanal de productividad usando
// solo datos que ya existen (items/goal_items) — sin nueva captura. Lógica
// pura, sin red ni DB, para poder probarla (ver
// web/scripts/verify-productivity-report.mjs) y para poder reusarla tal cual
// en mobile (mobile/src/lib/productivityReport.ts es un espejo — mantener
// ambas copias idénticas si este archivo cambia).

interface LocalDate {
  dateStr: string; // "YYYY-MM-DD" en la zona horaria dada
  isoWeekday: number; // 1=lunes ... 7=domingo
}

function getLocalDate(tz: string, from: Date): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(from)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const isoWeekday = ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return { dateStr, isoWeekday };
}

/**
 * Rango lunes-domingo (fechas "YYYY-MM-DD") de la semana que contiene `now`
 * en la zona `tz`. `weeksAgo` retrocede semanas completas (1 = semana pasada).
 */
export function getWeekRange(tz: string, now: Date = new Date(), weeksAgo = 0): { start: string; end: string } {
  const { dateStr, isoWeekday } = getLocalDate(tz, now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() - (isoWeekday - 1) - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

export interface ReportItem {
  start_time: string | null;
  all_day: boolean;
  status: ItemStatus;
  task_status: TaskStatus;
  priority: Priority | null;
  categories: Category[];
  recurrence_days: number[];
}

export interface ReportGoalItem {
  goal_id: string;
  completed: boolean;
  completed_at: string | null;
}

export interface ReportGoal {
  id: string;
  title: string;
}

export interface CategoryStat {
  category: Category;
  total: number;
  completed: number;
}

export interface PriorityStat {
  priority: Priority;
  total: number;
  completed: number;
}

export interface GoalStat {
  goalId: string;
  title: string;
  completed: number;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  tasksTotal: number;
  tasksCompleted: number;
  completionRate: number; // 0..1, 0 si tasksTotal es 0
  byCategory: CategoryStat[];
  byPriority: PriorityStat[];
  goalItemsCompleted: number;
  byGoal: GoalStat[];
}

const PRIORITIES: Priority[] = ["alta", "media", "baja"];

/**
 * Resumen semanal a partir de items y goal_items ya existentes. Las rutinas
 * recurrentes (recurrence_days no vacío) se excluyen del conteo de tareas
 * porque su task_status vive en una sola fila y no hay registro por
 * ocurrencia — no hay forma de saber, sin nueva captura, si se cumplieron
 * un día concreto de la semana.
 */
export function computeWeeklyReport(
  items: ReportItem[],
  goalItems: ReportGoalItem[],
  goals: ReportGoal[],
  tz: string,
  weekStart: string,
  weekEnd: string
): WeeklyReport {
  const inWeek = items.filter((item) => {
    if (item.all_day || item.status === "cancelled" || !item.start_time) return false;
    if (item.recurrence_days.length > 0) return false;
    const { dateStr } = getLocalDate(tz, new Date(item.start_time));
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  const tasksTotal = inWeek.length;
  const tasksCompleted = inWeek.filter((i) => i.task_status === "listo").length;
  const completionRate = tasksTotal === 0 ? 0 : tasksCompleted / tasksTotal;

  const byCategory: CategoryStat[] = CATEGORY_OPTIONS.map((category) => {
    const inCategory = inWeek.filter((i) => i.categories.includes(category));
    return {
      category,
      total: inCategory.length,
      completed: inCategory.filter((i) => i.task_status === "listo").length,
    };
  }).filter((c) => c.total > 0);

  const byPriority: PriorityStat[] = PRIORITIES.map((priority) => {
    const inPriority = inWeek.filter((i) => i.priority === priority);
    return {
      priority,
      total: inPriority.length,
      completed: inPriority.filter((i) => i.task_status === "listo").length,
    };
  }).filter((p) => p.total > 0);

  const goalItemsInWeek = goalItems.filter((gi) => {
    if (!gi.completed || !gi.completed_at) return false;
    const { dateStr } = getLocalDate(tz, new Date(gi.completed_at));
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  const byGoal: GoalStat[] = goals
    .map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      completed: goalItemsInWeek.filter((gi) => gi.goal_id === goal.id).length,
    }))
    .filter((g) => g.completed > 0);

  return {
    weekStart,
    weekEnd,
    tasksTotal,
    tasksCompleted,
    completionRate,
    byCategory,
    byPriority,
    goalItemsCompleted: goalItemsInWeek.length,
    byGoal,
  };
}
