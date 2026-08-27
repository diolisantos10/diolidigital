// A PORTA DE ENTRADA DA ISENÇÃO — e as travas que a impedem de escancarar.
//
// O portão de pagamento LIA `IsencaoDeParceria` desde #356 e nada no
// repositório a ESCREVIA. Este arquivo prova a porta nova e, principalmente,
// prova que ela recusa: uma porta de "liberar produção de graça" que aceita
// campo vazio não é porta, é buraco.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn() },
  isencaoDeParceria: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { concederIsencaoDeParceria } = await import("@/lib/agency/financeiro/conceder-isencao");

const AGORA = new Date("2026-08-27T03:00:00.000Z");
const VALIDO = new Date("2026-11-27T00:00:00.000Z");

/** O pedido do cliente 001, com todos os campos preenchidos como devem ser. */
function bom(over: Record<string, unknown> = {}) {
  return {
    clientRequestId: "req_foocci",
    autorizadaPor: "Dioli Santos (CEO)",
    validaAte: VALIDO,
    escopo: "Social Media — parceria de lançamento, cliente 001",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 200,
    ...over,
  } as Parameters<typeof concederIsencaoDeParceria>[0];
}

beforeEach(() => {
  db.clientRequestDb.findUnique.mockReset();
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "req_foocci" });
  db.isencaoDeParceria.create.mockReset();
  db.isencaoDeParceria.create.mockResolvedValue({ id: "isen_1", validaAte: VALIDO });
});

describe("a porta existe e concede o que deve", () => {
  it("concede com todos os campos preenchidos", async () => {
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok).toBe(true);
    expect(db.isencaoDeParceria.create).toHaveBeenCalledTimes(1);
  });

  it("grava exatamente o que foi autorizado — nada de padrão inventado", async () => {
    await concederIsencaoDeParceria(bom(), AGORA);
    const data = db.isencaoDeParceria.create.mock.calls[0][0].data;
    expect(data.autorizadaPor).toBe("Dioli Santos (CEO)");
    expect(data.tetoDeIaCentavosUsd).toBe(200);
    expect(data.pecasContratadas).toBe(12);
    expect(data.validaAte).toEqual(VALIDO);
  });

  it("NÃO encosta em PagamentoConfirmado — parceria não é receita", async () => {
    await concederIsencaoDeParceria(bom(), AGORA);
    expect(JSON.stringify(db.isencaoDeParceria.create.mock.calls[0][0])).not.toMatch(/pagamento|valorCentavos/i);
  });

  it("zero é ZERO e é aceito — é uma decisão, não uma ausência", async () => {
    const r = await concederIsencaoDeParceria(bom({ pecasContratadas: 0, tetoDeIaCentavosUsd: 0 }), AGORA);
    expect(r.ok).toBe(true);
  });
});

describe("as travas — cada recusa com nome próprio, e NADA escrito", () => {
  const casos: [string, Record<string, unknown>, string][] = [
    ["isenção sem dono é buraco",            { autorizadaPor: "" },        "sem_dono"],
    ["dono em branco não é nome de gente",   { autorizadaPor: "   " },     "sem_dono"],
    ["isenção sem escopo cobre tudo",        { escopo: "" },               "sem_escopo"],
    ["sem pedido não isenta nada",           { clientRequestId: "" },      "sem_pedido"],
    ["validade ilegível NÃO vale para sempre", { validaAte: "não é data" }, "validade_ilegivel"],
    ["isenção nascida vencida",              { validaAte: new Date("2026-01-01") }, "validade_no_passado"],
    ["teto negativo",                        { tetoDeIaCentavosUsd: -1 },  "teto_invalido"],
    ["teto fracionário",                     { tetoDeIaCentavosUsd: 1.5 }, "teto_invalido"],
    ["teto NaN — ausência disfarçada",       { tetoDeIaCentavosUsd: NaN }, "teto_invalido"],
    ["peças negativas",                      { pecasContratadas: -3 },     "pecas_invalidas"],
  ];

  for (const [nome, over, recusa] of casos) {
    it(`recusa: ${nome}`, async () => {
      const r = await concederIsencaoDeParceria(bom(over), AGORA);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.recusa).toBe(recusa);
      // A trava vale pouco se ela recusa DEPOIS de escrever.
      expect(db.isencaoDeParceria.create).not.toHaveBeenCalled();
    });
  }

  it("NENHUM campo obrigatório tem valor padrão — cada omissão é uma recusa", async () => {
    for (const campo of ["autorizadaPor", "escopo", "validaAte", "pecasContratadas", "tetoDeIaCentavosUsd"]) {
      db.isencaoDeParceria.create.mockClear();
      const r = await concederIsencaoDeParceria(bom({ [campo]: undefined }), AGORA);
      expect(r.ok, `campo ${campo} ganhou um padrão em vez de recusar`).toBe(false);
      expect(db.isencaoDeParceria.create).not.toHaveBeenCalled();
    }
  });
});

describe("isenção órfã e concessão dupla", () => {
  it("pedido inexistente é recusa — isenção órfã é produção de graça sem dono", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok === false && r.recusa).toBe("pedido_inexistente");
    expect(db.isencaoDeParceria.create).not.toHaveBeenCalled();
  });

  it("leitura que falha é RECUSA, nunca liberação", async () => {
    db.clientRequestDb.findUnique.mockRejectedValue(new Error("banco fora"));
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.recusa).toBe("leitura_indisponivel");
  });

  it("a segunda concessão para o mesmo pedido é recusa com nome, não erro cru", async () => {
    db.isencaoDeParceria.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`clientRequestId`)"));
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok === false && r.recusa).toBe("ja_existe");
    expect(r.ok === false && r.motivo).toMatch(/renovar é outro ato/i);
  });
});
