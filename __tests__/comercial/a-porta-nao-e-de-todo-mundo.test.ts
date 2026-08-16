// A FILA DA PORTA NÃO É DE TODO MUNDO — 16/08/2026.
//
// ── O DEFEITO QUE ESTE ARQUIVO TRANCA ─────────────────────────────────────
//
// `GET /api/agency/porta` e `GET /api/agency/leads` nasceram com
// `requireSession()`: "tem biscoito válido da casa, entra". A TELA que as duas
// alimentam (`/agency/leads`) é `dono_e_gestao` no inventário de páginas —
// Atendimento, master, diretor e PM.
//
// Ou seja: o menu escondia a tela de Design, Social, Tráfego e Tecnologia, e a
// API entregava a fila inteira a qualquer um deles com um `curl`. Nome do
// negócio, o que a pessoa contou em confidência, e-mail e WhatsApp de quem só
// falou com a porta pública. Menu filtrado não é proteção — é arrumação, e é a
// primeira frase de `lib/agency/organizacao/guarda.ts`.
//
// ── AS DUAS METADES ───────────────────────────────────────────────────────
//
// Barra o caso plantado (o departamento que não é dono, e o não-autenticado) e
// **não inventa problema no caso limpo** (Atendimento e a direção continuam
// lendo). Meia trava é pior que trava nenhuma: parece inteira.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn() },
}));
const listClientRequests = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/client-request-service", () => ({ listClientRequests }));

function comSessao(role: string | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId: "w1" }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  comSessao(null);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  listClientRequests.mockResolvedValue([]);
});

/** Os papéis que NÃO são donos da porta da frente nem são direção. */
const DE_FORA = ["social_staff", "design_staff", "ads_staff", "tech_staff"];
/** Quem tem de continuar entrando: o dono da área e a gestão. */
const DE_DENTRO = ["executivo_comercial", "master", "diretor", "project_manager"];

describe("GET /api/agency/porta — a contagem da fila", () => {
  it("sem sessão nenhuma: 401, e nada é lido do banco", async () => {
    const { GET } = await import("@/app/api/agency/porta/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
  });

  it("papel de cliente com biscoito válido: 403 — o portal não entra na área interna", async () => {
    comSessao("client");
    const { GET } = await import("@/app/api/agency/porta/route");
    expect((await GET()).status).toBe(403);
  });

  it("papel desconhecido no biscoito é negado, nunca promovido", async () => {
    // Biscoito antigo com papel renomeado, ou papel forjado. Fecha por omissão.
    comSessao("papel_que_nao_existe");
    const { GET } = await import("@/app/api/agency/porta/route");
    expect((await GET()).status).toBe(403);
  });

  it("⛔ departamento que não é dono da porta: 403, e o banco nem é consultado", async () => {
    const { GET } = await import("@/app/api/agency/porta/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      const res = await GET();
      expect(res.status, `${papel} passou na fila da porta`).toBe(403);
    }
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam lendo — a trava não achata quem é dono", async () => {
    const { GET } = await import("@/app/api/agency/porta/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      const res = await GET();
      expect(res.status, `${papel} foi barrado na própria mesa`).toBe(200);
      expect((await res.json()).medido).toBe(true);
    }
  });

  it("a negativa não conta ao chamador o que existe do outro lado", async () => {
    // Resposta opaca para fora: sem contagem, sem nome de negócio, sem dizer
    // qual departamento é o dono (que é mapa da casa para quem sonda).
    comSessao("design_staff");
    const { GET } = await import("@/app/api/agency/porta/route");
    const corpo = JSON.stringify(await (await GET()).json());
    for (const vazamento of ["naPorta", "fila", "resumo", "client-service-sdr"]) {
      expect(corpo.includes(vazamento), `a negativa vazou "${vazamento}"`).toBe(false);
    }
  });
});

describe("GET /api/agency/leads — o dossiê, que é a parte com contato dentro", () => {
  it("sem sessão: 401", async () => {
    const { GET } = await import("@/app/api/agency/leads/route");
    expect((await GET()).status).toBe(401);
  });

  it("⛔ departamento que não é dono: 403, e a leitura nem acontece", async () => {
    const { GET } = await import("@/app/api/agency/leads/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      expect((await GET()).status, `${papel} leu o dossiê`).toBe(403);
    }
    expect(listClientRequests).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam lendo", async () => {
    const { GET } = await import("@/app/api/agency/leads/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      expect((await GET()).status, `${papel} foi barrado`).toBe(200);
    }
  });

  it("a leitura é escopada pelo workspace da SESSÃO, nunca por parâmetro", async () => {
    // `workspaceId` vindo da requisição seria a segunda porta: barra o papel e
    // entrega o inquilino errado.
    comSessao("executivo_comercial");
    const { GET } = await import("@/app/api/agency/leads/route");
    await GET();
    expect(listClientRequests).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });
});
