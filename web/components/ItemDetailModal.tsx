"use client";

import { useState } from "react";
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
  IconShirt,
  IconVideo,
  IconSparkles,
  IconRefresh,
  IconX,
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
    { key: "public_transport" as const, Icon: IconBus as TablerIcon, label: "Transporte público", data: travel.publicTransport },
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
        <p className="font-semibold flex items-center gap-1.5 font-handwriting text-base">
          <activeMode.Icon size={14} aria-hidden />
          {activeMode.label}
        </p>
        <p className="font-handwriting text-sm text-muted mt-0.5">
          {activeMode.data.minutes} min de viaje — sal {activeMode.data.leaveMinutesBefore} min antes
        </p>
        {selected === "public_transport" && travel.rideshare && (
          <div className="mt-1.5 border-t border-border-soft pt-1.5">
            <p className="font-medium text-foreground/80 flex items-center gap-1">
              <IconCar size={12} aria-hidden /> Didi / Uber
            </p>
            <p className="text-xs text-muted">
              {travel.rideshare.minutes} min — sal {travel.rideshare.leaveMinutesBefore} min antes ·{" "}
              est. ${travel.rideshare.costRangeMXN[0]}–${travel.rideshare.costRangeMXN[1]} MXN
            </p>
          </div>
        )}
      </div>
      <ul className="space-y-0.5 font-handwriting text-sm text-muted">
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
}: {
  itemId: string;
  initial: CachedRecommendation | null;
}) {
  const [data, setData] = useState<CachedRecommendation | null>(initial);
  const [loading, setLoading] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<PreferredTransport | null>(
    initial?.preferredTransport ?? null
  );

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
      setSelectedTransport(json.preferredTransport ?? transport ?? null);
    } catch (e) {
      sileo.error({
        title: "Error",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleTransportClick(value: PreferredTransport) {
    const next = value === selectedTransport ? null : value;
    setSelectedTransport(next);
    if (data) load(true, next);
  }

  const transportSelector = (
    <div className="flex flex-wrap gap-1">
      {TRANSPORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={loading}
          onClick={() => handleTransportClick(opt.value)}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50 ${
            selectedTransport === opt.value
              ? "border-foreground bg-foreground text-background"
              : "border-border-soft hover:bg-surface"
          }`}
        >
          <opt.Icon size={11} aria-hidden />
          {opt.label}
        </button>
      ))}
    </div>
  );

  if (!data && !loading) {
    return (
      <div className="space-y-2">
        {transportSelector}
        <button
          type="button"
          onClick={() => load(false, selectedTransport)}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border-soft px-3 py-2 text-sm hover:bg-surface"
        >
          <IconSparkles size={13} aria-hidden /> Cargar recomendaciones
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {transportSelector}
        <p className="text-sm text-muted">Consultando clima, rutas y generando recomendaciones…</p>
      </div>
    );
  }

  if (!data) return null;

  const transportChanged = selectedTransport !== (data.preferredTransport ?? null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Transporte</p>
        <button
          type="button"
          onClick={() => load(true, selectedTransport)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <IconRefresh size={11} aria-hidden />
          {transportChanged ? "Recalcular" : "Actualizar"}
        </button>
      </div>

      {transportSelector}

      {data.location && (
        <p className="flex items-center gap-1 text-sm text-muted">
          <IconMapPin size={13} aria-hidden />
          {data.location}
        </p>
      )}

      {data.weather && (
        <p className="flex items-center gap-1 font-handwriting text-base text-muted">
          <IconSunHigh size={13} aria-hidden />
          {data.weather.description}, {Math.round(data.weather.tempMinC)}°–
          {Math.round(data.weather.tempMaxC)}°C, {data.weather.precipitationProbability}% lluvia
        </p>
      )}

      {data.travel && <TravelBlock travel={data.travel} selected={selectedTransport} />}

      {(data.recommendation ?? data.outfit_suggestion) && (
        <div className="rounded-md border border-border-soft bg-background px-3 py-2 font-handwriting text-base leading-snug">
          {data.recommendation ?? data.outfit_suggestion}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ItemDetailModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label;
  const effortLabel = EFFORT_OPTIONS.find((e) => e.value === item.effort)?.label;
  const taskStatusLabel = TASK_STATUS_OPTIONS.find((s) => s.value === item.task_status)?.label;

  const hasKeypoints =
    taskStatusLabel || priorityLabel || effortLabel || item.categories?.length > 0 || item.outfit_suggestion || item.meet_link;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/60 px-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-2xl flex flex-col rounded-t-2xl md:rounded-2xl border border-border-soft bg-surface shadow-xl overflow-hidden"
        style={{ maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER: Topic | Date ── */}
        <div className="flex shrink-0 border-b border-border-soft">
          {/* Topic */}
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

          {/* Date + close */}
          <div className="w-36 md:w-44 shrink-0 px-4 pt-3 pb-3">
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

        {/* ── BODY: Questions/Keypoints | Notes ── */}
        <div className="flex flex-1 min-h-0" style={{ minHeight: 260 }}>
          {/* Left column — Questions / keypoints */}
          <div className="w-32 md:w-40 shrink-0 border-r border-border-soft overflow-y-auto p-3 space-y-3">
            <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">
              Questions / keypoints
            </p>

            {!hasKeypoints && (
              <p className="text-[11px] text-muted italic">Sin datos adicionales.</p>
            )}

            {/* Status / priority / effort */}
            {(taskStatusLabel || priorityLabel || effortLabel) && (
              <div className="space-y-1">
                {taskStatusLabel && (
                  <span className="block rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
                    {taskStatusLabel}
                  </span>
                )}
                {priorityLabel && (
                  <span className="block rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
                    {priorityLabel} prioridad
                  </span>
                )}
                {effortLabel && (
                  <span className="block rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center">
                    {effortLabel} esfuerzo
                  </span>
                )}
              </div>
            )}

            {/* Categories */}
            {item.categories?.length > 0 && (
              <div className="space-y-1">
                {item.categories.map((c) => (
                  <span
                    key={c}
                    className="block rounded border border-border-soft px-1.5 py-0.5 text-[11px] text-center"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Outfit */}
            {item.outfit_suggestion && (
              <div className="flex items-start gap-1 text-[11px] text-muted leading-snug">
                <IconShirt size={12} className="shrink-0 mt-0.5" aria-hidden />
                <span>{item.outfit_suggestion}</span>
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

          {/* Right column — Notes (lined paper) */}
          <div
            className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, rgba(128,128,128,0.1) 27px, rgba(128,128,128,0.1) 28px)",
            }}
          >
            <p className="text-[9px] font-semibold text-muted uppercase tracking-widest">Notes</p>

            {/* Location */}
            {item.location && (
              <p className="flex items-start gap-1 text-sm text-muted">
                <IconMapPin size={14} className="shrink-0 mt-0.5" aria-hidden />
                <span>{item.location}</span>
              </p>
            )}

            {/* Description */}
            {item.description && (
              <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
                {item.description}
              </p>
            )}

            {!item.location && !item.description && (
              <p className="text-sm text-muted italic">Sin notas.</p>
            )}

            {/* Recommendations */}
            <div className="border-t border-border-soft pt-3">
              <RecommendationsInline
                itemId={item.id}
                initial={item.cached_recommendation ?? null}
              />
            </div>
          </div>
        </div>

        {/* ── FOOTER: Summary ── */}
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
    </div>
  );
}
