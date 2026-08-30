// O DESTRAVADOR ENXERGA O PROJETO QUE QUEBROU — 25/08/2026.
//
// ─── O ACHADO: DOIS INSTRUMENTOS DA MESMA CASA DISCORDANDO ──────────────────
//
// Medido em produção, na mesma hora, com a conta master:
//
//   GET /api/diretor/pendencias  → 6 entregas em `quality_flag`, paradas 22–25h
//                                  "Confira se a refação automática travou."
//   GET /api/pacotes-travados    → {"total":0,"aguardandoDecisao":0}
//   GET /api/pulso               → destravadas: 0, em todas as batidas
//
// O destravador não estava falhando. Ele não estava VENDO. `pacotesTravados()`
// exigia `executionStatus: "done"`, e os dois projetos com as 6 entregas
// reprovadas estavam em `executionStatus: "blocked"` com `executionAttempts: 3`.
//
// A rede de segurança só resgatava o projeto cuja execução terminou BEM. O que
// quebrou — o que precisa de resgate — era invisível para sempre.
//
// A suíte inteira ficou verde antes E depois do conserto: não havia régua sobre
// esta consulta. Este arquivo é a régua, e ela reprova a volta do defeito.

import { describe, it, expect, beforeEach, vi } from "vitest";

/** O formato do argumento que `pacotesTravados` manda ao banco. Tipado porque
 *  é exatamente ele que este arquivo mede. */
type ConsultaDePacotes = { where: Record<string, unknown> };

const db = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(async (_consulta: { where: Record<string, unknown> }): Promise<never[]> => []),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { pacotesTravados, EXECUCOES_QUE_PODEM_ESTAR_TRAVADAS } = await import(
  "@/lib/agency/esteira/pacote-travado"
);

/** O `where` que a consulta montou. É ele — e não o resultado — que decide
 *  quais projetos a casa consegue enxergar. */
function whereDaConsulta() {
  const chamadas = db.project.findMany.mock.calls;
  expect(chamadas.length, "a consulta nem chegou ao banco").toBeGreaterThan(0);
  return (chamadas[chamadas.length - 1]![0] as ConsultaDePacotes).where;
}

beforeEach(() => vi.clearAllMocks());

describe("a consulta do destravador alcança o projeto BLOQUEADO", () => {
  it("⛔ `blocked` está entre os estados procurados — era o defeito de 25/08", async () => {
    await pacotesTravados();
    const estados = (whereDaConsulta().executionStatus as { in: string[] }).in;
    expect(
      estados,
      "o destravador voltou a só enxergar o projeto que terminou bem — o que quebrou fica invisível",
    ).toContain("blocked");
    // E `done` continua: o projeto que terminou bem e tem peça reprovada
    // também é um pacote travado. O conserto não podia trocar uma cegueira
    // por outra.
    expect(estados).toContain("done");
    expect([...EXECUCOES_QUE_PODEM_ESTAR_TRAVADAS].sort()).toEqual(["blocked", "done"]);
  });

  it("a peça que o cliente JÁ VIU continua fora do alcance automático", async () => {
    // Guarda deliberado, não esquecimento: trocar por baixo uma versão que o
    // cliente aprovou ou comentou é a casa mudando o que ela mesma apresentou.
    // Fica com gente, e aparece em /api/diretor/pendencias para isso.
    await pacotesTravados();
    expect(whereDaConsulta().presentedAt).toBeNull();
  });

  it("a consulta continua exigindo entrega BARRADA — não varre projeto são", async () => {
    await pacotesTravados();
    // 26/08/2026: passou a alcançar TAMBÉM a peça que ninguém auditou. O pacote
    // parado por ausência de juiz é tão travado quanto o parado por reprovação
    // (ver `__tests__/esteira/pacote-sem-arbitro-nao-some.test.ts`) — e a régua
    // continua exigindo UM DOS DOIS estados, para não varrer projeto são.
    expect(whereDaConsulta().deliverables).toEqual({
      some: { revisionStatus: { in: ["quality_flag", "quality_nao_auditado"] } },
    });
  });

  it("o recorte por workspace continua valendo quando é pedido", async () => {
    await pacotesTravados("ws1");
    expect(whereDaConsulta().workspaceId).toBe("ws1");
  });
});
