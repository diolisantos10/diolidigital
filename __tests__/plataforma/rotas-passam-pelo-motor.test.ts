// NENHUMA ROTA DE AGENTE FALA COM O PROVEDOR DIRETO — e a trava é de código.
//
// O que estava aberto: as 6 rotas de `app/api/agents/*` montavam o `fetch` para
// `api.anthropic.com` na mão, com o provedor "claude" escrito no arquivo. Elas
// funcionavam — e por isso ninguém reparava no que se perdia:
//
//   1. A CONTA. Nenhuma delas gravava `AIRunLog`. O gasto existia na fatura da
//      Anthropic e não existia no relatório da casa. "Quanto custou este
//      cliente" respondia menos que a verdade, e a diferença crescia sozinha.
//   2. A ESCOLHA DE PROVEDOR POR CLIENTE. `ClientAiProvider` é a tela onde se
//      fixa o provedor de um cliente. Estas rotas ignoravam a fixação: o
//      cliente preso no Gemini era atendido pelo Claude assim mesmo.
//   3. A RESERVA. Claude fora do ar derrubava a rota, com as outras chaves
//      conectadas paradas do lado.
//
// Consertar as 6 é metade do trabalho. A outra metade é ESTA: a 7ª rota, escrita
// daqui a um mês por quem não leu nada disto, tem de esbarrar em alguma coisa.
// Sem este teste, o conserto dura até o próximo `fetch` copiado e colado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const RAIZ = resolve(__dirname, "../..");

function rotasEm(dir: string): string[] {
  const achadas: string[] = [];
  const caminhar = (d: string) => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) caminhar(p);
      else if (nome === "route.ts") achadas.push(p);
    }
  };
  caminhar(resolve(RAIZ, dir));
  return achadas;
}

/** O código, sem os comentários — que é onde o incidente fica CONTADO. Um teste
 *  que lesse os comentários proibiria explicar o próprio conserto. */
function codigoSemComentarios(arquivo: string): string {
  return readFileSync(arquivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ROTAS_DE_AGENTE = rotasEm("app/api/agents");

describe("⛔ METADE 1 — rota de agente não fala com provedor direto", () => {
  it("achou as 6 rotas (senão o teste está varrendo o vazio e passa por engano)", () => {
    expect(ROTAS_DE_AGENTE.length).toBe(6);
  });

  it.each(ROTAS_DE_AGENTE)("%s não tem URL de provedor nem chave crua", (arquivo) => {
    const codigo = codigoSemComentarios(arquivo);
    expect(codigo, "URL de provedor no código").not.toMatch(
      /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/,
    );
    // `resolveProviderKey` devolve a CHAVE em texto. Quem a pede está montando
    // a chamada por fora do motor — que é exatamente o desvio.
    expect(codigo, "pegou a chave crua para chamar por fora").not.toMatch(/resolveProviderKey/);
    expect(codigo, "x-api-key só existe em quem chama o provedor na mão").not.toMatch(/x-api-key/);
  });
});

describe("✅ METADE 2 — elas passam pelo motor, e com dono", () => {
  // Sem esta metade, "não chama o provedor" seria satisfeito por uma rota que
  // não chama IA nenhuma. A trava tem de exigir o caminho CERTO, não só proibir
  // o errado.
  it.each(ROTAS_DE_AGENTE)("%s usa lib/ai/generate", (arquivo) => {
    const codigo = codigoSemComentarios(arquivo);
    expect(codigo).toMatch(/from "@\/lib\/ai\/generate"/);
    expect(codigo).toMatch(/generate\(\{/);
  });

  it.each(ROTAS_DE_AGENTE)("%s manda workspaceId e departmentId — gasto sem dono não entra na conta", (arquivo) => {
    const codigo = codigoSemComentarios(arquivo);
    // `workspaceId` é o que faz o motor REGISTRAR: sem ele a chamada sai da
    // contabilidade e só avisa no log do processo.
    expect(codigo, "sem workspaceId o custo não é registrado").toMatch(/workspaceId:/);
    expect(codigo, "sem departmentId o custo não tem departamento").toMatch(/departmentId:/);
  });
});
