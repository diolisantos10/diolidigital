import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
  // 08/08/2026: a publicação passou a conferir o MIME de cada arquivo antes de
  // falar com a Meta (o Instagram só aceita JPEG). Ver
  // `lib/integrations/meta/formato-de-midia.ts`.
  mediaAsset: { findMany: vi.fn() },
}));

/** Toda mídia pedida existe e é JPEG — o caso limpo destes testes, que são
 *  sobre O RELÓGIO, não sobre formato de arquivo. O formato tem teste próprio
 *  em `__tests__/meta/formato-de-midia.test.ts`. */
const midiaTodaJpeg = async (args?: { where?: { id?: { in?: string[] } } }) =>
  (args?.where?.id?.in ?? []).map((id) => ({ id, mimeType: "image/jpeg" }));
const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
}));

import {
  agendarPostsDaEntrega,
  aprovarCalendario,
  publicarAgendados,
  extrairPecas,
} from "@/lib/agency/esteira/publicacao";

const CONTEUDO = `**1. Bastidor da produção**
- Pilar: Bastidores
- Formato: Reels
- Legenda: Todo dia às 5 da manhã a massa já está descansando. É esse tempo que dá o sabor.

**2. O pão do dia**
- Pilar: Produto
- Formato: Feed
- Legenda: Saiu do forno agora. Se você passar aqui até as 10, pega quentinho.`;

const projeto = {
  id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  presentedAt: new Date("2026-08-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.mediaAsset.findMany.mockImplementation(midiaTodaJpeg);
  db.project.findUnique.mockResolvedValue({ ...projeto });
  db.deliverable.findMany.mockResolvedValue([
    { id: "d1", name: "Calendário de conteúdo", content: CONTEUDO, type: "social" },
  ]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.socialPost.findFirst.mockResolvedValue(null);
  db.socialPost.create.mockResolvedValue({});
  db.socialPost.update.mockResolvedValue({});
  conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });
  db.activityEvent.create.mockResolvedValue({});
  publishPost.mockResolvedValue({ ok: true, externalPostId: "ig_1", permalink: "https://insta/p/1" });
});

describe("a entrega vira calendário", () => {
  it("cada peça do texto vira um post com data", async () => {
    const r = await agendarPostsDaEntrega("p1");
    expect(r.criados).toBe(2);
    expect(db.socialPost.create).toHaveBeenCalledTimes(2);
  });

  it("o post nasce em rascunho — quem aprova o calendário é o cliente", async () => {
    await agendarPostsDaEntrega("p1");
    for (const call of db.socialPost.create.mock.calls) {
      expect(call[0].data.status).toBe("draft");
    }
  });

  it("nada é agendado antes de o cliente ver o pacote", async () => {
    db.project.findUnique.mockResolvedValue({ ...projeto, presentedAt: null });
    const r = await agendarPostsDaEntrega("p1");
    expect(r.criados).toBe(0);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("a primeira data é no futuro — o cliente merece olhar antes de algo ir ao ar", async () => {
    await agendarPostsDaEntrega("p1");
    const primeira = db.socialPost.create.mock.calls[0]![0].data.scheduledFor as Date;
    expect(primeira.getTime()).toBeGreaterThan(Date.now());
  });

  it("entrega que já virou calendário não vira de novo — senão o relógio duplica tudo", async () => {
    db.socialPost.findMany.mockResolvedValue([{ deliverableId: "d1" }]);
    const r = await agendarPostsDaEntrega("p1");
    expect(r.criados).toBe(0);
    expect(r.jaAgendadas).toBe(1);
  });

  it("a idempotência é POR ENTREGA — o mês 2 precisa poder ser agendado", async () => {
    // Mês 1 já agendado; uma entrega nova chega. Se a trava fosse por projeto,
    // o cliente pagaria o mês 2 e não sairia post nenhum.
    db.deliverable.findMany.mockResolvedValue([
      { id: "d1", name: "Mês 1", content: CONTEUDO, type: "social" },
      { id: "d2", name: "Mês 2", content: CONTEUDO, type: "social" },
    ]);
    db.socialPost.findMany.mockResolvedValue([{ deliverableId: "d1" }]);
    const r = await agendarPostsDaEntrega("p1");
    expect(r.jaAgendadas).toBe(1);
    expect(r.criados).toBe(2);
  });

  it("o mês 2 começa depois do fim do mês 1 — não em cima", async () => {
    const fimDoMes1 = new Date(Date.now() + 20 * 24 * 60 * 60_000);
    db.socialPost.findFirst.mockResolvedValue({ scheduledFor: fimDoMes1 });
    await agendarPostsDaEntrega("p1");
    const primeira = db.socialPost.create.mock.calls[0]![0].data.scheduledFor as Date;
    expect(primeira.getTime()).toBeGreaterThan(fimDoMes1.getTime());
  });

  it("entrega que o leitor não entende é relatada, não engolida", async () => {
    db.deliverable.findMany.mockResolvedValue([
      { id: "d9", name: "Calendário estranho", content: "texto solto sem peças", type: "social" },
    ]);
    const r = await agendarPostsDaEntrega("p1");
    expect(r.criados).toBe(0);
    expect(r.naoInterpretadas).toEqual(["Calendário estranho"]);
  });
});

describe("o cliente aprovou → o calendário passa a valer", () => {
  beforeEach(() => {
    db.project.findUnique.mockResolvedValue({ clientRequestId: "cr1", clientApprovedAt: new Date() });
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000) },
    ]);
  });

  it("sem aprovação do cliente nada sai de rascunho — é o consentimento de postar", async () => {
    db.project.findUnique.mockResolvedValue({ clientRequestId: "cr1", clientApprovedAt: null });
    const r = await aprovarCalendario("p1");
    expect(r.agendados).toBe(0);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("aprovado, o rascunho vira agendado", async () => {
    const r = await aprovarCalendario("p1");
    expect(r.agendados).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.status).toBe("scheduled");
  });

  it("data que venceu enquanto o cliente pensava é empurrada — nunca dispara em rajada", async () => {
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", scheduledFor: new Date(Date.now() - 3 * 24 * 60 * 60_000) },
      { id: "sp2", scheduledFor: new Date(Date.now() - 2 * 24 * 60 * 60_000) },
    ]);
    await aprovarCalendario("p1");
    const d1 = db.socialPost.update.mock.calls[0]![0].data.scheduledFor as Date;
    const d2 = db.socialPost.update.mock.calls[1]![0].data.scheduledFor as Date;
    expect(d1.getTime()).toBeGreaterThan(Date.now());
    expect(d2.getTime() - d1.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60_000);
  });
});

describe("o relógio publica o que está agendado", () => {
  const agendado = {
    id: "sp1", workspaceId: "ws1", clientId: "c1", caption: "Saiu do forno agora.",
    format: "feed", mediaUrl: "/api/media/m1", status: "scheduled",
  };

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
    db.socialPost.findMany.mockResolvedValue([{ ...agendado }]);
  });

  it("só olha o que está agendado e já venceu — rascunho não vai ao ar", async () => {
    await publicarAgendados();
    expect(db.socialPost.findMany.mock.calls[0]![0].where.status).toBe("scheduled");
  });

  it("publica e guarda o id externo — sem ele o relatório mensal vira chute", async () => {
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    const dados = db.socialPost.update.mock.calls[0]![0].data;
    expect(dados.status).toBe("published");
    expect(dados.externalPostId).toBe("ig_1");
  });

  it("a mídia vai à Meta como link público assinado — os servidores dela precisam alcançar", async () => {
    await publicarAgendados();
    const url = publishPost.mock.calls[0]![1].mediaUrl as string;
    expect(url).toBe("https://app.dioli.studio/api/media/m1?exp=1&sig=abc");
  });

  it("sem domínio público configurado o post não vai ao ar às cegas", async () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/domínio público/);
  });

  it("posta na conta DO CLIENTE, nunca na da agência", async () => {
    await publicarAgendados();
    // A resolução mora em conexaoDoCliente — e leva o clientId do post.
    expect(conexaoDoCliente).toHaveBeenCalledWith("ws1", "c1", "instagram");
  });

  it("conexão com token vencido pede RECONEXÃO — não 'conecte', nem publica", async () => {
    conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "expired" });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/precisa ser refeita/);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("cliente sem Instagram conectado não é erro do sistema — é pendência visível", async () => {
    conexaoDoCliente.mockResolvedValue(null);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/não conectou o Instagram/);
    // Continua agendado: a conta pode ser conectada amanhã.
    expect(db.socialPost.update.mock.calls[0]![0].data.status).toBeUndefined();
  });

  it("peça sem imagem não vira post — o Instagram não aceita só legenda", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...agendado, mediaUrl: null }]);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/ainda não tem imagem/);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("a Meta caindo não derruba a rodada nem enterra o post", async () => {
    publishPost.mockRejectedValue(new Error("Graph API fora do ar"));
    const r = await publicarAgendados();
    expect(r.falhas[0]!.erro).toBe("Graph API fora do ar");
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toBe("Graph API fora do ar");
  });
});

describe("o leitor de peças erra para menos", () => {
  it("legenda curta demais não vira post", () => {
    expect(extrairPecas("**1. X**\n- Legenda: Oi", "social")).toHaveLength(0);
  });

  it("peça que confessa falta de dado não vai para o perfil do cliente", () => {
    // A confissão é honesta para a agência ler — não para o seguidor ler.
    const texto = "**1. X**\n- Legenda: Nosso telefone é PRECISO CONFIRMAR com o cliente antes.";
    expect(extrairPecas(texto, "social")).toHaveLength(0);
  });

  it("entrega de vídeo vira reel mesmo sem o campo Formato", () => {
    const texto = "**1. X**\n- Legenda: Um roteiro inteiro para gravar no celular, cena a cena.";
    expect(extrairPecas(texto, "video")[0]!.formato).toBe("reel");
  });

  it("texto que não segue o formato não vira post quebrado no perfil do cliente", () => {
    expect(extrairPecas("prosa solta sem estrutura nenhuma aqui", "social")).toHaveLength(0);
  });
});

describe("carrossel e story no leitor de peças", () => {
  it("telas descritas viram carrossel, mesmo se o especialista escreveu 'feed'", () => {
    // A estrutura do conteúdo manda mais que o rótulo que o modelo digitou.
    const t = `**1. Como escolher seu pão**
- Formato: Feed
- Cenas: 1) O trigo · 2) A fermentação · 3) O forno
- Legenda: Três coisas que mudam tudo no pão que você leva pra casa.`;
    const p = extrairPecas(t, "social")[0]!;
    expect(p.formato).toBe("carousel");
    expect(p.cenas).toEqual(["O trigo", "A fermentação", "O forno"]);
  });

  it("carrossel com UMA tela vira feed — não publica com o nome errado", () => {
    const t = `**1. X**
- Formato: Carrossel
- Cenas: 1) Só uma tela aqui
- Legenda: Uma legenda longa o suficiente para virar post de verdade.`;
    expect(extrairPecas(t, "social")[0]!.formato).toBe("feed");
  });

  it("story continua story", () => {
    const t = `**1. X**
- Formato: Story
- Legenda: Bastidor de hoje: o forno já está quente desde as quatro da manhã.`;
    expect(extrairPecas(t, "social")[0]!.formato).toBe("story");
  });

  it("peça normal não ganha cenas do nada", () => {
    const t = `**1. X**
- Formato: Feed
- Legenda: Saiu do forno agora, passa aqui que a gente te espera com café.`;
    const p = extrairPecas(t, "social")[0]!;
    expect(p.formato).toBe("feed");
    expect(p.cenas).toEqual([]);
  });
});

describe("publicar carrossel", () => {
  const CARROSSEL = {
    id: "sp9", workspaceId: "ws1", clientId: "c1", caption: "Três coisas que mudam tudo.",
    format: "carousel", mediaUrl: "/api/media/m1", status: "scheduled",
    mediaUrlsJson: JSON.stringify(["/api/media/m1", "/api/media/m2", "/api/media/m3"]),
  };

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
    db.socialPost.findMany.mockResolvedValue([{ ...CARROSSEL }]);
    conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });
  });

  it("manda as três telas, não uma imagem só", async () => {
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    const arg = publishPost.mock.calls[0]![1];
    expect(arg.format).toBe("carousel");
    expect(arg.mediaUrls).toHaveLength(3);
    expect(arg.mediaUrl).toBeUndefined();
  });

  it("carrossel incompleto NÃO vai ao ar — sequência com buraco perde o sentido", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...CARROSSEL, mediaUrlsJson: JSON.stringify(["/api/media/m1"]) }]);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("JSON corrompido não derruba a rodada — vira pendência legível", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...CARROSSEL, mediaUrlsJson: "{quebrado" }]);
    const r = await publicarAgendados();
    expect(r.falhas[0]!.erro).toMatch(/ainda não tem as artes/);
  });
});
