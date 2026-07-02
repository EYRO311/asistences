"use client";

import { useEffect, useRef, useState } from "react";
import { sileo } from "sileo";

interface Suggestion {
  name: string;
  admin1?: string;
  country?: string;
  display: string;
}

async function searchLocations(query: string): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "es");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: { name: string; admin1?: string; country?: string }) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    display: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

export function LocationField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [detecting, setDetecting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleChange(val: string) {
    onChange(val);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await searchLocations(val).catch(() => []);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 350);
  }

  function selectSuggestion(s: Suggestion) {
    onChange(s.display);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function detectLocation() {
    if (!navigator.geolocation) {
      sileo.error({ title: "No disponible", description: "Tu navegador no soporta detección de ubicación." });
      return;
    }

    setDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=es`
          );
          const data = await res.json();
          const parts = [data.locality, data.principalSubdivision, data.countryName].filter(Boolean);
          if (parts.length === 0) throw new Error("Sin resultados");
          onChange(parts.join(", "));
        } catch {
          sileo.error({ title: "Error", description: "No se pudo convertir la ubicación, escríbela manualmente." });
        } finally {
          setDetecting(false);
        }
      },
      (err) => {
        setDetecting(false);
        if (err.code === 1) {
          sileo.warning({
            title: "Permiso denegado",
            description: "Activa el permiso de ubicación en tu navegador o escríbela manualmente.",
          });
        } else if (err.code === 2) {
          sileo.error({ title: "Ubicación no disponible", description: "No se pudo obtener tu posición. Escríbela manualmente." });
        } else {
          sileo.error({ title: "Tiempo agotado", description: "La detección tardó demasiado. Escríbela manualmente." });
        }
      },
      { timeout: 10000 }
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={detectLocation}
          disabled={detecting}
          className="shrink-0 whitespace-nowrap rounded-md border border-border-soft px-3 py-2 text-sm hover:bg-surface disabled:opacity-50"
        >
          {detecting ? "Detectando..." : "📍 Usar mi ubicación"}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border-soft bg-surface shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-background transition-colors"
              >
                <span className="font-medium">{s.name}</span>
                {(s.admin1 || s.country) && (
                  <span className="text-muted"> — {[s.admin1, s.country].filter(Boolean).join(", ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
