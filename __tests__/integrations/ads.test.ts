import { describe, it, expect, beforeEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const graphPost = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string };
  constructor(message: string) { super(message); this.detail = { message }; }
});
vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet, graphPost, GraphApiError: FakeGraphError }));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));

import {
  conferirOrcamento, criarCampanhaPausada, ativarCampanha, pausarCampanha,
  listarContasDeAnuncio, lerDesempenho,
  criarConjuntoPausado, criarAnuncioPausado, limparCacheDeDesempenho,
  PISO_DIARIO_BRL, TETO_DIARIO_ABSOLUTO_BRL, RAIO_MAX_KM,
} from "@/lib/integrations/meta/ads";

const PLANO = {
  contaId: "act_123", nome: "Padaria — tráfego local",
  objetivo: "trafego" as const, orcamentoDiarioBRL: 30, tetoAprovadoBRL: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  // `lerDesempenho` passou a ter cache de 15 min (a varredura da esteira batia
  // na Meta a cada 5 minutos, por campanha). Cache que atravessa teste é teste
  // medindo o teste anterior.
  limparCacheDeDesempenho();
  loadConnectionToken.mockResolvedValue({ token: "tk", platform: "facebook", externalId: "1" });
  graphPost.mockResolvedValue({ id: "camp_1" });
  graphGet.mockResolvedValue({ data: [{ spend: "120.50", impressions: "8000", clicks: "241", reach: "5100" }] });
});

describe("o orçamento é conferido ANTES de tocar em dinheiro", () => {
  // Determinístico, sem rede: precisa estar certo mesmo se a Meta mudar, o
  // token vencer ou a rede cair. E é a única parte testável sem gastar nada.
  it("orçamento acima do que o cliente aprovou é recusado", () => {
    const r = conferirOrcamento({ orcamentoDiarioBRL: 80, tetoAprovadoBRL: 50 });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/teto que o cliente aprovou/);
  });

  it("sem teto aprovado não se cria campanha nenhuma", () => {
    expect(conferirOrcamento({ orcamentoDiarioBRL: 30, tetoAprovadoBRL: 0 }).ok).toBe(false);
  });

  it("o teto da casa vale mesmo se o cliente aprovar mais — é a última defesa", () => {
    const r = conferirOrcamento({
      orcamentoDiarioBRL: TETO_DIARIO_ABSOLUTO_BRL + 1,
      tetoAprovadoBRL: TETO_DIARIO_ABSOLUTO_BRL * 10,
    });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/teto desta agência/);
  });

  it("abaixo do mínimo da Meta é recusado — campanha que não entrega é dinheiro parado", () => {
    expect(conferirOrcamento({ orcamentoDiarioBRL: PISO_DIARIO_BRL - 1, tetoAprovadoBRL: 100 }).ok).toBe(false);
  });

  it("valor inválido não escapa como NaN para a Meta", () => {
    expect(conferirOrcamento({ orcamentoDiarioBRL: Number.NaN, tetoAprovadoBRL: 100 }).ok).toBe(false);
    expect(conferirOrcamento({ orcamentoDiarioBRL: -10, tetoAprovadoBRL: 100 }).ok).toBe(false);
  });

  it("dentro do teto, passa", () => {
    expect(conferirOrcamento({ orcamentoDiarioBRL: 30, tetoAprovadoBRL: 50 }).ok).toBe(true);
  });
});

describe("nada nasce ativo — o dinheiro só sai por decisão com dono", () => {
  it("a campanha é criada PAUSED, sempre", async () => {
    await criarCampanhaPausada("ws1", "mc1", PLANO);
    expect(graphPost.mock.calls[0]![2].status).toBe("PAUSED");
  });

  it("o orçamento vai em centavos, como a Meta espera", async () => {
    await criarCampanhaPausada("ws1", "mc1", PLANO);
    expect(graphPost.mock.calls[0]![2].daily_budget).toBe("3000");
  });

  it("o orçamento fica na CAMPANHA, não no conjunto — senão multiplica o gasto", async () => {
    // Orçamento por conjunto multiplicaria o gasto pelo número de conjuntos:
    // o jeito mais fácil de estourar o teto sem ninguém perceber.
    await criarCampanhaPausada("ws1", "mc1", PLANO);
    expect(graphPost.mock.calls[0]![0]).toBe("act_123/campaigns");
  });

  it("orçamento estourado nem chega a virar chamada à Meta", async () => {
    const r = await criarCampanhaPausada("ws1", "mc1", { ...PLANO, orcamentoDiarioBRL: 999 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("orcamento_invalido");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("ativar sem autorizador identificado é recusado", async () => {
    const r = await ativarCampanha("ws1", "mc1", "camp_1", "  ");
    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("ativar com autorizador manda ACTIVE", async () => {
    graphPost.mockResolvedValue({});
    const r = await ativarCampanha("ws1", "mc1", "camp_1", "cliente:João");
    expect(r.ok).toBe(true);
    expect(graphPost.mock.calls[0]![2].status).toBe("ACTIVE");
  });

  it("pausar nunca exige cerimônia — freio com burocracia não é freio", async () => {
    graphPost.mockResolvedValue({});
    const r = await pausarCampanha("ws1", "mc1", "camp_1");
    expect(r.ok).toBe(true);
    expect(graphPost.mock.calls[0]![2].status).toBe("PAUSED");
  });
});

describe("o erro que o operador vai ver de verdade", () => {
  it("permissão faltando vira 'depende do App Review', não erro cru da Graph", async () => {
    graphGet.mockRejectedValue(new FakeGraphError("(#200) Requires ads_management permission"));
    const r = await listarContasDeAnuncio("ws1", "mc1");
    expect(r.motivo).toBe("sem_permissao");
    expect(r.erro).toMatch(/App Review/);
  });

  it("sem conta de anúncio, diz o que o CLIENTE precisa fazer", async () => {
    graphGet.mockResolvedValue({ data: [] });
    const r = await listarContasDeAnuncio("ws1", "mc1");
    expect(r.motivo).toBe("sem_conta");
    expect(r.erro).toMatch(/acesso à conta de anúncios/);
  });
});

describe("desempenho pago: 'não medi' nunca vira zero", () => {
  it("lê gasto, cliques e calcula o CPC — sem estimar nada", async () => {
    const r = await lerDesempenho("ws1", "mc1", "camp_1", { desde: "2026-08-01", ate: "2026-08-31" });
    expect(r.dados!.gastoBRL).toBe(120.5);
    expect(r.dados!.cpcBRL).toBe(0.5);
  });

  it("zero clique não vira divisão por zero nem CPC inventado", async () => {
    graphGet.mockResolvedValue({ data: [{ spend: "50", impressions: "100", clicks: "0", reach: "80" }] });
    const r = await lerDesempenho("ws1", "mc1", "camp_1", { desde: "2026-08-01", ate: "2026-08-31" });
    expect(r.dados!.cpcBRL).toBeNull();
  });

  it("Meta sem dados devolve falha, não uma linha de zeros", async () => {
    // Zero gasto é notícia (não entregou); "não consegui medir" é outra coisa.
    // Confundir as duas num relatório de tráfego pago é o erro mais caro.
    graphGet.mockResolvedValue({ data: [] });
    const r = await lerDesempenho("ws1", "mc1", "camp_1", { desde: "2026-08-01", ate: "2026-08-31" });
    expect(r.ok).toBe(false);
    expect(r.dados).toBeUndefined();
  });
});

describe("o conjunto de anúncios — sem ele a campanha é um envelope com verba", () => {
  const PUBLICO = {
    cidade: "Campinas, SP", raioKm: 5, idadeMin: 25, idadeMax: 55,
    interesses: [{ id: "6003", name: "Culinária" }],
  };
  const BASE = { contaId: "act_123", campaignId: "camp_1", nome: "Padaria", objetivo: "trafego" as const };

  beforeEach(() => {
    graphGet.mockResolvedValue({ data: [{ key: "2429", name: "Campinas", country_code: "BR" }] });
    graphPost.mockResolvedValue({ id: "adset_1" });
  });

  it("nasce pausado, como tudo aqui", async () => {
    await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: PUBLICO });
    expect(graphPost.mock.calls[0]![2].status).toBe("PAUSED");
  });

  it("o raio do bairro vira segmentação de verdade, em km", async () => {
    const r = await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: PUBLICO });
    const t = JSON.parse(graphPost.mock.calls[0]![2].targeting);
    expect(t.geo_locations.cities[0]).toMatchObject({ key: "2429", radius: 5, distance_unit: "kilometer" });
    expect(r.dados!.segmentouGeografia).toBe(true);
  });

  it("cidade que a Meta não conhece NÃO vira coordenada inventada", async () => {
    // Cai no país inteiro e avisa. Inventar lat/long poria o anúncio do padeiro
    // num lugar que ninguém escolheu.
    graphGet.mockResolvedValue({ data: [] });
    const r = await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: PUBLICO });
    const t = JSON.parse(graphPost.mock.calls[0]![2].targeting);
    expect(t.geo_locations.countries).toEqual(["BR"]);
    expect(r.dados!.segmentouGeografia).toBe(false);
  });

  it("raio absurdo é aparado — 500 km não é 'o bairro do padeiro'", async () => {
    await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: { ...PUBLICO, raioKm: 500 } });
    const t = JSON.parse(graphPost.mock.calls[0]![2].targeting);
    expect(t.geo_locations.cities[0].radius).toBe(RAIO_MAX_KM);
  });

  it("sem interesse confirmado, não segmenta por interesse — palpite é pior que nada", async () => {
    await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: { ...PUBLICO, interesses: [] } });
    const t = JSON.parse(graphPost.mock.calls[0]![2].targeting);
    expect(t.flexible_spec).toBeUndefined();
  });

  it("o orçamento NÃO vai no conjunto — só na campanha", async () => {
    await criarConjuntoPausado("ws1", "mc1", { ...BASE, publico: PUBLICO });
    expect(graphPost.mock.calls[0]![2].daily_budget).toBeUndefined();
  });
});

describe("o anúncio", () => {
  const AD = {
    contaId: "act_123", adSetId: "adset_1", pageId: "page_1", nome: "Padaria",
    imagemUrl: "https://app.dioli.studio/api/media/m1?sig=x",
    texto: "Pão quentinho todo dia às 6h.", titulo: "Pão de verdade",
    link: "https://wa.me/5519999999999", cta: "WHATSAPP_MESSAGE",
  };

  it("cria criativo e anúncio, ambos pausados", async () => {
    graphPost.mockResolvedValueOnce({ id: "cre_1" }).mockResolvedValueOnce({ id: "ad_1" });
    const r = await criarAnuncioPausado("ws1", "mc1", AD);
    expect(r.dados).toEqual({ adId: "ad_1", creativeId: "cre_1" });
    expect(graphPost.mock.calls[1]![2].status).toBe("PAUSED");
  });

  it("anúncio sem imagem ou sem destino não é anúncio", async () => {
    expect((await criarAnuncioPausado("ws1", "mc1", { ...AD, imagemUrl: "" })).ok).toBe(false);
    expect((await criarAnuncioPausado("ws1", "mc1", { ...AD, link: "" })).ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("CTA inválido não derruba a criação — cai no padrão", async () => {
    graphPost.mockResolvedValueOnce({ id: "cre_1" }).mockResolvedValueOnce({ id: "ad_1" });
    await criarAnuncioPausado("ws1", "mc1", { ...AD, cta: "INVENTADO" });
    const spec = JSON.parse(graphPost.mock.calls[0]![2].object_story_spec);
    expect(spec.link_data.call_to_action.type).toBe("LEARN_MORE");
  });
});
