import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { eVereditoDaQualidade, camposDaDecisaoHumana } from "@/lib/agency/execution/quality-auditor";

type Params = { id: string };

// ── ESTA PORTA GRAVA VEREDITO. ENTÃO ELA DIZ QUEM JULGOU. ────────────────────
//
// ── Por que a trava existe (25/08/2026, ordem do Diretor Geral) ─────────────
//
// O defeito que acabamos de consertar no auditor (Farol 27, rodada 5: 8 juízes
// em HTTP 429, 10 julgamentos vindos do próprio autor, 0 de 10 com árbitro
// independente e nenhuma tela mudando) tinha UMA causa de fundo, e não era o
// 429: `QualityVerdict.arbitro` era medido e jogado fora. **Valor medido e não
// persistido é o mesmo que não medido.**
//
// Esta rota é a última porta com o mesmo formato do defeito: ela escrevia
// `revisionStatus` vindo do CORPO DA REQUISIÇÃO e não tocava em
// `qualityArbitragem`. O resultado seria pior que nulo — seria HERANÇA: a peça
// ficaria com o carimbo da auditoria ANTERIOR sobre um veredito NOVO. A tela
// diria "julgada por árbitro independente" sobre uma decisão que nenhum árbitro
// tomou. Não é preciso má-fé: basta alguém usar a tela.
//
// A regra, então: **ou grava as três informações juntas, ou não grava veredito.**
//
// ── E "um humano decidiu" é uma QUARTA coisa ───────────────────────────────
//
// Não é `autojulgado` (nenhum modelo julgou a si mesmo), não é `sem_arbitro`
// (alguém olhou, e com mais autoridade que qualquer modelo) e muito menos
// `arbitro_independente` (não houve árbitro nenhum). É `decisao_humana`, com
// nome próprio e palavra própria na tela — do mesmo jeito honesto que os
// outros três estados. Ver `camposDaDecisaoHumana`.
//
// ⚠️ Nem todo `revisionStatus` é veredito: `revision_requested` e `resolved`
// são estados do fluxo com o cliente e não afirmam auditoria nenhuma. Só os
// três de `VEREDITOS_NO_BANCO` obrigam a declaração — cobrar carimbo de quem
// não afirmou nada seria burocracia, não trava.

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.deliverable.findFirst({
    where: { id, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // O veredito só muda quando ele MUDA. Reenviar o mesmo `revisionStatus` numa
  // edição de texto não pode apagar o árbitro que de fato julgou a peça — seria
  // trocar uma auditoria real por "uma pessoa mexeu aqui".
  const mudouOVeredito =
    eVereditoDaQualidade(body.revisionStatus) && body.revisionStatus !== existing.revisionStatus;

  const deliverable = await prisma.deliverable.update({
    where: { id },
    data: {
      status:         body.status         ?? existing.status,
      revisionStatus: body.revisionStatus ?? existing.revisionStatus,
      // As três juntas, sempre — e SÓ quando uma pessoa de fato decidiu.
      ...(mudouOVeredito
        ? camposDaDecisaoHumana(body.revisionStatus as string, session.email || session.userId)
        : {}),
      content:        body.content        ?? existing.content,
      clientFeedback: body.clientFeedback ?? existing.clientFeedback,
      lastFeedback:   body.lastFeedback   ?? existing.lastFeedback,
      version:        body.version        ?? existing.version,
      revisionHistory: body.revisionHistory
        ? JSON.stringify(body.revisionHistory)
        : existing.revisionHistory,
    },
  });
  return NextResponse.json(deliverable);
}
