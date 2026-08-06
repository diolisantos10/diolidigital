// A ROTA que põe o backfill de carrossel atrás de um botão do painel.
//
// A lógica de casamento já tem 29 testes (`backfill-carrossel.test.ts`). Aqui o
// que está sob teste é a SUPERFÍCIE: quem pode chamar, o que o ensaio promete
// (não escrever) e as recusas que impedem a tela de aplicar um plano ruim.
//
// As quatro travas que este arquivo prende:
//   ⛔ quem não é master não passa (401 sem sessão, 403 com sessão comum);
//   ⛔ GET não escreve NADA — nenhum update, nenhuma transação;
//   ⛔ POST sem a confirmação explícita é recusado antes de tocar o banco;
//   ⛔ plano com tela `via: "ordem"` NUNCA é aplicável por esta tela.
//
// E a metade positiva, sem a qual a guarda vira "não faz nada":
//   ✅ o ensaio devolve o plano, com método por tela e motivo de exclusão;
//   ✅ o POST legítimo grava em UMA transação e responde o total.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn(), findFirst: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn(), update: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
  deliverableVersion: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession }));

import { GET, POST } from "@/app/api/admin/backfill-carrossel/route";
import { avaliarPlano, acaoDoPost } from "@/app/api/admin/backfill-carrossel/plano";

const MASTER = { userId: "u1", email: "master@dioli.studio", name: "M", role: "master", workspaceId: "ws1" };
const STAFF = { ...MASTER, role: "social_staff" };

const DATA = (d: string) => new Date(`2026-08-${d}T12:00:00Z`);

/** Dois carrosséis, três telas cada, nomeadas pelo padrão da esteira. */
function mundoFeliz() {
  db.client.findUnique.mockResolvedValue({ id: "cli", name: "Foocci", workspaceId: "ws1" });
  // A POSSE (raio-x de 05/08/2026): a rota confere o cliente contra o workspace
  // da SESSÃO antes de ler ou escrever qualquer coisa. O mock honra o `where`,
  // como o Prisma faria — se a rota esquecer o `workspaceId`, o teste de posse
  // em `__tests__/plataforma/posse-nas-quatro-rotas.test.ts` fica vermelho.
  db.client.findFirst.mockImplementation(
    ({ where }: { where: { id: string; workspaceId?: string } }) =>
      Promise.resolve(
        where.id === "cli" && (!where.workspaceId || where.workspaceId === "ws1")
          ? { id: "cli" }
          : null,
      ),
  );
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws1" }]);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      where.format
        ? [
            { id: "p1", caption: "Carrossel 1", mediaUrl: null, mediaUrlsJson: "[]", scheduledFor: DATA("10") },
            { id: "p2", caption: "Carrossel 2", mediaUrl: null, mediaUrlsJson: "[]", scheduledFor: DATA("11") },
          ]
        : [], // o índice de uso no workspace
    ),
  );
  db.mediaAsset.findMany.mockResolvedValue([
    { id: "a1", fileName: "carrossel-p1-1.png", mimeType: "image/png", createdAt: DATA("01") },
    { id: "a2", fileName: "carrossel-p1-2.png", mimeType: "image/png", createdAt: DATA("01") },
    { id: "a3", fileName: "carrossel-p2-1.png", mimeType: "image/png", createdAt: DATA("02") },
    { id: "a4", fileName: "carrossel-p2-2.png", mimeType: "image/png", createdAt: DATA("02") },
    { id: "a9", fileName: "logo-foocci.png", mimeType: "image/png", createdAt: DATA("01") },
  ]);
  db.deliverable.findMany.mockResolvedValue([]);
  db.deliverableVersion.findMany.mockResolvedValue([]);
  db.$transaction.mockResolvedValue([]);
}

const pedidoGet = (qs = "?clientId=cli") =>
  new NextRequest(`http://localhost/api/admin/backfill-carrossel${qs}`);

const pedidoPost = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/backfill-carrossel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(MASTER);
  mundoFeliz();
});

// ─── A guarda ────────────────────────────────────────────────────────────────

describe("guarda de sessão", () => {
  it("⛔ sem sessão: 401 nos dois verbos, sem tocar o banco", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(pedidoGet())).status).toBe(401);
    expect((await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }))).status).toBe(401);
    expect(db.client.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ sessão sem papel master: 403 nos dois verbos", async () => {
    getSession.mockResolvedValue(STAFF);
    expect((await GET(pedidoGet())).status).toBe(403);
    expect((await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ─── O ensaio ────────────────────────────────────────────────────────────────

describe("GET — o ensaio", () => {
  it("✅ devolve o plano com o método de cada tela e o motivo da exclusão", async () => {
    const json = await (await GET(pedidoGet())).json();
    expect(json.ok).toBe(true);
    expect(json.acao).toBe("ensaio");
    expect(json.resumo.postsQueSeraoAtualizados).toBe(2);
    expect(json.posts.map((p: { acao: string }) => p.acao)).toEqual(["atualizar", "atualizar"]);
    expect(json.posts[0].telas[0]).toMatchObject({ pos: 1, via: "esteira", url: "/api/media/a1" });
    // O logo é excluído POR NOME, e o motivo vai para a tela em português.
    expect(json.excluidos).toHaveLength(1);
    expect(json.excluidos[0].fileName).toBe("logo-foocci.png");
    expect(json.excluidos[0].motivo).toMatch(/institucional/i);
    expect(json.aplicavel).toBe(true);
  });

  it("⛔ NÃO escreve nada — nenhum update, nenhuma transação", async () => {
    await GET(pedidoGet());
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ sem clientId: 400 antes de qualquer leitura de cliente", async () => {
    const res = await GET(pedidoGet(""));
    expect(res.status).toBe(400);
    expect(db.client.findUnique).not.toHaveBeenCalled();
  });

  it("cliente inexistente vira 404, não erro cru", async () => {
    db.client.findUnique.mockResolvedValue(null);
    expect((await GET(pedidoGet())).status).toBe(404);
  });

  it("post sem data no calendário: aborta com explicação, status 200 (não é erro de HTTP)", async () => {
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.format
          ? [{ id: "p1", caption: "Carrossel sem data", mediaUrl: null, mediaUrlsJson: "[]", scheduledFor: null }]
          : [],
      ),
    );
    const res = await GET(pedidoGet());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.codigo).toBe("sem-data");
    expect(json.titulo).toMatch(/data/i);
    expect(json.semData).toHaveLength(1);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("nenhum carrossel: estado 'nada a fazer' explicado, não lista vazia muda", async () => {
    db.socialPost.findMany.mockResolvedValue([]);
    const json = await (await GET(pedidoGet())).json();
    expect(json.ok).toBe(false);
    expect(json.codigo).toBe("sem-posts");
    expect(json.oQueFazer).toBeTruthy();
  });

  it("todos já com telas: ensaio válido, mas nada aplicável", async () => {
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.format
          ? [
              {
                id: "p1", caption: "Carrossel 1", mediaUrl: "/api/media/a1",
                mediaUrlsJson: JSON.stringify(["/api/media/a1", "/api/media/a2"]),
                scheduledFor: DATA("10"),
              },
            ]
          : [],
      ),
    );
    const json = await (await GET(pedidoGet())).json();
    expect(json.aplicavel).toBe(false);
    expect(json.resumo.postsJaComTelas).toBe(1);
    expect(json.motivoNaoAplicavel).toMatch(/nenhum post seria alterado/i);
  });
});

// ─── A aplicação ─────────────────────────────────────────────────────────────

describe("POST — a aplicação", () => {
  it("⛔ sem confirmação explícita: 400 e NADA é gravado", async () => {
    const res = await POST(pedidoPost({ clientId: "cli" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/confirmar/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ confirmação com o texto errado também é recusada", async () => {
    const res = await POST(pedidoPost({ clientId: "cli", confirmar: "sim" }));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ sem clientId: 400 sem tocar o banco", async () => {
    const res = await POST(pedidoPost({ confirmar: "APLICAR" }));
    expect(res.status).toBe(400);
    expect(db.client.findUnique).not.toHaveBeenCalled();
  });

  it("⛔ corpo que não é JSON: 400", async () => {
    const req = new NextRequest("http://localhost/api/admin/backfill-carrossel", {
      method: "POST",
      body: "não é json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("⛔ nada a aplicar: 409, sem escrita", async () => {
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.format
          ? [{
              id: "p1", caption: "Já ligado", mediaUrl: "/api/media/a1",
              mediaUrlsJson: JSON.stringify(["/api/media/a1", "/api/media/a2"]),
              scheduledFor: DATA("10"),
            }]
          : [],
      ),
    );
    const res = await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }));
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ plano abortado por falta de data: 409, sem escrita", async () => {
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.format
          ? [{ id: "p1", caption: "Sem data", mediaUrl: null, mediaUrlsJson: "[]", scheduledFor: null }]
          : [],
      ),
    );
    const res = await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }));
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("sem-data");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("✅ aplica em UMA transação e responde o total", async () => {
    const res = await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.acao).toBe("aplicado");
    expect(json.postsAtualizados).toBe(2);
    expect(json.telasLigadas).toBe(4);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // Uma operação por post, dentro da MESMA transação (tudo ou nada).
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(db.socialPost.update).toHaveBeenCalledTimes(2);
    expect(db.socialPost.update.mock.calls[0][0]).toMatchObject({
      where: { id: "p1" },
      data: {
        mediaUrlsJson: JSON.stringify(["/api/media/a1", "/api/media/a2"]),
        mediaUrl: "/api/media/a1", // capa vazia é preenchida
      },
    });
  });

  it("✅ capa já preenchida à mão NÃO é sobrescrita", async () => {
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.format
          ? [{ id: "p1", caption: "V3", mediaUrl: "/api/media/capa-v3", mediaUrlsJson: "[]", scheduledFor: DATA("10") }]
          : [],
      ),
    );
    await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }));
    expect(db.socialPost.update.mock.calls[0][0].data.mediaUrl).toBeUndefined();
  });
});

// ─── O reparo: a tela de master faz o MESMO que a tarefa de boot ─────────────
//
// As duas portas leem `decidirGravacao`. Este bloco existe para que a promessa
// "elas não divergem" seja um teste, e não um comentário — com os nomes REAIS
// de produção, que foram os que expuseram o buraco.

describe("carrossel incompleto — o reparo por esta porta", () => {
  const CAPA = "/api/media/capa1";
  const CINCO = [2, 3, 4, 5, 6].map((m) => `/api/media/c1t${m}`);

  /** O estado exato dos 6 posts em produção: 5 telas, faltando a capa. */
  function mundoIncompleto(telasGravadas: string[]) {
    const linha = {
      id: "p1", caption: "Carrossel 1", mediaUrl: CAPA,
      mediaUrlsJson: JSON.stringify(telasGravadas), scheduledFor: DATA("10"),
    };
    db.socialPost.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      // O índice de uso do workspace enxerga o MESMO post — é dali que vinha a
      // exclusão que barrava a capa.
      Promise.resolve(where.format ? [linha] : [{ id: "p1", mediaUrl: CAPA, mediaUrlsJson: linha.mediaUrlsJson }]),
    );
    db.mediaAsset.findMany.mockResolvedValue([
      { id: "capa1", fileName: "foocci-c1-v3-capa.png", mimeType: "image/png", createdAt: DATA("01") },
      ...[2, 3, 4, 5, 6].map((m) => ({
        id: `c1t${m}`, fileName: `carrossel-c1-tela-${m}-v3.png`, mimeType: "image/png", createdAt: DATA("01"),
      })),
      { id: "a9", fileName: "logo-foocci.png", mimeType: "image/png", createdAt: DATA("01") },
    ]);
  }

  it("✅ o ensaio reconhece 'tem telas, mas falta a capa' e diz 5 → 6", async () => {
    mundoIncompleto(CINCO);
    const json = await (await GET(pedidoGet())).json();
    expect(json.posts[0].acao).toBe("reparar");
    expect(json.posts[0].telasAtuais).toBe(5);
    expect(json.posts[0].telas).toHaveLength(6);
    expect(json.posts[0].faltando).toBe(1);
    expect(json.posts[0].telas[0]).toMatchObject({ pos: 1, via: "capa", url: CAPA });
    expect(json.resumo.postsQueSeraoReparados).toBe(1);
    expect(json.aplicavel).toBe(true);
    // O logo continua fora; a capa NÃO aparece mais como excluída.
    expect(json.excluidos.map((e: { fileName: string }) => e.fileName)).toEqual(["logo-foocci.png"]);
  });

  it("✅ o POST grava as 6 COM A CAPA EM PRIMEIRO e não troca a capa do post", async () => {
    mundoIncompleto(CINCO);
    const json = await (await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }))).json();
    expect(json.postsAtualizados).toBe(1);
    expect(json.postsReparados).toBe(1);
    expect(json.detalhe[0]).toMatchObject({ id: "p1", acao: "reparar", de: 5, telas: 6 });

    const data = db.socialPost.update.mock.calls[0][0].data;
    expect(JSON.parse(data.mediaUrlsJson)).toEqual([CAPA, ...CINCO]);
    expect(data.mediaUrl).toBeUndefined(); // capa posta à mão: intocada
  });

  it("⛔ depois do reparo, nada mais a aplicar — 409, sem escrita", async () => {
    mundoIncompleto([CAPA, ...CINCO]);
    const res = await POST(pedidoPost({ clientId: "cli", confirmar: "APLICAR" }));
    expect(res.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ tela gravada que o plano não conhece NÃO é apagada — esta porta não tem --force", async () => {
    mundoIncompleto([...CINCO, "/api/media/posta-a-mao"]);
    const json = await (await GET(pedidoGet())).json();
    expect(json.posts[0].acao).toBe("ja-tem-telas");
    expect(json.aplicavel).toBe(false);
  });
});

// ─── A trava do casamento por ORDEM ──────────────────────────────────────────

describe("a trava do casamento posicional", () => {
  it("⛔ plano com tela via 'ordem' NÃO é aplicável por esta tela", () => {
    const avaliacao = avaliarPlano({
      posts: [
        {
          id: "p1", idx: 1, caption: "Carrossel 1", mediaUrl: null, telasAtuais: [],
          telas: [
            { pos: 1, assetId: "a1", fileName: "IMG_001.png", via: "ordem" },
            { pos: 2, assetId: "a2", fileName: "IMG_002.png", via: "ordem" },
          ],
        },
      ],
    });
    expect(avaliacao.temCasamentoPorOrdem).toBe(true);
    expect(avaliacao.aplicavel).toBe(false);
    expect(avaliacao.motivoNaoAplicavel).toMatch(/ordem de upload/i);
  });

  it("⛔ uma única tela por ordem no meio de telas legítimas já trava tudo", () => {
    const avaliacao = avaliarPlano({
      posts: [
        {
          id: "p1", idx: 1, caption: "ok", mediaUrl: null, telasAtuais: [],
          telas: [
            { pos: 1, assetId: "a1", fileName: "carrossel-p1-1.png", via: "esteira" },
            { pos: 2, assetId: "a2", fileName: "carrossel-p1-2.png", via: "esteira" },
          ],
        },
        {
          id: "p2", idx: 2, caption: "chute", mediaUrl: null, telasAtuais: [],
          telas: [
            { pos: 1, assetId: "a3", fileName: "IMG_003.png", via: "ordem" },
            { pos: 2, assetId: "a4", fileName: "IMG_004.png", via: "ordem" },
          ],
        },
      ],
    });
    expect(avaliacao.postsQueSeraoAtualizados).toBe(2);
    expect(avaliacao.aplicavel).toBe(false);
  });

  it("⛔ a rota NUNCA liga o passe posicional: sobras sem nome reconhecível não casam", async () => {
    db.mediaAsset.findMany.mockResolvedValue([
      { id: "x1", fileName: "IMG_001.png", mimeType: "image/png", createdAt: DATA("01") },
      { id: "x2", fileName: "IMG_002.png", mimeType: "image/png", createdAt: DATA("01") },
      { id: "x3", fileName: "IMG_003.png", mimeType: "image/png", createdAt: DATA("02") },
      { id: "x4", fileName: "IMG_004.png", mimeType: "image/png", createdAt: DATA("02") },
    ]);
    const json = await (await GET(pedidoGet())).json();
    expect(json.temCasamentoPorOrdem).toBe(false);
    expect(json.resumo.telasCasadas).toBe(0);
    expect(json.resumo.semCasar).toBe(4);
    expect(json.aplicavel).toBe(false);
  });
});

// ─── A tradução para a tela ──────────────────────────────────────────────────

describe("acaoDoPost — o que a tela promete post a post", () => {
  const base = { id: "p", idx: 1, caption: "c", mediaUrl: null };
  it("post com 2+ telas e sem telas atuais: será atualizado", () => {
    expect(acaoDoPost({ ...base, telasAtuais: [], telas: [
      { pos: 1, assetId: "a", fileName: "f", via: "esteira" },
      { pos: 2, assetId: "b", fileName: "g", via: "esteira" },
    ] })).toBe("atualizar");
  });
  it("⛔ post que já tem telas nunca é sobrescrito pela tela (--force não é exposto)", () => {
    expect(acaoDoPost({ ...base, telasAtuais: ["/api/media/x"], telas: [
      { pos: 1, assetId: "a", fileName: "f", via: "esteira" },
      { pos: 2, assetId: "b", fileName: "g", via: "esteira" },
    ] })).toBe("ja-tem-telas");
  });
  it("o número prometido no botão só conta telas de posts que SERÃO alterados", () => {
    const a = avaliarPlano({
      posts: [
        {
          id: "p1", idx: 1, caption: "vai mudar", mediaUrl: null, telasAtuais: [],
          telas: [
            { pos: 1, assetId: "a", fileName: "carrossel-p1-1.png", via: "esteira" },
            { pos: 2, assetId: "b", fileName: "carrossel-p1-2.png", via: "esteira" },
          ],
        },
        {
          id: "p2", idx: 2, caption: "intocado", mediaUrl: null, telasAtuais: ["/api/media/z"],
          telas: [
            { pos: 1, assetId: "c", fileName: "carrossel-p2-1.png", via: "esteira" },
            { pos: 2, assetId: "d", fileName: "carrossel-p2-2.png", via: "esteira" },
            { pos: 3, assetId: "e", fileName: "carrossel-p2-3.png", via: "esteira" },
          ],
        },
      ],
    });
    expect(a.telasCasadas).toBe(5); // tudo que foi reconhecido
    expect(a.telasQueSeraoLigadas).toBe(2); // o que a aplicação de fato grava
    expect(a.postsQueSeraoAtualizados).toBe(1);
  });

  it("⛔ uma tela só não é carrossel", () => {
    expect(acaoDoPost({ ...base, telasAtuais: [], telas: [
      { pos: 1, assetId: "a", fileName: "f", via: "esteira" },
    ] })).toBe("sem-telas-suficientes");
  });
});
