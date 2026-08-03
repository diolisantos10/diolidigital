// /api/portal/esteira — a mesma verdade da esteira, na linguagem do cliente.
//
// O cliente entra por token, não por sessão, e não conhece id de projeto — ele
// conhece o próprio projeto. Esta rota resolve isso e devolve SÓ o que é dele:
// em que etapa está, o que a agência está fazendo, e o que se espera dele agora.
//
// A leitura vem do mesmo módulo que alimenta a tela da agência. Isso é
// deliberado: se cada lado montasse a própria versão, um dia o cliente veria um
// estado e a equipe outro — e não há jeito pior de perder a confiança dele.
//
// POST é onde o cliente decide: aprovar a direção (que dispara a produção) ou
// aprovar o pacote apresentado. São as duas únicas coisas que ele pode mudar
// aqui — o resto é leitura.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { statusPelaSolicitacao } from "@/lib/agency/esteira/retrato";
import { aprovarDirecao, aprovarPacote } from "@/lib/agency/esteira/marcos";

export const maxDuration = 300;

/** Resolve a solicitação do cliente a partir do token. Único caminho público. */
async function solicitacaoDoToken(token: string): Promise<{ id: string } | { erro: string; codigo: number; clientId?: string }> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid) return { erro: "Acesso negado", codigo: 403 };

  const direto = acesso.record?.clientRequestId;
  if (direto) return { id: direto };

  const clientId = acesso.record?.clientId;
  if (!clientId) return { erro: "Acesso sem projeto vinculado", codigo: 404 };

  const ultima = await prisma.clientRequestDb.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ultima) return { erro: "Ainda não há projeto para acompanhar", codigo: 404, clientId };
  return { id: ultima.id };
}

/**
 * Cliente que entrou DIRETO (sem passar pelo briefing público) não tem
 * solicitação — mas pode ter projeto. Foi o caso da Foocci no lançamento: o
 * portal respondia "não consegui carregar" para um projeto que existia e
 * estava andando. A trilha aqui é derivada dos três carimbos do Project — os
 * momentos que aconteceram — nunca de um status escrito à mão.
 */
async function trilhaDoProjetoDireto(clientId: string) {
  const p = await prisma.project.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { name: true, presentedAt: true, clientApprovedAt: true, directionApprovedAt: true },
  });
  if (!p) return null;

  const etapas = [
    { etapa: "Projeto aberto", feito: true },
    { etapa: "Produção", feito: Boolean(p.presentedAt) },
    { etapa: "Sua aprovação", feito: Boolean(p.clientApprovedAt) },
    { etapa: "No ar", feito: false },
  ];
  const atual = etapas.findIndex((e) => !e.feito);
  const trilha = etapas.map((e, i) => ({
    etapa: e.etapa,
    estado: (i < atual || atual === -1 ? "feito" : i === atual ? "atual" : "futuro") as "feito" | "atual" | "futuro",
  }));

  const aguardandoCliente = Boolean(p.presentedAt && !p.clientApprovedAt);
  return {
    ok: true,
    temProjeto: true,
    projeto: p.name,
    etapa: aguardandoCliente ? "Esperando a sua aprovação" : "Em produção",
    agora: aguardandoCliente
      ? "O pacote está pronto — dê uma olhada na aba Aprovações."
      : "A equipe está produzindo. Quando algo precisar de você, aparece nas pendências.",
    oQueEsperamosDeVoce: aguardandoCliente ? "Aprovar ou pedir ajustes na aba Aprovações." : null,
    aBolaEstaComVoce: aguardandoCliente,
    progresso: Math.round(((atual === -1 ? etapas.length : atual) / etapas.length) * 100),
    trilha,
    pendencias: [],
    ciclo: null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const alvo = await solicitacaoDoToken(token);
  if ("erro" in alvo) {
    // Sem solicitação de briefing, mas com projeto? A trilha vem do projeto.
    if ("clientId" in alvo && alvo.clientId) {
      const direto = await trilhaDoProjetoDireto(alvo.clientId);
      if (direto) return NextResponse.json(direto);
    }
    return NextResponse.json({ error: alvo.erro }, { status: alvo.codigo });
  }

  const status = await statusPelaSolicitacao(alvo.id);
  if (!status) {
    return NextResponse.json({
      ok: true, temProjeto: false,
      titulo: "Ainda estamos organizando tudo",
      agora: "Seu projeto está sendo preparado. Em breve você acompanha tudo por aqui.",
    });
  }

  // Só o que é do cliente. Nada de contagem interna, nome de agente ou erro de
  // execução — o cliente não precisa saber que uma IA falhou, precisa saber em
  // que pé está o trabalho dele.
  return NextResponse.json({
    ok: true,
    temProjeto: true,
    projeto: status.nome,
    etapa: status.leitura.paraCliente.titulo,
    agora: status.leitura.paraCliente.agora,
    oQueEsperamosDeVoce: status.leitura.paraCliente.oQueEsperamosDeVoce,
    aBolaEstaComVoce: status.leitura.responsavel === "cliente",
    progresso: status.leitura.progresso,
    trilha: status.trilha.map((t) => ({ etapa: t.curtoCliente, estado: t.estado })),
    pendencias: status.pendencias.filter((p) => p.jaFoiPedido).map((p) => p.descricao),
    ciclo: status.ciclo ? { referencia: status.ciclo.referencia, resumo: status.ciclo.resumo } : null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; decisao?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const token = tokenDoPortal(request, body.token);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const alvo = await solicitacaoDoToken(token);
  if ("erro" in alvo) return NextResponse.json({ error: alvo.erro }, { status: alvo.codigo });

  const projeto = await prisma.project.findFirst({
    where: { clientRequestId: alvo.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  if (body.decisao === "aprovar_direcao") {
    const r = await aprovarDirecao(projeto.id);
    return NextResponse.json({ ok: r.ok, mensagem: r.ok ? "Direção aprovada. A produção já começou." : r.erro },
      { status: r.ok ? 200 : 409 });
  }

  if (body.decisao === "aprovar_pacote") {
    const r = await aprovarPacote(projeto.id);
    return NextResponse.json({ ok: r.ok, mensagem: r.ok ? "Aprovado! Vamos colocar tudo no ar." : r.erro },
      { status: r.ok ? 200 : 409 });
  }

  return NextResponse.json({ error: "decisão inválida — use aprovar_direcao ou aprovar_pacote" }, { status: 400 });
}
