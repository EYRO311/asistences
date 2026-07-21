import webpush from "web-push";

// Fase 6 del plan de implementación: único punto de entrada para enviar Web
// Push (VAPID). Las llaves se generan una sola vez (ver README de esta fase
// en el reporte de la fase) y viven en variables de entorno, nunca en código.

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:soporte@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys no configuradas (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  // true si la suscripción ya no existe del lado del navegador (404/410) y
  // debe borrarse de push_subscriptions para no reintentar en vano.
  expired: boolean;
}

export async function sendPushToSubscription(
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>
): Promise<PushSendResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, expired: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    return { ok: false, expired: statusCode === 404 || statusCode === 410 };
  }
}
