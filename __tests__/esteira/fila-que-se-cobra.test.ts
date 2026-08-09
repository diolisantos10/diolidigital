// A fila de exceção que se cobra.
//
// A trava central: **motivo temporário reenvia; motivo permanente NÃO.**
// Tratar os dois do mesmo jeito é o que produz centenas de tentativas por dia
// contra um número que não existe — e faz o painel ensinar a ser ignorado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientNotice: { findMany: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const avisos = vi.hoisted(() => ({ avisarCliente: vi.fn() }));
vi.mock("@/lib/agency/esteira/avisos", () => avisos);

import { cobrarAFila, MAX_REENVIOS, HORAS_ATE_COBRAR } from "@/lib/agency/esteira/fila-que-se-cobra";

const AGORA = new Date("2026-08-09T12:00:00Z");

function aviso(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "av1", workspaceId: "ws1", clientId: "cli1", projectId: null,
    kind: "material", body: "Precisamos do seu logo.", status: "pendente",
    channel: "nenhum", failReason: "o WhatsApp recusou o envio",
    retryCount: 0, createdAt: new Date("2026-08-01T12:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clientNotice.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João" });
  avisos.avisarCliente.mockResolvedValue({ registrado: true, enviadoAutomaticamente: true, canal: "whatsapp" });
});

describe("motivo TEMPORÁRIO é reenviado", () => {
  it("canal que recusou volta a ser tentado", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso()]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.reenviados).toEqual(["av1"]);
    expect(avisos.avisarCliente).toHaveBeenCalled();
  });

  it("o contador sobe a cada tentativa — sem ele o reenvio vira rajada", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ retryCount: 1 })]);
    await cobrarAFila("ws1", AGORA);
    const dados = db.clientNotice.update.mock.calls[0]![0].data;
    expect(dados.retryCount).toBe(2);
  });

  it("depois do teto, PARA de tentar e declara — não abandona em silêncio", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ retryCount: MAX_REENVIOS })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.desistidos).toEqual(["av1"]);
    expect(avisos.avisarCliente, "insistiu depois do teto").not.toHaveBeenCalled();
    expect(db.clientNotice.update.mock.calls[0]![0].data.failReason).toMatch(/precisa de gente/);
  });
});

describe("motivo PERMANENTE não é reenviado — é gritado", () => {
  it("cliente sem telefone vira pedido de CADASTRO, não nova tentativa", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "cliente sem telefone cadastrado" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(avisos.avisarCliente, "insistiu contra um telefone que não existe").not.toHaveBeenCalled();
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/telefone/);
    expect(r.precisamDeCadastro[0]!.cliente).toBe("Padaria do João");
  });

  it("sem conexão de WhatsApp também é cadastro, e o alerta diz o conserto", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "nenhuma conexão de WhatsApp no workspace" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/WhatsApp conectado/);
  });

  it("motivo DESCONHECIDO não é reenviado — default-deny", async () => {
    // Insistir contra um defeito que a casa não reconhece é como se descobre,
    // tarde, que ele era permanente.
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "erro estranho que ninguém mapeou" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(avisos.avisarCliente).not.toHaveBeenCalled();
    expect(r.precisamDeCadastro.length).toBe(1);
  });

  it("motivo VAZIO também não reenvia, e a falta do motivo é dita", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: null })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/não foi registrado/);
  });
});

describe("só cobra o que já esperou tempo demais", () => {
  it("a janela de espera entra na consulta", async () => {
    db.clientNotice.findMany.mockResolvedValue([]);
    await cobrarAFila("ws1", AGORA);
    const where = db.clientNotice.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("pendente");
    const limite = where.createdAt.lte as Date;
    const horas = (AGORA.getTime() - limite.getTime()) / 3_600_000;
    expect(horas).toBe(HORAS_ATE_COBRAR);
  });
});

describe("uma rodada que falha não derruba o relógio", () => {
  it("banco fora do ar devolve rodada vazia em vez de lançar", async () => {
    db.clientNotice.findMany.mockRejectedValue(new Error("db down"));
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.reenviados).toEqual([]);
    expect(r.precisamDeCadastro).toEqual([]);
  });
});

// ── A METADE QUE FAZ ISTO EXISTIR DE VERDADE ────────────────────────────────
//
// Uma fila que se cobra e que ninguém chama é a mesma fila parada de antes, só
// que com mais código. O relógio precisa chamá-la.

import fs from "node:fs";
import path from "node:path";

const DESPERTADOR = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

describe("o relógio chama a fila", () => {
  it("a cobrança é uma perna da rodada", () => {
    expect(DESPERTADOR.includes("cobrarAFila("), "a fila voltou a depender de alguém abrir o painel").toBe(true);
  });

  it("falhar na cobrança NÃO derruba as outras pernas", () => {
    const i = DESPERTADOR.indexOf("cobrarAFila(");
    const trecho = DESPERTADOR.slice(Math.max(0, i - 400), i + 700);
    expect(trecho).toContain("quebrou(\"fila-que-se-cobra\"");
  });

  it("o que precisa de cadastro aparece com NOME e com o conserto", () => {
    const i = DESPERTADOR.indexOf("precisamDeCadastro");
    expect(i).toBeGreaterThan(-1);
    expect(DESPERTADOR.slice(i, i + 200)).toContain("oQueFalta");
  });
});
