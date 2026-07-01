import { createClient } from "@/lib/supabase/server";
import { ItemList } from "@/components/ItemList";
import type { Item } from "@/lib/types";

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

export default async function TareasPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  const all = (items ?? []) as Item[];

  // Las rutinas recurrentes tienen su propia sección; no se clasifican por
  // start_time porque éste es la primera ocurrencia (pasada) y no representa
  // cuándo ocurre la siguiente.
  const rutinas = all.filter((i) => i.recurrence_days && i.recurrence_days.length > 0);
  const noRutinas = all.filter((i) => !i.recurrence_days || i.recurrence_days.length === 0);

  const todayStart = startOfDay(new Date());
  const tomorrowStart = addDays(todayStart, 1);
  const soonEnd = addDays(todayStart, 4); // "pronto" = los próximos 3 días
  const weekEnd = addDays(startOfWeek(todayStart), 7); // fin de la semana actual (próximo lunes)
  const prontoEnd = soonEnd < weekEnd ? soonEnd : weekEnd;

  const pasadas = noRutinas.filter((i) => i.start_time && new Date(i.start_time) < todayStart);
  const hoy = noRutinas.filter((i) => inRange(i, todayStart, tomorrowStart));
  const pronto = noRutinas.filter((i) => inRange(i, tomorrowStart, prontoEnd));
  const estaSemana = noRutinas.filter((i) => prontoEnd < weekEnd && inRange(i, prontoEnd, weekEnd));
  const despues = noRutinas.filter((i) => i.start_time && new Date(i.start_time) >= weekEnd);
  const sinFecha = noRutinas.filter((i) => !i.start_time);

  const expandUpcoming = hoy.length < 4;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl px-4 py-8 space-y-3">
      <h1 className="font-handwriting text-3xl mb-3">Todas mis tareas</h1>

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
    </main>
  );
}
