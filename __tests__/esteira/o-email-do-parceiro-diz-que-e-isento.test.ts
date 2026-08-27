// O E-MAIL QUE SAI DE VERDADE — a outra metade do "quem chama isto?".
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO EXISTE, SEPARADO DO TESTE DA TELA
// ═══════════════════════════════════════════════════════════════════════════
//
// `orcamentoProntoEmail({ isentoPorParceria: true })` é fácil de provar em
// isolamento — e provar só isso seria repetir o defeito que este conserto veio
// consertar. A pergunta desta casa não é "a função sabe?", é **"quem CHAMA
// isto?"**: um parâmetro novo que nenhum caminho de produção preenche é a
// décima trava sem fechadura, com a suíte verde por cima.
//
// Então aqui o caminho é a RODADA DE VERDADE: a linha de parceria no banco →
// `entregarOrcamentosPendentes()` (o que o despertador chama, de 5 em 5
// minutos) → o `sendEmail` interceptado → **o HTML que chega na caixa de
// entrada do cliente**.
//
// A mesma rodada prova, de graça, a mensagem do PORTAL: é o texto que fica na
// conversa do cliente para sempre, e um parceiro relendo aquilo daqui a um mês
// não pode reencontrar um preço sem a frase que diz que ele não paga.

import { describe, it, expect, beforeEach, vi } from "vitest";

const AGORA = new Date("2026-08-27T12:00:00.000Z");
const DAQUI_A_UM_ANO = new Date("2027-08-27T00:00:00.000Z");
const VENCEU_ONTEM = new Date("2026-08-26T00:00:00.000Z");

const estado = vi.hoisted(() => ({
  parceria: null as null | Record<string, unknown>,
  /** O que o pedido virou, e o que foi escrito na conversa do portal. */
  mensagemDoPortal: "" as string,
}));

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findMany: vi.fn(async () => [
      {
        id: "pedido-1",
        clientId: "cliente-parceiro",
        workspaceId: null,
        businessName: "Foocci",
        status: "new",
        createdAt: new Date("2026-08-27T10:00:00.000Z"),
        sdrHandoffJson: null,
        briefingJson: JSON.stringify({
          contato: { nome: "Contato da Foocci", email: "contato@foocci.test" },
          estimate: { totalMin: 790, totalMax: 790, items: [{ label: "8 posts/mês" }] },
        }),
      },
    ]),
    update: vi.fn(async () => ({})),
  },
  parceriaDoCliente: {
    findUnique: vi.fn(async () => estado.parceria),
  },
  isencaoDeParceria: {
    findUnique: vi.fn(async () => ({ id: "isencao-1" })),
    create: vi.fn(async () => ({})),
  },
  portalAccess: {
    findMany: vi.fn(async () => [{ token: "tok-vivo", expiresAt: null }]),
    create: vi.fn(async () => ({ token: "tok-vivo" })),
  },
  portalMessage: {
    // O `$transaction` abaixo recebe o que estas fábricas devolvem; guardar o
    // corpo aqui é o que deixa a rodada provar também o texto do portal.
    create: vi.fn((args: { data: { body: string } }) => {
      estado.mensagemDoPortal = args.data.body;
      return args;
    }),
  },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  $executeRawUnsafe: vi.fn(async () => 1),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// O e-mail é INTERCEPTADO, nunca enviado: o que interessa é o HTML que sairia.
const correio = vi.hoisted(() => ({ enviados: [] as { subject: string; html: string }[] }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async (m: { subject: string; html: string }) => {
    correio.enviados.push(m);
    return { ok: true };
  }),
}));

vi.mock("@/lib/agency/esteira/aviso-de-agendamento-manual", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  avisoDeAgendamentoManual: vi.fn(async () => null),
}));

const { entregarOrcamentosPendentes } = await import("@/lib/agency/esteira/orcamento-do-briefing");
const { NADA_SERA_COBRADO } = await import("@/lib/agency/comercial/aviso-de-isencao");

function parceriaNoBanco(over: Record<string, unknown> = {}) {
  return {
    clientId: "cliente-parceiro",
    autorizadaPor: "Dioli (CEO)",
    validaAte: DAQUI_A_UM_ANO,
    escopo: "8 posts por mês para a Foocci",
    pecasContratadas: 8,
    tetoDeIaCentavosUsd: 2000,
    revogadaEm: null,
    ...over,
  };
}

/** Roda a rodada do despertador e devolve o e-mail que saiu. */
async function rodada() {
  correio.enviados = [];
  estado.mensagemDoPortal = "";
  const r = await entregarOrcamentosPendentes();
  expect(r.entregues, "a rodada não entregou o orçamento — o teste não chegou a medir nada").toBe(1);
  expect(correio.enviados.length, "nenhum e-mail saiu na rodada").toBe(1);
  return correio.enviados[0]!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  estado.parceria = null;
});

describe("a rodada do despertador, com um PARCEIRO na fila", () => {
  it("MATA A MUTAÇÃO: o e-mail volta a ser o do pagante — quem CHAMA `isentoPorParceria`", async () => {
    estado.parceria = parceriaNoBanco();
    const email = await rodada();

    // Se alguém apagar o argumento em `avisarPorEmail`, o parâmetro do template
    // continua existindo, o teste unitário dele continua verde — e ESTE fica
    // vermelho. É a junta entre quem sabe e quem manda.
    expect(email.html, "o e-mail do parceiro não diz que ele é isento").toContain(
      "100% isento por parceria",
    );
    expect(email.html).toContain("Nada será cobrado");
  });

  it("⛔ e MESMO ASSIM não estampa valor: a ordem do CEO de 27/08 continua de pé", async () => {
    estado.parceria = parceriaNoBanco();
    const email = await rodada();
    const texto = email.html.replace(/<[^>]*>/g, " ");
    expect(texto, "apareceu 'R$' no e-mail").not.toMatch(/R\$/);
    expect(texto, "apareceu valor com centavos no e-mail").not.toMatch(/\d[\d.]*,\d{2}\b/);
    expect(texto, "o valor da proposta vazou para o e-mail").not.toContain("790");
    expect(email.subject).not.toMatch(/R\$|\d/);
  });

  it("a MENSAGEM DO PORTAL — a que fica para sempre — também diz que nada será cobrado", async () => {
    estado.parceria = parceriaNoBanco();
    await rodada();
    expect(estado.mensagemDoPortal).toContain(NADA_SERA_COBRADO);
    // E o valor continua lá, como referência do tamanho do trabalho.
    expect(estado.mensagemDoPortal).toContain("790");
  });
});

describe("as travas da rodada", () => {
  it("MATA A MUTAÇÃO: parceria VENCIDA passa a isentar no e-mail", async () => {
    estado.parceria = parceriaNoBanco({ validaAte: VENCEU_ONTEM });
    const email = await rodada();
    expect(email.html, "parceria vencida prometeu isenção por e-mail").not.toContain("isento por parceria");
    expect(estado.mensagemDoPortal).not.toContain(NADA_SERA_COBRADO);
    expect(estado.mensagemDoPortal).toContain("790");
  });

  it("o cliente PAGANTE recebe exatamente o e-mail de antes", async () => {
    estado.parceria = null;
    const email = await rodada();
    expect(email.html).not.toContain("isento por parceria");
    expect(email.html).toContain("está pronto");
    expect(estado.mensagemDoPortal).not.toContain(NADA_SERA_COBRADO);
    expect(estado.mensagemDoPortal).toContain("790");
  });
});
