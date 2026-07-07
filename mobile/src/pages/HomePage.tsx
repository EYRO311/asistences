import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { TYPE_BADGE_COLORS, TYPE_DOT_COLORS, formatTimeRange } from "@/lib/itemPresentation";

interface Props {
  items: Item[];
  onRefresh: () => void;
  session: Session;
}

function toDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HomePage({ items }: Props) {
  const today = new Date();
  const dayItems = items
    .map((item) => occurrenceForDate(item, today))
    .filter((item): item is Item => item !== null)
    .sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });

  const dayLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(today);

  return (
    <div className="px-4 pt-8 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-handwriting text-4xl capitalize text-foreground">Hoy</h1>
        <p className="text-sm text-muted capitalize mt-0.5">{dayLabel}</p>
      </div>

      {/* Items */}
      {dayItems.length === 0 ? (
        <div className="rounded-2xl border border-border-soft bg-surface px-5 py-8 text-center">
          <p className="text-sm text-muted">Sin eventos para hoy</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayItems.map((item) => {
            const timeLabel = formatTimeRange(item);
            return (
              <div
                key={`${item.id}-${toDateParam(today)}`}
                className="rounded-2xl border border-border-soft bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                    {timeLabel !== "Sin fecha" && (
                      <p className="text-xs text-muted mt-1">{timeLabel}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE_COLORS[item.type]}`}>
                    {item.type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
