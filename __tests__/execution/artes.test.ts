import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn() },
  mediaAsset: { findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const editarParaReel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel }));

import { produzirArtesPendentes, montarPrompt } from "@/lib/agency/execution/artes";

// 1x1 png em base64 — o suficiente para o caminho de bytes.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const POST = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  caption: "Pão saindo do forno às 6 da manhã, ainda fumegando.",
  pillar: "Produto", format: "feed", mediaUrl: null, lastError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
  db.socialPost.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({
    name: "Padaria do João", industry: "Padaria",
    brandBrain: { primaryColor: "#8B4513", secondaryColor: "#F5DEB3", tone: "acolhedor" },
  });
  generateDesign.mockResolvedValue({ ok: true, url: PNG, model: "gpt-image-1" });
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.png", sizeBytes: 100, url: "/api/media/m1" } });
  db.mediaAsset.findFirst.mockResolvedValue(null);
});

describe("o Design passa a produzir imagem, não descrição de imagem", () => {
  it("gera a arte e amarra ao post", async () => {
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/m1");
  });

  it("guarda no mesmo armazenamento do material do cliente — uma cota só", async () => {
    await produzirArtesPendentes();
    const arg = guardarArquivo.mock.calls[0]![0];
    expect(arg.kind).toBe("generated");
    expect(arg.workspaceId).toBe("ws1");
    expect(arg.mimeType).toBe("image/png");
  });

  it("só olha post SEM mídia — a foto real do cliente nunca é sobrescrita", async () => {
    await produzirArtesPendentes();
    expect(db.socialPost.findMany.mock.calls[0]![0].where.mediaUrl).toBeNull();
  });

  it("reel não vira imagem parada — o cliente não comprou isso", async () => {
    // Reel agora É produzido, mas EDITANDO o vídeo do cliente (ver o bloco de
    // reel abaixo). O que continua proibido é gerar imagem estática e publicar
    // como reel.
    db.socialPost.findMany.mockResolvedValue([{ ...POST, format: "reel" }]);
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.desistiram).toEqual(["sp1"]);
  });

  it("peça que já falhou 3 vezes para de tentar — insistir não melhora e custa", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, lastError: "[arte 3/3] recusado" }]);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.desistiram).toEqual(["sp1"]);
  });

  it("falha do gerador conta tentativa e fica legível, em vez de sumir no log", async () => {
    generateDesign.mockResolvedValue({ ok: false, error: "conta sem acesso ao modelo" });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/^\[arte 1\/3\]/);
  });

  it("cota estourada não vira post sem imagem silencioso", async () => {
    guardarArquivo.mockResolvedValue({ ok: false, erro: "cota", motivo: "Sem espaço no armazenamento." });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/Sem espaço/);
  });
});

describe("o prompt da arte", () => {
  const base = { legenda: "Pão quentinho saindo do forno", pilar: "Produto", negocio: "Padaria do João", segmento: "Padaria", cores: ["#8B4513"], tom: "acolhedor" };

  it("proíbe texto na imagem — modelo erra letra, e letra errada vai para o perfil do cliente", () => {
    // Pior ainda: preço e telefone dentro de um pixel escapam do piso de
    // verdade, que lê texto e não enxerga imagem.
    const p = montarPrompt(base);
    expect(p).toMatch(/NÃO pode conter nenhum texto/);
    expect(p).toMatch(/sem tipografia/i);
  });

  it("a legenda entra como CENA, nunca como texto a desenhar", () => {
    expect(montarPrompt(base)).toContain("Cena a retratar: Pão quentinho saindo do forno");
  });

  it("usa a paleta da marca quando ela existe", () => {
    expect(montarPrompt(base)).toContain("#8B4513");
  });

  it("marca sem paleta não inventa cor", () => {
    const p = montarPrompt({ ...base, cores: [] });
    expect(p).not.toMatch(/Paleta da marca/);
  });
});

describe("o reel: o vídeo do CLIENTE, editado — não uma imagem parada", () => {
  const POST_REEL = { ...POST, id: "sp2", format: "reel" };

  beforeEach(() => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_REEL }]);
    db.mediaAsset.findFirst.mockResolvedValue({ id: "mv1", storagePath: "a/b.mp4" });
    lerArquivo.mockResolvedValue(Buffer.from("bytes-do-video"));
    editarParaReel.mockResolvedValue({ ok: true, bytes: Buffer.from("reel"), duracaoSegundos: 20 });
  });

  it("edita o material bruto do cliente e amarra ao post", async () => {
    const r = await produzirArtesPendentes();
    expect(editarParaReel).toHaveBeenCalled();
    expect(r.produzidas).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/m1");
  });

  it("reel NÃO é gerado por modelo de imagem — o cliente não comprou imagem parada", async () => {
    await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("cliente sem vídeo enviado não gasta tentativa — só ele pode resolver isso", async () => {
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await produzirArtesPendentes();
    expect(r.desistiram).toEqual(["sp2"]);
    // Sem contador: a próxima rodada tenta de novo assim que o vídeo chegar.
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).not.toMatch(/^\[arte/);
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/ainda não enviou/);
  });

  it("vídeo que o ffmpeg recusa GASTA tentativa — aí o problema é do arquivo", async () => {
    editarParaReel.mockResolvedValue({ ok: false, erro: "não consegui ler esse arquivo de vídeo" });
    await produzirArtesPendentes();
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/^\[arte 1\/3\]/);
  });

  it("o reel é guardado como mp4, não como imagem", async () => {
    await produzirArtesPendentes();
    expect(guardarArquivo.mock.calls[0]![0].mimeType).toBe("video/mp4");
  });
});
