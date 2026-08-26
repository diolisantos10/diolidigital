// GET /api/portal/vista — a vista do cliente para o portal novo (11 abas).
//
// O que esta rota entrega e nenhuma outra entregava: a MARCA (nome e símbolo do
// cadastro, para o cabeçalho), a CONTA, as ENTREGAS, as CAMPANHAS e a leitura
// da operação POR DEPARTAMENTO.
//
// O que ela NÃO entrega, de propósito: projetos, aprovações, pedidos, conexões
// e números de rede. Essas cinco já têm rota própria, com a mesma fronteira
// aplicada na origem — duplicar aqui criaria duas verdades sobre os mesmos
// fatos, que é o defeito que este portal já pagou caro.
//
// A fronteira mora em `lib/agency/portal/vista-do-cliente.ts`: o `select` do
// Prisma já é estreito, e o montador é a segunda tranca — coluna nova que
// alguém acrescentar ao `select` por engano continua sem sair daqui.
//
// O dono vem SEMPRE do token (derivação, nunca comparação — regra da casa de
// 03/08/2026). `clientId` de query não entra.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { donoDoPortal } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerFichaDeMarca, proximasPerguntas } from "@/lib/agency/esteira/ficha-de-marca";
import { montarVistaDoCliente } from "@/lib/agency/portal/vista-do-cliente";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  // ── TOKEN VÁLIDO SEM FICHA DE CLIENTE NÃO É ACESSO NEGADO (6ª rodada) ─────
  //
  // Medido em produção: um prospect recém-orçado, com o link que a casa acabou
  // de mandar, recebia 200 na esteira e nas mensagens (com a proposta dele
  // dentro) e **403 "Acesso negado"** aqui — porque a ficha de `Client` só
  // nasce quando ele ACEITA. Ausência de ficha virava afirmação de que ele não
  // podia entrar. Ver `donoDoPortal`.
  //
  // Token inválido, expirado ou revogado continua 403, sem um milímetro de
  // folga. O que muda é só o caso em que o acesso é legítimo e ainda não há o
  // que mostrar — e aí a casa mostra o vazio, com todas as letras.
  const dono = await donoDoPortal(token);
  if (dono === "invalido") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  if (dono === "sem-cliente") return NextResponse.json({ ok: true, aindaSemFicha: true });

  try {
    const [cliente, projetos, campanhas, posts, ficha, solicitacao] = await Promise.all([
      prisma.client.findUnique({
        where: { id: dono.clientId },
        // Select explícito — o que não entra aqui não tem COMO vazar.
        // `portalToken` fica de fora: é a credencial da sessão, não um dado da
        // conta, e não tem por que trafegar de volta para a tela.
        select: { name: true, industry: true, email: true, phone: true, website: true, createdAt: true },
      }),
      prisma.project.findMany({
        where: { clientId: dono.clientId },
        select: { id: true },
      }),
      prisma.adCampaign.findMany({
        where: { clientId: dono.clientId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, objective: true, audience: true,
          approvedCapBRL: true, dailyBudgetBRL: true, status: true,
        },
      }),
      prisma.socialPost.findMany({
        where: { clientId: dono.clientId },
        select: { status: true, visibility: true },
      }),
      lerFichaDeMarca(dono.clientId).catch(() => null),
      // Os serviços contratados vivem na solicitação de briefing quando ela
      // existe. Cliente criado direto não tem — e aí a lista é vazia, que é a
      // verdade, não um "plano completo" inventado.
      prisma.clientRequestDb.findFirst({
        where: { clientId: dono.clientId },
        orderBy: { createdAt: "desc" },
        select: { services: true },
      }),
    ]);

    if (!cliente) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    // As entregas vêm pelos projetos do cliente. `visibility` é filtrado duas
    // vezes de propósito: aqui (para não trazer do banco o que não vai sair) e
    // no montador (para que uma consulta futura mais larga continue barrada).
    const entregas = projetos.length === 0 ? [] : await prisma.deliverable.findMany({
      where: { projectId: { in: projetos.map((p) => p.id) }, visibility: "compartilhado" },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: {
        id: true, name: true, type: true, status: true, revisionStatus: true,
        version: true, updatedAt: true, visibility: true,
        project: { select: { name: true } },
      },
    });

    const perguntas = ficha
      ? proximasPerguntas(ficha).map((c) => ({ campo: c.campo, pergunta: c.pergunta, rotulo: c.rotulo }))
      : [];

    const vista = montarVistaDoCliente({
      cliente,
      projetos,
      posts,
      campanhas,
      entregas: entregas.map((d) => ({ ...d, projetoNome: d.project?.name ?? null })),
      servicos: (() => {
        try {
          const v: unknown = JSON.parse(solicitacao?.services ?? "[]");
          return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
        } catch {
          return [];
        }
      })(),
      marca: ficha
        ? {
            respondidas: ficha.definidos,
            total: ficha.campos.length,
            perguntas,
            campos: ficha.campos.map((c) => ({ rotulo: c.rotulo, estado: c.estado })),
          }
        : null,
    });

    return NextResponse.json({ ok: true, ...vista });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar agora" }, { status: 503 });
  }
}
