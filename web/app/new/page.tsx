"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Effort, ItemType, Priority, TaskStatus } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  RECURRING_CATEGORIES,
  TASK_STATUS_OPTIONS,
} from "@/lib/itemPresentation";
import { ChipGroup } from "@/components/ChipGroup";
import { LocationField } from "@/components/LocationField";
import { WorkSchedulePicker } from "@/components/WorkSchedulePicker";
import { DateTimeInput } from "@/components/DateTimeInput";
import { nextOccurrence } from "@/lib/recurrence";
import { ErrorBanner } from "@/components/ErrorBanner";

const TYPE_OPTIONS: { value: ItemType; label: string; defaultCalendar: boolean }[] = [
  { value: "compromiso", label: "Compromiso", defaultCalendar: true },
  { value: "personal", label: "Personal", defaultCalendar: false },
  { value: "evento", label: "Evento", defaultCalendar: true },
];

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function NewItemPage() {
  const router = useRouter();

  const [type, setType] = useState<ItemType>("compromiso");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(true);

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const [startTime, setStartTime] = useState(toLocalInputValue(now));
  const [endTime, setEndTime] = useState(toLocalInputValue(inOneHour));
  const [dueDate, setDueDate] = useState("");

  const [priority, setPriority] = useState<Priority | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("sin_empezar");
  const [categories, setCategories] = useState<Category[]>([]);
  const [location, setLocation] = useState("");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState("09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState("18:00");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data?.profile?.location) setLocation(data.profile.location);
      })
      .catch(() => {});
  }, []);

  function handleTypeChange(value: ItemType) {
    setType(value);
    const option = TYPE_OPTIONS.find((o) => o.value === value);
    setAddToCalendar(option?.defaultCalendar ?? false);
  }

  function toggleCategory(category: Category) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function toggleRecurrenceDay(day: number) {
    setRecurrenceDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const recurringCategory = RECURRING_CATEGORIES.find((c) => categories.includes(c));
  const showWorkSchedule = Boolean(recurringCategory);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        type,
        title,
        description: description || undefined,
        all_day: allDay,
        add_to_calendar: addToCalendar,
        task_status: taskStatus,
        categories,
      };

      if (priority) payload.priority = priority;
      if (effort) payload.effort = effort;
      if (dueDate) payload.due_date = new Date(dueDate).toISOString();
      if (location) payload.location = location;

      if (showWorkSchedule && recurrenceDays.length > 0) {
        const occurrence = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occurrence) throw new Error("Horario de trabajo inválido");

        payload.recurrence_days = recurrenceDays;
        payload.recurrence_start_time = recurrenceStartTime;
        payload.recurrence_end_time = recurrenceEndTime;
        payload.start_time = occurrence.start.toISOString();
        payload.end_time = occurrence.end.toISOString();
        payload.add_to_calendar = true;
      } else if (addToCalendar || startTime) {
        payload.start_time = new Date(startTime).toISOString();
        payload.end_time = new Date(endTime).toISOString();
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
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <h1 className="font-handwriting text-3xl mb-6">Nueva tarea</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tipo</label>
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleTypeChange(option.value)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  type === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

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
            Descripción (se guarda en la página de Notion)
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          />
        </div>

        {!showWorkSchedule && (
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="start_time">
                  Inicio
                </label>
                <DateTimeInput id="start_time" value={startTime} onChange={setStartTime} allDay={allDay} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="end_time">
                  Fin
                </label>
                <DateTimeInput id="end_time" value={endTime} onChange={setEndTime} allDay={allDay} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="add_to_calendar"
                type="checkbox"
                checked={addToCalendar}
                onChange={(e) => setAddToCalendar(e.target.checked)}
              />
              <label htmlFor="add_to_calendar" className="text-sm">
                Agregar a Google Calendar
              </label>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="location">
            Ubicación (para clima y recomendaciones)
          </label>
          <LocationField id="location" value={location} onChange={setLocation} placeholder="Calle, ciudad, país..." />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="due_date">
            Fecha límite (opcional)
          </label>
          <input
            id="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          />
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

        <div>
          <label className="block text-sm font-medium mb-1">Categoría (rutina)</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  categories.includes(category)
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {showWorkSchedule && (
          <WorkSchedulePicker
            label={`Horario de ${recurringCategory}`}
            days={recurrenceDays}
            onToggleDay={toggleRecurrenceDay}
            startTime={recurrenceStartTime}
            endTime={recurrenceEndTime}
            onStartTimeChange={setRecurrenceStartTime}
            onEndTimeChange={setRecurrenceEndTime}
          />
        )}

        <p className="text-xs text-muted">
          La vestimenta sugerida se genera automáticamente con IA al guardar y se ve en Notion / al editar la tarea.
        </p>

        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground text-background py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear tarea"}
        </button>
      </form>
    </main>
  );
}
