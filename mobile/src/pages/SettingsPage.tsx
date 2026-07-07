import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";
import type { Session } from "@supabase/supabase-js";
import type { PreferredTransport } from "@/lib/types";
import { TRANSPORT_OPTIONS } from "@/lib/itemPresentation";
import { getIntegrations, disconnectIntegration, type Integration } from "@/lib/integrations";
import { IconX, IconSun, IconMoon, IconDeviceLaptop, IconCalendar, IconBrandNotion, IconCheck, IconUnlink } from "@tabler/icons-react";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

type Theme = "light" | "dark" | "system";

interface Props {
  session: Session;
  onClose: () => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
  localStorage.setItem("theme", theme);
}

export function SettingsPage({ session, onClose }: Props) {
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [transport, setTransport] = useState<PreferredTransport | "">("");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) ?? "system");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("full_name, location, preferred_transport, wake_time, sleep_time")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setFullName(data.full_name ?? "");
        setLocation(data.location ?? "");
        setTransport((data.preferred_transport as PreferredTransport) ?? "");
        setWakeTime(data.wake_time ?? "07:00");
        setSleepTime(data.sleep_time ?? "23:00");
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("profiles").update({
      full_name: fullName || null,
      location: location || null,
      preferred_transport: transport || null,
      wake_time: wakeTime,
      sleep_time: sleepTime,
      theme: theme === "system" ? null : theme,
    }).eq("id", session.user.id);
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
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleThemeChange(value)}
                className={`flex-1 flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition-colors ${
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

        {/* Ubicación */}
        <div>
          <label htmlFor="loc" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Ubicación
          </label>
          <input
            id="loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ciudad, país..."
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
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
              return (
                <div key={provider} className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3">
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
              );
            })}
          </div>
        </div>

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
