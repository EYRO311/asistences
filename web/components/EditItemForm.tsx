"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { decryptClient, encryptClient } from "@/lib/crypto-client";
import type { Category, Effort, Item, Priority, TaskStatus } from "@/lib/types";
import { sileo } from "sileo";
import { IconBulb } from "@tabler/icons-react";
import {
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  PRIORITY_OPTIONS,
  RECURRING_CATEGORIES,
  TASK_STATUS_OPTIONS,
  TYPE_BADGE_COLORS,
  TYPE_LABELS,
} from "@/lib/itemPresentation";
import { ChipGroup } from "@/components/ChipGroup";
import { RecommendationsModal } from "@/components/RecommendationsModal";
import { DeleteItemButton } from "@/components/DeleteItemButton";
import { LocationField } from "@/components/LocationField";
import { WorkSchedulePicker } from "@/components/WorkSchedulePicker";
import { DateTimeInput } from "@/components/DateTimeInput";
import { nextOccurrence } from "@/lib/recurrence";

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

// Tareas guardadas antes de validar esto pueden tener el fin en otro día que
// el inicio (ej. un mes después) — al abrir editar, se corrige la fecha del
// fin para que coincida con la de inicio, conservando la hora guardada.
function clampEndToStartDay(startVal: string, endVal: string): string {
  return endVal.slice(0, 10) === startVal.slice(0, 10) ? endVal : `${startVal.slice(0, 10)}T${endVal.slice(11)}`;
}

export function EditItemForm({ item }: { item: Item }) {
  const router = useRouter();

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(item.all_day);
  const [startTime, setStartTime] = useState(
    item.start_time ? toLocalInputValue(new Date(item.start_time)) : toLocalInputValue(new Date())
  );
  const [endTime, setEndTime] = useState(() => {
    const start = item.start_time ? toLocalInputValue(new Date(item.start_time)) : toLocalInputValue(new Date());
    const end = item.end_time ? toLocalInputValue(new Date(item.end_time)) : start;
    return clampEndToStartDay(start, end);
  });
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority | null>(item.priority);
  const [effort, setEffort] = useState<Effort | null>(item.effort);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(item.task_status);
  const [categories, setCategories] = useState<Category[]>(item.categories ?? []);
  const [location, setLocation] = useState("");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(item.recurrence_days ?? []);
  const [recurrenceStartTime, setRecurrenceStartTime] = useState(item.recurrence_start_time ?? "09:00");
  const [recurrenceEndTime, setRecurrenceEndTime] = useState(item.recurrence_end_time ?? "18:00");

  const [loading, setLoading] = useState(false);

  // Desencripta description y location al montar (llegan encriptados del servidor)
  useEffect(() => {
    decryptClient(item.description ?? null).then((v) => setDescription(v ?? ""));
    decryptClient(item.location ?? null).then((v) => setLocation(v ?? ""));
  }, [item.description, item.location]);

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

    if (!showWorkSchedule) {
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
      const payload: Record<string, unknown> = {
        title,
        description: description ? await encryptClient(description) : undefined,
        all_day: allDay,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        task_status: taskStatus,
        categories,
      };

      if (priority) payload.priority = priority;
      if (effort) payload.effort = effort;
      payload.location = location ? await encryptClient(location) : undefined;

      if (showWorkSchedule && recurrenceDays.length > 0) {
        const occurrence = nextOccurrence(recurrenceDays, recurrenceStartTime, recurrenceEndTime);
        if (!occurrence) throw new Error("Horario de trabajo inválido");

        payload.recurrence_days = recurrenceDays;
        payload.recurrence_start_time = recurrenceStartTime;
        payload.recurrence_end_time = recurrenceEndTime;
        payload.start_time = occurrence.start.toISOString();
        payload.end_time = occurrence.end.toISOString();
      } else if (item.recurrence_days?.length) {
        // Se quitó "Trabajo" o se borraron los días: ya no es recurrente.
        payload.recurrence_days = [];
        payload.recurrence_start_time = undefined;
        payload.recurrence_end_time = undefined;
      }

      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : (data.error?.message ?? "No se pudo actualizar la tarea"));

      sileo.success({ title: "Guardado", description: "Los cambios se guardaron correctamente." });
      router.push("/");
      router.refresh();
    } catch (err) {
      sileo.error({ title: "Error al guardar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  const isSynced = item.source !== "app";
  const missingInfo = isSynced && (!item.priority || !item.effort || item.categories.length === 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {missingInfo && (
        <p className="rounded-md border border-border-soft bg-surface px-3 py-2 text-xs text-muted">
          <IconBulb size={14} className="inline -mt-0.5 mr-1" aria-hidden />
          Esta tarea se importó desde {item.source === "google_sync" ? "Google Calendar" : "Notion"}. Completa el
          tipo, prioridad, esfuerzo y categoría para mejores recomendaciones de IA.
        </p>
      )}

      <div>
        <span className="block text-sm font-medium mb-1">Tipo</span>
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[item.type]}`}>
          {TYPE_LABELS[item.type]}
        </span>
        <p className="mt-1 text-xs text-muted">El tipo no se puede cambiar después de creada la tarea.</p>
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
            <input id="all_day" type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <label htmlFor="all_day" className="text-sm">
              Todo el día
            </label>
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

      <div>
        <span className="block text-sm font-medium mb-1">Recomendaciones de vestimenta</span>
        {item.outfit_suggestion && (
          <p className="mb-2 rounded-md border border-border-soft bg-surface px-3 py-2 text-sm text-muted">
            {item.outfit_suggestion}
          </p>
        )}
        <RecommendationsModal itemId={item.id} />
      </div>

      {(item.google_event_id || item.notion_page_id) && (
        <p className="text-xs text-muted">
          Al guardar se actualizará{item.google_event_id ? " el evento de Google Calendar" : ""}
          {item.google_event_id && item.notion_page_id ? " y" : ""}
          {item.notion_page_id ? " la página de Notion" : ""} asociados.
        </p>
      )}

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
        <DeleteItemButton itemId={item.id} label="Eliminar tarea" />
      </div>
    </form>
  );
}
