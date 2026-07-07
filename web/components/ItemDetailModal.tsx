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
    { key: "walking" as const, Icon: IconWalk as TablerIcon, label: "A pie", data: { minutes: Math.round(travel.distanceKm / 0.08), leaveMinutesBefore: Math.round(travel.distanceKm / 0.08) + 5 } },
  ];

  const activeMode = modes.find((m) => m.key === selected) ?? modes[0];

  return (
    <div className="rounded-md border border-border-soft bg-background px-3 py-2 text-sm space-y-2">
      <p className="font-medium flex items-center gap-1.5">
        <IconCompass size={15} aria-hidden />Cómo llegar ({travel.distanceKm} km)
      </p>

      {/* Modo seleccionado destacado */}
      <div className="rounded-md bg-surface border border-foreground/20 px-3 py-2">
        <p className="font-semibold flex items-center gap-1.5">
          <activeMode.Icon size={15} aria-hidden />{activeMode.label}
        </p>
        <p className="text-muted text-xs mt-0.5">
          {activeMode.data.minutes} min de viaje — sal {activeMode.data.leaveMinutesBefore} min antes
        </p>
        {selected === "public_transport" && travel.rideshare && (
          <div className="mt-1.5 border-t border-border-soft pt-1.5">
            <p className="font-medium text-foreground/80 flex items-center gap-1"><IconCar size={13} aria-hidden /> Didi / Uber</p>
            <p className="text-xs text-muted">
              {travel.rideshare.minutes} min — sal {travel.rideshare.leaveMinutesBefore} min antes ·{" "}
              est. ${travel.rideshare.costRangeMXN[0]}–${travel.rideshare.costRangeMXN[1]} MXN
            </p>
          </div>
        )}
      </div>

      {/* Otros modos como referencia */}
      <ul className="space-y-0.5 text-xs text-muted">
        {modes.filter((m) => m.key !== selected).map((m) => (
          <li key={m.key} className="flex items-center gap-1">
            <m.Icon size={12} aria-hidden /> {m.label}: {m.data.minutes} min — sal {m.data.leaveMinutesBefore} min antes
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationsInline({ itemId, initial }: { itemId: string; initial: CachedRecommendation | null }) {
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
      sileo.error({ title: "Error", description: e instanceof Error ? e.message : "Error desconocido" });
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
    <div className="flex flex-wrap gap-1.5">
      {TRANSPORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={loading}
          onClick={() => handleTransportClick(opt.value)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
            selectedTransport === opt.value
              ? "border-foreground bg-foreground text-background"
              : "border-border-soft hover:bg-surface"
          }`}
        >
          <opt.Icon size={13} aria-hidden />
          {opt.label}
        </button>
      ))}
    </div>
  );

  if (!data && !loading) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted uppercase tracking-wide">Transporte</p>
        {transportSelector}
        <button
          type="button"
          onClick={() => load(false, selectedTransport)}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border-soft px-3 py-2 text-sm hover:bg-surface"
        >
          <IconSparkles size={15} aria-hidden /> Cargar recomendaciones
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
        <p className="text-xs font-medium text-muted uppercase tracking-wide">Recomendaciones</p>
        <button
          type="button"
          onClick={() => load(true, selectedTransport)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <IconRefresh size={12} aria-hidden />
          {transportChanged ? "Recalcular con este transporte" : "Actualizar"}
        </button>
      </div>

      {transportSelector}

      {data.location && (
        <p className="flex items-center gap-1 text-sm text-muted">
          <IconMapPin size={14} aria-hidden />{data.location}
        </p>
      )}

      {data.weather && (
        <p className="flex items-center gap-1 text-sm text-muted">
          <IconSunHigh size={14} aria-hidden />
          {data.weather.description}, {Math.round(data.weather.tempMinC)}°–{Math.round(data.weather.tempMaxC)}°C,{" "}
          {data.weather.precipitationProbability}% lluvia
        </p>
      )}

      {data.travel && <TravelBlock travel={data.travel} selected={selectedTransport} />}

      {(data.recommendation ?? data.outfit_suggestion) && (
        <div className="rounded-md border border-border-soft bg-background px-3 py-2 text-sm">
          {data.recommendation ?? data.outfit_suggestion}
        </div>
      )}

    </div>
  );
}

export function ItemDetailModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label;
  const effortLabel = EFFORT_OPTIONS.find((e) => e.value === item.effort)?.label;
  const taskStatusLabel = TASK_STATUS_OPTIONS.find((s) => s.value === item.task_status)?.label;

  return (
    /* Fondo oscuro */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/60 px-0 md:px-4"
      onClick={onClose}
    >
      {/* Panel — bottom-sheet en móvil, modal centrado en desktop */}
      <div
        className="
          w-full max-h-[88vh] overflow-y-auto
          rounded-t-2xl md:rounded-2xl
          border border-border-soft bg-surface
          p-5 shadow-xl
          md:max-w-lg
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[item.type]}`}>
              {TYPE_LABELS[item.type]}
            </span>
            <h2 className="font-handwriting text-2xl leading-tight">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="mt-1 shrink-0 text-muted hover:text-foreground">
            <IconX size={18} aria-hidden />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {/* Fecha */}
          <p className="text-muted">{formatDateRange(item)}</p>

          {/* Ubicación */}
          {item.location && (
            <p className="flex items-center gap-1 text-muted">
              <IconMapPin size={14} aria-hidden />{item.location}
            </p>
          )}

          {/* Descripción */}
          {item.description && (
            <p className="text-foreground/80 whitespace-pre-wrap">{item.description}</p>
          )}

          {/* Chips de estado */}
          {(priorityLabel || effortLabel || taskStatusLabel || item.categories?.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {taskStatusLabel && (
                <span className="rounded-full bg-surface border border-border-soft px-2 py-0.5 text-xs">
                  {taskStatusLabel}
                </span>
              )}
              {priorityLabel && (
                <span className="rounded-full bg-surface border border-border-soft px-2 py-0.5 text-xs">
                  Prioridad {priorityLabel}
                </span>
              )}
              {effortLabel && (
                <span className="rounded-full bg-surface border border-border-soft px-2 py-0.5 text-xs">
                  Esfuerzo {effortLabel}
                </span>
              )}
              {item.categories?.map((c) => (
                <span key={c} className="rounded-full bg-surface border border-border-soft px-2 py-0.5 text-xs">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Vestimenta */}
          {item.outfit_suggestion && (
            <p className="flex items-start gap-1.5 text-muted">
              <IconShirt size={15} className="shrink-0 mt-0.5" aria-hidden />{item.outfit_suggestion}
            </p>
          )}

          {/* Meet / videollamada */}
          {item.meet_link && (
            <a
              href={item.meet_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm hover:bg-background transition-colors"
            >
              <IconVideo size={15} aria-hidden />
              Unirse a la videollamada
            </a>
          )}

          <hr className="border-border-soft" />

          {/* Recomendaciones inline */}
          <RecommendationsInline itemId={item.id} initial={item.cached_recommendation} />

          <hr className="border-border-soft" />

          {/* Estado sync + links */}
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
