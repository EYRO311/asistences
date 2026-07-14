import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96 bits recomendado para GCM
const TAG_LENGTH = 16;  // 128 bits auth tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY no está configurada");
  return Buffer.from(hex, "hex");
}

/**
 * Encripta un string con AES-256-GCM.
 * Formato del resultado: iv(hex):tag(hex):ciphertext(hex)
 * Devuelve null si el valor es null/undefined.
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Desencripta un valor generado por encrypt().
 * Devuelve null si el valor es null o no tiene el formato esperado (datos viejos sin encriptar).
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;
  // Si no tiene el formato esperado, es un valor antiguo no encriptado — lo devuelve tal cual
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    // Si falla la desencriptación, devuelve el valor crudo (migración gradual)
    return ciphertext;
  }
}
