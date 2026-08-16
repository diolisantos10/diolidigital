// A TRAVA: PREÇO DE CATÁLOGO NÃO NASCE FORA DA SUA FONTE.
//
// ─── O QUE ESTE PORTÃO PROTEGE, QUE O OUTRO NÃO PROTEGIA ────────────────────
//
// `preco-uma-fonte-so.test.ts` compara `docs/precos.md` com `lib/agency/planos.ts`.
// Ele garante que os DOIS lugares conhecidos concordam. E é exatamente aí que
// ele acaba: ele não faz ideia se existe um TERCEIRO lugar.
//
// Existia. Em 16/08/2026 a varredura achou:
//
//   • `lib/agency/comercial/negociacao.ts` — `TABELA_DE_PISO` repetia à mão os
//     valores cheios dos 4 planos negociáveis (297 · 790 · 1390 · 2590) e dos 5
//     itens de balcão (79 · 129 · 99 · 39 · 149). É a tabela que o SDR usa para
//     autorizar venda. Nada a obrigava a concordar com `planos.ts`.
//   • `app/planos/page.tsx` — o `openGraph.description` da página PÚBLICA trazia
//     "Do R$ 49 que mede ao R$ 2.590 que cresce" digitado à mão, num arquivo cujo
//     cabeçalho promete que "os dados vêm de planos.ts, fonte única".
//
// Os dois batiam com a fonte no dia da varredura. Batiam **por sorte** — e
// "bate hoje" nunca foi garantia. Este teste troca a sorte por mecanismo.
//
// ─── A REGRA, EM UMA FRASE ──────────────────────────────────────────────────
//
// Cada preço de catálogo pode ser DIGITADO em um arquivo só — o dono do produto.
// Todo o resto IMPORTA. Duplicata não vira "cópia sincronizada": sincronização é
// disciplina, e disciplina é o que falha no primeiro dia de pressa.
//
//   | catálogo | dono, e único lugar onde o número pode ser digitado |
//   |---|---|
//   | os 5 planos (mensalidade + implantação) | `lib/agency/planos.ts` |
//   | o balcão (peça avulsa da vitrine)       | `lib/agency/self-serve-catalog.ts` |
//
// O **piso** de negociação (229 · 690 · 1190 · 2190) NÃO está nesta trava, e é
// de propósito: ele não é cópia de nada. É dado próprio, interno, que só existe
// em `negociacao.ts`. Trava que reprova dado original ensina a desligar trava.
//
// ─── POR QUE AST, E NÃO grep ────────────────────────────────────────────────
//
// Um grep por `R\$ ?\d+` neste repositório devolve dezenas de acertos que não são
// defeito nenhum, e a trava morreria afogada em exceção:
//
//   1. **COMENTÁRIO.** Meia dúzia de arquivos explica a economia da casa citando
//      o número ("num item de R$ 79, uma intervenção humana come a margem").
//      Isso é o RACIOCÍNIO registrado, não uma oferta — comentário não chega a
//      cliente nenhum. Apagar o número apagaria a explicação e não protegeria
//      ninguém. Esta trava lê só literal de código; comentário passa, por decisão.
//   2. **PREÇO DO CLIENTE.** O rodízio do Sushi Cazza custa "R$ 99,00" e a porção
//      infantil "R$ 49,90" — e 99 e 49 são, por coincidência, preços da Dioli.
//      Preço do cliente é dado do cliente. Daí as duas defesas: os decimais são
//      recusados (`R$ 99,00` não é `R$ 99`), e `scripts/` fica fora do escopo,
//      porque é lá que moram os arreios de teste com dado de cliente.
//
// Ler a árvore em vez do texto é o que permite a trava ser ESTREITA e mesmo
// assim pegar o que importa: literal de string e literal numérico atribuído a
// campo de preço — que é, os dois, o que de fato chega ao cliente.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PLANOS } from "@/lib/agency/planos";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { blocoDeNegociacaoParaPrompt, FAIXAS } from "@/lib/agency/comercial/negociacao";

const RAIZ = process.cwd();

/** Onde o número PODE ser digitado. Caminho relativo, separador POSIX. */
const DONOS = new Set(["lib/agency/planos.ts", "lib/agency/self-serve-catalog.ts"]);

/** Onde a trava varre. `scripts/` fica fora — ver o cabeçalho. `lib/generated/`
 *  é código gerado pelo Prisma e ninguém o escreve à mão. */
const VARRIDOS = ["lib", "app", "components"];

/** Campos cujo valor numérico É um preço. Um `piso:` não entra: é dado próprio. */
const CAMPOS_DE_PRECO = new Set(["preco", "price", "cheio", "precoMinimo", "mensalidade", "implantacao"]);

// ─── DUAS LISTAS, PORQUE AS DUAS METADES CORREM RISCOS DIFERENTES ────────────
//
// **Campo de preço** (`price: 150`) é inequívoco: alguém nomeou aquilo de preço.
// Ali cabe o catálogo inteiro, plano e balcão, sem risco de acusar inocente.
//
// **Texto** (`"R$ 150"`) é ambíguo, e a medição mostrou o porquê. Metade do
// catálogo de balcão é número redondo comum — `Pack 4 Stories` custa R$ 150, e
// R$ 150 é também o primeiro degrau da régua de faixa do SDR ("até R$ 150"), a
// meta de CPL de uma campanha e um valor de exemplo em `mock-data`. Nenhum
// desses três é o pacote de stories, e reprová-los ensinaria a casa a desligar
// a trava.
//
// Então o texto protege só o que é ambíguo de menos e caro de mais: **os cinco
// planos**. É a tabela do conselho, é o que o CEO entregou, e é o número que,
// escrito errado numa tela, vira oferta pública que a casa não honra.
//
// O custo desta escolha, declarado: um preço de balcão digitado à mão dentro de
// uma frase NÃO é pego. A defesa desse caso é a metade B (o campo) mais a
// derivação já feita em `negociacao.ts`.

/** Só os 5 planos: mensalidade e implantação. Protegidos em TEXTO e em CAMPO. */
function precosDePlano(): Map<number, string> {
  const m = new Map<number, string>();
  for (const p of PLANOS) {
    m.set(p.preco, `mensalidade do plano ${p.nome}`);
    if (typeof p.implantacao === "number" && !m.has(p.implantacao)) {
      m.set(p.implantacao, `implantação do plano ${p.nome}`);
    }
  }
  return m;
}

/** Planos + balcão. Protegidos só em CAMPO de preço. A lista nunca é digitada
 *  aqui: preço novo numa das fontes passa a ser protegido sozinho. */
function precosDeCatalogo(): Map<number, string> {
  const m = precosDePlano();
  for (const s of SELF_SERVE_CATALOG) {
    if (!m.has(s.price)) m.set(s.price, `preço de balcão "${s.label}"`);
    if (typeof s.precoMinimo === "number" && !m.has(s.precoMinimo)) {
      m.set(s.precoMinimo, `piso de balcão "${s.label}"`);
    }
  }
  return m;
}

function* arquivos(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (/node_modules|[\\/]generated[\\/]|\.next/.test(p)) continue;
    if (statSync(p).isDirectory()) yield* arquivos(p);
    else if (/\.(ts|tsx)$/.test(p)) yield p;
  }
}

/**
 * "R$ 2.590" → 2590 · "R$ 390, uma vez só" → 390 · "R$ 99,00" → nada.
 *
 * A cauda `(?![\d.]|,\d)` é a defesa contra o preço do cliente: em pt-BR a
 * vírgula seguida de dígito é decimal, e valor com centavos é quase sempre preço
 * de terceiro (cardápio, orçamento escrito no briefing), nunca um degrau da
 * tabela desta casa — que é sempre redonda.
 *
 * O `,\d` em vez de `,` foi conserto de um defeito que o próprio teste pegou:
 * `(?![\d.,])` recusava "R$ 390, uma vez só" — vírgula de frase, não de centavo —
 * e a implantação do Ritmo passava batido. Era a trava com um buraco do tamanho
 * de uma pontuação.
 */
const CIFRAO = /R\$\s*(\d[\d.]*)(?![\d.]|,\d)/g;

export interface Achado {
  arquivo: string;
  linha: number;
  valor: number;
  oQueE: string;
  trecho: string;
}

/**
 * Analisa UM arquivo já parseado. É a única implementação da regra — o portão do
 * repositório e os casos plantados passam exatamente por aqui. Duas cópias da
 * regra divergem, e uma trava que diverge do seu próprio teste não prova nada.
 */
function analisar(fonte: ts.SourceFile, rel: string, emTexto: Map<number, string>, emCampo: Map<number, string>): Achado[] {
  const achados: Achado[] = [];

  const anotar = (no: ts.Node, valor: number, trecho: string, lista: Map<number, string>) => {
    const oQueE = lista.get(valor);
    if (!oQueE) return;
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
    achados.push({ arquivo: rel, linha: line + 1, valor, oQueE, trecho });
  };

  const visitar = (no: ts.Node) => {
    // ── METADE A: o preço escrito dentro de um texto que o cliente lê ────────
    if (
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateHead(no) ||
      ts.isTemplateMiddle(no) ||
      ts.isTemplateTail(no)
    ) {
      for (const m of no.text.matchAll(CIFRAO)) {
        anotar(no, Number(m[1].replace(/\./g, "")), m[0], emTexto);
      }
    }

    // ── METADE B: o preço atribuído a um campo de preço ──────────────────────
    if (ts.isPropertyAssignment(no) && ts.isNumericLiteral(no.initializer)) {
      const nome = ts.isIdentifier(no.name) || ts.isStringLiteral(no.name) ? no.name.text : "";
      if (CAMPOS_DE_PRECO.has(nome)) {
        anotar(no, Number(no.initializer.text), `${nome}: ${no.initializer.text}`, emCampo);
      }
    }

    ts.forEachChild(no, visitar);
  };

  visitar(fonte);
  return achados;
}

/**
 * A varredura do repositório de verdade.
 */
export function varrer(raizes: string[], emTexto: Map<number, string>, emCampo: Map<number, string>): Achado[] {
  const achados: Achado[] = [];
  for (const raiz of raizes) {
    for (const arquivo of arquivos(path.join(RAIZ, raiz))) {
      const rel = path.relative(RAIZ, arquivo).split(path.sep).join("/");
      if (DONOS.has(rel)) continue;
      const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, "utf8"), ts.ScriptTarget.Latest, true);
      achados.push(...analisar(fonte, rel, emTexto, emCampo));
    }
  }
  return achados;
}

/**
 * O arreio: varre um arquivo que existe só na memória, pela MESMA `analisar`.
 * Um portão que nunca foi visto reprovando é um portão que ninguém conferiu —
 * e escrever arquivo de verdade em disco é lixo que sobra quando o teste quebra.
 */
function varrerTexto(rel: string, codigo: string): Achado[] {
  const fonte = ts.createSourceFile(rel, codigo, ts.ScriptTarget.Latest, true);
  return analisar(fonte, rel, precosDePlano(), precosDeCatalogo());
}

function relatar(achados: Achado[]): string {
  return achados.map((a) => `  ${a.arquivo}:${a.linha} → ${a.trecho}  (é a ${a.oQueE})`).join("\n");
}

describe("preço de catálogo tem UMA fonte, e a trava é código", () => {
  // ── METADE 1: A TRAVA REPROVA DE VERDADE ──────────────────────────────────
  //
  // Sem esta metade, o teste abaixo passaria igualzinho se `varrer` tivesse um
  // `return []` no topo. É o defeito que esta casa já pagou: a peça verde com a
  // junta rompida.
  describe("BARRA o preço declarado fora da fonte (a metade que protege)", () => {
    it("pega o preço de plano digitado à mão num texto de cliente", () => {
      const plantado = varrerTexto(
        "app/plantado.tsx",
        `export const chamada = "A partir de R$ ${PLANOS[0].preco} por mês.";`,
      );
      expect(plantado).toHaveLength(1);
      expect(plantado[0].valor).toBe(PLANOS[0].preco);
      expect(plantado[0].oQueE).toContain(PLANOS[0].nome);
    });

    it("pega o preço de plano digitado à mão num campo de preço", () => {
      const caro = PLANOS.reduce((a, b) => (b.preco > a.preco ? b : a));
      const plantado = varrerTexto(
        "lib/plantado.ts",
        `export const TABELA = { crescimento: { nome: "x", cheio: ${caro.preco}, piso: 2190 } };`,
      );
      expect(plantado).toHaveLength(1);
      expect(plantado[0].trecho).toBe(`cheio: ${caro.preco}`);
    });

    it("pega o preço de BALCÃO digitado à mão num campo de preço", () => {
      const item = SELF_SERVE_CATALOG.find((s) => s.id === "balcao-post-feed")!;
      const plantado = varrerTexto("lib/plantado.ts", `const x = { price: ${item.price} };`);
      expect(plantado).toHaveLength(1);
      expect(plantado[0].oQueE).toContain("balcão");
    });

    it("pega a IMPLANTAÇÃO, que é preço tanto quanto a mensalidade", () => {
      const comImplantacao = PLANOS.find((p) => typeof p.implantacao === "number")!;
      const plantado = varrerTexto(
        "app/plantado.tsx",
        `const t = "Implantação de R$ ${comImplantacao.implantacao}, uma vez só.";`,
      );
      expect(plantado).toHaveLength(1);
      expect(plantado[0].oQueE).toContain("implantação");
    });

    it("pega o EXATO defeito achado em 16/08: o preço na descrição de OpenGraph", () => {
      // A regressão real, palavra por palavra, do que estava em app/planos/page.tsx.
      const barato = PLANOS.reduce((a, b) => (b.preco < a.preco ? b : a));
      const caro = PLANOS.reduce((a, b) => (b.preco > a.preco ? b : a));
      const plantado = varrerTexto(
        "app/planos/plantado.tsx",
        `export const metadata = { openGraph: { description:` +
          ` "Do R$ ${barato.preco} que mede ao R$ ${caro.preco.toLocaleString("pt-BR")} que cresce." } };`,
      );
      expect(plantado).toHaveLength(2);
      expect(plantado.map((a) => a.valor).sort((x, y) => x - y)).toEqual([barato.preco, caro.preco]);
    });
  });

  // ── METADE 2: NÃO INVENTA PROBLEMA NO CASO LIMPO ──────────────────────────
  //
  // Trava que dispara onde não há risco é trava que alguém desliga na sexta-feira.
  describe("NÃO acusa onde não há duplicata", () => {
    it("preço MONTADO da fonte passa — é o conserto, não pode ser reprovado", () => {
      const limpo = varrerTexto(
        "app/limpo.tsx",
        `const t = \`Do \${precoEmReais(MAIS_BARATO.preco)} ao \${precoEmReais(MAIS_CARO.preco)}.\`;`,
      );
      expect(limpo).toEqual([]);
    });

    it("preço do CLIENTE com centavos passa — R$ 99,00 do rodízio não é o balcão", () => {
      // O caso real: `scripts/pilot-sushi-cazza.ts` guarda o cardápio do cliente,
      // e "R$ 99,00" colide por acaso com um preço de balcão.
      const limpo = varrerTexto(
        "lib/limpo.ts",
        `const notas = "Rodízio R$ 99,00. Crianças de 6 a 10 anos R$ 49,90.";`,
      );
      expect(limpo).toEqual([]);
    });

    it("COMENTÁRIO que cita o número passa — é raciocínio registrado, não oferta", () => {
      const limpo = varrerTexto(
        "lib/limpo.ts",
        `// num item de R$ 79 uma intervenção humana come a margem\nexport const x = 1;`,
      );
      expect(limpo).toEqual([]);
    });

    it("número que NÃO é preço passa — 790 caracteres não é o plano Presença", () => {
      const limpo = varrerTexto("lib/limpo.ts", `const maximo = 790; // caracteres\nconst dias = 390;`);
      expect(limpo).toEqual([]);
    });

    it("a RÉGUA DE FAIXA do SDR passa — 'até R$ 150' é degrau de bolso, não preço de peça", () => {
      // Medido em 16/08: era o único falso positivo do repositório inteiro. R$ 150
      // é, ao mesmo tempo, o `Pack 4 Stories` e o primeiro degrau da pergunta de
      // faixa. Reprovar a pergunta certa do SDR ensinaria a desligar a trava.
      const limpo = varrerTexto(
        "lib/limpo.ts",
        `const p = "quanto pensa em investir — até R$ 150, entre R$ 150 e R$ 500?";`,
      );
      expect(limpo).toEqual([]);
    });
  });

  // ── O PORTÃO: o repositório de verdade ────────────────────────────────────
  it("o repositório INTEIRO não declara preço de catálogo fora da fonte", () => {
    const achados = varrer(VARRIDOS, precosDePlano(), precosDeCatalogo());
    expect(
      achados,
      achados.length === 0
        ? ""
        : `\n\nPreço de catálogo declarado fora da fonte única — ${achados.length} ocorrência(s):\n\n` +
          relatar(achados) +
          `\n\nO número não se copia para cá: IMPORTE de lib/agency/planos.ts (planos) ou de\n` +
          `lib/agency/self-serve-catalog.ts (balcão) e monte o texto com precoEmReais().\n` +
          `Se o preço MUDOU, mude na fonte — nunca aqui.\n`,
    ).toEqual([]);
  });

  // ── O `price-leak` do SDR, fechado na origem ───────────────────────────────
  //
  // A rota `/api/sdr/chat` já tinha um regex `PRICE_LEAK` que descarta o turno
  // quando o modelo escreve "R$ <número>". Isso é a rede embaixo do trapézio:
  // ela pega o modelo DEPOIS de ele ter dito o preço.
  //
  // A pergunta que faltava era a de cima: existe número solto no prompt para o
  // modelo pescar? Medido em 16/08 — não existe. O único bloco de preço que
  // entra no system prompt é `blocoDeNegociacaoParaPrompt()`, e ele só publica
  // os LIMITES DE FAIXA (150 · 500 · 1.500 · 5.000), que são degraus de bolso
  // que o próprio cliente escolhe, nunca preço de produto.
  //
  // As frases de venda com preço (`FAIXAS[].principal`, `TABELA_DE_PISO[].
  // versaoMenor`) existem e agora são montadas da fonte — mas nenhuma delas tem
  // chamador que as ponha num prompt. Este teste é o que impede alguém de
  // adicionar um: no dia em que `principal` entrar no bloco, isto fica vermelho.
  it("o prompt do SDR não carrega preço de catálogo — nada para o modelo pescar", () => {
    const bloco = blocoDeNegociacaoParaPrompt();

    // Os LIMITES DE FAIXA saem da conta, e é a única exceção — eles são o
    // conteúdo legítimo deste bloco. R$ 150 é ao mesmo tempo o primeiro degrau
    // de bolso e, por coincidência, o preço do `Pack 4 Stories`; o que entra no
    // prompt é o degrau. Os limites são lidos de `FAIXAS`, não digitados aqui.
    const limitesDeFaixa = new Set<number>();
    for (const f of FAIXAS) {
      if (Number.isFinite(f.de)) limitesDeFaixa.add(f.de);
      if (Number.isFinite(f.ate)) limitesDeFaixa.add(f.ate);
    }

    const catalogo = precosDeCatalogo();
    const vazados: string[] = [];
    for (const m of bloco.matchAll(CIFRAO)) {
      const n = Number(m[1].replace(/\./g, ""));
      if (limitesDeFaixa.has(n)) continue;
      const oQueE = catalogo.get(n);
      if (oQueE) vazados.push(`${m[0]} (é a ${oQueE})`);
    }

    // A metade que prova que a exceção acima não engoliu tudo: NENHUM preço de
    // plano é um limite de faixa, então a proteção dos 5 planos segue inteira.
    for (const p of PLANOS) expect(limitesDeFaixa.has(p.preco)).toBe(false);

    expect(
      vazados,
      `O bloco de negociação que vai para o system prompt do SDR carrega preço de catálogo:\n` +
        vazados.map((v) => `  • ${v}`).join("\n") +
        `\nO prompt é texto que o interlocutor pode extrair. Preço de produto se calcula no servidor.`,
    ).toEqual([]);

    // E a metade que impede o teste de passar por bloco vazio.
    expect(bloco.length).toBeGreaterThan(200);
    expect(bloco).toContain("R$ 150");
  });

  it("a lista de preços protegidos vem das FONTES, e não está vazia", () => {
    // Um catálogo vazio faria o portão acima aprovar o repositório inteiro em
    // silêncio. É a falha que este mesmo teste precisa não ter.
    const catalogo = precosDeCatalogo();
    expect(catalogo.size).toBeGreaterThanOrEqual(PLANOS.length);
    for (const p of PLANOS) expect(catalogo.has(p.preco)).toBe(true);
  });
});

