import { useEffect, useMemo, useState } from "react";
import type { Category, Item } from "@/lib/types";
import { CATEGORY_OPTIONS } from "@/lib/itemPresentation";
import { decryptClient } from "@/lib/crypto";
import { ItemCard } from "@/components/ItemCard";
import { AppHeader } from "@/components/AppHeader";
import { IconChevronDown } from "@tabler/icons-react";

function localDayStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
}

function Section({ title, items, defaultOpen = false, onItemClick }: { title: string; items: Item[]; defaultOpen?: boolean; onItemClick: (item: Item) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-soft overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="font-handwriting text-lg">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{items.length}</span>
          <IconChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border-soft pt-2">
          {items.map((item) => <ItemCard key={item.id} item={item} onClick={() => onItemClick(item)} />)}
        </div>
      )}
    </div>
  );
}

interface Props { items: Item[]; onSettings: () => void; onSync: () => void; syncing: boolean; pendingCount: number; onItemClick: (item: Item) => void; }

export function TasksPage({ items, onSettings, onSync, syncing, pendingCount, onItemClick }: Props) {
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
    return () => { cancelled = true; };
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

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(startOfWeek(today), 7);
  const soon = addDays(today, 4) < weekEnd ? addDays(today, 4) : weekEnd;

  const rutinas = filtered.filter((i) => (i.recurrence_days?.length ?? 0) > 0);
  const noRutinas = filtered.filter((i) => !(i.recurrence_days?.length ?? 0));
  const inRange = (i: Item, s: Date, e: Date) => !!i.start_time && new Date(i.start_time) >= s && new Date(i.start_time) < e;

  const pasadas = noRutinas.filter((i) => i.start_time && new Date(i.start_time) < today);
  const hoy = noRutinas.filter((i) => inRange(i, today, tomorrow));
  const pronto = noRutinas.filter((i) => inRange(i, tomorrow, soon));
  const estaSemana = noRutinas.filter((i) => soon < weekEnd && inRange(i, soon, weekEnd));
  const despues = noRutinas.filter((i) => i.start_time && new Date(i.start_time) >= weekEnd);
  const sinFecha = noRutinas.filter((i) => !i.start_time);

  return (
    <div className="px-4 pb-4">
      <AppHeader title="Mis tareas" onSettings={onSettings} onSync={onSync} syncing={syncing} pendingCount={pendingCount} />

      <div className="rounded-2xl border border-border-soft p-3 flex flex-wrap items-center gap-2 mt-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o ubicación..."
          className="flex-1 min-w-35 rounded-lg border border-border-soft bg-surface px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          className="rounded-lg border border-border-soft bg-surface px-2 py-1.5 text-sm"
        >
          <option value="">Categoría</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-lg border border-border-soft bg-surface px-2 py-1.5 text-sm"
        />
        {hasFilters && (
          <button type="button" onClick={() => { setSearch(""); setCategory(""); setDay(""); }} className="text-xs text-muted underline">
            Limpiar
          </button>
        )}
      </div>

      {hasFilters && filtered.length === 0 ? (
        <p className="text-sm text-muted mt-3 px-1">No hay tareas que coincidan con el filtro.</p>
      ) : (
      <div className="space-y-2 mt-2">
        <Section title="Rutinas" items={rutinas} defaultOpen onItemClick={onItemClick} />
        <Section title="Hoy" items={hoy} defaultOpen onItemClick={onItemClick} />

        {(pronto.length + estaSemana.length + despues.length) > 0 && (
          <div className="rounded-2xl border border-border-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-soft">
              <span className="font-handwriting text-lg">Próximas</span>
            </div>
            <div className="p-3 space-y-3">
              {pronto.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Pronto</p>
                  <div className="space-y-1.5">{pronto.map((i) => <ItemCard key={i.id} item={i} onClick={() => onItemClick(i)} />)}</div>
                </div>
              )}
              {estaSemana.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Esta semana</p>
                  <div className="space-y-1.5">{estaSemana.map((i) => <ItemCard key={i.id} item={i} onClick={() => onItemClick(i)} />)}</div>
                </div>
              )}
              {despues.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Después</p>
                  <div className="space-y-1.5">{despues.map((i) => <ItemCard key={i.id} item={i} onClick={() => onItemClick(i)} />)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <Section title="Pasadas" items={pasadas} onItemClick={onItemClick} />
        <Section title="Sin fecha" items={sinFecha} onItemClick={onItemClick} />
      </div>
      )}
    </div>
  );
}
