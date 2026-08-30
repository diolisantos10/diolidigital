// A CONVERSA PARADA DO PARCEIRO VIRA PEDIDO SOZINHA — e chega ao orçamento.
//
// ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (27/08/2026) ═════════════════════════════
//
// O primeiro cliente real da agência (FOOCCI, `cmtc145qf007a0xo4txmjss11`)
// conversou com o SDR às 01:34 e de novo às 13:43. Contou tudo o que a casa
// precisava. E NENHUM pedido nasceu — a conversa das 13:43 travou na pergunta
// de verba mensal, que para um PARCEIRO a casa não deveria nem fazer. 24 horas
// de atraso no orçamento de quem já tinha entregado o briefing inteiro.
//
// Desde o mesmo dia a casa GRAVA essas conversas (`conversa-sem-pedido.ts`) e
// **ninguém agia sobre o registro**: gravar o cliente perdido e continuar
// perdendo ele. Décima ocorrência de "trava construída sem fechadura".
//
// ═══ O QUE ESTE ARQUIVO PROVA — O EFEITO, NÃO A FUNÇÃO ══════════════════════
//
// O banco aqui é FALSO mas tem ESTADO e tem ÍNDICE ÚNICO: `clientRequestDb`
// recusa com P2002 um segundo pedido para o mesmo fio, exatamente como a
// migração `20260827230000_a_conversa_recuperada_vira_pedido` faz em SQLite.
// Sem isso, a prova de idempotência seria a prova de um `if` — e um `if` não é
// trava. *A trava real é o índice único.*
//
//   1. Conversa parada de parceiro, escopo completo → PEDIDO + ORÇAMENTO
//      entregue, na mesma sequência de pernas do relógio.
//   2. Escopo incompleto → NÃO atravessa, e a pendência é NOMEADA.
//   3. Sem parceria viva → NÃO atravessa.
//   4. Duas batidas do relógio → UM pedido só (a segunda morre no índice).
//   5. Leitura de banco falhando → NÃO promove, e a rodada diz por quê.
//   6. Nenhum campo do cliente preenchido por padrão — falta dado, recusa.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFile } from "node:fs/promises";

// ─── O BANCO FALSO COM ESTADO ────────────────────────────────────────────────
const estado = vi.hoisted(() => ({
  eventos: [] as { clientId: string; message: string; timestamp: Date; workspaceId: string; type: string }[],
  pedidos: [] as Record<string, unknown>[],
  mensagens: [] as Record<string, unknown>[],
  isencoes: [] as Record<string, unknown>[],
  parceria: null as Record<string, unknown> | null,
  quebrarLeituraDeRastro: false,
}));

const db = vi.hoisted(() => {
  const e = estado;
  let seq = 0;
  return {
    activityEvent: {
      findMany: vi.fn(async ({ where }: { where: { type: string; workspaceId?: string } }) => {
        if (e.quebrarLeituraDeRastro) throw new Error("DB unavailable");
        return e.eventos.filter((l) => l.type === where.type && (!where.workspaceId || l.workspaceId === where.workspaceId));
      }),
      deleteMany: vi.fn(async ({ where }: { where: { clientId: string } }) => {
        const antes = e.eventos.length;
        e.eventos = e.eventos.filter((l) => l.clientId !== where.clientId);
        return { count: antes - e.eventos.length };
      }),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    parceriaDoCliente: {
      findUnique: vi.fn(async ({ where }: { where: { clientId: string } }) =>
        e.parceria && e.parceria.clientId === where.clientId ? e.parceria : null),
    },
    isencaoDeParceria: {
      findUnique: vi.fn(async ({ where }: { where: { clientRequestId: string } }) =>
        e.isencoes.find((i) => i.clientRequestId === where.clientRequestId) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { e.isencoes.push(data); return data; }),
    },
    clientRequestDb: {
      // ⚠️ O ÍNDICE ÚNICO, emulado. É esta cláusula — e não um `if` no código de
      // produção — que impede o pedido dobrado.
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const fio = data.fioDaConversa as string | undefined;
        if (fio && e.pedidos.some((p) => p.fioDaConversa === fio)) {
          throw Object.assign(new Error("Unique constraint failed on the fields: (`fioDaConversa`)"), { code: "P2002" });
        }
        const linha = { id: `req_${++seq}`, createdAt: new Date(), status: "new", ...data };
        e.pedidos.push(linha);
        return linha;
      }),
      findMany: vi.fn(async ({ where }: { where?: { status?: { in: string[] } } }) =>
        e.pedidos.filter((p) => !where?.status || where.status.in.includes(p.status as string))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => e.pedidos.find((p) => p.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = e.pedidos.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    portalMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { e.mensagens.push(data); return data; }),
    },
    portalAccess: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: { token: string } }) => ({ token: data.token })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

const { promoverConversasParadas } = await import("@/lib/agency/comercial/promover-conversas-paradas");
const { entregarOrcamentosPendentes } = await import("@/lib/agency/esteira/orcamento-do-briefing");
const { conversaJaDaParaOrcar } = await import("@/lib/agency/comercial/regua-da-conversa-completa");

const AGORA = new Date("2026-08-27T18:00:00.000Z");
const WS = "ws_dioli";
const FIO = "sdr:conversa-foocci-1343";
const CLIENTE = "cmtc145qf007a0xo4txmjss11"; // o cliente real, como está em produção

/** O escopo como o cliente o construiu na conversa — nada além do que ele disse. */
const ESCOPO_COMPLETO = {
  prospectName: "Interlocutor FOOCCI",
  businessName: "FOOCCI",
  segment: "tecnologia",
  objectives: ["vender mais"],
  wantsSocialMedia: true,
  social: { platforms: ["Instagram"], postsPerWeek: 3, storiesPerWeek: 3, videosPerMonth: 4 },
  prospectEmail: "contato@foocci.com.br",
};

const PARCERIA_VIVA = {
  id: "p1", clientId: CLIENTE, autorizadaPor: "Dioli Santos (CEO), D-0B9",
  validaAte: new Date("2026-11-27T00:00:00.000Z"), escopo: "Social Media — parceria de lançamento",
  pecasContratadas: 12, tetoDeIaCentavosUsd: 200, revogadaEm: null,
};

function rastro(over: { escopo?: unknown; clienteDoConvite?: string | null; fio?: string } = {}) {
  return {
    type: "conversa_sem_pedido",
    clientId: over.fio ?? FIO,
    workspaceId: WS,
    timestamp: new Date("2026-08-27T16:43:00.000Z"),
    message: JSON.stringify({
      v: 2,
      escopo: "escopo" in over ? over.escopo : ESCOPO_COMPLETO,
      contato: { nome: "Interlocutor FOOCCI", email: "contato@foocci.com.br" },
      turnos: 11,
      clienteDoConvite: "clienteDoConvite" in over ? over.clienteDoConvite : CLIENTE,
    }),
  };
}

beforeEach(() => {
  estado.eventos = [];
  estado.pedidos = [];
  estado.mensagens = [];
  estado.isencoes = [];
  estado.parceria = PARCERIA_VIVA;
  estado.quebrarLeituraDeRastro = false;
  vi.clearAllMocks();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. O EFEITO REAL — a conversa parada atravessa até o orçamento", () => {
  it("conversa de parceiro com escopo completo vira PEDIDO e o orçamento sai na mesma sequência", async () => {
    estado.eventos.push(rastro());

    const promocao = await promoverConversasParadas(AGORA);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (a) Desligue a promoção — apague a chamada a `createClientRequest` em
    // `promover-conversas-paradas.ts`, ou tire a perna `conversa-recuperada`
    // do despertador. Volta o defeito medido: rastro gravado, cliente perdido.
    expect(promocao.promovidos).toHaveLength(1);
    expect(estado.pedidos).toHaveLength(1);

    const pedido = estado.pedidos[0];
    // A ORIGEM FICA GRAVADA — quem perguntar "de onde saiu este pedido" tem
    // resposta no registro, e ela é indexável (coluna), não só legível (JSON).
    expect(pedido.fioDaConversa).toBe(FIO);
    expect(pedido.source).toBe("conversa_recuperada");
    expect(JSON.parse(pedido.briefingJson as string).origem.fio).toBe(FIO);
    // A isenção é DERIVADA da parceria do parceiro — nunca um pagamento falso.
    expect(estado.isencoes).toHaveLength(1);
    expect(estado.isencoes[0].clientRequestId).toBe(pedido.id);

    // ── O FIO ATÉ O FIM: a perna seguinte do MESMO relógio entrega o número.
    const orcamento = await entregarOrcamentosPendentes();
    expect(orcamento.entregues).toBe(1);
    // O cliente lê o orçamento no portal — não é "não estourou", é a mensagem
    // escrita para ele.
    expect(estado.mensagens).toHaveLength(1);
    expect(String(estado.mensagens[0].body)).toMatch(/FOOCCI/);
    expect(estado.pedidos[0].status).toBe("proposal_pending");
  });

  it("o rastro é resolvido: a conversa some da lista de paradas depois de virar pedido", async () => {
    estado.eventos.push(rastro());
    await promoverConversasParadas(AGORA);
    // Sem isto a lista de conversas perdidas mentiria para cima para sempre.
    expect(estado.eventos).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. ESCOPO INCOMPLETO NÃO ATRAVESSA — e a pendência tem nome", () => {
  it("sem volume declarado, a conta não fecha e o pedido NÃO nasce", async () => {
    // O cliente disse que quer social media e não disse quantos posts. É
    // exatamente o caso CityJobs: `computeEstimate` se recusa a somar.
    estado.eventos.push(rastro({ escopo: { ...ESCOPO_COMPLETO, social: { platforms: ["Instagram"] } } }));

    const r = await promoverConversasParadas(AGORA);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (b) Faça escopo incompleto passar: apague o `if (!veredicto.pode)` ou o
    // teste de `travadaPor` na régua. Nasce orçamento errado com cara de certo.
    expect(estado.pedidos).toHaveLength(0);
    expect(r.promovidos).toHaveLength(0);
    // Pendência NOMEADA, nunca um "não" mudo.
    expect(r.pendencias.join(" ")).toMatch(/volume/i);
    expect(r.pendencias.join(" ")).toContain(FIO);
  });

  it("sem o nome do negócio, a régua RECUSA em vez de preencher — a fronteira entre recuperar e inventar", async () => {
    const { businessName: _fora, ...semNegocio } = ESCOPO_COMPLETO;
    estado.eventos.push(rastro({ escopo: semNegocio }));

    const r = await promoverConversasParadas(AGORA);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (f) Troque a recusa por um padrão — `businessName: escopo.businessName ??
    // "Cliente"` na régua ou no promotor. O pedido nasce, o orçamento sai, e a
    // casa passa a testar a si mesma contra um cliente que não existe.
    expect(estado.pedidos).toHaveLength(0);
    expect(r.pendencias.join(" ")).toMatch(/nome do negócio/i);
    // E a régua pura diz o mesmo, sozinha: nenhum campo do cliente tem padrão.
    const v = conversaJaDaParaOrcar(semNegocio);
    expect(v.pode).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. SEM PARCERIA VIVA NÃO ATRAVESSA — fail-closed", () => {
  it("conversa sem cliente derivado do convite não vira pedido", async () => {
    estado.eventos.push(rastro({ clienteDoConvite: null }));
    const r = await promoverConversasParadas(AGORA);
    // ── (c) A MUTAÇÃO: promova sem conferir a parceria. Qualquer visitante
    // anônimo da sala pública passaria a gerar pedido isento sozinho.
    expect(estado.pedidos).toHaveLength(0);
    expect(r.semParceria).toBe(1);
  });

  it("parceria REVOGADA não promove — e parceria VENCIDA também não", async () => {
    estado.eventos.push(rastro());
    estado.parceria = { ...PARCERIA_VIVA, revogadaEm: new Date("2026-08-20T00:00:00Z") };
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);

    estado.parceria = { ...PARCERIA_VIVA, validaAte: new Date("2026-08-01T00:00:00Z") };
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
    expect(estado.pedidos).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. DUAS BATIDAS DO RELÓGIO, UM PEDIDO SÓ — e quem garante é o índice", () => {
  it("a segunda batida morre no índice único do banco, não num `if`", async () => {
    estado.eventos.push(rastro());
    const primeira = await promoverConversasParadas(AGORA);
    expect(primeira.promovidos).toHaveLength(1);

    // A batida seguinte encontra o rastro DE NOVO — simula a corrida real em
    // que a resolução do rastro não aconteceu (falha de banco, ou duas rodadas
    // cruzadas). É aqui que o pedido dobraria.
    estado.eventos.push(rastro());
    const segunda = await promoverConversasParadas(new Date(AGORA.getTime() + 5 * 60_000));

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (d) Tire a idempotência: remova `fioDaConversa` do `create` (ou o
    // `@unique` da coluna). O banco falso para de recusar, e este número vira
    // 2 — dois pedidos, dois orçamentos e dois e-mails para o mesmo cliente.
    expect(estado.pedidos).toHaveLength(1);
    expect(segunda.promovidos).toHaveLength(0);
    expect(segunda.jaPromovidas).toBe(1);
    // E a colisão NÃO é falha de rodada: é a trava funcionando.
    expect(segunda.falhas).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. QUEM CHAMA ISTO? — a pergunta que este conserto existe para responder", () => {
  it("o despertador chama a promoção, e chama ANTES da entrega do orçamento", async () => {
    const fonte = await readFile(
      new URL("../../lib/agency/despertador.ts", import.meta.url), "utf8",
    );
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (a, a outra metade) Tire a perna do relógio. A promoção continuaria
    // existindo, testada e correta — e NINGUÉM a chamaria: seria a MESMA falha
    // que ela veio consertar, a trava construída sem a fechadura.
    expect(fonte).toContain("promoverConversasParadas");
    const promocao = fonte.indexOf("promoverConversasParadas");
    const entrega = fonte.indexOf("entregarOrcamentosPendentes()");
    expect(promocao).toBeGreaterThan(0);
    // A ordem É a entrega: o pedido que nasce entra em `new` e a perna seguinte
    // da MESMA batida lê a fila. Invertido, o cliente espera mais 5 minutos.
    expect(promocao).toBeLessThan(entrega);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. LEITURA DE BANCO FALHANDO NÃO VIRA 'PODE IR'", () => {
  it("rastros ilegíveis: não promove nada e a rodada DIZ o motivo", async () => {
    estado.eventos.push(rastro());
    estado.quebrarLeituraDeRastro = true;

    const r = await promoverConversasParadas(AGORA);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (e) Troque o `catch` por um `return { ...vazio }` silencioso, ou faça a
    // leitura falha cair no caminho de promoção. "Não sei" viraria "pode ir",
    // e um banco fora do ar viraria rodada limpa — o silêncio de novo.
    expect(estado.pedidos).toHaveLength(0);
    expect(r.falhas.join(" ")).toMatch(/rastros não lidos/);
  });
});
