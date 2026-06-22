// AES-256-GCM encryption for secrets at rest (API keys).
// SERVER-ONLY. Never import from a client component.
//
// The encryption key is derived (scrypt) from a server secret. In order of
// preference: CREDENTIALS_SECRET → DATABASE_URL (already a server secret on
// Railson/Turso) → a constant fallback. Setting CREDENTIALS_SECRET in the
// Railway dashboard is recommended for production hardening, but the system
// works without it so non-technical operators are never blocked.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const SALT = "dioli-agency-os::credentials::v1";

function secretMaterial(): string {
  return (
    process.env.CREDENTIALS_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "dioli-agency-os-fallback-secret-change-me"
  );
}

function derivedKey(): Buffer {
  // 32 bytes for aes-256.
  return scryptSync(secretMaterial(), SALT, 32);
}

// Returns "iv:authTag:ciphertext" (all hex). Safe to store in a text column.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, derivedKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

// Reverses encryptSecret. Returns null on any failure (tampered, wrong secret).
export function decryptSecret(payload: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = createDecipheriv(ALGO, derivedKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

// A non-sensitive display hint for a key, e.g. "sk-ant-…a1b2".
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••";
  const prefix = trimmed.slice(0, Math.min(6, trimmed.indexOf("-") + 1) || 3);
  return `${prefix}…${trimmed.slice(-4)}`;
}
