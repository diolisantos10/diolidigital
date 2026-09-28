// sincronizar-estado.test.ts — Achado 2 (Q8-qualidade, J4, 28/09/2026):
// PostExterno.estado tem de sair de "agendado" quando o SocialPost dono
// transiciona de verdade — e o webhook do evento correspondente tem de ser
// enfileirado. As duas metades: peça QUE PERTENCE a um PostExterno sincroniza;
// peça comum (sem dono externo) é um no-op silencioso.
//
// J5 (28/09/2026): `sincronizarEstadoExterno` ganhou um 3º parâmetro
// (`scriptJson`) e SÓ consulta `postExterno.findFirst` quando ele marca fonte
// externa (`{"origem":"..."}`) — antes disso, TODA transição de TODA peça
// comum fazia essa consulta em vão, a cada 5 min. A metade nova aqui é
// exatamente essa: "peça comum → findFirst NUNCA chamado".

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  postExterno: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const registrarEventoDeWebhook = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/integracoes/cityjobs/webhook", () => ({ registrarEventoDeWebhook }));

import { sincronizarEstadoExterno } from "@/lib/integracoes/cityjobs/sincronizar-estado";

const DONO_BASE = {
  id: "pe_1",
  idExterno: "vaga-4821-story-1",
  estado: "agendado",
  motivo: null as string | null,
  metadadosJson: JSON.stringify({ campanha: "vaga-4821" }),
};

/** O marcador que o J4 grava em `SocialPost.scriptJson` para peça de fonte
 *  externa (`posts.ts`) — só ele faz `sincronizarEstadoExterno` consultar o
 *  banco. */
const SCRIPT_CITYJOBS = JSON.stringify({ origem: "cityjobs" });

beforeEach(() => {
  vi.clearAllMocks();
  db.postExterno.findFirst.mockResolvedValue(DONO_BASE);
  db.postExterno.update.mockResolvedValue({});
});

describe("a peça PERTENCE a um PostExterno — sincroniza estado + webhook", () => {
  it('"publicado": grava estado + permalink/externalPostId e enfileira o evento "publicado"', async () => {
    await sincronizarEstadoExterno("sp1", {
      estado: "publicado",
      permalink: "https://www.instagram.com/p/Cxxxxx/",
      externalPostId: "17888888888888888",
    }, SCRIPT_CITYJOBS);

    expect(db.postExterno.update).toHaveBeenCalledWith({
      where: { id: "pe_1" },
      data: { estado: "publicado", motivo: null },
    });
    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      "pe_1",
      expect.objectContaining({
        idExterno: "vaga-4821-story-1",
        evento: "publicado",
        permalink: "https://www.instagram.com/p/Cxxxxx/",
        externalPostId: "17888888888888888",
        metadados: { campanha: "vaga-4821" },
      }),
    );
  });

  it('"falhou": grava estado + motivo e enfileira o evento "falhou"', async () => {
    await sincronizarEstadoExterno("sp1", { estado: "falhou", motivo: "token vencido" }, SCRIPT_CITYJOBS);

    expect(db.postExterno.update).toHaveBeenCalledWith({
      where: { id: "pe_1" },
      data: { estado: "falhou", motivo: "token vencido" },
    });
    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      "pe_1",
      expect.objectContaining({ evento: "falhou", motivo: "token vencido" }),
    );
  });

  it('"em_conferencia": grava estado + motivo e enfileira o evento "em_conferencia"', async () => {
    await sincronizarEstadoExterno(
      "sp1",
      { estado: "em_conferencia", motivo: "erro ao falar com a Meta" },
      SCRIPT_CITYJOBS,
    );

    expect(db.postExterno.update).toHaveBeenCalledWith({
      where: { id: "pe_1" },
      data: { estado: "em_conferencia", motivo: "erro ao falar com a Meta" },
    });
    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      "pe_1",
      expect.objectContaining({ evento: "em_conferencia" }),
    );
  });

  it("IDEMPOTENTE: mesmo estado + mesmo motivo não regrava nem reenfileira (mesma peça repetida)", async () => {
    db.postExterno.findFirst.mockResolvedValue({ ...DONO_BASE, estado: "falhou", motivo: "token vencido" });

    await sincronizarEstadoExterno("sp1", { estado: "falhou", motivo: "token vencido" }, SCRIPT_CITYJOBS);

    expect(db.postExterno.update).not.toHaveBeenCalled();
    expect(registrarEventoDeWebhook).not.toHaveBeenCalled();
  });

  it("motivo MUDOU (mesmo estado): regrava e reenfileira — a mudança é notícia", async () => {
    db.postExterno.findFirst.mockResolvedValue({ ...DONO_BASE, estado: "falhou", motivo: "token vencido" });

    await sincronizarEstadoExterno("sp1", { estado: "falhou", motivo: "mídia faltando" }, SCRIPT_CITYJOBS);

    expect(db.postExterno.update).toHaveBeenCalledWith({
      where: { id: "pe_1" },
      data: { estado: "falhou", motivo: "mídia faltando" },
    });
    expect(registrarEventoDeWebhook).toHaveBeenCalledTimes(1);
  });
});

describe("a peça NÃO pertence a nenhum PostExterno — no-op silencioso", () => {
  it("fonte externa, mas sem dono achado: não grava nada, não enfileira nada, nunca lança", async () => {
    db.postExterno.findFirst.mockResolvedValue(null);

    await expect(
      sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, SCRIPT_CITYJOBS),
    ).resolves.toBeUndefined();

    expect(db.postExterno.findFirst).toHaveBeenCalled();
    expect(db.postExterno.update).not.toHaveBeenCalled();
    expect(registrarEventoDeWebhook).not.toHaveBeenCalled();
  });

  it("socialPostId vazio: nem consulta o banco", async () => {
    await sincronizarEstadoExterno("", { estado: "publicado" }, SCRIPT_CITYJOBS);
    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
  });
});

// ─── J5 (28/09/2026): O CORTE — SÓ CONSULTA QUANDO É FONTE EXTERNA ─────────
describe('peça COMUM (scriptJson sem marcador "origem") — findFirst NUNCA chamado', () => {
  it("scriptJson null: nem consulta o banco, nem grava, nem enfileira", async () => {
    await expect(
      sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, null),
    ).resolves.toBeUndefined();

    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
    expect(db.postExterno.update).not.toHaveBeenCalled();
    expect(registrarEventoDeWebhook).not.toHaveBeenCalled();
  });

  it("scriptJson de outro uso (sem campo \"origem\", ex.: roteiro de Reels): nem consulta o banco", async () => {
    const scriptDeReels = JSON.stringify({ hook: "...", scenes: [], cta: "..." });

    await sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, scriptDeReels);

    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
  });

  it('scriptJson com "origem" vazia ou não-string: nem consulta o banco (fail-closed)', async () => {
    await sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, JSON.stringify({ origem: "" }));
    await sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, JSON.stringify({ origem: 123 }));

    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
  });

  it("scriptJson quebrado (JSON inválido): nem consulta o banco, nunca lança", async () => {
    await expect(
      sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, "{ isto não é json"),
    ).resolves.toBeUndefined();

    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
  });

  it("scriptJson undefined: nem consulta o banco", async () => {
    await sincronizarEstadoExterno("sp-comum", { estado: "publicado" }, undefined);
    expect(db.postExterno.findFirst).not.toHaveBeenCalled();
  });
});

describe("peça CITY JOBS (scriptJson com marcador de origem) — sincroniza como antes", () => {
  it("scriptJson com origem cityjobs: consulta o banco e sincroniza normalmente", async () => {
    await sincronizarEstadoExterno(
      "sp1",
      { estado: "publicado", permalink: "https://www.instagram.com/p/Cxxxxx/", externalPostId: "17888" },
      SCRIPT_CITYJOBS,
    );

    expect(db.postExterno.findFirst).toHaveBeenCalledWith({
      where: { socialPostIdsJson: { contains: "sp1" } },
      select: { id: true, idExterno: true, estado: true, motivo: true, metadadosJson: true },
    });
    expect(db.postExterno.update).toHaveBeenCalledWith({
      where: { id: "pe_1" },
      data: { estado: "publicado", motivo: null },
    });
    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      "pe_1",
      expect.objectContaining({ evento: "publicado" }),
    );
  });
});

describe("best-effort: erro nunca sobe para quem chamou", () => {
  it("banco fora do ar na leitura: engolido em silêncio", async () => {
    db.postExterno.findFirst.mockRejectedValue(new Error("banco caiu"));
    await expect(
      sincronizarEstadoExterno("sp1", { estado: "publicado" }, SCRIPT_CITYJOBS),
    ).resolves.toBeUndefined();
  });

  it("banco fora do ar na escrita: engolido em silêncio, sem lançar", async () => {
    db.postExterno.update.mockRejectedValue(new Error("banco caiu"));
    await expect(
      sincronizarEstadoExterno("sp1", { estado: "publicado" }, SCRIPT_CITYJOBS),
    ).resolves.toBeUndefined();
  });

  it("webhook falha ao enfileirar: engolido em silêncio (a publicação já aconteceu)", async () => {
    registrarEventoDeWebhook.mockRejectedValue(new Error("fila indisponível"));
    await expect(
      sincronizarEstadoExterno("sp1", { estado: "publicado" }, SCRIPT_CITYJOBS),
    ).resolves.toBeUndefined();
    expect(db.postExterno.update).toHaveBeenCalled();
  });

  it("metadadosJson ilegível vira null — nunca lança, nunca inventa metadados", async () => {
    db.postExterno.findFirst.mockResolvedValue({ ...DONO_BASE, metadadosJson: "{ isto não é json" });

    await sincronizarEstadoExterno("sp1", { estado: "publicado" }, SCRIPT_CITYJOBS);

    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      "pe_1",
      expect.objectContaining({ metadados: null }),
    );
  });
});
