// O que espera no portão comercial.
//
// A trava central deste arquivo é o que ele NÃO faz: não envia, não afrouxa
// política, não pede exceção. Ele conta. A proposta parada é uma trava
// funcionando — e automatizar o envio arrancaria a proteção que impede a casa
// de violar política de plataforma.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({ oportunidade: { findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const portao = vi.hoisted(() => ({ vereditoDePolitica: vi.fn() }));
vi.mock("@/lib/marketplaces/portao", () => portao);

import {
  oQueEsperaNoPortao, resumoDoPortao, DIAS_ATE_VIRAR_ESQUECIDA,
} from "@/lib/agency/comercial/o-que-espera-no-portao";

const AGORA = new Date("2026-08-10T12:00:00Z");

function oportunidade(over: Record<string, unknown> = {}) {
  return {
    id: "op1", titulo: "Social media para clínica", plataforma: "workana",
    propostaTexto: "proposta escrita", decididoEm: null,
    updatedAt: new Date("2026-08-09T12:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  portao.vereditoDePolitica.mockReturnValue("HUMAN_GATE");
});

describe("mostra o que está pronto e esperando mão humana", () => {
  it("lista a proposta parada com o motivo", async () => {
    db.oportunidade.findMany.mockResolvedValue([oportunidade()]);
    const r = await oQueEsperaNoPortao("ws1", AGORA);
    expect(r[0]!.porQue).toMatch(/não permite envio automático/);
    expect(r[0]!.porQue).toMatch(/enviada por uma pessoa/);
  });

  it("os dias são CALCULADOS, nunca digitados", async () => {
    db.oportunidade.findMany.mockResolvedValue([
      oportunidade({ updatedAt: new Date("2026-08-05T12:00:00Z") }),
    ]);
    const r = await oQueEsperaNoPortao("ws1", AGORA);
    expect(r[0]!.diasParado).toBe(5);
    expect(r[0]!.esquecida).toBe(true);
  });

  it("a metade oposta: parada de ontem ainda não é esquecida", async () => {
    db.oportunidade.findMany.mockResolvedValue([oportunidade()]);
    const r = await oQueEsperaNoPortao("ws1", AGORA);
    expect(r[0]!.diasParado).toBe(1);
    expect(r[0]!.esquecida).toBe(false);
    expect(DIAS_ATE_VIRAR_ESQUECIDA).toBeGreaterThan(1);
  });

  it("proposta que ainda não foi escrita NÃO entra — não há o que esperar", async () => {
    db.oportunidade.findMany.mockResolvedValue([]);
    await oQueEsperaNoPortao("ws1", AGORA);
    const where = db.oportunidade.findMany.mock.calls[0]![0].where;
    expect(where.propostaTexto).toEqual({ not: null });
    expect(where.decididoEm).toBeNull();
  });
});

describe("o motivo diz o CONSERTO, e diz quando não há conserto nosso", () => {
  it("BLOCK deixa claro que nem uma pessoa resolve", async () => {
    portao.vereditoDePolitica.mockReturnValue("BLOCK");
    db.oportunidade.findMany.mockResolvedValue([oportunidade()]);
    const r = await oQueEsperaNoPortao("ws1", AGORA);
    expect(r[0]!.porQue).toMatch(/nem por pessoa/);
  });

  it("envio LIBERADO e proposta parada é chamado de defeito, não de política", async () => {
    // A distinção importa: se alguém ler "política" onde há defeito, vai tentar
    // consertar a política — e a política não é o problema.
    portao.vereditoDePolitica.mockReturnValue("ALLOW");
    db.oportunidade.findMany.mockResolvedValue([oportunidade()]);
    const r = await oQueEsperaNoPortao("ws1", AGORA);
    expect(r[0]!.porQue).toMatch(/isso é defeito, não política/);
  });
});

describe("o resumo não mente sobre fila vazia", () => {
  it("sem nada esperando, a mais antiga é NULA — nunca zero", async () => {
    // Zero diria "a mais antiga espera há zero dias", que é uma afirmação sobre
    // uma fila que não existe.
    db.oportunidade.findMany.mockResolvedValue([]);
    const r = await resumoDoPortao("ws1", AGORA);
    expect(r.esperando).toBe(0);
    expect(r.maisAntigaEmDias).toBeNull();
  });

  it("com fila, conta as esquecidas separadamente", async () => {
    db.oportunidade.findMany.mockResolvedValue([
      oportunidade({ id: "a", updatedAt: new Date("2026-08-01T12:00:00Z") }),
      oportunidade({ id: "b", updatedAt: new Date("2026-08-10T00:00:00Z") }),
    ]);
    const r = await resumoDoPortao("ws1", AGORA);
    expect(r.esperando).toBe(2);
    expect(r.esquecidas).toBe(1);
    expect(r.maisAntigaEmDias).toBe(9);
  });

  it("banco fora do ar não esconde a fila com erro — devolve vazio declarado", async () => {
    db.oportunidade.findMany.mockRejectedValue(new Error("db down"));
    const r = await resumoDoPortao("ws1", AGORA);
    expect(r.esperando).toBe(0);
  });
});

describe("este arquivo NÃO envia e NÃO afrouxa política", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/comercial/o-que-espera-no-portao.ts"),
    "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não chama nenhum envio", () => {
    for (const p of ["sendWhatsAppMessage", "avisarCliente", "publishPost", "fetch("]) {
      expect(SRC.includes(p), `passou a enviar (${p}) — isto era para CONTAR, não para mandar`).toBe(false);
    }
  });

  it("não escreve no banco", () => {
    for (const escrita of ["update(", "create(", "upsert(", "deleteMany("]) {
      expect(SRC.includes(escrita), `passou a escrever (${escrita})`).toBe(false);
    }
  });
});
