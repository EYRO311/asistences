// AES-256-GCM usando la Web Crypto API (disponible en el WebView de Capacitor).
// Mismo formato que el servidor/web: iv(hex):tag(hex):ciphertext(hex)
// Clave en VITE_ENCRYPTION_KEY (mismo valor que ENCRYPTION_KEY en el servidor)

const ALGO = "AES-GCM";
const IV_LEN = 12;  // 96 bits
const TAG_LEN = 16; // 128 bits

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let _cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const hex = import.meta.env.VITE_ENCRYPTION_KEY as string;
  if (!hex) throw new Error("VITE_ENCRYPTION_KEY no está configurada");
  const keyBytes = hexToBytes(hex);
  _cachedKey = await crypto.subtle.importKey("raw", keyBytes.buffer.slice(0) as ArrayBuffer, ALGO, false, ["encrypt", "decrypt"]);
  return _cachedKey;
}

export async function encryptClient(plaintext: string | null | undefined): Promise<string | null> {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const data = new TextEncoder().encode(plaintext);

  // SubtleCrypto appends the auth tag at the end of the ciphertext
  const result = new Uint8Array(await crypto.subtle.encrypt({ name: ALGO, iv, tagLength: 128 }, key, data));

  const ciphertext = result.slice(0, result.length - TAG_LEN);
  const tag = result.slice(result.length - TAG_LEN);

  return `${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ciphertext)}`;
}

export async function decryptClient(ciphertext: string | null | undefined): Promise<string | null> {
  if (ciphertext == null) return null;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext; // no está encriptado

  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = await getKey();
    const iv = hexToBytes(ivHex);
    const tag = hexToBytes(tagHex);
    const data = hexToBytes(dataHex);

    const combined = new Uint8Array(data.length + tag.length);
    combined.set(data);
    combined.set(tag, data.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv: iv.buffer.slice(0) as ArrayBuffer, tagLength: 128 },
      key,
      combined.buffer.slice(0) as ArrayBuffer
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return ciphertext; // fallback para datos no encriptados
  }
}
