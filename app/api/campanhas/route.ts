// /api/campanhas — as campanhas de tráfego pago que esta agência criou.
//
// GET  → lista, com o teto aprovado e quem autorizou ligar cada uma.
// POST → { campanhaId, acao: "ligar" | "desligar" }
//
// Ligar é a única ação da casa inteira que faz dinheiro de um cliente sair.
// Por isso ela exige sessão da agência (nunca token de portal anônimo) e grava
// QUEM autorizou. "Quem mandou gastar R$ 40 por dia na conta da padaria?" é uma
// pergunta que um dia vai ser feita, e precisa ter resposta.
//
// Desligar é deliberadamente mais fácil que ligar: frear nunca deve depender de
// cerimônia. Um freio com burocracia não é freio.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { ligarCampanha, desligarCampanha } from "@/lib/agency/esteira/trafego";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const campanhas = await prisma.adCampaign.findMany({
    where: session?.workspaceId ? { workspaceId: session.workspaceId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  return NextResponse.json({
    total: campanhas.length,
    /** O número que importa no painel: quantas estão gastando agora. */
    ativas: campanhas.filter((c) => c.status === "active").length,
    campanhas: campanhas.map((c) => ({
      id: c.id, nome: c.name, status: c.status,
      orcamentoDiarioBRL: c.dailyBudgetBRL, tetoAprovadoBRL: c.approvedCapBRL,
      autorizadaPor: c.activatedBy, autorizadaEm: c.activatedAt,
      ultimoErro: c.lastError,
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  // FAIXA 1 do CSRF: "ligar" faz dinheiro do cliente sair de verdade.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  let body: { campanhaId?: string; acao?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { campanhaId, acao } = body;
  if (!campanhaId || (acao !== "ligar" && acao !== "desligar")) {
    return NextResponse.json({ error: 'campanhaId e acao ("ligar" | "desligar") são obrigatórios' }, { status: 400 });
  }

  // A campanha precisa ser DESTE workspace. Sem esta checagem, um id vazado
  // ligaria a campanha de outra agência.
  const campanha = await prisma.adCampaign.findUnique({ where: { id: campanhaId }, select: { workspaceId: true } });
  if (!campanha || (session?.workspaceId && campanha.workspaceId !== session.workspaceId)) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  if (acao === "desligar") {
    const r = await desligarCampanha(campanhaId);
    return r.ok ? NextResponse.json({ ok: true, status: "paused" })
                : NextResponse.json({ error: r.erro }, { status: 502 });
  }

  const quem = session?.email ? `agencia:${session.email}` : "agencia";
  const r = await ligarCampanha(campanhaId, quem);
  return r.ok ? NextResponse.json({ ok: true, status: "active", autorizadaPor: quem })
              : NextResponse.json({ error: r.erro }, { status: 400 });
}
