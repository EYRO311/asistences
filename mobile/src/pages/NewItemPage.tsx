import { useState } from "react";
import type { Category, Effort, ItemType, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  RECURRING_CATEGORIES,
  TASK_STATUS_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@/lib/itemPresentation";
import { nextOccurrence } from "@/lib/recurrence";
import { createLocalItem } from "@/db/items";
import { supabase } from "@/lib/supabase";
import { Network } from "@capacitor/network";
import { IconX } from "@tabler/icons-react";

const TYPE_OPTIONS: { value: ItemType; label: string; defaultCalendar: boolean }[] = [
  { value: "compromiso", label: "Compromiso", defaultCalendar: true },
  { value: "personal", label: "Personal", defaultCalendar: false },
  { value: "evento", label: "Evento", defaultCalendar: true },
];

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  userId: string;
}

export function NewItemPage({ onClose, onCreated, userId }: Props) {
  const [type, setType] = useState<ItemType>("compromiso");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const [startTime, setStartTime] = useState(toLocalInputValue(now));
  const [endTime, setEndTime] = useState(toLocalInputValue(inOneHour));
  const [dueDate, setDueDate] = useState("");

  const [priority, setPriority] = useState<Priority | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("sin_empezar");
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState("09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState("18:00");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);

    try {
      let startISO: string | undefined;
      let endISO: string | undefined;
      let recDays: number[] | undefined;
      let recStart: string | undefined;
      let recEnd: string | undefined;

      if (showWorkSchedule && recurrenceDays.length > 0) {
        const occ = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occ) throw new Error("Horario inválido");
        startISO = occ.start.toISOString();
        endISO = occ.end.toISOString();
        recDays = recurrenceDays;
        recStart = recurrenceStartTime;
        recEnd = recurrenceEndTime;
      } else {
        startISO = new Date(startTime).toISOString();
        endISO = new Date(endTime).toISOString();
      }

      const itemData = {
        user_id: userId,
        type,
        title: title.trim(),
        description: description.trim() || null,
        start_time: startISO ?? null,
        end_time: endISO ?? null,
        all_day: allDay,
        add_to_calendar: type !== "personal",
        status: "draft" as const,
        google_event_id: null,
        notion_page_id: null,
        notion_url: null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority: priority ?? null,
        effort: effort ?? null,
        task_status: taskStatus,
        categories,
        outfit_suggestion: null,
        location: location.trim() || null,
        source: "app" as const,
        cached_recommendation: null,
        meet_link: null,
        recurrence_days: recDays ?? [],
        recurrence_start_time: recStart ?? null,
        recurrence_end_time: recEnd ?? null,
      };

      // Always save locally first
      const newItem = await createLocalItem(itemData);

      // If online, also push to Supabase immediately
      const networkStatus = await Network.getStatus();
      if (networkStatus.connected) {
        await supabase.from("items").upsert({ ...newItem });
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la tarea");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft shrink-0">
        <h1 className="font-handwriting text-2xl">Nueva tarea</h1>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1">
          <IconX size={20} aria-hidden />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Tipo */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Tipo</label>
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`flex-1 rounded-xl border py-2 text-sm transition-colors ${
                  type === opt.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            placeholder="¿Qué tienes?"
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
            placeholder="Detalles..."
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
          />
        </div>

        {/* Categorías */}
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

        {/* Horario recurrente (si es rutina) */}
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
            {/* Todo el día */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-border-soft"
              />
              <span className="text-sm">Todo el día</span>
            </label>

            {/* Fechas */}
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

        {/* Fecha límite */}
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
                  priority === opt.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft"
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
                  effort === opt.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft"
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
                  taskStatus === opt.value
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

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full rounded-xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-40"
        >
          {loading ? "Guardando..." : "Crear tarea"}
        </button>

        <div className="h-4" />
      </form>
    </div>
  );
}
