import { useEffect, useState } from "react";
import type { Category, GoalRecurrence, GoalStatus } from "@/lib/types";
import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";
import { supabase } from "@/lib/supabase";
import { decryptClient, encryptClient } from "@/lib/crypto";
import { Network } from "@capacitor/network";
import { IconX } from "@tabler/icons-react";

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

interface Props {
  goalId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditGoalPage({ goalId, onClose, onSaved, onDeleted }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<GoalRecurrence>("none");
  const [dueDate, setDueDate] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<GoalStatus>("active");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("goals").select("*").eq("id", goalId).single();
      if (cancelled || !data) return;
      setTitle(data.title ?? "");
      setDescription((await decryptClient(data.description)) ?? "");
      setRecurrenceType(data.recurrence_type);
      setDueDate(toDateInputValue(data.due_date));
      setCategories(data.categories ?? []);
      setStatus(data.status);
      setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [goalId]);

  function toggleCategory(c: Category) {
    setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const networkStatus = await Network.getStatus();
      if (!networkStatus.connected) {
        throw new Error("Necesitas conexión a internet para editar una meta");
      }

      const { error: updateError } = await supabase
        .from("goals")
        .update({
          title: title.trim(),
          description: description.trim() ? await encryptClient(description.trim()) : null,
          due_date: recurrenceType === "none" && dueDate ? new Date(dueDate).toISOString() : null,
          recurrence_type: recurrenceType,
          categories,
          status,
        })
        .eq("id", goalId);
      if (updateError) throw new Error(updateError.message);

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const networkStatus = await Network.getStatus();
      if (!networkStatus.connected) {
        setError("Necesitas conexión a internet para eliminar una meta");
        setDeleting(false);
        return;
      }
      await supabase.from("goals").delete().eq("id", goalId);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-4 border-b border-border-soft shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      >
        <h1 className="font-handwriting text-2xl">Editar meta</h1>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1">
          <IconX size={20} aria-hidden />
        </button>
      </div>

      {!loaded ? (
        <p className="px-4 py-4 text-sm text-muted">Cargando...</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Título */}
          <div>
            <label htmlFor="title" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Título *
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* Descripción */}
          <div>
            <label htmlFor="desc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Descripción
            </label>
            <textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
            />
          </div>

          {/* Frecuencia */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Frecuencia</label>
            <div className="grid grid-cols-4 gap-2">
              {GOAL_RECURRENCES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrenceType(opt.value)}
                  className={`rounded-xl border py-2 text-xs text-center transition-colors ${
                    recurrenceType === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha límite */}
          {recurrenceType === "none" && (
            <div>
              <label htmlFor="due" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Fecha límite
              </label>
              <input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm"
              />
            </div>
          )}

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
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

          {/* Estado */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Estado</label>
            <div className="flex gap-2">
              {GOAL_STATUSES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 rounded-xl border py-2 text-sm transition-colors ${
                    status === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full rounded-xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-40"
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>

          <div className="flex justify-end border-t border-border-soft pt-4">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-600 dark:text-red-400"
            >
              Eliminar meta
            </button>
          </div>

          <div className="h-4" />
        </form>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-soft bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-handwriting text-2xl mb-2">¿Eliminar esta meta?</h2>
            <p className="mb-4 text-sm text-muted">
              Se borrará también su checklist. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-xl border border-border-soft px-4 py-2.5 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
