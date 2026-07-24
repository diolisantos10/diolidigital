// Webhook signature verification for Meta. SERVER-ONLY.
// Meta signs every webhook POST with X-Hub-Signature-256: an HMAC-SHA256 of the
// RAW request body keyed with the App Secret. We MUST verify this before
// trusting any event. See app/api/meta/webhooks/route.ts.

import { createHmac, timingSafeEqual } from "crypto";

// Verifies X-Hub-Signature-256 against the raw request body.
// `signatureHeader` is the full header value, e.g. "sha256=abcd...".
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const [algo, provided] = signatureHeader.split("=");
  if (algo !== "sha256" || !provided) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  // Constant-time compare. Buffers must be equal length for timingSafeEqual.
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
