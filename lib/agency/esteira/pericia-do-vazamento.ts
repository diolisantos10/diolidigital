// pericia-do-vazamento.ts — QUANTOS CARDS VAZARAM, E ALGUÉM CHEGOU A VER?
// SOMENTE LEITURA. Não corrige, não esconde, não apaga.
//
// ─── A PERGUNTA QUE ISTO RESPONDE ───────────────────────────────────────────
//
// O piloto assistido subiu em 15/08/2026 e o card de aprovação do City Jobs
// mostrou ao cliente o custo em dólar de cada agente da casa. Consertar o
// código responde "não acontece de novo". Não responde a pergunta cara:
// **quantos cards assim existem, e algum cliente pagante chegou a abrir?**
//
// ─── POR QUE ISTO É UMA ROTA, E NÃO UM SCRIPT ───────────────────────────────
//
// O banco de produção é um SQLite dentro de um volume no contêiner do Railway:
// ninguém alcança de fora. Mesmo motivo, mesma solução e mesmo formato de
// `app/api/admin/links-do-portal` — a regra roda ONDE O BANCO ESTÁ.
//
// ─── O LIMITE DA PROVA, DECLARADO ───────────────────────────────────────────
//
// `PortalAccess.lastAccessedAt` diz que o portal daquele cliente FOI ABERTO, e
// quando. Ele não diz que a aba Aprovações foi renderizada, nem que a pessoa
// leu a linha do custo. Portanto:
//
//   • acesso DEPOIS do card  → o cliente teve o card na frente dele. É o mais
//     perto de "viu" que este banco consegue provar.
//   • nenhum acesso depois   → ninguém abriu o portal desde que o card nasceu.
//     Isso é evidência de verdade, não suposição.
//   • sem PortalAccess nenhum → não há como saber. E "não há como saber" é a
//     resposta certa; "provavelmente não" é chute com cara de informação.

import { prisma } from "@/lib/db/client";
import { procurarVazamentos, type Vazamento } from "@/lib/agency/esteira/vazamento-ao-cliente";

export interface CardVazado {
  id: string;
  clientId: string | null;
  clientRequestId: string | null;
  cliente: string | null;
  criadoEm: Date;
  status: string;
  department: string;
  requestedBy: string;
  vazamentos: Vazamento[];
}

export interface VereditoPorCliente {
  clientId: string;
  cliente: string;
  cards: number;
  cardMaisAntigo: Date;
  /** Quantos acessos ao portal foram registrados para este cliente, no total. */
  acessosAoPortal: number;
  ultimoAcessoAoPortal: Date | null;
  /**
   * `true`  — portal aberto DEPOIS do card: o cliente teve o card na frente.
   * `false` — nenhum acesso depois do card nascer.
   * `null`  — não há registro de acesso nenhum: **não há como saber**.
   */
  viu: boolean | null;
}

export interface Pericia {
  cards: CardVazado[];
  total: number;
  porCliente: VereditoPorCliente[];
  /** Cards vazados que NÃO estão visíveis ao cliente — contados à parte. */
  totalInternos: number;
}

/**
 * Varre TODOS os `ApprovalRequest` com `clientVisible: true` e devolve os que
 * carregam custo, id de banco ou slug de agente — com o veredito de acesso por
 * cliente.
 */
export async function periciaDoVazamento(): Promise<Pericia> {
  const linhas = await prisma.approvalRequest.findMany({
    where: { reviewNote: { not: null } },
    select: {
      id: true,
      clientId: true,
      clientRequestId: true,
      createdAt: true,
      status: true,
      department: true,
      requestedBy: true,
      reviewNote: true,
      clientVisible: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const vazados = linhas
    .map((l) => ({ l, vazamentos: procurarVazamentos(l.reviewNote) }))
    .filter((x) => x.vazamentos.length > 0);

  const visiveis = vazados.filter((x) => x.l.clientVisible);

  // O nome do cliente vem do dono direto ou da solicitação — as duas posses que
  // `ApprovalRequest` aceita.
  const idsDiretos = [...new Set(visiveis.map((x) => x.l.clientId).filter((v): v is string => !!v))];
  const idsDeSolicitacao = [
    ...new Set(visiveis.map((x) => x.l.clientRequestId).filter((v): v is string => !!v)),
  ];
  const solicitacoes = idsDeSolicitacao.length
    ? await prisma.clientRequestDb.findMany({
        where: { id: { in: idsDeSolicitacao } },
        select: { id: true, clientId: true },
      })
    : [];
  const clienteDaSolicitacao = new Map(solicitacoes.map((s) => [s.id, s.clientId]));
  const todosIds = [
    ...new Set([
      ...idsDiretos,
      ...solicitacoes.map((s) => s.clientId).filter((v): v is string => !!v),
    ]),
  ];
  const clientes = todosIds.length
    ? await prisma.client.findMany({ where: { id: { in: todosIds } }, select: { id: true, name: true } })
    : [];
  const nomePorId = new Map(clientes.map((c) => [c.id, c.name]));

  const donoDoCard = (l: (typeof visiveis)[number]["l"]): string | null =>
    l.clientId ?? (l.clientRequestId ? clienteDaSolicitacao.get(l.clientRequestId) ?? null : null);

  const cards: CardVazado[] = visiveis.map(({ l, vazamentos }) => {
    const dono = donoDoCard(l);
    return {
      id: l.id,
      clientId: dono,
      clientRequestId: l.clientRequestId,
      cliente: dono ? nomePorId.get(dono) ?? null : null,
      criadoEm: l.createdAt,
      status: l.status,
      department: l.department,
      requestedBy: l.requestedBy,
      vazamentos,
    };
  });

  const porCliente: VereditoPorCliente[] = [];
  for (const clientId of todosIds) {
    const meus = cards.filter((c) => c.clientId === clientId);
    if (meus.length === 0) continue;
    const cardMaisAntigo = meus.reduce(
      (a, c) => (c.criadoEm < a ? c.criadoEm : a),
      meus[0]!.criadoEm,
    );
    const acessos = await prisma.portalAccess.findMany({
      where: { clientId },
      select: { lastAccessedAt: true, accessCount: true },
    });
    const totalAcessos = acessos.reduce((s, a) => s + (a.accessCount ?? 0), 0);
    const ultimo = acessos
      .map((a) => a.lastAccessedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    porCliente.push({
      clientId,
      cliente: nomePorId.get(clientId) ?? "(cliente removido)",
      cards: meus.length,
      cardMaisAntigo,
      acessosAoPortal: totalAcessos,
      ultimoAcessoAoPortal: ultimo,
      // Sem registro de acesso NENHUM, a resposta honesta é "não há como saber".
      viu: acessos.length === 0 ? null : ultimo ? ultimo > cardMaisAntigo : false,
    });
  }

  return {
    cards,
    total: cards.length,
    porCliente,
    totalInternos: vazados.length - visiveis.length,
  };
}
