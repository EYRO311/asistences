import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeWeeklyReport, getWeekRange, type WeeklyReport } from "@/lib/productivityReport";
import { PRIORITY_OPTIONS } from "@/lib/itemPresentation";
import type { Profile } from "@/lib/types";

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

export default async function ReportesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user!.id)
    .single<Pick<Profile, "timezone">>();
  const tz = profile?.timezone ?? "America/Mexico_City";

  const { data: items } = await supabase
    .from("items")
    .select("start_time, all_day, status, task_status, priority, categories, recurrence_days")
    .eq("user_id", user!.id);

  const { data: goals } = await supabase.from("goals").select("id, title").eq("user_id", user!.id);
  const goalIds = (goals ?? []).map((g) => g.id);

  const { data: goalItems } =
    goalIds.length > 0
      ? await supabase.from("goal_items").select("goal_id, completed, completed_at").in("goal_id", goalIds)
      : { data: [] };

  const thisWeek = getWeekRange(tz);
  const lastWeek = getWeekRange(tz, new Date(), 1);

  const current: WeeklyReport = computeWeeklyReport(
    items ?? [],
    goalItems ?? [],
    goals ?? [],
    tz,
    thisWeek.start,
    thisWeek.end
  );
  const previous: WeeklyReport = computeWeeklyReport(
    items ?? [],
    goalItems ?? [],
    goals ?? [],
    tz,
    lastWeek.start,
    lastWeek.end
  );

  const priorityLabel = (p: string) => PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-handwriting text-3xl">Resumen semanal</h1>
        <Link href="/" className="text-xs text-muted hover:text-foreground">
          ← Volver
        </Link>
      </div>
      <p className="text-sm text-muted mb-6">{weekLabel(current.weekStart, current.weekEnd)}</p>

      <section className="rounded-md border border-border-soft px-4 py-4 mb-6">
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
        <section className="rounded-md border border-border-soft px-4 py-4 mb-6 space-y-3">
          <p className="font-medium text-sm">Por categoría</p>
          {current.byCategory.map((c) => (
            <Bar key={c.category} label={c.category} total={c.total} completed={c.completed} />
          ))}
        </section>
      )}

      {current.byPriority.length > 0 && (
        <section className="rounded-md border border-border-soft px-4 py-4 mb-6 space-y-3">
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
    </main>
  );
}
