// acervo.test.ts — o acervo do Instagram, importado UMA vez, sem falar de
// verdade com a Meta. Ficha 1B-B1/B1c (27/09/2026). Tudo com `graphGet`
// mockado — nenhuma chamada de rede real.
//
// O que este arquivo prova, item a item do parecer `meta` (M1):
//   • paginação até 100 posts, `limit=25`, seguindo `paging.next`;
//   • field expansion — NUNCA uma chamada separada a `/children`;
//   • 1 chamada de insights por mídia, nunca `impressions`;
//   • conjunto vazio de insights → `insightsJson: null` (nunca zero);
//   • idempotência: `ja_importado` sem `forcar`; `forcar` reimporta sem
//     duplicar o que já existe;
//   • erro POR MÍDIA (insight ou download) não derruba o lote.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mocks tipados ───────────────────────────────────────────────────────────

interface PaginaFalsa {
  data?: Record<string, unknown>[];
  paging?: { next?: string };
}
type ChamadaGraph = { path: string; params: Record<string, unknown> };

const graphGet = vi.hoisted(() =>
  vi.fn(async (_path: string, _token: string, _params?: Record<string, unknown>): Promise<unknown> => {
    throw new Error("graphGet chamado sem mock configurado neste teste");
  }),
);

const FakeGraphApiError = vi.hoisted(() =>
  class FakeGraphApiError extends Error {
    status: number;
    detail?: { message?: string; code?: number; type?: string };
    constructor(message: string, code?: number, type?: string) {
      super(message);
      this.name = "GraphApiError";
      this.status = 400;
      this.detail = { message, code, type };
    }
  },
);

vi.mock("@/lib/integrations/meta/graph", () => ({
  graphGet,
  GraphApiError: FakeGraphApiError,
}));

const conexaoDoCliente = vi.hoisted(() => vi.fn());
const marcarConexaoExpirada = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined));
vi.mock("@/lib/integrations/meta/connections", () => ({
  conexaoDoCliente,
  marcarConexaoExpirada,
}));

const reservarNaJanelaDoBanco = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; gastasNaJanela: number; teto: number }> => ({
    ok: true,
    gastasNaJanela: 1,
    teto: 200,
  })),
);
vi.mock("@/lib/integrations/meta/ritmo-no-banco", () => ({ reservarNaJanelaDoBanco }));

const confereUrlExternaSegura = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true } | { ok: false; motivo: string }> => ({ ok: true })),
);
vi.mock("@/lib/security/url-externa-segura", () => ({ confereUrlExternaSegura }));

type ResultadoDeGuardarFalso = { ok: true; arquivo: { id: string } } | { ok: false; erro: string; motivo: string };
const guardarArquivo = vi.hoisted(() =>
  vi.fn(async (): Promise<ResultadoDeGuardarFalso> => ({ ok: true, arquivo: { id: "asset-default" } })),
);
vi.mock("@/lib/agency/media/armazenamento", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agency/media/armazenamento")>();
  return { ...real, guardarArquivo };
});

const duracaoDe = vi.hoisted(() => vi.fn(async (): Promise<number | null> => null));
const codecDe = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/lib/agency/media/video", () => ({ duracaoDe, codecDe }));

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), update: vi.fn() },
  acervoPost: { findMany: vi.fn(), upsert: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { importarAcervo, marcarReferencia, LIMITE_PADRAO_DO_ACERVO } from "@/lib/integrations/meta/acervo";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WS = "ws1";
const CLIENT = "cli1";
const IG_USER_ID = "ig-user-9";

const CONEXAO_VIVA = {
  id: "mc1",
  platform: "instagram",
  externalId: IG_USER_ID,
  status: "connected",
  tokenExpiresAt: null,
  metaJson: { igUserId: IG_USER_ID },
  token: "tk-valido",
};

function postBruto(n: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `m${n}`,
    caption: `post ${n}`,
    media_type: "IMAGE",
    media_product_type: "FEED",
    media_url: `https://cdn.meta.example/img${n}.jpg`,
    thumbnail_url: null,
    permalink: `https://instagram.com/p/${n}`,
    timestamp: "2026-09-01T10:00:00+0000",
    like_count: 10 + n,
    comments_count: n,
    ...extra,
  };
}

function paginaDeFeed(ids: number[], proxima?: string): PaginaFalsa {
  return {
    data: ids.map((n) => postBruto(n)),
    ...(proxima ? { paging: { next: proxima } } : {}),
  };
}

function respostaBytes(mime = "image/jpeg"): {
  ok: boolean;
  status: number;
  headers: { get: (h: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
} {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? mime : null) },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  };
}

/** As chamadas de `/media` (primeira página + `paging.next`), separadas das
 *  de insight — é o que permite às asserções falarem de "paginação" sem se
 *  confundir com "insight por mídia". */
function chamadasDeMedia(): ChamadaGraph[] {
  return graphGet.mock.calls
    .map(([path, , params]) => ({ path: String(path), params: (params ?? {}) as Record<string, unknown> }))
    .filter((c) => !c.path.includes("/insights"));
}
function chamadasDeInsight(): ChamadaGraph[] {
  return graphGet.mock.calls
    .map(([path, , params]) => ({ path: String(path), params: (params ?? {}) as Record<string, unknown> }))
    .filter((c) => c.path.includes("/insights"));
}

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  conexaoDoCliente.mockResolvedValue({ ...CONEXAO_VIVA });
  reservarNaJanelaDoBanco.mockResolvedValue({ ok: true, gastasNaJanela: 1, teto: 200 });
  confereUrlExternaSegura.mockResolvedValue({ ok: true });
  guardarArquivo.mockImplementation(async () => ({ ok: true, arquivo: { id: `asset-${Math.random()}` } }));
  globalThis.fetch = vi.fn(async () => respostaBytes()) as unknown as typeof fetch;
  db.client.findFirst.mockResolvedValue({ id: CLIENT, acervoImportadoEm: null });
  db.client.update.mockResolvedValue({});
  db.acervoPost.findMany.mockResolvedValue([]);
  db.acervoPost.upsert.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  // Insights: por padrão, toda mídia devolve `reach` medido.
  graphGet.mockImplementation(async (path: unknown) => {
    const p = String(path);
    if (p.includes("/insights")) {
      return { data: [{ name: "reach", values: [{ value: 42 }] }] };
    }
    throw new Error(`chamada inesperada em teste: ${p}`);
  });
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe("paginação — até 100 posts, limit=25, seguindo paging.next", () => {
  it("faz 4 páginas de 25 para chegar a 100, e para exatamente em 100 mesmo havendo mais cursor", async () => {
    graphGet.mockImplementation(async (path: unknown, _token: unknown, params: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 1 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed(range(0, 25), "PAGINA_2");
      if (p === "PAGINA_2") return paginaDeFeed(range(25, 50), "PAGINA_3");
      if (p === "PAGINA_3") return paginaDeFeed(range(50, 75), "PAGINA_4");
      if (p === "PAGINA_4") return paginaDeFeed(range(75, 100), "PAGINA_5_NUNCA_CHAMADA");
      throw new Error(`página inesperada: ${p} (params: ${JSON.stringify(params)})`);
    });

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.importados).toBe(100);

    const media = chamadasDeMedia();
    expect(media).toHaveLength(4);
    expect(media[0]!.path).toBe(`${IG_USER_ID}/media`);
    expect(media[0]!.params.limit).toBe(25);
    expect(String(media[0]!.params.fields)).toContain("children{media_url,media_type}");
    // As páginas seguintes vêm do `paging.next` — sem repetir `fields`/`limit`.
    expect(media[1]!.path).toBe("PAGINA_2");
    expect(media[2]!.path).toBe("PAGINA_3");
    expect(media[3]!.path).toBe("PAGINA_4");
    // Nunca chega à 5ª página: 100 já foi atingido no fim da 4ª.
    expect(media.some((c) => c.path === "PAGINA_5_NUNCA_CHAMADA")).toBe(false);
  });

  it("respeita o `limite` pedido, menor que o padrão de 100", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 1 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed(range(0, 25), "PAGINA_2");
      if (p === "PAGINA_2") return paginaDeFeed(range(25, 50));
      throw new Error(`página inesperada: ${p}`);
    });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT, limite: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.importados).toBe(30);
  });
});

describe("field expansion — NUNCA uma chamada separada a /children", () => {
  it("um carrossel usa os filhos que já vieram no field expansion, sem chamada extra", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 5 }] }] };
      if (p === `${IG_USER_ID}/media`) {
        return {
          data: [
            postBruto(1, {
              media_type: "CAROUSEL_ALBUM",
              media_url: null,
              children: {
                data: [
                  { media_url: "https://cdn.meta.example/tela1.jpg", media_type: "IMAGE" },
                  { media_url: "https://cdn.meta.example/tela2.jpg", media_type: "IMAGE" },
                ],
              },
            }),
          ],
        };
      }
      throw new Error(`chamada inesperada: ${p}`);
    });

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.importados).toBe(1);
      expect(r.midiasBaixadas).toBe(2); // as duas telas do carrossel
    }
    expect(graphGet.mock.calls.some(([path]) => String(path).includes("/children"))).toBe(false);
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(1);
    const dadosGravados = (db.acervoPost.upsert.mock.calls[0]![0] as { create: { telasJson: string } }).create;
    expect(JSON.parse(dadosGravados.telasJson)).toHaveLength(2);
  });
});

describe("insights — 1 chamada por mídia, nunca impressions", () => {
  it("uma chamada de insight por post, e o parâmetro `metric` nunca contém impressions", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 7 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed(range(0, 3));
      throw new Error(`chamada inesperada: ${p}`);
    });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);

    const insights = chamadasDeInsight();
    expect(insights).toHaveLength(3); // 1 por mídia, nunca 2
    for (const c of insights) {
      expect(String(c.params.metric)).not.toContain("impressions");
    }
  });

  it("conjunto vazio de insights vira insightsJson: null — nunca zero", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [] }; // conjunto vazio — "não medido"
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([1]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.semInsights).toBe(1);
    const dados = (db.acervoPost.upsert.mock.calls[0]![0] as { create: { insightsJson: string | null } }).create;
    expect(dados.insightsJson).toBeNull();
  });
});

describe("idempotência", () => {
  it("acervo já importado, sem forcar → ja_importado, e não fala com a Meta", async () => {
    db.client.findFirst.mockResolvedValue({ id: CLIENT, acervoImportadoEm: new Date() });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("ja_importado");
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("forcar reimporta, mas pula quem já existe — sem duplicar", async () => {
    db.client.findFirst.mockResolvedValue({ id: CLIENT, acervoImportadoEm: new Date() });
    db.acervoPost.findMany.mockResolvedValue([{ igMediaId: "m0" }]); // já existe
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 1 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0, 1]);
      throw new Error(`chamada inesperada: ${p}`);
    });

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT, forcar: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.jaExistiam).toBe(1);
      expect(r.importados).toBe(1);
    }
    // Só UM upsert — o que já existia não foi regravado, nem refez insight/download.
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(1);
    const criado = (db.acervoPost.upsert.mock.calls[0]![0] as { create: { igMediaId: string } }).create;
    expect(criado.igMediaId).toBe("m1");
    // Nenhuma chamada de insight para "m0" — ele nunca foi tocado.
    expect(chamadasDeInsight().some((c) => c.path === "m0/insights")).toBe(false);
  });
});

describe("erro POR MÍDIA não derruba o lote", () => {
  it("insight de uma mídia falha (erro comum) — as outras seguem, e o post falho entra com insightsJson: null", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p === "m1/insights") throw new Error("Meta instável para esta mídia");
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 9 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0, 1, 2]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.importados).toBe(3); // as 3 mídias, incluindo a que falhou o insight
    expect(r.falhasDeMidia.some((f) => f.igMediaId === "m1" && f.motivo.includes("insights"))).toBe(true);
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(3);
  });

  // Ficha B7, item 2 (27/09/2026): `confereUrlExternaSegura` é a trava de
  // SSRF antes de qualquer `fetch` (ver `baixarBytes`, em acervo.ts). Faltava
  // provar que uma RECUSA dela segue a mesma régua "erro POR MÍDIA" das
  // outras falhas de mídia deste describe — não derruba o lote inteiro.
  it("confereUrlExternaSegura recusa (host não permitido) — a mídia vira falhasDeMidia, e a importação continua", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 3 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0, 1]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    confereUrlExternaSegura.mockResolvedValueOnce({ ok: false, motivo: "host não é um IP público" });

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // As duas mídias entram: a recusada e a normal — nenhum `fetch` acontece
    // para a recusada (a trava barra antes da rede).
    expect(r.importados).toBe(2);
    expect(r.falhasDeMidia.some((f) => f.motivo.includes("host não é um IP público"))).toBe(true);
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(2);
  });

  it("download de mídia falha (fetch quebra) — a mídia não baixa, mas o post ainda é gravado", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 3 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0, 1]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    let chamada = 0;
    globalThis.fetch = vi.fn(async () => {
      chamada++;
      if (chamada === 1) throw new Error("rede caiu");
      return respostaBytes();
    }) as unknown as typeof fetch;

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.importados).toBe(2);
    expect(r.falhasDeMidia.some((f) => f.motivo.includes("mídia"))).toBe(true);
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(2);
  });

  it("token morto (código 190) no insight PARA a passada inteira — não é falha tolerável", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) throw new FakeGraphApiError("Error validating access token", 190);
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0, 1]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("erro_da_meta");
    expect(marcarConexaoExpirada).toHaveBeenCalledWith("mc1");
  });
});

// ─── Teto de tamanho ANTES de bufferizar o corpo inteiro ────────────────────
//
// Achado de segurança, S4 (27/09/2026): `baixarBytes` só conferia o teto de
// `MAX_BYTES_POR_ARQUIVO` DEPOIS de `res.arrayBuffer()` (dentro de
// `guardarArquivo`, que este arquivo mocka) — ou seja, a mídia inteira já
// tinha sido lida para a memória do processo antes de a casa decidir que ela
// era grande demais. `drive-conta-de-servico.ts` já conferia o
// `content-length` ANTES de ler o corpo; este arquivo não. As duas metades:
describe("teto de tamanho da mídia do acervo — recusa ANTES de bufferizar o corpo inteiro", () => {
  it("caso plantado: content-length maior que o teto recusa SEM chamar arrayBuffer()", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 3 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    const arrayBufferEspiao = vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "content-length"
            ? String(200 * 1024 * 1024) // acima do teto de 120 MB
            : h.toLowerCase() === "content-type"
              ? "image/jpeg"
              : null,
      },
      arrayBuffer: arrayBufferEspiao,
    })) as unknown as typeof fetch;

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.midiasBaixadas).toBe(0);
    expect(r.falhasDeMidia.some((f) => f.motivo.includes("teto"))).toBe(true);
    // A prova que importa: a recusa aconteceu ANTES de ler o corpo da
    // resposta — nenhuma chamada a `arrayBuffer()`.
    expect(arrayBufferEspiao).not.toHaveBeenCalled();
    // O post ainda é gravado — a falha é POR MÍDIA, não derruba o lote.
    expect(db.acervoPost.upsert).toHaveBeenCalledTimes(1);
  });

  it("caso limpo: content-length dentro do teto baixa normalmente, sem regressão", async () => {
    graphGet.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("/insights")) return { data: [{ name: "reach", values: [{ value: 3 }] }] };
      if (p === `${IG_USER_ID}/media`) return paginaDeFeed([0]);
      throw new Error(`chamada inesperada: ${p}`);
    });
    const arrayBufferEspiao = vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "content-length" ? "4" : h.toLowerCase() === "content-type" ? "image/jpeg" : null,
      },
      arrayBuffer: arrayBufferEspiao,
    })) as unknown as typeof fetch;

    const r = await importarAcervo({ workspaceId: WS, clientId: CLIENT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.midiasBaixadas).toBe(1);
    expect(r.falhasDeMidia).toHaveLength(0);
    expect(arrayBufferEspiao).toHaveBeenCalledTimes(1);
  });
});

describe("marcarReferencia", () => {
  it("marca um post como referência, com família de layout", async () => {
    // marcarReferencia confere posse via findFirst — precisa achar o post.
    (db.acervoPost as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst = vi.fn().mockResolvedValue({ id: "ap1" });
    (db.acervoPost as unknown as { update: ReturnType<typeof vi.fn> }).update = vi.fn().mockResolvedValue({});
    const r = await marcarReferencia({
      workspaceId: WS, clientId: CLIENT, acervoPostId: "ap1", referencia: true, familiaLayout: "radar",
    });
    expect(r.ok).toBe(true);
  });

  it("post de outro cliente/workspace não é encontrado — recusa, nunca grava no id alheio", async () => {
    (db.acervoPost as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    (db.acervoPost as unknown as { update: typeof update }).update = update;
    const r = await marcarReferencia({
      workspaceId: WS, clientId: CLIENT, acervoPostId: "ap-de-outro", referencia: true,
    });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  // O teste acima programa `findFirst` para devolver `null` incondicionalmente
  // — prova a RECUSA, mas não prova que a QUERY em si filtra por `clientId`.
  // Um regresso que removesse `clientId` do `where` (deixando só `id` +
  // `workspaceId`) passaria por ele do mesmo jeito. Achado do PM (S4,
  // 27/09/2026), fechado com uma tabela falsa que HONRA o `where` inteiro —
  // o mesmo desenho de `bancoDeDoisInquilinos()` em `acervo-rotas.test.ts`.
  function tabelaDeAcervoPost(linhas: Array<{ id: string; clientId: string; workspaceId: string }>) {
    return vi.fn(async ({ where }: { where: { id: string; clientId: string; workspaceId: string } }) =>
      linhas.find((p) => p.id === where.id && p.clientId === where.clientId && p.workspaceId === where.workspaceId) ?? null,
    );
  }

  it("🔒 caso plantado: post de OUTRO CLIENTE do MESMO workspace não é encontrado — posse é por clientId, não só por workspaceId", async () => {
    (db.acervoPost as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst = tabelaDeAcervoPost([
      { id: "ap-de-b", clientId: "cli-B", workspaceId: WS },
    ]);
    const update = vi.fn();
    (db.acervoPost as unknown as { update: typeof update }).update = update;

    // cli-A pede para marcar um post que pertence a cli-B, no MESMO workspace.
    const r = await marcarReferencia({ workspaceId: WS, clientId: "cli-A", acervoPostId: "ap-de-b", referencia: true });

    expect(r).toEqual({ ok: false, motivo: "post do acervo não encontrado neste cliente" });
    expect(update).not.toHaveBeenCalled();
  });

  it("✅ caso limpo: o dono de verdade, no mesmo workspace, consegue marcar normalmente", async () => {
    (db.acervoPost as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst = tabelaDeAcervoPost([
      { id: "ap-de-a", clientId: CLIENT, workspaceId: WS },
    ]);
    const update = vi.fn().mockResolvedValue({});
    (db.acervoPost as unknown as { update: typeof update }).update = update;

    const r = await marcarReferencia({ workspaceId: WS, clientId: CLIENT, acervoPostId: "ap-de-a", referencia: true });

    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

// Ficha B1c, item 0: `LIMITE_PADRAO_DO_ACERVO` continua sendo 100 — o teto do
// pedido do CEO, nunca mais.
describe("o teto do CEO", () => {
  it("o padrão nunca passa de 100", () => {
    expect(LIMITE_PADRAO_DO_ACERVO).toBe(100);
  });
});

function range(de: number, ate: number): number[] {
  const r: number[] = [];
  for (let i = de; i < ate; i++) r.push(i);
  return r;
}
