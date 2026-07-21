"use client";

import { useEffect, useState } from "react";
import type { FreeSlot } from "@/lib/types";
import { checkConflict, type ConflictResult } from "@/lib/conflictCheck";

// Fase 8 del plan de implementación: avisa (sin bloquear ni mover nada
// automáticamente) cuando el horario elegido se empalma con algo ya
// agendado, y ofrece botones para adoptar un hueco libre cercano — el
// usuario decide, nunca se aplica solo.

interface Props {
  startTime: string; // datetime-local, "YYYY-MM-DDTHH:mm"
  endTime: string; // datetime-local o "" si no hay fin explícito
  allDay: boolean;
  excludeItemId?: string;
  onApply: (startTime: string, endTime: string) => void;
}

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function ConflictWarning({ startTime, endTime, allDay, excludeItemId, onApply }: Props) {
  const [result, setResult] = useState<ConflictResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (allDay || !startTime || !endTime) {
        setResult(null);
        return;
      }
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (!(end > start)) {
        setResult(null);
        return;
      }

      try {
        const dayStart = new Date(start);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const params = new URLSearchParams({
          time_min: dayStart.toISOString(),
          time_max: dayEnd.toISOString(),
        });
        if (excludeItemId) params.set("exclude_item_id", excludeItemId);

        const res = await fetch(`/api/calendar/free-slots?${params.toString()}`);
        if (!res.ok) {
          setResult(null);
          return;
        }
        const data = await res.json();
        const days: FreeSlot[] = data.days ?? [];
        const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
        const day = days.find((d) => d.date === dateStr);
        setResult(checkConflict(start, end, day));
      } catch {
        setResult(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [startTime, endTime, allDay, excludeItemId]);

  if (!result?.hasConflict) return null;

  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-2">
      <p className="text-amber-700 dark:text-amber-400">
        ⚠️ Este horario se empalma con algo que ya tienes agendado.
      </p>
      {result.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApply(toLocalInputValue(new Date(s.start)), toLocalInputValue(new Date(s.end)))}
              className="rounded-full border border-amber-400 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
            >
              Usar {formatTime(s.start)}–{formatTime(s.end)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
