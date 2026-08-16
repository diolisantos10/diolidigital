// A FICHA DE MARCA TEM DONO — 16/08/2026.
//
// ── O DEFEITO QUE ESTE ARQUIVO TRANCA ─────────────────────────────────────
//
// `GET` e `PUT /api/agency/clients/[id]/marca` pegavam o `id` da URL, conferiam
// só que existia uma sessão, e iam direto para `lerFichaDeMarca(id)` e
// `gravarRespostaDeMarca({ clientId: id })`. A palavra `workspaceId` não
// aparecia UMA vez no arquivo inteiro.
//
// Provado por execução, não por leitura: uma sessão de `design_staff` do
// workspace A **leu e escreveu** a ficha de marca de um cliente do workspace B.
// 200 nas duas.
//
// Não é vazamento de dado bonito de contar — é pior. A ficha de marca é o que o
// **portão de entrega** consulta antes de deixar uma peça ser publicada. Quem
// escreve nela move o portão de publicação de qualquer cliente de qualquer
// inquilino. É a régua da entrega, e ela estava aberta.
//
// ── AS DUAS METADES ───────────────────────────────────────────────────────
//
// Barra o caso plantado (o cliente do vizinho, o papel de fora, a sessão de
// portal) e **não inventa problema no caso limpo** (a casa inteira continua
// lendo e escrevendo a ficha dos PRÓPRIOS clientes — `/agency/clients` é
// `todos_internos` no inventário, e nenhum papel foi achatado).
//
// Meia trava é pior que trava nenhuma: parece inteira.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));
const db = vi.hoisted(() => ({ client: { findFirst: vi.fn() } }));
const lerFichaDeMarca = vi.hoisted(() => vi.fn());
const gravarRespostaDeMarca = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/ficha-de-marca", () => ({
  lerFichaDeMarca,
  proximasPerguntas: () => [],
  CAMPOS_DA_MARCA: ["proposito_e_promessa"],
  COLUNA_DA_FICHA: { proposito_e_promessa: "purposeAndPromise" },
  COLUNA_EH_JSON: new Set<string>(),
}));
vi.mock("@/lib/agency/esteira/escrita-da-ficha", () => ({
  COLUNA: { proposito_e_promessa: "purposeAndPromise" },
  gravarRespostaDeMarca,
}));

/** A sessão da casa. `clientId` só existe em token de PORTAL. */
function comSessao(role: string | null, extras: Record<string, unknown> = {}) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId: "w1", ...extras }
    : null;
}

const FICHA = {
  definidos: 3,
  lacunas: [],
  naoConstituida: false,
  oQueFaltaParaPublicar: [],
};

/** O cliente do PRÓPRIO inquilino: a consulta escopada acha. */
function clienteDaCasa() {
  db.client.findFirst.mockResolvedValue({ id: "cliente-daqui" });
}
/** O cliente do VIZINHO: a consulta escopada por workspace não acha nada. */
function clienteDoVizinho() {
  db.client.findFirst.mockResolvedValue(null);
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const reqPut = (campos: Record<string, unknown>) =>
  ({ json: async () => ({ campos }) }) as unknown as Parameters<
    typeof import("@/app/api/agency/clients/[id]/marca/route").PUT
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
  comSessao(null);
  clienteDoVizinho();
  lerFichaDeMarca.mockResolvedValue(FICHA);
  gravarRespostaDeMarca.mockResolvedValue({ gravado: true, onde: "purposeAndPromise" });
});

// A casa INTEIRA — derivada de `PERFIL_DO_PAPEL`, nunca escrita à mão.
//
// Lista de papéis copiada num teste é a lista que ninguém atualiza: papel novo
// entra em `roles.ts`, a metade "não achata quem pode" continua verde sem nunca
// ter exercitado o papel novo, e a trava vira meia trava em silêncio. É o mesmo
// defeito das seis listas de URL que o inventário aposentou.
//
// TODOS abrem a ficha do próprio cliente: `/agency/clients` é `todos_internos`.
const A_CASA_INTEIRA = Object.keys(PERFIL_DO_PAPEL);

describe("GET /api/agency/clients/[id]/marca — a leitura", () => {
  it("sem sessão nenhuma: 401, e a ficha nem é lida", async () => {
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await GET({} as never, ctx("cliente-daqui"));
    expect(res.status).toBe(401);
    expect(lerFichaDeMarca).not.toHaveBeenCalled();
  });

  it("⛔ O FURO PROVADO: design_staff do workspace A NÃO lê a ficha de um cliente do workspace B", async () => {
    comSessao("design_staff");
    clienteDoVizinho();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await GET({} as never, ctx("cliente-do-vizinho"));

    // 404 e NUNCA 403: 403 confirmaria que o id existe em outra conta, e essa
    // confirmação já é o vazamento.
    expect(res.status).toBe(404);
    expect(lerFichaDeMarca).not.toHaveBeenCalled();
  });

  it("⛔ e vale para TODO papel da casa, inclusive a direção — posse não é hierarquia", async () => {
    clienteDoVizinho();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    for (const papel of A_CASA_INTEIRA) {
      comSessao(papel);
      const res = await GET({} as never, ctx("cliente-do-vizinho"));
      expect(res.status, `${papel} leu a ficha do inquilino vizinho`).toBe(404);
    }
    expect(lerFichaDeMarca).not.toHaveBeenCalled();
  });

  it("✅ a casa INTEIRA continua lendo a ficha dos próprios clientes — nada foi achatado", async () => {
    clienteDaCasa();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    for (const papel of A_CASA_INTEIRA) {
      comSessao(papel);
      const res = await GET({} as never, ctx("cliente-daqui"));
      expect(res.status, `${papel} foi barrado na ficha do próprio cliente`).toBe(200);
    }
  });

  it("a conferência de posse é escopada pelo workspace da SESSÃO, nunca por parâmetro", async () => {
    comSessao("executivo_comercial");
    clienteDaCasa();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    await GET({} as never, ctx("cliente-daqui"));
    expect(db.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cliente-daqui", workspaceId: "w1" } }),
    );
  });

  it("a negativa é opaca: não conta se o cliente existe nem de quem é", async () => {
    comSessao("design_staff");
    clienteDoVizinho();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    const corpo = JSON.stringify(await (await GET({} as never, ctx("cliente-do-vizinho"))).json());
    for (const vazamento of ["workspace", "w1", "w2", "definidos", "lacunas", "outro"]) {
      expect(corpo.includes(vazamento), `a negativa vazou "${vazamento}"`).toBe(false);
    }
  });

  it("papel de portal (token com clientId) não entra na porta de DENTRO", async () => {
    // A porta do cliente é `/api/portal/marca`. Tudo que entra por aqui é
    // gravado com `origem: "equipe"` — um token de cliente escrevendo por esta
    // porta carimbaria a própria resposta como se fosse a agência registrando o
    // que ele disse. Procedência falsificada.
    comSessao("client", { clientId: "cliente-daqui" });
    clienteDaCasa();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    expect((await GET({} as never, ctx("cliente-daqui"))).status).toBe(403);
    expect(lerFichaDeMarca).not.toHaveBeenCalled();
  });

  it("papel desconhecido no biscoito é negado, nunca promovido", async () => {
    comSessao("papel_que_nao_existe");
    clienteDaCasa();
    const { GET } = await import("@/app/api/agency/clients/[id]/marca/route");
    expect((await GET({} as never, ctx("cliente-daqui"))).status).toBe(403);
  });
});

describe("PUT /api/agency/clients/[id]/marca — a ESCRITA, que é a metade cara", () => {
  it("sem sessão: 401, e nada é gravado", async () => {
    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await PUT(reqPut({ proposito_e_promessa: "x" }), ctx("cliente-daqui"));
    expect(res.status).toBe(401);
    expect(gravarRespostaDeMarca).not.toHaveBeenCalled();
  });

  it("⛔ O FURO PROVADO: design_staff NÃO escreve na ficha de marca do cliente do vizinho", async () => {
    comSessao("design_staff");
    clienteDoVizinho();
    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await PUT(reqPut({ proposito_e_promessa: "a marca agora é minha" }), ctx("cliente-do-vizinho"));

    expect(res.status).toBe(404);
    // A prova que importa: a escrita NÃO ACONTECEU. Barrar depois de gravar é
    // barrar nada — e é o portão de publicação daquele cliente que está aqui.
    expect(gravarRespostaDeMarca).not.toHaveBeenCalled();
  });

  it("⛔ a posse é conferida ANTES de o corpo ser lido — nenhum caminho posterior precisa lembrar", async () => {
    comSessao("design_staff");
    clienteDoVizinho();
    const corpoExplosivo = {
      json: async () => {
        throw new Error("o corpo nunca deveria ter sido lido");
      },
    } as unknown as Parameters<typeof import("@/app/api/agency/clients/[id]/marca/route").PUT>[0];

    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await PUT(corpoExplosivo, ctx("cliente-do-vizinho"));
    expect(res.status).toBe(404);
  });

  it("✅ a casa continua gravando a ficha do PRÓPRIO cliente — a trava não achata quem pode", async () => {
    clienteDaCasa();
    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    for (const papel of A_CASA_INTEIRA) {
      comSessao(papel);
      const res = await PUT(reqPut({ proposito_e_promessa: "conectar quem contrata a quem procura" }), ctx("cliente-daqui"));
      expect(res.status, `${papel} não conseguiu gravar a ficha do próprio cliente`).toBe(200);
    }
    expect(gravarRespostaDeMarca).toHaveBeenCalledTimes(A_CASA_INTEIRA.length);
  });

  it("✅ e a autoria continua sendo `equipe` — esta é a porta de dentro", async () => {
    comSessao("executivo_comercial");
    clienteDaCasa();
    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    await PUT(reqPut({ proposito_e_promessa: "x" }), ctx("cliente-daqui"));
    expect(gravarRespostaDeMarca).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "cliente-daqui", origem: "equipe" }),
    );
  });

  it("banco fora do ar na conferência de posse NÃO grava — a dúvida fecha, não abre", async () => {
    comSessao("master");
    db.client.findFirst.mockRejectedValue(new Error("banco fora do ar"));
    const { PUT } = await import("@/app/api/agency/clients/[id]/marca/route");
    const res = await PUT(reqPut({ proposito_e_promessa: "x" }), ctx("cliente-daqui"));
    expect(res.status).toBe(404);
    expect(gravarRespostaDeMarca).not.toHaveBeenCalled();
  });
});
