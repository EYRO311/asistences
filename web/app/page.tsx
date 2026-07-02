import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { geocodeLocation, getDailyWeather, type DailyWeather } from "@/lib/weather";
import type { Item, Profile } from "@/lib/types";
import Link from "next/link";
import { PRIORITY_OPTIONS, TYPE_BADGE_COLORS } from "@/lib/itemPresentation";

// ── Weather helpers ─────────────────────────────────────────────────────────

function weatherEmoji(desc: string): string {
  if (desc.includes("tormenta")) return "⛈️";
  if (desc.includes("nieve")) return "❄️";
  if (desc.includes("lluvia") || desc.includes("llovizna")) return "🌧️";
  if (desc.includes("neblina")) return "🌫️";
  if (desc.includes("nublado")) return "☁️";
  if (desc.includes("parcialmente")) return "🌤️";
  return "☀️";
}

function weatherTip(w: DailyWeather): string | null {
  if (w.precipitationProbability >= 60)
    return "Hay alta probabilidad de lluvia. Lleva paraguas.";
  if (w.tempMaxC >= 32) return "Va a hacer mucho calor. Mantente hidratado.";
  if (w.tempMinC <= 10) return "Va a hacer frío en la mañana. Lleva chamarra.";
  if (w.precipitationProbability >= 30)
    return "Puede llover por la tarde. Ten un paraguas a la mano.";
  return null;
}

// ── Date helpers (timezone-aware, server-side) ───────────────────────────────

function todayString(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // "YYYY-MM-DD"
}

function localDateStr(isoDate: string, tz: string): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone: tz });
}

function todayISOWeekday(todayStr: string): number {
  // Parse the date string as local date to get weekday
  const [y, m, d] = todayStr.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function isTodayItem(item: Item, todayStr: string, weekday: number, tz: string): boolean {
  if (item.start_time && localDateStr(item.start_time, tz) === todayStr) return true;
  if (
    item.recurrence_days?.length &&
    item.recurrence_start_time &&
    item.recurrence_end_time &&
    item.start_time
  ) {
    const startStr = localDateStr(item.start_time, tz);
    if (startStr <= todayStr && item.recurrence_days.includes(weekday)) return true;
  }
  return false;
}

function occurrenceToday(item: Item, todayStr: string): Item {
  if (!item.recurrence_days?.length) return item;
  const [y, m, d] = todayStr.split("-").map(Number);
  const [sh, sm] = item.recurrence_start_time!.split(":").map(Number);
  const [eh, em] = item.recurrence_end_time!.split(":").map(Number);
  const start = new Date(y, m - 1, d, sh, sm);
  const end = new Date(y, m - 1, d, eh, em);
  return { ...item, start_time: start.toISOString(), end_time: end.toISOString() };
}

// ── Greeting ─────────────────────────────────────────────────────────────────

function greeting(tz: string): string {
  const hour = parseInt(
    new Date().toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: tz })
  );
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const service = createServiceRoleClient();

  const { data: profileRaw } = await service
    .from("profiles")
    .select("full_name, location, timezone")
    .eq("id", user.id)
    .single<Pick<Profile, "full_name" | "location" | "timezone">>();

  const profile = profileRaw ?? { full_name: null, location: null, timezone: "America/Mexico_City" };
  const tz = profile.timezone ?? "America/Mexico_City";
  const today = todayString(tz);
  const weekday = todayISOWeekday(today);

  const { data: itemsRaw } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  const items = (itemsRaw ?? []) as Item[];

  // Today's items
  const todayItems = items
    .filter((i) => isTodayItem(i, today, weekday, tz))
    .map((i) => occurrenceToday(i, today))
    .sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });

  const allDayItems = todayItems.filter((i) => i.all_day);
  const timedItems = todayItems.filter((i) => !i.all_day && i.start_time);

  // Pending tasks: not done, no specific time today
  const todayIds = new Set(todayItems.map((i) => i.id));
  const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  const pending = items
    .filter((i) => i.task_status !== "listo" && !todayIds.has(i.id) && !i.start_time)
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority ?? ""] ?? 3) - (PRIORITY_ORDER[b.priority ?? ""] ?? 3)
    )
    .slice(0, 6);

  // Weather
  let weather: DailyWeather | null = null;
  let locationName: string | null = profile.location;

  if (profile.location) {
    try {
      const geo = await geocodeLocation(profile.location);
      if (geo) {
        locationName = geo.name;
        weather = await getDailyWeather(geo.latitude, geo.longitude, today);
      }
    } catch {
      // best-effort
    }
  }

  const tip = weather ? weatherTip(weather) : null;
  const firstName = profile.full_name?.split(" ")[0];

  const [tyear, tmonth, tday] = today.split("-").map(Number);
  const dateLabel = new Date(tyear, tmonth - 1, tday).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const now = new Date();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      {/* ── Greeting ── */}
      <div>
        <p className="text-sm text-muted capitalize">{dateLabel}</p>
        <h1 className="font-handwriting text-3xl mt-0.5">
          {greeting(tz)}{firstName ? `, ${firstName}` : ""}
        </h1>
      </div>

      {/* ── Weather ── */}
      {weather ? (
        <div className="rounded-xl border border-border-soft bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-5xl leading-none">{weatherEmoji(weather.description)}</span>
              <div>
                <p className="text-xs text-muted mb-0.5">{locationName}</p>
                <p className="text-2xl font-semibold">
                  {Math.round(weather.tempMaxC)}° / {Math.round(weather.tempMinC)}°
                </p>
                <p className="text-sm capitalize text-muted">{weather.description}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-medium">{weather.precipitationProbability}%</p>
              <p className="text-xs text-muted">prob. lluvia</p>
            </div>
          </div>
          {tip && (
            <p className="mt-3 pt-3 border-t border-border-soft text-sm text-muted">{tip}</p>
          )}
        </div>
      ) : profile.location ? (
        <div className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-muted">
          No se pudo obtener el clima para {profile.location}.
        </div>
      ) : (
        <div className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-muted">
          Agrega tu ubicación en{" "}
          <Link href="/settings" className="underline hover:text-foreground">
            Ajustes
          </Link>{" "}
          para ver el clima del día.
        </div>
      )}

      {/* ── Agenda hoy ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Agenda de hoy</h2>
          <Link href="/semana" className="text-xs text-muted hover:text-foreground">
            Ver semana →
          </Link>
        </div>

        {allDayItems.length === 0 && timedItems.length === 0 ? (
          <div className="rounded-lg border border-border-soft bg-surface px-4 py-6 text-center">
            <p className="text-sm text-muted">No tienes eventos hoy.</p>
            <Link
              href="/new"
              className="mt-2 inline-block text-sm underline hover:text-foreground text-muted"
            >
              Crear tarea
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {allDayItems.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}/editar`}
                className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface px-3 py-2.5 hover:bg-background transition-colors"
              >
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${TYPE_BADGE_COLORS[item.type]}`}
                >
                  {item.type === "compromiso" ? "Comp." : item.type === "personal" ? "Pers." : "Evento"}
                </span>
                <span className="text-sm font-medium truncate flex-1">{item.title}</span>
                <span className="text-xs text-muted shrink-0">Todo el día</span>
              </Link>
            ))}

            {timedItems.map((item) => {
              const start = new Date(item.start_time!);
              const end = item.end_time ? new Date(item.end_time) : null;
              const isNow = start <= now && (!end || end >= now);
              const isPast = end ? end < now : start < now;

              return (
                <Link
                  key={item.id}
                  href={`/items/${item.id}/editar`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-background transition-colors ${
                    isNow
                      ? "border-foreground bg-surface"
                      : "border-border-soft bg-surface"
                  } ${isPast ? "opacity-50" : ""}`}
                >
                  <div className="shrink-0 text-right w-14">
                    <p className="text-xs font-medium leading-none">
                      {start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {end && (
                      <p className="text-[10px] text-muted mt-0.5">
                        {end.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>

                  <div className="w-px self-stretch bg-border-soft shrink-0" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.location && (
                      <p className="text-xs text-muted truncate">{item.location}</p>
                    )}
                  </div>

                  {isNow && (
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Pendientes ── */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Pendientes</h2>
            <Link href="/tareas" className="text-xs text-muted hover:text-foreground">
              Ver todas →
            </Link>
          </div>

          <div className="space-y-2">
            {pending.map((item) => {
              const priorityOpt = PRIORITY_OPTIONS.find((o) => o.value === item.priority);
              return (
                <Link
                  key={item.id}
                  href={`/items/${item.id}/editar`}
                  className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface px-3 py-2.5 hover:bg-background transition-colors"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      item.priority === "alta"
                        ? "bg-red-500"
                        : item.priority === "media"
                        ? "bg-yellow-500"
                        : item.priority === "baja"
                        ? "bg-green-500"
                        : "bg-muted/40"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.due_date && (
                      <p className="text-xs text-muted">
                        Vence{" "}
                        {new Date(item.due_date).toLocaleDateString("es-MX", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  {priorityOpt && (
                    <span className="text-xs text-muted shrink-0">{priorityOpt.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
