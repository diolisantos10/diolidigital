// A FILA COMERCIAL NÃO É DE TODO MUNDO — 16/08/2026.
//
// ── A LARGURA ANTIGA, ONDE ELA AINDA EXISTIA ──────────────────────────────
//
// Mesmo defeito já consertado na porta da frente, ainda aberto em
// `/api/agency/oportunidades` — e aqui **incluindo escrita**:
//
//   • `GET`  e `POST /api/agency/oportunidades`      → `requireSession()` sozinho
//   • `PATCH /api/agency/oportunidades/[id]`          → `requireSession()` sozinho
//   • `GET   /api/agency/oportunidades/caixa`         → `getSession()` sozinho
//
// A tela que as quatro servem, `/agency/oportunidades`, é `dono_e_gestao` do
// Atendimento no inventário. O menu escondia; a API entregava a qualquer um com
// um `curl`. **A posse já estava certa** (`workspaceId` dentro do `updateMany`,
// 404 e não 403) — o buraco era só a largura.
//
// O `PATCH` é o mais caro dos quatro: ele **aprova, recusa e marca proposta como
// enviada**, e "enviada" gasta conexão paga do 99Freelas, que não volta.
// `design_staff` fazia tudo isso.
//
// E o `GET` da caixa ficou para trás quando `POST` e `DELETE` foram trancados em
// `master`: ele devolve o endereço da caixa da agência, os remetentes vigiados e
// remetente + assunto das últimas 20 mensagens lidas — PII de terceiro que
// ninguém autorizou a casa inteira a ler.
//
// ── AS DUAS METADES ───────────────────────────────────────────────────────
//
// Barra o departamento que não é dono e **não achata o Atendimento nem a
// gestão**, que continuam lendo, registrando e decidindo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import { eGestao } from "@/lib/agency/organizacao/autoridade";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const db = vi.hoisted(() => ({
  oportunidade: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  emailDoRadar: { findMany: vi.fn(), groupBy: vi.fn() },
}));
const registrarOportunidade = vi.hoisted(() => vi.fn());
const qualificarEGravar = vi.hoisted(() => vi.fn());
const estadoDaCaixa = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/comercial/pipeline", () => ({
  qualificarEGravar,
  lerOportunidade: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/agency/comercial/caixa-de-entrada/cofre", () => ({
  estadoDaCaixa,
  guardarCredencial: vi.fn(),
  apagarCredencial: vi.fn(),
  credencialDoAmbienteAtiva: () => false,
}));

function comSessao(role: string | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId: "w1" }
    : null;
}

/** Derivado, nunca escrito à mão: papel novo entra sozinho nas duas metades. */
const PAPEIS = Object.keys(PERFIL_DO_PAPEL) as (keyof typeof PERFIL_DO_PAPEL)[];
/** Dono da área + gestão. É quem TEM de continuar entrando. */
const DE_DENTRO = PAPEIS.filter(
  (p) =>
    eGestao(PERFIL_DO_PAPEL[p].autoridade) ||
    PERFIL_DO_PAPEL[p].departamentos.includes("client-service-sdr"),
);
/** Os departamentos que não são donos da porta da frente. */
const DE_FORA = PAPEIS.filter((p) => !DE_DENTRO.includes(p));

const comQuery = (qs = "") =>
  ({
    nextUrl: { searchParams: new URLSearchParams(qs) },
    json: async () => ({ texto: "projeto de social media, R$ 2.000" }),
  }) as unknown as Parameters<typeof import("@/app/api/agency/oportunidades/route").GET>[0];

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const comCorpo = (corpo: unknown) =>
  ({ json: async () => corpo }) as unknown as Parameters<
    typeof import("@/app/api/agency/oportunidades/[id]/route").PATCH
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
  comSessao(null);
  db.oportunidade.findMany.mockResolvedValue([]);
  db.oportunidade.findFirst.mockResolvedValue({ id: "o1", plataforma: "outra" });
  db.oportunidade.updateMany.mockResolvedValue({ count: 1 });
  db.emailDoRadar.findMany.mockResolvedValue([]);
  db.emailDoRadar.groupBy.mockResolvedValue([]);
  registrarOportunidade.mockResolvedValue({ ok: true, jaExistia: true, oportunidade: { id: "o1" } });
  qualificarEGravar.mockResolvedValue({ gravou: false, motivo: "teste" });
  estadoDaCaixa.mockResolvedValue({ configurada: false, origem: "nenhuma" });
});

vi.mock("@/lib/agency/comercial/oportunidade", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, registrarOportunidade };
});

describe("GET /api/agency/oportunidades — a fila de triagem", () => {
  it("sem sessão nenhuma: 401, e o banco nem é consultado", async () => {
    const { GET } = await import("@/app/api/agency/oportunidades/route");
    expect((await GET(comQuery())).status).toBe(401);
    expect(db.oportunidade.findMany).not.toHaveBeenCalled();
  });

  it("⛔ departamento que não é dono da porta: 403, e o banco nem é consultado", async () => {
    const { GET } = await import("@/app/api/agency/oportunidades/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      expect((await GET(comQuery())).status, `${papel} leu a fila comercial`).toBe(403);
    }
    expect(db.oportunidade.findMany).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam lendo — a trava não achata quem é dono", async () => {
    const { GET } = await import("@/app/api/agency/oportunidades/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      expect((await GET(comQuery())).status, `${papel} foi barrado na própria mesa`).toBe(200);
    }
  });

  it("a leitura continua escopada pelo workspace da SESSÃO", async () => {
    comSessao("executivo_comercial");
    const { GET } = await import("@/app/api/agency/oportunidades/route");
    await GET(comQuery());
    expect(db.oportunidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "w1" }) }),
    );
  });

  it("a negativa não conta ao chamador o que existe do outro lado", async () => {
    comSessao("design_staff");
    const { GET } = await import("@/app/api/agency/oportunidades/route");
    const corpo = JSON.stringify(await (await GET(comQuery())).json());
    for (const vazamento of ["oportunidades", "total", "client-service-sdr"]) {
      expect(corpo.includes(vazamento), `a negativa vazou "${vazamento}"`).toBe(false);
    }
  });
});

describe("POST /api/agency/oportunidades — registrar é escrita", () => {
  it("⛔ departamento de fora não registra oportunidade, e a ingestão nem roda", async () => {
    const { POST } = await import("@/app/api/agency/oportunidades/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      expect((await POST(comQuery())).status, papel).toBe(403);
    }
    expect(registrarOportunidade).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam registrando", async () => {
    const { POST } = await import("@/app/api/agency/oportunidades/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      expect((await POST(comQuery())).status, papel).toBe(200);
    }
    expect(registrarOportunidade).toHaveBeenCalledTimes(DE_DENTRO.length);
  });
});

describe("PATCH /api/agency/oportunidades/[id] — a DECISÃO, que é a metade cara", () => {
  it("⛔ O FURO PROVADO: design_staff não aprova, não recusa e não marca como enviada", async () => {
    comSessao("design_staff");
    const { PATCH } = await import("@/app/api/agency/oportunidades/[id]/route");
    const res = await PATCH(comCorpo({ status: "aprovada" }), ctx("o1"));

    expect(res.status).toBe(403);
    // A prova que importa: a escrita NÃO ACONTECEU.
    expect(db.oportunidade.updateMany).not.toHaveBeenCalled();
  });

  it("⛔ e vale para todo departamento que não é dono da porta", async () => {
    const { PATCH } = await import("@/app/api/agency/oportunidades/[id]/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      expect((await PATCH(comCorpo({ status: "recusada" }), ctx("o1"))).status, papel).toBe(403);
    }
    expect(db.oportunidade.updateMany).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam decidindo — a trava não achata quem é dono", async () => {
    const { PATCH } = await import("@/app/api/agency/oportunidades/[id]/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      expect((await PATCH(comCorpo({ status: "aprovada" }), ctx("o1"))).status, papel).toBe(200);
    }
    expect(db.oportunidade.updateMany).toHaveBeenCalledTimes(DE_DENTRO.length);
  });

  it("a posse continua no WHERE da própria escrita — a largura não substituiu a posse", async () => {
    comSessao("executivo_comercial");
    const { PATCH } = await import("@/app/api/agency/oportunidades/[id]/route");
    await PATCH(comCorpo({ status: "aprovada" }), ctx("o1"));
    expect(db.oportunidade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1", workspaceId: "w1" } }),
    );
  });
});

describe("GET /api/agency/oportunidades/caixa — a que ficou para trás", () => {
  it("⛔ departamento de fora não vê a caixa da agência nem o histórico do que ela leu", async () => {
    const { GET } = await import("@/app/api/agency/oportunidades/caixa/route");
    for (const papel of DE_FORA) {
      comSessao(papel);
      expect((await GET()).status, `${papel} leu a caixa da agência`).toBe(403);
    }
    expect(db.emailDoRadar.findMany).not.toHaveBeenCalled();
    expect(estadoDaCaixa).not.toHaveBeenCalled();
  });

  it("✅ Atendimento e a direção continuam vendo o estado da caixa", async () => {
    const { GET } = await import("@/app/api/agency/oportunidades/caixa/route");
    for (const papel of DE_DENTRO) {
      comSessao(papel);
      expect((await GET()).status, `${papel} foi barrado`).toBe(200);
    }
  });

  it("a escrita da credencial continua sendo SÓ do master — a largura não alargou o cofre", async () => {
    // `exigirAdministracao` teria entregado a chave da caixa de e-mail da
    // agência ao diretor sem ninguém decidir isso. Alargar sem ordem é o inverso
    // do trabalho desta frente.
    const { POST, DELETE } = await import("@/app/api/agency/oportunidades/caixa/route");
    for (const papel of PAPEIS.filter((p) => p !== "master")) {
      comSessao(papel);
      expect((await POST(comCorpo({}))).status, `${papel} guardou credencial`).toBe(403);
      expect((await DELETE()).status, `${papel} apagou credencial`).toBe(403);
    }
  });
});
