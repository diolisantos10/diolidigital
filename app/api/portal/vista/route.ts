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
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal, gravarCookieDoPortal, PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";
import { lerFichaDeMarca, proximasPerguntas } from "@/lib/agency/esteira/ficha-de-marca";
import { montarVistaDoCliente } from "@/lib/agency/portal/vista-do-cliente";
import { donoDaTela } from "@/lib/agency/portal/dono-da-tela";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const explicito = new URL(request.url).searchParams.get("token")?.trim() || null;
  const token = tokenDoPortal(request, explicito);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  // ── O COOKIE VELHO MORRE AQUI, DEPOIS DE VALIDAR (15/08/2026, rodada 2) ───
  //
  // O cookie `dioli_portal` é UM por navegador (`path:"/"`, 180 dias) e guarda
  // UM cliente. Quem abre o portal de dois clientes fica com a credencial de um
  // presa ao domínio inteiro.
  //
  // A rodada 1 higienizava isso no `proxy.ts`, ANTES de validar o token do
  // caminho — e o `seguranca` mostrou que aquilo era **negação de serviço**: um
  // link para `/portal/access/qualquer-lixo` derrubava a sessão da vítima.
  //
  // Aqui o token JÁ foi validado (`resolvePortalClient` acima) e esta é a
  // PRIMEIRA chamada que a tela do portal faz. Regravar só acontece com token
  // bom — nunca se apaga sessão por causa de lixo na URL, e nunca se grava
  // token podre ("um bug que se esconde por 180 dias").
  const guardado = request.cookies.get(PORTAL_COOKIE)?.value?.trim();
  const precisaRegravar = Boolean(explicito) && guardado !== explicito;

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

    // ── QUEM ESTA TELA ESTÁ MOSTRANDO (15/08/2026) ─────────────────────────
    // Identidade OPACA do dono desta tela. A conversa do PM devolve essa mesma
    // declaração ao servidor, que a confronta com o dono derivado do
    // token/cookie — é a conferência que faltava, e é ela que impede a
    // conversa de um cliente de aparecer no portal de outro. Não é `clientId`:
    // o id interno do banco não trafega ao navegador. (O digest AINDA para em
    // log — ver a ressalva honesta em `lib/agency/portal/dono-da-tela.ts`.)
    const resposta = NextResponse.json({ ok: true, dono: donoDaTela(dono.clientId), ...vista });
    if (precisaRegravar) gravarCookieDoPortal(resposta, request, explicito!);
    return resposta;
  } catch {
    return NextResponse.json({ error: "Não consegui carregar agora" }, { status: 503 });
  }
}
