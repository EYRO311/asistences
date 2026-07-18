import { useEffect, useState } from "react";
import type { PreferredTransport } from "@/lib/types";
import { TRANSPORT_OPTIONS } from "@/lib/itemPresentation";
import { supabase } from "@/lib/supabase";
import { IconWand, IconSparkles } from "@tabler/icons-react";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

const YES_NO = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

export function DailyRecommendationButton({
  todayItemsCount,
  preferredTransport,
}: {
  todayItemsCount: number;
  preferredTransport: PreferredTransport | null;
}) {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [sameOutfit, setSameOutfit] = useState<boolean | null>(true);
  const [useRegistered, setUseRegistered] = useState<boolean | null>(null);
  const [transportChoice, setTransportChoice] = useState<PreferredTransport | null>(null);
  const [outfitIdea, setOutfitIdea] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const res = await fetch(`${WEB_URL}/api/recommendations/daily`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRecommendation(data.recommendation ?? null);
      } catch {
        // opcional, no bloqueamos el inicio
      } finally {
        if (!cancelled) setChecked(true);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch(`${WEB_URL}/api/recommendations/daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sameOutfitForAll: todayItemsCount > 1 ? sameOutfit ?? undefined : undefined,
          transport: useRegistered === false ? transportChoice ?? undefined : undefined,
          outfitIdea: outfitIdea.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setRecommendation(data.recommendation);
      setPanelOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (!checked || todayItemsCount === 0) return null;

  return (
    <div className="border-t border-border-soft pt-3">
      {recommendation && !panelOpen && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed">{recommendation}</p>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1 text-xs text-muted"
          >
            <IconWand size={12} aria-hidden /> Regenerar recomendación del día
          </button>
        </div>
      )}

      {!recommendation && !panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border-soft px-3 py-2.5 text-sm"
        >
          <IconWand size={13} aria-hidden /> Recomendación automática
        </button>
      )}

      {panelOpen && (
        <div className="rounded-xl border border-border-soft bg-background px-3 py-3 space-y-3">
          {todayItemsCount > 1 && (
            <div>
              <p className="text-xs font-medium mb-1.5">¿Usarás el mismo outfit para todas tus tareas de hoy?</p>
              <div className="flex gap-1.5">
                {YES_NO.map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => setSameOutfit(o.value)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      sameOutfit === o.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium mb-1.5">
              ¿Usar tu medio de transporte registrado
              {preferredTransport ? ` (${TRANSPORT_OPTIONS.find((o) => o.value === preferredTransport)?.label})` : ""}?
            </p>
            <div className="flex gap-1.5">
              {YES_NO.map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => setUseRegistered(o.value)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    useRegistered === o.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {useRegistered === false && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {TRANSPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTransportChoice(opt.value)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                      transportChoice === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft"
                    }`}
                  >
                    <opt.Icon size={12} aria-hidden /> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium mb-1.5">
              ¿Ya tienes algo pensado para tu outfit o hay código de vestimenta?{" "}
              <span className="font-normal text-muted">(opcional)</span>
            </p>
            <input
              value={outfitIdea}
              onChange={(e) => setOutfitIdea(e.target.value)}
              placeholder="Ej. business casual, ya elegí una playera negra..."
              className="w-full rounded-lg border border-border-soft bg-surface px-2.5 py-2 text-xs"
            />
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full rounded-lg bg-foreground text-background py-2 text-xs font-medium disabled:opacity-50"
          >
            {loading ? (
              "Generando..."
            ) : (
              <>
                <IconSparkles size={12} className="inline -mt-0.5 mr-1" aria-hidden />
                Generar recomendación del día
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
