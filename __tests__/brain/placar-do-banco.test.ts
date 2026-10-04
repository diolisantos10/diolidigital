// BLOCO F — DIOLI BRAIN: DADO REAL OU VAZIO HONESTO (CEO, 04/10/2026).
// Antes: seis painéis liam cópias do navegador e marcavam "ativo" por
// constante. Agora: execuções do banco (AIRunLog) e o portão medido.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const banco = vi.hoisted(() => ({
  linhas: [] as Array<{ departmentId: string; status: string; fallbackUsed: boolean; createdAt: Date; custoEstimadoUsd: number | null }>,
  onde: null as unknown,
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { aIRunLog: { findMany: vi.fn(async (a: { where: unknown }) => { banco.onde = a.where; return banco.linhas; }) } },
}));

const { placarDosDepartamentos, DEPARTAMENTOS_DO_PLACAR } = await import("@/lib/dioli-brain/placar-dos-departamentos");
const { ALL_QUALITY_GATES } = await import("@/lib/dioli-brain/quality-gates");
const agora = new Date("2026-10-04T12:00:00Z");

describe("o placar vem do banco", () => {
  beforeEach(() => { banco.linhas = []; });

  it("sem execução → zero declarado, e o portão continua medido", async () => {
    const r = await placarDosDepartamentos("ws", agora);
    expect(r.map((d) => d.id)).toEqual(DEPARTAMENTOS_DO_PLACAR.map((d) => d.id));
    for (const d of r) {
      expect(d.execucoes.total).toBe(0);
      expect(d.execucoes.ultimaEm).toBeNull();
      const portao = ALL_QUALITY_GATES[d.id] ?? [];
      expect(d.portao.total).toBe(portao.length);
      expect(d.portao.comMecanismo + d.portao.soTexto).toBe(portao.length);
    }
  });

  it("conta ok, reserva e erro separados, só dos últimos 30 dias do workspace", async () => {
    const t = (h: number) => new Date(agora.getTime() - h * 3_600_000);
    banco.linhas = [
      { departmentId: "social-media", status: "success", fallbackUsed: false, createdAt: t(1), custoEstimadoUsd: 0.1 },
      { departmentId: "social-media", status: "success", fallbackUsed: true, createdAt: t(2), custoEstimadoUsd: 0 },
      { departmentId: "social-media", status: "error", fallbackUsed: false, createdAt: t(3), custoEstimadoUsd: null },
    ];
    const social = (await placarDosDepartamentos("ws", agora)).find((d) => d.id === "social-media")!;
    expect(social.execucoes).toMatchObject({ total: 3, ok: 1, reserva: 1, erro: 1, custoUsd: 0.1 });
    expect(social.execucoes.ultimaEm).toBe(t(1).toISOString());
    const onde = banco.onde as { workspaceId: string; createdAt: { gte: Date } };
    expect(onde.workspaceId).toBe("ws");
    expect(onde.createdAt.gte.toISOString()).toBe(new Date(agora.getTime() - 30 * 86_400_000).toISOString());
  });
});

describe("a tela do Brain não mente", () => {
  const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/brain/page.tsx"), "utf8");

  it("não lê as cópias do navegador dos departamentos", () => {
    for (const s of ["useStrategyStore", "useSocialStore", "useDesignStore", "useTrafficStore", "useAnalyticsStore", "useQualityStore", "useAgencyStore"]) {
      expect(pagina, s).not.toContain(s);
    }
  });

  it("nenhum selo 'ativo' por constante", () => {
    expect(pagina).not.toMatch(/active:\s*true/);
  });

  it("mostra o placar do banco", () => {
    expect(pagina).toContain("<PlacarDosDepartamentos />");
    const comp = fs.readFileSync(path.join(process.cwd(), "components/agency/brain/PlacarDosDepartamentos.tsx"), "utf8");
    expect(comp).toContain("/api/brain/departamentos");
    expect(comp).toContain("Nenhuma execução nos últimos");
  });

  it("a Sala dos Agentes continua lendo do banco, sem MOCK_AGENTS", () => {
    const sala = fs.readFileSync(path.join(process.cwd(), "app/agency/agents/page.tsx"), "utf8");
    expect(sala).toContain("montarSalaDosAgentes");
    expect(sala).not.toMatch(/import .*MOCK_AGENTS/);
  });
});

describe("SDR sem briefing não mostra percentual inventado", () => {
  it("objeções, qualificação e confiança viram '—' sem briefing", () => {
    const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/brain/page.tsx"), "utf8");
    expect(pagina).toContain("value: pct(scorecard.objectionResolutionRate)");
    expect(pagina).toContain("value: pct(scorecard.qualifiedRate)");
    expect(pagina).toContain("value: pct(scorecard.averageConfidence)");
  });
});
