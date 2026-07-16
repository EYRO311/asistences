import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { GoalList, type GoalRow } from "@/components/GoalList";
import type { GoalRecurrence } from "@/lib/types";

const RECURRENCE_ORDER: GoalRecurrence[] = ["daily", "weekly", "monthly", "none"];
const RECURRENCE_SECTION_LABELS: Record<GoalRecurrence, string> = {
  daily: "Diarias",
  weekly: "Semanales",
  monthly: "Mensuales",
  none: "Únicas",
};

export default async function MetasPage() {
  const supabase = await createClient();

  const { data: goalsRaw } = await supabase
    .from("goals")
    .select("id, title, due_date, recurrence_type, status, goal_items(id, completed)")
    .order("created_at", { ascending: true });

  const all = (goalsRaw ?? []) as (GoalRow & { status: string })[];
  const active = all.filter((g) => g.status === "active");
  const completed = all.filter((g) => g.status === "completed");

  // Group active goals by recurrence type
  const grouped = RECURRENCE_ORDER.map((rt) => ({
    recurrence: rt,
    label: RECURRENCE_SECTION_LABELS[rt],
    goals: active.filter((g) => g.recurrence_type === rt),
  })).filter((g) => g.goals.length > 0);

  const totalActive = active.length;
  const totalDone = active.filter(
    (g) => g.goal_items?.length && g.goal_items.every((i) => i.completed)
  ).length;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-handwriting text-3xl">Mis metas</h1>
          {totalActive > 0 && (
            <p className="text-sm text-muted mt-0.5">
              {totalDone}/{totalActive} completadas esta semana
            </p>
          )}
        </div>
        <Link
          href="/new?mode=meta"
          className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium"
        >
          + Nueva meta
        </Link>
      </div>

      {grouped.length === 0 && completed.length === 0 && (
        <div className="rounded-xl border border-border-soft bg-surface px-4 py-8 text-center">
          <p className="text-sm text-muted">No tienes metas activas.</p>
          <Link
            href="/new?mode=meta"
            className="mt-2 inline-block text-sm underline hover:text-foreground text-muted"
          >
            Crear tu primera meta
          </Link>
        </div>
      )}

      {grouped.map(({ recurrence, label, goals }) => (
        <section key={recurrence}>
          <h2 className="font-medium text-sm text-muted uppercase tracking-wide mb-2">{label}</h2>
          <GoalList goals={goals} />
        </section>
      ))}

      {completed.length > 0 && (
        <details className="rounded-lg border border-border-soft">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm text-muted">
            Completadas ({completed.length})
          </summary>
          <div className="px-4 pb-3">
            <GoalList goals={completed} />
          </div>
        </details>
      )}
    </main>
  );
}
