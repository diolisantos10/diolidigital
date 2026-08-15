import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── O ANÚNCIO DE UM CLIENTE NASCIA COM O ATIVO DE OUTRO (15/08/2026) ────────
//
// `montarCriativo` escolhia a Página com `findFirst({ workspaceId, platform:
// "facebook" })` — SEM `clientId` — e a arte com `findFirst({ mediaUrl: { not:
// null } })` — sem dono nenhum. Numa base com mais de um cliente, isso é: o
// anúncio do cliente A sai assinado pela Página do cliente B, com a arte do
// post mais recente do banco, seja de quem for.
//
// O teste que existia (`trafego.test.ts`, "sem página do Facebook conectada")
// só provava a AUSÊNCIA: sem nenhuma Página, não há anúncio. Ele passava com o
// código defeituoso, porque o defeito não é a falta da Página — é a Página
// ERRADA. Este arquivo é o de refutação: os fixtures têm DOIS clientes, e o
// mock do banco HONRA o filtro. Um teste cujo banco falso devolve sempre a
// mesma linha não consegue enxergar este defeito nem em princípio.
//
// Prova de que ele reprova o código antigo (rodado antes do conserto):
//   × só existe Página do cliente B → o cliente A recebeu page_B
//   × só existe arte do cliente B  → o cliente A recebeu a arte ARTE_DO_B

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn(), count: vi.fn() },
  deliverable: { findFirst: vi.fn(), findMany: vi.fn() },
  socialPost: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
  adCampaign: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const ads = vi.hoisted(() => ({
  criarCampanhaPausada: vi.fn(),
  criarConjuntoPausado: vi.fn(),
  criarAnuncioPausado: vi.fn(),
  buscarInteresses: vi.fn(),
  listarContasDeAnuncio: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/ads", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...ads,
}));

import { prepararCampanha } from "@/lib/agency/esteira/trafego";

// ── O BANCO FALSO QUE OBEDECE AO `where` ────────────────────────────────────
// Sem isto o teste não mede nada: qualquer filtro (ou a falta dele) devolveria
// a mesma linha, e o defeito ficaria invisível — que é exatamente como ele
// atravessou a construção inteira do departamento.
type Linha = Record<string, unknown>;

function combina(linha: Linha, onde: Linha): boolean {
  for (const [campo, valor] of Object.entries(onde)) {
    if (valor === undefined) continue;
    if (campo === "OR") {
      const ramos = valor as Linha[];
      // `OR: []` no Prisma não casa com nada — e é assim que tem que ser aqui.
      if (!ramos.some((r) => combina(linha, r))) return false;
      continue;
    }
    if (campo === "AND") {
      if (!(valor as Linha[]).every((r) => combina(linha, r))) return false;
      continue;
    }
    if (valor !== null && typeof valor === "object") {
      const op = valor as Record<string, unknown>;
      if ("not" in op && op.not === null) { if (linha[campo] == null) return false; continue; }
      if ("in" in op) { if (!(op.in as unknown[]).includes(linha[campo])) return false; continue; }
      continue; // operador que este fixture não precisa distinguir
    }
    if (linha[campo] !== valor) return false;
  }
  return true;
}

const primeiro = (linhas: Linha[]) => async (q: { where?: Linha } = {}) =>
  linhas.find((l) => combina(l, q.where ?? {})) ?? null;

// ── Os dois clientes ────────────────────────────────────────────────────────
const PROJETO_A = {
  id: "pA", name: "Tráfego", workspaceId: "ws1", clientId: "cA", clientRequestId: "crA",
  client: { name: "Cliente A", website: null, phone: "(19) 99999-9999" },
};

const CONEXAO_USUARIO_A = {
  id: "mcUserA", workspaceId: "ws1", clientId: "cA", platform: "user", status: "connected", externalId: "user_A",
};
const PAGINA_A = {
  id: "mcPageA", workspaceId: "ws1", clientId: "cA", platform: "facebook", status: "connected", externalId: "page_A",
};
const PAGINA_B = {
  id: "mcPageB", workspaceId: "ws1", clientId: "cB", platform: "facebook", status: "connected", externalId: "page_B",
};

// A arte do cliente B é a MAIS RECENTE da base — é assim que ela ganhava o
// `orderBy: { createdAt: "desc" }` sem dono.
const ARTE_DE_B = {
  id: "spB", workspaceId: "ws1", clientId: "cB", clientRequestId: "crB", deliverableId: "dB",
  mediaUrl: "/api/media/ARTE_DO_B", createdAt: new Date("2026-08-14T12:00:00Z"),
};
const ARTE_DE_A = {
  id: "spA", workspaceId: "ws1", clientId: "cA", clientRequestId: "crA", deliverableId: "dA",
  mediaUrl: "/api/media/ARTE_DO_A", createdAt: new Date("2026-08-01T12:00:00Z"),
};

const BRIEFING = JSON.stringify({
  scope: {
    adsBudget: 900,
    traffic: { platforms: ["Meta Ads"], serviceArea: { alcance: "local", cidade: "Campinas", raioKm: 8, comoFoiDito: "aqui em Campinas" } },
  },
});

function montarBanco(paginas: Linha[], artes: Linha[]) {
  db.metaConnection.findFirst.mockImplementation(primeiro([CONEXAO_USUARIO_A, ...paginas]));
  db.socialPost.findFirst.mockImplementation(primeiro(artes));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue(PROJETO_A);
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Cliente A", briefingJson: BRIEFING });
  db.metaConnection.count.mockResolvedValue(0);
  db.deliverable.findFirst.mockResolvedValue(null);
  // As entregas do projeto A. A do cliente B (`dB`) nunca aparece aqui.
  db.deliverable.findMany.mockResolvedValue([{ id: "dA" }]);
  db.adCampaign.findFirst.mockResolvedValue(null);
  db.adCampaign.create.mockResolvedValue({ id: "ac1" });
  db.adCampaign.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  ads.listarContasDeAnuncio.mockResolvedValue({ ok: true, dados: [{ id: "act_A", nome: "A", moeda: "BRL", status: 1 }] });
  ads.criarCampanhaPausada.mockResolvedValue({ ok: true, dados: { campaignId: "camp_1" } });
  ads.criarConjuntoPausado.mockResolvedValue({ ok: true, dados: { adSetId: "adset_1", segmentouGeografia: true } });
  ads.criarAnuncioPausado.mockResolvedValue({ ok: true, dados: { adId: "ad_1", creativeId: "cre_1" } });
  ads.buscarInteresses.mockResolvedValue([]);
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  process.env.JWT_SECRET = "test-secret";
  montarBanco([PAGINA_A, PAGINA_B], [ARTE_DE_B, ARTE_DE_A]);
});

const criativoEnviado = () => ads.criarAnuncioPausado.mock.calls[0]?.[2] as
  { pageId: string; imagemUrl: string } | undefined;

describe("a Página que assina o anúncio é a do DONO do projeto", () => {
  it("só existe Página do cliente B → o anúncio do cliente A NÃO é criado", async () => {
    // O caso que estava em produção. Antes do conserto, `page_B` ia crua para
    // `object_story_spec.page_id`: o anúncio de A assinado pela marca de B.
    montarBanco([PAGINA_B], [ARTE_DE_A]);
    const r = await prepararCampanha("pA");
    expect(ads.criarAnuncioPausado).not.toHaveBeenCalled();
    expect(db.adCampaign.create.mock.calls[0]![0].data.adId).toBeNull();
  });

  it("com as duas Páginas na base, a escolhida é a do cliente A", async () => {
    await prepararCampanha("pA");
    expect(criativoEnviado()!.pageId).toBe("page_A");
  });

  it("a pendência diz o que falta e de quem — não culpa a Meta", async () => {
    montarBanco([PAGINA_B], [ARTE_DE_A]);
    const r = await prepararCampanha("pA");
    expect(r.pendencia).not.toMatch(/a Meta recusou/i);
    expect(r.pendencia).toMatch(/p[áa]gina/i);
    // Barrar sem ensinar o gesto é o que trava a casa: a frase carrega o clique.
    expect(r.pendencia).toMatch(/portal do cliente/i);
  });
});

describe("a arte que entra no anúncio é a do PROJETO", () => {
  it("só existe arte do cliente B → nenhuma arte é escolhida para o cliente A", async () => {
    // "O post mais recente do mundo" é a arte paga de outro cliente.
    montarBanco([PAGINA_A], [ARTE_DE_B]);
    await prepararCampanha("pA");
    expect(ads.criarAnuncioPausado).not.toHaveBeenCalled();
  });

  it("com as duas artes na base, a escolhida é a do projeto de A — mesmo sendo a mais antiga", async () => {
    await prepararCampanha("pA");
    expect(criativoEnviado()!.imagemUrl).toContain("ARTE_DO_A");
    expect(criativoEnviado()!.imagemUrl).not.toContain("ARTE_DO_B");
  });

  it("arte de OUTRO projeto do MESMO cliente também não serve", async () => {
    // O dono bate, o projeto não. Continua sendo peça que ninguém escolheu para
    // esta campanha — e o cliente pagou por ela num outro contexto.
    const OUTRO_PROJETO_DE_A = {
      id: "spA2", workspaceId: "ws1", clientId: "cA", clientRequestId: "crOutro", deliverableId: "dOutro",
      mediaUrl: "/api/media/ARTE_DE_OUTRO_PROJETO", createdAt: new Date("2026-08-20T12:00:00Z"),
    };
    montarBanco([PAGINA_A], [OUTRO_PROJETO_DE_A, ARTE_DE_A]);
    await prepararCampanha("pA");
    expect(criativoEnviado()!.imagemUrl).toContain("ARTE_DO_A");
  });
});

describe("a metade oposta: com tudo do dono no lugar, o anúncio sai", () => {
  it("Página de A + arte do projeto de A → anúncio criado e campanha completa", async () => {
    // Sem esta metade o conserto viraria 'nunca cria anúncio', que passa em
    // todo teste de recusa e entrega zero ao cliente.
    const r = await prepararCampanha("pA");
    expect(r.ok).toBe(true);
    expect(db.adCampaign.create.mock.calls[0]![0].data.adId).toBe("ad_1");
    expect(db.adCampaign.create.mock.calls[0]![0].data.lastError).toBeNull();
  });
});
