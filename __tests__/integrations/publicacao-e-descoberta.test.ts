// Os três caminhos que gastavam chamada em rajada e ninguém contava:
// o carrossel (até ~130 chamadas por post), a descoberta de Páginas depois do
// OAuth, e a resolução de workspace da caixa de entrada do WhatsApp — esta
// última não é ritmo, é PII no inquilino errado.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const graphPost = vi.hoisted(() => vi.fn());
const graphPostJson = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  metaConnection: { findFirst: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  whatsAppMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}));

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string; code?: number; type?: string };
  constructor(message: string) { super(message); this.detail = { message }; }
});

vi.mock("@/lib/integrations/meta/graph", () => ({
  graphGet, graphPost, graphPostJson, GraphApiError: FakeGraphError,
}));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { publishPost } from "@/lib/integrations/meta/client";
import { discoverPages, MAXIMO_DE_PAGINAS_DE_PAGINACAO } from "@/lib/integrations/meta/discovery";
import { resolveWorkspaceForPhone } from "@/lib/integrations/meta/inbox";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  loadConnectionToken.mockResolvedValue({ token: "tk", platform: "instagram", externalId: "ig9" });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Roda a promessa deixando os `setTimeout` internos dispararem na hora. */
async function semEsperar<T>(p: Promise<T>): Promise<T> {
  const feito = p.then((v) => v, (e) => { throw e; });
  await vi.runAllTimersAsync();
  return feito;
}

// ─── Carrossel ──────────────────────────────────────────────────────────────

describe("carrossel — o post que sozinho fazia ~130 chamadas", () => {
  it("com os containers já prontos, gasta UMA conferência por filho", async () => {
    let n = 0;
    graphPost.mockImplementation(async () => ({ id: `c${++n}` }));
    graphGet.mockImplementation(async (path: string) =>
      path.includes("permalink") || path.startsWith("http")
        ? { status_code: "FINISHED" }
        : { status_code: "FINISHED", permalink: "https://ig/p/1" });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", platform: "instagram", format: "carousel",
      caption: "oi", mediaUrls: Array.from({ length: 10 }, (_, i) => `https://cdn/${i}.jpg`),
    } as never));

    expect(r.ok).toBe(true);
    // 10 filhos + 1 pai = 11 conferências, mais o permalink. O jeito antigo
    // chegava a 12 GETs POR container.
    expect(graphGet.mock.calls.length).toBeLessThanOrEqual(13);
  });

  it("container travado: a espera CRESCE em vez de bater de 2,5s em 2,5s", async () => {
    graphPost.mockResolvedValue({ id: "c1" });
    graphGet.mockResolvedValue({ status_code: "IN_PROGRESS" });

    await expect(semEsperar(publishPost("w1", {
      connectionId: "mc1", platform: "instagram", format: "feed",
      caption: "oi", mediaUrl: "https://cdn/a.jpg",
    } as never))).resolves.toMatchObject({ ok: false });

    // Orçamento de imagem = 45s. Com backoff 2s→4s→8s→15s, isso são poucas
    // conferências; com o intervalo fixo de 2,5s seriam 12 num piscar.
    expect(graphGet.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("status ERROR para na primeira — não fica batendo numa mídia que já falhou", async () => {
    graphPost.mockResolvedValue({ id: "c1" });
    graphGet.mockResolvedValue({ status_code: "ERROR" });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", platform: "instagram", format: "feed",
      caption: "oi", mediaUrl: "https://cdn/a.jpg",
    } as never));
    expect(r.ok).toBe(false);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });
});

// ─── Descoberta ─────────────────────────────────────────────────────────────

describe("descoberta de Páginas — a rajada logo depois de conectar", () => {
  it("a paginação para no teto da casa em vez de varrer 10 páginas", async () => {
    graphGet.mockResolvedValue({
      data: [{ id: "p1", name: "Página", access_token: "pt" }],
      paging: { next: "https://graph.facebook.com/proxima" },
    });
    const paginas = await discoverPages("tk");
    expect(graphGet).toHaveBeenCalledTimes(MAXIMO_DE_PAGINAS_DE_PAGINACAO);
    expect(paginas).toHaveLength(MAXIMO_DE_PAGINAS_DE_PAGINACAO);
  });

  it("sem `next`, para na primeira — pedir de novo é chamada jogada fora", async () => {
    graphGet.mockResolvedValue({ data: [{ id: "p1", name: "P", access_token: "pt" }] });
    await discoverPages("tk");
    expect(graphGet).toHaveBeenCalledTimes(1);
  });
});

// ─── Caixa de entrada: PII não vai para o inquilino errado ──────────────────

describe("WhatsApp — número desconhecido não cai no workspace de outro", () => {
  it("conexão registrada manda: o workspace é o dono do número", async () => {
    db.metaConnection.findFirst.mockResolvedValue({ workspaceId: "w-dono" });
    expect(await resolveWorkspaceForPhone("555")).toBe("w-dono");
    expect(db.agencyWorkspace.findMany).not.toHaveBeenCalled();
  });

  it("com UM workspace só, 'o primeiro' e 'o certo' são a mesma coisa", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "w1" }]);
    expect(await resolveWorkspaceForPhone("555")).toBe("w1");
  });

  it("com DOIS workspaces, número desconhecido não é adivinhado — devolve null", async () => {
    // Telefone + texto é dado pessoal de quem escreveu para OUTRA empresa.
    // Perder a mensagem é reversível; entregá-la ao inquilino errado não é.
    db.metaConnection.findFirst.mockResolvedValue(null);
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "w1" }, { id: "w2" }]);
    expect(await resolveWorkspaceForPhone("555")).toBeNull();
  });

  it("banco sem workspace nenhum também devolve null", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    db.agencyWorkspace.findMany.mockResolvedValue([]);
    expect(await resolveWorkspaceForPhone("555")).toBeNull();
  });
});
