// A aprovação que ninguém decidiu.
//
// Duas travas, e a segunda é de justiça:
//
//   1. este arquivo NÃO decide por ninguém. Aprovar no lugar do cliente é
//      falsificar o consentimento dele — é o único erro desta lista sem desfazer.
//   2. "dúvida aberta" NÃO é o cliente atrasado: é o cliente esperando a
//      agência. Somar os dois produziria um alarme que cobra o cliente pelo
//      atraso da própria casa.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  approvalRequest: { findMany: vi.fn() },
  client: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  aprovacoesParadas, resumoDasAprovacoes, DIAS_ATE_VIRAR_ABANDONO,
} from "@/lib/agency/esteira/aprovacao-parada";

const AGORA = new Date("2026-08-12T12:00:00Z");

function card(over: Record<string, unknown> = {}) {
  return {
    id: "a1", department: "social-media", status: "pending",
    createdAt: new Date("2026-08-11T12:00:00Z"),
    expiresAt: null, questionOpenedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findMany.mockResolvedValue([{ id: "c1" }]);
});

describe("conta a peça pronta que morre esperando um clique", () => {
  it("só olha o que ainda está pendente — decidido saiu da fila", async () => {
    db.approvalRequest.findMany.mockResolvedValue([]);
    await aprovacoesParadas("ws1", AGORA);
    const where = db.approvalRequest.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("pending");
  });

  it("o inquilino é resolvido pelos DOIS caminhos de posse", async () => {
    // `ApprovalRequest` não tem workspaceId: a posse é clientRequestId OU
    // clientId. Ler só um dos dois esconderia metade da fila.
    db.approvalRequest.findMany.mockResolvedValue([]);
    await aprovacoesParadas("ws1", AGORA);
    const ramos = db.approvalRequest.findMany.mock.calls[0]![0].where.OR;
    expect(ramos).toContainEqual({ clientRequest: { workspaceId: "ws1" } });
    expect(ramos).toContainEqual({ clientId: { in: ["c1"] } });
  });

  it("workspace sem clientes NÃO vira filtro que casa com órfão de outro inquilino", async () => {
    // `{ clientId: null }` casaria com todo card sem dono do banco — vazamento
    // entre clientes pela porta dos fundos.
    db.client.findMany.mockResolvedValue([]);
    db.approvalRequest.findMany.mockResolvedValue([]);
    await aprovacoesParadas("ws1", AGORA);
    const ramos = db.approvalRequest.findMany.mock.calls[0]![0].where.OR;
    expect(ramos).toHaveLength(1);
    expect(JSON.stringify(ramos)).not.toContain("null");
  });

  it("os dias são CALCULADOS, nunca digitados", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ createdAt: new Date("2026-08-05T12:00:00Z") }),
    ]);
    expect((await aprovacoesParadas("ws1", AGORA))[0]!.diasParado).toBe(7);
  });

  it("a metade oposta: card de ontem ainda não é abandono", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    const r = await resumoDasAprovacoes("ws1", AGORA);
    expect(r.paradas).toBe(1);
    expect(r.abandonadas).toBe(0);
    expect(DIAS_ATE_VIRAR_ABANDONO).toBeGreaterThan(1);
  });
});

describe("prazo AUSENTE não é prazo vencido", () => {
  it("card sem prazo não é marcado como vencido", async () => {
    // Chamar ausência de prazo de prazo estourado inventaria um compromisso que
    // ninguém assumiu.
    db.approvalRequest.findMany.mockResolvedValue([card({ expiresAt: null })]);
    expect((await aprovacoesParadas("ws1", AGORA))[0]!.prazoVencido).toBe(false);
  });

  it("card com prazo passado é vencido", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ expiresAt: new Date("2026-08-11T00:00:00Z") }),
    ]);
    expect((await aprovacoesParadas("ws1", AGORA))[0]!.prazoVencido).toBe(true);
  });

  it("mas card velho sem prazo ainda conta como abandonado", async () => {
    // Senão bastaria não pôr prazo para a peça sumir do radar para sempre.
    db.approvalRequest.findMany.mockResolvedValue([
      card({ createdAt: new Date("2026-08-01T12:00:00Z"), expiresAt: null }),
    ]);
    expect((await resumoDasAprovacoes("ws1", AGORA)).abandonadas).toBe(1);
  });
});

describe("dúvida aberta é atraso NOSSO, não do cliente", () => {
  it("card com pergunta do cliente aponta para a agência", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ questionOpenedAt: new Date("2026-08-11T13:00:00Z") }),
    ]);
    const r = (await aprovacoesParadas("ws1", AGORA))[0]!;
    expect(r.bolaConosco).toBe(true);
    expect(r.deQuemEAVez).toMatch(/a vez é da agência/i);
    expect(r.deQuemEAVez).toMatch(/pausado/i);
  });

  it("sem pergunta, a vez é do cliente", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    const r = (await aprovacoesParadas("ws1", AGORA))[0]!;
    expect(r.bolaConosco).toBe(false);
    expect(r.deQuemEAVez).toMatch(/decisão do cliente/i);
  });

  it("o resumo conta as duas separadas — nunca somadas", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "a", questionOpenedAt: new Date("2026-08-11T13:00:00Z") }),
      card({ id: "b" }),
      card({ id: "c" }),
    ]);
    const r = await resumoDasAprovacoes("ws1", AGORA);
    expect(r.paradas).toBe(3);
    expect(r.bolaConosco).toBe(1);
  });
});

describe("o resumo não mente sobre fila vazia", () => {
  it("sem cards, o mais antigo é NULO — nunca zero", async () => {
    db.approvalRequest.findMany.mockResolvedValue([]);
    const r = await resumoDasAprovacoes("ws1", AGORA);
    expect(r.paradas).toBe(0);
    expect(r.maisAntigoEmDias).toBeNull();
  });

  it("banco fora do ar não derruba quem consulta", async () => {
    db.approvalRequest.findMany.mockRejectedValue(new Error("db down"));
    expect((await resumoDasAprovacoes("ws1", AGORA)).paradas).toBe(0);
  });
});

// ── NÃO DECIDE POR NINGUÉM ──────────────────────────────────────────────────

describe("aprovar no lugar do cliente é falsificar o consentimento dele", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/esteira/aprovacao-parada.ts"), "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não escreve no banco — não aprova, não reprova, não expira card", () => {
    for (const e of ["update(", "updateMany(", "create(", "upsert(", "delete("]) {
      expect(SRC.includes(e), `passou a escrever (${e}) — isto era para CONTAR`).toBe(false);
    }
  });

  it("não manda mensagem para ninguém", () => {
    for (const p of ["sendWhatsApp", "avisarCliente", "portalMessage", "fetch("]) {
      expect(SRC.includes(p), `passou a cobrar sozinho (${p})`).toBe(false);
    }
  });
});
