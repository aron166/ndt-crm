import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY missing or invalid — must be 64 hex chars (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  return Buffer.from(hex, "hex");
}

// Returns "iv:authTag:ciphertext" — all hex, colon-separated
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV, recommended for GCM
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16-byte auth tag
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// Returns true if the string looks like an encrypted value (not plaintext)
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
