import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { TYPE_BADGE_COLORS, TYPE_DOT_COLORS, formatTimeRange } from "@/lib/itemPresentation";
import { AppHeader } from "@/components/AppHeader";
import { IconChevronDown, IconShirt } from "@tabler/icons-react";

interface Props {
  items: Item[];
  onRefresh: () => void;
  session: Session;
  onSettings: () => void;
  onSync: () => void;
  syncing: boolean;
  pendingCount: number;
  onItemClick: (item: Item) => void;
}

function toDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMin(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function computeFreeSlots(dayItems: Item[]): { from: string; to: string }[] {
  const timed = dayItems
    .filter((i) => i.start_time && !i.all_day)
    .map((i) => {
      const s = new Date(i.start_time!);
      const e = i.end_time ? new Date(i.end_time) : new Date(s.getTime() + 60 * 60 * 1000);
      return { from: s.getHours() * 60 + s.getMinutes(), to: e.getHours() * 60 + e.getMinutes() };
    })
    .sort((a, b) => a.from - b.from);

  const workStart = 8 * 60;
  const workEnd = 20 * 60;
  const slots: { from: string; to: string }[] = [];
  let cursor = workStart;

  for (const ev of timed) {
    if (ev.from > cursor + 29) slots.push({ from: fmtMin(cursor), to: fmtMin(ev.from) });
    cursor = Math.max(cursor, ev.to);
  }
  if (cursor + 29 < workEnd) slots.push({ from: fmtMin(cursor), to: fmtMin(workEnd) });
  return slots;
}

// Picks the best outfit text considering ALL of today's items.
// Priority: non-recurring compromiso > non-recurring evento > non-recurring personal > recurring
function pickOutfit(dayItems: Item[]): { text: string; fromTitle: string } | null {
  const sorted = [
    ...dayItems.filter((i) => !i.recurrence_days?.length && i.type === "compromiso"),
    ...dayItems.filter((i) => !i.recurrence_days?.length && i.type === "evento"),
    ...dayItems.filter((i) => !i.recurrence_days?.length && i.type === "personal"),
    ...dayItems.filter((i) => i.recurrence_days?.length ?? 0 > 0),
  ];
  for (const item of sorted) {
    const text =
      item.cached_recommendation?.recommendation ??
      item.outfit_suggestion ??
      item.cached_recommendation?.outfit_suggestion ??
      null;
    if (text) return { text, fromTitle: item.title };
  }
  return null;
}

export function HomePage({ items, onSettings, onSync, syncing, pendingCount, onItemClick }: Props) {
  const [freeSlotsOpen, setFreeSlotsOpen] = useState(false);
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
    weekday: "long", day: "numeric", month: "long",
  }).format(today);

  const freeSlots = computeFreeSlots(dayItems);
  const outfit = pickOutfit(dayItems);

  return (
    <div className="px-4 pb-4">
      <AppHeader title="Hoy" onSettings={onSettings} onSync={onSync} syncing={syncing} pendingCount={pendingCount} />
      <p className="text-xs text-muted capitalize mb-4 px-0.5">{dayLabel}</p>

      {/* Outfit del día */}
      {outfit && (
        <div className="rounded-2xl border border-border-soft bg-surface p-3 flex gap-3 mb-2">
          <IconShirt size={22} stroke={1.5} className="shrink-0 mt-0.5 text-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] text-muted mb-0.5 uppercase tracking-wide font-semibold">
              Ropa para hoy · {outfit.fromTitle}
            </p>
            <p className="text-sm leading-snug">{outfit.text}</p>
          </div>
        </div>
      )}

      {/* Eventos del día */}
      {dayItems.length === 0 ? (
        <div className="rounded-2xl border border-border-soft bg-surface px-5 py-6 text-center mb-2">
          <p className="text-sm text-muted">Sin eventos para hoy</p>
        </div>
      ) : (
        <div className="space-y-2 mb-2">
          {dayItems.map((item) => {
            const timeLabel = formatTimeRange(item);
            return (
              <button
                key={`${item.id}-${toDateParam(today)}`}
                type="button"
                onClick={() => onItemClick(item)}
                className="w-full rounded-2xl border border-border-soft bg-surface p-3 text-left"
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                    {timeLabel !== "Sin fecha" && (
                      <p className="text-xs text-muted mt-0.5">{timeLabel}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE_COLORS[item.type]}`}>
                    {item.type}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Tiempo libre */}
      {freeSlots.length > 0 && (
        <div className="rounded-2xl border border-border-soft overflow-hidden">
          <button
            type="button"
            onClick={() => setFreeSlotsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5"
          >
            <span className="text-sm font-medium">Tiempo libre hoy</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">
                {freeSlots.length} bloque{freeSlots.length !== 1 ? "s" : ""}
              </span>
              <IconChevronDown
                size={14}
                className={`text-muted transition-transform ${freeSlotsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </div>
          </button>
          {freeSlotsOpen && (
            <div className="border-t border-border-soft px-4 pt-2 pb-3 space-y-1.5">
              {freeSlots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted/40 shrink-0" />
                  <span className="text-xs text-muted">{slot.from} – {slot.to}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
