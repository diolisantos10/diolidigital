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

// O critério do CEO (04/08/2026): "os nossos carrosséis têm a ver com os que
// eles fizeram lá?". Só pontua quando o feed FOI lido — punir a peça por uma
// conexão que o cliente não fez seria inventar critério.
describe("o critério do feed real na auditoria", () => {
  beforeEach(() => generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } }));

  it("feed lido no contexto → a Qualidade pergunta se a peça CONVERSA com ele", async () => {
    await auditDeliverable({ ...base, brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-04):\n- Tom das legendas: próximo" });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toMatch(/\(6\).*CONVERSA com o FEED REAL/);
  });

  it("feed não lido → o critério NÃO pontua e a auditoria é avisada para não punir", async () => {
    await auditDeliverable({ ...base, brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram): feed não lido: sem conexão. PROIBIDO inferir." });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).toMatch(/NÃO penalize/);
  });

  it("contexto sem menção a feed (fluxos antigos) → prompt igual ao de sempre", async () => {
    await auditDeliverable(base);
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).not.toMatch(/penalize/);
  });
});
