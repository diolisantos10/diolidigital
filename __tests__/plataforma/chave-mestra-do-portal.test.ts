// A CHAVE-MESTRA DO PORTAL — achados 8 a 11 e 13 da 8ª auditoria adversarial.
//
// O raio-x varreu `app/api` procurando id aceito sem conferência de workspace e
// achou uma FAMÍLIA inteira em `/api/brain/*`: rotas que perguntavam "você está
// logado?" e nunca "isto é seu?". Um id é global; a sessão não o torna seu.
//
// A pior delas, `POST /api/brain/portal-access`, não vaza um dado: CUNHA UMA
// CREDENCIAL. Um PM do workspace A mandava o id de um cliente do workspace B e
// recebia, com 201, o link do portal dele — 180 dias de acesso sem login a
// aprovações, peças e mensagens, e o poder de DECIDIR em nome desse cliente.
//
// AS DUAS METADES, em toda rota, sempre:
//   • id do VIZINHO  → 4xx, nada devolvido e NADA gravado;
//   • id PRÓPRIO     → funciona, sem atrito para quem é dono.
//
// E a terceira, que é caso legítimo desta casa e não pode ser vítima da trava:
// a SOLICITAÇÃO ÓRFÃ (`workspaceId` nulo). O briefing público é preenchido por
// quem não está logado e não sabe o workspace — em 01/08/2026, 6 das 7
// solicitações em produção eram órfãs. Se a trava as esconder do dono, ela
// "conserta" a segurança quebrando o produto.
//
// ⚠️ O MOCK DO PRISMA HONRA O `where`. Se uma rota esquecer o filtro de
// workspace, o mock devolve o registro do vizinho e o teste FALHA. Mock que
// ignora o `where` transforma teste de posse em teatro: passa igual com a
// trava e sem ela.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── O banco de dois inquilinos ───────────────────────────────────────────────

type Reg = Record<string, unknown>;

const SOLICITACOES: Reg[] = [
  { id: "cr-A",        workspaceId: "ws-A", clientId: "cli-A", status: "new",         businessName: "Cliente A", segment: "", services: "[]", objectives: "[]", rawContext: "", briefingJson: null, sdrHandoffJson: null, attachmentsJson: "[]", source: "briefing" },
  { id: "cr-B",        workspaceId: "ws-B", clientId: "cli-B", status: "new",         businessName: "Cliente B", segment: "", services: "[]", objectives: "[]", rawContext: "", briefingJson: null, sdrHandoffJson: null, attachmentsJson: "[]", source: "briefing" },
  // A órfã legítima: nasceu no briefing público, sem workspace, mas já foi
  // ligada a um cliente do A. O dono dela é o dono do cliente.
  { id: "cr-orfa-A",   workspaceId: null,   clientId: "cli-A", status: "new",         businessName: "Órfã do A", segment: "", services: "[]", objectives: "[]", rawContext: "", briefingJson: null, sdrHandoffJson: null, attachmentsJson: "[]", source: "briefing" },
  { id: "cr-orfa-B",   workspaceId: null,   clientId: "cli-B", status: "new",         businessName: "Órfã do B", segment: "", services: "[]", objectives: "[]", rawContext: "", briefingJson: null, sdrHandoffJson: null, attachmentsJson: "[]", source: "briefing" },
  // Órfã SEM cliente: com duas agências na base ninguém pode adivinhar.
  { id: "cr-orfa-sem", workspaceId: null,   clientId: null,    status: "new",         businessName: "Sem dono",  segment: "", services: "[]", objectives: "[]", rawContext: "", briefingJson: null, sdrHandoffJson: null, attachmentsJson: "[]", source: "briefing" },
];

const CLIENTES: Reg[] = [
  { id: "cli-A", workspaceId: "ws-A", name: "Cliente A" },
  { id: "cli-B", workspaceId: "ws-B", name: "Cliente B" },
];

const APROVACOES: Reg[] = [
  { id: "ap-A", clientRequestId: "cr-A", clientId: null,   questionOpenedAt: null, expiresAt: null },
  { id: "ap-B", clientRequestId: "cr-B", clientId: null,   questionOpenedAt: null, expiresAt: null },
  // Card de cliente direto: a posse vem do `clientId`, não da solicitação.
  { id: "ap-dir-B", clientRequestId: null, clientId: "cli-B", questionOpenedAt: null, expiresAt: null },
];

const ARTEFATOS: Reg[] = [
  { id: "art-A", clientRequestId: "cr-A", clientId: null },
  { id: "art-B", clientRequestId: "cr-B", clientId: null },
];

/** Quantos workspaces a base tem — a órfã sem cliente depende disto. */
let workspaces: Reg[] = [{ id: "ws-A" }, { id: "ws-B" }];

/** O `where` do Prisma, honrado: `id`, `{ in: [...] }`, `OR` e igualdade. */
function casa(reg: Reg, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  const w = where as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(w)) {
    if (chave === "OR") {
      const ramos = valor as unknown[];
      if (!ramos.some((r) => casa(reg, r))) return false;
      continue;
    }
    if (valor && typeof valor === "object" && "in" in (valor as Reg)) {
      if (!((valor as { in: unknown[] }).in).includes(reg[chave])) return false;
      continue;
    }
    if (reg[chave] !== valor) return false;
  }
  return true;
}

function tabela(linhas: () => Reg[]) {
  return {
    findFirst: vi.fn(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(linhas().find((l) => casa(l, where)) ?? null)),
    findUnique: vi.fn(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(linhas().find((l) => casa(l, where)) ?? null)),
    findMany: vi.fn(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(linhas().filter((l) => casa(l, where)))),
    create: vi.fn(({ data }: { data: Reg }) => Promise.resolve({ id: "novo", ...data })),
    update: vi.fn(({ where, data }: { where: Reg; data: Reg }) => Promise.resolve({ ...where, ...data })),
    upsert: vi.fn(({ where, create }: { where: Reg; create: Reg }) => Promise.resolve({ ...create, ...where })),
    delete: vi.fn(({ where }: { where: Reg }) => Promise.resolve({ ...where })),
    updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    createMany: vi.fn(() => Promise.resolve({ count: 0 })),
  };
}

const db = vi.hoisted(() => ({} as Record<string, ReturnType<typeof tabela>>));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({
  getSession,
  isAgencyRole: (r: string) => r === "master" || r === "project_manager",
}));

const createPortalAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  createPortalAccess,
  validatePortalAccess: vi.fn(),
  resolvePortalClient: vi.fn(),
  conferirTokenDoPortal: vi.fn(),
}));

const buildClientSnapshot = vi.hoisted(() => vi.fn());
const orchestratePMReasoning = vi.hoisted(() => vi.fn());
const runAutoScope = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dioli-brain/client-snapshot", () => ({
  buildClientSnapshot,
  snapshotBrandBrain: vi.fn(() => undefined),
}));
vi.mock("@/lib/dioli-brain/pm-orchestrator", () => ({ orchestratePMReasoning }));
vi.mock("@/lib/dioli-brain/run-auto-scope", () => ({ runAutoScope }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ pedirDirecao: vi.fn(async () => ({ ok: true, avisouCliente: true })) }));

import { POST as cunharPortal, GET as lerPortais } from "@/app/api/brain/portal-access/route";
import {
  GET as lerAprovacoes,
  PATCH as visibilidadeDaAprovacao,
  POST as acaoDeAprovacao,
} from "@/app/api/brain/approvals/route";
import {
  GET as lerSolicitacoes,
  PATCH as editarSolicitacao,
  DELETE as apagarSolicitacao,
} from "@/app/api/brain/client-requests/route";
import { GET as lerEvidencias, POST as criarEvidencia } from "@/app/api/brain/evidence/route";
import { GET as lerArtefatos, POST as salvarArtefato } from "@/app/api/brain/artifacts/route";
import { POST as reescopar } from "@/app/api/brain/auto-scope/route";
import { GET as lerAtualizacoes } from "@/app/api/brain/updates/route";
import { POST as revisarEscopo } from "@/app/api/brain/auto-scope/[id]/review/route";

beforeEach(() => {
  vi.clearAllMocks();
  workspaces = [{ id: "ws-A" }, { id: "ws-B" }];
  db.clientRequestDb  = tabela(() => SOLICITACOES);
  db.client           = tabela(() => CLIENTES);
  db.approvalRequest  = tabela(() => APROVACOES);
  db.approvalComment  = tabela(() => []);
  db.brainArtifact    = tabela(() => ARTEFATOS);
  db.evidenceItem     = tabela(() => []);
  db.portalAccess     = tabela(() => [
    { id: "pa-A", token: "tok-A", clientRequestId: "cr-A", clientId: null, revokedAt: null, expiresAt: null, createdAt: new Date(), accessCount: 0 },
    { id: "pa-B", token: "tok-B", clientRequestId: "cr-B", clientId: null, revokedAt: null, expiresAt: null, createdAt: new Date(), accessCount: 0 },
  ]);
  db.brainUpdate      = tabela(() => [
    { id: "bu-A", clientRequestId: "cr-A", status: "pending", fieldChanged: "positioning", proposedValue: "x" },
    { id: "bu-B", clientRequestId: "cr-B", status: "pending", fieldChanged: "positioning", proposedValue: "segredo do vizinho" },
  ]);
  db.agencyWorkspace  = tabela(() => workspaces);
  db.project          = tabela(() => []);

  requireSession.mockResolvedValue({
    session: { workspaceId: "ws-A", email: "pm@a.com", name: "PM A", role: "project_manager", clientId: null },
    error: null,
  });
  getSession.mockResolvedValue({ workspaceId: "ws-A", email: "pm@a.com", name: "PM A", role: "project_manager", clientId: null });
  createPortalAccess.mockResolvedValue({ token: "tok-novo", expiresAt: new Date(), clientRequestId: "cr-A" });
  buildClientSnapshot.mockResolvedValue({ businessName: "x", segment: "", services: [], objectives: [], rawContext: "" });
});

function json(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const get = (url: string) => new NextRequest(url);

// ── 8. POST/GET /api/brain/portal-access — a chave-mestra ────────────────────

describe("/api/brain/portal-access — cunhar acesso ao portal do vizinho", () => {
  it("solicitação do vizinho: 404 e NENHUM token cunhado", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-B" }));
    expect(res.status).toBe(404);
    expect(createPortalAccess).not.toHaveBeenCalled();
  });

  it("cliente do vizinho: 404 e NENHUM token cunhado", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientId: "cli-B" }));
    expect(res.status).toBe(404);
    expect(createPortalAccess).not.toHaveBeenCalled();
  });

  it("solicitação própria: cunha normal", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-A" }));
    expect(res.status).toBe(201);
    expect(createPortalAccess).toHaveBeenCalledOnce();
  });

  it("órfã ligada a cliente PRÓPRIO: cunha normal — a trava não pode esconder o briefing público", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-orfa-A" }));
    expect(res.status).toBe(201);
    expect(createPortalAccess).toHaveBeenCalledOnce();
  });

  it("órfã ligada a cliente do VIZINHO: 404 — órfã não é de todos", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-orfa-B" }));
    expect(res.status).toBe(404);
    expect(createPortalAccess).not.toHaveBeenCalled();
  });

  it("órfã SEM cliente, com duas agências na base: 404 — adivinhar é o mesmo que vazar", async () => {
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-orfa-sem" }));
    expect(res.status).toBe(404);
    expect(createPortalAccess).not.toHaveBeenCalled();
  });

  it("a MESMA órfã sem cliente, numa base com UM workspace só: passa (o caso real de hoje)", async () => {
    workspaces = [{ id: "ws-A" }];
    const res = await cunharPortal(json("http://localhost/api/brain/portal-access", "POST", { clientRequestId: "cr-orfa-sem" }));
    expect(res.status).toBe(201);
  });

  it("GET: ler o token é o mesmo poder que cunhá-lo — id do vizinho devolve 404, e nada da lista", async () => {
    const res = await lerPortais(get("http://localhost/api/brain/portal-access?clientRequestId=cr-B"));
    expect(res.status).toBe(404);
    expect(db.portalAccess.findMany).not.toHaveBeenCalled();
  });

  it("GET próprio: devolve os links", async () => {
    const res = await lerPortais(get("http://localhost/api/brain/portal-access?clientRequestId=cr-A"));
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  it("GET com papel de staff (sem poder de emissão): 403 antes de qualquer consulta", async () => {
    requireSession.mockResolvedValue({ session: null, error: new Response("", { status: 403 }) as never });
    const res = await lerPortais(get("http://localhost/api/brain/portal-access?clientRequestId=cr-A"));
    expect(res.status).toBe(403);
  });
});

// ── 9. /api/brain/approvals ──────────────────────────────────────────────────

describe("/api/brain/approvals — decidir e falar em nome de outra agência", () => {
  it("GET de solicitação alheia: 404 e nenhuma aprovação lida", async () => {
    const res = await lerAprovacoes(get("http://localhost/api/brain/approvals?clientRequestId=cr-B"));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  it("GET próprio: lista normal", async () => {
    const res = await lerAprovacoes(get("http://localhost/api/brain/approvals?clientRequestId=cr-A"));
    expect(res.status).toBe(200);
    expect(db.approvalRequest.findMany).toHaveBeenCalled();
  });

  it("PATCH em card alheio: 404 e NADA gravado — a peça não aparece nem some do portal dele", async () => {
    const res = await visibilidadeDaAprovacao(json("http://localhost/api/brain/approvals", "PATCH", { id: "ap-B", clientVisible: true }));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("PATCH em card de CLIENTE DIRETO do vizinho: 404 (a posse vem do clientId)", async () => {
    const res = await visibilidadeDaAprovacao(json("http://localhost/api/brain/approvals", "PATCH", { id: "ap-dir-B", clientVisible: true }));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("PATCH no próprio: grava", async () => {
    const res = await visibilidadeDaAprovacao(json("http://localhost/api/brain/approvals", "PATCH", { id: "ap-A", clientVisible: true }));
    expect(res.status).toBe(200);
    expect(db.approvalRequest.update).toHaveBeenCalledOnce();
  });

  it("comentário VISÍVEL AO CLIENTE em card alheio: 404 e nenhum comentário criado", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      action: "comment", approvalRequestId: "ap-B", body: "oi, aqui é a outra agência", isClientVisible: true,
    }));
    expect(res.status).toBe(404);
    expect(db.approvalComment.create).not.toHaveBeenCalled();
  });

  it("comentário no próprio card: cria", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      action: "comment", approvalRequestId: "ap-A", body: "seguimos", isClientVisible: true,
    }));
    expect(res.status).toBe(201);
    expect(db.approvalComment.create).toHaveBeenCalledOnce();
  });

  it("decidir aprovação alheia (update_status): 404 e nada gravado", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      action: "update_status", id: "ap-B", status: "approved",
    }));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("criar aprovação em solicitação alheia: 404 e nada criado", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      clientRequestId: "cr-B", department: "social", clientVisible: true,
    }));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });

  it("criar aprovação apontando para ARTEFATO alheio: 404 (a outra porta do mesmo cômodo)", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      clientRequestId: "cr-A", artifactId: "art-B", department: "social",
    }));
    expect(res.status).toBe(404);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });

  it("criar aprovação própria: cria", async () => {
    const res = await acaoDeAprovacao(json("http://localhost/api/brain/approvals", "POST", {
      clientRequestId: "cr-A", artifactId: "art-A", department: "social",
    }));
    expect(res.status).toBe(201);
    expect(db.approvalRequest.create).toHaveBeenCalledOnce();
  });
});

// ── 10. /api/brain/client-requests ───────────────────────────────────────────

describe("/api/brain/client-requests — o transcript do SDR e a transferência de dono", () => {
  it("GET por id alheio: 404 (rawContext, transcript e sdrHandoffJson não saem)", async () => {
    const res = await lerSolicitacoes(get("http://localhost/api/brain/client-requests?id=cr-B"));
    expect(res.status).toBe(404);
  });

  it("GET por id próprio: devolve", async () => {
    const res = await lerSolicitacoes(get("http://localhost/api/brain/client-requests?id=cr-A"));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("cr-A");
  });

  it("listar OMITINDO workspaceId não lista mais a base inteira — só o que é do workspace da sessão", async () => {
    const res = await lerSolicitacoes(get("http://localhost/api/brain/client-requests"));
    const ids = (await res.json()).map((r: { id: string }) => r.id);
    expect(ids).toContain("cr-A");
    expect(ids).toContain("cr-orfa-A");   // a órfã do dono continua visível
    expect(ids).not.toContain("cr-B");
    expect(ids).not.toContain("cr-orfa-B");
    expect(ids).not.toContain("cr-orfa-sem");
  });

  it("passar ?workspaceId=ws-B na query não muda nada — o escopo é o da sessão", async () => {
    const res = await lerSolicitacoes(get("http://localhost/api/brain/client-requests?workspaceId=ws-B"));
    const ids = (await res.json()).map((r: { id: string }) => r.id);
    expect(ids).not.toContain("cr-B");
  });

  it("PATCH em solicitação alheia: 404 e nada gravado", async () => {
    const res = await editarSolicitacao(json("http://localhost/api/brain/client-requests?id=cr-B", "PATCH", { status: "cancelled" }));
    expect(res.status).toBe(404);
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("PATCH tentando SEQUESTRAR a solicitação (workspaceId no corpo): recusado, nada gravado", async () => {
    const res = await editarSolicitacao(json("http://localhost/api/brain/client-requests?id=cr-orfa-A", "PATCH", { workspaceId: "ws-B" }));
    expect(res.status).toBe(403);
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("PATCH apontando para CLIENTE do vizinho: 404, nada gravado", async () => {
    const res = await editarSolicitacao(json("http://localhost/api/brain/client-requests?id=cr-A", "PATCH", { clientId: "cli-B" }));
    expect(res.status).toBe(404);
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("ADOTAR a órfã para o próprio workspace continua permitido — é o caminho legítimo do briefing público", async () => {
    const res = await editarSolicitacao(json("http://localhost/api/brain/client-requests?id=cr-orfa-A", "PATCH", { workspaceId: "ws-A", clientId: "cli-A" }));
    expect(res.status).toBe(200);
    expect(db.clientRequestDb.update).toHaveBeenCalledOnce();
  });

  it("DELETE em solicitação alheia: 404 e NADA apagado (o cascade levaria artefatos, aprovações e comentários dela)", async () => {
    const res = await apagarSolicitacao(new NextRequest("http://localhost/api/brain/client-requests?id=cr-B", { method: "DELETE" }));
    expect(res.status).toBe(404);
    expect(db.clientRequestDb.delete).not.toHaveBeenCalled();
  });

  it("DELETE no próprio: apaga", async () => {
    const res = await apagarSolicitacao(new NextRequest("http://localhost/api/brain/client-requests?id=cr-A", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(db.clientRequestDb.delete).toHaveBeenCalledOnce();
  });
});

// ── 11. /api/brain/evidence e /api/brain/artifacts ───────────────────────────

describe("/api/brain/evidence — plantar prova na casa do vizinho", () => {
  it("GET alheio: 404 e nada lido", async () => {
    const res = await lerEvidencias(get("http://localhost/api/brain/evidence?clientRequestId=cr-B"));
    expect(res.status).toBe(404);
    expect(db.evidenceItem.findMany).not.toHaveBeenCalled();
  });

  it("POST com clientRequestId alheio: 404 e nada gravado", async () => {
    const res = await criarEvidencia(json("http://localhost/api/brain/evidence", "POST", {
      clientRequestId: "cr-B", department: "social", type: "annotation", label: "x",
    }));
    expect(res.status).toBe(404);
    expect(db.evidenceItem.create).not.toHaveBeenCalled();
  });

  it("POST com artifactId alheio: 404 e nada gravado", async () => {
    const res = await criarEvidencia(json("http://localhost/api/brain/evidence", "POST", {
      artifactId: "art-B", department: "social", type: "annotation", label: "x",
    }));
    expect(res.status).toBe(404);
    expect(db.evidenceItem.create).not.toHaveBeenCalled();
  });

  it("POST próprio: grava", async () => {
    const res = await criarEvidencia(json("http://localhost/api/brain/evidence", "POST", {
      clientRequestId: "cr-A", artifactId: "art-A", department: "social", type: "annotation", label: "x",
    }));
    expect(res.status).toBe(201);
    expect(db.evidenceItem.create).toHaveBeenCalledOnce();
  });
});

describe("/api/brain/artifacts — o upsert por id do corpo", () => {
  const canvas = { clientName: "Alguém", segment: "varejo" };

  it("GET alheio: 404 e nada lido", async () => {
    const res = await lerArtefatos(get("http://localhost/api/brain/artifacts?clientRequestId=cr-B"));
    expect(res.status).toBe(404);
    expect(db.brainArtifact.findMany).not.toHaveBeenCalled();
  });

  it("POST em solicitação alheia: 404, NADA criado e o status do pipeline dela intacto", async () => {
    const res = await salvarArtefato(json("http://localhost/api/brain/artifacts", "POST", {
      clientRequestId: "cr-B", department: "strategy", canvasId: "c1", canvas,
    }));
    expect(res.status).toBe(404);
    expect(db.clientRequestDb.upsert).not.toHaveBeenCalled();
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
    expect(db.brainArtifact.create).not.toHaveBeenCalled();
  });

  it("POST com id INEXISTENTE (store legado) ainda cria o stub — mas carimbado com o workspace da sessão", async () => {
    const res = await salvarArtefato(json("http://localhost/api/brain/artifacts", "POST", {
      clientRequestId: "cr-do-store-local", department: "strategy", canvasId: "c1", canvas,
    }));
    expect(res.status).toBe(201);
    expect(db.clientRequestDb.upsert).toHaveBeenCalledOnce();
    expect(db.clientRequestDb.upsert.mock.calls[0]![0].create.workspaceId).toBe("ws-A");
  });

  it("POST no próprio: grava e avança o pipeline", async () => {
    const res = await salvarArtefato(json("http://localhost/api/brain/artifacts", "POST", {
      clientRequestId: "cr-A", department: "strategy", canvasId: "c1", canvas,
    }));
    expect(res.status).toBe(201);
    expect(db.brainArtifact.create).toHaveBeenCalledOnce();
  });
});

// ── Além da lista do raio-x: mesma família, mesmas travas ────────────────────

describe("rotas da MESMA família que o raio-x não listou", () => {
  it("POST /api/brain/auto-scope em solicitação alheia: 404 e nenhum motor disparado (nem a chave de IA gasta)", async () => {
    const res = await reescopar(json("http://localhost/api/brain/auto-scope", "POST", { clientRequestId: "cr-B" }));
    expect(res.status).toBe(404);
    expect(runAutoScope).not.toHaveBeenCalled();
  });

  it("POST /api/brain/auto-scope no próprio: roda", async () => {
    const res = await reescopar(json("http://localhost/api/brain/auto-scope", "POST", { clientRequestId: "cr-A" }));
    expect(res.status).toBe(200);
    expect(runAutoScope).toHaveBeenCalledOnce();
  });

  it("GET /api/brain/updates SEM filtro não devolve mais as propostas de marca do vizinho", async () => {
    const res = await lerAtualizacoes(get("http://localhost/api/brain/updates"));
    const ids = (await res.json()).map((u: { id: string }) => u.id);
    expect(ids).toEqual(["bu-A"]);
  });

  it("GET /api/brain/updates com filtro alheio: 404", async () => {
    const res = await lerAtualizacoes(get("http://localhost/api/brain/updates?clientRequestId=cr-B"));
    expect(res.status).toBe(404);
  });

  it("POST /api/brain/auto-scope/[id]/review em solicitação alheia: 404 — nenhum projeto, nenhuma tarefa, nenhuma adoção", async () => {
    const res = await revisarEscopo(
      json("http://localhost/api/brain/auto-scope/cr-B/review", "POST", { decisions: { strategy: { action: "approved" } } }),
      { params: Promise.resolve({ id: "cr-B" }) },
    );
    expect(res.status).toBe(404);
    expect(db.project.create).not.toHaveBeenCalled();
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
    expect(db.brainArtifact.updateMany).not.toHaveBeenCalled();
  });
});
