#!/usr/bin/env node
// Fase 0 del plan de implementación: prueba de que las tres implementaciones
// de cifrado del proyecto (web/lib/crypto.ts — Node `crypto`; y
// web/lib/crypto-client.ts / mobile/src/lib/crypto.ts — Web Crypto API,
// idénticas entre sí) son compatibles byte a byte: lo que cifra una la
// puede desencriptar la otra, sin importar cuál.
//
// No importa los archivos reales del proyecto (Next.js server-only vs. Vite
// vs. navegador no comparten runtime fácilmente desde un script suelto);
// reimplementa aquí las dos variantes mínimas y las prueba entre sí. Si el
// formato/algoritmo cambia en cualquiera de los tres archivos reales, este
// script debe actualizarse igual — es el contrato, no una copia a mantener
// sincronizada por accidente.
//
// Uso: node scripts/verify-crypto-compat.mjs

import { createCipheriv, createDecipheriv, randomBytes, webcrypto } from "node:crypto";

const ALGORITHM_NODE = "aes-256-gcm";
const ALGO_WEBCRYPTO = "AES-GCM";
const IV_LEN = 12;
const TAG_LEN = 16;

// ── Variante servidor (espejo de web/lib/crypto.ts) ──────────────────────────
function encryptNode(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM_NODE, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptNode(ciphertext, key) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM_NODE, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

// ── Variante Web Crypto (espejo de web/lib/crypto-client.ts y mobile/src/lib/crypto.ts) ──
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function importWebCryptoKey(keyBytes) {
  return webcrypto.subtle.importKey("raw", keyBytes, ALGO_WEBCRYPTO, false, ["encrypt", "decrypt"]);
}

async function encryptWebCrypto(plaintext, cryptoKey) {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LEN));
  const data = new TextEncoder().encode(plaintext);
  const result = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: ALGO_WEBCRYPTO, iv, tagLength: 128 }, cryptoKey, data)
  );
  const ciphertext = result.slice(0, result.length - TAG_LEN);
  const tag = result.slice(result.length - TAG_LEN);
  return `${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ciphertext)}`;
}

async function decryptWebCrypto(ciphertext, cryptoKey) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const iv = hexToBytes(ivHex);
  const tag = hexToBytes(tagHex);
  const data = hexToBytes(dataHex);
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: ALGO_WEBCRYPTO, iv, tagLength: 128 },
    cryptoKey,
    combined
  );
  return new TextDecoder().decode(decrypted);
}

// ── Prueba ───────────────────────────────────────────────────────────────────
const TEST_STRINGS = [
  "hola",
  "",
  "Reunión con equipo — 📅 mañana 9am, café primero ☕",
  "a".repeat(5000),
  "línea 1\nlínea 2\ttab",
];

async function main() {
  const keyBuf = randomBytes(32); // simula ENCRYPTION_KEY (32 bytes = AES-256)
  const webCryptoKey = await importWebCryptoKey(keyBuf);

  let failures = 0;

  for (const text of TEST_STRINGS) {
    const label = JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…(${text.length} chars)` : text);

    // Node cifra -> Web Crypto descifra
    try {
      const cipherFromNode = encryptNode(text, keyBuf);
      const roundTrip = await decryptWebCrypto(cipherFromNode, webCryptoKey);
      if (roundTrip !== text) {
        console.error(`✗ Node→WebCrypto FALLÓ para ${label}: esperaba ${JSON.stringify(text)}, obtuvo ${JSON.stringify(roundTrip)}`);
        failures++;
      } else {
        console.log(`✓ Node→WebCrypto OK para ${label}`);
      }
    } catch (err) {
      console.error(`✗ Node→WebCrypto lanzó error para ${label}:`, err.message);
      failures++;
    }

    // Web Crypto cifra -> Node descifra
    try {
      const cipherFromWebCrypto = await encryptWebCrypto(text, webCryptoKey);
      const roundTrip = decryptNode(cipherFromWebCrypto, keyBuf);
      if (roundTrip !== text) {
        console.error(`✗ WebCrypto→Node FALLÓ para ${label}: esperaba ${JSON.stringify(text)}, obtuvo ${JSON.stringify(roundTrip)}`);
        failures++;
      } else {
        console.log(`✓ WebCrypto→Node OK para ${label}`);
      }
    } catch (err) {
      console.error(`✗ WebCrypto→Node lanzó error para ${label}:`, err.message);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} verificación(es) fallaron — las tres implementaciones NO son compatibles.`);
    process.exit(1);
  }

  console.log("\nTodas las verificaciones pasaron — Node y Web Crypto son compatibles byte a byte.");
}

main();
