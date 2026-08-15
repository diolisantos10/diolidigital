// TOP DOWN — o dispositivo do CEO.
//
// As duas metades que importam aqui não são "liga" e "desliga". São:
//   • sem decisão registrada, o freio fica PUXADO (fail-closed);
//   • banco fora do ar NÃO solta o freio.
//
// A segunda é a que costuma faltar, e é a que transformaria um erro de leitura
// numa publicação em nome de cliente. Um dispositivo que abre sozinho quando o
// banco pisca é pior que não ter dispositivo.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  flagV2: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { topDownLigado, lerDecisao, decidir, DECISOES_TOP_DOWN } from "@/lib/agency/top-down";

beforeEach(() => {
  db.flagV2.findUnique.mockReset();
  db.flagV2.upsert.mockReset();
});

describe("fail-closed — ausência de decisão nunca vira permissão", () => {
  it("sem linha no banco, o freio está puxado", async () => {
    db.flagV2.findUnique.mockResolvedValue(null);
    expect(await topDownLigado("publicacao_organica")).toBe(false);
  });

  it("banco fora do ar NÃO solta o freio", async () => {
    db.flagV2.findUnique.mockRejectedValue(new Error("banco caiu"));
    expect(await topDownLigado("publicacao_organica")).toBe(false);
  });

  it("linha desligada mantém o freio puxado", async () => {
    db.flagV2.findUnique.mockResolvedValue({ ligada: false, motivo: "m", decididoPor: "ceo", em: new Date() });
    expect(await topDownLigado("publicacao_organica")).toBe(false);
  });

  it("só uma decisão explicitamente ligada libera", async () => {
    db.flagV2.findUnique.mockResolvedValue({ ligada: true, motivo: "m", decididoPor: "ceo", em: new Date() });
    expect(await topDownLigado("publicacao_organica")).toBe(true);
  });

  it("lerDecisao também devolve estado barrado em erro de banco", async () => {
    db.flagV2.findUnique.mockRejectedValue(new Error("banco caiu"));
    const d = await lerDecisao("publicacao_organica");
    expect(d.ligada).toBe(false);
    expect(d.decididoPor).toBeNull();
  });
});

describe("a decisão é nominal — sem dono e sem porquê, não se registra", () => {
  it("recusa motivo vazio", async () => {
    await expect(
      decidir({ chave: "publicacao_organica", ligada: true, motivo: "   ", decididoPor: "ceo@dioli" }),
    ).rejects.toThrow(/motivo/);
    expect(db.flagV2.upsert).not.toHaveBeenCalled();
  });

  it("recusa decididoPor vazio", async () => {
    await expect(
      decidir({ chave: "publicacao_organica", ligada: true, motivo: "teste do app review", decididoPor: "" }),
    ).rejects.toThrow(/decididoPor/);
    expect(db.flagV2.upsert).not.toHaveBeenCalled();
  });

  it("exige motivo TAMBÉM para desligar — puxar o freio de volta é decisão", async () => {
    await expect(
      decidir({ chave: "publicacao_organica", ligada: false, motivo: "", decididoPor: "ceo@dioli" }),
    ).rejects.toThrow(/motivo/);
  });

  it("grava com escopo global e chave prefixada, sem colidir com flag de execução", async () => {
    db.flagV2.upsert.mockResolvedValue({
      ligada: true, motivo: "peça de teste para o App Review", decididoPor: "ceo@dioli", em: new Date(),
    });
    await decidir({
      chave: "publicacao_organica",
      ligada: true,
      motivo: "peça de teste para o App Review",
      decididoPor: "ceo@dioli",
    });
    const arg = db.flagV2.upsert.mock.calls[0][0];
    expect(arg.where.chave_escopo.chave).toBe("topdown:publicacao_organica");
    expect(arg.where.chave_escopo.escopo).toBe("global");
    // `v2_execucao` vive na mesma tabela: o prefixo é o que impede uma decisão
    // de publicação virar, sem querer, permissão de execução das 62 funções.
    expect(arg.where.chave_escopo.chave).not.toBe("v2_execucao");
  });
});

describe("o texto que o CEO lê antes de virar", () => {
  it("diz o que NÃO libera — ler TOP DOWN como 'pode tudo' é o erro a evitar", () => {
    const d = DECISOES_TOP_DOWN.publicacao_organica;
    expect(d.oQueNaoLibera).toMatch(/aprovação do cliente/i);
    expect(d.aviso).toMatch(/App Review/i);
  });
});
