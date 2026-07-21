#!/usr/bin/env node
// Fase 3 del plan de implementación: verifica que el wrapper único hacia
// Notion (web/lib/notionSync.ts) siempre entrega description/location EN
// CLARO a los helpers de bajo nivel, sin importar si el item venía cifrado
// (creado en la app) o ya en claro (importado de Google/Notion), y sin tocar
// el resto de los campos ni romper valores undefined/null.
//
// Reimplementa aquí decrypt() (Node crypto, espejo de web/lib/crypto.ts) y
// decryptForNotion() (espejo de web/lib/notionSync.ts) para probarlas sin
// depender del runtime de Next.js. Si el contrato cambia en los archivos
// reales, este script debe actualizarse igual.
//
// Uso: node scripts/verify-notion-decrypt.mjs

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encrypt(plaintext, key) {
  if (plaintext == null) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext, key) {
  if (ciphertext == null) return null;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [ivHex, tagHex, dataHex] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    return ciphertext;
  }
}

// Espejo de decryptForNotion() en web/lib/notionSync.ts
function decryptForNotion(item, key) {
  return {
    ...item,
    description: item.description !== undefined ? decrypt(item.description, key) : item.description,
    location: item.location !== undefined ? decrypt(item.location, key) : item.location,
  };
}

let failures = 0;
function check(name, condition) {
  console.log(`${condition ? "✓" : "✗"} ${name}`);
  if (!condition) failures++;
}

const key = randomBytes(32);

// Caso 1: item creado en la app — description/location cifrados de verdad.
const encryptedItem = {
  title: "Reunión con Ana",
  description: encrypt("Traer el contrato firmado", key),
  location: encrypt("Av. Reforma 123", key),
  priority: "alta",
};
const resolved1 = decryptForNotion(encryptedItem, key);
check("item cifrado: description queda en claro", resolved1.description === "Traer el contrato firmado");
check("item cifrado: location queda en claro", resolved1.location === "Av. Reforma 123");
check("item cifrado: no toca otros campos", resolved1.title === "Reunión con Ana" && resolved1.priority === "alta");
check(
  "item cifrado: el objeto original no se muta",
  encryptedItem.description !== "Traer el contrato firmado"
);

// Caso 2: item importado de Google/Notion — description/location YA en claro
// (nunca se cifran para estos). decrypt() debe ser un no-op seguro.
const plainItem = {
  title: "Standup diario",
  description: "Sin agenda especial",
  location: "Sala B",
};
const resolved2 = decryptForNotion(plainItem, key);
check("item ya en claro: description no cambia", resolved2.description === "Sin agenda especial");
check("item ya en claro: location no cambia", resolved2.location === "Sala B");

// Caso 3: campos undefined (update parcial) deben seguir undefined, no null.
const partialItem = { title: "Solo título" };
const resolved3 = decryptForNotion(partialItem, key);
check("campo description ausente permanece undefined", resolved3.description === undefined);
check("campo location ausente permanece undefined", resolved3.location === undefined);

// Caso 4: null explícito (se borró la ubicación) se preserva como null, no se rompe.
const nulledItem = { title: "Sin ubicación", location: null };
const resolved4 = decryptForNotion(nulledItem, key);
check("location null explícito se preserva", resolved4.location === null);

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}

console.log("\nEl wrapper hacia Notion desencripta correctamente en todos los casos.");
