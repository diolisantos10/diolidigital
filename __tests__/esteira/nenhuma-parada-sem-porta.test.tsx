// NENHUMA PARADA SEM PORTA — os dois becos que sobraram, e são da mesma família.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA QUE ESTE ARQUIVO DEFENDE
// ═══════════════════════════════════════════════════════════════════════════
//
// *Toda vez que a casa para e o CLIENTE é o único que pode destravar, tem que
// existir onde ele responde — com motivo, dono e próxima ação.* Toda proibição
// precisa da instrução gêmea.
//
// Os dois becos medidos em produção em 26/08/2026, com cliente oculto:
//
//   🔴 A. **Pedido de cliente sem projeto aberto.** Parava em `precisa_decisao`
//      com "a equipe precisa abrir o projeto" — e NENHUMA porta. Um cliente
//      novo que só sabe usar o portal ficava preso na primeira tentativa dele.
//      Foi um dos empurrões manuais da rodada.
//
//   🔴 B. **Pedido avulso de 1 peça batia no contrato de saída AO SER
//      AJUSTADO.** O contrato do especialista de criativo é `3 a 8` — régua de
//      LOTE, escrita para o pacote do mês, nunca revista para o avulso. A
//      produção inicial já tinha sido consertada em 25/08; a REFAÇÃO não. Três
//      tentativas de produzir peça nova barradas, e por isso o arquivo do
//      ajuste não pôde ser provado em produção.
//
// ⚠️ O CONTRATO NÃO FOI AFROUXADO PARA DESTRAVAR. `3..8` virou `n === n` — o
// número exato que o cliente pagou. É mais ESTRITO, não menos. O que se
// corrigiu foi ele CONHECER O TAMANHO DO PEDIDO.
//
// ── A RÉGUA DESTE ARQUIVO ─────────────────────────────────────────────────
// Provado por mutação. As mutações conferidas estão nomeadas em cada bloco.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { escadaToda } from "../_escada";

interface Registro { [k: string]: unknown }
const pedidos = new Map<string, Registro>();

function casa(reg: Registro, where: Registro): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR") {
      if (!(v as Registro[]).some((o) => casa(reg, o))) return false;
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      const cond = v as Record<string, unknown>;
      if ("lt" in cond) {
        const atual = reg[k];
        if (!(atual instanceof Date) || atual >= (cond.lt as Date)) return false;
        continue;
      }
    }
    if (reg[k] !== v) return false;
  }
  return true;
}

const db = {
  contentRequest: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(pedidos.get(where.id) ?? null)),
    findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => {
      const r = pedidos.get(where.id);
      if (!r) throw new Error("não encontrado");
      return Promise.resolve(r);
    }),
    findFirst: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Registro }) => {
      const r = pedidos.get(where.id)!;
      Object.assign(r, data, { updatedAt: new Date() });
      return Promise.resolve(r);
    }),
    updateMany: vi.fn(({ where, data }: { where: Registro; data: Registro }) => {
      const r = pedidos.get(where.id as string);
      if (!r || !casa(r, where)) return Promise.resolve({ count: 0 });
      Object.assign(r, data, { updatedAt: new Date() });
      return Promise.resolve({ count: 1 });
    }),
  },
  client: {
    findUnique: vi.fn(() => Promise.resolve({
      id: "cli-novo", name: "Cantina da Prova", workspaceId: "ws-1", industry: "Alimentação",
      email: "contato@cantina.invalid", phone: null, brandBrain: null,
    })),
  },
  // ⚠️ O CLIENTE NOVO: nenhum projeto. É o cenário do beco A, letra por letra.
  project: {
    findFirst: vi.fn<() => Promise<{ id: string; name: string } | null>>(() => Promise.resolve(null)),
    findUnique: vi.fn(() => Promise.resolve({ clientRequestId: null })),
    create: vi.fn((_a: { data: Registro }) => Promise.resolve({ id: "prj-novo", name: "Pedidos de Cantina da Prova" })),
  },
  cycle: { findFirst: vi.fn(() => Promise.resolve(null)) },
  clientRequestDb: { findUnique: vi.fn(() => Promise.resolve(null)) },
  task: { create: vi.fn(() => Promise.resolve({ id: "task-1" })) },
  timelineEvent: { create: vi.fn(() => Promise.resolve({})) },
  portalMessage: { create: vi.fn(() => Promise.resolve({})) },
  brainArtifact: {
    findFirst: vi.fn(() => Promise.resolve(null)),
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({})),
  },
  departmentLadder: {
    findMany: vi.fn(() => Promise.resolve(escadaToda("wide"))),
    findUnique: vi.fn(() => Promise.resolve({ degrau: "wide" })),
    create: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
  },
  departmentLadderRecord: { create: vi.fn(() => Promise.resolve({})), findMany: vi.fn(() => Promise.resolve([])) },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const generate = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/ai/generate", () => ({ generate: (...a: unknown[]) => generate(...a) }));

vi.mock("@/app/api/messages/conversa", () => ({
  conversaDoCliente: () => Promise.resolve({ ancora: { clientId: "cli-novo", clientRequestId: null } }),
}));

const { triarPedido } = await import("@/lib/agency/esteira/triagem");
const { lerPergunta } = await import("@/lib/agency/esteira/porta-da-pergunta");
const { contratoDoPedido } = await import("@/lib/agency/esteira/contrato-do-pedido");
const { conferirContrato, TODOS_OS_ESPECIALISTAS } = await import("@/lib/agency/execution/especialistas");
const { RespostaAoPedido } = await import("@/components/portal/SolicitarAlgo");

/** A classificação que o modelo devolve: um post de feed, com confiança alta. */
const CLASSIFICOU_FEED = {
  ok: true,
  data: JSON.stringify({ atendimentoId: "post-feed", confianca: 95, motivo: "ele pediu uma arte para o feed" }),
};

function novoPedido(over: Registro = {}) {
  pedidos.clear();
  const p: Registro = {
    id: "pc-1",
    clientId: "cli-novo",
    clientRequestId: null,
    projectId: null,
    title: "Uma arte para o feed",
    description: "Quero uma arte pronta para o feed do Instagram anunciando o prato do dia.",
    objective: "Vender mais no almoço",
    desiredFor: null,
    attachmentsJson: "[]",
    status: "novo",
    scopeDecision: null,
    quotedPrice: null, quoteNote: null, quoteStatus: null, produtoId: null,
    taskId: null, promisedFor: null, deliverableId: null, productionAttempts: 0,
    triagedBy: null, triagedAt: null, declineReason: null,
    pendingQuestionJson: null, confirmedQuantity: null, confirmedDeliverable: null,
    createdAt: new Date("2026-08-26T12:00:00Z"),
    updatedAt: new Date("2026-08-26T12:00:00Z"),
    ...over,
  };
  pedidos.set(p.id as string, p);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findFirst.mockResolvedValue(null);
  db.project.create.mockResolvedValue({ id: "prj-novo", name: "Pedidos de Cantina da Prova" });
  db.cycle.findFirst.mockResolvedValue(null);
  generate.mockResolvedValue(CLASSIFICOU_FEED);
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 A · O CLIENTE NOVO NÃO FICA PRESO NA PRIMEIRA TENTATIVA DELE
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTAÇÃO CONFERIDA: devolver `null` em vez de criar o contêiner (o
// comportamento até 26/08) faz os dois primeiros `it` quebrarem na hora.

describe("pedido de cliente sem projeto aberto", () => {
  it("a casa abre o espaço de execução e o pedido ANDA — não para pedindo gente", async () => {
    const pedido = novoPedido();
    const r = await triarPedido(pedido.id as string);

    expect(r.ok, `parou com: ${JSON.stringify(r)}`).toBe(true);
    expect(pedido.status).toBe("triado");
    // A frase do beco não aparece em lugar nenhum.
    expect(String(pedido.declineReason ?? "")).not.toContain("precisa abrir o projeto");
    expect(db.project.create).toHaveBeenCalledOnce();
  });

  it("o contêiner nasce SEM aval: é `briefing`, e por isso o pedido cai no caminho PAGO", async () => {
    const pedido = novoPedido();
    await triarPedido(pedido.id as string);

    const criado = db.project.create.mock.calls[0]![0].data as Registro;
    expect(criado.stage, "projeto novo com direção aprovada produziria sem o cliente aceitar").toBe("briefing");
    expect(criado.directionApprovedAt).toBeUndefined();
    expect(criado.clientId).toBe("cli-novo");
    expect(criado.workspaceId).toBe("ws-1");

    // Sem ciclo aberto, o escopo é EXTRA — o caminho que exige orçamento aceito
    // antes de qualquer produção. Abrir o contêiner é o CONTRÁRIO de afrouxar.
    expect(pedido.scopeDecision).toBe("extra");
    expect(pedido.quoteStatus).toBe("pendente");
    expect(typeof pedido.quotedPrice).toBe("number");
  });

  it("se a escrita do contêiner falhar, a parada CONTINUA — mas agora com porta", async () => {
    // MUTAÇÃO CONFERIDA: remover o objeto de porta do `parar()` faz este `it`
    // quebrar. Parada sem porta é exatamente o beco que este arquivo fecha.
    db.project.create.mockRejectedValue(new Error("banco indisponível"));
    const pedido = novoPedido();
    const r = await triarPedido(pedido.id as string);

    expect(r.ok).toBe(false);
    expect(pedido.status).toBe("precisa_decisao");

    const porta = lerPergunta(pedido.pendingQuestionJson as string | null);
    expect(porta, "parada sem porta é beco").not.toBeNull();
    expect(porta!.opcoes.length).toBeGreaterThan(0);
    // Motivo, DONO e PRÓXIMA AÇÃO — as três coisas, escritas.
    expect(String(pedido.declineReason)).not.toHaveLength(0);
    for (const o of porta!.opcoes) {
      expect(o.escalar, `a opção "${o.id}" não diz o que acontece`).toBe(true);
      expect(o.dono?.trim(), `a opção "${o.id}" não tem dono`).toBeTruthy();
      expect(o.proximaAcao?.trim(), `a opção "${o.id}" não tem próxima ação`).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 B · O CONTRATO DE SAÍDA CONHECE O TAMANHO DO PEDIDO
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTAÇÃO CONFERIDA: fazer `contratoDoPedido` devolver sempre o contrato do
// especialista (o comportamento da refação até 26/08) quebra o primeiro `it`.

describe("contrato de saída × tamanho do pedido", () => {
  const criativo = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "design-criativo-social")!;
  const UMA_PECA = { items: [{ headline: "Prato do dia", direction: "close-up do prato na bancada, luz da janela", note: "Hoje tem." }] };

  it("pedido de UMA peça entrega uma e PASSA — a régua de lote é que estava errada", () => {
    // A régua de LOTE reprovava, e é este o beco medido em produção.
    expect(conferirContrato(criativo, UMA_PECA).cumpriu,
      "sem o conserto, o contrato de 3 a 8 barra o pedido avulso").toBe(false);

    // A régua do PEDIDO aprova, porque o cliente comprou uma.
    const doPedido = contratoDoPedido(criativo, "instagram_post_feed_v1");
    expect(conferirContrato(doPedido, UMA_PECA).cumpriu).toBe(true);
  });

  it("e ela é MAIS estrita, não menos: 4 peças num pedido de 1 é reprovado", () => {
    const quatro = { items: [1, 2, 3, 4].map((n) => ({ headline: `Peça ${n}`, direction: "x", note: "y" })) };
    // O contrato do especialista ACEITARIA (4 cabe em 3..8). O do pedido não.
    expect(conferirContrato(criativo, quatro).cumpriu).toBe(true);
    expect(conferirContrato(contratoDoPedido(criativo, "instagram_post_feed_v1"), quatro).cumpriu,
      "entregar a mais é imagem paga que ninguém comprou").toBe(false);
  });

  it("pedido de PACOTE continua exigindo o pacote inteiro", () => {
    const doPacote = contratoDoPedido(criativo, "instagram_story_estatico_v1"); // 4 peças
    expect(conferirContrato(doPacote, UMA_PECA).cumpriu,
      "entregar 1 quando ele comprou 4 é erro de dinheiro").toBe(false);
    const quatro = { items: [1, 2, 3, 4].map((n) => ({ headline: `Peça ${n}`, direction: "x", note: "y" })) };
    expect(conferirContrato(doPacote, quatro).cumpriu).toBe(true);
  });

  it("pedido SEM produto canônico cai no contrato do especialista, byte por byte", () => {
    // Ausência de produto é ausência de informação — não vira 1 nem vira pacote.
    const semProduto = contratoDoPedido(criativo, null);
    expect(conferirContrato(semProduto, UMA_PECA)).toEqual(conferirContrato(criativo, UMA_PECA));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A METADE QUE FALTAVA NAS OUTRAS RODADAS: O PIXEL
// ═══════════════════════════════════════════════════════════════════════════
//
// *Coluna gravada não é cliente informado.* Nesta operação, TRÊS vezes um aviso
// ficou numa coluna e nunca virou pixel. Por isso a prova aqui atravessa o
// caminho inteiro — triagem → `pendingQuestionJson` → a MESMA leitura que a
// rota `/api/portal/pedidos` faz → o HTML que o navegador do cliente recebe.
//
// MUTAÇÃO CONFERIDA: tirar o objeto de porta do `parar()` da parada sem
// contêiner apaga os botões do HTML e quebra este bloco.

/** A forma exata que `/api/portal/pedidos` monta a partir da coluna. */
function comoARotaEntrega(json: string | null) {
  const q = lerPergunta(json);
  if (!q) return null;
  return { texto: q.pergunta, aceitaNumero: q.aceitaNumero === true, opcoes: q.opcoes.map((o) => ({ id: o.id, rotulo: o.rotulo })) };
}

describe("a porta chega ao HTML que o cliente recebe", () => {
  it("a parada sem contêiner vira PERGUNTA E BOTÕES na tela — não um selo amarelo mudo", async () => {
    db.project.create.mockRejectedValue(new Error("banco indisponível"));
    const pedido = novoPedido();
    await triarPedido(pedido.id as string);

    const pergunta = comoARotaEntrega(pedido.pendingQuestionJson as string | null);
    expect(pergunta, "a coluna não chegou à rota").not.toBeNull();

    const html = renderToStaticMarkup(
      <RespostaAoPedido
        pedido={{
          id: "pc-1", titulo: String(pedido.title), status: "precisa_decisao",
          motivo: String(pedido.declineReason ?? ""), pergunta: pergunta!,
        } as never}
        aoResponder={async () => ({ ok: true })}
      />,
    );

    expect(html).toContain(pergunta!.texto);
    for (const o of pergunta!.opcoes) {
      expect(html, `a opção "${o.rotulo}" não virou botão`).toContain(o.rotulo);
    }
    // Botão de verdade, clicável — não texto com cara de botão.
    expect((html.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(pergunta!.opcoes.length);
  });

  it("a parada do ENTREGÁVEL também tem botões, e um deles resolve sozinho", async () => {
    // O pedido em que a leitura léxica vê INSUMO e a classificação escolheu PEÇA:
    // são dois trabalhos e dois preços, e a casa se recusa a escolher por ele.
    const pedido = novoPedido({
      description: "Quero os roteiros para eu gravar e também as artes prontas do feed.",
    });
    await triarPedido(pedido.id as string);
    expect(pedido.status).toBe("precisa_decisao");

    const pergunta = comoARotaEntrega(pedido.pendingQuestionJson as string | null);
    expect(pergunta, "a parada do entregável continuava sem porta").not.toBeNull();

    const html = renderToStaticMarkup(
      <RespostaAoPedido
        pedido={{ id: "pc-1", titulo: "x", status: "precisa_decisao", motivo: "", pergunta: pergunta! } as never}
        aoResponder={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("Quero a PEÇA pronta (arte finalizada)");
    expect(html).toContain("Quero só o TEXTO (roteiro/copy)");

    // E a opção que resolve sozinha GRAVA o entregável — sem isso, a releitura
    // do texto original daria exatamente a mesma parada, para sempre.
    const bruta = lerPergunta(pedido.pendingQuestionJson as string | null)!;
    expect(bruta.opcoes.find((o) => o.id === "peca")?.entregavel).toBe("peca");
  });
});
