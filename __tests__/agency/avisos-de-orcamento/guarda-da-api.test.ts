// A API DE AVISOS DE ORÇAMENTO DIZ O MESMO QUE A PÁGINA (16/08/2026).
//
// `route.ts` usava `requireSession()` sem `allowedRoles`: qualquer papel
// interno autenticado passava e disparava reenvio de e-mail REAL a prospect.
// A TELA que a consome (`/agency/avisos-de-orcamento/page.tsx`) sempre foi
// mais estreita — `paginas.ts` diz `acesso: "dono_e_gestao"`, ou seja, só
// gestão (master/diretor/PM) e o departamento `client-service-sdr` chegam lá.
// Página e API diziam coisas diferentes sobre quem pode disparar aquele
// e-mail — porta lateral que a próxima auditoria teria de reencontrar.
//
// O Diretor fechou a divergência: `autenticar()` passou a chamar
// `exigirApiInterna("/agency/avisos-de-orcamento")`, a MESMA função (e a
// MESMA `podeAbrirRota`) que decide se a página abre. Este teste prova as
// duas metades, de verdade — chamando GET/POST, não lendo o texto da rota:
//
//   ✅ gestão e `client-service-sdr` passam;
//   ⛔ papel interno fora dessa lista (ex.: `social_staff`) é barrado NA API;
//   ✅ o caminho por segredo de operação continua passando sem sessão nenhuma;
//   ⛔ sem sessão e sem segredo continua barrado.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AgencyRole } from "@/lib/agency/roles";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));

function comSessao(role: AgencyRole | "client" | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "e@x", name: "N", role, workspaceId: "w1" }
    : null;
}

// A esteira (e-mail de verdade) é mockada — este teste é sobre QUEM alcança
// a rota, não sobre o corpo do reenvio (isso já é `rota.test.ts` e os testes
// de `orcamento-do-briefing.ts`).
const reenviarAvisosQueFalharam = vi.hoisted(() => vi.fn());
const contarAvisosLegados = vi.hoisted(() => vi.fn());
const reenviarAvisosLegados = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agency/esteira/orcamento-do-briefing", () => ({
  reenviarAvisosQueFalharam,
  contarAvisosLegados,
  reenviarAvisosLegados,
}));

// Sem linhas no banco: o guarda decide antes de qualquer trabalho de dado
// importar — as consultas abaixo só precisam não explodir.
const queryRawUnsafe = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));

import { GET, POST } from "@/app/api/agency/avisos-de-orcamento/route";

function req(method: "GET" | "POST", bearer?: string) {
  const headers: Record<string, string> = {};
  if (bearer) headers["authorization"] = `Bearer ${bearer}`;
  return new NextRequest("http://localhost/api/agency/avisos-de-orcamento", { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  comSessao(null);
  reenviarAvisosQueFalharam.mockResolvedValue({ reenviados: 0, aindaFalhando: 0, falhas: [] });
  contarAvisosLegados.mockResolvedValue({ total: 0, itens: [] });
  reenviarAvisosLegados.mockResolvedValue({ reenviados: 0, aindaFalhando: 0, falhas: [] });
  queryRawUnsafe.mockResolvedValue([]);
  process.env.PILOTO_SECRET = "segredo-de-teste";
  delete process.env.CRON_SECRET;
});

describe("sem sessão e sem segredo — barrado nas duas rotas", () => {
  it("GET devolve 401 e não toca no banco nem na esteira", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("POST devolve 401 e não dispara reenvio nenhum", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
    expect(reenviarAvisosQueFalharam).not.toHaveBeenCalled();
  });
});

describe("papel interno fora de gestão/client-service-sdr é barrado NA API", () => {
  it("social_staff: GET devolve 403 e não toca no banco", async () => {
    comSessao("social_staff");
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("social_staff: POST devolve 403 e não dispara reenvio", async () => {
    comSessao("social_staff");
    const res = await POST(req("POST"));
    expect(res.status).toBe(403);
    expect(reenviarAvisosQueFalharam).not.toHaveBeenCalled();
  });

  it("design_staff também é barrado — a lista é a mesma da página, não um caso especial de Social", async () => {
    comSessao("design_staff");
    expect((await GET(req("GET"))).status).toBe(403);
  });
});

describe("gestão e client-service-sdr passam — a mesma linha do inventário da página", () => {
  it("master alcança o GET", async () => {
    comSessao("master");
    expect((await GET(req("GET"))).status).toBe(200);
  });

  it("project_manager (gestão) alcança o GET e o POST", async () => {
    comSessao("project_manager");
    expect((await GET(req("GET"))).status).toBe(200);
    expect((await POST(req("POST"))).status).toBe(200);
    expect(reenviarAvisosQueFalharam).toHaveBeenCalled();
  });

  it("executivo_comercial (dono do departamento client-service-sdr) alcança o GET e o POST", async () => {
    comSessao("executivo_comercial");
    expect((await GET(req("GET"))).status).toBe(200);
    expect((await POST(req("POST"))).status).toBe(200);
  });
});

describe("o caminho por segredo de operação não foi tocado pela mudança", () => {
  it("sem sessão nenhuma, o Bearer com PILOTO_SECRET passa no GET e no POST", async () => {
    comSessao(null);
    expect((await GET(req("GET", "segredo-de-teste"))).status).toBe(200);
    expect((await POST(req("POST", "segredo-de-teste"))).status).toBe(200);
  });

  it("segredo errado, sem sessão: continua 401 — não é 403 (nunca teve papel para negar)", async () => {
    comSessao(null);
    const res = await GET(req("GET", "segredo-errado"));
    expect(res.status).toBe(401);
  });

  it("o segredo entra ANTES da checagem de papel: mesmo um papel que a API bloqueia não atrapalha o Bearer certo", async () => {
    comSessao("social_staff");
    const res = await GET(req("GET", "segredo-de-teste"));
    expect(res.status).toBe(200);
  });
});
