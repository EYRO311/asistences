import { useEffect, useRef, useState } from "react";
import { IconMapPin } from "@tabler/icons-react";

// Autocompletado (Nominatim) + botón "Usar mi ubicación" (navigator.geolocation,
// funciona en el WebView de Capacitor con los permisos de ubicación declarados
// en AndroidManifest.xml). Mismo comportamiento que web/components/LocationField.tsx,
// sin sileo (mobile no tiene esa lib de toasts): los errores se muestran inline.

interface Suggestion {
  display: string;
  type: string;
}

const COORD_RE = /^(-?\d{1,3}\.?\d*)[,\s]+(-?\d{1,3}\.?\d*)$/;

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`,
    { headers: { "User-Agent": "asistences-app/1.0" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.display_name ?? null;
}

async function searchLocations(query: string): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const coordMatch = trimmed.match(COORD_RE);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const name = await reverseGeocode(lat, lon).catch(() => null);
      return name ? [{ display: name, type: "coordinate" }] : [];
    }
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "es");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), { headers: { "User-Agent": "asistences-app/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();

  return (data as { display_name: string; type: string }[]).map((r) => ({
    display: r.display_name,
    type: r.type,
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
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function flashNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  }

  function handleChange(val: string) {
    onChange(val);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await searchLocations(val).catch(() => []);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 400);
  }

  function selectSuggestion(s: Suggestion) {
    onChange(s.display);
    setSuggestions([]);
    setShowSuggestions(false);
  }

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
      flashNotice("Este dispositivo no soporta detección de ubicación.");
      return;
    }

    setDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const name = await reverseGeocode(latitude, longitude);
          if (!name) throw new Error("Sin resultados");
          onChange(name);
        } catch {
          flashNotice("No se pudo convertir la ubicación, escríbela manualmente.");
        } finally {
          setDetecting(false);
        }
      },
      (err) => {
        setDetecting(false);
        if (err.code === 1) {
          flashNotice("Activa el permiso de ubicación en Ajustes de Android o escríbela manualmente.");
        } else if (err.code === 2) {
          flashNotice("No se pudo obtener tu posición. Escríbela manualmente.");
        } else {
          flashNotice("La detección tardó demasiado. Escríbela manualmente.");
        }
      },
      { timeout: 10000 }
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-col gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder ?? "Calle, ciudad o coordenadas..."}
          autoComplete="off"
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <button
          type="button"
          onClick={detectLocation}
          disabled={detecting}
          className="flex items-center justify-center gap-1.5 self-start rounded-xl border border-border-soft px-3 py-2 text-xs disabled:opacity-50"
        >
          <IconMapPin size={14} aria-hidden />
          {detecting ? "Detectando..." : "Usar mi ubicación"}
        </button>
      </div>

      {notice && <p className="mt-1 text-xs text-muted">{notice}</p>}

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-border-soft bg-surface shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-background transition-colors truncate"
              >
                {s.display}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
