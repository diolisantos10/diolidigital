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
async function solicitacaoDoToken(token: string): Promise<{ id: string } | { erro: string; codigo: number }> {
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
  if (!ultima) return { erro: "Ainda não há projeto para acompanhar", codigo: 404 };
  return { id: ultima.id };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const alvo = await solicitacaoDoToken(token);
  if ("erro" in alvo) return NextResponse.json({ error: alvo.erro }, { status: alvo.codigo });

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
