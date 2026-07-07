import { useMemo, useState } from "react";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { ItemCard } from "@/components/ItemCard";
import { AppHeader } from "@/components/AppHeader";
import { IconChevronDown } from "@tabler/icons-react";

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props { items: Item[]; onSettings: () => void; }

export function WeekPage({ items, onSettings }: Props) {
  const [pastOpen, setPastOpen] = useState(false);
  const today = useMemo(() => startOfDay(new Date()), []);

  const days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(today, i - 3)), [today]);

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

  const pastDays = days.filter((d) => d < today);
  const upcomingDays = days.filter((d) => d >= today);

  function DaySection({ day }: { day: Date }) {
    const key = toDateParam(day);
    const dayItems = itemsByDay.get(key) ?? [];
    const isToday = isSameDay(day, today);
    const label = isToday
      ? "Hoy"
      : new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short" }).format(day);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-foreground" : "text-muted"}`}>
            {label}
          </h2>
          {isToday && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
          {dayItems.length === 0 && <span className="text-xs text-muted/50">—</span>}
        </div>
        {dayItems.map((item) => (
          <ItemCard key={`${item.id}-${key}`} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <AppHeader title="Esta semana" onSettings={onSettings} />

      <div className="space-y-4 mt-2">
        {pastDays.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setPastOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted mb-2"
            >
              <IconChevronDown size={12} className={`transition-transform ${pastOpen ? "rotate-180" : ""}`} aria-hidden />
              Días anteriores ({pastDays.length})
            </button>
            {pastOpen && (
              <div className="space-y-4 opacity-60">
                {pastDays.map((day) => <DaySection key={toDateParam(day)} day={day} />)}
              </div>
            )}
          </div>
        )}
        {upcomingDays.map((day) => <DaySection key={toDateParam(day)} day={day} />)}
      </div>
    </div>
  );
}
