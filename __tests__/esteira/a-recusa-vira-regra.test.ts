// A RECUSA VIRA REGRA — e a pergunta nova vira formulário, se não tiver lastro.
//
// ── O problema de negócio (CEO, 24/08/2026) ─────────────────────────────────
//
//   "A gente corre risco de gastar dinheiro quando a primeira peça for
//    apresentada pro cliente, e ela já vai estar paga. Aí o cliente diz: preciso
//    de um ajuste. E a gente perde dinheiro."
//
// A produção só começa depois do pagamento. Logo, **toda refação é prejuízo da
// casa** — o preço já está fechado. Duas alavancas, as duas de código:
//
//   A. SONDAR o que evita retrabalho, ANTES da produção, onde ainda é barato.
//   B. A RECUSA virar REGRA da marca, para a próxima peça nascer sabendo.
//
// ── E o risco de cada uma, que é o que estes testes vigiam ──────────────────
//
//   • Em A, o risco é o FORMULÁRIO. Pergunta sem lastro é formulário mais
//     longo, e formulário longo o cliente abandona — e prospect que desiste
//     custa mais que peça retida. Por isso todo item do bloco de marca tem de
//     apontar para uma medição com arquivo e data.
//   • Em B, o risco é a MORDAÇA. Regra aprendida que vira proibição cega
//     engessa a marca e faz o produtor ser reprovado por obedecer. Por isso
//     toda proibição carrega a INSTRUÇÃO GÊMEA, e ajuste daquela peça nunca
//     vira regra permanente.

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── O banco, em memória. Mesmo formato do teste das proibições: o caminho de
//    gravação e leitura roda de verdade, só o armazenamento é fake.
interface Artefato { clientId: string; department: string; canvasJson: string; version: number }
let artefatos: Artefato[] = [];

const db = {
  brainArtifact: {
    findFirst: vi.fn(({ where }: { where: { clientId: string; department: string } }) => {
      const r = artefatos
        .filter((a) => a.clientId === where.clientId && a.department === where.department)
        .sort((a, b) => b.version - a.version)[0];
      return Promise.resolve(r ?? null);
    }),
    create: vi.fn(({ data }: { data: Artefato }) => { artefatos.push(data); return Promise.resolve(data); }),
  },
  brandBrain: { findUnique: vi.fn(() => Promise.resolve(null)) },
  clientRequestDb: { findFirst: vi.fn(() => Promise.resolve(null)) },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// O Drive não entra num teste de unidade — e o que ele devolve não é o assunto.
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({ materiaisDeMarca: vi.fn(async () => []) }));

const {
  registrarProibicoes, lerProibicoes,
  ehAjustePontual, substitutoDeclarado,
} = await import("@/lib/agency/esteira/proibicoes");
const { conferirPisoDeVerdade, instrucaoGemea } = await import("@/lib/agency/execution/piso-de-verdade");
const { contratoDeMarca } = await import("@/lib/agency/esteira/contrato-de-marca");
const { ctxBlock, ctxBlockParaJuiz } = await import("@/lib/agency/execution/especialistas");
const { CAUSAS, classificarCausa, causasDaPergunta } = await import("@/lib/agency/esteira/causas-de-refacao");
const { textoDoBlocoDeMarca, itensDoBlocoDeMarca, QIDS_OPCIONAIS, TODAS_AS_PERGUNTAS } =
  await import("@/lib/agency/question-engine");
const { PERGUNTA } = await import("@/lib/agency/esteira/campos-da-marca");

beforeEach(() => { artefatos = []; vi.clearAllMocks(); });

// ═══════════════════════════════════════════════════════════════════════════
// MISSÃO A — a pergunta só entra com LASTRO
// ═══════════════════════════════════════════════════════════════════════════

describe("nenhuma causa de refação entra sem medição, com arquivo e data", () => {
  it("toda causa carrega ao menos uma medição, e a medição tem fonte e data", () => {
    // Afirmação medida tem prazo de validade: sem fonte e data ninguém consegue
    // conferir depois se a causa ainda vale — e causa que não vale mais é
    // pergunta que devia ter saído do formulário.
    for (const c of CAUSAS) {
      expect(c.evidencia.length, `causa "${c.id}" sem nenhuma medição`).toBeGreaterThan(0);
      for (const m of c.evidencia) {
        expect(m.fonte.trim().length, `causa "${c.id}": medição sem arquivo de origem`).toBeGreaterThan(0);
        expect(m.data, `causa "${c.id}": medição sem data DD/MM/AAAA`).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(m.citacao.trim().length, `causa "${c.id}": medição sem as palavras do registro`).toBeGreaterThan(20);
      }
    }
  });

  it("o bloco de marca do briefing NÃO tem item sem lastro", () => {
    const itens = itensDoBlocoDeMarca();
    expect(itens.length, "o bloco de marca ficou vazio — nenhuma causa aponta para ele").toBeGreaterThan(0);
    for (const it of itens) {
      expect(it.causa.evidencia.length, `item "${it.campo}" entrou sem medição`).toBeGreaterThan(0);
      expect(it.causa.perguntaQueEvita).toBe("marca_basica");
    }
    // E o inverso: nenhuma causa aponta para o bloco sem ter campo da ficha.
    for (const c of causasDaPergunta("marca_basica")) {
      expect(c.campoDaMarca, `causa "${c.id}" manda perguntar sem dizer qual campo responde`).toBeTruthy();
    }
  });

  it("a redação de cada item é a da ficha de marca — não uma segunda redação", () => {
    // Uma pergunta escrita em dois lugares já está errada em um deles. O bloco
    // do briefing REUSA `PERGUNTA`, que é o que a ficha já usa com o dono.
    const texto = textoDoBlocoDeMarca();
    for (const it of itensDoBlocoDeMarca()) {
      expect(texto, `o item "${it.campo}" não usa a redação da ficha`).toContain(PERGUNTA[it.campo]);
    }
  });

  it("perguntar não pode travar o briefing — perder o lead custa mais que peça retida", () => {
    expect(QIDS_OPCIONAIS.has("marca_basica")).toBe(true);
    const ids = TODAS_AS_PERGUNTAS.map((q) => q.id);
    expect(ids).toContain("marca_basica");
    // E vem ANTES da verba, que é a última obrigatória: pergunta opcional feita
    // com o portão já aberto é fala de despedida, e ninguém responde.
    expect(ids.indexOf("marca_basica")).toBeLessThan(ids.indexOf("budget_range"));
  });

  it("falta de resposta não vira invenção: o bloco oferece a saída honesta", () => {
    expect(textoDoBlocoDeMarca()).toMatch(/n[ãa]o tenho/i);
    expect(textoDoBlocoDeMarca()).toMatch(/em vez de inventar|pendente/i);
  });
});

describe("o classificador lê os pareceres REAIS que esta casa registrou", () => {
  // Cada string abaixo é a citação registrada no arquivo que a causa nomeia —
  // não um exemplo escrito para o teste passar.
  const REGISTRADOS: Array<[string, string]> = [
    ['CTA "chame no WhatsApp [PRECISO CONFIRMAR: número]" — reprovada pela Qualidade', "canal_nao_informado"],
    ["barrada em horario_nao_informado", "horario_ou_dia"],
    ["REPROVADA por restringir dias de funcionamento sem base", "horario_ou_dia"],
    ['sem "cidade" — negócio local anunciado no país inteiro é dinheiro queimado', "area_ou_cidade"],
    ["campo atributos_formais em lacuna: paleta em hex e arquivo da fonte", "cor_e_tipografia"],
    ["faltam: arquivo vetorial do logo; paleta de cores documentada", "cor_e_tipografia"],
    ["campo referencias em lacuna: um post que ficou certo e um que ficou errado", "exemplo_de_referencia"],
    ["campo hierarquia_e_dono em lacuna: quem aprova o material e por qual canal", "quem_aprova"],
    ["proibicao_do_cliente", "proibicao_violada"],
  ];

  it("cada parecer registrado cai na causa que a casa nomeou", () => {
    for (const [texto, esperado] of REGISTRADOS) {
      expect(classificarCausa(texto), texto).toBe(esperado);
    }
  });

  it("METADE 2 — parecer que não é falta conhecida NÃO vira causa inventada", () => {
    // Causa inventada vira pergunta sem lastro, que é o defeito do outro lado.
    for (const t of [
      "a peça ficou boa, seguir para agendamento",
      "erro de rede ao chamar o provedor",
      "",
    ]) expect(classificarCausa(t), t).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MISSÃO B — a recusa vira regra, sem virar mordaça
// ═══════════════════════════════════════════════════════════════════════════

describe("toda proibição sai com a INSTRUÇÃO GÊMEA", () => {
  it("com substituto declarado pelo cliente, a regra diz o que usar", () => {
    expect(substitutoDeclarado("nunca use 'imperdível', em vez disso use 'vale a pena'"))
      .toContain("vale a pena");
    const linha = instrucaoGemea({
      frase: "nunca use 'imperdível'", termos: ["imperdivel"],
      substituto: "'vale a pena'", origem: "ajuste", registradaEm: "2026-08-24T10:00:00.000Z",
    });
    expect(linha).toMatch(/em vez disso, use: 'vale a pena'/);
    // Fonte e data no mesmo lugar da regra: trava que não se explica é desligada.
    expect(linha).toContain("ajuste");
    expect(linha).toContain("2026-08-24");
  });

  it("SEM substituto, a instrução gêmea NÃO some — ela é gerada em código", () => {
    // Este é o teste que protege o produtor. Lendo só "não use X", ele corta o
    // assunto da peça e é reprovado do outro lado por entrega incompleta.
    const linha = instrucaoGemea({ frase: "não fale de preço", termos: ["preco"] });
    expect(linha).toMatch(/MESMA coisa de outro jeito/i);
    expect(linha).toMatch(/N[ÃA]O corte o assunto/i);
  });

  it("o cliente não precisa dizer o substituto para a regra valer — e nada é inventado", () => {
    // Substituto inventado seria a agência pondo palavra na boca do cliente e
    // depois obedecendo a si mesma.
    expect(substitutoDeclarado("nunca use 'imperdível'")).toBeUndefined();
  });
});

describe("ajuste DAQUELA peça não vira regra permanente da marca", () => {
  it("o pedido pontual é reconhecido, e o categórico não é confundido com ele", () => {
    for (const p of [
      "troca esse título, ficou grande",
      "não use essa foto nesse post",
      "aqui eu queria outro tom, só nessa peça",
    ]) expect(ehAjustePontual(p), p).toBe(true);

    for (const c of [
      "nunca use a palavra 'imperdível'",
      "não fale de preço em nenhuma peça",
      "jamais cite concorrente",
      // O caso misto: ele aponta a peça E fala em categoria. Categoria manda.
      "não use 'imperdível' nesse post nem em nenhum outro",
    ]) expect(ehAjustePontual(c), c).toBe(false);
  });

  it("o ajuste pontual NÃO entra na base de marca", async () => {
    await registrarProibicoes("cli-p", "não use essa foto nesse post, troca esse título", "ajuste");
    expect((await lerProibicoes("cli-p")).itens, "opinião de um dia poluiu a marca").toEqual([]);
  });

  it("METADE 2 — a regra de marca CONTINUA entrando", async () => {
    await registrarProibicoes("cli-p", "nunca use a palavra 'imperdível'", "ajuste");
    const lidas = await lerProibicoes("cli-p");
    expect(lidas.itens.flatMap((i) => i.termos)).toContain("imperdivel");
  });

  it("e o substituto atravessa a gravação e a leitura", async () => {
    await registrarProibicoes("cli-s", "nunca use 'imperdível', em vez disso use 'vale a pena'", "ajuste");
    const lidas = await lerProibicoes("cli-s");
    expect(lidas.itens[0]?.substituto ?? "", "o que usar no lugar se perdeu no banco")
      .toContain("vale a pena");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A PROVA MEDIDA — a peça SEGUINTE, no caminho de verdade
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Doutrina cara desta casa: **régua verde sobre o componente errado é pior
// que régua nenhuma.** Por isso a prova abaixo roda sobre os componentes que
// produzem a peça de verdade:
//
//   • `contratoDeMarca` — a régua que `run-execution.ts` monta e injeta no `Ctx`;
//   • `ctxBlock` — o prompt que o ESPECIALISTA recebe (`especialistas.ts`);
//   • `ctxBlockParaJuiz` — o contexto que o JUIZ da Qualidade recebe;
//   • `conferirPisoDeVerdade` — o portão em código que barra a peça na SAÍDA.
//
// Nenhum irmão, nenhum atalho: são as quatro funções do caminho de produção.

describe("PROVA — a peça seguinte nasce sabendo, e a régua alcança quem escreve E quem julga", () => {
  const CLIENTE = "cli-prova";
  /** O texto de uma peça, do jeito que o especialista devolve. */
  const PECA_COM_A_PALAVRA = "Promoção imperdível no almoço de hoje — venha conhecer a casa.";

  function verdade(proibicoes: Awaited<ReturnType<typeof lerProibicoes>>) {
    return { businessName: "Cantina da Prova", telefones: [], emails: [], servicos: [], valores: [], proibicoes };
  }

  it("ANTES da recusa: a peça passa — a casa não tinha como saber", async () => {
    const antes = await lerProibicoes(CLIENTE);
    expect(antes.itens).toEqual([]);
    expect(conferirPisoDeVerdade(PECA_COM_A_PALAVRA, verdade(antes)).aprovado).toBe(true);
  });

  it("DEPOIS da recusa: a MESMA peça é barrada, e o motivo diz o que usar no lugar", async () => {
    // O cliente recusa, com as palavras dele — é o texto que `refacao.ts`
    // (pedido de ajuste) e `reprovacao.ts` (o "não é isso" de dentro) mandam
    // para `registrarProibicoes`.
    await registrarProibicoes(CLIENTE, "nunca use 'imperdível', em vez disso use 'vale a pena'", "ajuste");

    const depois = await lerProibicoes(CLIENTE);
    const veredito = conferirPisoDeVerdade(PECA_COM_A_PALAVRA, verdade(depois));

    expect(veredito.aprovado, "a peça seguinte repetiu o que o cliente já recusou").toBe(false);
    const motivo = veredito.violacoes.map((v) => v.motivo).join(" ");
    expect(motivo).toMatch(/PROIBIU/);
    // A metade que impede a mordaça: o motivo não diz só "não pode".
    expect(motivo, "o produtor foi barrado sem saber o que escrever no lugar")
      .toMatch(/em vez disso, use: 'vale a pena'/);
  });

  it("DEPOIS da recusa: a peça que OBEDECE atravessa — a regra não virou mordaça", async () => {
    await registrarProibicoes(CLIENTE, "nunca use 'imperdível', em vez disso use 'vale a pena'", "ajuste");
    const depois = await lerProibicoes(CLIENTE);
    const OBEDECE = "Almoço que vale a pena hoje — venha conhecer a casa.";
    expect(conferirPisoDeVerdade(OBEDECE, verdade(depois)).aprovado).toBe(true);
  });

  it("a regra aprendida CHEGA a quem escreve E a quem julga, com a instrução gêmea", async () => {
    await registrarProibicoes(CLIENTE, "nunca use 'imperdível', em vez disso use 'vale a pena'", "ajuste");
    const contrato = await contratoDeMarca(CLIENTE);

    // O bloco NUNCA existe, e traz o que usar no lugar.
    expect(contrato.texto).toContain("NUNCA");
    expect(contrato.texto).toMatch(/em vez disso, use: 'vale a pena'/);

    const ctx = {
      businessName: "Cantina da Prova", segment: "restaurante", targetAudience: "famílias",
      tone: "", services: [], objectives: [], strategyHeadline: "", hasBrandAssets: false,
      hasRawMaterial: true, criandoIdentidade: false, materiaisEntregues: [],
      contratoDeMarca: contrato.texto,
    };

    // QUEM ESCREVE.
    expect(ctxBlock(ctx), "a regra aprendida não chegou ao especialista")
      .toMatch(/em vez disso, use: 'vale a pena'/);
    // QUEM JULGA. É a outra metade: régua que só o autor conhece não é régua.
    expect(ctxBlockParaJuiz(ctx), "a regra aprendida não chegou ao juiz da Qualidade")
      .toMatch(/em vez disso, use: 'vale a pena'/);
  });

  it("e o AJUSTE pontual do mesmo cliente não contamina a peça seguinte", async () => {
    await registrarProibicoes(CLIENTE, "troca esse título, e não use essa foto nesse post", "ajuste");
    const contrato = await contratoDeMarca(CLIENTE);
    expect(contrato.texto).not.toMatch(/NUNCA/);
    // A peça seguinte, que nada tem a ver com aquele título, continua passando.
    const outra = "Massa fresca todo dia, feita na casa.";
    expect(conferirPisoDeVerdade(outra, verdade(await lerProibicoes(CLIENTE))).aprovado).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A LACUNA FICA VISÍVEL ANTES DA PRODUÇÃO
// ═══════════════════════════════════════════════════════════════════════════

describe("o que o cliente não respondeu aparece ANTES de a peça ser escrita", () => {
  it("o contrato de marca declara a lacuna, e ela vai no prompt de quem produz", async () => {
    const contrato = await contratoDeMarca("cli-vazio");
    expect(contrato.lacunas.length, "cliente sem nada declarado e nenhuma lacuna nomeada").toBeGreaterThan(0);
    expect(contrato.texto).toContain("AINDA NÃO DECIDIDO");
    expect(contrato.texto).toMatch(/N[ãa]o invente estes/);

    const ctx = {
      businessName: "Cantina da Prova", segment: "restaurante", targetAudience: "famílias",
      tone: "", services: [], objectives: [], strategyHeadline: "", hasBrandAssets: false,
      hasRawMaterial: true, criandoIdentidade: false, materiaisEntregues: [],
      contratoDeMarca: contrato.texto,
    };
    expect(ctxBlock(ctx)).toContain("AINDA NÃO DECIDIDO");
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// REGRA DE CLASSE: O CATÁLOGO DO BRIEFING NÃO PODE TOCAR NO BANCO
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido em 24/08/2026, e a suíte inteira ficou VERDE enquanto isso quebrava:
// `causas-de-refacao.ts` nasceu com o catálogo e a contagem juntos. O catálogo
// é lido pelo motor de perguntas (`question-engine.ts`), que é componente de
// CLIENTE (`PublicBriefingRoom.tsx`) — e o build de produção parou com
// `lib/db/client.ts` arrastado para o pacote do navegador. Nem o `import()`
// tardio salvou: o empacotador segue a aresta do mesmo jeito.
//
// Teste é mais barato que descobrir isso de novo no CI, e este pega o caso de
// quem só quiser "consultar rapidinho o banco aqui dentro".
describe("REGRA DE CLASSE: o catálogo lido pelo briefing não importa o banco", () => {
  const RAIZ = path.resolve(__dirname, "../..");
  /** Os módulos que o motor de perguntas do briefing carrega. */
  const NO_CAMINHO_DO_NAVEGADOR = [
    "lib/agency/esteira/causas-de-refacao.ts",
    "lib/agency/esteira/campos-da-marca.ts",
  ];

  it("nenhum deles importa `lib/db/client` — nem no topo, nem por import tardio", () => {
    for (const rel of NO_CAMINHO_DO_NAVEGADOR) {
      const fonte = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      // `import type` some na compilação e não puxa nada — só ele é aceito.
      const semTipos = fonte.replace(/import\s+type[^;]+;/g, "");
      expect(
        /["']@\/lib\/db\/client["']/.test(semTipos),
        `${rel} importa o banco e é carregado pelo briefing público: o build de `
          + "produção quebra com `lib/db/client.ts` no pacote do navegador. "
          + "A metade que fala com o banco mora em `causas-de-refacao-contagem.ts`.",
      ).toBe(false);
    }
  });
});
