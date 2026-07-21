import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getDisplayTimezone } from "@/lib/timezone";
import { computeWeeklyReport, getWeekRange, type ReportGoal, type ReportGoalItem, type WeeklyReport } from "@/lib/productivityReport";
import { PRIORITY_OPTIONS } from "@/lib/itemPresentation";
import type { Item } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

interface Props {
  items: Item[];
  session: Session;
  onSettings: () => void;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function weekLabel(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [, em, ed] = weekEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(sy, em - 1, ed);
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function RateTrend({ current, previous }: { current: number; previous: number }) {
  const diff = Math.round((current - previous) * 100);
  if (diff === 0) return <span className="text-xs text-muted">Igual que la semana pasada</span>;
  const up = diff > 0;
  return (
    <span className={`text-xs ${up ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(diff)} pts vs. semana pasada
    </span>
  );
}

function CountTrend({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-muted">Igual que la semana pasada</span>;
  const up = diff > 0;
  return (
    <span className={`text-xs ${up ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(diff)} vs. semana pasada
    </span>
  );
}

function Bar({ label, total, completed }: { label: string; total: number; completed: number }) {
  const rate = total === 0 ? 0 : completed / total;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-muted">
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-border-soft overflow-hidden">
        <div className="h-full rounded-full bg-foreground" style={{ width: pct(rate) }} />
      </div>
    </div>
  );
}

export function ReportsPage({ items, session, onSettings }: Props) {
  const [current, setCurrent] = useState<WeeklyReport | null>(null);
  const [previous, setPrevious] = useState<WeeklyReport | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tz = getDisplayTimezone();

      const { data: goals } = await supabase.from("goals").select("id, title").eq("user_id", session.user.id);
      const goalIds = (goals ?? []).map((g) => g.id);

      const { data: goalItems } =
        goalIds.length > 0
          ? await supabase.from("goal_items").select("goal_id, completed, completed_at").in("goal_id", goalIds)
          : { data: [] };

      if (cancelled) return;

      const reportItems = items.map((i) => ({
        start_time: i.start_time,
        all_day: i.all_day,
        status: i.status,
        task_status: i.task_status,
        priority: i.priority,
        categories: i.categories,
        recurrence_days: i.recurrence_days,
      }));
      const reportGoals: ReportGoal[] = goals ?? [];
      const reportGoalItems: ReportGoalItem[] = goalItems ?? [];

      const thisWeek = getWeekRange(tz);
      const lastWeek = getWeekRange(tz, new Date(), 1);

      setCurrent(computeWeeklyReport(reportItems, reportGoalItems, reportGoals, tz, thisWeek.start, thisWeek.end));
      setPrevious(computeWeeklyReport(reportItems, reportGoalItems, reportGoals, tz, lastWeek.start, lastWeek.end));
    })();

    return () => {
      cancelled = true;
    };
  }, [items, session.user.id]);

  const priorityLabel = (p: string) => PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p;

  return (
    <div className="px-4 pb-4">
      <AppHeader title="Resumen semanal" onSettings={onSettings} />

      {!current || !previous ? (
        <p className="text-sm text-muted">Cargando...</p>
      ) : (
        <>
          <p className="text-sm text-muted -mt-2 mb-4">{weekLabel(current.weekStart, current.weekEnd)}</p>

          <section className="rounded-md border border-border-soft px-4 py-4 mb-4">
            <p className="text-sm text-muted mb-1">Tareas completadas</p>
            <div className="flex items-end gap-2">
              <p className="font-handwriting text-4xl">{pct(current.completionRate)}</p>
              <p className="text-sm text-muted mb-1">
                ({current.tasksCompleted}/{current.tasksTotal})
              </p>
            </div>
            <RateTrend current={current.completionRate} previous={previous.completionRate} />
          </section>

          {current.byCategory.length > 0 && (
            <section className="rounded-md border border-border-soft px-4 py-4 mb-4 space-y-3">
              <p className="font-medium text-sm">Por categoría</p>
              {current.byCategory.map((c) => (
                <Bar key={c.category} label={c.category} total={c.total} completed={c.completed} />
              ))}
            </section>
          )}

          {current.byPriority.length > 0 && (
            <section className="rounded-md border border-border-soft px-4 py-4 mb-4 space-y-3">
              <p className="font-medium text-sm">Por prioridad</p>
              {current.byPriority.map((p) => (
                <Bar key={p.priority} label={priorityLabel(p.priority)} total={p.total} completed={p.completed} />
              ))}
            </section>
          )}

          <section className="rounded-md border border-border-soft px-4 py-4 space-y-3">
            <p className="font-medium text-sm">Metas</p>
            <div className="flex items-end gap-2">
              <p className="font-handwriting text-3xl">{current.goalItemsCompleted}</p>
              <p className="text-sm text-muted mb-1">completados esta semana</p>
            </div>
            <CountTrend current={current.goalItemsCompleted} previous={previous.goalItemsCompleted} />
            {current.byGoal.length > 0 && (
              <div className="pt-2 border-t border-border-soft space-y-1.5">
                {current.byGoal.map((g) => (
                  <div key={g.goalId} className="flex items-center justify-between text-sm">
                    <span>{g.title}</span>
                    <span className="text-muted">{g.completed}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {current.tasksTotal === 0 && current.goalItemsCompleted === 0 && (
            <p className="text-sm text-muted text-center mt-8">
              Todavía no hay datos suficientes esta semana para mostrar un resumen.
            </p>
          )}
        </>
      )}
    </div>
  );
}
