"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Integration, PreferredTransport, Profile } from "@/lib/types";
import { LocationField } from "@/components/LocationField";
import { TRANSPORT_OPTIONS } from "@/lib/itemPresentation";

function NotionHelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"find" | "create">("find");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/60 px-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[88vh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-border-soft bg-surface p-5 shadow-xl md:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-handwriting text-xl">Base de datos de Notion</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground text-lg mt-0.5">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setTab("find")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "find" ? "border-foreground bg-foreground text-background" : "border-border-soft hover:bg-background"}`}
          >
            Ya tengo una
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "create" ? "border-foreground bg-foreground text-background" : "border-border-soft hover:bg-background"}`}
          >
            Crear nueva
          </button>
        </div>

        {tab === "find" ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Sigue estos pasos para encontrar el ID de tu base de datos existente.</p>

            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium">Abre la base de datos en Notion</p>
                  <p className="text-muted text-xs mt-0.5">Debe ser una tabla o base de datos de página completa, no una vista inline.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium">Copia el link de la página</p>
                  <p className="text-muted text-xs mt-0.5">Clic en los tres puntos <strong>···</strong> arriba a la derecha → <strong>Copiar enlace</strong>.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium">Extrae el ID de la URL</p>
                  <p className="text-muted text-xs mt-1">El link se ve así:</p>
                  <div className="mt-1 rounded-md bg-background border border-border-soft px-2 py-1.5 font-mono text-xs break-all">
                    notion.so/Mi-base-<strong className="text-foreground">a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4</strong>?v=…
                  </div>
                  <p className="text-muted text-xs mt-1">Los <strong>32 caracteres</strong> alfanuméricos al final del nombre (antes del <code>?</code>) son el ID.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium">Conecta la integración a esa base de datos</p>
                  <p className="text-muted text-xs mt-0.5">En la base de datos: <strong>···</strong> → <strong>Conexiones</strong> → busca tu integración de Notion y selecciónala. Sin este paso la app no podrá escribir ahí.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p className="font-medium">Pega el ID arriba y guarda</p>
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Crea una base de datos nueva con las columnas que usa la app.</p>

            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium">Crea una página nueva en Notion</p>
                  <p className="text-muted text-xs mt-0.5">Clic en <strong>+ Nueva página</strong> en la barra lateral.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium">Inserta una tabla</p>
                  <p className="text-muted text-xs mt-0.5">Escribe <code>/tabla</code> (o <code>/table</code>) y elige <strong>Tabla — página completa</strong>.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium">Agrega estas columnas</p>
                  <div className="mt-2 rounded-md border border-border-soft overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-background">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Nombre exacto</th>
                          <th className="text-left px-2 py-1.5 font-medium">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {[
                          ["Descripción", "Texto"],
                          ["fecha evento", "Fecha"],
                          ["Fecha límite", "Fecha"],
                          ["Prioridad", "Selección (Alta / Media / Baja)"],
                          ["Nivel de esfuerzo", "Selección (Pequeño / Media / Grande)"],
                          ["Estado", "Estado"],
                          ["Tipo de tarea", "Multi-selección"],
                          ["Responsable", "Persona"],
                          ["vestimenta", "Texto"],
                          ["Ubicación", "Texto"],
                        ].map(([name, type]) => (
                          <tr key={name}>
                            <td className="px-2 py-1.5 font-mono">{name}</td>
                            <td className="px-2 py-1.5 text-muted">{type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted text-xs mt-1">Los nombres deben ser exactamente así (con mayúsculas y acentos).</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium">Conecta la integración</p>
                  <p className="text-muted text-xs mt-0.5"><strong>···</strong> → <strong>Conexiones</strong> → selecciona tu integración de Notion.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p className="font-medium">Copia el ID de la URL y pégalo arriba</p>
                  <p className="text-muted text-xs mt-0.5">Igual que en la pestaña "Ya tengo una", paso 3.</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-md bg-foreground text-background py-2 text-sm font-medium"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

export function SettingsForm({
  profile,
  integrations,
}: {
  profile: Profile;
  integrations: Pick<Integration, "provider" | "workspace_id" | "metadata">[];
}) {
  const router = useRouter();

  const [notionDatabaseId, setNotionDatabaseId] = useState(profile.notion_database_id ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [location, setLocation] = useState(profile.location ?? "");
  const [preferredTransport, setPreferredTransport] = useState<PreferredTransport | null>(
    profile.preferred_transport ?? null
  );
  const [extraBuffer, setExtraBuffer] = useState(profile.extra_buffer_minutes ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotionHelp, setShowNotionHelp] = useState(false);

  const googleConnected = integrations.some((i) => i.provider === "google");
  const notionIntegration = integrations.find((i) => i.provider === "notion");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notion_database_id: notionDatabaseId,
          timezone,
          location,
          preferred_transport: preferredTransport,
          extra_buffer_minutes: extraBuffer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "No se pudo guardar");

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {showNotionHelp && <NotionHelpModal onClose={() => setShowNotionHelp(false)} />}
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Conexiones</h2>

        <div className="flex items-center justify-between rounded-md border border-border-soft px-4 py-3">
          <div>
            <p className="font-medium">Google Calendar</p>
            <p className="text-sm text-muted">
              {googleConnected ? "Conectado" : "Necesario para crear eventos y calcular días libres"}
            </p>
          </div>
          <a
            href="/api/auth/google/connect"
            className="rounded-md border border-border-soft px-3 py-1.5 text-sm"
          >
            {googleConnected ? "Reconectar" : "Conectar"}
          </a>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border-soft px-4 py-3">
          <div>
            <p className="font-medium">Notion</p>
            <p className="text-sm text-muted">
              {notionIntegration
                ? `Conectado a ${(notionIntegration.metadata as { workspace_name?: string })?.workspace_name ?? "workspace"}`
                : "Necesario para crear una página por cada tarea"}
            </p>
          </div>
          <a
            href="/api/auth/notion/connect"
            className="rounded-md border border-border-soft px-3 py-1.5 text-sm"
          >
            {notionIntegration ? "Reconectar" : "Conectar"}
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Preferencias</h2>

        {!location && (
          <p className="mb-4 rounded-md border border-border-soft bg-surface px-3 py-2 text-xs text-muted">
            <span aria-hidden>📍 </span>
            Agrega tu ubicación (casa, trabajo, donde sea que estés normalmente) para que las recomendaciones de
            vestimenta puedan tomar en cuenta el clima real.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="location">
              ¿Dónde vives o trabajas?
            </label>
            <LocationField
              id="location"
              value={location}
              onChange={setLocation}
              placeholder="Ej. Casa, Insurgentes Sur 123, Ciudad de México"
            />
            <p className="mt-1 text-xs text-muted">
              Se usa para calcular el clima en "Recomendaciones" cuando una tarea no tiene su propia ubicación.
              Puedes poner tu casa, tu trabajo, o donde pases más tiempo.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm font-medium" htmlFor="notion_database_id">
                ID de la base de datos de Notion
              </label>
              <button
                type="button"
                onClick={() => setShowNotionHelp(true)}
                className="w-5 h-5 rounded-full border border-border-soft text-xs text-muted hover:text-foreground hover:border-foreground flex items-center justify-center"
              >
                ?
              </button>
            </div>
            <input
              id="notion_database_id"
              value={notionDatabaseId}
              onChange={(e) => setNotionDatabaseId(e.target.value)}
              placeholder="32 caracteres del final de la URL de la base de datos"
              className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted">
              Cada nueva tarea creará una página dentro de esta base de datos. Comparte esa base de datos con la
              integración de Notion conectada arriba.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="timezone">
              Zona horaria
            </label>
            <input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
            />
          </div>

          {/* ── Preferencias de viaje ── */}
          <div className="space-y-3 rounded-md border border-border-soft p-4">
            <p className="text-sm font-medium">Preferencias de viaje</p>
            <p className="text-xs text-muted">
              Se usan para resaltar el medio de transporte que prefieres en las recomendaciones y calcular mejor el
              tiempo de salida.
            </p>

            <div>
              <p className="text-xs text-muted mb-2">Medio de transporte habitual</p>
              <div className="flex flex-wrap gap-2">
                {TRANSPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setPreferredTransport(preferredTransport === opt.value ? null : opt.value)
                    }
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      preferredTransport === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft hover:bg-surface"
                    }`}
                  >
                    <span aria-hidden>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted mb-2 block" htmlFor="extra_buffer">
                Tiempo extra de margen al salir (minutos adicionales)
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="extra_buffer"
                  type="range"
                  min={0}
                  max={30}
                  step={5}
                  value={extraBuffer}
                  onChange={(e) => setExtraBuffer(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-center text-sm font-medium">
                  {extraBuffer === 0 ? "Sin extra" : `+${extraBuffer} min`}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Se suma al tiempo de salida sugerido para que siempre llegues con margen.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Guardado.</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </section>
    </div>
    </>
  );
}
