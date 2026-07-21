import { createHmac, timingSafeEqual } from "crypto";

// Fase 2 del plan de implementación — hallazgo de auditoría: los callbacks de
// OAuth (Google/Notion) usaban el parámetro `state` como si fuera confiable
// (userId en claro, o "userId:mobile"), sin verificar que la petición viniera
// de quien realmente inició el flujo. Cualquiera podía completar SU PROPIO
// consentimiento y mandar `state=<user_id de otra persona>` para vincular su
// cuenta de Google/Notion al perfil de esa víctima.
//
// Esta firma HMAC hace que `state` sea imposible de forjar sin el secreto del
// servidor, y le pone fecha de caducidad — funciona igual para el flujo web
// (con sesión de cookie) y el de mobile (browser externo sin cookies, por
// eso no se puede simplemente re-verificar la sesión actual en el callback).

const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutos, tiempo generoso para completar el consentimiento

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("OAUTH_STATE_SECRET (o ENCRYPTION_KEY) no está configurada");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/** Genera un `state` firmado que codifica el userId, si es mobile, y la hora. */
export function signOAuthState(userId: string, isMobile: boolean): string {
  const payload = `${userId}:${isMobile ? "mobile" : "web"}:${Date.now()}`;
  const signature = sign(payload);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

/**
 * Verifica un `state` recibido en un callback de OAuth. Devuelve el userId e
 * isMobile solo si la firma es válida y no expiró; null en cualquier otro
 * caso (forjado, corrupto, o expirado).
 */
export function verifyOAuthState(state: string): { userId: string; isMobile: boolean } | null {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = sign(payload);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const [userId, mobileFlag, tsStr] = payload.split(":");
  const ts = Number(tsStr);
  if (!userId || !ts || Date.now() - ts > MAX_STATE_AGE_MS) return null;

  return { userId, isMobile: mobileFlag === "mobile" };
}
