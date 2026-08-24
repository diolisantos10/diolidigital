// `olharCI` é ONDE a mentira nascia.
//
// O veredito nunca esteve errado — errado estava o que chegava até ele. Quando
// a rede falhava, esta função devolvia `houveRun: false`, exatamente o mesmo
// que devolveria se o GitHub tivesse respondido "não há run". A partir dali
// nenhuma camada rio abaixo tinha como distinguir, porque o fato já tinha sido
// destruído na origem.
//
// Estes testes prendem a origem. Sem eles, alguém "simplifica" o `mudo()` de
// volta para `vazio` e a distinção some sem quebrar nada em cima.

import { afterEach, describe, expect, it, vi } from "vitest";
import { olharCI } from "@/lib/plataforma/consulta-de-ci";
import { julgarProva } from "@/lib/plataforma/sentinela-do-deploy";

const SHA = "274bd18be0748bb332eda03a8a4d309f4187e53a";
const DE_PE = { actionsOperacional: true, incidente: null };

afterEach(() => vi.unstubAllGlobals());

/** Uma resposta de `fetch` só com o que estas funções leem. */
function resposta(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

describe("olharCI separa 'o GitHub disse que não' de 'não consegui perguntar'", () => {
  it("GitHub respondeu com lista vazia → é RESPOSTA: houveRun false, sem perguntaFalhou", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, { workflow_runs: [] })));

    const ci = await olharCI(SHA);

    expect(ci.houveRun).toBe(false);
    // O ponto: isto é um fato apurado, e por isso NÃO carrega a marca do mudo.
    expect(ci.perguntaFalhou).toBeFalsy();
    expect(julgarProva({ ci, plataforma: DE_PE }).codigo).toBe("SEM_PROVA");
  });

  it("a rede caiu → perguntaFalhou, e o veredito muda de código", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const ci = await olharCI(SHA);

    expect(ci.perguntaFalhou).toBe(true);
    expect(ci.motivoDaFalha).toMatch(/TypeError/);
    // ESTA É A MUTAÇÃO QUE O TESTE MATA: devolver `houveRun: false` puro aqui
    // (o comportamento antigo) faz este código virar SEM_PROVA e a tela voltar
    // a dizer "nenhum run foi criado" para um commit que pode estar verde.
    expect(julgarProva({ ci, plataforma: DE_PE }).codigo).toBe("SEM_RESPOSTA_DO_GITHUB");
  });

  it("limite de requisições (403) é 'não consegui perguntar', não 'não há CI'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(403, {})));

    const ci = await olharCI(SHA);

    expect(ci.perguntaFalhou).toBe(true);
    // Status de erro não é motivo — mas ele entra na mensagem para quem for
    // investigar não começar do zero.
    expect(ci.motivoDaFalha).toMatch(/403/);
  });

  it("tempo esgotado sai por extenso, não como 'AbortError'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }),
    );

    expect((await olharCI(SHA)).motivoDaFalha).toMatch(/tempo esgotado/);
  });

  it("o motivo NUNCA carrega o token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_segredo_que_nao_pode_vazar");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED com Authorization: Bearer ghp_segredo_que_nao_pode_vazar");
      }),
    );

    const ci = await olharCI(SHA);

    expect(ci.perguntaFalhou).toBe(true);
    // Mensagem de erro é por onde segredo vaza. Só o NOME do erro sai.
    expect(ci.motivoDaFalha ?? "").not.toMatch(/ghp_/);
  });
});
