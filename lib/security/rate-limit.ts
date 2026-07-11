// Lightweight in-memory rate limiter for the PUBLIC (unauthenticated) endpoints
// — the SDR chat, briefing submit, uploads and image generation all spend money
// on the agency's AI keys, so an open loop could drain credits. This is a fixed-
// window counter per key (usually per-IP + route). Single-instance only (state
// lives in the module), which matches the current Railway deploy; swap for a
// shared store (Redis) if the app ever scales horizontally.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Occasionally drop expired buckets so the map can't grow without bound.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

export interface RateLimitResult { allowed: boolean; retryAfter: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Railway sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Guard a public route. Returns a ready-to-return 429 Response when over the
 * limit, or null when the request may proceed.
 *   const limited = rateLimited(request, "sdr-chat", 30, 60_000);
 *   if (limited) return limited;
 */
export function rateLimited(req: Request, bucket: string, limit: number, windowMs: number): Response | null {
  const { allowed, retryAfter } = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (allowed) return null;
  return new Response(
    JSON.stringify({ error: "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo." }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } },
  );
}
