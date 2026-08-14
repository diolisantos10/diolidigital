// POST /api/meta/publish
// A thin HTTP wrapper over the publish interface, for callers that prefer an
// API to a direct server-side import (e.g. internal tools, manual testing).
// The Planner / autonomous engine can also import publishPost() directly from
// "@/lib/integrations/meta".
//
// Body: PublishInput (connectionId, platform, format?, caption?, mediaUrl?)

// ⚠️ ESTA ROTA ESCREVE NO PERFIL REAL DO CLIENTE.
// O que sai daqui é post público e permanente na conta dele. Até 05/08/2026
// pedia só `getSession()`: `design_staff`, `ads_staff` — e uma SESSÃO DE PORTAL
// (o próprio cliente, com `clientId`) — podiam publicar conteúdo arbitrário.
// Agora: papel explícito, portal barrado, e teto por usuário (um laço aqui vira
// rajada de escrita na Graph, que é exatamente o que restringe conta de app).
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { publishPost } from "@/lib/integrations/meta/client";
import type { PublishInput } from "@/lib/integrations/meta/types";

/** Quem publica em nome do cliente. Design e Ads produzem peça; quem leva ao
 *  ar é a operação social e quem responde pela conta. */
const PODEM_PUBLICAR = ["master", "project_manager", "social_staff"] as const;

/** Teto de publicações por usuário. Ritmo de gente, não de máquina. */
const PUBLICACOES_POR_MINUTO = 6;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_PUBLICAR]);
  if (error) return error;
  // Uma sessão de portal nunca publica, mesmo que carregue um papel interno.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`meta-publish:${session.userId}`, PUBLICACOES_POR_MINUTO, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas publicações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as PublishInput | null;
  if (!body?.connectionId || !body?.platform) {
    return NextResponse.json({ error: "connectionId e platform são obrigatórios" }, { status: 400 });
  }

  // ── O `postId` NÃO ATRAVESSA ESTA ROTA (14/08/2026) ───────────────────────
  // Desde a ordem do CEO ("quem libera são os clientes, peça por peça") a trava
  // pergunta se o cliente dono da PEÇA aprovou a PEÇA. Aqui o corpo traz
  // legenda e mídia ARBITRÁRIAS: aceitar um `postId` junto deixaria alguém
  // apontar uma peça aprovada e publicar outro conteúdo por baixo dela — a
  // aprovação do cliente viraria uma senha, não um consentimento.
  //
  // Então o campo é descartado de propósito, e a trava recusa esta rota com a
  // frase que ensina o caminho certo (agendar a peça e levá-la ao card de
  // aprovação do cliente). Publicação avulsa no perfil de um cliente não tem
  // quem a tenha aprovado — por construção, e é o comportamento desejado.
  const { postId: _descartado, ...semPeca } = body;
  void _descartado;

  const result = await publishPost(session.workspaceId, semPeca);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
