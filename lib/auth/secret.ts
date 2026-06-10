// Single source of truth for the JWT signing key.
// Edge-compatible — uses only process.env and TextEncoder (no Node.js APIs).
// Both proxy.ts (Edge runtime) and session.ts (Node.js runtime) import this.

const DEV_FALLBACK = "dioli-dev-fallback-set-AUTH_SECRET-in-production";

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[AUTH] AUTH_SECRET environment variable is not set. " +
          "Add AUTH_SECRET to Railway Variables before deploying. " +
          "Generate one with: openssl rand -base64 32"
      );
    }
    console.warn(
      "[auth] AUTH_SECRET not set — using dev fallback (development only). " +
        "Set AUTH_SECRET in .env.local for local testing."
    );
    return new TextEncoder().encode(DEV_FALLBACK);
  }

  return new TextEncoder().encode(secret);
}
