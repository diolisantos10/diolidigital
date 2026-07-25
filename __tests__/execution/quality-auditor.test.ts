import { describe, it, expect, beforeEach, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generate", () => ({ generate }));

import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";

const base = { deptLabel: "Social Media", title: "Pacote", content: "conteúdo da entrega", brandContext: "marca X", workspaceId: "ws1" };

beforeEach(() => vi.clearAllMocks());

describe("quality-auditor — Qualidade audita (sombra)", () => {
  it("entrega boa → verdict pass", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "no tom, sem problemas" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("pass");
    expect(v.note).toMatch(/tom/);
  });

  it("entrega com problema → verdict flag + issues", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "flag", issues: ["promete resultado garantido", "inventa preço"], note: "revisar" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("flag");
    expect(v.issues.length).toBe(2);
  });

  it("IA da auditoria indisponível → fail-open (passa em sombra, nunca trava a produção)", async () => {
    generate.mockResolvedValue({ ok: false });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("pass");
    expect(v.note).toMatch(/indispon/i);
  });

  it("erro inesperado → fail-open", async () => {
    generate.mockRejectedValue(new Error("boom"));
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("pass");
  });
});
