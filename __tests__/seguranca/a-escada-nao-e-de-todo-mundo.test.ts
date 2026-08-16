// A ESCADA NÃO É DE TODO MUNDO — 16/08/2026.
//
// ── O DEFEITO QUE ESTE ARQUIVO TRANCA ─────────────────────────────────────
//
// `GET` e `POST /api/agency/escada` tinham `getSession()` sozinho: qualquer
// biscoito válido da casa entrava. Provado por execução: `design_staff`
// executou `acao: "descer"` em `social-media` e levou 200; `social_staff`
// executou `liberar_cliente` com um `clientId` arbitrário do corpo e levou 200.
//
// ── POR QUE ISTO DÓI MAIS DO QUE PARECE ───────────────────────────────────
//
// `descer` é **imediato e não exige evidência nenhuma** — e isso está certo,
// porque a casa precisa poder se proteger na hora. O preço é que qualquer
// funcionário derrubava um departamento inteiro para sombra e PARAVA A ENTREGA
// AO CLIENTE, sem prestar conta a ninguém. Num piloto 100% IA, sem revisor
// humano, a escada é a única proteção que sobrou: está no `CLAUDE.md` com todas
// as letras.
//
// ── A RÉGUA SAI DO INVENTÁRIO, NÃO DE PALPITE ─────────────────────────────
//
// `/agency/escada` é `acesso: "gestao"` **e** `administrativa: true`. A doutrina
// do próprio inventário diz que `administrativa` não fecha a porta da página —
// fecha o BOTÃO de dentro. Daí as duas réguas diferentes: gestão LÊ, direção
// ESCREVE. O PM lê e não escreve, e isso é a regra e não descuido —
// `podeAdministrar()` existe para dizer que coordenar a operação não é o mesmo
// que ter a chave do cofre.
//
// ── AS DUAS METADES ───────────────────────────────────────────────────────
//
// Barra o caso plantado (o funcionário derrubando departamento) e **não inventa
// problema no caso limpo** (a direção continua descendo, subindo e liberando;
// a gestão continua lendo).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import { eDirecao, eGestao } from "@/lib/agency/organizacao/autoridade";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const escada = vi.hoisted(() => ({
  estadoDaEscada: vi.fn(),
  subirDegrau: vi.fn(),
  descerDegrau: vi.fn(),
  liberarCliente: vi.fn(),
}));
const aplicarDecisoesDoDono = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));
vi.mock("@/lib/agency/escada/registro", () => escada);
vi.mock("@/lib/agency/escada/decisoes-do-dono", () => ({ aplicarDecisoesDoDono }));

function comSessao(role: string | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId: "w1" }
    : null;
}

/** Derivado, nunca escrito à mão — papel novo entra sozinho na prova. */
const PAPEIS = Object.keys(PERFIL_DO_PAPEL) as (keyof typeof PERFIL_DO_PAPEL)[];
/** Quem ESCREVE na escada: só a direção. */
const A_DIRECAO = PAPEIS.filter((p) => eDirecao(PERFIL_DO_PAPEL[p].autoridade));
/** Quem NÃO escreve: todo o resto, inclusive o PM. */
const O_RESTO = PAPEIS.filter((p) => !eDirecao(PERFIL_DO_PAPEL[p].autoridade));
/** Quem LÊ: gestão (master, diretor, PM). */
const A_GESTAO = PAPEIS.filter((p) => eGestao(PERFIL_DO_PAPEL[p].autoridade));
/** Quem não lê: os departamentos. */
const OS_DEPARTAMENTOS = PAPEIS.filter((p) => !eGestao(PERFIL_DO_PAPEL[p].autoridade));

const post = (corpo: unknown) =>
  ({ json: async () => corpo }) as unknown as Parameters<
    typeof import("@/app/api/agency/escada/route").POST
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
  comSessao(null);
  escada.estadoDaEscada.mockResolvedValue([]);
  escada.subirDegrau.mockResolvedValue({ ok: true, degrau: "allowlist" });
  escada.descerDegrau.mockResolvedValue({ ok: true, degrau: "sombra" });
  escada.liberarCliente.mockResolvedValue({ ok: true, degrau: "allowlist" });
  aplicarDecisoesDoDono.mockResolvedValue({ aplicadas: [] });
});

describe("GET /api/agency/escada — quem enxerga o degrau", () => {
  it("sem sessão nenhuma: 401, e o banco nem é consultado", async () => {
    const { GET } = await import("@/app/api/agency/escada/route");
    expect((await GET()).status).toBe(401);
    expect(escada.estadoDaEscada).not.toHaveBeenCalled();
  });

  it("⛔ departamento não lê a escada — a tela é `gestao` no inventário", async () => {
    const { GET } = await import("@/app/api/agency/escada/route");
    for (const papel of OS_DEPARTAMENTOS) {
      comSessao(papel);
      expect((await GET()).status, `${papel} leu a escada`).toBe(403);
    }
    expect(escada.estadoDaEscada).not.toHaveBeenCalled();
  });

  it("✅ a gestão continua lendo — a trava não achata quem é dono", async () => {
    const { GET } = await import("@/app/api/agency/escada/route");
    for (const papel of A_GESTAO) {
      comSessao(papel);
      expect((await GET()).status, `${papel} foi barrado na própria mesa`).toBe(200);
    }
  });

  it("papel desconhecido no biscoito é negado, nunca promovido", async () => {
    comSessao("papel_que_nao_existe");
    const { GET } = await import("@/app/api/agency/escada/route");
    expect((await GET()).status).toBe(403);
  });
});

describe("POST /api/agency/escada — DESCER, que para a entrega ao cliente", () => {
  it("⛔ O FURO PROVADO: design_staff NÃO derruba social-media para sombra", async () => {
    comSessao("design_staff");
    const { POST } = await import("@/app/api/agency/escada/route");
    const res = await POST(post({ departmentId: "social-media", acao: "descer", para: "sombra", motivo: "porque sim" }));

    expect(res.status).toBe(403);
    // A prova que importa: a escrita NÃO ACONTECEU.
    expect(escada.descerDegrau).not.toHaveBeenCalled();
  });

  it("⛔ e nenhum papel fora da direção desce nada — o PM inclusive", async () => {
    const { POST } = await import("@/app/api/agency/escada/route");
    for (const papel of O_RESTO) {
      comSessao(papel);
      const res = await POST(post({ departmentId: "design", acao: "descer", para: "sombra", motivo: "x" }));
      expect(res.status, `${papel} derrubou um departamento`).toBe(403);
    }
    expect(escada.descerDegrau).not.toHaveBeenCalled();
  });

  it("✅ a direção continua descendo — descer é imediato de propósito, e continua sendo", async () => {
    const { POST } = await import("@/app/api/agency/escada/route");
    for (const papel of A_DIRECAO) {
      comSessao(papel);
      const res = await POST(post({ departmentId: "design", acao: "descer", para: "sombra", motivo: "peça errada no ar" }));
      expect(res.status, `${papel} foi barrado ao proteger a casa`).toBe(200);
    }
    expect(escada.descerDegrau).toHaveBeenCalledTimes(A_DIRECAO.length);
  });
});

describe("POST /api/agency/escada — as outras três ações", () => {
  it("⛔ O FURO PROVADO: social_staff NÃO libera um clientId arbitrário do corpo", async () => {
    comSessao("social_staff");
    const { POST } = await import("@/app/api/agency/escada/route");
    const res = await POST(post({ departmentId: "design", acao: "liberar_cliente", clientId: "qualquer-um" }));

    expect(res.status).toBe(403);
    expect(escada.liberarCliente).not.toHaveBeenCalled();
  });

  it("⛔ subir também é escrita, e também fecha", async () => {
    const { POST } = await import("@/app/api/agency/escada/route");
    for (const papel of O_RESTO) {
      comSessao(papel);
      expect((await POST(post({ departmentId: "design", acao: "subir" }))).status, papel).toBe(403);
    }
    expect(escada.subirDegrau).not.toHaveBeenCalled();
  });

  it("⛔ e `aplicar_decisoes_do_dono` — o nome já diz de quem é", async () => {
    const { POST } = await import("@/app/api/agency/escada/route");
    for (const papel of O_RESTO) {
      comSessao(papel);
      expect((await POST(post({ departmentId: "design", acao: "aplicar_decisoes_do_dono" }))).status, papel).toBe(403);
    }
    expect(aplicarDecisoesDoDono).not.toHaveBeenCalled();
  });

  it("✅ a direção continua subindo, liberando e aplicando a decisão do dono", async () => {
    comSessao("master");
    const { POST } = await import("@/app/api/agency/escada/route");
    expect((await POST(post({ departmentId: "design", acao: "subir" }))).status).toBe(200);
    expect((await POST(post({ departmentId: "design", acao: "liberar_cliente", clientId: "c1" }))).status).toBe(200);
    expect((await POST(post({ departmentId: "design", acao: "aplicar_decisoes_do_dono" }))).status).toBe(200);
    expect(escada.subirDegrau).toHaveBeenCalledTimes(1);
    expect(escada.liberarCliente).toHaveBeenCalledTimes(1);
    expect(aplicarDecisoesDoDono).toHaveBeenCalledTimes(1);
  });

  it("o workspace vem da SESSÃO, nunca do corpo — barrar o papel e entregar o inquilino errado é a segunda porta", async () => {
    comSessao("diretor");
    const { POST } = await import("@/app/api/agency/escada/route");
    await POST(post({ departmentId: "design", acao: "descer", para: "sombra", motivo: "x", workspaceId: "w-do-vizinho" }));
    expect(escada.descerDegrau).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  it("a negativa não conta ao chamador em que degrau a casa está", async () => {
    comSessao("design_staff");
    const { POST } = await import("@/app/api/agency/escada/route");
    const corpo = JSON.stringify(await (await POST(post({ departmentId: "social-media", acao: "descer" }))).json());
    for (const vazamento of ["degrau", "sombra", "allowlist", "wide", "social-media"]) {
      expect(corpo.includes(vazamento), `a negativa vazou "${vazamento}"`).toBe(false);
    }
  });
});
