// POST /api/social-posts/aprovacao-ceo — o MASTER aprova a semana, peça por
// peça, em BLOCO, para marcas em APROVACAO_CEO (o modo inicial de toda marca).
//
// Corpo: { clientId, de: "AAAA-MM-DD", ate: "AAAA-MM-DD" } (intervalo em
// horário de Brasília, INCLUSIVE nas duas pontas).
//
// O que esta rota faz, e o que ela NÃO faz:
//   • pega os SocialPost do cliente no intervalo, em "draft" ou "approved"
//     (nunca "published"/"publishing"/"publish_unknown" — decidir sobre o que
//     já saiu, ou está sob reserva atômica de saída, não faz sentido);
//   • exige que o modo EM VIGOR desta marca, agora, seja APROVACAO_CEO — outro
//     modo tem o próprio caminho de aprovação (ver `modo-de-aprovacao.ts`);
//   • grava UMA aprovação por regra (`carimboDoCeo`), pelo MESMO caminho que a
//     aprovação do cliente usa (`registrarAprovacaoPorRegra` →
//     `agendarPecasAprovadas` → a única escrita de "scheduled" da casa);
//   • na primeira vez que este cliente é aprovado assim, grava
//     `primeiraSemanaAprovadaEm` — o portão que permite à marca, um dia, sair
//     de APROVACAO_CEO (`solicitarTrocaDeModo`).
//
// Ela NÃO publica nada: só aprova e agenda. A trava de publicação
// (`trava-de-publicacao.ts`) continua na frente de qualquer chamada à Meta.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import {
  modoEmVigor,
  carimboDoCeo,
  registrarAprovacaoPorRegra,
  inicioDoDiaBrasilia,
  fimDoDiaBrasilia,
} from "@/lib/agency/esteira/modo-de-aprovacao";

export const dynamic = "force-dynamic";

/** Só "draft" e "approved" fazem sentido para uma decisão nova — o resto já
 *  saiu, está saindo, ou está numa idempotência que este caminho não conhece. */
const STATUS_ELEGIVEIS = ["draft", "approved"];

const PODEM_APROVAR = ["master"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_APROVAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`aprovacao-ceo:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas aprovações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as
    | { clientId?: unknown; de?: unknown; ate?: unknown }
    | null;
  const clientId = typeof corpo?.clientId === "string" ? corpo.clientId.trim() : "";
  const de = typeof corpo?.de === "string" ? corpo.de.trim() : "";
  const ate = typeof corpo?.ate === "string" ? corpo.ate.trim() : "";

  if (!clientId) {
    return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  }

  const inicio = inicioDoDiaBrasilia(de);
  const fim = fimDoDiaBrasilia(ate);
  if (!inicio || !fim) {
    return NextResponse.json({ error: 'de/ate devem estar no formato "AAAA-MM-DD"' }, { status: 400 });
  }
  if (fim.getTime() < inicio.getTime()) {
    return NextResponse.json({ error: "ate não pode ser anterior a de" }, { status: 400 });
  }

  // Posse pela SESSÃO, nunca pelo corpo: cliente de outro workspace "não
  // existe" aqui — 404, nunca 403 (não confirma que ele existe alhures).
  const cliente = await prisma.client
    .findFirst({
      where: { id: clientId, workspaceId: session.workspaceId },
      select: { modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true, primeiraSemanaAprovadaEm: true },
    })
    .catch(() => null);
  if (!cliente) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const agora = new Date();
  const modoAgora = modoEmVigor(cliente, agora);
  if (modoAgora !== "APROVACAO_CEO") {
    return NextResponse.json(
      {
        error:
          `esta marca está em "${modoAgora}", não em APROVACAO_CEO — a aprovação em bloco do master só vale ` +
          "para marcas neste modo. Outro modo tem o próprio caminho de aprovação.",
      },
      { status: 409 },
    );
  }

  const posts = await prisma.socialPost.findMany({
    where: {
      workspaceId: session.workspaceId,
      clientId,
      scheduledFor: { gte: inicio, lte: fim },
      status: { in: STATUS_ELEGIVEIS },
    },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
  });

  if (posts.length === 0) {
    return NextResponse.json({ ok: true, aprovados: 0, agendados: 0, motivo: "nenhuma peça pronta para aprovação neste intervalo" });
  }

  const postIds = posts.map((p) => p.id);
  const carimbo = carimboDoCeo(session.userId, agora);

  const resultado = await registrarAprovacaoPorRegra({
    workspaceId: session.workspaceId,
    clientId,
    postIds,
    carimbo,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 409 });
  }

  if (!cliente.primeiraSemanaAprovadaEm) {
    await prisma.client
      .update({ where: { id: clientId }, data: { primeiraSemanaAprovadaEm: agora } })
      .catch(() => { /* best-effort: a aprovação já foi gravada; não desfaz por isto */ });
  }

  await prisma.activityEvent
    .create({
      data: {
        workspaceId: session.workspaceId,
        clientId,
        type: "aprovacao_ceo",
        message: `Master aprovou ${postIds.length} peça(s) em APROVACAO_CEO (${de} a ${ate})`,
      },
    })
    .catch(() => { /* best-effort: registro de atividade não pode derrubar a aprovação */ });

  return NextResponse.json({ ok: true, aprovados: postIds.length, agendados: resultado.agendados });
}
