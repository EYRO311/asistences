"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Gender, Integration, PreferredTransport, Profile } from "@/lib/types";
import { LocationField } from "@/components/LocationField";
import { TRANSPORT_OPTIONS } from "@/lib/itemPresentation";
import { sileo } from "sileo";

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
  integrations: Pick<Integration, "provider" | "workspace_id" | "metadata" | "scope">[];
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [age, setAge] = useState<string>(profile.age != null ? String(profile.age) : "");
  const [gender, setGender] = useState<Gender | null>(profile.gender ?? null);
  const [notionDatabaseId, setNotionDatabaseId] = useState(profile.notion_database_id ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [location, setLocation] = useState(profile.location ?? "");
  const [preferredTransport, setPreferredTransport] = useState<PreferredTransport | null>(
    profile.preferred_transport ?? null
  );
  const [extraBuffer, setExtraBuffer] = useState(profile.extra_buffer_minutes ?? 0);
  const [wakeTime, setWakeTime] = useState(profile.wake_time ?? "06:00");
  const [sleepTime, setSleepTime] = useState(profile.sleep_time ?? "23:00");
  const [loading, setLoading] = useState(false);
  const [showNotionHelp, setShowNotionHelp] = useState(false);

  const [activeTab, setActiveTab] = useState<"perfil" | "horarios" | "conexiones">("perfil");

  const googleIntegration = integrations.find((i) => i.provider === "google");
  const googleConnected = Boolean(googleIntegration);
  const gmailConnected = Boolean(googleIntegration?.scope?.includes("gmail"));
  const notionIntegration = integrations.find((i) => i.provider === "notion");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName || undefined,
          age: age ? Number(age) : null,
          gender: gender ?? null,
          notion_database_id: notionDatabaseId || undefined,
          timezone,
          location: location || undefined,
          preferred_transport: preferredTransport,
          extra_buffer_minutes: extraBuffer,
          wake_time: wakeTime,
          sleep_time: sleepTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : (data.error?.message ?? "No se pudo guardar"));

      sileo.success({ title: "Guardado", description: "Los ajustes se guardaron correctamente." });
      router.refresh();
    } catch (err) {
      sileo.error({ title: "Error al guardar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  const TABS = [
    { id: "perfil", label: "Perfil" },
    { id: "horarios", label: "Horarios" },
    { id: "conexiones", label: "Conexiones" },
  ] as const;

  return (
    <>
    {showNotionHelp && <NotionHelpModal onClose={() => setShowNotionHelp(false)} />}

    {/* ── Menú de tabs ── */}
    <div className="flex gap-1 rounded-lg border border-border-soft bg-surface p-1 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>

    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ══ TAB: PERFIL ══ */}
      {activeTab === "perfil" && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="full_name">
              Nombre
            </label>
            <input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Ana García"
              className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="age">
                Edad
              </label>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
                placeholder="Ej. 25"
                className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Género</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { value: "femenino", label: "Femenino" },
                    { value: "masculino", label: "Masculino" },
                    { value: "no_binario", label: "No binario" },
                    { value: "prefiero_no_decir", label: "Prefiero no decir" },
                  ] as { value: Gender; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGender(gender === opt.value ? null : opt.value)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      gender === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-soft hover:bg-surface"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="location">
              Ubicación habitual
            </label>
            <LocationField
              id="location"
              value={location}
              onChange={setLocation}
              placeholder="Ej. Insurgentes Sur 123, Ciudad de México"
            />
            <p className="mt-1 text-xs text-muted">
              Se usa para calcular el clima en "Recomendaciones" cuando una tarea no tiene su propia ubicación.
            </p>
          </div>
        </>
      )}

      {/* ══ TAB: HORARIOS ══ */}
      {activeTab === "horarios" && (
        <>
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

          <div className="space-y-3 rounded-md border border-border-soft p-4">
            <p className="text-sm font-medium">Horario de descanso</p>
            <p className="text-xs text-muted">
              Los días libres solo se muestran dentro de tu horario activo.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block" htmlFor="wake_time">
                  Me despierto a las
                </label>
                <input
                  id="wake_time"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1.5 block" htmlFor="sleep_time">
                  Me duermo a las
                </label>
                <input
                  id="sleep_time"
                  type="time"
                  value={sleepTime}
                  onChange={(e) => setSleepTime(e.target.value)}
                  className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border-soft p-4">
            <p className="text-sm font-medium">Preferencias de viaje</p>
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
                Tiempo extra al salir
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
                <span className="w-16 text-center text-sm font-medium">
                  {extraBuffer === 0 ? "Sin extra" : `+${extraBuffer} min`}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ TAB: CONEXIONES ══ */}
      {activeTab === "conexiones" && (
        <>
          <div className="rounded-md border border-border-soft px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Google</p>
                <p className="text-sm text-muted">
                  {googleConnected
                    ? "Google Calendar conectado"
                    : "Necesario para crear eventos y calcular días libres"}
                </p>
              </div>
              <a
                href="/api/auth/google/connect"
                className="shrink-0 rounded-md border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
              >
                {googleConnected ? "Reconectar" : "Conectar"}
              </a>
            </div>

            {googleConnected && (
              <div className="flex items-center justify-between pt-1 border-t border-border-soft">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${gmailConnected ? "bg-green-500" : "bg-amber-400"}`} />
                  <p className="text-sm text-muted">
                    {gmailConnected ? "Gmail conectado" : "Gmail no habilitado"}
                  </p>
                </div>
                {!gmailConnected && (
                  <a
                    href="/api/auth/google/connect"
                    className="text-xs text-amber-600 dark:text-amber-400 underline hover:no-underline"
                  >
                    Reconectar para activar
                  </a>
                )}
              </div>
            )}
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
              className="rounded-md border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
            >
              {notionIntegration ? "Reconectar" : "Conectar"}
            </a>
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
              Cada nueva tarea creará una página dentro de esta base de datos.
            </p>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Guardar"}
      </button>
    </form>
    </>
  );
}
