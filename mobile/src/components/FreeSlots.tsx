import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FreeSlot } from "@/lib/types";
import {
  BUSY_DOT_COLOR,
  BUSY_TEXT_COLORS,
  FREE_DAY_CARD_COLORS,
  FREE_DAY_DOT_COLOR,
  FREE_DAY_TEXT_COLORS,
} from "@/lib/itemPresentation";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function isSameUtcDate(isoDateOnly: string, date: Date): boolean {
  const [year, month, day] = isoDateOnly.split("-").map(Number);
  return year === date.getFullYear() && month === date.getMonth() + 1 && day === date.getDate();
}

// Mismo horario laboral por día de la semana usado en /api/calendar/free-slots.
function workWindowFor(isoDateOnly: string): { start: Date; end: Date } {
  const [year, month, day] = isoDateOnly.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;

  const start = new Date(year, month - 1, day, isWeekend ? 7 : 6, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 0, 0);
  return { start, end };
}

interface TimeSegment {
  type: "free" | "busy";
  start: Date;
  end: Date;
}

function buildDaySegments(day: FreeSlot): TimeSegment[] {
  const { start: windowStart, end: windowEnd } = workWindowFor(day.date);

  const freeBlocks = [...day.free_blocks]
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const segments: TimeSegment[] = [];
  let cursor = windowStart;

  for (const block of freeBlocks) {
    if (block.start > cursor) segments.push({ type: "busy", start: cursor, end: block.start });
    segments.push({ type: "free", start: block.start, end: block.end });
    cursor = block.end > cursor ? block.end : cursor;
  }

  if (cursor < windowEnd) segments.push({ type: "busy", start: cursor, end: windowEnd });

  return segments;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function FreeSlots() {
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("no session");

        const today = startOfDay(new Date());
        const timeMin = addDays(today, -3);
        const timeMax = addDays(today, 4);
        const params = new URLSearchParams({
          time_min: timeMin.toISOString(),
          time_max: timeMax.toISOString(),
        });

        const res = await fetch(`${WEB_URL}/api/calendar/free-slots?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error("free-slots failed");
        if (!cancelled) setSlots(data.days ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (failed || (slots !== null && slots.length === 0)) return null;

  const today = new Date();

  return (
    <div className="rounded-2xl border border-border-soft overflow-hidden mb-4">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-soft">
        <span className="text-sm font-medium flex-1">Días libres</span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${FREE_DAY_DOT_COLOR}`} /> Libre
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${BUSY_DOT_COLOR}`} /> Ocupado
        </span>
      </div>

      {slots === null ? (
        <p className="px-4 py-3 text-sm text-muted">Calculando días libres...</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {slots.map((day) => {
            const isToday = isSameUtcDate(day.date, today);
            const segments = day.free ? [] : buildDaySegments(day);

            return (
              <div
                key={day.date}
                className={`shrink-0 w-28 rounded-xl border px-2.5 py-2 text-xs ${
                  day.free ? FREE_DAY_CARD_COLORS : "border-border-soft"
                } ${isToday ? "ring-2 ring-foreground" : ""}`}
              >
                <p className="font-medium mb-1">
                  {isToday
                    ? "Hoy"
                    : new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
                        new Date(day.date)
                      )}
                </p>
                {day.free ? (
                  <p className={FREE_DAY_TEXT_COLORS}>Libre</p>
                ) : (
                  <ul className="space-y-0.5">
                    {segments.map((segment, idx) => (
                      <li key={idx} className={segment.type === "free" ? FREE_DAY_TEXT_COLORS : BUSY_TEXT_COLORS}>
                        {formatTime(segment.start)}-{formatTime(segment.end)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
