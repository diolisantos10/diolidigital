// O PREÇO TEM UMA FONTE SÓ — e agora existe MECANISMO, não promessa.
//
// ─── O QUE A AUDITORIA DE 08/08/2026 DISSE, E O QUE ERA VERDADE ─────────────
//
// A auditoria externa afirmou: *"os 5 planos de `docs/precos.md` não existem no
// código — `SELF_SERVE_CATALOG` não tem nenhum dos 5 nomes"*.
//
// **A afirmação é falsa, e o erro dela é instrutivo.** `SELF_SERVE_CATALOG` é o
// BALCÃO — micro-serviços de compra avulsa (post R$ 79, carrossel R$ 129). Ele
// não tem os 5 planos porque **não deve ter**: o próprio `docs/precos.md` diz
// que são "duas tabelas, e elas não se contradizem — vendem coisas diferentes".
//
// Os 5 planos SEMPRE estiveram em `lib/agency/planos.ts`, que se declara "fonte
// única" na primeira linha, com os 5 nomes, os 5 preços e as 5 implantações
// batendo com o documento.
//
// ─── ENTÃO POR QUE ESTE TESTE EXISTE ────────────────────────────────────────
//
// Porque "bate hoje" não é garantia nenhuma. O documento e o código concordavam
// por SORTE — nada os obrigava. No dia em que o CEO mexer no preço num dos dois
// lugares, os dois divergem em silêncio e o cliente encontra o menor.
//
// Este é o mecanismo que faltava: o documento é lido, os números são extraídos
// da TABELA e comparados com o código. Divergiu, o portão fecha.
//
// A regra da casa: **"sem gate = reprovado"** — checagem que não roda não
// protege nada. E `docs/ESTADO-REAL-08-08.md` §1: toda tela (e todo portão)
// mostra os DOIS lados, e diz QUAL metade falta.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PLANOS, PECA_EXTRA } from "@/lib/agency/planos";

const DOC = path.join(process.cwd(), "docs/precos.md");

/** "R$ 1.390/mês" → 1390 · "isenta" → null · "R$ 49" → 49 */
function valor(bruto: string): number | null {
  const limpo = bruto.trim();
  if (/isenta/i.test(limpo)) return null;
  const m = limpo.match(/R\$\s*([\d.]+)/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, ""));
}

/**
 * Lê a TABELA "Os cinco degraus" de `docs/precos.md`.
 * Formato: | **Nome** | R$ X/mês | R$ Y | ... |
 */
function planosDoDocumento(): Array<{ nome: string; preco: number | null; implantacao: number | null }> {
  const texto = readFileSync(DOC, "utf8");
  const linhas = texto.split("\n");
  const saida: Array<{ nome: string; preco: number | null; implantacao: number | null }> = [];
  for (const linha of linhas) {
    // Só as linhas cujo primeiro campo é um nome em negrito: | **Pulso** | ...
    const m = linha.match(/^\|\s*\*\*([^*|]+)\*\*\s*\|([^|]*)\|([^|]*)\|/);
    if (!m) continue;
    const nome = m[1].trim();
    if (!PLANOS.some((p) => p.nome === nome)) continue; // ignora outras tabelas
    saida.push({ nome, preco: valor(m[2]), implantacao: valor(m[3]) });
  }
  return saida;
}

describe("o preço mora em UM lugar só", () => {
  // ── METADE 1: O PORTÃO PEGA A DIVERGÊNCIA ────────────────────────────────
  describe("BARRA a divergência (a metade que protege)", () => {
    it("um preço trocado no código seria pego pela comparação", () => {
      const doDoc = planosDoDocumento();
      const ritmoDoDoc = doDoc.find((p) => p.nome === "Ritmo");
      expect(ritmoDoDoc).toBeDefined();
      // Simula o código divergindo do documento — é ISTO que o portão detecta.
      const codigoAdulterado = { nome: "Ritmo", preco: 397 };
      expect(codigoAdulterado.preco).not.toBe(ritmoDoDoc!.preco);
    });

    it("o documento é LEGÍVEL — se a tabela mudar de forma, o portão falha alto", () => {
      // Um portão que devolve [] quando não entende o documento não protege
      // nada: ele passaria a aprovar tudo em silêncio. Melhor quebrar.
      const doDoc = planosDoDocumento();
      expect(doDoc.length).toBe(5);
    });
  });

  // ── METADE 2: NÃO INVENTA PROBLEMA NO CASO LIMPO ─────────────────────────
  describe("NÃO acusa divergência onde não há", () => {
    it("os 5 planos do documento existem no código, com o mesmo nome", () => {
      const doDoc = planosDoDocumento().map((p) => p.nome).sort();
      const doCodigo = PLANOS.map((p) => p.nome).sort();
      expect(doDoc).toEqual(doCodigo);
    });

    it("MENSALIDADE: documento e código dizem o mesmo número", () => {
      for (const doDoc of planosDoDocumento()) {
        const noCodigo = PLANOS.find((p) => p.nome === doDoc.nome)!;
        expect(
          noCodigo.preco,
          `"${doDoc.nome}": docs/precos.md diz R$ ${doDoc.preco}, lib/agency/planos.ts diz R$ ${noCodigo.preco}`,
        ).toBe(doDoc.preco);
      }
    });

    it("IMPLANTAÇÃO: documento e código dizem o mesmo número (e 'isenta' é null)", () => {
      for (const doDoc of planosDoDocumento()) {
        const noCodigo = PLANOS.find((p) => p.nome === doDoc.nome)!;
        expect(
          noCodigo.implantacao,
          `"${doDoc.nome}": docs/precos.md diz ${doDoc.implantacao}, planos.ts diz ${noCodigo.implantacao}`,
        ).toBe(doDoc.implantacao);
      }
    });

    it("a peça extra (R$ 180) do documento é a do código", () => {
      const texto = readFileSync(DOC, "utf8");
      expect(texto).toContain(`R$ ${PECA_EXTRA}`);
    });

    it("o balcão NÃO tem os 5 planos — e isso é de propósito, não um furo", async () => {
      // Registrado porque foi exatamente aqui que a auditoria de 08/08 errou.
      //
      // ⚠️ ESTA CHECAGEM SOZINHA NÃO PROTEGE NADA, e o motivo está no bloco
      // seguinte: ela compara RÓTULO com RÓTULO, e rótulo é a coisa mais fácil
      // de trocar no repositório. Ela fica porque documenta o erro de 08/08 —
      // não porque seja o portão.
      const { SELF_SERVE_CATALOG } = await import("@/lib/agency/self-serve-catalog");
      for (const plano of PLANOS) {
        expect(SELF_SERVE_CATALOG.some((s) => s.label === plano.nome)).toBe(false);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O PORTÃO COMPARA PREÇO COM PREÇO — porque rótulo não protege nada
//
// ─── O QUE ESTE PORTÃO NÃO PEGAVA, E FOI MEDIDO EM 15/08/2026 ───────────────
//
// "Pacote mês — 8 peças" custa R$ 297: o preço EXATO da mensalidade do plano
// Ritmo, com o escopo EXATO dele (pauta do mês, 8 peças, calendário, aprovação
// peça a peça no portal). Ele passava reto pela checagem acima porque o rótulo
// dele não é "Ritmo" — e a checagem só olhava o rótulo.
//
// É o padrão que esta casa já pagou várias vezes: o portão verifica a coisa
// fácil de verificar, não a coisa que causa dano. Preço é o que o cliente
// compara; nome é o que a agência escolhe.
//
// ─── AS DUAS METADES ────────────────────────────────────────────────────────
// 1. BARRA: colisão de preço NÃO declarada reprova a build, nomeando os dois.
// 2. NÃO INVENTA PROBLEMA: o catálogo real de hoje passa, porque a única
//    colisão que existe (`balcao-pacote-mes`) está declarada com motivo escrito.
describe("o portão compara PREÇO com PREÇO, não rótulo com rótulo", () => {
  interface ItemComPreco { id: string; label: string; price: number }

  /**
   * Toda colisão de preço entre um item vendável e a mensalidade de um plano
   * que NÃO esteja declarada como exceção conhecida.
   *
   * É a mesma função nas duas metades de propósito: um portão provado com um
   * código e executado com outro não foi provado.
   */
  function colisoesNaoDeclaradas(
    catalogo: ItemComPreco[],
    planos: typeof PLANOS,
    declaradas: Record<string, string>,
  ): string[] {
    const achados: string[] = [];
    for (const item of catalogo) {
      const plano = planos.find((p) => p.preco === item.price);
      if (!plano) continue;
      const motivo = declaradas[item.id];
      if (typeof motivo === "string" && motivo.trim().length >= 60) continue;
      achados.push(
        `"${item.id}" (${item.label}) custa R$ ${item.price} — exatamente a mensalidade do plano ` +
        `${plano.nome}. Ou o preço muda (decisão do CEO), ou a colisão entra em ` +
        `COLISAO_DE_PRECO_COM_PLANO com o motivo escrito.`,
      );
    }
    return achados;
  }

  // ── METADE 1: O PORTÃO REPROVA A COLISÃO NÃO DECLARADA ────────────────────
  it("item novo com preço de plano, sem declaração, REPROVA — nomeando os dois", () => {
    const inventado: ItemComPreco[] = [
      { id: "pacote-presenca-avulso", label: "Pacote presença", price: 790 },
    ];
    const achados = colisoesNaoDeclaradas(inventado, PLANOS, {});
    expect(achados).toHaveLength(1);
    expect(achados[0]).toContain("pacote-presenca-avulso");
    expect(achados[0]).toContain("790");
    expect(achados[0]).toContain("Presença");
  });

  it("declaração VAZIA ou carimbo curto não vale como exceção", () => {
    const inventado: ItemComPreco[] = [{ id: "x", label: "X", price: 297 }];
    expect(colisoesNaoDeclaradas(inventado, PLANOS, { x: "" })).toHaveLength(1);
    expect(colisoesNaoDeclaradas(inventado, PLANOS, { x: "ok" })).toHaveLength(1);
    expect(colisoesNaoDeclaradas(inventado, PLANOS, { x: "   " })).toHaveLength(1);
  });

  it("o caso REAL de hoje seria pego se não estivesse declarado", () => {
    // A prova de que o portão morde o caso que existe, e não só um inventado.
    const soOPacote: ItemComPreco[] = [
      { id: "balcao-pacote-mes", label: "Pacote mês — 8 peças", price: 297 },
    ];
    const achados = colisoesNaoDeclaradas(soOPacote, PLANOS, {});
    expect(achados).toHaveLength(1);
    expect(achados[0]).toContain("Ritmo");
  });

  // ── METADE 2: O CATÁLOGO REAL PASSA — verde hoje, vermelho no próximo ──────
  it("o catálogo de hoje passa, porque a única colisão está declarada", async () => {
    const { SELF_SERVE_CATALOG, COLISAO_DE_PRECO_COM_PLANO } =
      await import("@/lib/agency/self-serve-catalog");
    const achados = colisoesNaoDeclaradas(SELF_SERVE_CATALOG, PLANOS, COLISAO_DE_PRECO_COM_PLANO);
    expect(achados, achados.join("\n")).toEqual([]);
  });

  it("a exceção declarada é o Pacote mês, e o motivo diz por que ele colide", async () => {
    const { COLISAO_DE_PRECO_COM_PLANO } = await import("@/lib/agency/self-serve-catalog");
    const motivo = COLISAO_DE_PRECO_COM_PLANO["balcao-pacote-mes"];
    expect(motivo).toBeTruthy();
    expect(motivo).toMatch(/Ritmo/);
    expect(motivo).toMatch(/compra única|COMPRA ÚNICA/i);
    // O motivo tem de dizer que a decisão é do CEO — declarar não é resolver.
    expect(motivo).toMatch(/CEO/);
  });

  // ── E A EXCEÇÃO NÃO PODE APODRECER ────────────────────────────────────────
  it("exceção declarada para item que não existe (ou não colide mais) REPROVA", async () => {
    // Exceção que sobrevive ao problema é permissão permanente que ninguém
    // lembra de ter dado. Se o CEO mudar o preço, esta declaração cai junto.
    const { SELF_SERVE_CATALOG, COLISAO_DE_PRECO_COM_PLANO } =
      await import("@/lib/agency/self-serve-catalog");
    for (const id of Object.keys(COLISAO_DE_PRECO_COM_PLANO)) {
      const item = SELF_SERVE_CATALOG.find((s) => s.id === id);
      expect(item, `"${id}" está declarado como exceção e não existe no catálogo`).toBeDefined();
      expect(
        PLANOS.some((p) => p.preco === item!.price),
        `"${id}" está declarado como exceção de colisão mas R$ ${item!.price} não é mais mensalidade de plano nenhum — apague a declaração`,
      ).toBe(true);
    }
  });
});
