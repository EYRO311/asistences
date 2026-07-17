import { useEffect, useRef, useState } from "react";
import type { CachedRecommendation, Item, PreferredTransport, TravelEstimate } from "@/lib/types";
import {
  TYPE_BADGE_COLORS,
  TYPE_LABELS,
  PRIORITY_OPTIONS,
  EFFORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  STATUS_LABELS,
  TRANSPORT_OPTIONS,
  formatDateRange,
  getPersonalizedQuestions,
} from "@/lib/itemPresentation";
import { supabase } from "@/lib/supabase";
import { upsertItem, updateLocalItem } from "@/db/items";
import { decryptClient, encryptClient } from "@/lib/crypto";
import {
  IconX,
  IconChevronDown,
  IconMapPin,
  IconCompass,
  IconSunHigh,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

// Picks the best travel mode to show: preferred first, then car as default
function getTravelMode(travel: TravelEstimate, preferred: PreferredTransport | null | undefined) {
  const key = preferred ?? "car";
  const mode = TRANSPORT_OPTIONS.find((o) => o.value === key);
  const data =
    key === "car" ? travel.car
    : key === "bike" ? travel.bike
    : key === "public_transport" ? travel.publicTransport
    : { minutes: Math.round(travel.distanceKm / 0.08), leaveMinutesBefore: Math.round(travel.distanceKm / 0.08) + 5 };
  return { mode, data };
}

export function ItemDetailModal({
  item,
  onClose,
  onEdit,
}: {
  item: Item;
  onClose: () => void;
  onEdit?: (item: Item) => void;
}) {
  const [keypointsOpen, setKeypointsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [liveRec, setLiveRec] = useState<CachedRecommendation | null>(item.cached_recommendation ?? null);
  const [fetchingRec, setFetchingRec] = useState(false);
  const fetchedRef = useRef(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [plainDescription, setPlainDescription] = useState<string | null>(null);
  const [plainLocation, setPlainLocation] = useState<string | null>(null);
  const baseQuestions = getPersonalizedQuestions(item.categories ?? []);
  // Si al item le falta ubicación, la pedimos aquí también (para clima/traslado)
  // en vez de forzar al usuario a ir a editar la tarea.
  const questions = plainLocation
    ? baseQuestions
    : [
        {
          id: "location",
          question: "¿Dónde será esto? (para clima y recomendaciones)",
          kind: "text" as const,
          placeholder: "Calle, ciudad, país...",
        },
        ...baseQuestions,
      ];

  useEffect(() => {
    decryptClient(item.description ?? null).then(setPlainDescription);
    decryptClient(item.location ?? null).then(setPlainLocation);
  }, [item.description, item.location]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Genera la recomendación la primera vez que se abre el modal si no existe
  useEffect(() => {
    if (liveRec || fetchedRef.current) return;
    fetchedRef.current = true;

    async function generate() {
      setFetchingRec(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;

        const res = await fetch(`${WEB_URL}/api/items/${item.id}/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const rec: CachedRecommendation = await res.json();
        setLiveRec(rec);
        // Persiste en SQLite local para que esté disponible offline
        await upsertItem({ ...item, cached_recommendation: rec }).catch(() => {});
      } catch {
        // recomendaciones son opcionales, no bloqueamos el modal
      } finally {
        setFetchingRec(false);
      }
    }

    generate();
  }, [item.id]);

  async function loadPersonalized() {
    setFetchingRec(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const locationAnswer = answers["location"]?.trim();
      const res = await fetch(`${WEB_URL}/api/items/${item.id}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          answers: questions
            .filter((q) => q.id !== "location")
            .map((q) => ({ question: q.question, answer: answers[q.id] ?? "" })),
          location: locationAnswer || undefined,
        }),
      });
      if (!res.ok) return;

      const rec: CachedRecommendation = await res.json();
      setLiveRec(rec);
      setCustomOpen(false);
      // El backend ya guardó la ubicación en el item (Supabase); reflejarla
      // localmente también para que se muestre desencriptada sin esperar sync.
      if (locationAnswer && !plainLocation) {
        setPlainLocation(locationAnswer);
        const encryptedLocation = await encryptClient(locationAnswer);
        await updateLocalItem(item.id, { location: encryptedLocation }).catch(() => {});
      }
      await upsertItem({ ...item, cached_recommendation: rec }).catch(() => {});
    } finally {
      setFetchingRec(false);
    }
  }

  function close() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label;
  const effortLabel = EFFORT_OPTIONS.find((e) => e.value === item.effort)?.label;
  const taskStatusLabel = TASK_STATUS_OPTIONS.find((s) => s.value === item.task_status)?.label;
  const hasKeypoints = !!priorityLabel || !!effortLabel || !!taskStatusLabel || item.categories?.length > 0;

  const rec = liveRec;
  const { mode: travelMode, data: travelData } = rec?.travel
    ? getTravelMode(rec.travel, rec.preferredTransport)
    : { mode: null, data: null };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-250"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={close}
        aria-hidden
      />

      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-surface rounded-t-3xl shadow-xl transition-transform duration-250"
        style={{
          maxHeight: "90vh",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <span className="h-1 w-10 rounded-full bg-border-soft" />
        </div>

        {/* ── HEADER — Cornell "Topic" ─────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-2 pb-3 border-b border-border-soft shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="mb-1.5">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[item.type]}`}>
                {TYPE_LABELS[item.type]}
              </span>
            </div>
            <h2 className="font-handwriting text-2xl leading-tight">{item.title}</h2>
            <p className="text-xs text-muted mt-1 leading-snug">{formatDateRange(item)}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-background"
            aria-label="Cerrar"
          >
            <IconX size={16} aria-hidden />
          </button>
        </div>

        {/* ── KEYPOINTS — Cornell "Questions / Keypoints" ──────────────── */}
        {hasKeypoints && (
          <div className="border-b border-border-soft shrink-0">
            <button
              type="button"
              onClick={() => setKeypointsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-2.5"
            >
              <span className="text-[9px] font-semibold text-muted uppercase tracking-widest">
                Questions / Keypoints
              </span>
              <IconChevronDown
                size={13}
                className={`text-muted transition-transform duration-200 ${keypointsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {keypointsOpen && (
              <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                {taskStatusLabel && (
                  <span className="rounded border border-border-soft px-2 py-0.5 text-[11px]">{taskStatusLabel}</span>
                )}
                {priorityLabel && (
                  <span className="rounded border border-border-soft px-2 py-0.5 text-[11px]">{priorityLabel} prioridad</span>
                )}
                {effortLabel && (
                  <span className="rounded border border-border-soft px-2 py-0.5 text-[11px]">{effortLabel} esfuerzo</span>
                )}
                {item.categories?.map((c) => (
                  <span key={c} className="rounded border border-border-soft px-2 py-0.5 text-[11px]">{c}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NOTES — Cornell "Notes" (lined paper) ────────────────────── */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-5 space-y-3"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, rgba(128,128,128,0.1) 27px, rgba(128,128,128,0.1) 28px)",
          }}
        >
          <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Notes</p>

          {plainLocation && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <IconMapPin size={14} className="shrink-0 mt-0.5" aria-hidden />
              {plainLocation}
            </p>
          )}

          {plainDescription ? (
            <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
              {plainDescription}
            </p>
          ) : (
            !plainLocation && <p className="text-sm text-muted italic">Sin notas.</p>
          )}

          {/* ── Sugerencia personalizada ──────────────────────────────── */}
          <div>
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted"
            >
              <IconWand size={13} aria-hidden />
              Sugerencia personalizada
            </button>

            {customOpen && (
              <div className="mt-2 rounded-xl border border-border-soft bg-background px-3 py-3 space-y-3">
                <p className="text-xs text-muted">
                  Responde lo que aplique — con esto la recomendación es más precisa.
                </p>
                {questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-xs font-medium mb-1.5">{q.question}</p>
                    {q.kind === "choice" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {q.options?.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [q.id]: prev[q.id] === opt ? "" : opt }))
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              answers[q.id] === opt
                                ? "border-foreground bg-foreground text-background"
                                : "border-border-soft"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.placeholder}
                        className="w-full rounded-lg border border-border-soft bg-surface px-2.5 py-2 text-xs"
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={loadPersonalized}
                  disabled={fetchingRec}
                  className="w-full rounded-lg bg-foreground text-background py-2 text-xs font-medium disabled:opacity-50"
                >
                  {fetchingRec ? "Generando..." : "Generar recomendación personalizada"}
                </button>
              </div>
            )}
          </div>

          {/* ── Generando recomendación ──────────────────────────────── */}
          {fetchingRec && !customOpen && (
            <div className="flex items-center gap-2 text-muted text-sm">
              <IconSparkles size={14} className="shrink-0 animate-pulse" aria-hidden />
              <span>Generando recomendación...</span>
            </div>
          )}

          {/* ── Viaje: sal X min antes ───────────────────────────────── */}
          {rec?.travel && travelMode && travelData && (
            <div className="rounded-xl border border-border-soft bg-background px-4 py-3 space-y-2">
              <p className="text-[9px] font-semibold text-muted uppercase tracking-widest flex items-center gap-1">
                <IconCompass size={11} aria-hidden />
                Cómo llegar · {rec.travel.distanceKm} km
              </p>
              <div className="flex items-center gap-2">
                <travelMode.Icon size={15} stroke={1.5} aria-hidden />
                <div>
                  <p className="font-handwriting text-xl leading-none">{travelMode.label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {travelData.minutes} min de viaje —{" "}
                    <span className="text-foreground font-semibold">sal {travelData.leaveMinutesBefore} min antes</span>
                  </p>
                </div>
              </div>
              {/* Otras opciones de transporte */}
              <div className="pt-1 border-t border-border-soft space-y-1">
                {TRANSPORT_OPTIONS.filter((o) => o.value !== (rec.preferredTransport ?? "car")).map((o) => {
                  const d =
                    o.value === "car" ? rec.travel!.car
                    : o.value === "bike" ? rec.travel!.bike
                    : o.value === "public_transport" ? rec.travel!.publicTransport
                    : { minutes: Math.round(rec.travel!.distanceKm / 0.08), leaveMinutesBefore: Math.round(rec.travel!.distanceKm / 0.08) + 5 };
                  return (
                    <p key={o.value} className="text-xs text-muted flex items-center gap-1.5">
                      <o.Icon size={11} stroke={1.5} aria-hidden />
                      {o.label}: {d.minutes} min — sal {d.leaveMinutesBefore} min antes
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Clima ────────────────────────────────────────────────── */}
          {rec?.weather && (
            <p className="flex items-start gap-1.5 text-muted font-handwriting text-base leading-snug">
              <IconSunHigh size={14} className="shrink-0 mt-0.5" aria-hidden />
              {rec.weather.description},{" "}
              {Math.round(rec.weather.tempMinC)}°–{Math.round(rec.weather.tempMaxC)}°C,{" "}
              {rec.weather.precipitationProbability}% lluvia
            </p>
          )}

          {/* ── Recomendación IA ─────────────────────────────────────── */}
          {(rec?.recommendation ?? item.outfit_suggestion) && (
            <div className="rounded-xl border border-border-soft bg-background px-4 py-3 font-handwriting text-xl leading-relaxed">
              {rec?.recommendation ?? item.outfit_suggestion}
            </div>
          )}

          {item.meet_link && (
            <a
              href={item.meet_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted underline"
            >
              Unirse a videollamada
            </a>
          )}
        </div>

        {/* ── FOOTER — Cornell "Summary" ────────────────────────────────── */}
        <div className="shrink-0 border-t border-border-soft px-5 py-3">
          <p className="text-[9px] font-semibold text-muted uppercase tracking-widest mb-1.5">Summary</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{STATUS_LABELS[item.status]}</span>
            <div className="flex items-center gap-3">
              {item.notion_url && (
                <a href={item.notion_url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">
                  Ver en Notion
                </a>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="text-xs text-muted underline hover:text-foreground"
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
