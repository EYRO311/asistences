"use client";

import { useState } from "react";
import { sileo } from "sileo";

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
  );
}
