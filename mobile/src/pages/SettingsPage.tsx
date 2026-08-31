import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";
import type { Session } from "@supabase/supabase-js";
import type { Gender, PreferredTransport } from "@/lib/types";
import { TRANSPORT_OPTIONS } from "@/lib/itemPresentation";
import { getIntegrations, disconnectIntegration, type Integration } from "@/lib/integrations";
import { IconX, IconSun, IconMoon, IconDeviceLaptop, IconWaveSine, IconTree, IconCalendar, IconBrandNotion, IconCheck, IconUnlink } from "@tabler/icons-react";
import { LocationField } from "@/components/LocationField";
import { NotionHelpModal } from "@/components/NotionHelpModal";
import { setDisplayTimezone } from "@/lib/timezone";
import { REMINDER_OPTIONS, requestNotificationPermission, type ReminderSettings } from "@/lib/notifications";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { IconBell, IconBellOff } from "@tabler/icons-react";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "femenino", label: "Femenino" },
  { value: "masculino", label: "Masculino" },
  { value: "no_binario", label: "No binario" },
  { value: "prefiero_no_decir", label: "Prefiero no decir" },
];

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

interface Props {
  session: Session;
  onClose: () => void;
  reminderSettings: ReminderSettings;
  onReminderSettingsChange: (settings: ReminderSettings) => void;
}

export function SettingsPage({ session, onClose, reminderSettings, onReminderSettingsChange }: Props) {
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("");
  const [transport, setTransport] = useState<PreferredTransport | "">("");
  const [extraBuffer, setExtraBuffer] = useState(0);
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [showNotionHelp, setShowNotionHelp] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("full_name, age, gender, location, timezone, preferred_transport, extra_buffer_minutes, wake_time, sleep_time, notion_database_id")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setFullName(data.full_name ?? "");
        setAge(data.age != null ? String(data.age) : "");
        setGender((data.gender as Gender) ?? null);
        setLocation(data.location ?? "");
        setTimezone(data.timezone ?? "");
        setTransport((data.preferred_transport as PreferredTransport) ?? "");
        setExtraBuffer(data.extra_buffer_minutes ?? 0);
        setWakeTime(data.wake_time ?? "07:00");
        setSleepTime(data.sleep_time ?? "23:00");
        setNotionDatabaseId(data.notion_database_id ?? "");
      });
    getIntegrations(session.user.id).then(setIntegrations);
  }, [session.user.id]);

  async function refreshIntegrations() {
    const updated = await getIntegrations(session.user.id);
    setIntegrations(updated);
  }

  async function handleConnect(provider: "google" | "notion") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setConnectingProvider(provider);
    const path = provider === "google" ? "google/connect" : "notion/connect";
    await Browser.open({ url: `${WEB_URL}/api/auth/${path}?mt=${encodeURIComponent(token)}` });
    // Refresh after browser closes (deep link handler in App.tsx also triggers a toast)
    await refreshIntegrations();
    setConnectingProvider(null);
  }

  async function handleDisconnect(provider: "google" | "notion") {
    await disconnectIntegration(session.user.id, provider);
    await refreshIntegrations();
  }

  function handleThemeChange(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  async function saveReminderPrefs(next: ReminderSettings) {
    await supabase.from("profiles").update({
      reminders_enabled: next.enabled,
      reminder_minutes_before: next.minutesBefore,
    }).eq("id", session.user.id);
    onReminderSettingsChange(next);
  }

  async function toggleReminders() {
    setReminderLoading(true);
    try {
      if (reminderSettings.enabled) {
        await saveReminderPrefs({ ...reminderSettings, enabled: false });
      } else {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setReminderNotice("Activa el permiso de notificaciones en Ajustes de Android para recibir recordatorios.");
          return;
        }
        await saveReminderPrefs({ ...reminderSettings, enabled: true });
      }
    } finally {
      setReminderLoading(false);
    }
  }

  async function handleReminderMinutesChange(minutesBefore: number) {
    await saveReminderPrefs({ ...reminderSettings, minutesBefore });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("profiles").update({
      full_name: fullName || null,
      age: age ? Number(age) : null,
      gender: gender ?? null,
      location: location || null,
      timezone: timezone || "America/Mexico_City",
      preferred_transport: transport || null,
      extra_buffer_minutes: extraBuffer,
      wake_time: wakeTime,
      sleep_time: sleepTime,
      notion_database_id: notionDatabaseId || null,
      theme: theme === "system" ? null : theme,
    }).eq("id", session.user.id);
    setDisplayTimezone(timezone || "America/Mexico_City");
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof IconSun }[] = [
    { value: "light", label: "Claro", Icon: IconSun },
    { value: "dark", label: "Oscuro", Icon: IconMoon },
    { value: "theme-ocean", label: "Océano", Icon: IconWaveSine },
    { value: "theme-forest", label: "Bosque", Icon: IconTree },
    { value: "system", label: "Sistema", Icon: IconDeviceLaptop },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b border-border-soft shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)", paddingBottom: "1rem" }}>
        <h1 className="font-handwriting text-2xl">Ajustes</h1>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1">
          <IconX size={20} aria-hidden />
        </button>
      </div>

      <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Tema */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Tema</label>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleThemeChange(value)}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition-colors ${
                  theme === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft text-muted"
                }`}
              >
                <Icon size={16} stroke={1.5} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Nombre */}
        <div>
          <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Nombre
          </label>
          <input
            id="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* Edad y género */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="age" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Edad
            </label>
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
              placeholder="Ej. 25"
              className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Género</label>
            <select
              value={gender ?? ""}
              onChange={(e) => setGender((e.target.value as Gender) || null)}
              className="w-full rounded-xl border border-border-soft bg-surface px-3 py-3 text-sm focus:outline-none"
            >
              <option value="">Sin especificar</option>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ubicación */}
        <div>
          <label htmlFor="loc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Ubicación
          </label>
          <LocationField id="loc" value={location} onChange={setLocation} placeholder="Ciudad, país..." />
        </div>

        {/* Transporte */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Transporte preferido
          </label>
          <div className="flex gap-2">
            {TRANSPORT_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTransport(transport === value ? "" : value)}
                className={`flex-1 flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition-colors ${
                  transport === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-soft text-muted"
                }`}
              >
                <Icon size={16} stroke={1.5} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Zona horaria */}
        <div>
          <label htmlFor="timezone" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Zona horaria
          </label>
          <input
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/Mexico_City"
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* Horario */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Horario diario
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Me despierto</label>
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Me duermo</label>
              <input
                type="time"
                value={sleepTime}
                onChange={(e) => setSleepTime(e.target.value)}
                className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Tiempo extra al salir */}
        <div>
          <label htmlFor="extra_buffer" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
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
            <span className="w-16 shrink-0 text-center text-sm font-medium">
              {extraBuffer === 0 ? "Sin extra" : `+${extraBuffer} min`}
            </span>
          </div>
        </div>

        {/* Recordatorios */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Recordatorios
          </label>
          <div className="rounded-xl border border-border-soft bg-surface px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {reminderSettings.enabled ? (
                  <IconBell size={16} stroke={1.5} className="shrink-0 text-muted" aria-hidden />
                ) : (
                  <IconBellOff size={16} stroke={1.5} className="shrink-0 text-muted" aria-hidden />
                )}
                <p className="text-sm">
                  {reminderSettings.enabled ? "Avisos activos" : "Recibe un aviso antes de que empiece una tarea"}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleReminders}
                disabled={reminderLoading}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${
                  reminderSettings.enabled ? "border-border-soft text-muted" : "border-foreground bg-foreground text-background"
                }`}
              >
                {reminderLoading ? "..." : reminderSettings.enabled ? "Desactivar" : "Activar"}
              </button>
            </div>

            {reminderSettings.enabled && (
              <div>
                <label className="text-xs text-muted mb-1.5 block" htmlFor="reminder_minutes">
                  Avisar con cuánta anticipación
                </label>
                <select
                  id="reminder_minutes"
                  value={reminderSettings.minutesBefore}
                  onChange={(e) => handleReminderMinutesChange(Number(e.target.value))}
                  className="w-full rounded-md border border-border-soft bg-background px-3 py-2 text-sm"
                >
                  {REMINDER_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m} min antes</option>
                  ))}
                </select>
              </div>
            )}

            {reminderNotice && <p className="text-xs text-muted">{reminderNotice}</p>}
          </div>
        </div>

        {/* Integraciones */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Integraciones
          </label>
          <div className="space-y-2">
            {[
              { provider: "google" as const, label: "Google Calendar", Icon: IconCalendar },
              { provider: "notion" as const, label: "Notion", Icon: IconBrandNotion },
            ].map(({ provider, label, Icon }) => {
              const integration = integrations.find((i) => i.provider === provider);
              const connected = integration?.connected ?? false;
              const isConnecting = connectingProvider === provider;
              const gmailConnected = provider === "google" && Boolean(integration?.scope?.includes("gmail"));
              return (
                <div key={provider} className="rounded-xl border border-border-soft bg-surface px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon size={18} stroke={1.5} className="shrink-0 text-muted" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      {connected && provider === "notion" && integration?.workspace_name && (
                        <p className="text-xs text-muted truncate">{integration.workspace_name}</p>
                      )}
                      {connected && (
                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <IconCheck size={11} stroke={2.5} aria-hidden /> Conectado
                        </p>
                      )}
                    </div>
                    {connected ? (
                      <button
                        type="button"
                        onClick={() => handleDisconnect(provider)}
                        className="shrink-0 flex items-center gap-1 rounded-lg border border-border-soft px-2.5 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
                      >
                        <IconUnlink size={12} stroke={1.5} aria-hidden /> Desconectar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConnect(provider)}
                        disabled={isConnecting}
                        className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
                      >
                        {isConnecting ? "..." : "Conectar"}
                      </button>
                    )}
                  </div>

                  {provider === "google" && connected && (
                    <div className="mt-2.5 flex items-center justify-between pt-2.5 border-t border-border-soft">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${gmailConnected ? "bg-green-500" : "bg-amber-400"}`} />
                        <p className="text-xs text-muted">{gmailConnected ? "Gmail conectado" : "Gmail no habilitado"}</p>
                      </div>
                      {!gmailConnected && (
                        <button
                          type="button"
                          onClick={() => handleConnect("google")}
                          className="text-xs text-amber-600 dark:text-amber-400 underline"
                        >
                          Reconectar para activar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ID de base de datos de Notion */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label htmlFor="notion_db" className="text-xs font-semibold uppercase tracking-wide text-muted">
              ID de la base de datos de Notion
            </label>
            <button
              type="button"
              onClick={() => setShowNotionHelp((v) => !v)}
              className="w-4 h-4 rounded-full border border-border-soft text-[10px] text-muted flex items-center justify-center"
            >
              ?
            </button>
          </div>
          <input
            id="notion_db"
            value={notionDatabaseId}
            onChange={(e) => setNotionDatabaseId(e.target.value)}
            placeholder="32 caracteres del final de la URL de la base de datos"
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <p className="mt-1 text-xs text-muted">Cada nueva tarea creará una página dentro de esta base de datos.</p>
        </div>
        {showNotionHelp && <NotionHelpModal onClose={() => setShowNotionHelp(false)} />}

        {/* Cuenta */}
        <div className="rounded-xl border border-border-soft bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">Cuenta</p>
          <p className="text-sm">{session.user.email}</p>
        </div>

        {/* Guardar */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-40"
        >
          {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar cambios"}
        </button>

        {/* Cerrar sesión */}
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full rounded-xl border border-border-soft py-4 text-sm text-muted hover:text-foreground transition-colors"
        >
          Cerrar sesión
        </button>

        <div className="h-4" />
      </form>
    </div>
  );
}
