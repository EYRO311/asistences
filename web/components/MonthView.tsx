"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Item } from "@/lib/types";
import {
  TYPE_DOT_COLORS,
  TYPE_BADGE_COLORS,
  TYPE_LABELS,
  formatTimeRange,
  formatDateRange,
} from "@/lib/itemPresentation";
import { occurrenceForDate } from "@/lib/recurrence";
import { IconChevronLeft, IconChevronRight, IconPlus, IconCalendarEvent } from "@tabler/icons-react";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

  const today = new Date();

  const gridDays = useMemo(() => {
    const firstWeekday = monthAnchor.getDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const gridStart = addDays(monthAnchor, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthAnchor]);

  // Pre-compute items per day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const day of gridDays) {
      const key = toDateParam(day);
      const dayItems = items
        .map((item) => occurrenceForDate(item, day))
        .filter((item): item is Item => item !== null);
      map.set(key, dayItems);
    }
    return map;
  }, [gridDays, items]);

  // Sidebar: non-recurring items with start_time in current month + recurring items once
  const sidebarEvents = useMemo(() => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const seen = new Set<string>();
    const result: Item[] = [];

    for (const item of items) {
      if (seen.has(item.id)) continue;
      if ((item.recurrence_days?.length ?? 0) > 0) {
        seen.add(item.id);
        result.push(item);
      } else if (item.start_time) {
        const d = new Date(item.start_time);
        if (d.getFullYear() === year && d.getMonth() === month) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }

    return result
      .sort((a, b) => {
        const aRecurring = (a.recurrence_days?.length ?? 0) > 0;
        const bRecurring = (b.recurrence_days?.length ?? 0) > 0;
        if (aRecurring && !bRecurring) return 1;
        if (!aRecurring && bRecurring) return -1;
        if (!a.start_time || !b.start_time) return 0;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      })
      .slice(0, 12);
  }, [items, monthAnchor]);

  const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-49px)] lg:overflow-hidden">
      {/* ── MAIN CALENDAR ── */}
      <div className="flex flex-1 flex-col px-4 py-5 md:px-6 md:py-6 lg:overflow-y-auto min-w-0">

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <h1 className="font-handwriting text-3xl md:text-4xl capitalize flex-1">
            {new Intl.DateTimeFormat("es-MX", { month: "long" }).format(monthAnchor)}{" "}
            <span className="text-muted">{monthAnchor.getFullYear()}</span>
          </h1>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="Mes anterior"
            >
              <IconChevronLeft size={15} stroke={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded-full border border-border-soft px-3 py-1 text-xs text-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="Mes siguiente"
            >
              <IconChevronRight size={15} stroke={2} aria-hidden />
            </button>

            <Link
              href="/new"
              className="ml-1 hidden xs:flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-medium text-background hover:opacity-85 transition-opacity"
            >
              <IconPlus size={13} stroke={2.5} aria-hidden />
              Nueva
            </Link>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1 gap-1">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((day) => {
            const inMonth = day.getMonth() === monthAnchor.getMonth();
            const isToday = isSameDay(day, today);
            const isPast = !isToday && day < today;
            const key = toDateParam(day);
            const dayItems = eventsByDay.get(key) ?? [];
            const shownItems = dayItems.slice(0, 3);
            const overflow = dayItems.length - 3;

            return (
              <button
                key={key}
                type="button"
                onClick={() => router.push(`/?date=${key}`)}
                className={[
                  "min-h-18 sm:min-h-22 md:min-h-26 lg:min-h-28",
                  "flex flex-col rounded-xl border p-1.5 text-left transition-all",
                  "hover:shadow-md hover:border-foreground/20",
                  inMonth ? "border-border-soft" : "border-transparent opacity-25 pointer-events-none",
                  isToday
                    ? "bg-surface border-foreground/30 shadow-sm ring-1 ring-foreground/10"
                    : isPast && inMonth
                    ? "bg-transparent"
                    : "bg-transparent",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* Date number */}
                <div className="mb-1 shrink-0">
                  {isToday ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold leading-none">
                      {day.getDate()}
                    </span>
                  ) : (
                    <span
                      className={`text-xs leading-none ${
                        isPast && inMonth ? "text-muted/60" : inMonth ? "" : "text-muted"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  )}
                </div>

                {/* Mobile: dots only */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {dayItems.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT_COLORS[item.type]}`}
                    />
                  ))}
                  {dayItems.length > 4 && (
                    <span className="text-[9px] leading-none text-muted self-center">
                      +{dayItems.length - 4}
                    </span>
                  )}
                </div>

                {/* sm+: text pills */}
                <div className="hidden sm:flex flex-col gap-0.5 overflow-hidden flex-1 min-h-0">
                  {shownItems.map((item) => (
                    <div
                      key={item.id}
                      className={`truncate rounded-md px-1 py-0.5 text-[10px] leading-snug font-medium ${TYPE_BADGE_COLORS[item.type]}`}
                    >
                      {item.title}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="pl-0.5 text-[10px] text-muted leading-none">
                      +{overflow} más
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: Event list ── */}
      <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-l border-border-soft bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-4">
          <div className="flex items-center gap-2">
            <IconCalendarEvent size={16} className="text-muted" aria-hidden />
            <h2 className="text-sm font-semibold">Eventos del mes</h2>
          </div>
          <Link
            href="/new"
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          >
            <IconPlus size={13} stroke={2} aria-hidden />
            Nueva
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {sidebarEvents.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted">Sin eventos este mes</p>
          ) : (
            sidebarEvents.map((item) => {
              const isRecurring = (item.recurrence_days?.length ?? 0) > 0;
              const dateLabel = isRecurring
                ? "Recurrente"
                : item.start_time
                ? new Intl.DateTimeFormat("es-MX", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).format(new Date(item.start_time))
                : "Sin fecha";
              const timeLabel = isRecurring
                ? formatDateRange(item)
                : formatTimeRange(item);
              const targetDate = item.start_time
                ? toDateParam(new Date(item.start_time))
                : toDateParam(today);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(`/?date=${targetDate}`)}
                  className="w-full rounded-xl border border-border-soft bg-background p-3 text-left hover:bg-surface hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Color dot */}
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold leading-snug">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted leading-snug">{dateLabel}</p>
                      {timeLabel && timeLabel !== "Sin fecha" && !item.all_day && (
                        <p className="text-[10px] text-muted/70 leading-snug mt-0.5">{timeLabel}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 self-start rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TYPE_BADGE_COLORS[item.type]}`}
                    >
                      {TYPE_LABELS[item.type]}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
