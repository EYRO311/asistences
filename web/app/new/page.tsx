"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Category, Effort, GoalRecurrence, ItemType, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  deriveTypeFromCategories,
} from "@/lib/itemPresentation";
import { DateTimeInput } from "@/components/DateTimeInput";
import { LocationField } from "@/components/LocationField";
import { ChipGroup } from "@/components/ChipGroup";
import { VoiceTaskButton, type VoiceExtraction } from "@/components/VoiceTaskButton";
import { ConflictWarning } from "@/components/ConflictWarning";
import { nextOccurrence } from "@/lib/recurrence";
import { sileo } from "sileo";
import { encryptClient } from "@/lib/crypto-client";

// Categorías de meta no incluyen "Evento" (solo aplica a tareas)
const GOAL_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((c) => c !== "Evento");

type FormMode = "rapida" | "completa";

// ── Modo de creación ──────────────────────────────────────────────────────────
type CreationMode = "tarea" | "meta" | "rutina";

const MODES: { value: CreationMode; label: string; description: string }[] = [
  { value: "tarea", label: "Tarea", description: "Compromiso, evento o actividad puntual" },
  { value: "meta", label: "Meta", description: "Objetivo con checklist diario, semanal o mensual" },
  { value: "rutina", label: "Rutina", description: "Actividad que se repite en días específicos" },
];

const ITEM_SUBTYPES: { value: ItemType; label: string; defaultCalendar: boolean }[] = [
  { value: "compromiso", label: "Compromiso", defaultCalendar: true },
  { value: "personal", label: "Personal", defaultCalendar: false },
  { value: "evento", label: "Evento", defaultCalendar: true },
];

const GOAL_RECURRENCES: { value: GoalRecurrence; label: string }[] = [
  { value: "none", label: "Única" },
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 7, label: "D" },
];

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function NewItemPage() {
  return (
    <Suspense fallback={null}>
      <NewItemForm />
    </Suspense>
  );
}

function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forcedMode = searchParams.get("mode");
  const lockMode = forcedMode === "meta";

  // ── Modo seleccionado ──
  const [mode, setMode] = useState<CreationMode>(forcedMode === "meta" ? "meta" : "tarea");
  // ── Creación rápida (lo mínimo) vs completa (todos los campos) ──
  const [formMode, setFormMode] = useState<FormMode>("rapida");

  // ── Campos comunes ──
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);

  // ── Tarea ──
  // El tipo (compromiso/personal/evento) ya no se elige a mano: se deriva de
  // la categoría seleccionada (ver deriveTypeFromCategories).
  const itemSubtype: ItemType = deriveTypeFromCategories(categories);
  const addToCalendar = ITEM_SUBTYPES.find((o) => o.value === itemSubtype)?.defaultCalendar ?? true;
  const now = new Date();
  const [startTime, setStartTime] = useState(toLocalInputValue(now));
  // ── Tarea (solo creación completa) ──
  const [allDay, setAllDay] = useState(false);
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("sin_empezar");

  // ── Meta ──
  const [goalRecurrence, setGoalRecurrence] = useState<GoalRecurrence>("none");
  const [dueDate, setDueDate] = useState("");

  // ── Rutina ──
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState("09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState("18:00");

  const [loading, setLoading] = useState(false);

  function handleModeChange(m: CreationMode) {
    setMode(m);
    setTitle("");
    setDescription("");
    setCategories([]);
    setAllDay(false);
    setEndTime("");
    setLocation("");
    setPriority(null);
    setEffort(null);
    setTaskStatus("sin_empezar");
  }

  function toggleCategory(category: Category) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function toggleRecurrenceDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  // Fase 4: prellena el formulario con lo que Gemini extrajo de la nota de
  // voz — el usuario sigue revisando y confirmando con el botón normal.
  function handleVoiceExtracted(extraction: VoiceExtraction) {
    setTitle(extraction.title);
    if (extraction.category) setCategories([extraction.category]);
    if (extraction.date) {
      const time = extraction.time ?? "09:00";
      setStartTime(`${extraction.date}T${time}`);
    }
    if (formMode === "completa") {
      setAllDay(extraction.allDay);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "tarea" && formMode === "completa" && endTime) {
      if (new Date(endTime) <= new Date(startTime)) {
        sileo.error({ title: "Fechas inválidas", description: "La hora de fin debe ser posterior a la de inicio." });
        return;
      }
      if (startTime.slice(0, 10) !== endTime.slice(0, 10)) {
        sileo.error({ title: "Fechas inválidas", description: "La fecha de fin debe ser el mismo día que la de inicio." });
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "meta") {
        // ── Crear meta ──
        const payload: Record<string, unknown> = {
          title,
          recurrence_type: goalRecurrence,
        };
        if (goalRecurrence === "none" && dueDate) {
          payload.due_date = new Date(dueDate).toISOString();
        }
        if (formMode === "completa") {
          payload.description = description || undefined;
          payload.categories = categories;
        }
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "No se pudo crear la meta");
        sileo.success({ title: "Meta creada" });
        router.push("/");
        router.refresh();
        return;
      }

      if (mode === "rutina") {
        // ── Crear rutina (item con recurrence_days) ──
        if (recurrenceDays.length === 0) {
          sileo.error({ title: "Selecciona al menos un día" });
          return;
        }
        const occurrence = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occurrence) throw new Error("Horario de rutina inválido");

        const payload: Record<string, unknown> = {
          type: "personal",
          title,
          recurrence_days: recurrenceDays,
          recurrence_start_time: recurrenceStartTime,
          recurrence_end_time: recurrenceEndTime,
          start_time: occurrence.start.toISOString(),
          end_time: occurrence.end.toISOString(),
          add_to_calendar: true,
        };
        if (formMode === "completa") {
          payload.description = description ? await encryptClient(description) : undefined;
          payload.location = location ? await encryptClient(location) : undefined;
          payload.categories = categories;
        }
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "No se pudo crear la rutina");
        sileo.success({ title: "Rutina creada" });
        router.push("/");
        router.refresh();
        return;
      }

      // ── Crear tarea ──
      const start = new Date(startTime);
      const defaultEnd = new Date(start.getTime() + 60 * 60 * 1000);
      const payload: Record<string, unknown> = {
        type: itemSubtype,
        title,
        description: description ? await encryptClient(description) : undefined,
        all_day: formMode === "completa" ? allDay : false,
        add_to_calendar: addToCalendar,
        categories,
        start_time: start.toISOString(),
        end_time: formMode === "completa" && endTime ? new Date(endTime).toISOString() : defaultEnd.toISOString(),
      };

      if (formMode === "completa") {
        payload.location = location ? await encryptClient(location) : undefined;
        if (priority) payload.priority = priority;
        if (effort) payload.effort = effort;
        payload.task_status = taskStatus;
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "No se pudo crear la tarea");
      router.push("/");
      router.refresh();
    } catch (err) {
      sileo.error({
        title: "Error al crear",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  }

  const submitLabel =
    mode === "meta" ? (loading ? "Creando..." : "Crear meta") :
    mode === "rutina" ? (loading ? "Creando..." : "Crear rutina") :
    (loading ? "Creando..." : "Crear tarea");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <h1 className="font-handwriting text-3xl mb-6">{lockMode ? "Nueva meta" : "Nuevo"}</h1>

      {/* ── Selector de modo ── */}
      {!lockMode && (
      <div className="grid grid-cols-3 gap-2 mb-8">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => handleModeChange(m.value)}
            className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center transition-colors ${
              mode === m.value
                ? "border-foreground bg-foreground text-background"
                : "border-border-soft hover:border-foreground/40"
            }`}
          >
            <span className="text-base font-semibold">{m.label}</span>
            <span
              className={`text-xs mt-1 leading-tight ${
                mode === m.value ? "text-background/70" : "text-muted"
              }`}
            >
              {m.description}
            </span>
          </button>
        ))}
      </div>
      )}

      {/* ── Rápida vs completa ── */}
      <div className="flex gap-2 mb-6">
        {(["rapida", "completa"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setFormMode(m)}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              formMode === m
                ? "border-foreground bg-foreground text-background"
                : "border-border-soft hover:border-foreground/40"
            }`}
          >
            {m === "rapida" ? "Creación rápida" : "Creación completa"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ════════════ TAREA ════════════ */}
        {mode === "tarea" && (
          <>
            <VoiceTaskButton onExtracted={handleVoiceExtracted} />

            <CategoriesField categories={categories} onToggle={toggleCategory} />

            <TitleField value={title} onChange={setTitle} />

            <div>
              <label className="block text-sm font-medium mb-1">Fecha y hora</label>
              <DateTimeInput id="start_time" value={startTime} onChange={setStartTime} allDay={false} />
            </div>

            <DescriptionField value={description} onChange={setDescription} />

            {formMode === "completa" ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    id="all_day"
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                  />
                  <label htmlFor="all_day" className="text-sm">Todo el día</label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Fin (opcional)</label>
                  <DateTimeInput id="end_time" value={endTime} onChange={setEndTime} allDay={allDay} />
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

                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="location">
                    Ubicación (para clima y recomendaciones)
                  </label>
                  <LocationField id="location" value={location} onChange={setLocation} placeholder="Calle, ciudad, país..." />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Prioridad</label>
                  <ChipGroup options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} allowClear />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Nivel de esfuerzo</label>
                  <ChipGroup options={EFFORT_OPTIONS} value={effort} onChange={setEffort} allowClear />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Estado</label>
                  <ChipGroup options={TASK_STATUS_OPTIONS} value={taskStatus} onChange={(v) => setTaskStatus(v ?? "sin_empezar")} />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">
                Puedes agregar ubicación, prioridad y más después, editando la tarea.
              </p>
            )}
          </>
        )}

        {/* ════════════ META ════════════ */}
        {mode === "meta" && (
          <>
            <TitleField value={title} onChange={setTitle} />

            <div>
              <label className="block text-sm font-medium mb-2">Frecuencia</label>
              <div className="grid grid-cols-4 gap-2">
                {GOAL_RECURRENCES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setGoalRecurrence(r.value)}
                    className={`rounded-lg border px-2 py-2 text-sm text-center transition-colors ${
                      goalRecurrence === r.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">
                {goalRecurrence === "none" && "Meta única con fecha límite"}
                {goalRecurrence === "daily" && "El checklist se renueva cada día"}
                {goalRecurrence === "weekly" && "El checklist se renueva cada semana"}
                {goalRecurrence === "monthly" && "El checklist se renueva cada mes"}
              </p>
            </div>

            {goalRecurrence === "none" && (
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

            {formMode === "completa" && (
              <>
                <DescriptionField value={description} onChange={setDescription} />

                <div>
                  <label className="block text-sm font-medium mb-1">Categoría</label>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_CATEGORY_OPTIONS.map((c) => (
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
              </>
            )}

            <p className="text-xs text-muted">
              Después de crear la meta podrás agregar los elementos del checklist.
            </p>
          </>
        )}

        {/* ════════════ RUTINA ════════════ */}
        {mode === "rutina" && (
          <>
            <TitleField value={title} onChange={setTitle} />

            <div>
              <label className="block text-sm font-medium mb-2">Días de la semana</label>
              <div className="flex gap-2">
                {DAYS_OF_WEEK.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleRecurrenceDay(d.value)}
                    className={`h-9 w-9 rounded-full border text-sm font-medium transition-colors ${
                      recurrenceDays.includes(d.value)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Hora inicio</label>
                <input
                  type="time"
                  value={recurrenceStartTime}
                  onChange={(e) => setRecurrenceStartTime(e.target.value)}
                  className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hora fin</label>
                <input
                  type="time"
                  value={recurrenceEndTime}
                  onChange={(e) => setRecurrenceEndTime(e.target.value)}
                  className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
                />
              </div>
            </div>

            {formMode === "completa" ? (
              <>
                <DescriptionField value={description} onChange={setDescription} />

                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="location">
                    Ubicación
                  </label>
                  <LocationField id="location" value={location} onChange={setLocation} placeholder="Calle, ciudad, país..." />
                </div>

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
              </>
            ) : (
              <p className="text-xs text-muted">
                Puedes agregar descripción, ubicación y categoría después, editando la rutina.
              </p>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full rounded-md bg-foreground text-background py-2.5 text-sm font-medium disabled:opacity-50 mt-2"
        >
          {submitLabel}
        </button>
      </form>
    </main>
  );
}

// ── Subcomponentes locales reutilizables ──────────────────────────────────────

function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="title">
        Título
      </label>
      <input
        id="title"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
        placeholder="¿Qué vas a hacer?"
      />
    </div>
  );
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="description">
        Descripción <span className="text-muted font-normal">(opcional)</span>
      </label>
      <textarea
        id="description"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm resize-none"
        placeholder="Notas o detalles adicionales..."
      />
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
      <label className="block text-sm font-medium mb-1">Categoría</label>
      <div className="flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(c)}
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
  );
}
