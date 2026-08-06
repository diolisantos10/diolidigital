// POSSE — as quatro rotas que aceitavam um id sem provar que ele era do
// requisitante (raio-x de 05/08/2026).
//
// A regra da casa em uma frase: **estar logado não é ser dono**, e **ser master
// é papel, não escritura**. As quatro rotas conferiam sessão (e três delas o
// papel "master") e nada mais. O id vinha do caminho, da query ou do corpo, e o
// id é GLOBAL — então a segunda pergunta nunca é opcional.
//
// O que cada uma deixava acontecer, com um id copiado da tela do vizinho:
//   • `/api/admin/backfill-carrossel` — GET vazava nomes de arquivo, legendas e
//     datas do cliente de outra agência; POST ESCREVIA nos `SocialPost` dele;
//   • `/api/admin/training/sdr/suggestions/[id]` — aprovar sugestão alheia, o
//     que ainda PROMOVE uma mudança de Brain;
//   • `/api/brain/changes/[id]` — aprovar e APLICAR mudança de Brain alheia
//     (aplicar cria `BrainVersion`);
//   • `/api/self-serve/order` — o comprador escolhia em qual agência o pedido
//     caía; agora o dono é derivado no servidor.
//
// AS DUAS METADES, em toda rota: o id do VIZINHO é barrado e NADA é escrito; o
// id PRÓPRIO passa sem atrito nenhum.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  dbAgentSuggestion: { findUnique: vi.fn(), update: vi.fn() },
  brainChangeRequest: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  brainVersion: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  socialPost: { update: vi.fn() },
  clientRequestDb: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(),
  rateLimitBucket: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
}));
const getSession = vi.hoisted(() => vi.fn());
const montarPlanoDoCliente = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/media/backfill-contexto", () => ({ montarPlanoDoCliente }));

import { PATCH as decidirSugestao } from "@/app/api/admin/training/sdr/suggestions/[id]/route";
import { PATCH as transicionarMudanca } from "@/app/api/brain/changes/[id]/route";
import {
  GET as ensaiarBackfill,
  POST as aplicarBackfill,
} from "@/app/api/admin/backfill-carrossel/route";

/** O banco de dois inquilinos. O mock HONRA o `where` — se a rota esquecer o
 *  `workspaceId`, ele devolve a linha e o teste passa; por isso ele filtra, como
 *  o Prisma faria. Sem isso o teste provaria o mock, não a trava. */
function bancoDeDoisInquilinos() {
  const clientes: Record<string, string> = { "cli-A": "ws-A", "cli-B": "ws-B" };
  db.client.findFirst.mockImplementation(
    ({ where }: { where: { id: string; workspaceId?: string } }) => {
      const dono = clientes[where.id];
      if (!dono) return Promise.resolve(null);
      if (where.workspaceId && where.workspaceId !== dono) return Promise.resolve(null);
      return Promise.resolve({ id: where.id });
    },
  );
  // Duas agências na base: nenhuma órfã pode ser adivinhada (fail-closed).
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-A" }, { id: "ws-B" }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({
    userId: "u1", email: "master@a.com", name: "M", role: "master", workspaceId: "ws-A",
  });
  bancoDeDoisInquilinos();
  db.dbAgentSuggestion.update.mockResolvedValue({ id: "s1" });
  db.brainChangeRequest.update.mockResolvedValue({
    id: "c1", agentId: "brain", title: "t", status: "approved", sourceSuggestionIds: "[]",
    createdAt: new Date(), approvalRequiredBy: '["brain_director"]',
  });
  db.$transaction.mockResolvedValue([]);
});

function patch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── /api/admin/training/sdr/suggestions/[id] ─────────────────────────────────

describe("PATCH /api/admin/training/sdr/suggestions/[id] — master não é dono de tudo", () => {
  const url = "http://localhost/api/admin/training/sdr/suggestions/s1";

  it("sugestão do VIZINHO: 404 e NADA gravado", async () => {
    db.dbAgentSuggestion.findUnique.mockResolvedValue({ workspaceId: "ws-B" });
    const res = await decidirSugestao(patch(url, { status: "approved" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(404);
    expect(db.dbAgentSuggestion.update).not.toHaveBeenCalled();
  });

  it("é 404 e não 403 — 'proibido' confirmaria que o id existe", async () => {
    db.dbAgentSuggestion.findUnique.mockResolvedValue({ workspaceId: "ws-B" });
    const achou = await decidirSugestao(patch(url, { status: "approved" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    db.dbAgentSuggestion.findUnique.mockResolvedValue(null);
    const naoAchou = await decidirSugestao(patch(url, { status: "approved" }), {
      params: Promise.resolve({ id: "s-inexistente" }),
    });
    expect(achou.status).toBe(naoAchou.status);
    expect(achou.status).toBe(404);
  });

  it("ÓRFÃ com duas agências na base: fecha a porta (fail-closed)", async () => {
    db.dbAgentSuggestion.findUnique.mockResolvedValue({ workspaceId: null });
    const res = await decidirSugestao(patch(url, { status: "approved" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(404);
    expect(db.dbAgentSuggestion.update).not.toHaveBeenCalled();
  });

  it("A OUTRA METADE: sugestão PRÓPRIA passa — e o dono é carimbado na linha", async () => {
    db.dbAgentSuggestion.findUnique.mockResolvedValue({ workspaceId: "ws-A" });
    const res = await decidirSugestao(patch(url, { status: "rejected" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(200);
    expect(db.dbAgentSuggestion.update).toHaveBeenCalledOnce();
    expect(db.dbAgentSuggestion.update.mock.calls[0]![0].data).toMatchObject({
      status: "rejected",
      workspaceId: "ws-A",
    });
  });

  it("A OUTRA METADE: órfã com UMA agência só na base passa — é a política que já existia", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-A" }]);
    db.dbAgentSuggestion.findUnique.mockResolvedValue({ workspaceId: null });
    const res = await decidirSugestao(patch(url, { status: "rejected" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(200);
  });
});

// ── /api/brain/changes/[id] ──────────────────────────────────────────────────

describe("PATCH /api/brain/changes/[id] — aplicar mudança de Brain alheia era possível", () => {
  const url = "http://localhost/api/brain/changes/c1";
  const ctx = { params: Promise.resolve({ id: "c1" }) };

  it("mudança do VIZINHO: 404, nenhuma transição e nenhuma BrainVersion criada", async () => {
    db.brainChangeRequest.findUnique.mockResolvedValue({ workspaceId: "ws-B" });
    const res = await transicionarMudanca(patch(url, { action: "apply" }), ctx);
    expect(res.status).toBe(404);
    expect(db.brainChangeRequest.update).not.toHaveBeenCalled();
    expect(db.brainVersion.create).not.toHaveBeenCalled();
  });

  it("ÓRFÃ com duas agências: fecha a porta", async () => {
    db.brainChangeRequest.findUnique.mockResolvedValue({ workspaceId: null });
    const res = await transicionarMudanca(patch(url, { action: "approve" }), ctx);
    expect(res.status).toBe(404);
    expect(db.brainChangeRequest.update).not.toHaveBeenCalled();
  });

  it("A OUTRA METADE: mudança PRÓPRIA transiciona normal", async () => {
    // A conferência de posse lê só `workspaceId`; a transição relê a linha
    // inteira. O mesmo mock serve às duas leituras.
    db.brainChangeRequest.findUnique.mockResolvedValue({
      id: "c1", workspaceId: "ws-A", agentId: "brain", title: "t",
      status: "pending_review", sourceSuggestionIds: "[]", createdAt: new Date(),
      approvalRequiredBy: '["brain_director"]',
    });
    const res = await transicionarMudanca(patch(url, { action: "approve" }), ctx);
    expect(res.status).toBe(200);
    expect(db.brainChangeRequest.update).toHaveBeenCalledOnce();
  });
});

// ── /api/admin/backfill-carrossel ────────────────────────────────────────────

describe("/api/admin/backfill-carrossel — o clientId da query/corpo é conferido", () => {
  const contexto = {
    cliente: { id: "cli-B", nome: "Cliente do vizinho", workspaceId: "ws-B" },
    imagens: 36,
    midiasComDono: 0,
    plano: { posts: [], excluidos: [], naoCasados: [], erro: null },
  };

  it("GET com cliente do VIZINHO: 404 e o plano NEM CHEGA a ser montado (não vaza)", async () => {
    montarPlanoDoCliente.mockResolvedValue(contexto);
    const res = await ensaiarBackfill(
      new NextRequest("http://localhost/api/admin/backfill-carrossel?clientId=cli-B"),
    );
    expect(res.status).toBe(404);
    expect(montarPlanoDoCliente).not.toHaveBeenCalled();
  });

  it("POST com cliente do VIZINHO: 404 e NENHUMA escrita em SocialPost", async () => {
    montarPlanoDoCliente.mockResolvedValue(contexto);
    const res = await aplicarBackfill(
      patch("http://localhost/api/admin/backfill-carrossel", {
        clientId: "cli-B",
        confirmar: "APLICAR",
      }),
    );
    expect(res.status).toBe(404);
    expect(montarPlanoDoCliente).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("a conferência põe o workspaceId DENTRO do where — não é um if depois de ler tudo", async () => {
    montarPlanoDoCliente.mockResolvedValue(contexto);
    await ensaiarBackfill(
      new NextRequest("http://localhost/api/admin/backfill-carrossel?clientId=cli-B"),
    );
    expect(db.client.findFirst.mock.calls[0]![0].where).toMatchObject({
      id: "cli-B",
      workspaceId: "ws-A",
    });
  });

  it("A OUTRA METADE: GET no PRÓPRIO cliente segue montando o ensaio", async () => {
    montarPlanoDoCliente.mockResolvedValue({
      ...contexto,
      cliente: { id: "cli-A", nome: "Meu cliente", workspaceId: "ws-A" },
    });
    const res = await ensaiarBackfill(
      new NextRequest("http://localhost/api/admin/backfill-carrossel?clientId=cli-A"),
    );
    expect(res.status).toBe(200);
    expect(montarPlanoDoCliente).toHaveBeenCalledWith("cli-A");
    // O workspace do cliente não desce para a tela.
    expect((await res.json()).cliente).toEqual({ id: "cli-A", nome: "Meu cliente" });
  });
});
