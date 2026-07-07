import { useMemo, useState } from "react";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { TYPE_BADGE_COLORS, TYPE_DOT_COLORS } from "@/lib/itemPresentation";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { AppHeader } from "@/components/AppHeader";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d: Date, n: number) { const r = new Date(d); r.setMonth(r.getMonth() + n, 1); return r; }
function toDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props { items: Item[]; onSettings: () => void; onSync: () => void; syncing: boolean; pendingCount: number; onItemClick: (item: Item) => void; }

export function MonthPage({ items, onSettings, onSync, syncing, pendingCount, onItemClick }: Props) {
  const today = new Date();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateParam(today));

  const gridDays = useMemo(() => {
    const firstWeekday = monthAnchor.getDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const gridStart = addDays(monthAnchor, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthAnchor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const day of gridDays) {
      const key = toDateParam(day);
      map.set(key, items.map((i) => occurrenceForDate(i, day)).filter((i): i is Item => i !== null));
    }
    return map;
  }, [gridDays, items]);

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDay.get(selectedDate) ?? [];
  }, [selectedDate, eventsByDay]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <AppHeader title="" onSettings={onSettings} onSync={onSync} syncing={syncing} pendingCount={pendingCount} />
      <div className="px-4 pb-1 flex items-center gap-2 -mt-3">
        <h2 className="font-handwriting text-2xl flex-1 capitalize">
          {new Intl.DateTimeFormat("es-MX", { month: "long" }).format(monthAnchor)}{" "}
          <span className="text-muted">{monthAnchor.getFullYear()}</span>
        </h2>
        <button
          type="button"
          onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-muted"
        >
          <IconChevronLeft size={15} stroke={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => { setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(toDateParam(today)); }}
          className="rounded-full border border-border-soft px-3 py-1 text-xs text-muted"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-muted"
        >
          <IconChevronRight size={15} stroke={2} aria-hidden />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-2">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0 px-2">
        {gridDays.map((day) => {
          const inMonth = day.getMonth() === monthAnchor.getMonth();
          const isToday = isSameDay(day, today);
          const key = toDateParam(day);
          const isSelected = selectedDate === key;
          const dayItems = eventsByDay.get(key) ?? [];

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(key)}
              className={[
                "flex flex-col items-center rounded-lg py-0.5 px-0 min-h-8 transition-colors",
                inMonth ? "" : "opacity-20 pointer-events-none",
                isSelected ? "bg-foreground text-background" : "hover:bg-surface",
              ].join(" ")}
            >
              <span className={[
                "text-[11px] leading-none w-5 h-5 flex items-center justify-center rounded-full font-medium",
                isToday && !isSelected ? "bg-foreground/10 font-bold" : "",
              ].join(" ")}>
                {day.getDate()}
              </span>
              <div className="flex justify-center gap-0.5 mt-0.5">
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={`h-0.75 w-0.75 rounded-full ${isSelected ? "bg-background/70" : TYPE_DOT_COLORS[item.type]}`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {selectedDate && (
          <>
            <h2 className="text-sm font-semibold text-muted mb-3 capitalize">
              {new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date(selectedDate + "T12:00:00"))}
            </h2>
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Sin eventos</p>
            ) : (
              <div className="space-y-2">
                {selectedItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => onItemClick(item)} className="w-full rounded-xl border border-border-soft bg-surface p-3 flex items-start gap-2.5 text-left">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      {item.start_time && !item.all_day && (
                        <p className="text-xs text-muted mt-0.5">
                          {new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.start_time))}
                          {item.end_time && ` – ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.end_time))}`}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${TYPE_BADGE_COLORS[item.type]}`}>
                      {item.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
