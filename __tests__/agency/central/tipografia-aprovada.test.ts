// O PISO DE LEGIBILIDADE É CONTRATO, NÃO PREFERÊNCIA.
//
// A ÚNICA revisão de desenho que o CEO pediu sobre a Central de Trabalho foi
// aumentar as fontes de apoio. A versão publicada já traz a escala aprovada, e
// o contrato diz com todas as letras: "não reduza novamente a tipografia".
//
// Este arquivo transforma essa frase em trava. Ele calcula o tamanho EFETIVO
// de cada seletor — a última declaração vence, como na cascata — e reprova
// qualquer coisa abaixo do piso. Sem isto, a próxima pessoa que "compactar um
// pouquinho" desfaz a revisão sem que ninguém veja no diff.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(process.cwd(), "app/agency/dashboard/central.css"), "utf8");

/** O menor tamanho aprovado na revisão de legibilidade do CEO. */
const PISO_PX = 9;

/**
 * Tamanho efetivo por seletor: percorre o arquivo na ordem e guarda a última
 * declaração de `font-size` de cada um. É como o navegador resolve entre regras
 * de mesma especificidade, que é o caso aqui (tudo prefixado igual).
 */
function tamanhosEfetivos(css: string): Map<string, number> {
  const efetivo = new Map<string, number>();
  const regra = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = regra.exec(css))) {
    const seletores = m[1];
    const corpo = m[2];
    const fs = /font-size:\s*([\d.]+)px/.exec(corpo);
    if (!fs) continue;
    // `@media` e `@keyframes` entram como parte do seletor capturado; só
    // interessam as regras normais da tela.
    for (const s of seletores.split(",")) {
      const chave = s.trim().replace(/\s+/g, " ");
      if (!chave.includes(".central-de-trabalho")) continue;
      efetivo.set(chave, Number(fs[1]));
    }
  }
  return efetivo;
}

describe("tipografia aprovada da Central de Trabalho", () => {
  it("nenhum texto fica abaixo do piso de legibilidade", () => {
    const abaixo = [...tamanhosEfetivos(CSS)]
      .filter(([, px]) => px < PISO_PX)
      .map(([sel, px]) => `${sel} → ${px}px`);
    expect(
      abaixo,
      `estes seletores voltaram para abaixo de ${PISO_PX}px — a revisão do CEO foi desfeita:\n${abaixo.join("\n")}`,
    ).toEqual([]);
  });

  it("a revisão de legibilidade continua no arquivo", () => {
    // Amostra das linhas que o CEO aprovou. Se o bloco inteiro for removido,
    // os tamanhos base (7px, 6.4px) voltam a valer e o teste acima também cai —
    // este aqui existe para dizer POR QUE caiu.
    expect(CSS).toContain("Readability pass");
    for (const linha of [
      ".task-copy strong{font-size:12px}",
      ".client-name strong{font-size:13px}",
      ".page-heading p{font-size:13px}",
      ".hero-copy p{font-size:13px}",
      ".metrics-grid span{font-size:10px}",
      ".org-rule p{font-size:11px}",
    ]) {
      expect(CSS, `sumiu da revisão aprovada: ${linha}`).toContain(linha);
    }
  });

  it("o contrato visual está ESCOPADO — nada vaza para o resto do painel", () => {
    // `.message`, `.bar` e `.avatar` são nomes genéricos; soltos, atropelariam
    // o portal e outras telas da casa.
    const regras = CSS.match(/(^|\})\s*([^{}@]+)\{/g) ?? [];
    const soltas = regras
      .map((r) => r.replace(/^\}?\s*/, "").replace(/\{$/, "").trim())
      .filter((sel) => sel && !sel.startsWith("/*"))
      .flatMap((sel) => sel.split(","))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith(".central-de-trabalho") && !s.startsWith("from") && !s.startsWith("to") && !/^\d+%$/.test(s));
    expect(soltas, `regras fora do escopo .central-de-trabalho: ${soltas.join(" | ")}`).toEqual([]);
  });

  it("não redeclara variáveis do design system da casa", () => {
    // O protótipo declarava `--muted` e `--line` em `:root`. Os mesmos nomes
    // existem no produto com outros valores; herdados aqui, um componente
    // shadcn renderizado dentro da tela sairia com a cor errada.
    for (const proibida of ["--muted:", "--line:", "--navy:", "--cyan:"]) {
      const declara = new RegExp(`(^|[;{\\s])${proibida.replace("--", "--")}`, "m").test(CSS);
      expect(declara, `${proibida} não pode ser redeclarada — use --ct-*`).toBe(false);
    }
    expect(CSS).toContain("--ct-navy:");
  });
});
