// A ROTA QUE LEVA A APROVAÇÃO PARADA PARA A TELA — 16/08/2026.
//
// O relógio já conta e faz `log`. **Log do Railway não é tela**: fila que só
// existe se alguém lembrar de abrir o console é a mesma fila morta de sempre.
// Esta rota é o que faz o número chegar em `/agency/approvals`.
//
// O que este arquivo tranca:
//   • ela LÊ. Não aprova, não reprova, não expira card, não avisa ninguém —
//     aprovar no lugar do cliente é falsificar o consentimento dele;
//   • a permissão vem da MESMA linha do inventário que decide a tela, e não de
//     um `requireSession()` largo (o furo consertado nas rotas da porta da
//     frente no mesmo dia);
//   • falha de leitura NÃO vira fila vazia.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const db = vi.hoisted(() => ({
  approvalRequest: { findMany: vi.fn(), count: vi.fn() },
  client: { findMany: vi.fn() },
  // A rota passou a perguntar quantos inquilinos existem antes de decidir se o
  // card órfão pode ser atribuído a alguém. Ver o comentário do `semDono`.
  agencyWorkspace: { findMany: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks();
  comSessao("master");
  db.client.findMany.mockResolvedValue([{ id: "c1" }]);
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.approvalRequest.count.mockResolvedValue(0);
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: "w1" }]);
});

describe("GET /api/agency/aprovacoes-paradas", () => {
  it("sem sessão: 401, e o banco nem é consultado", async () => {
    comSessao(null);
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    expect((await GET()).status).toBe(401);
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  it("papel de cliente e papel desconhecido: 403 — fecha por omissão", async () => {
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    for (const papel of ["client", "papel_que_nao_existe"]) {
      comSessao(papel);
      expect((await GET()).status, `${papel} entrou`).toBe(403);
    }
  });

  it("✅ o Centro de Aprovações é transversal — toda a casa continua lendo", async () => {
    // `/agency/approvals` é `todos_internos` no inventário: é onde a casa
    // inteira se enxerga. A trava não pode achatar isso de carona.
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    for (const papel of ["master", "diretor", "project_manager", "executivo_comercial", "social_staff", "design_staff", "ads_staff", "tech_staff"]) {
      comSessao(papel);
      expect((await GET()).status, `${papel} foi barrado`).toBe(200);
    }
  });

  it("🔴 A BOLA NOSSA SOBE SEPARADA, e a fila vem com ela em cima", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "velho-deles", department: "social", createdAt: new Date(Date.now() - 30 * DIA), expiresAt: null, questionOpenedAt: null, clientId: "c1", clientRequestId: null },
      { id: "novo-nosso", department: "design", createdAt: new Date(Date.now() - 2 * DIA), expiresAt: null, questionOpenedAt: new Date(), clientId: "c1", clientRequestId: null },
    ]);
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 0 : 2,
    );
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const body = await (await GET()).json();

    expect(body.medido).toBe(true);
    expect(body.resumo.paradas).toBe(2);
    expect(body.resumo.bolaConosco).toBe(1);
    // Somar os dois cobraria o cliente pelo atraso da própria casa.
    expect(body.resumo.bolaConosco).toBeLessThan(body.resumo.paradas);
    // Ler a cobrança do cliente antes da própria é ler ao contrário — mesmo
    // quando a dívida nossa é a MAIS NOVA das duas.
    expect(body.fila[0].id).toBe("novo-nosso");
    expect(body.fila[0].bolaConosco).toBe(true);
  });

  it("o card SEM DONO é contado à parte, nunca engolido", async () => {
    // A contagem de órfão é a que leva `clientRequestId: null`; a outra é a da
    // fila do inquilino.
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 4 : 0,
    );
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const body = await (await GET()).json();
    expect(body.semDono).toBe(4);
    // Ele NÃO entra na fila por workspace — varrer órfão de outro inquilino
    // seria vazamento entre clientes.
    expect(body.resumo.paradas).toBe(0);
  });

  // ── ⛔ O ÓRFÃO DO BANCO INTEIRO SERVIDO A UM INQUILINO ───────────────────
  //
  // A rota contava `approvalRequest` órfão do banco inteiro e devolvia o número
  // para qualquer inquilino — três linhas abaixo de um comentário dizendo que
  // varrer órfão alheio é vazamento entre clientes. Com dois inquilinos, o A
  // lia o órfão do B como se fosse dele.
  it("⛔ com MAIS DE UM inquilino, o órfão vira NULO com motivo — nunca zero, nunca do vizinho", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "w1" }, { id: "w2" }]);
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 7 : 0,
    );
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const body = await (await GET()).json();
    // Nem 7 (seria vazamento) nem 0 (seria afirmar que não há nenhum).
    expect(body.semDono).toBeNull();
    expect(body.motivoDoSemDono).toContain("mais de um inquilino");
  });

  it("⛔ a contagem separa o que LISTA do que CONTA, e a tela recebe o aviso", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "a", department: "design", createdAt: new Date(), expiresAt: null, questionOpenedAt: null, clientId: "c1", clientRequestId: null },
    ]);
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 0 : 250,
    );
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const body = await (await GET()).json();
    expect(body.resumo.paradas).toBe(250);
    expect(body.resumo.amostrada).toBe(true);
  });

  // ── ⛔ O NÚMERO QUE COBRAVA O CLIENTE PELO ATRASO DA CASA ────────────────
  it("⛔ a rota devolve `esperandoOCliente` separado do total, e os relógios separados", async () => {
    const DIA6 = new Date(Date.now() - 6 * DIA);
    const DIA1 = new Date(Date.now() - 1 * DIA);
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "nosso", department: "design", createdAt: DIA6, expiresAt: null, questionOpenedAt: new Date(), clientId: "c1", clientRequestId: null },
      { id: "nosso2", department: "design", createdAt: DIA6, expiresAt: null, questionOpenedAt: new Date(), clientId: "c1", clientRequestId: null },
      { id: "dele", department: "social", createdAt: DIA1, expiresAt: null, questionOpenedAt: null, clientId: "c1", clientRequestId: null },
    ]);
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 0 : 3,
    );
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const body = await (await GET()).json();
    expect(body.resumo.paradas).toBe(3);
    expect(body.resumo.bolaConosco).toBe(2);
    // A faixa imprimia 3 aqui, sob o rótulo "esperando a decisão dele".
    expect(body.resumo.esperandoOCliente).toBe(1);
    // E datava a espera dele com o relógio de um card PAUSADO.
    expect(body.resumo.maisAntigoDeleEmDias).toBe(1);
    expect(body.resumo.maisAntigoNossoEmDias).toBe(6);
  });

  it("⛔ falha de leitura NÃO vira fila vazia: 503 dizendo que não foi medida", async () => {
    db.approvalRequest.findMany.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/agency/aprovacoes-paradas/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.medido).toBe(false);
    expect(body.motivo).toContain("NÃO é zero");
    // Nem sombra de fila: 0 aqui seria a afirmação errada com cara de fato.
    expect(body.resumo).toBeUndefined();
    expect(body.fila).toBeUndefined();
  });

  it("a rota NÃO tem verbo de escrita — ela era para LER", async () => {
    // Um botão de "aprovar por ele" nascendo aqui por conveniência seria
    // consentimento falsificado, e é o único erro da lista sem desfazer.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/agency/aprovacoes-paradas/route.ts"), "utf8");
    for (const verbo of ["export async function POST", "export async function PATCH", "export async function PUT", "export async function DELETE"]) {
      expect(src.includes(verbo), `a rota ganhou ${verbo}`).toBe(false);
    }
    expect(src.includes("export async function GET")).toBe(true);
  });
});
