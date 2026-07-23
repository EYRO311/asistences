import { useState } from "react";
import type { Category, Effort, GoalRecurrence, ItemType, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  WEEKDAY_OPTIONS,
  deriveTypeFromCategories,
} from "@/lib/itemPresentation";
import { nextOccurrence } from "@/lib/recurrence";
import { createLocalItem, updateLocalItem } from "@/db/items";
import { supabase } from "@/lib/supabase";
import { syncItemExternal } from "@/lib/sync";
import { encryptClient } from "@/lib/crypto";
import { Network } from "@capacitor/network";
import { IconX } from "@tabler/icons-react";
import { ConflictWarning } from "@/components/ConflictWarning";

// Categorías de meta no incluyen "Evento" (solo aplica a tareas)
const GOAL_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((c) => c !== "Evento");

type FormMode = "rapida" | "completa";

type CreationMode = "tarea" | "meta" | "rutina";

const MODE_OPTIONS: { value: CreationMode; label: string }[] = [
  { value: "tarea", label: "Tarea" },
  { value: "meta", label: "Meta" },
  { value: "rutina", label: "Rutina" },
];

const GOAL_RECURRENCE_OPTIONS: { value: GoalRecurrence; label: string }[] = [
  { value: "none", label: "Única" },
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
];

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fixMidnightISO(iso: string | undefined): string | undefined {
  if (!iso) return iso;
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    d.setUTCHours(23, 59, 0, 0);
    return d.toISOString();
  }
  return iso;
}

function fixMidnightTime(time: string): string {
  return time === "00:00" ? "23:59" : time;
}

interface Props {
  onClose: () => void;
  onCreated: (mode: CreationMode) => void;
  userId: string;
  initialMode?: CreationMode;
  lockMode?: boolean;
}

export function NewItemPage({ onClose, onCreated, userId, initialMode = "tarea", lockMode = false }: Props) {
  const [mode, setMode] = useState<CreationMode>(initialMode);
  const [formMode, setFormMode] = useState<FormMode>("rapida");
  const [goalRecurrence, setGoalRecurrence] = useState<GoalRecurrence>("none");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const now = new Date();
  const [startTime, setStartTime] = useState(toLocalInputValue(now));
  const [dueDate, setDueDate] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  // El tipo (compromiso/personal/evento) ya no se elige a mano: se deriva de
  // la categoría seleccionada (ver deriveTypeFromCategories).
  const type: ItemType = deriveTypeFromCategories(categories);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState("09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState("18:00");

  // ── Solo creación completa ──
  const [allDay, setAllDay] = useState(false);
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("sin_empezar");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(c: Category) {
    setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function toggleDay(d: number) {
    setRecurrenceDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);

    if (mode === "tarea" && formMode === "completa" && endTime) {
      if (new Date(endTime) <= new Date(startTime)) {
        setError("La hora de fin debe ser posterior a la de inicio");
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "meta") {
        const networkStatus = await Network.getStatus();
        if (!networkStatus.connected) {
          throw new Error("Necesitas conexión a internet para crear una meta");
        }

        const { error: insertError } = await supabase.from("goals").insert({
          user_id: userId,
          title: title.trim(),
          description: formMode === "completa" && description.trim() ? await encryptClient(description.trim()) : null,
          due_date: goalRecurrence === "none" && dueDate ? fixMidnightISO(new Date(dueDate).toISOString()) : null,
          recurrence_type: goalRecurrence,
          categories: formMode === "completa" ? categories : [],
        });
        if (insertError) throw new Error(insertError.message);

        onCreated("meta");
        return;
      }

      if (mode === "rutina") {
        if (recurrenceDays.length === 0) {
          setError("Selecciona al menos un día para la rutina");
          setLoading(false);
          return;
        }
        const occ = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occ) throw new Error("Horario inválido");

        const itemData = {
          user_id: userId,
          type: "personal" as const,
          title: title.trim(),
          description: formMode === "completa" && description.trim() ? await encryptClient(description.trim()) : null,
          start_time: occ.start.toISOString(),
          end_time: occ.end.toISOString(),
          all_day: false,
          add_to_calendar: true,
          status: "draft" as const,
          google_event_id: null,
          notion_page_id: null,
          notion_url: null,
          due_date: null,
          priority: null,
          effort: null,
          task_status: "sin_empezar" as const,
          categories: formMode === "completa" ? categories : [],
          outfit_suggestion: null,
          location: formMode === "completa" && location.trim() ? await encryptClient(location.trim()) : null,
          source: "app" as const,
          cached_recommendation: null,
          meet_link: null,
          recurrence_days: recurrenceDays,
          recurrence_start_time: recurrenceStartTime,
          recurrence_end_time: fixMidnightTime(recurrenceEndTime),
        };

        const newItem = await createLocalItem(itemData);

        const networkStatus = await Network.getStatus();
        if (networkStatus.connected) {
          const { error: upsertError } = await supabase.from("items").upsert({ ...newItem, status: "syncing" });
          if (!upsertError) {
            await updateLocalItem(newItem.id, { status: "syncing" });
            // Google Calendar/Notion + recomendación: mismo resultado final
            // que si se hubiera creado en web, no solo "confirmed" a ciegas.
            syncItemExternal(newItem.id);
          }
        }

        onCreated("rutina");
        return;
      }

      const startISO = new Date(startTime).toISOString();
      const defaultEndISO = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
      const completa = formMode === "completa";

      const itemData = {
        user_id: userId,
        type,
        title: title.trim(),
        description: description.trim() ? await encryptClient(description.trim()) : null,
        start_time: startISO,
        end_time: completa && endTime ? new Date(endTime).toISOString() : defaultEndISO,
        all_day: completa ? allDay : false,
        add_to_calendar: type !== "personal",
        status: "draft" as const,
        google_event_id: null,
        notion_page_id: null,
        notion_url: null,
        due_date: null,
        priority: completa ? priority : null,
        effort: completa ? effort : null,
        task_status: completa ? taskStatus : ("sin_empezar" as const),
        categories,
        outfit_suggestion: null,
        location: completa && location.trim() ? await encryptClient(location.trim()) : null,
        source: "app" as const,
        cached_recommendation: null,
        meet_link: null,
        recurrence_days: [],
        recurrence_start_time: null,
        recurrence_end_time: null,
      };

      // Always save locally first (status = draft)
      const newItem = await createLocalItem(itemData);

      // If online, push to Supabase; el estado final (confirmed/failed) lo
      // decide syncItemExternal según si Google Calendar/Notion sí se
      // pudieron crear — no se asume "confirmed" solo por haber llegado.
      const networkStatus = await Network.getStatus();
      if (networkStatus.connected) {
        const { error: upsertError } = await supabase.from("items").upsert({ ...newItem, status: "syncing" });
        if (!upsertError) {
          await updateLocalItem(newItem.id, { status: "syncing" });
          syncItemExternal(newItem.id);
        }
      }

      onCreated("tarea");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-4 border-b border-border-soft shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      >
        <h1 className="font-handwriting text-2xl">
          {mode === "meta" ? "Nueva meta" : mode === "rutina" ? "Nueva rutina" : "Nueva tarea"}
        </h1>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1">
          <IconX size={20} aria-hidden />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Modo */}
        {!lockMode && (
          <div>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                    mode === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rápida vs completa */}
        <div className="flex gap-2">
          {(["rapida", "completa"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFormMode(m)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                formMode === m
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-soft"
              }`}
            >
              {m === "rapida" ? "Creación rápida" : "Creación completa"}
            </button>
          ))}
        </div>

        {/* Categoría (solo tarea) — primero: el tipo se deriva de aquí */}
        {mode === "tarea" && <CategoriesField categories={categories} onToggle={toggleCategory} />}

        {/* Frecuencia (solo meta) */}
        {mode === "meta" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Frecuencia</label>
            <div className="grid grid-cols-4 gap-2">
              {GOAL_RECURRENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGoalRecurrence(opt.value)}
                  className={`rounded-xl border py-2 text-xs text-center transition-colors ${
                    goalRecurrence === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        {/* Campos exclusivos de rutina */}
        {mode === "rutina" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Días de la semana
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
                <label className="block text-xs text-muted mb-1">Hora inicio</label>
                <input
                  type="time"
                  value={recurrenceStartTime}
                  onChange={(e) => setRecurrenceStartTime(e.target.value)}
                  className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Hora fin</label>
                <input
                  type="time"
                  value={recurrenceEndTime}
                  onChange={(e) => setRecurrenceEndTime(e.target.value)}
                  className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            {formMode === "completa" ? (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Descripción (opcional)</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Ubicación</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Calle, ciudad..."
                    className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Categoría</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCategory(c)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
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
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted">
                Puedes agregar descripción, ubicación y categoría después, editando la rutina.
              </p>
            )}
          </div>
        )}

        {/* Fecha y hora (solo tarea) */}
        {mode === "tarea" && (
          <div>
            <label htmlFor="start" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Fecha y hora
            </label>
            <input
              id="start"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm"
            />

            {formMode === "completa" ? (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-border-soft"
                  />
                  <span className="text-sm">Todo el día</span>
                </label>

                <div>
                  <label className="block text-xs text-muted mb-1">Fin (opcional)</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
                  />
                </div>

                <ConflictWarning
                  startTime={startTime}
                  endTime={endTime}
                  allDay={allDay}
                  onApply={(s, e) => {
                    setStartTime(s);
                    setEndTime(e);
                  }}
                />
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted">
                Puedes agregar ubicación, prioridad y más después, editando la tarea.
              </p>
            )}
          </div>
        )}

        {/* Descripción */}
        {mode === "tarea" && (
          <div>
            <label htmlFor="desc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Descripción <span className="normal-case font-normal">(opcional)</span>
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
        )}

        {/* Ubicación / prioridad / esfuerzo / estado (solo tarea completa) */}
        {mode === "tarea" && formMode === "completa" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="loc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Ubicación
              </label>
              <input
                id="loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Calle, ciudad..."
                className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm"
              />
            </div>

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
          </div>
        )}

        {/* Fecha límite (solo meta única) */}
        {mode === "meta" && goalRecurrence === "none" && (
          <div>
            <label htmlFor="goal_due" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Fecha límite
            </label>
            <input
              id="goal_due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm"
            />
          </div>
        )}

        {/* Descripción y categoría (solo meta completa) */}
        {mode === "meta" && formMode === "completa" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="goal_desc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Descripción <span className="normal-case font-normal">(opcional)</span>
              </label>
              <textarea
                id="goal_desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {GOAL_CATEGORY_OPTIONS.map((c) => (
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
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full rounded-xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-40"
        >
          {loading
            ? "Guardando..."
            : mode === "meta"
              ? "Crear meta"
              : mode === "rutina"
                ? "Crear rutina"
                : "Crear tarea"}
        </button>

        <div className="h-4" />
      </form>
    </div>
  );
}

function CategoriesField({
  categories,
  onToggle,
}: {
  categories: Category[];
  onToggle: (c: Category) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Categoría</label>
      <div className="flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(c)}
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
  );
}
