import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Page } from "@/App";
import type { Item } from "@/lib/types";
import { occurrenceForDate } from "@/lib/recurrence";
import { TYPE_BADGE_COLORS, TYPE_DOT_COLORS, formatTimeRange } from "@/lib/itemPresentation";
import { geocodeLocation, getDailyWeather, type DailyWeather } from "@/lib/weather";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { GoalList, type GoalRow } from "@/components/GoalList";
import { EditGoalPage } from "@/pages/EditGoalPage";
import { RecentEmails } from "@/components/RecentEmails";
import { DecryptedText } from "@/components/DecryptedText";
import { DailyRecommendationButton } from "@/components/DailyRecommendationButton";
import type { PreferredTransport } from "@/lib/types";
import {
  IconChevronDown,
  IconShirt,
  IconSun,
  IconSunHigh,
  IconCloud,
  IconCloudRain,
  IconCloudStorm,
  IconSnowflake,
  IconMist,
} from "@tabler/icons-react";

interface Props {
  items: Item[];
  onRefresh: () => void;
  session: Session;
  onSettings: () => void;
  onSync: () => void;
  syncing: boolean;
  pendingCount: number;
  onItemClick: (item: Item) => void;
  onNavigate: (page: Page) => void;
}

function WeatherIcon({ desc, size = 32 }: { desc: string; size?: number }) {
  const props = { size, stroke: 1.5, "aria-hidden": true } as const;
  if (desc.includes("tormenta")) return <IconCloudStorm {...props} />;
  if (desc.includes("nieve")) return <IconSnowflake {...props} />;
  if (desc.includes("lluvia") || desc.includes("llovizna")) return <IconCloudRain {...props} />;
  if (desc.includes("neblina")) return <IconMist {...props} />;
  if (desc.includes("nublado")) return <IconCloud {...props} />;
  if (desc.includes("parcialmente")) return <IconSunHigh {...props} />;
  return <IconSun {...props} />;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
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

export function HomePage({ items, session, onSettings, onSync, syncing, pendingCount, onItemClick, onNavigate }: Props) {
  const [freeSlotsOpen, setFreeSlotsOpen] = useState(false);
  const [weather, setWeather] = useState<DailyWeather | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [preferredTransport, setPreferredTransport] = useState<PreferredTransport | null>(null);
  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const today = new Date();

  useEffect(() => {
    let cancelled = false;
    async function loadProfileAndWeather() {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, location, preferred_transport")
          .eq("id", session.user.id)
          .single();
        if (cancelled) return;
        if (data?.full_name) setFirstName(data.full_name.split(" ")[0]);
        setPreferredTransport(data?.preferred_transport ?? null);
        if (!data?.location) return;
        const geo = await geocodeLocation(data.location);
        if (cancelled || !geo) return;
        setLocationName(geo.name);
        const todayStr = new Date().toISOString().slice(0, 10);
        const w = await getDailyWeather(geo.latitude, geo.longitude, todayStr);
        if (!cancelled) setWeather(w);
      } catch {
        // clima/nombre son opcionales, no bloqueamos la pantalla
      }
    }
    loadProfileAndWeather();
    return () => { cancelled = true; };
  }, [session.user.id]);

  const loadGoals = useCallback(async () => {
    const { data } = await supabase
      .from("goals")
      .select("id, title, due_date, recurrence_type, goal_items(id, completed)")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    setGoals((data ?? []) as GoalRow[]);
  }, [session.user.id]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

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

      {/* Arriba: día + bienvenida */}
      <p className="text-xs text-muted capitalize px-0.5">{dayLabel}</p>
      <h1 className="font-handwriting text-2xl mb-4 px-0.5">
        {greeting()}{firstName ? `, ${firstName}` : ""}
      </h1>

      {/* Metas */}
      <section className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Mis metas</h2>
          <button type="button" onClick={() => onNavigate("goals")} className="text-xs text-muted hover:text-foreground">
            Ver todas →
          </button>
        </div>
        {goals === null ? (
          <p className="text-sm text-muted">Cargando...</p>
        ) : (
          <GoalList goals={goals} emptyText="No tienes metas activas." onSelect={(g) => setEditingGoalId(g.id)} />
        )}
      </section>

      {/* Recomendación de vestimenta + clima */}
      <section className="mb-4">
        <h2 className="text-sm font-medium mb-2">Recomendación de hoy</h2>
        <div className="rounded-2xl border border-border-soft bg-surface p-3 space-y-3">
          {weather && (
            <div className="flex items-center gap-3">
              <WeatherIcon desc={weather.description} />
              <div className="min-w-0">
                <p className="text-[10px] text-muted truncate">{locationName}</p>
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
          )}

          {outfit ? (
            <div className={`flex gap-2.5 ${weather ? "border-t border-border-soft pt-3" : ""}`}>
              <IconShirt size={20} stroke={1.5} className="shrink-0 mt-0.5 text-muted" aria-hidden />
              <div className="min-w-0">
                <p className="text-[10px] text-muted mb-0.5 uppercase tracking-wide font-semibold">
                  {outfit.fromTitle}
                </p>
                <p className="text-sm leading-snug">{outfit.text}</p>
              </div>
            </div>
          ) : (
            !weather && <p className="text-sm text-muted">Sin recomendación por ahora.</p>
          )}

          <DailyRecommendationButton
            todayItemsCount={dayItems.length}
            preferredTransport={preferredTransport}
          />
        </div>
      </section>

      {/* Tiempo libre */}
      {freeSlots.length > 0 && (
        <div className="rounded-2xl border border-border-soft overflow-hidden mb-4">
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

      {/* Abajo: tareas de hoy */}
      <section className="mb-4">
        <h2 className="text-sm font-medium mb-2">Tareas de hoy</h2>
        {dayItems.length === 0 ? (
          <div className="rounded-2xl border border-border-soft bg-surface px-5 py-6 text-center">
            <p className="text-sm text-muted">Sin eventos para hoy</p>
          </div>
        ) : (
          <div className="space-y-2">
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
                        <DecryptedText value={item.description} className="text-xs text-muted mt-0.5 line-clamp-2" />
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
      </section>

      {/* Abajo: correos */}
      <RecentEmails />

      {editingGoalId && (
        <EditGoalPage
          goalId={editingGoalId}
          onClose={() => setEditingGoalId(null)}
          onSaved={() => { setEditingGoalId(null); loadGoals(); }}
          onDeleted={() => { setEditingGoalId(null); loadGoals(); }}
        />
      )}
    </div>
  );
}
