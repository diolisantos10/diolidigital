// BAIXAR O CARROSSEL NA ORDEM — e não baixar o de ninguém mais.
//
// O que este arquivo prende:
//   ✅ a ordem de publicação vira ordem no NOME (`01-`, `02-`, … `10-`), porque
//      depois de publicado a ordem do carrossel não se conserta;
//   ✅ os bytes que entram no zip são os bytes do arquivo, na entrada certa;
//   ⛔ sem credencial nenhuma → 404 (nunca 403, nunca 401 vazando existência);
//   ⛔ peça de OUTRO workspace → 404, e o dono entra dentro do `where`
//      (derivação), não numa comparação depois da busca;
//   ⛔ token de portal de OUTRO cliente → 404;
//   ⛔ arquivo que não é do dono / não está guardado → recusa o pacote INTEIRO
//      (carrossel com buraco no meio é pior que carrossel nenhum);
//   ⛔ a rota não escreve nada e não fala com plataforma nenhuma.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import AdmZip from "adm-zip";

const db = vi.hoisted(() => ({
  socialPost: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
}));
const getSession = vi.hoisted(() => vi.fn());
const validatePortalAccess = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess,
  resolvePortalClient: vi.fn(),
}));
// `MIMES_ACEITOS` continua sendo o de verdade: a extensão do arquivo tem de sair
// da MESMA tabela que o upload usou, e um mock aqui esconderia justamente a
// divergência que esse compartilhamento existe para impedir.
vi.mock("@/lib/agency/media/armazenamento", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  lerArquivo,
}));

import { GET } from "@/app/api/social-posts/[id]/download/route";
import {
  apelido, extensaoDoMime, idDaMidia, nomeDaTela, nomeDoPacote, telasDaPeca,
} from "@/lib/agency/esteira/pacote-da-peca";

const SESSAO = { userId: "u1", email: "ceo@dioli.studio", name: "Dioli", role: "master", workspaceId: "ws1" };

const CARROSSEL = {
  id: "sp1",
  caption: "Vaga de motorista em Suzano — inscrições abertas",
  pillar: "CityJobs",
  format: "carousel",
  mediaUrl: "/api/media/m1",
  mediaUrlsJson: JSON.stringify(["/api/media/m1", "/api/media/m2", "/api/media/m3"]),
  scheduledFor: new Date("2026-08-15T10:00:00Z"),
};

function pedido(query = ""): NextRequest {
  return new NextRequest(`https://app.dioli.studio/api/social-posts/sp1/download${query}`);
}
const ctx = { params: Promise.resolve({ id: "sp1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSAO);
  validatePortalAccess.mockResolvedValue({ valid: false });
  // O mock honra o `where` como o Prisma faria: se a rota esquecer o dono, o
  // teste de posse abaixo fica vermelho.
  db.socialPost.findFirst.mockImplementation(
    ({ where }: { where: Record<string, unknown> }) => {
      if (where.id !== "sp1") return Promise.resolve(null);
      if ("workspaceId" in where && where.workspaceId !== "ws1") return Promise.resolve(null);
      if ("OR" in where) {
        const ors = where.OR as Array<Record<string, string>>;
        const bate = ors.some((o) => o.clientId === "cli1" || o.clientRequestId === "cr1");
        if (!bate) return Promise.resolve(null);
      }
      return Promise.resolve({ ...CARROSSEL });
    },
  );
  db.mediaAsset.findMany.mockImplementation(
    ({ where }: { where: { id: { in: string[] }; workspaceId?: string; OR?: Array<Record<string, string>> } }) => {
      if (where.workspaceId && where.workspaceId !== "ws1") return Promise.resolve([]);
      if (where.OR && !where.OR.some((o) => o.clientId === "cli1" || o.clientRequestId === "cr1")) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        where.id.in.map((id) => ({
          id, mimeType: "image/jpeg", sizeBytes: 4, storagePath: `ws1/${id}.jpg`,
        })),
      );
    },
  );
  lerArquivo.mockImplementation(async (caminho: string) => Buffer.from(`bytes:${caminho}`));
});

describe("a régua do nome", () => {
  it("a ordem vem no nome, com dois dígitos — 10 não pode vir antes de 2", () => {
    expect(nomeDaTela(1, "vaga", "jpg")).toBe("01-vaga.jpg");
    expect(nomeDaTela(2, "vaga", "jpg")).toBe("02-vaga.jpg");
    expect(nomeDaTela(10, "vaga", "jpg")).toBe("10-vaga.jpg");
    const ordenados = [10, 2, 1].map((n) => nomeDaTela(n, "vaga", "jpg")).sort();
    expect(ordenados).toEqual(["01-vaga.jpg", "02-vaga.jpg", "10-vaga.jpg"]);
  });

  it("o apelido sai sem acento, sem espaço e sem nada que injete cabeçalho", () => {
    expect(apelido("Vaga de MOTORISTA em Suzano")).toBe("vaga-de-motorista-em-suzano");
    expect(apelido('peça "aspas"\r\nquebra')).toBe("peca-aspas-quebra");
    expect(apelido("🔥🔥🔥")).toBe("peca");
    expect(apelido(null)).toBe("peca");
    expect(apelido("Vaga de motorista em Suzano com inscrições abertas hoje"))
      .toMatch(/^[a-z0-9-]+$/);
  });

  it("a extensão sai da tabela do upload, e MIME desconhecido não vira .jpg", () => {
    expect(extensaoDoMime("image/jpeg")).toBe("jpg");
    expect(extensaoDoMime("image/png")).toBe("png");
    expect(extensaoDoMime("application/x-coisa")).toBe("bin");
    expect(extensaoDoMime(null)).toBe("bin");
  });

  it("o nome do pacote carrega a data — dois carrosséis do mesmo cliente não colidem", () => {
    expect(nomeDoPacote("vaga", "2026-08-15")).toBe("vaga-2026-08-15.zip");
  });

  it("a ordem lida é a MESMA que a publicação usa: mediaUrlsJson no carrossel", () => {
    const telas = telasDaPeca(CARROSSEL);
    expect(telas.map((t) => t.mediaId)).toEqual(["m1", "m2", "m3"]);
  });

  it("peça única lê a capa; carrossel sem telas cai na capa em vez de sumir", () => {
    expect(telasDaPeca({ format: "feed", mediaUrl: "/api/media/x", mediaUrlsJson: "[]" }))
      .toEqual([{ ordem: 1, mediaId: "x", origem: "/api/media/x" }]);
    expect(telasDaPeca({ format: "carousel", mediaUrl: "/api/media/x", mediaUrlsJson: "[]" }))
      .toHaveLength(1);
    expect(telasDaPeca({ format: "carousel", mediaUrl: null, mediaUrlsJson: "{quebrado" }))
      .toEqual([]);
  });

  it("link de fora não vira id de mídia nossa", () => {
    expect(idDaMidia("https://drive.google.com/arquivo")).toBeNull();
    expect(idDaMidia("/api/media/abc?exp=1&sig=z")).toBe("abc");
  });
});

describe("o pacote", () => {
  it("um clique, um zip, as telas na ordem e com os bytes certos", async () => {
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain(".zip");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
    const nomes = zip.getEntries().map((e) => e.entryName);
    expect(nomes).toHaveLength(3);
    expect(nomes[0]).toMatch(/^01-/);
    expect(nomes[1]).toMatch(/^02-/);
    expect(nomes[2]).toMatch(/^03-/);
    // A tela 2 do carrossel carrega os bytes do arquivo m2 — não os do m1.
    expect(zip.getEntry(nomes[1]!)!.getData().toString()).toBe("bytes:ws1/m2.jpg");
  });

  it("o nome do arquivo dentro do zip não carrega nada da legenda cru", async () => {
    db.socialPost.findFirst.mockResolvedValue({
      ...CARROSSEL, pillar: null, caption: 'Olha só: "promoção" 🔥\nvem hoje',
    });
    const res = await GET(pedido(), ctx);
    const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
    for (const e of zip.getEntries()) expect(e.entryName).toMatch(/^\d{2}-[a-z0-9-]+\.jpg$/);
  });

  it("`?lista=1` descreve EXATAMENTE os nomes que sairiam no zip", async () => {
    const zipRes = await GET(pedido(), ctx);
    const doZip = new AdmZip(Buffer.from(await zipRes.arrayBuffer())).getEntries().map((e) => e.entryName);

    const res = await GET(pedido("?lista=1"), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.completo).toBe(true);
    expect(json.arquivos.map((a: { nome: string }) => a.nome)).toEqual(doZip);
    expect(json.arquivos.map((a: { url: string }) => a.url))
      .toEqual(["/api/media/m1", "/api/media/m2", "/api/media/m3"]);
  });

  it("não escreve nada — baixar não é publicar", async () => {
    await GET(pedido(), ctx);
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });
});

describe("o dono", () => {
  it("sem sessão e sem token: 404, nunca 401 nem 403", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(404);
    expect(db.socialPost.findFirst).not.toHaveBeenCalled();
  });

  it("sessão de OUTRO workspace: 404, e o workspace entrou no where", async () => {
    getSession.mockResolvedValue({ ...SESSAO, workspaceId: "ws2" });
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(db.socialPost.findFirst.mock.calls[0]![0].where.workspaceId).toBe("ws2");
  });

  it("token de portal do cliente dono: passa, e o dono veio DO TOKEN", async () => {
    getSession.mockResolvedValue(null);
    validatePortalAccess.mockResolvedValue({
      valid: true, record: { clientId: "cli1", clientRequestId: null },
    });
    const res = await GET(pedido("?token=t1"), ctx);
    expect(res.status).toBe(200);
    const where = db.socialPost.findFirst.mock.calls[0]![0].where;
    expect(where.OR).toEqual([{ clientId: "cli1" }]);
    // E o arquivo é conferido pela MESMA régua, não pela do post.
    expect(db.mediaAsset.findMany.mock.calls[0]![0].where.OR).toEqual([{ clientId: "cli1" }]);
  });

  it("token de portal de OUTRO cliente: 404", async () => {
    getSession.mockResolvedValue(null);
    validatePortalAccess.mockResolvedValue({
      valid: true, record: { clientId: "cli9", clientRequestId: null },
    });
    const res = await GET(pedido("?token=t9"), ctx);
    expect(res.status).toBe(404);
  });

  it("token válido que não aponta para dono nenhum não abre nada", async () => {
    getSession.mockResolvedValue(null);
    validatePortalAccess.mockResolvedValue({
      valid: true, record: { clientId: null, clientRequestId: null },
    });
    const res = await GET(pedido("?token=t0"), ctx);
    expect(res.status).toBe(404);
    expect(db.socialPost.findFirst).not.toHaveBeenCalled();
  });

  it("token inválido não cai na sessão da casa por engano", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false, reason: "revoked" });
    const res = await GET(pedido("?token=morto"), ctx);
    expect(res.status).toBe(404);
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("o que ele se recusa a entregar", () => {
  it("tela que não é do dono NÃO vira pacote incompleto — recusa inteira", async () => {
    db.mediaAsset.findMany.mockResolvedValue([
      { id: "m1", mimeType: "image/jpeg", sizeBytes: 4, storagePath: "ws1/m1.jpg" },
      { id: "m3", mimeType: "image/jpeg", sizeBytes: 4, storagePath: "ws1/m3.jpg" },
    ]);
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("2");
    expect(lerArquivo).not.toHaveBeenCalled();
  });

  it("`?lista=1` diz que está incompleto em vez de mentir que está pronto", async () => {
    db.mediaAsset.findMany.mockResolvedValue([
      { id: "m1", mimeType: "image/jpeg", sizeBytes: 4, storagePath: "ws1/m1.jpg" },
    ]);
    const json = await (await GET(pedido("?lista=1"), ctx)).json();
    expect(json.completo).toBe(false);
    expect(json.arquivos.filter((a: { nossa: boolean }) => a.nossa)).toHaveLength(1);
  });

  it("registro existe e o byte não: 410, e não um zip com uma tela a menos", async () => {
    lerArquivo.mockImplementation(async (c: string) => (c.includes("m2") ? null : Buffer.from("x")));
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toContain("2");
  });

  it("peça sem arte nenhuma diz isso, em vez de devolver um zip vazio", async () => {
    db.socialPost.findFirst.mockResolvedValue({ ...CARROSSEL, mediaUrl: null, mediaUrlsJson: "[]" });
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(409);
  });

  it("banco fora do ar não vira pacote pela metade", async () => {
    db.mediaAsset.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(503);
  });
});
