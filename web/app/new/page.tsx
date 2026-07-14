"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Effort, GoalRecurrence, ItemType, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from "@/lib/itemPresentation";
import { ChipGroup } from "@/components/ChipGroup";
import { LocationField } from "@/components/LocationField";
import { WorkSchedulePicker } from "@/components/WorkSchedulePicker";
import { DateTimeInput } from "@/components/DateTimeInput";
import { nextOccurrence } from "@/lib/recurrence";
import { sileo } from "sileo";

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
  const router = useRouter();

  // ── Modo seleccionado ──
  const [mode, setMode] = useState<CreationMode>("tarea");

  // ── Campos comunes ──
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);

  // ── Tarea ──
  const [itemSubtype, setItemSubtype] = useState<ItemType>("compromiso");
  const [allDay, setAllDay] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(true);
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const [startTime, setStartTime] = useState(toLocalInputValue(now));
  const [endTime, setEndTime] = useState(toLocalInputValue(inOneHour));
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
  const [routineLocation, setRoutineLocation] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d?.profile?.location) {
          setLocation(d.profile.location);
          setRoutineLocation(d.profile.location);
        }
      })
      .catch(() => {});
  }, []);

  function handleModeChange(m: CreationMode) {
    setMode(m);
    setTitle("");
    setDescription("");
    setCategories([]);
  }

  function handleSubtypeChange(value: ItemType) {
    setItemSubtype(value);
    const opt = ITEM_SUBTYPES.find((o) => o.value === value);
    setAddToCalendar(opt?.defaultCalendar ?? false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "meta") {
        // ── Crear meta ──
        const payload: Record<string, unknown> = {
          title,
          description: description || undefined,
          recurrence_type: goalRecurrence,
          categories,
        };
        if (goalRecurrence === "none" && dueDate) {
          payload.due_date = new Date(dueDate).toISOString();
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
          description: description || undefined,
          categories,
          location: routineLocation || undefined,
          recurrence_days: recurrenceDays,
          recurrence_start_time: recurrenceStartTime,
          recurrence_end_time: recurrenceEndTime,
          start_time: occurrence.start.toISOString(),
          end_time: occurrence.end.toISOString(),
          add_to_calendar: true,
        };
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
      const payload: Record<string, unknown> = {
        type: itemSubtype,
        title,
        description: description || undefined,
        all_day: allDay,
        add_to_calendar: addToCalendar,
        task_status: taskStatus,
        categories,
        location: location || undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      };
      if (priority) payload.priority = priority;
      if (effort) payload.effort = effort;

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
      <h1 className="font-handwriting text-3xl mb-6">Nuevo</h1>

      {/* ── Selector de modo ── */}
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

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ════════════ TAREA ════════════ */}
        {mode === "tarea" && (
          <>
            {/* Sub-tipo */}
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de tarea</label>
              <div className="flex gap-2">
                {ITEM_SUBTYPES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSubtypeChange(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      itemSubtype === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <TitleField value={title} onChange={setTitle} />
            <DescriptionField value={description} onChange={setDescription} />

            <div className="flex items-center gap-2">
              <input
                id="all_day"
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              <label htmlFor="all_day" className="text-sm">Todo el día</label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Inicio</label>
                <DateTimeInput id="start_time" value={startTime} onChange={setStartTime} allDay={allDay} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fin</label>
                <DateTimeInput id="end_time" value={endTime} onChange={setEndTime} allDay={allDay} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ubicación</label>
              <LocationField id="location" value={location} onChange={setLocation} placeholder="Calle, ciudad..." />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Prioridad</label>
              <ChipGroup options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} allowClear />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Esfuerzo</label>
              <ChipGroup options={EFFORT_OPTIONS} value={effort} onChange={setEffort} allowClear />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Estado</label>
              <ChipGroup
                options={TASK_STATUS_OPTIONS}
                value={taskStatus}
                onChange={(v) => setTaskStatus(v ?? "sin_empezar")}
              />
            </div>

            <CategoriesField categories={categories} onToggle={toggleCategory} />

            <div className="flex items-center gap-2">
              <input
                id="add_to_calendar"
                type="checkbox"
                checked={addToCalendar}
                onChange={(e) => setAddToCalendar(e.target.checked)}
              />
              <label htmlFor="add_to_calendar" className="text-sm">Agregar a Google Calendar</label>
            </div>
          </>
        )}

        {/* ════════════ META ════════════ */}
        {mode === "meta" && (
          <>
            <TitleField value={title} onChange={setTitle} />
            <DescriptionField value={description} onChange={setDescription} />

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

            <CategoriesField categories={categories} onToggle={toggleCategory} />

            <p className="text-xs text-muted">
              Después de crear la meta podrás agregar los elementos del checklist.
            </p>
          </>
        )}

        {/* ════════════ RUTINA ════════════ */}
        {mode === "rutina" && (
          <>
            <TitleField value={title} onChange={setTitle} />
            <DescriptionField value={description} onChange={setDescription} />

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

            <div>
              <label className="block text-sm font-medium mb-1">Ubicación (opcional)</label>
              <LocationField
                id="routine_location"
                value={routineLocation}
                onChange={setRoutineLocation}
                placeholder="Gimnasio, oficina..."
              />
            </div>

            <CategoriesField categories={categories} onToggle={toggleCategory} />

            <WorkSchedulePicker
              label="Horario"
              days={recurrenceDays}
              onToggleDay={toggleRecurrenceDay}
              startTime={recurrenceStartTime}
              endTime={recurrenceEndTime}
              onStartTimeChange={setRecurrenceStartTime}
              onEndTimeChange={setRecurrenceEndTime}
            />
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
