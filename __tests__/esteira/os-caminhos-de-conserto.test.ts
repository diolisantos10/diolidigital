// OS DOIS CAMINHOS DE CONSERTO ERAM OS MENOS GUARDADOS DA CASA.
//
// O quadro, antes:
//
//   motor                     contrato   piso   auditoria
//   run-execution.ts:560         ✅       ✅       ✅
//   producao-de-pedido.ts:256    ✅       ✅       ✅
//   refacao.ts:320               ❌       ✅       ❌ (por decisão)
//   pacote-travado.ts:152        ❌       ❌       ✅
//
// `pacote-travado.ts` refaz EXATAMENTE as peças que a Qualidade reprovou e era
// **o único que não conferia dado inventado**. O modelo recebia "a Qualidade
// reprovou, refaça", podia trocar um problema de tom por um preço ou um
// telefone que a agência não sustenta, e isso ia direto para o `Deliverable` —
// porque o árbitro que roda logo abaixo julga tom e aderência, não dado.
//
// E os dois caminhos de conserto podiam ENCOLHER a peça: o modelo que recebe
// "refaça corrigindo" costuma devolver menos itens do que tinha. O piso aprova
// (nada foi inventado), o árbitro aprova (o tom está bom), e o cliente recebe
// um terço do que comprou.
//
// ── O que este arquivo NÃO cobra, e por quê ────────────────────────────────
//
// A auditoria em `refacao.ts`. Aquela ausência é DECIDIDA, com o argumento
// escrito no próprio arquivo: ali o árbitro é o CLIENTE, que pediu a mudança
// com as palavras dele. Um auditor que reprovasse o que ele pediu colocaria a
// máquina contra o dono do briefing. E o estado não mente: a peça é gravada
// como `nao_auditado`, não como aprovada. Mudar isso é decisão de produto, não
// conserto — está no relatório, não no código.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const fonte = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MOTORES = {
  "run-execution": "lib/agency/execution/run-execution.ts",
  "producao-de-pedido": "lib/agency/esteira/producao-de-pedido.ts",
  "refacao": "lib/agency/esteira/refacao.ts",
  "pacote-travado": "lib/agency/esteira/pacote-travado.ts",
} as const;

describe("⭐ os QUATRO motores conferem o contrato de saída", () => {
  for (const [nome, arquivo] of Object.entries(MOTORES)) {
    it(`${nome}: a peça não pode ENCOLHER sem ninguém ver`, () => {
      const s = fonte(arquivo);
      expect(
        s.includes("conferirContrato("),
        `${nome} grava a peça sem conferir a contagem — "o cliente mandou" vale para o conteúdo, não para receber menos`,
      ).toBe(true);
    });
  }
});

describe("⭐ os QUATRO motores conferem dado inventado", () => {
  for (const [nome, arquivo] of Object.entries(MOTORES)) {
    it(`${nome}: nenhuma peça é gravada sem passar pelo piso de verdade`, () => {
      const s = fonte(arquivo);
      expect(
        s.includes("conferirPisoDeVerdade("),
        `${nome} grava a peça sem conferir preço, prazo, telefone e proibição do cliente`,
      ).toBe(true);
    });

    it(`${nome}: o piso recebe as PROIBIÇÕES do cliente, e a leitura é fail-closed`, () => {
      // Verdade montada sem `proibicoes` faz `conferirProibicoes` devolver `[]`
      // — "não se aplica a este caminho". Num motor que reescreve peça a pedido
      // de quem reclamou, isso é a checagem sumindo justamente onde ela pesa.
      const s = fonte(arquivo);
      expect(s.includes("lerProibicoes("), `${nome} monta a verdade sem a metade NEGATIVA`).toBe(true);
      expect(s.includes("proibicoes:"), `${nome} lê as proibições e não as entrega ao piso`).toBe(true);
    });
  }
});

describe("no conserto do pacote, a peça barrada NÃO é gravada", () => {
  const s = fonte("lib/agency/esteira/pacote-travado.ts");

  it("os dois freios rodam ANTES de `preservarVersaoAtual`", () => {
    // A ordem é a trava: preservar e gravar antes de conferir colocaria a
    // invenção no lugar do original, e o original é o que o cliente ainda tem.
    const iContrato = s.indexOf("conferirContrato(");
    const iPiso = s.indexOf("conferirPisoDeVerdade(");
    const iPreservar = s.indexOf("preservarVersaoAtual(");
    expect(iContrato).toBeGreaterThan(-1);
    expect(iPiso).toBeGreaterThan(-1);
    expect(iContrato, "o contrato roda depois de a peça já ter sido preservada").toBeLessThan(iPreservar);
    expect(iPiso, "o piso roda depois de a peça já ter sido preservada").toBeLessThan(iPreservar);
  });

  it("a recusa deixa rastro COM o motivo — alerta sem evidência ninguém investiga", () => {
    expect(s).toContain("refacao_barrada_no_conserto");
    const i = s.indexOf("async function registrarRecusa");
    expect(s.slice(i, i + 900)).toContain("motivo");
  });

  it("a peça barrada conta como PERSISTENTE — ela não some da fila", () => {
    // Sumir seria pior que barrar: o pacote continuaria travado e ninguém
    // saberia que existe algo a decidir.
    const i = s.indexOf("conferirPisoDeVerdade(");
    expect(s.slice(i, i + 400)).toContain("saida.persistentes.push");
  });
});

describe("na refação, o contrato não vira reprovação silenciosa", () => {
  const s = fonte("lib/agency/esteira/refacao.ts");

  it("encolheu, ESCALA com o motivo — a versão que o cliente vê fica de pé", () => {
    const i = s.indexOf("conferirContrato(");
    const trecho = s.slice(i, i + 500);
    expect(trecho).toContain("saida.escalado = true");
    expect(trecho).toContain("saida.motivo");
    // E não grava: `deliverable.update` não pode aparecer antes do `continue`.
    expect(trecho.slice(0, trecho.indexOf("continue;")).includes("deliverable.update")).toBe(false);
  });

  it("a ausência de AUDITOR aqui continua sendo declarada, não escondida", () => {
    // O estado não mente: a peça é gravada como `nao_auditado`. Se alguém
    // trocar isso por `aprovado` sem chamar um juiz, a porta dos fundos que a
    // auditoria de 04/08 fechou volta a existir.
    expect(s).toContain('revisionStatusDoVeredito("nao_auditado")');
    expect(s.includes('revisionStatusDoVeredito("aprovado")'), "a refação voltou a se declarar aprovada sem juiz").toBe(false);
  });
});
