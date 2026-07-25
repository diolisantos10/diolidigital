import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  marketInsight: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { addInsight, approveInsight, getActiveInsights, buildInsightBlock } from "@/lib/agency/radar/library";

beforeEach(() => {
  vi.clearAllMocks();
  db.marketInsight.updateMany.mockResolvedValue({ count: 0 });
  db.marketInsight.update.mockResolvedValue({});
  db.marketInsight.create.mockImplementation(async ({ data }: { data: { status: string } }) => ({ id: "i1", status: data.status }));
});

describe("Radar Dioli — biblioteca (governança oficial vs tendência)", () => {
  it("fonte OFICIAL entra ATIVA na hora (sem validação) e supersede o tópico", async () => {
    const r = await addInsight({ workspaceId: "ws1", domain: "social", topic: "ig-algo", title: "Novo ranking IG", guidance: "priorizar reels de até 30s", source: "official", sourceName: "Meta" });
    expect(r.status).toBe("active");
    // arquivou o tópico ativo anterior (versionamento)
    expect(db.marketInsight.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ topic: "ig-algo", status: "active" }) }));
    const created = db.marketInsight.create.mock.calls[0][0].data;
    expect(created.status).toBe("active");
    expect(created.approvedBy).toBe("official-source");
  });

  it("TENDÊNCIA não-oficial entra PENDENTE (aguarda validação humana)", async () => {
    const r = await addInsight({ workspaceId: "ws1", domain: "social", topic: "trend-x", title: "Formato viral", guidance: "carrossel com gancho no 1º slide", source: "trend" });
    expect(r.status).toBe("pending");
    const created = db.marketInsight.create.mock.calls[0][0].data;
    expect(created.approvedAt).toBeNull();
    // não arquiva nada até ser aprovada
    expect(db.marketInsight.updateMany).not.toHaveBeenCalled();
  });

  it("aprovar tendência pendente → entra em vigor e supersede o tópico", async () => {
    db.marketInsight.findUnique.mockResolvedValue({ workspaceId: "ws1", topic: "trend-x", status: "pending" });
    const ok = await approveInsight("i1", "diego");
    expect(ok).toBe(true);
    expect(db.marketInsight.updateMany).toHaveBeenCalled(); // arquivou o tópico
    expect(db.marketInsight.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active", approvedBy: "diego" }) }));
  });

  it("getActiveInsights busca ativos do domínio + general", async () => {
    db.marketInsight.findMany.mockResolvedValue([{ title: "T", guidance: "G", source: "official", sourceName: "Meta" }]);
    await getActiveInsights("ws1", "design");
    expect(db.marketInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "active", domain: { in: ["design", "general"] } }),
    }));
  });

  it("buildInsightBlock marca OFICIAL vs tendência", () => {
    const block = buildInsightBlock([
      { title: "Ranking IG", guidance: "reels curtos", source: "official", sourceName: "Meta" },
      { title: "Gancho", guidance: "1º slide forte", source: "trend", sourceName: null },
    ]);
    expect(block).toMatch(/OFICIAL \(Meta\)/);
    expect(block).toMatch(/tendência/);
    expect(block).toContain("RADAR DIOLI");
  });
});
