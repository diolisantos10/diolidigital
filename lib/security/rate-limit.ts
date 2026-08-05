// Lightweight in-memory rate limiter for the PUBLIC (unauthenticated) endpoints
// — the SDR chat, briefing submit, uploads and image generation all spend money
// on the agency's AI keys, so an open loop could drain credits. This is a fixed-
// window counter per key (usually per-IP + route).
//
// ── LIMITAÇÃO DECLARADA: o balde é POR PROCESSO ────────────────────────────────
// O estado vive neste módulo, na memória do processo. Consequências, ditas com
// todas as letras para ninguém confundir isto com uma trava de plataforma:
//   • com N instâncias, o teto real é N × `limit` — o mesmo defeito já declarado
//     no teto de chamadas da Meta;
//   • todo deploy (e todo restart) ZERA os baldes;
//   • ele contém abuso acidental e loop de tela. Ele NÃO contém ataque
//     distribuído: muitos IPs, muitos baldes.
// Hoje o Railway roda uma instância só, e por isso o teto vale. No dia em que
// houver réplica ou autoscaling, isto precisa virar contador compartilhado
// (Redis/banco) ANTES de ser chamado de proteção de gasto.
export const ESCOPO_DO_LIMITE = "processo" as const;

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

/**
 * O IP do cliente — o ÚLTIMO salto do `x-forwarded-for`, não o primeiro.
 *
 * ⚠️ Isto já foi o contrário, e era um furo: `x-forwarded-for` é uma lista que
 * cada proxy APENDA no fim. O começo da lista é o que o CHAMADOR escreveu — ou
 * seja, texto que o atacante controla. Lendo o primeiro item, um
 * `X-Forwarded-For: <aleatório>` por requisição dava um balde novo a cada
 * chamada e o limite virava enfeite — num endpoint que gasta chave de IA paga.
 *
 * Atrás de UM proxy confiável (a borda do Railway), o item que o proxy escreveu
 * é o último, e esse o cliente não consegue forjar. `TRUSTED_PROXY_HOPS` ajusta
 * a contagem se um dia houver mais de um salto nosso na frente (2 = penúltimo).
 * `x-real-ip` só entra quando não há `x-forwarded-for` nenhum.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const saltos = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (saltos.length > 0) {
      const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
      // Menos saltos do que o esperado: fica com o primeiro que existe, mas
      // NUNCA passa do início da lista — cabeçalho curto não vira bypass.
      return saltos[Math.max(0, saltos.length - hops)];
    }
  }
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
