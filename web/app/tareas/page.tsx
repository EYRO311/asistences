import { createClient } from "@/lib/supabase/server";
import { TareasView } from "@/components/TareasView";
import { GoalList, type GoalRow } from "@/components/GoalList";
import type { GoalRecurrence, Item } from "@/lib/types";

export default async function TareasPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  const all = (items ?? []) as Item[];

  const { data: goalsRaw } = await supabase
    .from("goals")
    .select("id, title, due_date, recurrence_type, goal_items(id, completed)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const GOAL_RECURRENCE_ORDER: GoalRecurrence[] = ["daily", "weekly", "monthly", "none"];
  const GOAL_SECTION_LABELS: Record<GoalRecurrence, string> = {
    daily: "Diarias",
    weekly: "Semanales",
    monthly: "Mensuales",
    none: "Únicas",
  };
  const allGoals = (goalsRaw ?? []) as GoalRow[];
  const goalGroups = GOAL_RECURRENCE_ORDER.map((rt) => ({
    rt,
    label: GOAL_SECTION_LABELS[rt],
    goals: allGoals.filter((g) => g.recurrence_type === rt),
  })).filter((g) => g.goals.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl px-4 py-8 space-y-3">
      <h1 className="font-handwriting text-3xl mb-3">Todas mis tareas</h1>

      {goalGroups.length > 0 && (
        <details open className="rounded-lg border border-border-soft">
          <summary className="cursor-pointer select-none px-4 py-3 font-handwriting text-2xl">
            Metas ({allGoals.length})
          </summary>
          <div className="px-4 pb-4 space-y-4">
            {goalGroups.map(({ rt, label, goals }) => (
              <div key={rt}>
                {goalGroups.length > 1 && (
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</p>
                )}
                <GoalList goals={goals} />
              </div>
            ))}
          </div>
        </details>
      )}

      <TareasView items={all} />
    </main>
  );
}
