// GET /api/agency/porta — A ROTA QUE LEVA A FILA DA PORTA PARA A TELA.
//
// ── POR QUE ESTE ARQUIVO NASCEU DEPOIS (16/08/2026) ───────────────────────
//
// A rota irmã (`/api/agency/aprovacoes-paradas`) tinha teste de 503 desde o
// primeiro dia. Esta **não tinha**, e a falta escondeu o defeito mais grave da
// frente: `quemBateuNaPorta` fazia `.catch(() => [])`, então com o banco caído
// a rota devolvia **200 · `medido: true` · `fila: []`**, a tela imprimia
// *"Isto é boa notícia: todo briefing que chegou já foi atendido"*, e o `catch`
// que existe para dizer *"esta fila NÃO é zero, é desconhecida"* era
// **inalcançável**.
//
// Um `catch` sem teste é um `catch` que ninguém sabe se roda. Este arquivo é a
// prova de que ele roda — e a trava que impede o `.catch(() => [])` de voltar,
// porque com ele de volta o 503 vira 200 e estes testes ficam vermelhos.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

function comSessao(role: string | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId: "w1" }
    : null;
}

const DIA = 86_400_000;

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "r1", businessName: "Sushi Cazza", status: "new", rawContext: "",
    briefingJson: JSON.stringify({ contato: { email: "dono@sushicazza.com.br" } }),
    sdrHandoffJson: null,
    createdAt: new Date(Date.now() - 5 * DIA),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  comSessao("master");
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.clientRequestDb.count.mockResolvedValue(0);
});

describe("GET /api/agency/porta", () => {
  it("sem sessão: 401, e o banco nem é consultado", async () => {
    comSessao(null);
    const { GET } = await import("@/app/api/agency/porta/route");
    expect((await GET()).status).toBe(401);
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
  });

  it("a fila da porta é `dono_e_gestao` — quem não é da linha do inventário leva 403", async () => {
    // O dossiê traz nome, segmento, o que a pessoa contou, e-mail e WhatsApp de
    // quem só falou com a porta pública. O menu escondia; a API servia.
    const { GET } = await import("@/app/api/agency/porta/route");
    for (const papel of ["client", "design_staff", "social_staff", "papel_que_nao_existe"]) {
      comSessao(papel);
      expect((await GET()).status, `${papel} entrou`).toBe(403);
    }
  });

  it("quem manda no comercial lê", async () => {
    const { GET } = await import("@/app/api/agency/porta/route");
    for (const papel of ["master", "diretor", "project_manager", "executivo_comercial"]) {
      comSessao(papel);
      expect((await GET()).status, `${papel} foi barrado`).toBe(200);
    }
  });

  // ── ⛔ O FURO PROVADO ───────────────────────────────────────────────────
  //
  // Com o `.catch(() => [])` de volta em `quemBateuNaPorta`, esta rota volta a
  // devolver 200 com `medido: true` e `fila: []`, e os três `expect` abaixo
  // ficam vermelhos. É a régua: o teste tem de reprovar o defeito quando o
  // conserto é revertido.
  it("⛔ banco fora do ar NÃO vira fila vazia: 503 dizendo que não foi medida", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/agency/porta/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.medido).toBe(false);
    expect(body.motivo).toContain("NÃO é zero");
    // Nem sombra de fila: 0 aqui seria a afirmação errada com cara de fato, e é
    // ela que a tela transforma em "todo briefing já foi atendido".
    expect(body.resumo).toBeUndefined();
    expect(body.fila).toBeUndefined();
  });

  it("⛔ a CONTAGEM caindo também vira 503 — não um total menor em silêncio", async () => {
    db.clientRequestDb.count.mockRejectedValue(new Error("count down"));
    const { GET } = await import("@/app/api/agency/porta/route");
    expect((await GET()).status).toBe(503);
  });

  it("a metade oposta: com o banco de pé, a fila vem medida e ordenada pelo mais antigo", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ id: "novo", createdAt: new Date(Date.now() - 1 * DIA) }),
      pedido({ id: "velho", createdAt: new Date(Date.now() - 51 * DIA) }),
    ]);
    db.clientRequestDb.count.mockResolvedValue(2);
    const { GET } = await import("@/app/api/agency/porta/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.medido).toBe(true);
    expect(body.resumo.naPorta).toBe(2);
    // Os 51 dias na PRIMEIRA linha, não na última.
    expect(body.fila[0].id).toBe("velho");
  });

  it("a tela recebe o aviso de amostra quando a fila passa do teto da lista", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    db.clientRequestDb.count.mockResolvedValue(250);
    const { GET } = await import("@/app/api/agency/porta/route");
    const body = await (await GET()).json();
    expect(body.resumo.naPorta).toBe(250);
    expect(body.resumo.amostrada).toBe(true);
  });

  it("UMA leitura do banco por chamada — o resumo e a fila saem do mesmo `findMany`", async () => {
    // A versão de 16/08 chamava `resumoDaPorta` e `quemBateuNaPorta` em
    // paralelo. Com a contagem virando consulta própria, isso seriam 4 idas ao
    // banco para responder uma pergunta.
    const { GET } = await import("@/app/api/agency/porta/route");
    await GET();
    expect(db.clientRequestDb.findMany).toHaveBeenCalledTimes(1);
    expect(db.clientRequestDb.count).toHaveBeenCalledTimes(1);
  });
});
