import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ marketInsight: { findMany: vi.fn() } }));
const generate = vi.hoisted(() => vi.fn());
const addInsight = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/radar/library", () => ({ addInsight }));

import { runRadarScan } from "@/lib/agency/radar/radar-agent";

beforeEach(() => {
  vi.clearAllMocks();
  db.marketInsight.findMany.mockResolvedValue([]); // nada existente → nada deduplicado
  addInsight.mockResolvedValue({ id: "i", status: "pending" });
});

describe("Radar Dioli — o agente que capta e propõe (tudo PENDENTE)", () => {
  it("propõe tendências e TODAS entram como 'trend' (nunca oficial)", async () => {
    generate.mockResolvedValue({ ok: true, data: { items: [{ topic: "ig-reels", title: "Reels curtos", guidance: "até 30s" }] } });
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBeGreaterThan(0);
    // toda proposta é source "trend" (governança: só humano/oficial ativa)
    for (const call of addInsight.mock.calls) {
      expect(call[0].source).toBe("trend");
    }
  });

  it("dedup: não repropõe tópico que já existe (ativo/pendente)", async () => {
    db.marketInsight.findMany.mockResolvedValue([{ topic: "ig-reels" }]);
    generate.mockResolvedValue({ ok: true, data: { items: [{ topic: "ig-reels", title: "x", guidance: "y" }] } });
    const r = await runRadarScan("ws1");
    expect(addInsight).not.toHaveBeenCalled();
    expect(r.proposed).toBe(0);
  });

  it("IA indisponível num domínio → não quebra, só não propõe", async () => {
    generate.mockResolvedValue({ ok: false });
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBe(0);
    expect(addInsight).not.toHaveBeenCalled();
  });

  it("item incompleto é ignorado (não vira insight vazio)", async () => {
    generate.mockResolvedValue({ ok: true, data: { items: [{ topic: "", title: "sem topic", guidance: "" }] } });
    const r = await runRadarScan("ws1");
    expect(addInsight).not.toHaveBeenCalled();
    expect(r.proposed).toBe(0);
  });
});
