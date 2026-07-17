import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { GoalRecurrence } from "@/lib/types";
import { GoalList, type GoalRow } from "@/components/GoalList";
import { EditGoalPage } from "@/pages/EditGoalPage";
import { AppHeader } from "@/components/AppHeader";
import { IconPlus } from "@tabler/icons-react";

const RECURRENCE_ORDER: GoalRecurrence[] = ["daily", "weekly", "monthly", "none"];
const RECURRENCE_SECTION_LABELS: Record<GoalRecurrence, string> = {
  daily: "Diarias",
  weekly: "Semanales",
  monthly: "Mensuales",
  none: "Únicas",
};

interface Props {
  session: Session;
  onSettings: () => void;
  onNewGoal: () => void;
}

export function GoalsPage({ session, onSettings, onNewGoal }: Props) {
  const [goals, setGoals] = useState<(GoalRow & { status: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("goals")
      .select("id, title, due_date, recurrence_type, status, goal_items(id, completed)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true });
    if (err) { setError(err.message); return; }
    setGoals((data ?? []) as (GoalRow & { status: string })[]);
  }, [session.user.id]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const active = (goals ?? []).filter((g) => g.status === "active");
  const completed = (goals ?? []).filter((g) => g.status === "completed");

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
    <div className="px-4 pb-4">
      <AppHeader title="Mis metas" onSettings={onSettings} />

      <div className="flex items-center justify-between -mt-1 mb-3">
        <p className="text-sm text-muted">
          {totalActive > 0 ? `${totalDone}/${totalActive} completadas` : ""}
        </p>
        <button
          type="button"
          onClick={onNewGoal}
          className="flex items-center gap-1 rounded-full bg-foreground text-background px-3 py-1.5 text-sm font-medium"
        >
          <IconPlus size={16} stroke={2} aria-hidden />
          Meta
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {goals === null && !error && (
        <p className="text-sm text-muted">Cargando...</p>
      )}

      {goals !== null && grouped.length === 0 && completed.length === 0 && (
        <div className="rounded-2xl border border-border-soft bg-surface px-4 py-8 text-center">
          <p className="text-sm text-muted">No tienes metas activas.</p>
          <button
            type="button"
            onClick={onNewGoal}
            className="mt-2 text-sm underline text-muted hover:text-foreground"
          >
            Crear tu primera meta
          </button>
        </div>
      )}

      <div className="space-y-5">
        {grouped.map(({ recurrence, label, goals: sectionGoals }) => (
          <section key={recurrence}>
            <h2 className="font-medium text-sm text-muted uppercase tracking-wide mb-2">{label}</h2>
            <GoalList goals={sectionGoals} onSelect={(g) => setEditingGoalId(g.id)} />
          </section>
        ))}

        {completed.length > 0 && (
          <details className="rounded-xl border border-border-soft">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm text-muted">
              Completadas ({completed.length})
            </summary>
            <div className="px-4 pb-3">
              <GoalList goals={completed} onSelect={(g) => setEditingGoalId(g.id)} />
            </div>
          </details>
        )}
      </div>

      {editingGoalId && (
        <EditGoalPage
          goalId={editingGoalId}
          onClose={() => setEditingGoalId(null)}
          onSaved={() => { setEditingGoalId(null); loadGoals(); }}
          onDeleted={() => { setEditingGoalId(null); loadGoals(); }}
        />
      )}
    </div>
  );
}
