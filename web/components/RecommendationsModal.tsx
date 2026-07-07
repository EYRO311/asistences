"use client";

import { useState } from "react";
import type { CachedRecommendation, PreferredTransport } from "@/lib/types";
import { TRANSPORT_OPTIONS, type TablerIcon } from "@/lib/itemPresentation";
import { sileo } from "sileo";
import {
  IconCar,
  IconBike,
  IconBus,
  IconWalk,
  IconCompass,
  IconMapPin,
  IconSunHigh,
  IconSparkles,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

export function RecommendationsModal({
  itemId,
  initialData,
}: {
  itemId: string;
  initialData?: CachedRecommendation | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CachedRecommendation | null>(initialData ?? null);
  const [selectedTransport, setSelectedTransport] = useState<PreferredTransport | null>(
    initialData?.preferredTransport ?? null
  );

  async function handleOpen() {
    setOpen(true);
    if (data) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/recommendations`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron obtener recomendaciones");
      setData(json);
      setSelectedTransport(json.preferredTransport ?? null);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(transport?: PreferredTransport | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ refresh: "1" });
      if (transport) params.set("transport", transport);
      const res = await fetch(`/api/items/${itemId}/recommendations?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron obtener recomendaciones");
      setData(json);
      setSelectedTransport(json.preferredTransport ?? transport ?? null);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-md border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
      >
        <IconSparkles size={14} aria-hidden /> Recomendaciones
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-soft bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-handwriting text-2xl">Recomendaciones</h2>
              <div className="flex items-center gap-2">
                {data && !loading && (
                  <button
                    type="button"
                    onClick={() => handleRefresh(selectedTransport)}
                    className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
                    title="Recalcular"
                  >
                    <IconRefresh size={12} aria-hidden />
                    {selectedTransport !== (data.preferredTransport ?? null)
                      ? "Recalcular con este transporte"
                      : "Actualizar"}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                  <IconX size={18} aria-hidden />
                </button>
              </div>
            </div>

            {loading && <p className="text-sm text-muted">Consultando clima, rutas y generando recomendaciones...</p>}

            {!loading && data && (
              <div className="space-y-3 text-sm">
                {/* Selector de modo de transporte */}
                {data.travel && (
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSPORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedTransport(opt.value)}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
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
                )}

                {data.location && (
                  <p className="flex items-center gap-1 text-muted">
                    <IconMapPin size={14} aria-hidden />{data.location}
                  </p>
                )}

                {data.weather ? (
                  <p className="flex items-center gap-1 text-muted">
                    <IconSunHigh size={14} aria-hidden />
                    {data.weather.description}, {Math.round(data.weather.tempMinC)}°–{Math.round(data.weather.tempMaxC)}°C,{" "}
                    {data.weather.precipitationProbability}% prob. de lluvia
                  </p>
                ) : (
                  <p className="text-muted">Sin datos de clima disponibles para esta tarea.</p>
                )}

                {data.travel && (
                  <div className="rounded-md border border-border-soft bg-background px-3 py-2 space-y-2">
                    <p className="font-medium flex items-center gap-1.5">
                      <IconCompass size={15} aria-hidden />Cómo llegar ({data.travel.distanceKm} km)
                    </p>
                    {/* Modo seleccionado destacado */}
                    {(() => {
                      const modes: Record<string, { Icon: TablerIcon; label: string; d: { minutes: number; leaveMinutesBefore: number } }> = {
                        car: { Icon: IconCar as TablerIcon, label: "Auto", d: data.travel.car },
                        bike: { Icon: IconBike as TablerIcon, label: "Bici", d: data.travel.bike },
                        public_transport: { Icon: IconBus as TablerIcon, label: "Transporte público", d: data.travel.publicTransport },
                        walking: { Icon: IconWalk as TablerIcon, label: "A pie", d: { minutes: Math.round(data.travel.distanceKm / 0.08), leaveMinutesBefore: Math.round(data.travel.distanceKm / 0.08) + 5 } },
                      };
                      const active = selectedTransport ? modes[selectedTransport] : modes.car;
                      return (
                        <>
                          <div className="rounded-md bg-surface border border-foreground/20 px-3 py-2">
                            <p className="font-semibold flex items-center gap-1.5"><active.Icon size={14} aria-hidden /> {active.label}</p>
                            <p className="text-xs text-muted mt-0.5">
                              {active.d.minutes} min de viaje — sal {active.d.leaveMinutesBefore} min antes
                            </p>
                            {selectedTransport === "public_transport" && data.travel.rideshare && (
                              <div className="mt-1.5 border-t border-border-soft pt-1.5">
                                <p className="font-medium text-foreground/80 text-xs flex items-center gap-1"><IconCar size={12} aria-hidden /> Didi / Uber</p>
                                <p className="text-xs text-muted">
                                  {data.travel.rideshare.minutes} min — sal {data.travel.rideshare.leaveMinutesBefore} min antes ·{" "}
                                  est. ${data.travel.rideshare.costRangeMXN[0]}–${data.travel.rideshare.costRangeMXN[1]} MXN
                                </p>
                              </div>
                            )}
                          </div>
                          <ul className="space-y-0.5 text-xs text-muted">
                            {(Object.entries(modes) as [string, typeof modes.car][])
                              .filter(([k]) => k !== (selectedTransport ?? "car"))
                              .map(([k, m]) => (
                                <li key={k} className="flex items-center gap-1"><m.Icon size={12} aria-hidden /> {m.label}: {m.d.minutes} min — sal {m.d.leaveMinutesBefore} min antes</li>
                              ))}
                          </ul>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="rounded-md border border-border-soft bg-background px-3 py-2">
                  {data.recommendation ?? data.outfit_suggestion ?? "No se pudo generar una recomendación."}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
