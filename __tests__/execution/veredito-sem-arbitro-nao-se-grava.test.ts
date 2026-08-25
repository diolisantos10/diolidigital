// NENHUM CAMINHO GRAVA VEREDITO SEM DIZER QUEM JULGOU.
//
// ── A classe de defeito (25/08/2026) ────────────────────────────────────────
//
// O achado do Farol 27 (8 juízes em HTTP 429, 10 julgamentos vindos do próprio
// autor, 0 de 10 com árbitro independente e nenhuma tela mudando) tinha uma
// causa de fundo que NÃO era o 429: `QualityVerdict.arbitro` era calculado e
// jogado fora — nenhum dos cinco chamadores o gravava. A tela não podia
// distinguir porque o dado nunca chegava ao banco.
//
//   **Valor medido e não persistido é o mesmo que não medido.**
//
// Este arquivo é a trava de CLASSE contra a volta disso por qualquer porta
// nova: quem escrever `revisionStatus` num write de `Deliverable` tem de
// escrever, no mesmo objeto, QUEM decidiu. Ou passa por um dos pontos únicos de
// tradução (`camposDaQualidade`, `camposDaDecisaoHumana`), ou declara
// `qualityArbitragem` à mão logo ali.
//
// ── Por que um teste que LÊ O CÓDIGO, e não um teste de comportamento ───────
//
// Um teste de comportamento só cobre os caminhos que alguém lembrou de
// escrever. A porta seguinte — a que ainda não existe — passaria verde. O que
// se quer aqui não é "estes cinco caminhos estão certos", é "não dá para
// escrever um sexto errado". Régua sobre o repositório inteiro, não sobre uma
// amostra dele.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");

function arquivosTs(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome === "generated") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosTs(caminho));
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/**
 * Os arquivos que ESCREVEM `Deliverable` no banco. Só eles são cobrados —
 * `mock-data.ts` e os hooks de tela montam objetos que nunca viram linha.
 */
function arquivosQueEscrevemEntregavel(): string[] {
  return [...arquivosTs(join(RAIZ, "lib")), ...arquivosTs(join(RAIZ, "app"))]
    .filter((f) => {
      const t = readFileSync(f, "utf8");
      return /prisma\.deliverable\.(create|update|upsert|updateMany|createMany)/.test(t);
    });
}

/** As formas que CONTAM como "eu disse quem julgou". */
const DECLARA_QUEM_JULGOU = /qualityArbitragem|camposDaQualidade\(|camposDaDecisaoHumana\(/;

/** Quantas linhas depois do `revisionStatus:` a declaração ainda vale como "no
 *  mesmo objeto". Folga curta de propósito: comentário longo entre os dois
 *  campos é legítimo, um objeto inteiro de distância não é. */
const JANELA = 18;

describe("trava de classe: veredito e árbitro andam juntos", () => {
  const arquivos = arquivosQueEscrevemEntregavel();

  it("existe pelo menos um caminho de escrita para cobrar — a régua não está vazia", () => {
    // Sem esta linha, um refactor que renomeasse `prisma.deliverable` faria a
    // varredura achar ZERO arquivos e o teste passaria verde sobre o nada. É a
    // mesma doutrina: ausência de medição nunca é verde.
    expect(arquivos.length).toBeGreaterThanOrEqual(5);
  });

  it.each([true])("nenhum write de Deliverable grava revisionStatus calado", () => {
    const faltando: string[] = [];

    for (const arquivo of arquivos) {
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        // ⚠️ EM QUALQUER POSIÇÃO DA LINHA, não só no começo dela.
        // A primeira versão desta régua exigia `^\s*revisionStatus:` e uma
        // "porta nova" de mutação passou verde por estar escrita em UMA linha
        // (`data: { revisionStatus: "quality_ok" }`). Régua que só pega o
        // formato bonitinho é régua que dá verde no componente errado.
        if (!/\brevisionStatus:/.test(linha)) return;
        // O que NÃO é escrita de veredito:
        //   `revisionStatus: true`      → projeção de `select`
        //   `revisionStatus: { ... }`   → filtro de `where`
        //   `revisionStatus: string`    → declaração de tipo
        //   `revisionStatus?:`          → campo opcional de interface
        if (/revisionStatus\s*\?:/.test(linha)) return;
        if (/revisionStatus:\s*(true|\{|string|number|boolean)\b/.test(linha)) return;
        // ── ESCREVER x PROCURAR ────────────────────────────────────────────
        // `where: { revisionStatus: "quality_flag" }` PROCURA peças barradas —
        // não afirma nada sobre nenhuma. Quem afirma é quem está dentro de um
        // `data:`. Na mesma linha, `data:` vence: um write compacto continua
        // sendo cobrado mesmo que o `where` esteja ali do lado.
        const antes = linha.slice(0, linha.indexOf("revisionStatus:"));
        const eFiltro = /\b(where|NOT|AND|OR|some|every|none|select|orderBy|by)\s*:/.test(antes);
        if (eFiltro && !/\bdata\s*:/.test(antes)) return;
        const vizinhanca = linhas.slice(i, i + JANELA).join("\n");
        if (DECLARA_QUEM_JULGOU.test(vizinhanca)) return;
        faltando.push(`${arquivo.replace(RAIZ + "/", "")}:${i + 1} → ${linha.trim()}`);
      });
    }

    expect(
      faltando,
      "Este write grava o VEREDITO da Qualidade e não diz QUEM julgou.\n"
      + "Valor medido e não persistido é o mesmo que não medido — foi assim que\n"
      + "o Farol 27 exibiu árbitro independente onde não havia nenhum.\n"
      + "Conserto: use `camposDaQualidade(veredito)` (julgamento de IA) ou\n"
      + "`camposDaDecisaoHumana(status, quem)` (decisão de gente pela tela).\n\n"
      + faltando.join("\n"),
    ).toEqual([]);
  });
});

// ── A QUARTA PALAVRA ────────────────────────────────────────────────────────
describe("decisão de gente tem nome próprio", () => {
  it("não é árbitro independente, não é autojulgado, não é ausência", async () => {
    const { camposDaDecisaoHumana, ARBITRAGEM_EM_PALAVRAS } =
      await import("@/lib/agency/execution/quality-auditor");
    const c = camposDaDecisaoHumana("quality_ok", "dono@casa.com");
    expect(c.qualityArbitragem).toBe("decisao_humana");
    expect(c.qualityArbitragem).not.toBe("arbitro_independente");
    // O prefixo impede a coluna de ser lida como nome de provedor de IA.
    expect(c.qualityArbiter).toBe("pessoa:dono@casa.com");
    // E a tela diz isso com todas as letras — sem a palavra "independente".
    expect(ARBITRAGEM_EM_PALAVRAS.decisao_humana).toMatch(/PESSOA/);
    expect(ARBITRAGEM_EM_PALAVRAS.decisao_humana).not.toMatch(/independente/);
  });

  it("as quatro palavras são quatro, e nenhuma se lê como outra", async () => {
    const { ARBITRAGEM_EM_PALAVRAS } = await import("@/lib/agency/execution/quality-auditor");
    const chaves = Object.keys(ARBITRAGEM_EM_PALAVRAS);
    expect(new Set(chaves).size).toBe(4);
    expect(new Set(Object.values(ARBITRAGEM_EM_PALAVRAS)).size).toBe(4);
  });

  it("só os TRÊS vereditos da Qualidade cobram declaração — `resolved` não afirma auditoria", async () => {
    const { eVereditoDaQualidade } = await import("@/lib/agency/execution/quality-auditor");
    for (const v of ["quality_ok", "quality_flag", "quality_nao_auditado"]) {
      expect(eVereditoDaQualidade(v)).toBe(true);
    }
    for (const v of ["revision_requested", "resolved", "none", "", null, undefined]) {
      expect(eVereditoDaQualidade(v)).toBe(false);
    }
  });
});
