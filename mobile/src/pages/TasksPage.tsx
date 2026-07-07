import { useState } from "react";
import type { Item } from "@/lib/types";
import { ItemCard } from "@/components/ItemCard";
import { AppHeader } from "@/components/AppHeader";
import { IconChevronDown } from "@tabler/icons-react";

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
}

function Section({ title, items, defaultOpen = false }: { title: string; items: Item[]; defaultOpen?: boolean }) {
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
          {items.map((item) => <ItemCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

interface Props { items: Item[]; onSettings: () => void; }

export function TasksPage({ items, onSettings }: Props) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(startOfWeek(today), 7);
  const soon = addDays(today, 4) < weekEnd ? addDays(today, 4) : weekEnd;

  const rutinas = items.filter((i) => (i.recurrence_days?.length ?? 0) > 0);
  const noRutinas = items.filter((i) => !(i.recurrence_days?.length ?? 0));
  const inRange = (i: Item, s: Date, e: Date) => !!i.start_time && new Date(i.start_time) >= s && new Date(i.start_time) < e;

  const pasadas = noRutinas.filter((i) => i.start_time && new Date(i.start_time) < today);
  const hoy = noRutinas.filter((i) => inRange(i, today, tomorrow));
  const pronto = noRutinas.filter((i) => inRange(i, tomorrow, soon));
  const estaSemana = noRutinas.filter((i) => soon < weekEnd && inRange(i, soon, weekEnd));
  const despues = noRutinas.filter((i) => i.start_time && new Date(i.start_time) >= weekEnd);
  const sinFecha = noRutinas.filter((i) => !i.start_time);

  return (
    <div className="px-4 pb-4">
      <AppHeader title="Mis tareas" onSettings={onSettings} />

      <div className="space-y-2 mt-2">
        <Section title="Rutinas" items={rutinas} defaultOpen />
        <Section title="Hoy" items={hoy} defaultOpen />

        {(pronto.length + estaSemana.length + despues.length) > 0 && (
          <div className="rounded-2xl border border-border-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-soft">
              <span className="font-handwriting text-lg">Próximas</span>
            </div>
            <div className="p-3 space-y-3">
              {pronto.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Pronto</p>
                  <div className="space-y-1.5">{pronto.map((i) => <ItemCard key={i.id} item={i} />)}</div>
                </div>
              )}
              {estaSemana.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Esta semana</p>
                  <div className="space-y-1.5">{estaSemana.map((i) => <ItemCard key={i.id} item={i} />)}</div>
                </div>
              )}
              {despues.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 px-1">Después</p>
                  <div className="space-y-1.5">{despues.map((i) => <ItemCard key={i.id} item={i} />)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <Section title="Pasadas" items={pasadas} />
        <Section title="Sin fecha" items={sinFecha} />
      </div>
    </div>
  );
}
