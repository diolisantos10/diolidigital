// A PORTA DE ENTRADA DA ISENÇÃO — e as travas que a impedem de escancarar.
//
// O portão de pagamento LIA `IsencaoDeParceria` desde #356 e nada no
// repositório a ESCREVIA. Este arquivo prova a porta nova e, principalmente,
// prova que ela recusa: uma porta de "liberar produção de graça" que aceita
// campo vazio não é porta, é buraco.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn() },
  isencaoDeParceria: { create: vi.fn(), findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
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
  db.isencaoDeParceria.findUnique.mockReset().mockResolvedValue(null);
  db.$executeRawUnsafe.mockReset().mockResolvedValue(1);
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

  it("uma segunda LINHA nunca nasce — a unicidade é do banco, e é ela que garante", async () => {
    db.isencaoDeParceria.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`clientRequestId`)"));
    await concederIsencaoDeParceria(bom(), AGORA);
    expect(db.isencaoDeParceria.create).toHaveBeenCalledTimes(1);
  });
});

describe("idempotência — e ela é PRECISA, não um 'ok' genérico", () => {
  const existente = {
    id: "isen_1",
    validaAte: VALIDO,
    escopo: "Social Media — parceria de lançamento, cliente 001",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 200,
    autorizadaPor: "Dioli Santos (CEO)",
  };

  function jaExiste(over: Record<string, unknown> = {}) {
    db.isencaoDeParceria.create.mockRejectedValue(new Error("Unique constraint failed"));
    db.isencaoDeParceria.findUnique.mockResolvedValue({ ...existente, ...over });
  }

  it("MESMOS termos repetidos: sucesso, e diz que já existia", async () => {
    jaExiste();
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.jaExistia).toBe(true);
    expect(r.ok === true && r.id).toBe("isen_1");
  });

  it("o operador que clica duas vezes NÃO recebe erro — erro aqui empurra para o contorno", async () => {
    jaExiste();
    const primeira = await concederIsencaoDeParceria(bom(), AGORA);
    const segunda = await concederIsencaoDeParceria(bom(), AGORA);
    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(true);
  });

  const diferentes: [string, Record<string, unknown>][] = [
    ["outra validade",     { validaAte: new Date("2027-01-01T00:00:00.000Z") }],
    ["outro teto de IA",   { tetoDeIaCentavosUsd: 99_999 }],
    ["outro escopo",       { escopo: "tudo, para sempre" }],
    ["outras peças",       { pecasContratadas: 36 }],
    ["outro autorizador",  { autorizadaPor: "alguém sem sobrenome" }],
  ];
  for (const [nome, over] of diferentes) {
    it(`termos DIFERENTES (${nome}) são RECUSADOS — alterar isenção auditada não é conceder`, async () => {
      jaExiste(over);
      const r = await concederIsencaoDeParceria(bom(), AGORA);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.recusa).toBe("ja_existe_com_outros_termos");
    });
  }

  it("não conseguir LER a existente não vira 'ok' — o silêncio não confirma nada", async () => {
    db.isencaoDeParceria.create.mockRejectedValue(new Error("Unique constraint failed"));
    db.isencaoDeParceria.findUnique.mockRejectedValue(new Error("banco fora"));
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.recusa).toBe("ja_existe");
  });
});

describe("quem apertou o botão fica na linha", () => {
  it("registradaPor entra na MESMA escrita da isenção — uma transação, não duas", async () => {
    await concederIsencaoDeParceria(bom({ registradaPor: "u_master" }), AGORA);
    expect(db.isencaoDeParceria.create.mock.calls[0][0].data.registradaPor).toBe("u_master");
  });

  it("sem sessão (caminho por script) fica NULO — e a isenção vale igual", async () => {
    const r = await concederIsencaoDeParceria(bom(), AGORA);
    expect(r.ok).toBe(true);
    expect(db.isencaoDeParceria.create.mock.calls[0][0].data.registradaPor).toBeNull();
  });

  it("nulo significa 'não veio pela rota', NUNCA 'sem dono' — autorizadaPor continua lá", async () => {
    await concederIsencaoDeParceria(bom(), AGORA);
    const data = db.isencaoDeParceria.create.mock.calls[0][0].data;
    expect(data.registradaPor).toBeNull();
    expect(data.autorizadaPor).toBeTruthy();
  });

  it("o corpo em branco não vira operador — espaço não é nome de gente", async () => {
    await concederIsencaoDeParceria(bom({ registradaPor: "   " }), AGORA);
    expect(db.isencaoDeParceria.create.mock.calls[0][0].data.registradaPor).toBeNull();
  });
});
