// O PEDIDO QUE PRODUZIA CEGO PARA O INSTAGRAM DO CLIENTE.
//
// ── O pedido do CEO, e a metade da casa em que ele valia ───────────────────
//
// "era só entrar na rede social, ver o que está acontecendo e já fazer o post
// com a identidade visual do cliente." Isso existe — em `run-execution.ts`, o
// motor do CICLO. Não existia no outro motor.
//
// `Ctx` tem três campos que só o motor grande preenchia, e `ctxBlock` os
// descarta em silêncio quando vêm vazios (`especialistas.ts:283` — um
// `.filter(Boolean)`, sem erro e sem log):
//
//   `feedRealDoCliente`  — único setter: `run-execution.ts:370`
//   `contratoDeMarca`    — único setter: `run-execution.ts:347`
//   `materiaisEntregues` — `producao-de-pedido.ts:192` gravava `[]` FIXO
//
// Consequência medida: pedido feito pelo portal, pelo WhatsApp ou pelo balcão
// produzia cego. Pior — como `sinteseDoFeedDoCliente` só era chamada de
// `run-execution.ts:328`, o cliente que só passa por este caminho **nunca tinha
// síntese gravada**, e o caminho das artes lê a síntese persistida. A ARTE dele
// nascia cega também.
//
// E o `materiaisEntregues: []` fixo reproduz o laço cruel que a própria `Ctx`
// documenta: o cliente manda o logo, a produção retoma, o campo continua vazio,
// o especialista pede o logo de novo.

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Registro { [k: string]: unknown }
const pedidos = new Map<string, Registro>();

const db = vi.hoisted(() => ({
  contentRequest: {
    findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(() => Promise.resolve({})), updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
  },
  client: { findUniqueOrThrow: vi.fn() },
  project: { findUniqueOrThrow: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(() => Promise.resolve(null)) },
  task: { findUnique: vi.fn(), update: vi.fn(() => Promise.resolve({})) },
  deliverable: { create: vi.fn(() => Promise.resolve({ id: "del-1" })) },
  approvalRequest: { findFirst: vi.fn(() => Promise.resolve(null)) },
  timelineEvent: { create: vi.fn(() => Promise.resolve({})) },
  activityEvent: { create: vi.fn(() => Promise.resolve({})) },
  portalMessage: { create: vi.fn(() => Promise.resolve({})) },
  brainArtifact: { findFirst: vi.fn(() => Promise.resolve(null)), create: vi.fn(() => Promise.resolve({})) },
  materialRequest: { findMany: vi.fn((_a: { where: Registro }) => Promise.resolve([{ type: "design" }])) },
  departmentLadder: { findMany: vi.fn(() => Promise.resolve([])), findUnique: vi.fn(() => Promise.resolve({ degrau: "wide" })) },
  departmentLadderRecord: { create: vi.fn(() => Promise.resolve({})), findMany: vi.fn(() => Promise.resolve([])) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generate", () => ({ generate }));

/** A síntese do feed, mockada no MÓDULO dela. O que se prova aqui é a
 *  LIGAÇÃO: que a produção do pedido a chama e leva o texto ao prompt. */
const leitura = vi.hoisted(() => ({ sinteseDoFeedDoCliente: vi.fn() }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => leitura);

const marca = vi.hoisted(() => ({ contratoDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => marca);

vi.mock("@/lib/agency/persistence/approval-service", () => ({
  createApprovalRequest: () => Promise.resolve({ id: "apr-1" }),
}));
vi.mock("@/lib/agency/escada/registro", () => ({
  escadaFiltraEntregas: () => Promise.resolve({ liberados: [{ id: "pedido" }], retidos: [] }),
}));
vi.mock("@/lib/agency/execution/quality-auditor", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  auditDeliverable: () => Promise.resolve({ verdict: "aprovado", issues: [], note: "ok" }),
}));

const { produzirPedido } = await import("@/lib/agency/esteira/producao-de-pedido");

const FEED = "FEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-15):\n- Tom das legendas: próximo e cotidiano";
const REGUA = "RÉGUA DA MARCA — CityJobs\nNUNCA: prometer contratação";

function pedido(): Registro {
  return {
    id: "pc-1", clientId: "cli-1", projectId: "prj-1", taskId: "task-1",
    title: "um post do combo", description: "quero um post do combo do almoço",
    objective: "vender mais", status: "triado", scopeDecision: null, quoteStatus: null,
    deliverableId: null, productionAttempts: 0, promisedFor: null,
    updatedAt: new Date(), createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pedidos.clear();
  const p = pedido();
  pedidos.set("pc-1", p);
  db.contentRequest.findUnique.mockResolvedValue(p);
  db.contentRequest.findUniqueOrThrow.mockResolvedValue(p);
  db.contentRequest.updateMany.mockResolvedValue({ count: 1 });
  db.client.findUniqueOrThrow.mockResolvedValue({
    id: "cli-1", name: "CityJobs", workspaceId: "ws-1", industry: "Empregos",
    email: null, phone: null, brandBrain: null,
  });
  db.project.findUniqueOrThrow.mockResolvedValue({
    id: "prj-1", name: "CityJobs", goal: "vagas do bairro",
    workspaceId: "ws-1", clientId: "cli-1", clientRequestId: null,
  });
  db.task.findUnique.mockResolvedValue({ id: "task-1", agentId: "social-roteiro-video" });
  db.materialRequest.findMany.mockResolvedValue([{ type: "design" }]);
  leitura.sinteseDoFeedDoCliente.mockResolvedValue({ lida: true, texto: FEED });
  marca.contratoDeMarca.mockResolvedValue({ texto: REGUA, naoConstituida: false, lacunas: [] });
  generate.mockResolvedValue({
    ok: true,
    data: {
      title: "Roteiros de Vídeo — CityJobs",
      summary: "Três roteiros de reels para as vagas do bairro.",
      items: [
        { headline: "A vaga que apareceu na sua rua", note: "GANCHO (0-2s): o mapa do bairro na tela. Cenas: 3s mapa, 4s pessoa lendo, 3s chamada.", visual: "Close no celular com a lista de vagas", caption: "Tem vaga a dez minutos de casa." },
        { headline: "Quem contrata aqui do lado", note: "GANCHO (0-2s): a fachada da loja. Cenas: 4s fachada, 4s balcão, 2s chamada.", visual: "Comércio de rua, luz natural", caption: "Os patrões são os vizinhos." },
        { headline: "O que tem hoje", note: "GANCHO (0-2s): a pergunta na tela. Cenas: 3s lista, 5s vagas, 2s chamada.", visual: "Rolagem da lista de vagas do dia", caption: "As vagas de hoje estão no perfil." },
      ],
    },
  });
});

/** O texto que foi PARAR na frente do modelo. */
function promptDaPrimeiraChamada(): string {
  const chamada = generate.mock.calls[0]?.[0] as { user?: string } | undefined;
  return chamada?.user ?? "";
}

describe("⭐ o pedido pelo portal enxerga o Instagram do cliente", () => {
  it("a produção do pedido LÊ o feed — e o texto chega ao prompt", async () => {
    await produzirPedido("pc-1");
    expect(
      leitura.sinteseDoFeedDoCliente,
      "o feed nunca é lido por este caminho — o cliente produz cego e nunca ganha síntese gravada",
    ).toHaveBeenCalledWith("ws-1", "cli-1", null);
    expect(promptDaPrimeiraChamada(), "o feed foi lido e descartado por `ctxBlock`").toContain(FEED);
  });

  it("a régua da marca chega ANTES de produzir, não só no piso depois", async () => {
    await produzirPedido("pc-1");
    expect(marca.contratoDeMarca).toHaveBeenCalledWith("cli-1");
    expect(promptDaPrimeiraChamada()).toContain(REGUA);
  });

  it("o material que o cliente JÁ mandou não é pedido de novo", async () => {
    await produzirPedido("pc-1");
    expect(db.materialRequest.findMany).toHaveBeenCalled();
    const where = db.materialRequest.findMany.mock.calls[0]![0];
    // O mesmo recorte do motor grande: só o que saiu de `pending` conta como
    // entregue. Contar o pendente diria "ele já mandou" para quem não mandou.
    expect(where.where).toMatchObject({ projectId: "prj-1", status: { not: "pending" } });
  });
});

describe("nenhuma das três leituras pode derrubar a produção", () => {
  it("feed fora do ar: a peça sai, e o prompt simplesmente não tem o bloco", async () => {
    leitura.sinteseDoFeedDoCliente.mockRejectedValue(new Error("Meta fora do ar"));
    const r = await produzirPedido("pc-1");
    expect(r.ok, "uma leitura best-effort derrubou a produção").toBe(true);
    expect(promptDaPrimeiraChamada()).not.toContain(FEED);
  });

  it("contrato de marca fora do ar: a peça sai, e o piso continua valendo depois", async () => {
    marca.contratoDeMarca.mockRejectedValue(new Error("banco fora do ar"));
    const r = await produzirPedido("pc-1");
    expect(r.ok).toBe(true);
  });

  it("a DEGRADAÇÃO declarada também vai ao prompt — ela é instrução", async () => {
    // "feed não lido: sem conexão. PROIBIDO descrever o estilo do perfil."
    // vale tanto quanto a síntese: sem ela, o especialista inventa o estilo.
    const degradacao = "FEED REAL DO CLIENTE (Instagram): feed não lido: sem conexão. PROIBIDO descrever o estilo do perfil.";
    leitura.sinteseDoFeedDoCliente.mockResolvedValue({ lida: false, texto: degradacao });
    await produzirPedido("pc-1");
    expect(promptDaPrimeiraChamada()).toContain("PROIBIDO descrever o estilo");
  });
});

describe("este caminho continua não publicando nada", () => {
  it("nenhuma peça vira post publicado por aqui", async () => {
    await produzirPedido("pc-1");
    expect(Object.keys(db)).not.toContain("socialPost");
  });
});
