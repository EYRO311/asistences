import { createClient } from "@/lib/supabase/server";
import { ItemList } from "@/components/ItemList";
import { FreeSlots } from "@/components/FreeSlots";
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

export default async function WeekPage() {
  const supabase = await createClient();

  // Misma ventana de 7 días que "Disponibilidad de la semana": 3 antes + hoy + 3 después.
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -3);
  const rangeEnd = addDays(today, 4); // límite exclusivo

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .gte("start_time", rangeStart.toISOString())
    .lt("start_time", rangeEnd.toISOString())
    .order("start_time", { ascending: true, nullsFirst: false });

  const all = (items ?? []) as Item[];
  const pasadas = all.filter((i) => i.start_time && new Date(i.start_time) < today);
  const resto = all.filter((i) => !i.start_time || new Date(i.start_time) >= today);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl px-4 py-8 space-y-8">
      <section>
        <h1 className="font-handwriting text-3xl mb-3">Disponibilidad de la semana</h1>
        <FreeSlots />
      </section>

      <section className="space-y-3">
        <h2 className="font-handwriting text-3xl mb-3">Tareas de esta semana</h2>

        {pasadas.length > 0 && (
          <details className="rounded-lg border border-border-soft">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm text-muted">
              Pasadas ({pasadas.length})
            </summary>
            <div className="px-4 pb-3">
              <ItemList items={pasadas} />
            </div>
          </details>
        )}

        <ItemList items={resto} />
      </section>
    </main>
  );
}
