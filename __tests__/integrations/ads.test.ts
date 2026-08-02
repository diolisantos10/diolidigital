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
  PISO_DIARIO_BRL, TETO_DIARIO_ABSOLUTO_BRL,
} from "@/lib/integrations/meta/ads";

const PLANO = {
  contaId: "act_123", nome: "Padaria — tráfego local",
  objetivo: "trafego" as const, orcamentoDiarioBRL: 30, tetoAprovadoBRL: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
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
