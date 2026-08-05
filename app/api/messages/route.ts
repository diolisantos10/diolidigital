// GET /api/messages — A CAIXA DE ENTRADA DA AGÊNCIA.
//
// ── O defeito que esta rota fecha ────────────────────────────────────────────
// `readByTeam` era escrito em 11 lugares e lido para contagem em ZERO. Não
// existia caixa de entrada, badge nem lista: a mensagem do cliente gravava e
// morria. Os dois únicos pontos de leitura estavam enterrados dentro da tela de
// um projeto, e um deles atrás de `{data.clientRequestId && …}` — que é null em
// projeto de cliente direto, então nem renderizava.
//
// ── O que devolve ───────────────────────────────────────────────────────────
//   ?resumo=1 → { naoLidas, pedidosNovos, total }  ← o badge do menu
//   (sem query) → { conversas: [...], pedidosNovos }
//
// Ordem das conversas: não-lidas primeiro, depois a mais recente. É a ordem de
// quem precisa RESPONDER, não a ordem de cadastro.
//
// As contagens vêm de `groupBy` (exatas). O texto de prévia vem de uma janela
// das últimas mensagens — thread muito antiga aparece sem prévia em vez de
// aparecer com prévia errada.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

/** Quantas mensagens recentes entram na montagem das prévias. */
const JANELA_DE_PREVIA = 400;

export interface ConversaDaCaixa {
  /** Chave estável da linha (clientId, ou `req:<id>` para prospect sem cliente). */
  chave: string;
  clientId: string | null;
  clientRequestId: string | null;
  nome: string;
  naoLidas: number;
  total: number;
  ultimaEm: string | null;
  ultimaPor: "client" | "team" | null;
  previa: string | null;
  /** Pedidos de conteúdo em aberto deste cliente — o outro lado da caixa. */
  pedidosNovos: number;
}

function recortar(texto: string, max = 110): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > max ? limpo.slice(0, max - 1) + "…" : limpo;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const resumo = new URL(request.url).searchParams.get("resumo") === "1";

  try {
    // ── O escopo: só o que é DESTE workspace ────────────────────────────────
    const clientes = await prisma.client.findMany({
      where: { workspaceId: session.workspaceId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const idsDeClientes = clientes.map((c) => c.id);

    const solicitacoes = await prisma.clientRequestDb.findMany({
      where: {
        OR: [
          { workspaceId: session.workspaceId },
          ...(idsDeClientes.length > 0 ? [{ clientId: { in: idsDeClientes } }] : []),
        ],
      },
      select: { id: true, clientId: true, businessName: true },
    });

    const chavesDoEscopo: Array<{ clientId: { in: string[] } } | { clientRequestId: { in: string[] } }> = [];
    if (idsDeClientes.length > 0) chavesDoEscopo.push({ clientId: { in: idsDeClientes } });
    if (solicitacoes.length > 0) chavesDoEscopo.push({ clientRequestId: { in: solicitacoes.map((s) => s.id) } });

    if (chavesDoEscopo.length === 0) {
      return NextResponse.json(resumo ? { naoLidas: 0, pedidosNovos: 0, total: 0 } : { conversas: [], pedidosNovos: 0 });
    }
    const escopo = chavesDoEscopo.length === 1 ? chavesDoEscopo[0]! : { OR: chavesDoEscopo };

    // ── O badge: uma contagem e nada mais ───────────────────────────────────
    const ondePedidos = { status: "novo", clientId: { in: idsDeClientes } };
    const pedidosNovos = idsDeClientes.length === 0
      ? 0
      : await prisma.contentRequest.count({ where: ondePedidos });

    if (resumo) {
      const naoLidas = await prisma.portalMessage.count({
        where: { ...escopo, authorRole: "client", readByTeam: false },
      });
      return NextResponse.json({ naoLidas, pedidosNovos, total: naoLidas + pedidosNovos });
    }

    // ── As linhas ───────────────────────────────────────────────────────────
    const [todas, naoLidas, recentes, pedidosPorCliente] = await Promise.all([
      prisma.portalMessage.groupBy({
        by: ["clientId", "clientRequestId"],
        where: escopo,
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.portalMessage.groupBy({
        by: ["clientId", "clientRequestId"],
        where: { ...escopo, authorRole: "client", readByTeam: false },
        _count: { _all: true },
      }),
      prisma.portalMessage.findMany({
        where: escopo,
        orderBy: { createdAt: "desc" },
        take: JANELA_DE_PREVIA,
        select: { clientId: true, clientRequestId: true, authorRole: true, body: true, createdAt: true },
      }),
      idsDeClientes.length === 0
        ? Promise.resolve([] as Array<{ clientId: string; _count: { _all: number } }>)
        : prisma.contentRequest.groupBy({
            by: ["clientId"],
            where: ondePedidos,
            _count: { _all: true },
          }),
    ]);

    // Uma linha da groupBy pode estar carimbada só com clientRequestId (as 11
    // escritas antigas). Traduzir para o cliente é o que impede a MESMA
    // conversa de aparecer duas vezes na lista.
    const clientePorSolicitacao = new Map(solicitacoes.map((s) => [s.id, s.clientId]));
    const nomePorCliente = new Map(clientes.map((c) => [c.id, c.name]));
    const nomePorSolicitacao = new Map(solicitacoes.map((s) => [s.id, s.businessName]));

    function chaveDaLinha(l: { clientId: string | null; clientRequestId: string | null }): string | null {
      const dono = l.clientId ?? (l.clientRequestId ? clientePorSolicitacao.get(l.clientRequestId) ?? null : null);
      if (dono) return dono;
      return l.clientRequestId ? `req:${l.clientRequestId}` : null;
    }

    const linhas = new Map<string, ConversaDaCaixa>();
    function garantir(chave: string, l: { clientId: string | null; clientRequestId: string | null }): ConversaDaCaixa {
      const existente = linhas.get(chave);
      if (existente) {
        // Guarda a solicitação como ponto de entrada legado quando aparecer.
        if (!existente.clientRequestId && l.clientRequestId) existente.clientRequestId = l.clientRequestId;
        return existente;
      }
      const ehCliente = !chave.startsWith("req:");
      const solicitacaoId = l.clientRequestId ?? (ehCliente ? null : chave.slice(4));
      const nova: ConversaDaCaixa = {
        chave,
        clientId: ehCliente ? chave : null,
        clientRequestId: solicitacaoId,
        nome:
          (ehCliente ? nomePorCliente.get(chave) : null) ??
          (solicitacaoId ? nomePorSolicitacao.get(solicitacaoId) : null) ??
          "Cliente",
        naoLidas: 0,
        total: 0,
        ultimaEm: null,
        ultimaPor: null,
        previa: null,
        pedidosNovos: 0,
      };
      linhas.set(chave, nova);
      return nova;
    }

    for (const l of todas) {
      const chave = chaveDaLinha(l);
      if (!chave) continue;
      const linha = garantir(chave, l);
      linha.total += l._count._all;
      const quando = l._max.createdAt ? l._max.createdAt.toISOString() : null;
      if (quando && (!linha.ultimaEm || quando > linha.ultimaEm)) linha.ultimaEm = quando;
    }
    for (const l of naoLidas) {
      const chave = chaveDaLinha(l);
      if (!chave) continue;
      garantir(chave, l).naoLidas += l._count._all;
    }
    // Prévia: a primeira ocorrência de cada thread na janela é a mais recente
    // (a busca vem ordenada por createdAt desc).
    for (const m of recentes) {
      const chave = chaveDaLinha(m);
      if (!chave) continue;
      const linha = linhas.get(chave);
      if (!linha || linha.previa !== null) continue;
      linha.previa = recortar(m.body);
      linha.ultimaPor = m.authorRole === "client" ? "client" : "team";
    }
    for (const p of pedidosPorCliente) {
      const linha = linhas.get(p.clientId);
      if (linha) linha.pedidosNovos = p._count._all;
    }
    // Cliente que só tem PEDIDO e nenhuma mensagem também é uma linha da caixa
    // — senão o pedido dele fica invisível até alguém escrever.
    for (const p of pedidosPorCliente) {
      if (linhas.has(p.clientId)) continue;
      linhas.set(p.clientId, {
        chave: p.clientId,
        clientId: p.clientId,
        clientRequestId: null,
        nome: nomePorCliente.get(p.clientId) ?? "Cliente",
        naoLidas: 0,
        total: 0,
        ultimaEm: null,
        ultimaPor: null,
        previa: null,
        pedidosNovos: p._count._all,
      });
    }

    const conversas = [...linhas.values()].sort((a, b) => {
      const pesoA = a.naoLidas + a.pedidosNovos;
      const pesoB = b.naoLidas + b.pedidosNovos;
      if ((pesoA > 0) !== (pesoB > 0)) return pesoB - pesoA;
      return (b.ultimaEm ?? "").localeCompare(a.ultimaEm ?? "");
    });

    return NextResponse.json({ conversas, pedidosNovos });
  } catch (e) {
    console.error("[messages] GET error", e);
    return NextResponse.json({ error: "Não consegui carregar a caixa de entrada agora" }, { status: 503 });
  }
}
