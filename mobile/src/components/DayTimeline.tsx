import type { Item } from "@/lib/types";
import { TYPE_NOTE_COLORS, formatTimeRange } from "@/lib/itemPresentation";

// Grilla horaria proporcional, equivalente a web/components/DayView.tsx —
// antes mobile solo mostraba los items del día como lista plana (ItemCard),
// sin forma de ver visualmente huecos/superposiciones en el horario.

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 23;
const HOUR_HEIGHT_PX = 56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positionFor(item: Item) {
  const start = new Date(item.start_time!);
  const end = item.end_time ? new Date(item.end_time) : new Date(start.getTime() + 60 * 60 * 1000);

  const startHours = clamp(start.getHours() + start.getMinutes() / 60, GRID_START_HOUR, GRID_END_HOUR);
  const endHours = clamp(end.getHours() + end.getMinutes() / 60, GRID_START_HOUR, GRID_END_HOUR);

  const top = (startHours - GRID_START_HOUR) * HOUR_HEIGHT_PX;
  const height = Math.max((endHours - startHours) * HOUR_HEIGHT_PX, 24);

  return { top, height };
}

export function DayTimeline({ items, onItemClick }: { items: Item[]; onItemClick: (item: Item) => void }) {
  const timedItems = items.filter((i) => i.start_time && !i.all_day);
  const totalHours = GRID_END_HOUR - GRID_START_HOUR;
  const gridHeight = totalHours * HOUR_HEIGHT_PX;

  return (
    <div className="relative rounded-2xl border border-border-soft bg-surface shadow-sm overflow-hidden">
      <div className="relative" style={{ height: gridHeight }}>
        {Array.from({ length: totalHours + 1 }, (_, i) => GRID_START_HOUR + i).map((hour, idx) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-border-soft/60"
            style={{ top: idx * HOUR_HEIGHT_PX }}
          >
            <span className="-translate-y-1/2 inline-block bg-surface px-1.5 text-[10px] text-muted">
              {hour.toString().padStart(2, "0")}:00
            </span>
          </div>
        ))}

        <div className="absolute inset-0 ml-12">
          {timedItems.map((item) => {
            const { top, height } = positionFor(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item)}
                className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs shadow-sm active:scale-[0.99] transition-transform ${TYPE_NOTE_COLORS[item.type]}`}
                style={{ top, height }}
              >
                <p className="font-medium leading-tight truncate">{item.title}</p>
                <p className="opacity-80">{formatTimeRange(item)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
