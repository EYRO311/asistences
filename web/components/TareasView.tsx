"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category, Item } from "@/lib/types";
import { decryptClient } from "@/lib/crypto-client";
import { ItemList } from "@/components/ItemList";
import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";

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

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // semana inicia en lunes
  d.setDate(d.getDate() + diff);
  return d;
}

function inRange(item: Item, start: Date, end: Date): boolean {
  if (!item.start_time) return false;
  const t = new Date(item.start_time).getTime();
  return t >= start.getTime() && t < end.getTime();
}

// "YYYY-MM-DD" en la zona horaria del navegador (suficiente aquí: corre en
// el cliente, en el propio navegador del usuario, sin el problema de TZ del
// servidor).
function localDayStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Section({
  title,
  count,
  items,
  open,
  level = 1,
}: {
  title: string;
  count: number;
  items: Item[];
  open: boolean;
  level?: 1 | 2;
}) {
  return (
    <details open={open} className={level === 1 ? "rounded-lg border border-border-soft" : "border-t border-border-soft"}>
      <summary
        className={`cursor-pointer select-none px-4 py-3 font-medium ${
          level === 1 ? "font-handwriting text-2xl" : "text-sm text-muted"
        }`}
      >
        {title} ({count})
      </summary>
      <div className={level === 1 ? "px-4 pb-3" : "px-4 pb-2"}>
        <ItemList items={items} />
      </div>
    </details>
  );
}

export function TareasView({ items }: { items: Item[] }) {
  // Ubicación desencriptada por item, para poder filtrar por ella.
  const [plainLocations, setPlainLocations] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [day, setDay] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      items.map(async (i) => [i.id, (await decryptClient(i.location)) ?? ""] as const)
    ).then((entries) => {
      if (!cancelled) setPlainLocations(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category && !item.categories?.includes(category)) return false;
      if (day) {
        if (!item.start_time || localDayStr(item.start_time) !== day) return false;
      }
      if (q) {
        const location = plainLocations[item.id] ?? "";
        if (!item.title.toLowerCase().includes(q) && !location.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, search, category, day, plainLocations]);

  const hasFilters = Boolean(search || category || day);

  // Las rutinas recurrentes tienen su propia sección; no se clasifican por
  // start_time porque éste es la primera ocurrencia (pasada) y no representa
  // cuándo ocurre la siguiente.
  const rutinas = filtered.filter((i) => i.recurrence_days && i.recurrence_days.length > 0);
  const noRutinas = filtered.filter((i) => !i.recurrence_days || i.recurrence_days.length === 0);

  const todayStart = startOfDay(new Date());
  const tomorrowStart = addDays(todayStart, 1);
  const soonEnd = addDays(todayStart, 4);
  const weekEnd = addDays(startOfWeek(todayStart), 7);
  const prontoEnd = soonEnd < weekEnd ? soonEnd : weekEnd;

  const pasadas = noRutinas.filter((i) => i.start_time && new Date(i.start_time) < todayStart);
  const hoy = noRutinas.filter((i) => inRange(i, todayStart, tomorrowStart));
  const pronto = noRutinas.filter((i) => inRange(i, tomorrowStart, prontoEnd));
  const estaSemana = noRutinas.filter((i) => prontoEnd < weekEnd && inRange(i, prontoEnd, weekEnd));
  const despues = noRutinas.filter((i) => i.start_time && new Date(i.start_time) >= weekEnd);
  const sinFecha = noRutinas.filter((i) => !i.start_time);

  const expandUpcoming = hoy.length < 4;

  return (
    <>
      <div className="rounded-lg border border-border-soft p-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o ubicación..."
          className="flex-1 min-w-[180px] rounded-md border border-border-soft bg-transparent px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          className="rounded-md border border-border-soft bg-transparent px-2.5 py-1.5 text-sm"
        >
          <option value="">Todas las categorías</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-border-soft bg-transparent px-2.5 py-1.5 text-sm"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); setCategory(""); setDay(""); }}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {hasFilters && filtered.length === 0 ? (
        <p className="text-sm text-muted px-1">No hay tareas que coincidan con el filtro.</p>
      ) : (
        <>
          {rutinas.length > 0 && (
            <Section title="Rutinas" count={rutinas.length} items={rutinas} open />
          )}
          <Section title="Pasadas" count={pasadas.length} items={pasadas} open={false} />
          <Section title="Hoy" count={hoy.length} items={hoy} open />

          <details open={expandUpcoming} className="rounded-lg border border-border-soft">
            <summary className="cursor-pointer select-none px-4 py-3 font-handwriting text-2xl">
              Próximas ({pronto.length + estaSemana.length + despues.length})
            </summary>
            <div className="pb-2">
              <Section title="Pronto" count={pronto.length} items={pronto} open={false} level={2} />
              <Section title="Esta semana" count={estaSemana.length} items={estaSemana} open={expandUpcoming} level={2} />
              <Section title="Después" count={despues.length} items={despues} open={false} level={2} />
            </div>
          </details>

          {sinFecha.length > 0 && <Section title="Sin fecha" count={sinFecha.length} items={sinFecha} open={false} />}
        </>
      )}
    </>
  );
}
