// Quem bateu na porta e não foi atendido.
//
// A trava que mais importa: **este arquivo NÃO fala com ninguém.** Ele conta.
// Abordagem automática em quem demonstrou interesse queima marca e número — e o
// CEO ordenou, em 10/08/2026, nenhuma demanda de cliente até a agência ficar
// pronta. Uma varredura que dispara mensagem violaria a ordem no dia em que
// fosse ligada, sem ninguém decidir isso.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({ clientRequestDb: { findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  quemBateuNaPorta, resumoDaPorta, DIAS_ATE_VIRAR_DESLEIXO,
} from "@/lib/agency/comercial/quem-bateu-na-porta";

const AGORA = new Date("2026-08-11T12:00:00Z");

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "r1", businessName: "Sushi Cazza", status: "new", rawContext: "",
    briefingJson: JSON.stringify({ contato: { email: "dono@sushicazza.com.br" } }),
    sdrHandoffJson: null,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("conta quem entrou e ninguém respondeu", () => {
  it("os dias são CALCULADOS, nunca digitados", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ createdAt: new Date("2026-06-21T12:00:00Z") }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.diasEsperando).toBe(51); // o caso real do Sushi Cazza
    expect(r[0]!.desleixo).toBe(true);
  });

  it("a metade oposta: quem entrou ontem ainda não é desleixo", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.diasEsperando).toBe(1);
    expect(r[0]!.desleixo).toBe(false);
    expect(DIAS_ATE_VIRAR_DESLEIXO).toBeGreaterThan(1);
  });

  it("pedido que já virou projeto saiu da porta e não é mais fila", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await quemBateuNaPorta("ws1", AGORA);
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.status.in).not.toContain("completed");
    expect(where.workspaceId).toBe("ws1");
  });
});

describe('"ninguém respondeu" e "não temos como responder" são problemas OPOSTOS', () => {
  it("quem deixou contato conta como esperando resposta — é cobrança da casa", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.esperandoResposta).toBe(1);
    expect(r.semCaminho).toBe(0);
  });

  it("quem NÃO deixou contato é contado separado, e nunca vira desleixo", async () => {
    // Cobrar alguém por não ter ligado para quem não deixou telefone é cobrar o
    // impossível — e alarme impossível de atender é alarme que se aprende a ignorar.
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: "{}", createdAt: new Date("2026-06-21T12:00:00Z") }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.temComoFalar).toBe(false);
    expect(r[0]!.desleixo).toBe(false);
    expect(r[0]!.porQueNaoDaParaFalar).toBeTruthy();

    const resumo = await resumoDaPorta("ws1", AGORA);
    expect(resumo.semCaminho).toBe(1);
    expect(resumo.esperandoResposta).toBe(0);
  });

  it("nome sozinho NÃO é contato", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: JSON.stringify({ contato: { nome: "Camila Pereira" } }) }),
    ]);
    expect((await quemBateuNaPorta("ws1", AGORA))[0]!.temComoFalar).toBe(false);
  });

  it("pista de Instagram aparece como PISTA e não conta como contato", async () => {
    // O Sushi Cazza tem @sushicazzaoficial no texto. É caminho real para uma
    // PESSOA tentar — não é declaração de contato, e não pode virar uma.
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: "{}", rawContext: "nosso perfil é @sushicazzaoficial" }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.temComoFalar).toBe(false);
    expect(r[0]!.pistas.some((p) => p.tipo === "instagram")).toBe(true);
  });
});

describe("o resumo não mente sobre fila vazia", () => {
  it("sem ninguém alcançável, o mais antigo é NULO — nunca zero", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.naPorta).toBe(0);
    expect(r.maisAntigoEmDias).toBeNull();
  });

  it("banco fora do ar não derruba quem consulta", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.naPorta).toBe(0);
  });

  it("os três casos reais de 08/08, juntos", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ id: "a", businessName: "Sushi Cazza", briefingJson: "{}", createdAt: new Date("2026-06-21T12:00:00Z") }),
      pedido({ id: "b", businessName: "Camila Pereira", createdAt: new Date("2026-07-13T12:00:00Z") }),
      pedido({ id: "c", businessName: "Beatriz Gimenes", briefingJson: "{}", createdAt: new Date("2026-07-14T12:00:00Z") }),
    ]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.naPorta).toBe(3);
    expect(r.semCaminho).toBe(2);
    expect(r.esperandoResposta).toBe(1);
    expect(r.maisAntigoEmDias).toBe(29);
  });
});

// ── ESTE ARQUIVO CONTA. ELE NÃO FALA COM NINGUÉM. ───────────────────────────

describe("não aborda, não escreve, não decide por gente", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/comercial/quem-bateu-na-porta.ts"), "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("nenhum envio sai daqui", () => {
    for (const p of ["sendWhatsApp", "avisarCliente", "enviarEmail", "fetch(", "generate("]) {
      expect(SRC.includes(p), `passou a abordar lead (${p}) — isto era para CONTAR`).toBe(false);
    }
  });

  it("não escreve no banco", () => {
    for (const e of ["update(", "create(", "upsert(", "updateMany("]) {
      expect(SRC.includes(e), `passou a escrever (${e})`).toBe(false);
    }
  });
});
