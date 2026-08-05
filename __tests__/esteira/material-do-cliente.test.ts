// O MATERIAL DO CLIENTE DESTRAVA A PRODUÇÃO (05/08/2026).
//
// O buraco: `materialRecebido` só era alcançável por `PATCH
// /api/material-requests/[id]`, com sessão de AGÊNCIA. O caminho do cliente —
// o único que existe de verdade — ia para `POST /api/media`, criava um
// `MediaAsset` e parava ali. A tela dele dizia "A equipe já foi avisada".
//
// Cenário: produção travada por falta de logo, o portal escrevendo "sem este
// material a produção fica parada", o cliente mandando o logo, a tela
// confirmando que avisamos — e o projeto parado, com o cliente achando que a
// bola era nossa.
//
// A trava que NÃO foi afrouxada: a casa só afirma "o material chegou" quando a
// evidência diz QUAL material é. Marcar "as fotos do salão chegaram" porque um
// arquivo qualquer subiu seria mandar o agente produzir no escuro — que é
// exatamente o que o portão de recursos existe para impedir.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  materialRequest: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const moverTarefasDoAgente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/tarefas", () => ({ moverTarefasDoAgente }));

import { casarMaterial, materialEnviadoPeloCliente } from "@/lib/agency/esteira/materiais";

const LOGO = { id: "mr-logo", projectId: "p1", type: "logo", description: "Logo do restaurante em PNG" };
const FOTOS = { id: "mr-fotos", projectId: "p1", type: "fotos", description: "Fotos do salão e dos pratos" };
const VIDEO = { id: "mr-video", projectId: "p1", type: "video", description: "Vídeo bruto da cozinha" };
const CARDAPIO = { id: "mr-card", projectId: "p1", type: "documento", description: "Cardápio em PDF" };

beforeEach(() => {
  vi.clearAllMocks();
  db.materialRequest.findMany.mockResolvedValue([]);
  db.materialRequest.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id, projectId: "p1", status: "pending", requestedByAgentId: "a2",
  }));
  db.materialRequest.update.mockResolvedValue({});
  db.materialRequest.count.mockResolvedValue(0);
  db.project.findUnique.mockResolvedValue({ directionApprovedAt: new Date("2026-08-01"), executionStatus: "failed" });
  db.project.update.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  moverTarefasDoAgente.mockResolvedValue({ count: 1 });
});

// ── A LINHA QUE DECIDE, sem banco ──────────────────────────────────────────

describe("casarMaterial — a evidência decide, ou ninguém decide", () => {
  it("o NOME do arquivo é a evidência mais forte: ele próprio disse o que mandou", () => {
    const r = casarMaterial([LOGO, FOTOS, VIDEO], { fileName: "logo-foocci.png", mimeType: "image/png" });
    expect(r).toMatchObject({ pedidoId: "mr-logo", criterio: "nome" });
  });

  it("acento não separa palavra: 'cardapio.pdf' casa com 'Cardápio em PDF'", () => {
    const r = casarMaterial([LOGO, CARDAPIO], { fileName: "cardapio-2026.pdf", mimeType: "application/pdf" });
    expect(r).toMatchObject({ pedidoId: "mr-card", criterio: "nome" });
  });

  it("sem pista no nome, a CLASSE de mídia resolve: chegou vídeo, só um pedido é de vídeo", () => {
    const r = casarMaterial([LOGO, VIDEO], { fileName: "IMG_4471.mp4", mimeType: "video/mp4" });
    expect(r).toMatchObject({ pedidoId: "mr-video", criterio: "midia" });
  });

  it("só falta uma coisa → é ela, sem adivinhação nenhuma", () => {
    // Pedido que não diz classe nenhuma e arquivo sem pista no nome: o que
    // decide é só o fato de não haver outra coisa faltando.
    const solto = { id: "mr-x", projectId: "p1", type: "material", description: "O que você tiver do negócio" };
    const r = casarMaterial([solto], { fileName: "arquivo.png", mimeType: "image/png" });
    expect(r).toMatchObject({ pedidoId: "mr-x", criterio: "unico" });
  });

  it("com um pedido só, a classe de mídia já basta — e o critério fica registrado", () => {
    const r = casarMaterial([LOGO], { fileName: "arquivo.png", mimeType: "image/png" });
    expect(r).toMatchObject({ pedidoId: "mr-logo", criterio: "midia" });
  });

  it("mas 'só falta uma' NÃO vale quando a mídia CONTRADIZ o pedido", () => {
    // Pedimos vídeo bruto e chegou um PDF. A evidência não confirma, ela nega.
    const r = casarMaterial([VIDEO], { fileName: "contrato.pdf", mimeType: "application/pdf" });
    expect(r.pedidoId).toBeNull();
    expect(r.motivo).toMatch(/CONTRADIZ/);
  });

  it("dois pedidos de imagem e um arquivo mudo → NÃO escolhe nenhum", () => {
    // Errar para menos custa uma escalação; errar para mais custa uma entrega
    // produzida sobre material que nunca chegou.
    const r = casarMaterial([LOGO, FOTOS], { fileName: "IMG_0001.jpg", mimeType: "image/jpeg" });
    expect(r.pedidoId).toBeNull();
    expect(r.motivo).toContain("Logo do restaurante em PNG");
    expect(r.motivo).toContain("Fotos do salão e dos pratos");
  });

  it("pedido que quer duas coisas ('fotos e vídeos') não decide pela classe", () => {
    const misto = { id: "mr-misto", projectId: "p1", type: "midia", description: "Fotos e vídeos do salão" };
    const r = casarMaterial([misto, LOGO], { fileName: "IMG_0001.mp4", mimeType: "video/mp4" });
    expect(r.pedidoId).toBeNull();
  });

  it("nada pendente → nada a casar", () => {
    expect(casarMaterial([], { fileName: "x.png", mimeType: "image/png" }).pedidoId).toBeNull();
  });
});

// ── A CORRENTE: upload → pedido → produção ─────────────────────────────────

describe("o arquivo do cliente destrava o projeto", () => {
  it("era o último material: o pedido fecha e a produção volta para a fila", async () => {
    db.materialRequest.findMany.mockResolvedValue([LOGO]);
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci", clientRequestId: null,
      arquivo: { fileName: "logo.png", mimeType: "image/png" },
    });

    expect(r.materialRequestId).toBe("mr-logo");
    expect(r.producaoRetomada).toBe(true);
    expect(db.materialRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "mr-logo" },
      data: expect.objectContaining({ status: "received" }),
    }));
    expect(db.project.update.mock.calls[0]![0].data.executionStatus).toBe("pending");
  });

  it("ainda falta material: fecha só o que chegou e a produção CONTINUA esperando", async () => {
    db.materialRequest.findMany.mockResolvedValue([LOGO, VIDEO]);
    db.materialRequest.count.mockResolvedValue(1);
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci",
      arquivo: { fileName: "logo.png", mimeType: "image/png" },
    });

    expect(r.materialRequestId).toBe("mr-logo");
    expect(r.aindaFaltam).toBe(1);
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("A EQUIPE SEMPRE SABE — é o que torna verdadeira a frase da tela do cliente", async () => {
    db.materialRequest.findMany.mockResolvedValue([LOGO]);
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci",
      arquivo: { fileName: "logo.png", mimeType: "image/png" },
    });

    expect(r.equipeAvisada).toBe(true);
    const evento = db.activityEvent.create.mock.calls[0]![0].data;
    expect(evento.type).toBe("material_recebido");
    expect(evento.workspaceId).toBe("ws1");
    expect(evento.projectId).toBe("p1");
    expect(evento.message).toContain("logo.png");
    expect(evento.message).toContain("a produção foi retomada");
  });

  it("evidência ambígua: NADA é marcado como recebido, e vira caso para gente", async () => {
    db.materialRequest.findMany.mockResolvedValue([LOGO, FOTOS]);
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci",
      arquivo: { fileName: "IMG_0001.jpg", mimeType: "image/jpeg" },
    });

    expect(r.materialRequestId).toBeNull();
    expect(db.materialRequest.update).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
    const evento = db.activityEvent.create.mock.calls[0]![0].data;
    expect(evento.type).toBe("material_sem_destino");
    expect(evento.message).toMatch(/continua parada até alguém decidir/);
  });

  it("nenhum pedido em aberto: o arquivo é registrado e ninguém é cobrado à toa", async () => {
    db.materialRequest.findMany.mockResolvedValue([]);
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci",
      arquivo: { fileName: "foto.jpg", mimeType: "image/jpeg" },
    });
    expect(r.materialRequestId).toBeNull();
    expect(r.projectId).toBeNull();
    expect(db.activityEvent.create.mock.calls[0]![0].data.message).toMatch(/Nenhum pedido de material estava em aberto/);
  });

  it("a busca dos pendentes usa as DUAS chaves — e nenhuma nula", async () => {
    await materialEnviadoPeloCliente({
      workspaceId: "ws1", clientId: "cli-foocci", clientRequestId: null,
      arquivo: { fileName: "x.png", mimeType: "image/png" },
    });
    expect(db.materialRequest.findMany.mock.calls[0]![0].where).toEqual({
      status: "pending", project: { OR: [{ clientId: "cli-foocci" }] },
    });
  });

  it("envio sem dono derivável não consulta pedido de ninguém", async () => {
    const r = await materialEnviadoPeloCliente({
      workspaceId: "ws1", arquivo: { fileName: "x.png", mimeType: "image/png" },
    });
    expect(r.motivo).toMatch(/sem dono/);
    expect(db.materialRequest.findMany).not.toHaveBeenCalled();
  });
});
