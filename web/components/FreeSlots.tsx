"use client";

import { useEffect, useState } from "react";
import type { FreeSlot } from "@/lib/types";
import {
  BUSY_DOT_COLOR,
  BUSY_TEXT_COLORS,
  FREE_DAY_CARD_COLORS,
  FREE_DAY_DOT_COLOR,
  FREE_DAY_TEXT_COLORS,
} from "@/lib/itemPresentation";
import { IconChevronDown } from "@tabler/icons-react";

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
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom ... 6=sáb
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
    if (block.start > cursor) {
      segments.push({ type: "busy", start: cursor, end: block.start });
    }
    segments.push({ type: "free", start: block.start, end: block.end });
    cursor = block.end > cursor ? block.end : cursor;
  }

  if (cursor < windowEnd) {
    segments.push({ type: "busy", start: cursor, end: windowEnd });
  }

  return segments;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function FreeSlots() {
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const today = startOfDay(new Date());
    // 3 días antes + hoy + 3 días después = 7 días, con hoy en medio.
    const timeMin = addDays(today, -3);
    const timeMax = addDays(today, 4); // límite exclusivo (medianoche del 4to día después)

    const params = new URLSearchParams({
      time_min: timeMin.toISOString(),
      time_max: timeMax.toISOString(),
    });

    fetch(`/api/calendar/free-slots?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al obtener huecos libres");
        setSlots(data.days ?? data);
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted">Calculando días libres...</p>;
  }

  if (failed) {
    return <p className="text-sm text-muted">Sin información de disponibilidad.</p>;
  }

  if (!slots || slots.length === 0) {
    return <p className="text-sm text-muted">Sin información de disponibilidad.</p>;
  }

  const today = new Date();

  return (
    <div>
      {/* Toggle — solo visible en móvil */}
      <button
        type="button"
        className="sm:hidden flex items-center gap-2 mb-2 text-sm text-muted hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${FREE_DAY_DOT_COLOR}`} />
            Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${BUSY_DOT_COLOR}`} />
            Ocupado
          </span>
        </span>
        <IconChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* Leyenda — solo en desktop */}
      <div className="hidden sm:flex mb-2 items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${FREE_DAY_DOT_COLOR}`} />
          Libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${BUSY_DOT_COLOR}`} />
          Ocupado
        </span>
      </div>

      {/* Cards: colapsadas en móvil, siempre visibles en desktop */}
      <ul className={`grid gap-2 sm:grid-cols-7 ${open ? "grid-cols-1" : "hidden sm:grid"}`}>
        {slots.map((day) => {
          const isToday = isSameUtcDate(day.date, today);
          const segments = day.free ? [] : buildDaySegments(day);

          return (
            <li
              key={day.date}
              className={`rounded-md border px-2 py-2 text-xs ${
                day.free ? FREE_DAY_CARD_COLORS : "border-border-soft"
              } ${isToday ? "ring-2 ring-foreground" : ""}`}
            >
              <p className="font-medium">
                {isToday
                  ? "Hoy"
                  : new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
                      new Date(day.date)
                    )}
              </p>
              {day.free ? (
                <p className={FREE_DAY_TEXT_COLORS}>Libre</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {segments.map((segment, idx) => (
                    <li key={idx} className={segment.type === "free" ? FREE_DAY_TEXT_COLORS : BUSY_TEXT_COLORS}>
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
