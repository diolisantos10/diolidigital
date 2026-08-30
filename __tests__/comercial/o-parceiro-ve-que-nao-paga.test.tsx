// O PARCEIRO VÊ QUE NÃO PAGA — a fechadura da nona trava sem fechadura.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO ANTES DE QUALQUER LINHA DE CONSERTO (27/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
//   grep -rn "parceria" app/proposta/                                → ZERO
//   grep -rn "parceria" lib/email/templates.ts                       → ZERO
//   grep -rn "parceria" lib/agency/esteira/orcamento-do-briefing.ts  → ZERO
//
// A casa tinha o mecanismo INTEIRO do lado de dentro — `ParceriaDoCliente`, a
// `IsencaoDeParceria` derivada por pedido, e o portão devolvendo
// `parceria_isenta` e liberando a esteira sem um centavo. E o parceiro recebia
// "seu orçamento está pronto", abria a página, e via PREÇO e um botão de
// aceitar como qualquer pagante. A trava existia; **nada que o cliente vê a
// chamava**.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA DE FORMA DESTE ARQUIVO: NADA DE JSON ESCRITO À MÃO
// ═══════════════════════════════════════════════════════════════════════════
//
// A pergunta obrigatória desta casa é *o teste alcança o código que responde ao
// cliente?* — e régua verde sobre o componente errado é pior que régua nenhuma.
// Por isso o caminho aqui é a CORRENTE inteira:
//
//   linha de parceria no banco → GET /api/portal/briefing/proposta (a rota de
//   produção) → o JSON que ela devolve → `CorpoDaProposta` renderizada → o HTML
//   que o cliente de verdade lê.
//
// Nenhum teste monta o payload à mão. Se alguém tirar a leitura da parceria da
// rota, ou o bloco da tela, ou afrouxar a validade, é aqui que fica vermelho.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

const AGORA = new Date("2026-08-27T12:00:00.000Z");
const DAQUI_A_UM_ANO = new Date("2027-08-27T00:00:00.000Z");
const VENCEU_ONTEM = new Date("2026-08-26T00:00:00.000Z");

// ── O BANCO DE MENTIRA ─────────────────────────────────────────────────────
// Guarda o que recebe e devolve o que guardou: um mock de constante nunca
// pegaria a diferença entre parceria viva e vencida, que é metade do que este
// arquivo prova.
const estado = vi.hoisted(() => ({
  parceria: null as null | Record<string, unknown>,
  /** A leitura da parceria estoura? (banco fora do ar) */
  bancoCaido: false,
}));

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findUnique: vi.fn(async () => ({
      id: "pedido-1",
      clientId: "cliente-parceiro",
      businessName: "Foocci",
      status: "proposal_pending",
      briefingJson: JSON.stringify({
        estimate: { totalMin: 790, totalMax: 790, items: [{ label: "8 posts/mês" }] },
      }),
    })),
    findFirst: vi.fn(async () => null),
  },
  parceriaDoCliente: {
    findUnique: vi.fn(async () => {
      if (estado.bancoCaido) throw new Error("connection refused");
      return estado.parceria;
    }),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess: vi.fn(async () => ({
    valid: true,
    record: { clientRequestId: "pedido-1", clientId: "cliente-parceiro" },
  })),
}));

vi.mock("@/lib/agency/esteira/aviso-de-agendamento-manual", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  avisoDeAgendamentoManual: vi.fn(async () => null),
}));

const { GET } = await import("@/app/api/portal/briefing/proposta/route");
const { CorpoDaProposta } = await import("@/app/proposta/[token]/page");
const { NADA_SERA_COBRADO, TITULO_DA_ISENCAO, LINHA_DE_ISENCAO_NO_EMAIL } = await import(
  "@/lib/agency/comercial/aviso-de-isencao"
);
const { orcamentoProntoEmail } = await import("@/lib/email/templates");
const { contextoDaNegociacao } = await import("@/lib/agency/comercial/negociacao-da-proposta");
const { servicoPorChave } = await import("@/lib/agency/financeiro/tabela-de-precos");

/** A linha de parceria como a casa a grava (`autorizarParceriaDoCliente`). */
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

/** O JSON QUE A ROTA DE PRODUÇÃO DEVOLVE. Nada montado à mão. */
async function dadosDaRota() {
  const res = await GET(new NextRequest("https://x.test/api/portal/briefing/proposta?token=tok-1"));
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

/** O HTML QUE O CLIENTE LÊ, alimentado pelo JSON da rota. */
async function telaDoCliente() {
  const dados = await dadosDaRota();
  return renderToStaticMarkup(
    <CorpoDaProposta
      dados={dados as never}
      token="tok-1"
      enviando={null}
      resposta={null}
      erro={null}
      onDecidir={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  estado.parceria = null;
  estado.bancoCaido = false;
});

describe("o parceiro abre a proposta e a casa diz que ele não paga", () => {
  it("MATA A MUTAÇÃO (a): o aviso de isenção some da tela", async () => {
    estado.parceria = parceriaNoBanco();
    const html = await telaDoCliente();

    // Apagar o bloco da tela, ou parar de mandar `isencaoDeParceria` na rota,
    // derruba estas três — que são exatamente o que o cliente precisava ler.
    expect(html, "o título da isenção sumiu da página que o parceiro abre").toContain(TITULO_DA_ISENCAO);
    expect(html, "a página não diz com todas as letras que nada será cobrado").toContain(NADA_SERA_COBRADO);
    expect(html, "a página não diz até quando a parceria vale").toContain("2027");

    // ⚠️ E O BLOCO DESTACADO, EM SI. Sem esta linha a régua era CEGA à mutação
    // que importa: as mesmas frases também viajam dentro do corpo do orçamento
    // (`textoDoOrcamento`), então apagar o bloco da tela deixava o teste VERDE
    // — medido, rodando a mutação (a) contra a primeira versão deste arquivo.
    // Régua verde sobre o componente errado é pior que régua nenhuma.
    //
    // O bloco é o que o CEO pediu: o aviso ANTES do número, destacado, e não
    // uma linha no meio de um texto longo que o cliente lê de banda.
    expect(html, "o bloco destacado da isenção sumiu — sobrou só a linha no meio do texto").toContain(
      'aria-label="Isenção por parceria"',
    );
    // E ele vem ANTES do valor: quem lê o número primeiro já leu uma cobrança.
    expect(html.indexOf('aria-label="Isenção por parceria"')).toBeLessThan(html.indexOf("790"));
  });

  it("diz o escopo autorizado — parceria sem escopo à vista cobre tudo na cabeça de quem lê", async () => {
    estado.parceria = parceriaNoBanco();
    const html = await telaDoCliente();
    expect(html).toContain("8 posts por mês para a Foocci");
  });

  it("MATA A MUTAÇÃO: o botão volta a convidar a pagar", async () => {
    estado.parceria = parceriaNoBanco();
    const html = await telaDoCliente();
    // Ele aceita o ESCOPO, não a cobrança.
    expect(html, "o botão do parceiro não pode ser o botão de compra do pagante").toContain(
      "Aceitar o escopo e começar",
    );
  });

  it("o SDR desta página deixa de perguntar do valor e passa a falar de escopo", async () => {
    estado.parceria = parceriaNoBanco();
    const html = await telaDoCliente();
    expect(html, "a casa ainda convida a negociar preço com quem não paga").not.toContain(
      "Ficou com dúvida no valor?",
    );
    expect(html).toContain("Quer ajustar o escopo?");
    // E a conversa continua existindo: o conserto não pode ter matado o SDR.
    expect(html).toContain('id="fala-da-proposta"');
  });

  it("o VALOR continua à vista, como referência — some o preço, some a medida do investimento", async () => {
    estado.parceria = parceriaNoBanco();
    const html = await telaDoCliente();
    expect(html).toContain("790");
    expect(html).toContain("referência");
  });
});

describe("as travas que não podem afrouxar", () => {
  it("MATA A MUTAÇÃO (e): o cliente PAGANTE deixa de ver preço", async () => {
    estado.parceria = null; // ninguém autorizou parceria nenhuma
    const html = await telaDoCliente();

    expect(html, "o pagante perdeu o preço da tela").toContain("790");
    expect(html, "a casa prometeu isenção a quem não tem parceria").not.toContain(TITULO_DA_ISENCAO);
    expect(html, "a casa prometeu a um pagante que nada seria cobrado").not.toContain(NADA_SERA_COBRADO);
    expect(html, "o botão do pagante mudou sem motivo").toContain("Aceitar e começar");
    expect(html).toContain("Ficou com dúvida no valor?");
  });

  it("MATA A MUTAÇÃO (b): parceria VENCIDA passa a liberar", async () => {
    estado.parceria = parceriaNoBanco({ validaAte: VENCEU_ONTEM });
    const html = await telaDoCliente();

    // Vencida vale o MESMO que inexistente. A validade é conferida a cada
    // leitura — não uma vez, na autorização.
    expect(html, "uma parceria vencida voltou a prometer isenção").not.toContain(TITULO_DA_ISENCAO);
    expect(html, "uma parceria vencida voltou a dizer que nada será cobrado").not.toContain(NADA_SERA_COBRADO);
    expect(html, "o cliente de parceria vencida perdeu o preço").toContain("790");
  });

  it("parceria REVOGADA vale o mesmo que inexistente", async () => {
    estado.parceria = parceriaNoBanco({ revogadaEm: new Date("2026-08-20T00:00:00.000Z") });
    const html = await telaDoCliente();
    expect(html).not.toContain(NADA_SERA_COBRADO);
    expect(html).toContain("790");
  });

  it("MATA A MUTAÇÃO (c): falha de leitura vira 'isento'", async () => {
    estado.bancoCaido = true;
    const html = await telaDoCliente();

    // "Não sei" NUNCA vira "isento": banco fora do ar devolve o cliente
    // pagante de sempre, com preço na tela e o portão fechando lá atrás.
    expect(html, "banco fora do ar passou a prometer isenção").not.toContain(NADA_SERA_COBRADO);
    expect(html, "banco fora do ar derrubou a proposta do cliente").toContain("790");
  });

  it("a verdade vem do SERVIDOR: não há parâmetro de cliente a forjar na rota", async () => {
    estado.parceria = null;
    // O visitante grita que é parceiro por todos os campos que ele controla.
    const res = await GET(
      new NextRequest(
        "https://x.test/api/portal/briefing/proposta?token=tok-1&clientId=cliente-parceiro&parceria=1&isento=true",
      ),
    );
    const dados = (await res.json()) as Record<string, unknown>;
    expect(dados.isencaoDeParceria, "a query string conseguiu inventar uma parceria").toBeNull();
  });

  it("a conta interna NÃO sobe para a tela — teto de IA e peças são assunto da casa", async () => {
    estado.parceria = parceriaNoBanco();
    const dados = await dadosDaRota();
    expect(JSON.stringify(dados)).not.toContain("tetoDeIaCentavosUsd");
    expect(JSON.stringify(dados)).not.toContain("pecasContratadas");
  });
});

describe("o e-mail de orçamento pronto", () => {
  it("diz que saiu isento por parceria", () => {
    const { html } = orcamentoProntoEmail({ businessName: "Foocci", isentoPorParceria: true });
    expect(html).toContain("100% isento por parceria");
    expect(html).toContain("Nada será cobrado");
  });

  it("MATA A MUTAÇÃO (d): o valor vaza para o corpo do e-mail", () => {
    // ⛔ A ordem do CEO de 27/08 continua de pé: dizer "isento" NÃO é dizer
    // preço. Nem no corpo, nem no assunto, nem na prévia da caixa de entrada.
    const { html, subject } = orcamentoProntoEmail({
      businessName: "Foocci",
      isentoPorParceria: true,
      portalLink: "https://x.test/proposta/tok-1",
    });
    // Olha o TEXTO VISÍVEL, não a marcação: tamanho de fonte e cor de fundo
    // são cheios de números e não são preço nenhum. O que não pode aparecer é
    // dinheiro — em qualquer das formas em que dinheiro se escreve.
    const texto = html.replace(/<[^>]*>/g, " ");
    expect(texto, "apareceu 'R$' no corpo do e-mail").not.toMatch(/R\$/);
    expect(texto, "apareceu um valor com centavos no corpo do e-mail").not.toMatch(/\d[\d.]*,\d{2}\b/);
    expect(texto, "o valor da proposta vazou para o corpo do e-mail").not.toContain("790");
    expect(subject).not.toMatch(/R\$|\d/);
    // A frase é a MESMA de `aviso-de-isencao.ts` — uma fonte, não duas cópias.
    expect(html).toContain(LINHA_DE_ISENCAO_NO_EMAIL.slice(0, 60));
  });

  it("não fala de verba estourada com quem não paga — as duas frases se desmentem", () => {
    const { html } = orcamentoProntoEmail({
      businessName: "Foocci",
      isentoPorParceria: true,
      verbaEstourada: true,
    });
    expect(html).not.toContain("verba mais enxuta");
  });

  it("o e-mail do PAGANTE não mudou", () => {
    const { html } = orcamentoProntoEmail({ businessName: "Foocci", verbaEstourada: true });
    expect(html).not.toContain("isento por parceria");
    expect(html).toContain("verba mais enxuta");
  });
});

describe("o SDR não negocia preço com quem não paga", () => {
  const CONTEUDO = servicoPorChave("plano_conteudo")!;
  const base = {
    negocio: "Foocci",
    servico: CONTEUDO,
    textoDaProposta: "Recebemos seu briefing da Foocci.",
    avisoDeAgendamento: null,
  };

  it("sob parceria, o contexto proíbe preço e manda falar de escopo", () => {
    const ctx = contextoDaNegociacao({
      ...base,
      isento: {
        autorizadaPor: "Dioli (CEO)",
        validaAte: DAQUI_A_UM_ANO.toISOString(),
        escopo: "8 posts por mês para a Foocci",
      },
    });
    expect(ctx).toContain("NÃO PAGA NADA");
    expect(ctx).toContain("O ASSUNTO É O ESCOPO");
    // ⛔ O cardápio de degraus NÃO pode estar na janela do modelo: com ele à
    // vista, o SDR oferece um plano mais barato a quem não paga nada.
    expect(ctx, "o degrau de baixo continua sendo oferecido a um parceiro isento").not.toContain(
      "OFERECER O DEGRAU DE BAIXO",
    );
    expect(ctx).toContain("Dioli (CEO)");
  });

  it("sem parceria, o contexto do pagante é o de sempre", () => {
    const ctx = contextoDaNegociacao({ ...base, isento: null });
    expect(ctx).toContain("OFERECER O DEGRAU DE BAIXO");
    expect(ctx).toContain("VOCÊ NÃO PODE DAR DESCONTO");
    expect(ctx).not.toContain("NÃO PAGA NADA");
  });
});
