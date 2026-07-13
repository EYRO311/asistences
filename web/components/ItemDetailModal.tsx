"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { sileo } from "sileo";
import type { CachedRecommendation, Item, PreferredTransport, TravelEstimate } from "@/lib/types";
import {
  TYPE_BADGE_COLORS,
  TYPE_LABELS,
  PRIORITY_OPTIONS,
  EFFORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  TRANSPORT_OPTIONS,
  STATUS_LABELS,
  formatDateRange,
  type TablerIcon,
} from "@/lib/itemPresentation";
import {
  IconCar,
  IconBike,
  IconBus,
  IconWalk,
  IconCompass,
  IconMapPin,
  IconSunHigh,
  IconVideo,
  IconSparkles,
  IconRefresh,
  IconX,
  IconChevronDown,
} from "@tabler/icons-react";

// ── Travel block ─────────────────────────────────────────────────────────────

function TravelBlock({
  travel,
  selected,
}: {
  travel: TravelEstimate;
  selected: PreferredTransport | null;
}) {
  const modes = [
    { key: "car" as const, Icon: IconCar as TablerIcon, label: "Auto", data: travel.car },
    { key: "bike" as const, Icon: IconBike as TablerIcon, label: "Bici", data: travel.bike },
    {
      key: "public_transport" as const,
      Icon: IconBus as TablerIcon,
      label: "Transporte público",
      data: travel.publicTransport,
    },
    {
      key: "walking" as const,
      Icon: IconWalk as TablerIcon,
      label: "A pie",
      data: {
        minutes: Math.round(travel.distanceKm / 0.08),
        leaveMinutesBefore: Math.round(travel.distanceKm / 0.08) + 5,
      },
    },
  ];

  const activeMode = modes.find((m) => m.key === selected) ?? modes[0];

  return (
    <div className="rounded-md border border-border-soft bg-background px-3 py-2 text-sm space-y-2">
      <p className="font-medium flex items-center gap-1.5">
        <IconCompass size={14} aria-hidden />
        Cómo llegar ({travel.distanceKm} km)
      </p>
      <div className="rounded-md bg-surface border border-foreground/20 px-3 py-2">
        <p className="font-semibold font-handwriting text-lg flex items-center gap-1.5">
          <activeMode.Icon size={16} aria-hidden />
          {activeMode.label}
        </p>
        <p className="font-handwriting text-base text-muted mt-0.5">
          {activeMode.data.minutes} min de viaje — sal {activeMode.data.leaveMinutesBefore} min antes
        </p>
        {selected === "public_transport" && travel.rideshare && (
          <div className="mt-1.5 border-t border-border-soft pt-1.5">
            <p className="font-medium text-foreground/80 flex items-center gap-1">
              <IconCar size={12} aria-hidden /> Didi / Uber
            </p>
            <p className="font-handwriting text-sm text-muted">
              {travel.rideshare.minutes} min — sal {travel.rideshare.leaveMinutesBefore} min antes ·{" "}
              est. ${travel.rideshare.costRangeMXN[0]}–${travel.rideshare.costRangeMXN[1]} MXN
            </p>
          </div>
        )}
      </div>
      <ul className="space-y-1 font-handwriting text-base text-muted">
        {modes
          .filter((m) => m.key !== (selected ?? "car"))
          .map((m) => (
            <li key={m.key} className="flex items-center gap-1">
              <m.Icon size={11} aria-hidden /> {m.label}: {m.data.minutes} min — sal{" "}
              {m.data.leaveMinutesBefore} min antes
            </li>
          ))}
      </ul>
    </div>
  );
}

// ── Recommendations inline ────────────────────────────────────────────────────

function RecommendationsInline({
  itemId,
  initial,
  selectedTransport,
  onLoad,
}: {
  itemId: string;
  initial: CachedRecommendation | null;
  selectedTransport: PreferredTransport | null;
  onLoad?: (data: CachedRecommendation) => void;
}) {
  const [data, setData] = useState<CachedRecommendation | null>(initial);
  const [loading, setLoading] = useState(false);
  const prevTransport = useRef(selectedTransport);

  async function load(refresh = false, transport?: PreferredTransport | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (refresh) params.set("refresh", "1");
      if (transport) params.set("transport", transport);
      const qs = params.toString();
      const res = await fetch(`/api/items/${itemId}/recommendations${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setData(json);
      onLoad?.(json);
    } catch (e) {
      sileo.error({
        title: "Error",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (prevTransport.current !== selectedTransport) {
      prevTransport.current = selectedTransport;
      if (data) load(true, selectedTransport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTransport]);

  if (!data && !loading) {
    return (
      <button
        type="button"
        onClick={() => load(false, selectedTransport)}
        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border-soft px-3 py-2 text-sm hover:bg-surface"
      >
        <IconSparkles size={13} aria-hidden /> Cargar recomendaciones
      </button>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted">Consultando clima, rutas y generando recomendaciones…</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">
          Recomendaciones
        </p>
        <button
          type="button"
          onClick={() => load(true, selectedTransport)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <IconRefresh size={11} aria-hidden />
          Actualizar
        </button>
      </div>

      {data.travel && <TravelBlock travel={data.travel} selected={selectedTransport} />}

      {(data.recommendation ?? data.outfit_suggestion) && (
        <div className="rounded-md border border-border-soft bg-background px-4 py-3 font-handwriting text-xl leading-relaxed">
          {data.recommendation ?? data.outfit_suggestion}
        </div>
      )}
    </div>
  );
}

// ── Keypoints panel content ───────────────────────────────────────────────────

function KeypointsPanel({
  item,
  recData,
  selectedTransport,
  onTransportChange,
}: {
  item: Item;
  recData: CachedRecommendation | null;
  selectedTransport: PreferredTransport | null;
  onTransportChange: (t: PreferredTransport | null) => void;
}) {
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label;
  const effortLabel = EFFORT_OPTIONS.find((e) => e.value === item.effort)?.label;
  const taskStatusLabel = TASK_STATUS_OPTIONS.find((s) => s.value === item.task_status)?.label;
  const activeTransportOpt = TRANSPORT_OPTIONS.find((o) => o.value === selectedTransport);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Status / priority / effort */}
      {(taskStatusLabel || priorityLabel || effortLabel) && (
        <div className="flex flex-wrap gap-1 md:flex-col md:gap-1">
          {taskStatusLabel && (
            <span className="rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
              {taskStatusLabel}
            </span>
          )}
          {priorityLabel && (
            <span className="rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
              {priorityLabel} prioridad
            </span>
          )}
          {effortLabel && (
            <span className="rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
              {effortLabel} esfuerzo
            </span>
          )}
        </div>
      )}

      {/* Categories */}
      {item.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1 md:flex-col md:gap-1">
          {item.categories.map((c) => (
            <span
              key={c}
              className="rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Transport dropdown */}
      <div className="space-y-1">
        <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Transporte</p>
        <div className="relative">
          {activeTransportOpt && (
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
              <activeTransportOpt.Icon size={11} aria-hidden />
            </span>
          )}
          <select
            value={selectedTransport ?? ""}
            onChange={(e) => onTransportChange((e.target.value as PreferredTransport) || null)}
            className="w-full appearance-none rounded border border-border-soft bg-transparent py-1 pr-5 text-[11px] text-foreground/80 cursor-pointer focus:outline-none focus:border-foreground/40"
            style={{ paddingLeft: activeTransportOpt ? "1.5rem" : "0.375rem" }}
          >
            <option value="">Seleccionar</option>
            {TRANSPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={10}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden
          />
        </div>
      </div>

      {/* Location + weather (compact, once recommendations load) */}
      {recData && (
        <div className="flex flex-col gap-2">
          {recData.location && (
            <div className="flex items-start gap-1 text-[11px] text-muted leading-snug">
              <IconMapPin size={11} className="shrink-0 mt-0.5" aria-hidden />
              <span>{recData.location}</span>
            </div>
          )}
          {recData.weather && (
            <div className="flex items-start gap-1 text-xs text-muted leading-snug font-handwriting">
              <IconSunHigh size={12} className="shrink-0 mt-0.5" aria-hidden />
              <span>
                {recData.weather.description},{" "}
                {Math.round(recData.weather.tempMinC)}°–{Math.round(recData.weather.tempMaxC)}°C,{" "}
                {recData.weather.precipitationProbability}% lluvia
              </span>
            </div>
          )}
        </div>
      )}

      {/* Meet link */}
      {item.meet_link && (
        <a
          href={item.meet_link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground underline leading-snug"
        >
          <IconVideo size={12} aria-hidden />
          Videollamada
        </a>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ItemDetailModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [recData, setRecData] = useState<CachedRecommendation | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<PreferredTransport | null>(null);
  const [keypointsOpen, setKeypointsOpen] = useState(false);

  return (
    <>
      {/* Desktop backdrop */}
      <div
        className="hidden md:block fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        className="
          fixed inset-0 z-50 flex flex-col bg-surface border-border-soft overflow-hidden
          md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
          md:w-full md:max-w-3xl lg:max-w-5xl md:max-h-[92vh] md:rounded-2xl md:border md:shadow-xl
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER: static on all sizes ── */}
        <div className="flex shrink-0 border-b border-border-soft">
          <div className="flex-1 min-w-0 px-4 pt-3 pb-3 border-r border-border-soft">
            <p className="text-[9px] font-semibold text-muted uppercase tracking-widest mb-1.5">
              Topic
            </p>
            <div className="flex items-start gap-2 flex-wrap">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${TYPE_BADGE_COLORS[item.type]}`}
              >
                {TYPE_LABELS[item.type]}
              </span>
              <h2 className="font-handwriting text-2xl leading-tight">{item.title}</h2>
            </div>
          </div>
          <div className="w-36 md:w-52 shrink-0 px-4 pt-3 pb-3">
            <div className="flex items-start justify-between mb-1.5">
              <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Date</p>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:text-foreground -mt-0.5 -mr-1"
                aria-label="Cerrar"
              >
                <IconX size={15} aria-hidden />
              </button>
            </div>
            <p className="text-xs text-foreground/80 leading-snug">{formatDateRange(item)}</p>
          </div>
        </div>

        {/* ── MOBILE: collapsible keypoints toggle ── */}
        <button
          type="button"
          className="md:hidden flex items-center justify-between shrink-0 w-full px-4 py-2.5 border-b border-border-soft"
          onClick={() => setKeypointsOpen((v) => !v)}
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

        {/* ── BODY ── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

          {/* Left column: collapsible on mobile, always visible on desktop */}
          <div
            className={`
              md:flex flex-col shrink-0
              w-full md:w-48 lg:w-56
              overflow-y-auto
              border-b md:border-b-0 md:border-r border-border-soft
              ${keypointsOpen ? "flex" : "hidden"}
              md:max-h-full
            `}
            style={keypointsOpen ? { maxHeight: "42vh" } : undefined}
          >
            <p className="hidden md:block text-[9px] font-semibold text-muted uppercase tracking-widest px-3 pt-3 pb-0">
              Questions / keypoints
            </p>
            <KeypointsPanel
              item={item}
              recData={recData}
              selectedTransport={selectedTransport}
              onTransportChange={setSelectedTransport}
            />
          </div>

          {/* Right column: Notes */}
          <div
            className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 space-y-3"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, rgba(128,128,128,0.1) 27px, rgba(128,128,128,0.1) 28px)",
            }}
          >
            <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Notes</p>

            {item.location && (
              <p className="flex items-start gap-1 text-sm text-muted">
                <IconMapPin size={14} className="shrink-0 mt-0.5" aria-hidden />
                <span>{item.location}</span>
              </p>
            )}

            {item.description && (
              <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
                {item.description}
              </p>
            )}

            {!item.location && !item.description && (
              <p className="text-sm text-muted italic">Sin notas.</p>
            )}

            <div className="border-t border-border-soft pt-3">
              <RecommendationsInline
                itemId={item.id}
                initial={null}
                selectedTransport={selectedTransport}
                onLoad={setRecData}
              />
            </div>
          </div>
        </div>

        {/* ── FOOTER: static on all sizes ── */}
        <div className="shrink-0 border-t border-border-soft px-4 py-3">
          <p className="text-[9px] font-semibold text-muted uppercase tracking-widest mb-1.5">
            Summary
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{STATUS_LABELS[item.status]}</span>
            <div className="flex gap-3">
              {item.notion_url && (
                <a
                  href={item.notion_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted underline hover:text-foreground"
                >
                  Ver en Notion
                </a>
              )}
              <Link
                href={`/items/${item.id}/editar`}
                className="text-xs text-muted underline hover:text-foreground"
                onClick={onClose}
              >
                Editar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
