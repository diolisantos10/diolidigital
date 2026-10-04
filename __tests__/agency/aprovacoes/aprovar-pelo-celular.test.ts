// BLOCO B — APROVAR PELO CELULAR (CEO, 04/10/2026).
//
// Antes: 7 toques por marca para aprovar a semana, e o contador de
// Aprovações lia a cópia do navegador e não contava semana nenhuma.
// Agora: a semana que espera o CEO aparece no topo de Aprovações, com a marca
// já escolhida — 4 toques — e o contador vem do banco.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const banco = vi.hoisted(() => ({
  clientes: [] as Array<{ id: string; name: string; modoAprovacao: string; modoPendente: string | null; modoPendenteVigenteEm: Date | null }>,
  grupos: [] as Array<{ clientId: string; _count: { _all: number } }>,
  ondeDoGroupBy: null as unknown,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: { findMany: vi.fn(async () => banco.clientes) },
    socialPost: {
      groupBy: vi.fn(async (args: { where: unknown }) => {
        banco.ondeDoGroupBy = args.where;
        return banco.grupos;
      }),
    },
  },
}));

const { semanasParaOCeoAprovar } = await import("@/lib/agency/aprovacoes/semanas-do-ceo");

const cliente = (id: string, modo: string) => ({ id, name: `Marca ${id}`, modoAprovacao: modo, modoPendente: null, modoPendenteVigenteEm: null });

describe("as semanas que esperam o CEO", () => {
  beforeEach(() => { banco.clientes = []; banco.grupos = []; banco.ondeDoGroupBy = null; });

  it("só marca em APROVACAO_CEO, só com peça esperando, com a próxima semana em Brasília", async () => {
    banco.clientes = [cliente("a", "APROVACAO_CEO"), cliente("b", "SEMANAL"), cliente("c", "APROVACAO_CEO")];
    banco.grupos = [{ clientId: "a", _count: { _all: 12 } }];
    // Domingo, 04/10/2026, 21h em Brasília (00h UTC de segunda) — ainda é domingo lá.
    const r = await semanasParaOCeoAprovar("ws", new Date("2026-10-05T00:00:00Z"));
    expect(r).toEqual([{ clientId: "a", nome: "Marca a", de: "2026-10-05", ate: "2026-10-11", pecas: 12 }]);
    const onde = banco.ondeDoGroupBy as { clientId: { in: string[] }; status: string };
    expect(onde.clientId.in).toEqual(["a", "c"]);
    expect(onde.status).toBe("draft");
  });

  it("nenhuma marca no modo → nem consulta peça", async () => {
    banco.clientes = [cliente("b", "PILOTO_AUTOMATICO")];
    expect(await semanasParaOCeoAprovar("ws")).toEqual([]);
    expect(banco.ondeDoGroupBy).toBeNull();
  });
});

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("os toques", () => {
  const card = ler("components/agency/aprovacoes/SemanasDoCeo.tsx");

  it("Aprovações mostra a semana do CEO no topo", () => {
    const pagina = ler("app/agency/approvals/page.tsx");
    expect(pagina.indexOf("<SemanasDoCeo")).toBeGreaterThan(-1);
    expect(pagina.indexOf("<SemanasDoCeo")).toBeLessThan(pagina.indexOf("Propostas Aguardando Resposta"));
  });

  it("aprovar = 2 toques no card (Aprovar semana → Confirmar), sem escolher marca nem semana", () => {
    expect(card).toContain("Aprovar semana");
    expect(card).toContain("Confirmar ${s.pecas}");
    expect(card).not.toContain("<select");
    // Grava pelo mesmo caminho de sempre — nada novo aprova nada.
    expect(card).toContain('"/api/social-posts/aprovacao-ceo"');
  });

  it("botões com altura de dedo (44px)", () => {
    const botoes = card.match(/<button[\s\S]*?className="([^"]+)"/g) ?? [];
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) expect(b).toContain("h-11");
  });

  it("o contador do menu vem do banco, não da cópia do navegador", () => {
    const menu = ler("components/agency/layout/AgencySidebar.tsx");
    const contador = menu.slice(menu.indexOf("function usePendingCount"), menu.indexOf("function useNewRequestsCount"));
    expect(contador).toContain("/api/agency/aprovacoes");
    expect(contador).not.toContain("useAgencyStore");
  });

  it("a rota de contagem só mostra semana ao master", () => {
    const rota = ler("app/api/agency/aprovacoes/route.ts");
    expect(rota).toContain('session.role === "master" ? semanasParaOCeoAprovar');
  });
});
