// A ESTEIRA AUTOMÁTICA PASSA A TER O QUE PINTAR.
//
// ── O DEFEITO, MEDIDO EM PRODUÇÃO (24/08/2026, case Farol 27) ───────────────
//
// A cadeia andou inteira e entregou **14 peças de texto e ZERO artes** — e a
// causa não era o gerador de imagem. `renderizadorDisponivel()` respondia
// "pronto", a chave estava no cofre, e o despertador chamava
// `produzirArtesPendentes()` a cada 5 minutos, como sempre chamou.
//
// Ele chamava **sobre uma tabela vazia.** `produzirArtesPendentes` lê
// `SocialPost`; quem cria `SocialPost` é `agendarPostsDaEntrega`; e ela tinha
// três chamadores — `marcos.apresentar`, `mes.apresentarCiclo` e a repescagem
// da escada — TODOS eventos que já passaram. Entrega que ficava elegível depois
// do último deles não era colhida por ninguém, nunca mais.
//
// A prova ao vivo, lida com a rota de leitura pura sem gastar um centavo: o
// cliente do case tinha **0 peça(s) esperando arte** e **2 peça(s) novas
// previstas** — duas entregas prontas paradas desde as 22:33, enquanto a perna
// de arte da rodada trabalhava por cima de nada.
//
// ⚠️ O ALVO É O CAMINHO QUE PRODUZ DE VERDADE. O irmão pouco usado, aqui, é a
// tela manual de design (`/api/generate-image`) — que é justamente a única que
// hoje chama a arte. Nenhum teste deste arquivo passa por ela.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  project: { findMany: vi.fn(), findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  mediaAsset: { count: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const agendador = vi.hoisted(() => ({ agendarPostsDaEntrega: vi.fn() }));
vi.mock("@/lib/agency/esteira/publicacao", async (original) => {
  const real = await original<typeof import("@/lib/agency/esteira/publicacao")>();
  return { ...real, agendarPostsDaEntrega: agendador.agendarPostsDaEntrega };
});

import { colherPecasDasEntregas, MAX_PROJETOS_POR_COLHEITA } from "@/lib/agency/execution/produzir-agora";

function colheitaVazia(over: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1", criados: 0, jaAgendadas: 0,
    naoInterpretadas: [], bloqueadasPorPilar: [], retidas: [], ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([{ id: "proj-1", name: "Reposicionamento Farol 27" }]);
  db.activityEvent.create.mockResolvedValue({});
  agendador.agendarPostsDaEntrega.mockResolvedValue(colheitaVazia());
});

describe("a colheita: a entrega já apresentada vira peça sem ninguém apertar nada", () => {
  it("⭐ chama o MESMO agendador da porta manual — não um segundo caminho", async () => {
    agendador.agendarPostsDaEntrega.mockResolvedValue(colheitaVazia({ criados: 2 }));
    const r = await colherPecasDasEntregas();
    expect(agendador.agendarPostsDaEntrega).toHaveBeenCalledWith("proj-1");
    expect(r.criadas).toBe(2);
    expect(r.projetos).toBe(1);
  });

  it("só visita projeto JÁ APRESENTADO — o calendário não nasce antes do cliente ver", async () => {
    await colherPecasDasEntregas();
    const consulta = db.project.findMany.mock.calls[0]![0];
    expect(consulta.where).toEqual({ presentedAt: { not: null } });
  });

  it("tem teto de laço declarado — rodada de 5 em 5 minutos não varre a casa sem limite", async () => {
    await colherPecasDasEntregas();
    expect(db.project.findMany.mock.calls[0]![0].take).toBe(MAX_PROJETOS_POR_COLHEITA);
    expect(MAX_PROJETOS_POR_COLHEITA).toBeGreaterThan(0);
  });

  it("⭐ o que foi RETIDO sobe com o motivo — trabalho pago barrado nunca em silêncio", async () => {
    agendador.agendarPostsDaEntrega.mockResolvedValue(colheitaVazia({
      retidas: [{ nome: "Copy dos posts", motivo: 'a Qualidade marcou esta entrega como "quality_flag"' }],
      bloqueadasPorPilar: [{ pilar: "salario", motivo: "pilar bloqueado" }],
      naoInterpretadas: ["Criativos de Social"],
    }));
    const r = await colherPecasDasEntregas();
    expect(r.retidas).toHaveLength(3);
    expect(r.retidas.map((x) => x.nome)).toContain("Copy dos posts");
    expect(r.retidas.map((x) => x.motivo).join(" ")).toContain("quality_flag");
  });

  it("um projeto que estoura NÃO derruba a colheita dos outros", async () => {
    db.project.findMany.mockResolvedValue([
      { id: "proj-1", name: "quebrado" },
      { id: "proj-2", name: "são" },
    ]);
    agendador.agendarPostsDaEntrega
      .mockRejectedValueOnce(new Error("banco tossiu"))
      .mockResolvedValueOnce(colheitaVazia({ criados: 3 }));
    const r = await colherPecasDasEntregas();
    expect(r.criadas).toBe(3);
    expect(r.falhas.join(" ")).toContain("quebrado");
  });

  it("banco fora do ar NÃO vira 'nada a colher' — vira falha declarada", async () => {
    // Ausência de informação não é informação: silenciar aqui faria a casa
    // parada parecer a casa sem trabalho.
    db.project.findMany.mockRejectedValue(new Error("sem banco"));
    const r = await colherPecasDasEntregas();
    expect(r.criadas).toBe(0);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("nada aqui gasta, publica ou afrouxa portão — provado pelo FONTE", () => {
  const fonte = readFileSync(join(process.cwd(), "lib/agency/execution/produzir-agora.ts"), "utf8");
  const colheita = fonte.slice(fonte.indexOf("export async function colherPecasDasEntregas"));

  it("a colheita não chama o gerador de imagem", () => {
    expect(colheita).not.toMatch(/generateDesign|produzirArtesPendentes/);
  });

  it("a colheita não chama nenhuma plataforma", () => {
    expect(colheita).not.toMatch(/publishPost|graph\.facebook|googleapis|tiktok/i);
  });
});

describe("⭐ o relógio da casa passa a colher ANTES de pintar", () => {
  const relogio = readFileSync(join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

  it("a rodada chama a colheita", () => {
    expect(relogio).toMatch(/colherPecasDasEntregas\(\)/);
  });

  it("⭐ e a chama ANTES da perna de arte — colher depois é perder a rodada inteira", () => {
    // Esta é a ordem que era o defeito: a arte lia uma tabela que ninguém
    // enchia. Invertida, cada rodada pinta o que a rodada ANTERIOR colheu — e
    // uma peça nova espera 5 minutos a mais sem motivo.
    const ondeColhe = relogio.indexOf("colherPecasDasEntregas()");
    const ondePinta = relogio.indexOf("await produzirArtesPendentes()");
    expect(ondeColhe).toBeGreaterThan(-1);
    expect(ondePinta).toBeGreaterThan(-1);
    expect(ondeColhe).toBeLessThan(ondePinta);
  });
});
