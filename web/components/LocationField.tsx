"use client";

import { useState } from "react";

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
  const [detectError, setDetectError] = useState<string | null>(null);

  function detectLocation() {
    if (!navigator.geolocation) {
      setDetectError("Tu navegador no soporta detección de ubicación");
      return;
    }

    setDetecting(true);
    setDetectError(null);

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
          setDetectError("No se pudo detectar tu ubicación, escríbela manualmente");
        } finally {
          setDetecting(false);
        }
      },
      () => {
        setDetectError("Permiso de ubicación denegado, escríbela manualmente");
        setDetecting(false);
      }
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
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
      {detectError && <p className="mt-1 text-xs text-red-600">{detectError}</p>}
    </div>
  );
}
