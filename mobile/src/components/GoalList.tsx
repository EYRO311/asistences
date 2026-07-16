import type { Goal, GoalRecurrence } from "@/lib/types";

export type GoalRow = Pick<Goal, "id" | "title" | "due_date" | "recurrence_type"> & {
  goal_items?: Array<{ id: string; completed: boolean }>;
};

const RECURRENCE_LABELS: Record<GoalRecurrence, string> = {
  none: "Única",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

const RECURRENCE_BADGE: Record<GoalRecurrence, string> = {
  none: "border-sky-400/60 text-sky-600 dark:text-sky-400",
  daily: "border-emerald-400/60 text-emerald-600 dark:text-emerald-400",
  weekly: "border-violet-400/60 text-violet-600 dark:text-violet-400",
  monthly: "border-amber-400/60 text-amber-600 dark:text-amber-400",
};

export function GoalList({ goals, emptyText = "Sin metas activas." }: { goals: GoalRow[]; emptyText?: string }) {
  if (goals.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {goals.map((goal) => {
        const items = goal.goal_items ?? [];
        const total = items.length;
        const done = items.filter((i) => i.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : null;
        const isComplete = total > 0 && done === total;

        return (
          <div
            key={goal.id}
            className={`rounded-xl border border-border-soft bg-surface px-3 py-2.5 ${isComplete ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${RECURRENCE_BADGE[goal.recurrence_type]}`}
              >
                {RECURRENCE_LABELS[goal.recurrence_type]}
              </span>
              <p className="text-sm font-medium truncate flex-1">{goal.title}</p>
              {total > 0 && (
                <span className="text-xs text-muted shrink-0 tabular-nums">
                  {done}/{total}
                </span>
              )}
            </div>
            {pct !== null && (
              <div className="mt-2 h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isComplete ? "bg-emerald-500" : "bg-foreground/40"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {goal.due_date && goal.recurrence_type === "none" && (
              <p className="text-[11px] text-muted mt-1.5">
                Límite:{" "}
                {new Date(goal.due_date).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
