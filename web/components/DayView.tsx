"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Item } from "@/lib/types";
import { TYPE_NOTE_COLORS, TYPE_LABELS, formatTimeRange } from "@/lib/itemPresentation";
import { occurrenceForDate } from "@/lib/recurrence";

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 23;
const HOUR_HEIGHT_PX = 56;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

export function DayView({ items, initialDate }: { items: Item[]; initialDate?: string }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialDate) {
      const [year, month, day] = initialDate.split("-").map(Number);
      if (year && month && day) return new Date(year, month - 1, day);
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const dayItems = useMemo(
    () => items.map((item) => occurrenceForDate(item, selectedDate)).filter((item): item is Item => item !== null),
    [items, selectedDate]
  );

  const allDayItems = dayItems.filter((item) => item.all_day);
  const timedItems = dayItems.filter((item) => !item.all_day);

  const totalHours = GRID_END_HOUR - GRID_START_HOUR;
  const gridHeight = totalHours * HOUR_HEIGHT_PX;

  function positionFor(item: Item) {
    const start = new Date(item.start_time!);
    const end = item.end_time ? new Date(item.end_time) : new Date(start.getTime() + 60 * 60 * 1000);

    const startHours = clamp(start.getHours() + start.getMinutes() / 60, GRID_START_HOUR, GRID_END_HOUR);
    const endHours = clamp(end.getHours() + end.getMinutes() / 60, GRID_START_HOUR, GRID_END_HOUR);

    const top = (startHours - GRID_START_HOUR) * HOUR_HEIGHT_PX;
    const height = Math.max((endHours - startHours) * HOUR_HEIGHT_PX, 24);

    return { top, height };
  }

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-handwriting text-4xl">
          {new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate)}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            aria-label="Día anterior"
          >
            ←
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                setSelectedDate(now);
              }}
              className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            >
              Hoy
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            aria-label="Día siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const today = isSameDay(day, new Date());
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDate(day)}
              className={`rounded-xl border px-1 py-2 text-center text-xs transition-colors ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : today
                    ? "border-border-soft bg-surface font-semibold"
                    : "border-border-soft bg-surface text-muted"
              }`}
            >
              <div className="font-handwriting text-base leading-none">
                {new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(day)}
              </div>
              <div>{day.getDate()}</div>
            </button>
          );
        })}
      </div>

      {allDayItems.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {allDayItems.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}/editar`}
              className={`block rounded-lg border px-3 py-1.5 text-sm ${TYPE_NOTE_COLORS[item.type]}`}
            >
              <span className="font-medium">{item.title}</span> · Todo el día
            </Link>
          ))}
        </div>
      )}

      <div className="relative rounded-2xl border border-border-soft bg-surface shadow-sm">
        <div className="relative" style={{ height: gridHeight }}>
          {Array.from({ length: totalHours + 1 }, (_, i) => GRID_START_HOUR + i).map((hour, idx) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start gap-2 border-t border-rule-line"
              style={{ top: idx * HOUR_HEIGHT_PX }}
            >
              <span className="-translate-y-1/2 bg-surface px-1.5 text-[11px] text-muted">
                {hour.toString().padStart(2, "0")}:00
              </span>
            </div>
          ))}

          <div className="absolute inset-0 ml-14">
            {timedItems.map((item) => {
              const { top, height } = positionFor(item);
              return (
                <Link
                  key={item.id}
                  href={`/items/${item.id}/editar`}
                  className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-xs shadow-sm transition-transform hover:scale-[1.01] ${TYPE_NOTE_COLORS[item.type]}`}
                  style={{ top, height }}
                >
                  <p className="font-medium leading-tight">{item.title}</p>
                  <p className="opacity-80">{formatTimeRange(item)}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {dayItems.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">No tienes tareas este día.</p>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        Tipos: {Object.values(TYPE_LABELS).join(" · ")} — toca una tarea para editarla.
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
