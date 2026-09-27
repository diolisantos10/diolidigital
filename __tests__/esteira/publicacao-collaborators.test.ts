// 1C-C1 (27/09/2026) — a metade de `publicacao.ts` do parecer do `meta`:
//
//   • a FONTE dos colaboradores é o pacote da marca (`pacote.colaboradores`),
//     nunca o post — `ativo: false` (ou pacote ausente) não envia nada;
//   • formato STORY nunca leva collaborators, mesmo que o pacote declare
//     contas — o parecer fecha essa porta para todo formato de story;
//   • depois do sucesso, `collabJson` grava pedidos/enviadoEm/resposta e a
//     CONFERÊNCIA (GET /{media-id}/collaborators) grava `invite_status` por
//     username;
//   • falha na conferência NUNCA desfaz a publicação — o post continua
//     "published", só `collabJson.erroDaConferencia` registra o motivo.
//
// Mesmo esqueleto de mocks de `rajada-de-publicacao.test.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  socialPost: {
    findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
    update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
  },
  client: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
}));
const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
const conferirPromocaoNoFormato = vi.hoisted(() => vi.fn(
  (_a: { formato: string; texto: string }): { passa: true } | { passa: false; motivo: string } => ({ passa: true }),
));
const conferirCollaborators = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/integrations/meta/collab", () => ({ conferirCollaborators }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
vi.mock("@/lib/agency/esteira/promocao-so-em-stories", () => ({ conferirPromocaoNoFormato }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
}));

// `lerPacote` REAL (não mockado): a suíte precisa provar que o pacote de
// verdade (`esteira/pacote-da-marca.ts`, com o schema completo) é o que
// decide — não um dublê simplificado que aceitaria qualquer forma de objeto.
import { publicarAgendados } from "@/lib/agency/esteira/publicacao";

const AGORA = new Date();

function pacoteValido(overrides: Record<string, unknown> = {}) {
  return {
    postsPorDia: 1, postsPorSemana: 3, formatos: ["feed_imagem", "carrossel"],
    dias: [1, 3, 5], horarios: ["10:00"], pilares: [{ nome: "educativo", peso: 1 }],
    ...overrides,
  };
}

function postPendente(overrides: Record<string, unknown> = {}) {
  return {
    id: "sp1", workspaceId: "ws1", clientId: "cli1",
    caption: "Peça de feed", format: "feed", pillar: null,
    mediaUrl: "/api/media/m1", mediaUrlsJson: "[]",
    scheduledFor: new Date(AGORA.getTime() - 5 * 60_000), status: "scheduled", lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  contratoDeMarca.mockResolvedValue({ texto: "x", marcaVersao: "mv1", lacunas: [], cortado: [], naoConstituida: false });
  conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected", token: "tk-cli1" });
  db.mediaAsset.findMany.mockImplementation(async (args?: { where?: { id?: { in?: string[] } } }) =>
    (args?.where?.id?.in ?? []).map((id) => ({ id, mimeType: "image/jpeg" })));
  db.socialPost.findMany.mockResolvedValue([postPendente()]);
  db.socialPost.findFirst.mockResolvedValue(null); // perfil nunca publicou: sem freio
  db.socialPost.update.mockResolvedValue({});
  db.socialPost.updateMany.mockResolvedValue({ count: 1 });
  db.activityEvent.create.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ pacoteJson: null }); // sem pacote por padrão
  db.socialPost.count.mockResolvedValue(0);
  db.socialPost.findUnique.mockResolvedValue(null);
  publishPost.mockResolvedValue({ ok: true, externalPostId: "ig1", permalink: "https://i/p/1" });
  conferirCollaborators.mockResolvedValue({ ok: true, convites: [] });
});

describe("a FONTE dos colaboradores é o pacote da marca", () => {
  it("pacote ausente: publishPost NÃO recebe collaborators, e collabJson não é gravado", async () => {
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost.mock.calls[0]![1]).not.toHaveProperty("collaborators");
    const escritas = db.socialPost.update.mock.calls.map((c) => c[0].data);
    expect(escritas.some((d: Record<string, unknown>) => "collabJson" in d)).toBe(false);
  });

  it("pacote com colaboradores.ativo=false NÃO envia nada", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({ colaboradores: { ativo: false, contas: ["parceiro.oficial"] } })),
    });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost.mock.calls[0]![1]).not.toHaveProperty("collaborators");
  });

  it("pacote com colaboradores.ativo=true envia as contas declaradas", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({
        colaboradores: { ativo: true, contas: ["parceiro.oficial", "dioli.digital"] },
      })),
    });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost.mock.calls[0]![1]).toMatchObject({
      collaborators: ["parceiro.oficial", "dioli.digital"],
    });
  });

  it("STORY nunca leva collaborators, mesmo com o pacote declarando ativo=true", async () => {
    db.socialPost.findMany.mockResolvedValue([postPendente({ id: "st1", format: "story" })]);
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({
        colaboradores: { ativo: true, contas: ["parceiro.oficial"] },
      })),
    });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost.mock.calls[0]![1]).not.toHaveProperty("collaborators");
  });
});

describe("collabJson — pedidos, enviadoEm, resposta e a conferência", () => {
  it("grava pedidos/enviadoEm/resposta e os convites da conferência pós-publicação", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({ colaboradores: { ativo: true, contas: ["parceiro.oficial"] } })),
    });
    publishPost.mockResolvedValue({
      ok: true, externalPostId: "ig1", permalink: "https://i/p/1", collabResponse: { id: "c1" },
    });
    conferirCollaborators.mockResolvedValue({
      ok: true, convites: [{ username: "parceiro.oficial", invite_status: "PENDING" }],
    });

    await publicarAgendados();

    expect(conferirCollaborators).toHaveBeenCalledWith("ig1", "tk-cli1");
    const escritaComCollab = db.socialPost.update.mock.calls
      .map((c) => c[0].data)
      .find((d: Record<string, unknown>) => "collabJson" in d);
    expect(escritaComCollab).toBeTruthy();
    const gravado = JSON.parse((escritaComCollab as { collabJson: string }).collabJson);
    expect(gravado.pedidos).toEqual(["parceiro.oficial"]);
    expect(gravado.resposta).toEqual({ id: "c1" });
    expect(gravado.convites).toEqual([{ username: "parceiro.oficial", invite_status: "PENDING" }]);
    expect(typeof gravado.enviadoEm).toBe("string");
  });

  it("falha na conferência NÃO desfaz a publicação — post segue 'published', erro fica em collabJson", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({ colaboradores: { ativo: true, contas: ["parceiro.oficial"] } })),
    });
    conferirCollaborators.mockResolvedValue({ ok: false, error: "ETIMEDOUT ao conferir collaborators" });

    const r = await publicarAgendados();

    expect(r.publicados).toBe(1);
    expect(r.falhas).toHaveLength(0);
    // O update de status "published" aconteceu — a conferência não reverte nada.
    const statusPublicado = db.socialPost.update.mock.calls
      .map((c) => c[0].data)
      .some((d: Record<string, unknown>) => d.status === "published");
    expect(statusPublicado).toBe(true);
    const escritaComCollab = db.socialPost.update.mock.calls
      .map((c) => c[0].data)
      .find((d: Record<string, unknown>) => "collabJson" in d);
    const gravado = JSON.parse((escritaComCollab as { collabJson: string }).collabJson);
    expect(gravado.erroDaConferencia).toContain("ETIMEDOUT");
    expect(gravado.convites).toBeUndefined();
  });

  it("conferência lançando exceção também não derruba a rodada (best-effort)", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteValido({ colaboradores: { ativo: true, contas: ["parceiro.oficial"] } })),
    });
    conferirCollaborators.mockRejectedValue(new Error("rede caiu"));

    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
  });
});
