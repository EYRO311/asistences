"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { TYPE_DOT_COLORS } from "@/lib/itemPresentation";
import { occurrenceForDate } from "@/lib/recurrence";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function addMonths(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + amount, 1);
  return d;
}

function toDateParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MonthView({ items }: { items: Item[] }) {
  const router = useRouter();
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const gridDays = useMemo(() => {
    const firstOfMonth = monthAnchor;
    const firstWeekday = firstOfMonth.getDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const gridStart = addDays(firstOfMonth, -offset);

    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthAnchor]);

  const today = new Date();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-handwriting text-4xl capitalize">
          {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(monthAnchor)}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
            className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
            className="rounded-full border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-1">
        {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day) => {
          const inMonth = day.getMonth() === monthAnchor.getMonth();
          const isToday = isSameDay(day, today);
          const dayItems = items
            .map((item) => occurrenceForDate(item, day))
            .filter((item): item is Item => item !== null);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => router.push(`/?date=${toDateParam(day)}`)}
              className={`aspect-square rounded-lg border p-1.5 text-left transition-colors hover:bg-surface ${
                inMonth ? "border-border-soft" : "border-transparent opacity-40"
              }`}
            >
              <div className={`text-xs ${isToday ? "font-bold text-foreground" : "text-muted"}`}>
                {isToday ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                    {day.getDate()}
                  </span>
                ) : (
                  day.getDate()
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {dayItems.slice(0, 4).map((item) => (
                  <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT_COLORS[item.type]}`} />
                ))}
                {dayItems.length > 4 && <span className="text-[10px] text-muted">+{dayItems.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
