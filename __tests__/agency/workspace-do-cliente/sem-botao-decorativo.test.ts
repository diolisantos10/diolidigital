// O CINTO DE SEGURANÇA DO BOTÃO DECORATIVO.
//
// O contrato: "todos os botões devem funcionar, abrir uma interação real ou
// aparecer desabilitados com motivo. Nenhum botão decorativo."
//
// A primeira trava é o TIPO: `<Acao>` tem união de três membros — `onClick`,
// `href` ou `indisponivel` — e não existe um quarto. Não dá para compilar um
// `<Acao>` que não faz nada.
//
// Só que `<button>` cru continua existindo no JSX, e é por ali que o defeito
// volta. Guardrail 4 da casa: prompt é aviso, código é trava — e um tipo que
// se contorna escrevendo outra tag é meio tipo. Este arquivo é a outra metade.
//
// ── POR QUE ISTO NÃO É PREGUIÇA DE REVISOR ──────────────────────────────
// O porte anterior deste painel tinha dezenove `<button type="button">` sem
// `onClick`: "Capacidade da equipe", "＋ Nova peça", "Gerar análise", "Aplicar
// recomendação →". Nenhum era feio. Todos eram mentira: o operador clica, nada
// acontece, e ele conclui que o sistema travou — e para de confiar no resto da
// tela, inclusive no que funciona.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "components/agency/clients/workspace");

const ARQUIVOS = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ nome: f, fonte: fs.readFileSync(path.join(DIR, f), "utf8") }));

/** Tira os comentários antes de varrer. O cabeçalho de `primitives.tsx` CITA
 *  um `<button type="button">` mudo para contar de onde veio a regra — e essa
 *  citação não é um botão na tela. Contá-la faria o teste exigir que a
 *  explicação do defeito fosse apagada, que é o oposto do que se quer. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Toda abertura de `<button ...>` do arquivo, com os atributos dela. */
function botoes(fonte: string): string[] {
  return semComentarios(fonte).match(/<button[^>]*>/g) ?? [];
}

/** Um botão é honesto quando faz alguma coisa (`onClick`), quando está
 *  desligado com motivo (`disabled` + `title`), ou quando é o próprio
 *  primitivo montando um dos dois. */
function ehHonesto(tag: string): boolean {
  if (tag.includes("onClick")) return true;
  if (tag.includes("disabled") && tag.includes("title")) return true;
  // O `<button>` dentro de `primitives.tsx` recebe o handler por props — a
  // linha `onClick={props.onClick}` conta, e ela cai no primeiro caso.
  return false;
}

describe("nenhum botão decorativo no workspace do cliente", () => {
  it("há botões para inspecionar — teste que não vê nada passa por engano", () => {
    const total = ARQUIVOS.reduce((n, a) => n + botoes(a.fonte).length, 0);
    expect(total).toBeGreaterThan(10);
  });

  for (const a of ARQUIVOS) {
    it(`${a.nome} — todo <button> faz algo ou está desabilitado com motivo`, () => {
      const mudos = botoes(a.fonte).filter((t) => !ehHonesto(t));
      expect(mudos, `botões sem efeito em ${a.nome}:\n${mudos.join("\n")}`).toEqual([]);
    });
  }

  it("o primitivo `Acao` tem exatamente três caminhos, e nenhum é 'nada'", () => {
    const prim = ARQUIVOS.find((a) => a.nome === "primitives.tsx")!.fonte;
    expect(prim).toContain("onClick: () => void; href?: never; indisponivel?: never");
    expect(prim).toContain("href: string; onClick?: never; indisponivel?: never");
    expect(prim).toContain("indisponivel: string; onClick?: never; href?: never");
  });

  it("o motivo do botão desligado aparece na TELA, não só no tooltip", () => {
    // Tooltip não existe no celular e não é lido por todo leitor de tela. Um
    // botão cinza sem explicação é a mesma frustração do botão morto, com um
    // passo a mais.
    const prim = ARQUIVOS.find((a) => a.nome === "primitives.tsx")!.fonte;
    expect(prim).toContain('className="motivoIndisponivel"');
  });

  it("`Head` não desenha ação sem destino — era por aí que o botão morto entrava", () => {
    const prim = ARQUIVOS.find((a) => a.nome === "primitives.tsx")!.fonte;
    // O tipo do `action` do `Head` é o próprio `AcaoProps`: rótulo sozinho não
    // compila mais.
    expect(prim).toMatch(/action\?:\s*Omit<AcaoProps, "children">/);
  });

  it("`EmptyBlock` com ação sem destino não desenha botão nenhum", () => {
    const prim = ARQUIVOS.find((a) => a.nome === "primitives.tsx")!.fonte;
    expect(prim).toContain("{action && !acaoIndisponivel && !href && onAction && (");
  });
});
