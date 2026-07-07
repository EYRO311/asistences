import type { Item } from "@/lib/types";
import { TYPE_BADGE_COLORS, TYPE_DOT_COLORS, formatTimeRange, formatDateRange } from "@/lib/itemPresentation";

interface Props {
  item: Item;
  onClick?: () => void;
}

export function ItemCard({ item, onClick }: Props) {
  const timeLabel = item.recurrence_days?.length ? formatDateRange(item) : formatTimeRange(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-border-soft bg-surface p-4 text-left"
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
          {item.categories?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.categories.map((c) => (
                <span key={c} className="rounded-md bg-border-soft px-1.5 py-0.5 text-[10px] text-muted">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`shrink-0 self-start rounded-lg px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE_COLORS[item.type]}`}>
          {item.type}
        </span>
      </div>
    </button>
  );
}
