import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { geocodeLocation, getDailyWeather, type DailyWeather } from "@/lib/weather";
import type { Item, Profile } from "@/lib/types";
import Link from "next/link";
import { PRIORITY_OPTIONS, TYPE_BADGE_COLORS } from "@/lib/itemPresentation";
import { GoalList, type GoalRow } from "@/components/GoalList";
import { GmailInbox } from "@/components/GmailInbox";
import { DailyRecommendationButton } from "@/components/DailyRecommendationButton";
import {
  IconSun,
  IconSunHigh,
  IconCloud,
  IconCloudRain,
  IconCloudStorm,
  IconSnowflake,
  IconMist,
  IconShirt,
} from "@tabler/icons-react";

// ── Weather helpers ─────────────────────────────────────────────────────────

function WeatherIcon({ desc, size = 48 }: { desc: string; size?: number }) {
  const props = { size, stroke: 1.5, "aria-hidden": true } as const;
  if (desc.includes("tormenta")) return <IconCloudStorm {...props} />;
  if (desc.includes("nieve")) return <IconSnowflake {...props} />;
  if (desc.includes("lluvia") || desc.includes("llovizna")) return <IconCloudRain {...props} />;
  if (desc.includes("neblina")) return <IconMist {...props} />;
  if (desc.includes("nublado")) return <IconCloud {...props} />;
  if (desc.includes("parcialmente")) return <IconSunHigh {...props} />;
  return <IconSun {...props} />;
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

// ── Free slots helper ────────────────────────────────────────────────────────

function fmtMinutes(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function computeTodayFreeSlots(
  timedItems: Item[],
  wakeTime: string,
  sleepTime: string,
): { from: string; to: string }[] {
  const [wh, wm] = wakeTime.split(":").map(Number);
  const [sh, sm] = sleepTime.split(":").map(Number);
  const workStart = wh * 60 + wm;
  const workEnd = sh * 60 + sm;

  const busy = timedItems
    .map((i) => {
      const s = new Date(i.start_time!);
      const e = i.end_time ? new Date(i.end_time) : new Date(s.getTime() + 60 * 60 * 1000);
      return { from: s.getHours() * 60 + s.getMinutes(), to: e.getHours() * 60 + e.getMinutes() };
    })
    .sort((a, b) => a.from - b.from);

  const slots: { from: string; to: string }[] = [];
  let cursor = workStart;
  for (const ev of busy) {
    if (ev.from > cursor + 29) slots.push({ from: fmtMinutes(cursor), to: fmtMinutes(ev.from) });
    cursor = Math.max(cursor, ev.to);
  }
  if (cursor + 29 < workEnd) slots.push({ from: fmtMinutes(cursor), to: fmtMinutes(workEnd) });
  return slots;
}

// ── Outfit helper ────────────────────────────────────────────────────────────

function pickOutfitItem(todayItems: Item[]): { item: Item; outfitText: string } | null {
  // Non-routine events take priority over recurring routines
  const sorted = [
    ...todayItems.filter((i) => !i.recurrence_days?.length),
    ...todayItems.filter((i) => i.recurrence_days?.length),
  ];
  for (const item of sorted) {
    const text = item.outfit_suggestion ?? null;
    if (text) return { item, outfitText: text };
  }
  return null;
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
    .select("full_name, location, timezone, wake_time, sleep_time, preferred_transport")
    .eq("id", user.id)
    .single<Pick<Profile, "full_name" | "location" | "timezone" | "wake_time" | "sleep_time" | "preferred_transport">>();

  const profile = profileRaw ?? { full_name: null, location: null, timezone: "America/Mexico_City", wake_time: "06:00", sleep_time: "23:00", preferred_transport: null };
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
  const outfitCard = pickOutfitItem(todayItems);
  const freeSlots = computeTodayFreeSlots(
    timedItems,
    profile.wake_time ?? "06:00",
    profile.sleep_time ?? "23:00",
  );

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

  // Goals pendientes (activas)
  const { data: goalsRaw } = await supabase
    .from("goals")
    .select("id, title, due_date, recurrence_type, goal_items(id, completed)")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const activeGoals = (goalsRaw ?? []) as GoalRow[];

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
    <main className="mx-auto max-w-2xl lg:max-w-6xl px-4 py-6 space-y-6">
      {/* ── Arriba: día + bienvenida ── */}
      <div className="border-b border-border-soft pb-4">
        <p className="text-sm text-muted capitalize">{dateLabel}</p>
        <h1 className="font-handwriting text-3xl mt-0.5">
          {greeting(tz)}{firstName ? `, ${firstName}` : ""}
        </h1>
      </div>

      {/* ── Metas (izquierda) | Recomendación de vestimenta + clima (derecha) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Mis metas</h2>
            <Link href="/metas" className="text-xs text-muted hover:text-foreground">
              Ver todas →
            </Link>
          </div>
          {activeGoals.length > 0 ? (
            <GoalList goals={activeGoals} />
          ) : (
            <div className="rounded-xl border border-border-soft bg-surface px-4 py-6 text-center">
              <p className="text-sm text-muted">No tienes metas activas.</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-medium mb-3">Recomendación de hoy</h2>
          <div className="rounded-xl border border-border-soft bg-surface p-4 space-y-3">
            {weather ? (
              <div className="flex items-center gap-3">
                <WeatherIcon desc={weather.description} size={32} />
                <div className="min-w-0">
                  <p className="text-xs text-muted truncate">{locationName}</p>
                  <p className="text-sm">
                    <span className="font-semibold">
                      {Math.round(weather.tempMaxC)}° / {Math.round(weather.tempMinC)}°
                    </span>
                    <span className="text-muted capitalize">
                      {" "}· {weather.description} · {weather.precipitationProbability}% lluvia
                    </span>
                  </p>
                </div>
              </div>
            ) : profile.location ? (
              <p className="text-xs text-muted">No se pudo obtener el clima para {profile.location}.</p>
            ) : (
              <p className="text-xs text-muted">
                Agrega tu ubicación en{" "}
                <Link href="/settings" className="underline hover:text-foreground">
                  Ajustes
                </Link>{" "}
                para ver el clima del día.
              </p>
            )}

            {tip && <p className="text-xs text-muted border-t border-border-soft pt-3">{tip}</p>}

            {outfitCard ? (
              <div className={`flex gap-3 ${weather || tip ? "border-t border-border-soft pt-3" : ""}`}>
                <IconShirt size={24} stroke={1.5} className="shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs text-muted mb-1">
                    {firstName ? `Para ti hoy, ${firstName}` : "Para hoy"} · {outfitCard.item.title}
                  </p>
                  <p className="text-sm leading-snug">{outfitCard.outfitText}</p>
                </div>
              </div>
            ) : (
              !weather && <p className="text-sm text-muted">Sin recomendación por ahora.</p>
            )}

            <DailyRecommendationButton
              todayItemsCount={todayItems.length}
              preferredTransport={profile.preferred_transport}
            />
          </div>
        </section>
      </div>

      {/* ── Tiempo libre hoy ── */}
      {freeSlots.length > 0 && (
        <details className="rounded-xl border border-border-soft bg-surface group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span className="font-medium text-sm">Tiempo libre hoy</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                {freeSlots.length} bloque{freeSlots.length !== 1 ? "s" : ""}
              </span>
              <svg
                className="h-4 w-4 text-muted transition-transform group-open:rotate-180"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </summary>
          <div className="border-t border-border-soft px-4 pt-2 pb-3 space-y-1.5">
            {freeSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-muted/40 shrink-0" />
                <span className="text-sm text-muted">{slot.from} – {slot.to}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Abajo: tareas de hoy ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Tareas de hoy</h2>
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

                  {item.meet_link && (
                    <a
                      href={item.meet_link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded-full border border-border-soft px-2 py-0.5 text-[10px] hover:bg-surface"
                    >
                      📹 Meet
                    </a>
                  )}

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
                    {item.outfit_suggestion && (
                      <p className="text-xs text-muted truncate">{item.outfit_suggestion}</p>
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

      {/* ── Abajo: correos ── */}
      <GmailInbox />
    </main>
  );
}
