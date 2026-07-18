import { useEffect, useState } from "react";
import type { Category, Effort, Item, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  RECURRING_CATEGORIES,
  TASK_STATUS_OPTIONS,
  TYPE_BADGE_COLORS,
  TYPE_LABELS,
  WEEKDAY_OPTIONS,
} from "@/lib/itemPresentation";
import { nextOccurrence } from "@/lib/recurrence";
import { updateLocalItem, deleteLocalItem } from "@/db/items";
import { decryptClient, encryptClient } from "@/lib/crypto";
import { IconX } from "@tabler/icons-react";

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fixMidnightTime(time: string): string {
  return time === "00:00" ? "23:59" : time;
}

interface Props {
  item: Item;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditItemPage({ item, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(item.all_day);
  const [startTime, setStartTime] = useState(
    item.start_time ? toLocalInputValue(new Date(item.start_time)) : toLocalInputValue(new Date())
  );
  const [endTime, setEndTime] = useState(
    item.end_time ? toLocalInputValue(new Date(item.end_time)) : toLocalInputValue(new Date())
  );
  const [priority, setPriority] = useState<Priority | null>(item.priority);
  const [effort, setEffort] = useState<Effort | null>(item.effort);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(item.task_status);
  const [categories, setCategories] = useState<Category[]>(item.categories ?? []);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(item.recurrence_days ?? []);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState(item.recurrence_start_time ?? "09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState(item.recurrence_end_time ?? "18:00");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    decryptClient(item.description ?? null).then((v) => setDescription(v ?? ""));
    decryptClient(item.location ?? null).then((v) => setLocation(v ?? ""));
  }, [item.description, item.location]);

  function toggleCategory(c: Category) {
    setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function toggleDay(d: number) {
    setRecurrenceDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  const recurringCategory = RECURRING_CATEGORIES.find((c) => categories.includes(c));
  const showWorkSchedule = Boolean(recurringCategory);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);

    if (!showWorkSchedule && new Date(endTime) <= new Date(startTime)) {
      setError("La hora de fin debe ser posterior a la de inicio");
      return;
    }

    setLoading(true);

    try {
      const changes: Partial<Item> = {
        title: title.trim(),
        description: description.trim() ? await encryptClient(description.trim()) : null,
        location: location.trim() ? await encryptClient(location.trim()) : null,
        priority: priority ?? null,
        effort: effort ?? null,
        task_status: taskStatus,
        categories,
      };

      if (showWorkSchedule) {
        if (recurrenceDays.length === 0) {
          setError("Selecciona al menos un día para la rutina");
          setLoading(false);
          return;
        }
        const occ = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occ) throw new Error("Horario inválido");
        changes.recurrence_days = recurrenceDays;
        changes.recurrence_start_time = recurrenceStartTime;
        changes.recurrence_end_time = fixMidnightTime(recurrenceEndTime);
        changes.start_time = occ.start.toISOString();
        changes.end_time = occ.end.toISOString();
      } else {
        changes.all_day = allDay;
        changes.start_time = new Date(startTime).toISOString();
        changes.end_time = new Date(endTime).toISOString();
        if (item.recurrence_days?.length) {
          changes.recurrence_days = [];
          changes.recurrence_start_time = null;
          changes.recurrence_end_time = null;
        }
      }

      await updateLocalItem(item.id, changes);
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
      await deleteLocalItem(item.id);
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
        <h1 className="font-handwriting text-2xl">Editar tarea</h1>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1">
          <IconX size={20} aria-hidden />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Tipo (no editable) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Tipo</label>
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_BADGE_COLORS[item.type]}`}>
            {TYPE_LABELS[item.type]}
          </span>
          <p className="mt-1 text-[11px] text-muted">El tipo no se puede cambiar después de creada la tarea.</p>
        </div>

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
                  categories.includes(c) ? "border-foreground bg-foreground text-background" : "border-border-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Horario recurrente (si es rutina) o fechas */}
        {showWorkSchedule ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Días de {recurringCategory}
            </label>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {WEEKDAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleDay(opt.value)}
                  className={`h-9 w-9 rounded-full border text-xs font-medium transition-colors ${
                    recurrenceDays.includes(opt.value)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Inicio</label>
                <input
                  type="time"
                  value={recurrenceStartTime}
                  onChange={(e) => setRecurrenceStartTime(e.target.value)}
                  className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Fin</label>
                <input
                  type="time"
                  value={recurrenceEndTime}
                  onChange={(e) => setRecurrenceEndTime(e.target.value)}
                  className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-border-soft"
              />
              <span className="text-sm">Todo el día</span>
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Inicio</label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Fin</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Ubicación */}
        <div>
          <label htmlFor="loc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Ubicación
          </label>
          <input
            id="loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Calle, ciudad..."
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none"
          />
        </div>

        {/* Prioridad */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Prioridad</label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(priority === opt.value ? null : opt.value)}
                className={`flex-1 rounded-xl border py-2 text-sm transition-colors ${
                  priority === opt.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Esfuerzo */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Esfuerzo</label>
          <div className="flex gap-2">
            {EFFORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEffort(effort === opt.value ? null : opt.value)}
                className={`flex-1 rounded-xl border py-2 text-sm transition-colors ${
                  effort === opt.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Estado</label>
          <div className="flex gap-2">
            {TASK_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTaskStatus(opt.value)}
                className={`flex-1 rounded-xl border py-2 text-sm transition-colors ${
                  taskStatus === opt.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {(item.google_event_id || item.notion_page_id) && (
          <p className="text-xs text-muted">
            Los cambios se sincronizan localmente; la próxima vez que la app se conecte se reflejarán en
            {item.google_event_id ? " Google Calendar" : ""}
            {item.google_event_id && item.notion_page_id ? " y" : ""}
            {item.notion_page_id ? " Notion" : ""}.
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full rounded-xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-40"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>

        {/* Eliminar */}
        <div className="flex justify-end border-t border-border-soft pt-4">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-600 dark:text-red-400"
          >
            Eliminar tarea
          </button>
        </div>

        <div className="h-4" />
      </form>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-soft bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-handwriting text-2xl mb-2">¿Eliminar esta tarea?</h2>
            <p className="mb-4 text-sm text-muted">
              Esta acción no se puede deshacer.
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
