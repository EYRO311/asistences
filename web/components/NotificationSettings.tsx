"use client";

import { useEffect, useState } from "react";
import { sileo } from "sileo";

const REMINDER_OPTIONS = [5, 10, 15, 30, 60];

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings({
  remindersEnabled,
  reminderMinutesBefore,
}: {
  remindersEnabled: boolean;
  reminderMinutesBefore: number;
}) {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
  const [subscribed, setSubscribed] = useState(false);
  const [minutesBefore, setMinutesBefore] = useState(reminderMinutesBefore);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub) && remindersEnabled);
    });
    // Solo se corre una vez al montar, para reflejar el estado real del navegador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function savePreferences(nextEnabled: boolean, nextMinutes: number) {
    await fetch("/api/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminders_enabled: nextEnabled, reminder_minutes_before: nextMinutes }),
    });
  }

  async function subscribe() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        sileo.error({
          title: "Permiso denegado",
          description: "No podremos avisarte sin permiso de notificaciones del navegador.",
        });
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Notificaciones no configuradas todavía");

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la suscripción");

      await savePreferences(true, minutesBefore);
      setSubscribed(true);
      sileo.success({ title: "Recordatorios activados" });
    } catch (err) {
      sileo.error({ title: "No se pudo activar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      await savePreferences(false, minutesBefore);
      setSubscribed(false);
      sileo.success({ title: "Recordatorios desactivados" });
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMinutesChange(value: number) {
    setMinutesBefore(value);
    if (subscribed) await savePreferences(true, value);
  }

  if (!supported) {
    return (
      <section className="mb-8 rounded-md border border-border-soft px-4 py-3">
        <p className="font-medium">Recordatorios</p>
        <p className="text-sm text-muted">Tu navegador no soporta notificaciones push.</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-md border border-border-soft px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Recordatorios</p>
          <p className="text-sm text-muted">
            {subscribed ? "Activos en este navegador" : "Recibe un aviso antes de que empiece una tarea"}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={subscribed ? unsubscribe : subscribe}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
            subscribed ? "border-border-soft hover:bg-surface" : "border-foreground bg-foreground text-background"
          }`}
        >
          {loading ? "..." : subscribed ? "Desactivar" : "Activar"}
        </button>
      </div>

      {subscribed && (
        <div>
          <label className="text-xs text-muted mb-1.5 block" htmlFor="reminder_minutes">
            Avisar con cuánta anticipación
          </label>
          <select
            id="reminder_minutes"
            value={minutesBefore}
            onChange={(e) => handleMinutesChange(Number(e.target.value))}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          >
            {REMINDER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min antes
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
