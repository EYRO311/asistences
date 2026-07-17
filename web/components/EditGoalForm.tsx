"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Goal, GoalRecurrence, GoalStatus } from "@/lib/types";
import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";
import { DeleteGoalButton } from "@/components/DeleteGoalButton";
import { sileo } from "sileo";

const GOAL_RECURRENCES: { value: GoalRecurrence; label: string }[] = [
  { value: "none", label: "Única" },
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
];

const GOAL_STATUSES: { value: GoalStatus; label: string }[] = [
  { value: "active", label: "Activa" },
  { value: "completed", label: "Completada" },
  { value: "archived", label: "Archivada" },
];

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function EditGoalForm({ goal }: { goal: Goal }) {
  const router = useRouter();

  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [recurrenceType, setRecurrenceType] = useState<GoalRecurrence>(goal.recurrence_type);
  const [dueDate, setDueDate] = useState(toDateInputValue(goal.due_date));
  const [categories, setCategories] = useState<Category[]>(goal.categories ?? []);
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [loading, setLoading] = useState(false);

  function toggleCategory(category: Category) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        title,
        description: description || undefined,
        recurrence_type: recurrenceType,
        categories,
        status,
      };
      payload.due_date = recurrenceType === "none" && dueDate ? new Date(dueDate).toISOString() : null;

      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : (data.error?.message ?? "No se pudo actualizar la meta"));

      sileo.success({ title: "Guardado", description: "Los cambios se guardaron correctamente." });
      router.push("/metas");
      router.refresh();
    } catch (err) {
      sileo.error({ title: "Error al guardar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="title">
          Título
        </label>
        <input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="description">
          Descripción <span className="text-muted font-normal">(opcional)</span>
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Frecuencia</label>
        <div className="grid grid-cols-4 gap-2">
          {GOAL_RECURRENCES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRecurrenceType(r.value)}
              className={`rounded-lg border px-2 py-2 text-sm text-center transition-colors ${
                recurrenceType === r.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-soft"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {recurrenceType === "none" && (
        <div>
          <label className="block text-sm font-medium mb-1">Fecha límite</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Categoría</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                categories.includes(c)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-soft"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Estado</label>
        <div className="flex gap-2">
          {GOAL_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={`flex-1 rounded-md border py-2 text-sm transition-colors ${
                status === s.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-soft"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-foreground text-background py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border-soft px-4 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>

      <div className="flex justify-end border-t border-border-soft pt-4">
        <DeleteGoalButton goalId={goal.id} />
      </div>
    </form>
  );
}
