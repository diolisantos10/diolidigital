// MARCAR "PUBLICADO" SEM MENTIR.
//
// O CEO publica o primeiro carrossel do CityJobs à mão. Marcar a peça como
// publicada tira ela do relógio — e até 14/08/2026 isso podia ser feito sem
// dizer ONDE o post foi parar e sem dizer QUEM marcou.
//
// O que este arquivo prende:
//   ⛔ marcar "published" sem `externalPostId` é RECUSADO — sem ele o post
//      existe no calendário e não existe na medição (fantasma do relatório);
//   ⛔ id que não é id, link que não é https, data no futuro: recusados;
//   ✅ quem marcou e quando ficam gravados (`publishedBy` + `publishedAt`);
//   ⛔ **nada disto fala com a Meta** — e é o fonte que prova, não a intenção.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  socialPost: { findFirst: vi.fn(), update: vi.fn() },
  client: { findFirst: vi.fn() },
  clientRequestDb: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());
const publishPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));

import { PATCH } from "@/app/api/social-posts/[id]/route";
import {
  autorDaEquipe, lerRegistroDePublicacao, AUTOR_DA_ESTEIRA,
} from "@/lib/agency/esteira/registro-de-publicacao";

const SESSAO = { userId: "u1", email: "ceo@dioli.studio", name: "Dioli", role: "master", workspaceId: "ws1" };

const AGENDADO = {
  id: "sp1", workspaceId: "ws1", clientId: "cli1", clientRequestId: null,
  caption: "Vaga de motorista em Suzano", networks: '["instagram"]', format: "carousel",
  pillar: null, mediaUrl: "/api/media/m1", mediaUrlsJson: "[]", scenesJson: "[]",
  scriptJson: null, visibility: "compartilhado", scheduledFor: new Date("2026-08-10T10:00:00Z"),
  status: "scheduled", externalPostId: null, permalink: null, publishedAt: null,
  publishedBy: null, lastError: null, createdAt: new Date(), updatedAt: new Date(),
};

const ctx = { params: Promise.resolve({ id: "sp1" }) };
function patch(body: unknown): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/social-posts/sp1", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
/** O `data` que a rota mandou para o banco. */
function gravado(): Record<string, unknown> {
  return db.socialPost.update.mock.calls[0]![0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: SESSAO, error: null });
  db.socialPost.findFirst.mockResolvedValue({ ...AGENDADO });
  db.socialPost.update.mockResolvedValue({ id: "sp1" });
  db.activityEvent.create.mockResolvedValue({});
});

describe("a régua, sozinha", () => {
  const atual = { status: "scheduled", externalPostId: null };

  it("marcar publicado sem id da plataforma é recusado — é assim que nasce o post fantasma", () => {
    const r = lerRegistroDePublicacao({ body: {}, statusPedido: "published", atual, autor: "equipe:x" });
    expect(r.erro).toContain("ID da publicação");
    expect(r.dados).toEqual({});
  });

  it("com o id, grava id, hora e AUTOR", () => {
    const agora = new Date("2026-08-15T12:00:00Z");
    const r = lerRegistroDePublicacao({
      body: { externalPostId: "17895695668004550" },
      statusPedido: "published", atual, autor: "equipe:ceo@dioli.studio", agora,
    });
    expect(r.erro).toBeUndefined();
    expect(r.marcandoPublicado).toBe(true);
    expect(r.dados.externalPostId).toBe("17895695668004550");
    expect(r.dados.publishedAt).toEqual(agora);
    expect(r.dados.publishedBy).toBe("equipe:ceo@dioli.studio");
  });

  it("id que não é id (URL colada, aspas, espaço) é recusado", () => {
    for (const v of ["https://instagram.com/p/abc", 'x" ; drop', "id com espaço", "a".repeat(65), 12345]) {
      const r = lerRegistroDePublicacao({
        body: { externalPostId: v }, statusPedido: "published", atual, autor: "equipe:x",
      });
      expect(r.erro, `aceitou ${String(v)}`).toBeTruthy();
    }
  });

  it("link só entra como https — nada de esquema que executa", () => {
    const base = { statusPedido: null, atual: { status: "published", externalPostId: "ig1" }, autor: "equipe:x" };
    expect(lerRegistroDePublicacao({ ...base, body: { permalink: "javascript:alert(1)" } }).erro).toBeTruthy();
    expect(lerRegistroDePublicacao({ ...base, body: { permalink: "http://instagram.com/p/1" } }).erro).toBeTruthy();
    expect(lerRegistroDePublicacao({ ...base, body: { permalink: "sem-esquema" } }).erro).toBeTruthy();
    const ok = lerRegistroDePublicacao({ ...base, body: { permalink: "https://www.instagram.com/p/Cabc/" } });
    expect(ok.erro).toBeUndefined();
    expect(ok.dados.permalink).toBe("https://www.instagram.com/p/Cabc/");
  });

  it("data no futuro é recusada — isto registra o que JÁ foi ao ar", () => {
    const agora = new Date("2026-08-15T12:00:00Z");
    const r = lerRegistroDePublicacao({
      body: { externalPostId: "ig1", publishedAt: "2026-08-20T10:00:00Z" },
      statusPedido: "published", atual, autor: "equipe:x", agora,
    });
    expect(r.erro).toContain("futuro");
  });

  it("hora informada é respeitada — o CEO pode registrar horas depois", () => {
    const agora = new Date("2026-08-15T22:00:00Z");
    const r = lerRegistroDePublicacao({
      body: { externalPostId: "ig1", publishedAt: "2026-08-15T14:30:00Z" },
      statusPedido: "published", atual, autor: "equipe:x", agora,
    });
    expect(r.dados.publishedAt).toEqual(new Date("2026-08-15T14:30:00Z"));
  });

  it("não dá para apagar o id de uma peça que continua publicada", () => {
    const r = lerRegistroDePublicacao({
      body: { externalPostId: null }, statusPedido: null,
      atual: { status: "published", externalPostId: "ig1" }, autor: "equipe:x",
    });
    expect(r.erro).toContain("apagar o ID");
  });

  it("peça que JÁ estava publicada continua editável — a exigência é da transição", () => {
    const r = lerRegistroDePublicacao({
      body: { caption: "outra" }, statusPedido: "published",
      atual: { status: "published", externalPostId: null }, autor: "equipe:x",
    });
    expect(r.erro).toBeUndefined();
    expect(r.marcandoPublicado).toBe(false);
    expect(r.dados).toEqual({});
  });

  it("as duas autorias não se confundem", () => {
    expect(AUTOR_DA_ESTEIRA).toBe("esteira");
    expect(autorDaEquipe("ceo@dioli.studio")).toBe("equipe:ceo@dioli.studio");
    expect(autorDaEquipe(null)).toBe("equipe:desconhecido");
    // A gramática é a mesma de `reviewedBy`, e o prefixo `client:` NÃO é dela:
    // quem publica é a casa, e carimbar o cliente seria a mesma ambiguidade que
    // `aprovacao-da-peca.ts` recusa.
    expect(autorDaEquipe("x")).not.toMatch(/^client:/);
  });
});

describe("pela rota", () => {
  it("o PATCH recusa e não escreve nada quando falta o id", async () => {
    const res = await PATCH(patch({ status: "published" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ID da publicação");
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("o PATCH grava os três campos + quem marcou, e deixa testemunha", async () => {
    // Uma hora atrás: é assim que o gesto acontece de verdade — o CEO posta e
    // vem registrar depois. Data cravada no fonte quebraria o teste sozinha no
    // dia em que o relógio da máquina passasse dela.
    const umaHoraAtras = new Date(Date.now() - 60 * 60_000);
    const res = await PATCH(patch({
      status: "published",
      externalPostId: "17895695668004550",
      permalink: "https://www.instagram.com/p/Cabc/",
      publishedAt: umaHoraAtras.toISOString(),
    }), ctx);
    expect(res.status).toBe(200);
    const d = gravado();
    expect(d.status).toBe("published");
    expect(d.externalPostId).toBe("17895695668004550");
    expect(d.permalink).toBe("https://www.instagram.com/p/Cabc/");
    expect(d.publishedAt).toEqual(umaHoraAtras);
    expect(d.publishedBy).toBe("equipe:ceo@dioli.studio");
    // A testemunha carrega a evidência: quem, qual id, qual peça.
    const evento = db.activityEvent.create.mock.calls[0]![0].data;
    expect(evento.type).toBe("post_publicado_a_mao");
    expect(evento.message).toContain("equipe:ceo@dioli.studio");
    expect(evento.message).toContain("17895695668004550");
  });

  it("editar uma peça agendada continua funcionando sem tocar em publicação", async () => {
    const res = await PATCH(patch({ caption: "nova legenda" }), ctx);
    expect(res.status).toBe(200);
    const d = gravado();
    expect(d.caption).toBe("nova legenda");
    expect(d).not.toHaveProperty("publishedBy");
    expect(d).not.toHaveProperty("publishedAt");
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });

  it("peça de outro workspace não é encontrada", async () => {
    db.socialPost.findFirst.mockResolvedValue(null);
    const res = await PATCH(patch({ status: "published", externalPostId: "ig1" }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("nada disto chama a plataforma", () => {
  it("marcar publicado não dispara publicação nenhuma", async () => {
    await PATCH(patch({ status: "published", externalPostId: "ig1" }), ctx);
    expect(publishPost).not.toHaveBeenCalled();
  });

  // Mock não prova ausência de um caminho que nem foi importado. O fonte prova.
  it("nem a rota nem a régua mencionam a Meta — medido no fonte", () => {
    const raiz = join(__dirname, "..", "..");
    const proibido = [
      "meta/client", "publishPost", "graph.facebook", "instagram_business",
      "PUBLICACAO_ORGANICA", "trava-de-publicacao",
    ];
    for (const arquivo of [
      "app/api/social-posts/[id]/route.ts",
      "lib/agency/esteira/registro-de-publicacao.ts",
      "app/api/social-posts/[id]/download/route.ts",
      "lib/agency/esteira/pacote-da-peca.ts",
    ]) {
      // O texto dos comentários fala da Meta de propósito (é o contexto do
      // conserto); o que não pode existir é CÓDIGO — import ou chamada.
      const fonte = readFileSync(join(raiz, arquivo), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const p of proibido) {
        expect(fonte.includes(p), `${arquivo} menciona ${p}`).toBe(false);
      }
    }
  });
});
