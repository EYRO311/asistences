#!/usr/bin/env node
// Fase 2 del plan de implementación — hallazgo de auditoría: los callbacks de
// OAuth (Google/Notion) confiaban en el `user_id` del parámetro `state` sin
// verificarlo, permitiendo que cualquiera vinculara su propia cuenta de
// Google/Notion al perfil de otra persona con solo conocer su user_id.
//
// Este script reimplementa la lógica de web/lib/oauthState.ts (sign/verify)
// y prueba las propiedades de seguridad que debe cumplir: un state válido se
// verifica, uno forjado/alterado/expirado se rechaza. Si el archivo real
// cambia de formato, este script debe actualizarse igual — es el contrato,
// no una copia a mantener sincronizada por accidente.
//
// Uso: node scripts/verify-oauth-state.mjs

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = "test-secret-only-for-this-script";
const MAX_STATE_AGE_MS = 10 * 60 * 1000;

function sign(payload) {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

function signOAuthState(userId, isMobile, timestamp = Date.now()) {
  const payload = `${userId}:${isMobile ? "mobile" : "web"}:${timestamp}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

function verifyOAuthState(state) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;

  let payload;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = sign(payload);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  const [userId, mobileFlag, tsStr] = payload.split(":");
  const ts = Number(tsStr);
  if (!userId || !ts || Date.now() - ts > MAX_STATE_AGE_MS) return null;

  return { userId, isMobile: mobileFlag === "mobile" };
}

let failures = 0;
function check(name, condition) {
  console.log(`${condition ? "✓" : "✗"} ${name}`);
  if (!condition) failures++;
}

const REAL_USER_ID = "11111111-1111-1111-1111-111111111111";
const ATTACKER_USER_ID = "22222222-2222-2222-2222-222222222222";

// Casos válidos
const stateWeb = signOAuthState(REAL_USER_ID, false);
check(
  "state web válido se verifica correctamente",
  verifyOAuthState(stateWeb)?.userId === REAL_USER_ID && verifyOAuthState(stateWeb)?.isMobile === false
);

const stateMobile = signOAuthState(REAL_USER_ID, true);
check(
  "state mobile válido se verifica correctamente",
  verifyOAuthState(stateMobile)?.userId === REAL_USER_ID && verifyOAuthState(stateMobile)?.isMobile === true
);

// Ataque: firma inventada sin conocer el secreto
const forgedSig = "deadbeef".repeat(8);
const forged = `${Buffer.from(`${REAL_USER_ID}:web:${Date.now()}`).toString("base64url")}.${forgedSig}`;
check("state con firma inventada se rechaza", verifyOAuthState(forged) === null);

// Ataque: firmar con un secreto distinto al del servidor
const wrongSecretPayload = `${REAL_USER_ID}:web:${Date.now()}`;
const wrongSecretSig = createHmac("sha256", "wrong-secret").update(wrongSecretPayload).digest("hex");
const forgedWithWrongSecret = `${Buffer.from(wrongSecretPayload).toString("base64url")}.${wrongSecretSig}`;
check("state re-firmado con secreto incorrecto se rechaza", verifyOAuthState(forgedWithWrongSecret) === null);

// Tamper: cambiar el userId del payload sin volver a firmar (reusar la firma original)
const [, originalSig] = stateWeb.split(".");
const tamperedPayload = Buffer.from(`${ATTACKER_USER_ID}:web:${Date.now()}`).toString("base64url");
check("state con userId alterado (firma original reusada) se rechaza", verifyOAuthState(`${tamperedPayload}.${originalSig}`) === null);

// Expirado
const expiredState = signOAuthState(REAL_USER_ID, false, Date.now() - 20 * 60 * 1000);
check("state expirado (>10 min) se rechaza", verifyOAuthState(expiredState) === null);

// Formato corrupto
check("state vacío se rechaza", verifyOAuthState("") === null);
check("state sin punto separador se rechaza", verifyOAuthState("nopunto") === null);

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron — el state de OAuth NO es seguro contra forjado.`);
  process.exit(1);
}

console.log("\nTodas las verificaciones de seguridad del state de OAuth pasaron.");
