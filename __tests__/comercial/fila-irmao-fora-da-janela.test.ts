// A FILA QUE NÃO ENXERGAVA O IRMÃO — teto de 200 corrigido (16/08/2026).
//
// `app/api/agency/leads/route.ts` lia no máximo 200 solicitações, e o
// agrupamento de repetições (`agruparPorProspect`) rodava só sobre essa
// janela. Um contato que já escreveu 6 vezes, cuja 6ª linha caísse fora das
// 200 mais recentes, aparecia como "5ª vez" — número completo com cara de
// certo, e errado.
//
// A correção é a JANELA CONFESSADA: `contarIrmaosPorChave` pergunta ao banco
// o total de verdade (sem teto), e `janelaDaRepeticao` cruza esse total com
// o que a janela já enxergava, dizendo com todas as letras quando não coube
// tudo. Este arquivo prova as duas metades:
//
//   1. `janelaDaRepeticao` (pura) — a confissão em si: o caso real, o caso
//      que não deve inventar aviso, o de uma vez só, e a falha que NUNCA
//      vira zero;
//   2. `contarIrmaosPorChave` (lê o banco) — chave nula não consulta nada, e
//      a contagem respeita a MESMA política de visibilidade da casa
//      ("meu OU órfão"), nunca uma segunda.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { janelaDaRepeticao } from "@/lib/agency/comercial/chave-do-prospect";

describe("janelaDaRepeticao — a confissão, pura", () => {
  it("⛔ O CASO REAL: irmãos fora da janela — totalNoBanco correto, aviso com todas as letras", () => {
    // A janela viu 2 (o contato e mais 1 irmão); o banco sabe que são 3.
    const j = janelaDaRepeticao({ irmaosVisiveis: 2, totalDoBanco: 3, contagemFalhou: false });
    expect(j.totalNoBanco).toBe(3);
    expect(j.irmaosVisiveis).toBe(2);
    expect(j.irmaosForaDaJanela).toBe(1);
    expect(j.aviso).not.toBeNull();
    expect(j.aviso).toMatch(/3ª vez/);
    expect(j.aviso).toMatch(/1 não cabe/);
    expect(j.contagemParcial).toBe(false);
  });

  it("⛔ plural correto quando mais de um irmão fica de fora", () => {
    const j = janelaDaRepeticao({ irmaosVisiveis: 2, totalDoBanco: 5, contagemFalhou: false });
    expect(j.irmaosForaDaJanela).toBe(3);
    expect(j.aviso).toMatch(/3 não cabem/);
  });

  it("✅ NÃO INVENTA: todos os irmãos estão dentro da janela — zero, sem aviso", () => {
    const j = janelaDaRepeticao({ irmaosVisiveis: 3, totalDoBanco: 3, contagemFalhou: false });
    expect(j.irmaosForaDaJanela).toBe(0);
    expect(j.aviso).toBeNull();
    expect(j.totalNoBanco).toBe(3);
  });

  it("✅ contato de uma vez só continua sendo uma vez só", () => {
    const j = janelaDaRepeticao({ irmaosVisiveis: 1, totalDoBanco: 1, contagemFalhou: false });
    expect(j.totalNoBanco).toBe(1);
    expect(j.irmaosForaDaJanela).toBe(0);
    expect(j.aviso).toBeNull();
    expect(j.contagemParcial).toBe(false);
  });

  it("⛔ falha na contagem: cai para a janela, MARCA parcial, nunca vira zero nem \"1ª vez\"", () => {
    // `totalDoBanco: undefined` é o que a rota passa quando a consulta
    // lançou — nunca um zero, nunca `irmaosVisiveis` forçado a 1.
    const j = janelaDaRepeticao({ irmaosVisiveis: 3, totalDoBanco: undefined, contagemFalhou: true });
    expect(j.totalNoBanco).toBe(3); // cai para o que a janela já sabia — não é zero
    expect(j.irmaosVisiveis).toBe(3);
    expect(j.irmaosForaDaJanela).toBe(0);
    expect(j.aviso).toBeNull(); // não inventa aviso sobre o que não sabe
    expect(j.contagemParcial).toBe(true); // e DECLARA que é parcial
  });

  it("linha sem coluna gravada (legada) não é 'falha' — cai para a janela sem marcar parcial", () => {
    // `contagemFalhou: false` (a consulta rodou normalmente) e
    // `totalDoBanco: undefined` porque a linha não tinha `chaveDoProspect`
    // gravada — o limite conhecido e declarado da frente de hoje, não um erro.
    const j = janelaDaRepeticao({ irmaosVisiveis: 2, totalDoBanco: undefined, contagemFalhou: false });
    expect(j.totalNoBanco).toBe(2);
    expect(j.contagemParcial).toBe(false);
  });

  it("defesa: banco nunca pode dizer menos do que a própria janela já viu", () => {
    // Não deveria acontecer (o total do banco inclui a janela), mas se
    // acontecer, a janela vence — é o dado mais recente e mais certo.
    const j = janelaDaRepeticao({ irmaosVisiveis: 4, totalDoBanco: 2, contagemFalhou: false });
    expect(j.totalNoBanco).toBe(4);
    expect(j.irmaosForaDaJanela).toBe(0);
    expect(j.aviso).toBeNull();
  });
});

// ── contarIrmaosPorChave — lê o banco, respeita a política única ───────────

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn() },
  client: { findMany: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { contarIrmaosPorChave } from "@/lib/agency/persistence/client-request-service";

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findMany.mockResolvedValue([]);
  db.agencyWorkspace.findMany.mockResolvedValue([]);
});

describe("contarIrmaosPorChave — chave nula não consulta nada", () => {
  it("✅ lista só de nulos/vazios/indefinidos NUNCA vai ao banco", async () => {
    const r = await contarIrmaosPorChave({
      workspaceId: "ws1",
      chaves: [null, undefined, "", "   "],
    });
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
    expect(r.size).toBe(0);
  });

  it("✅ chaves nulas são descartadas mesmo misturadas com chaves válidas", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      { chaveDoProspect: "email:a@x.com", workspaceId: "ws1", clientId: null },
    ]);
    await contarIrmaosPorChave({ workspaceId: "ws1", chaves: [null, "email:a@x.com", "", undefined] });
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.chaveDoProspect.in).toEqual(["email:a@x.com"]);
  });
});

describe("contarIrmaosPorChave — conta de verdade, sem teto", () => {
  it("soma todas as linhas do workspace com aquela chave, mesmo além de 200", async () => {
    const muitas = Array.from({ length: 6 }, () => ({
      chaveDoProspect: "email:camila@beauty.com.br",
      workspaceId: "ws1",
      clientId: null,
    }));
    db.clientRequestDb.findMany.mockResolvedValue(muitas);
    const r = await contarIrmaosPorChave({ workspaceId: "ws1", chaves: ["email:camila@beauty.com.br"] });
    expect(r.get("email:camila@beauty.com.br")).toBe(6);
  });

  it("chaves distintas repetidas na entrada não distorcem a consulta", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      { chaveDoProspect: "email:a@x.com", workspaceId: "ws1", clientId: null },
    ]);
    await contarIrmaosPorChave({
      workspaceId: "ws1",
      chaves: ["email:a@x.com", "email:a@x.com", "email:a@x.com"],
    });
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.chaveDoProspect.in).toEqual(["email:a@x.com"]);
  });
});

describe("contarIrmaosPorChave — MESMA política de visibilidade, não uma segunda", () => {
  it("a consulta filtra 'meu OU órfão' no where, igual a listClientRequests", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await contarIrmaosPorChave({ workspaceId: "ws1", chaves: ["email:a@x.com"] });
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual([{ workspaceId: "ws1" }, { workspaceId: null }]);
  });

  it("órfã (workspaceId nulo) com cliente de OUTRO workspace não conta para mim", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      { chaveDoProspect: "email:a@x.com", workspaceId: null, clientId: "cli-do-vizinho" },
    ]);
    // `apenasDoWorkspace` resolve o dono do cliente órfão consultando `Client`.
    db.client.findMany.mockResolvedValue([]); // cliente não é meu
    const r = await contarIrmaosPorChave({ workspaceId: "ws1", chaves: ["email:a@x.com"] });
    expect(r.get("email:a@x.com") ?? 0).toBe(0);
  });

  it("linha de outro workspace (não órfã) nunca aparece na contagem, mesmo que a mock a devolva", async () => {
    // Defesa: mesmo que o `where` já devesse ter filtrado, `apenasDoWorkspace`
    // é a segunda barreira — não confia cegamente no que voltou.
    db.clientRequestDb.findMany.mockResolvedValue([
      { chaveDoProspect: "email:a@x.com", workspaceId: "ws2", clientId: null },
    ]);
    const r = await contarIrmaosPorChave({ workspaceId: "ws1", chaves: ["email:a@x.com"] });
    expect(r.get("email:a@x.com") ?? 0).toBe(0);
  });
});

describe("contarIrmaosPorChave — sem status no filtro", () => {
  it("o where nunca inclui `status` — briefing que virou projeto continua contando", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await contarIrmaosPorChave({ workspaceId: "ws1", chaves: ["email:a@x.com"] });
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.status).toBeUndefined();
  });
});
