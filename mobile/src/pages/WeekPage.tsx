import { useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { ItemCard } from "@/components/ItemCard";
import { AppHeader } from "@/components/AppHeader";
import { FreeSlots } from "@/components/FreeSlots";

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DOW_LABEL = ["D", "L", "M", "X", "J", "V", "S"];

interface Props { items: Item[]; onSettings: () => void; onSync: () => void; syncing: boolean; pendingCount: number; onItemClick: (item: Item) => void; }

export function WeekPage({ items, onSettings, onSync, syncing, pendingCount, onItemClick }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  // 7 days: today-3 … today+3, today is index 3
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 3)), [today]);

  const [selectedIndex, setSelectedIndex] = useState(3);
  const touchStartX = useRef<number | null>(null);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const day of days) {
      const key = toDateParam(day);
      map.set(key, items
        .map((item) => occurrenceForDate(item, day))
        .filter((item): item is Item => item !== null)
        .sort((a, b) => (!a.start_time ? 1 : !b.start_time ? -1 :
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime())));
    }
    return map;
  }, [days, items]);

  function navigate(dir: number) {
    setSelectedIndex((i) => Math.max(0, Math.min(6, i + dir)));
  }

  const selectedDay = days[selectedIndex];
  const selectedKey = toDateParam(selectedDay);
  const dayItems = itemsByDay.get(selectedKey) ?? [];
  const isToday = isSameDay(selectedDay, today);

  const dayLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  }).format(selectedDay);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Semana" onSettings={onSettings} onSync={onSync} syncing={syncing} pendingCount={pendingCount} />

      {/* Day strip */}
      <div className="flex items-center gap-1 px-3 pb-3">
        {days.map((day, i) => {
          const isSelected = i === selectedIndex;
          const isTod = isSameDay(day, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={[
                "flex flex-col items-center flex-1 py-1.5 rounded-xl transition-colors",
                isSelected
                  ? "bg-foreground text-background"
                  : isTod
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted",
              ].join(" ")}
            >
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mb-0.5">
                {DOW_LABEL[day.getDay()]}
              </span>
              <span className={`text-sm leading-none ${isTod && !isSelected ? "font-bold" : "font-medium"}`}>
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Swipeable day content */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-4 select-none"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(dx) > 48) navigate(dx < 0 ? 1 : -1);
          touchStartX.current = null;
        }}
      >
        <FreeSlots />

        {/* Day title */}
        <p className="text-xs text-muted capitalize mb-3 px-0.5">
          {isToday ? <span className="text-foreground font-semibold">Hoy · </span> : null}
          {dayLabel}
        </p>

        {dayItems.length === 0 ? (
          <div className="rounded-2xl border border-border-soft bg-surface px-5 py-6 text-center mb-3">
            <p className="text-sm text-muted">Sin eventos</p>
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            {dayItems.map((item) => (
              <ItemCard key={`${item.id}-${selectedKey}`} item={item} onClick={() => onItemClick(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
