// The resource gate. Before the agents produce anything, answer one question:
// "Do we have everything we need to create what the client asked for?"
//   YES → production starts.
//   NO  → we request exactly what's missing from the client, and hold production.
//
// It reads the briefing (which now captures, per service, what the client has /
// needs / who produces) and decides. If the client agreed that Dioli/AI produces
// everything, nothing is missing. Only real client-side gaps are requested.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";

export interface MissingItem { type: string; description: string }

export async function assessResources(clientRequestId: string): Promise<{ sufficient: boolean; missing: MissingItem[] }> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return { sufficient: true, missing: [] };

  const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })();
  const services = (() => { try { return JSON.parse(req.services ?? "[]"); } catch { return []; } })() as string[];

  const sys = "Você é o coordenador de produção de uma agência de marketing brasileira. Sua função: decidir se a agência JÁ TEM tudo o que precisa pra COMEÇAR a produzir os serviços pedidos, ou se falta algum material que só o CLIENTE pode fornecer. REGRAS: se o cliente disse que a Dioli/IA produz tudo, então NÃO falta material dele. Só liste o que for REALMENTE necessário, do cliente, e que ainda não temos (ex.: fotos dos produtos, logo, acesso à conta de anúncios, banco de mídia). Não invente exigências. Responda SOMENTE JSON válido.";
  const user = `Negócio: ${req.businessName} (${req.segment || "segmento não informado"}).
Serviços pedidos: ${services.join(", ") || "não informado"}.
Briefing (o que o cliente disse ter/precisar/como produzir):
${JSON.stringify(scope)}

Falta algum material DO CLIENTE pra começar a produção? Para cada item que falta, escreva um pedido curto e claro, em linguagem simples, direto pro cliente.
JSON: {"sufficient": true|false, "missing": [{"type": "fotos|logo|acesso|midia|outro", "description": "pedido claro pro cliente"}]}`;

  const r = await generate({ system: sys, user, maxTokens: 600, workspaceId: req.workspaceId ?? undefined, preferredProvider: "claude", agentId: "comercial-materiais", clientId: req.clientId ?? null });
  if (!r.ok) return { sufficient: true, missing: [] }; // fail-open: never block on an AI hiccup

  const data = r.data as { sufficient?: unknown; missing?: unknown };
  const missing: MissingItem[] = Array.isArray(data.missing)
    ? data.missing
        .map((m) => (m && typeof m === "object" ? m as Record<string, unknown> : {}))
        .filter((m) => typeof m.description === "string" && (m.description as string).trim())
        .map((m) => ({ type: typeof m.type === "string" ? m.type : "material", description: (m.description as string).trim() }))
    : [];
  const sufficient = data.sufficient === true || missing.length === 0;
  return { sufficient, missing };
}
