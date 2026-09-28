// POST /api/social-posts/{id}/collab/conferir — reconsulta os convites de
// COLABORAÇÃO desta peça (1C-C1, 27/09/2026).
//
// Não existe endpoint na Graph API para ACEITAR um convite — só o painel do
// Instagram faz isso. O único gesto que esta casa tem é CONFERIR de novo o
// `invite_status` (GET /{media-id}/collaborators): quando alguém aceita ou
// recusa pelo painel, é esta rota que atualiza o que a agência sabe.
//
// `master` — reconferir gasta uma chamada à Meta, e a régua desta casa é
// gastar chamada de rede por gesto humano, não por clique de qualquer staff.
//
// ── SEGURANÇA, 28/09/2026 (achado pequeno, corrigido no lugar) ─────────────
// As outras três rotas novas desta mesma frente (`refacoes`, `mes`,
// `collab-pendentes`) recusam sessão de PORTAL (`session.clientId`) antes de
// tocar qualquer dado — esta era a única exceção. `session.clientId` só
// existe hoje por um campo legado (`User.clientId`, "for client users
// only") que o login de portal NUNCA populariza (portal usa cookie
// `dioli_portal`, não `dioli-session`) — mas nada no schema impede um `User`
// de agência (`role: master`) ser gravado com `clientId` também preenchido
// por engano. Sem esta linha, esse User devolveria dados de QUALQUER cliente
// do workspace pela Graph API. Fail closed, mesmo padrão das três irmãs.
//
// Também faltava o teto de chamadas: é a ÚNICA rota nova desta frente que
// bate na Graph API por clique humano sem `rateLimit` — e "rajada de chamada
// à Meta" é exatamente o padrão que restringiu a conta de anúncios da
// agência em 03/08/2026 (`docs/agents/seguranca/vitrine.md`). Teto folgado
// (12/min): é reconferência humana, não automação — não pune o uso normal.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { conexaoDoCliente } from "@/lib/integrations/meta/connections";
import { conferirCollaborators } from "@/lib/integrations/meta/collab";

interface Params { id: string }

export async function POST(_request: NextRequest, ctx: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;
  // Sessão de portal nunca reconfere collaborators em nome da agência.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`collab-conferir:${session.userId}`, 12, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas reconferências em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;

  const post = await prisma.socialPost
    .findFirst({
      // Posse por workspace no PRÓPRIO where — nunca numa comparação depois.
      where: { id, workspaceId: session.workspaceId },
      select: { id: true, clientId: true, externalPostId: true, collabJson: true },
    })
    .catch(() => undefined);
  if (post === undefined) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  if (!post) return NextResponse.json({ error: "post não encontrado" }, { status: 404 });
  if (!post.externalPostId) {
    return NextResponse.json(
      { error: "esta peça ainda não tem id de mídia publicada — não há o que conferir" },
      { status: 422 },
    );
  }

  const conexao = await conexaoDoCliente(session.workspaceId, post.clientId, "instagram").catch(() => null);
  if (!conexao?.token) {
    return NextResponse.json(
      { error: "não encontrei uma conexão do Instagram deste cliente com token válido" },
      { status: 422 },
    );
  }

  const conferencia = await conferirCollaborators(post.externalPostId, conexao.token);

  let anterior: Record<string, unknown> = {};
  if (post.collabJson) {
    try {
      const v = JSON.parse(post.collabJson);
      if (v && typeof v === "object") anterior = v as Record<string, unknown>;
    } catch { /* collabJson corrompido: substitui em vez de travar a conferência */ }
  }
  // `erroDaConferencia` explícito como `undefined` some no `JSON.stringify` —
  // é assim que um erro antigo SOME quando a reconferência dá certo depois.
  const atualizado = {
    ...anterior,
    conferidoEm: new Date().toISOString(),
    convites: conferencia.ok ? conferencia.convites : (anterior as { convites?: unknown }).convites,
    erroDaConferencia: conferencia.ok ? undefined : conferencia.error,
  };

  await prisma.socialPost
    .update({ where: { id: post.id }, data: { collabJson: JSON.stringify(atualizado) } })
    .catch(() => { /* best-effort: a conferência em si já está na resposta abaixo */ });

  if (!conferencia.ok) {
    return NextResponse.json({ ok: false, error: conferencia.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, convites: conferencia.convites });
}
