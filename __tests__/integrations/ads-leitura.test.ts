// A camada de LEITURA ANALÍTICA de anúncios.
//
// O que estes testes protegem, em ordem de importância:
//   1. SOMENTE LEITURA — o módulo não pode nem importar um verbo de escrita;
//   2. "não medi" nunca vira "deu zero" — a regra que decide se um relatório de
//      tráfego pago é honesto ou é ficção;
//   3. o CUSTO EM COTA da leitura — 2 pontos por conta, não 1 + N. Foi ritmo de
//      máquina que restringiu a conta da agência em 03/08/2026;
//   4. o veredito é ancorado em número, e a comparação só acontece entre
//      resultados do MESMO tipo.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const graphGet = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string; type?: string; code?: number };
  constructor(message: string, detail?: { type?: string; code?: number }) {
    super(message);
    this.detail = { message, ...detail };
  }
});
vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet, GraphApiError: FakeGraphError }));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));

import {
  lerContasDeAnuncio, lerCampanhasAtivas, lerDesempenhoDaConta, lerPanoramaDaAgencia,
  normalizarConta, normalizarDesempenho, analisarConta, ultimos30Dias,
  FREQUENCIA_DE_ALERTA, MULTIPLO_FORA_DA_CURVA, GASTO_MINIMO_PARA_JULGAR,
  STATUS_QUE_RODAM,
  type ContaDeAnuncioLida, type CampanhaAtiva, type DesempenhoDaCampanha,
} from "@/lib/integrations/meta/ads-leitura";

const PERIODO = { desde: "2026-07-07", ate: "2026-08-05" };

const CONTA: ContaDeAnuncioLida = {
  id: "act_1", nome: "Cliente A", moeda: "BRL", status: 1, statusTexto: "ativa",
  ativa: true, motivoDaDesativacao: null, gastoAcumulado: 900, tetoDeGasto: null,
  fusoHorario: "America/Sao_Paulo",
};

function campanha(over: Partial<CampanhaAtiva> = {}): CampanhaAtiva {
  return {
    id: "c1", nome: "Campanha 1", objetivo: "OUTCOME_LEADS", statusEfetivo: "ACTIVE",
    orcamentoDiario: 30, orcamentoTotal: null, criadaEm: "2026-06-01T00:00:00+0000",
    comecouEm: "2026-06-01T00:00:00+0000", ...over,
  };
}

function desempenho(over: Partial<DesempenhoDaCampanha> = {}): DesempenhoDaCampanha {
  return {
    campanhaId: "c1", nome: "Campanha 1", objetivo: "OUTCOME_LEADS",
    gasto: 100, impressoes: 10_000, alcance: 5_000, frequencia: 2, cliques: 200,
    cpm: 10, cpc: 0.5, ctrPct: 2,
    resultado: { tipo: "lead", quantidade: 10 }, custoPorResultado: 10,
    acoes: { lead: 10 }, naoMedido: [], ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadConnectionToken.mockResolvedValue({ token: "tk", platform: "user", externalId: "1" });
});

// ─── 1. Somente leitura, de verdade ─────────────────────────────────────────

describe("SOMENTE LEITURA — a trava vale para o código, não só para a intenção", () => {
  const fonte = readFileSync(
    path.join(process.cwd(), "lib", "integrations", "meta", "ads-leitura.ts"), "utf8",
  );

  it("não importa nenhum verbo de escrita da Graph", () => {
    // `graphPost`/`graphPostJson` são os únicos caminhos de escrita da casa.
    // Se algum dia alguém importar um deles aqui, este teste falha antes de a
    // Meta descobrir.
    expect(fonte).not.toMatch(/graphPost/);
  });

  it("só declara operações de LEITURA do catálogo (1 ponto cada)", () => {
    const declaradas = [...fonte.matchAll(/operacao:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(declaradas.length).toBeGreaterThan(0);
    for (const op of declaradas) {
      expect(["listar_contas", "ler_campanha", "ler_desempenho", "ler_conta"]).toContain(op);
    }
  });
});

// ─── 2. "não medi" nunca vira "deu zero" ────────────────────────────────────

describe("ausência de informação não é informação", () => {
  it("campo que a Meta não devolveu vira null, nunca 0", () => {
    const d = normalizarDesempenho({ campaign_id: "c1", campaign_name: "X", objective: "OUTCOME_TRAFFIC", spend: "50" });
    expect(d.impressoes).toBeNull();
    expect(d.alcance).toBeNull();
    expect(d.frequencia).toBeNull();
    expect(d.naoMedido.some((m) => /impressões/.test(m))).toBe(true);
  });

  it("sem `actions`, o resultado é null com o motivo escrito — não zero leads", () => {
    const d = normalizarDesempenho({ campaign_id: "c1", objective: "OUTCOME_LEADS", spend: "300", impressions: "1000" });
    expect(d.resultado).toBeNull();
    expect(d.custoPorResultado).toBeNull();
    expect(d.naoMedido.join(" ")).toMatch(/actions/);
  });

  it("actions veio, mas sem a ação do objetivo: diz quais ações vieram", () => {
    const d = normalizarDesempenho({
      campaign_id: "c1", objective: "OUTCOME_LEADS", spend: "300", impressions: "1000",
      actions: [{ action_type: "post_engagement", value: "44" }],
    });
    expect(d.resultado).toBeNull();
    expect(d.acoes).toEqual({ post_engagement: 44 });
    expect(d.naoMedido.join(" ")).toMatch(/post_engagement/);
  });

  it("zero impressões não produz CPM infinito — produz null", () => {
    const d = normalizarDesempenho({ campaign_id: "c1", spend: "10", impressions: "0", clicks: "0" });
    expect(d.cpm).toBeNull();
    expect(d.cpc).toBeNull();
    expect(d.ctrPct).toBeNull();
  });

  it("conta sem campanha ativa é ESTADO, não desempenho zerado", () => {
    const p = analisarConta({ conta: CONTA, periodo: PERIODO, campanhas: [], desempenho: [] });
    expect(p.semCampanhaAtiva).toBe(true);
    expect(p.totais.gasto).toBeNull();
    expect(p.recomendacao).toMatch(/Sem campanha ativa/);
  });
});

// ─── 3. As métricas derivadas ───────────────────────────────────────────────

describe("CPM, CPC, CTR e custo por resultado são CALCULADOS, nunca pedidos", () => {
  it("calcula a partir do que a Meta devolveu", () => {
    const d = normalizarDesempenho({
      campaign_id: "c1", campaign_name: "Tráfego", objective: "OUTCOME_TRAFFIC",
      spend: "200", impressions: "20000", reach: "8000", frequency: "2.5", clicks: "400",
      actions: [{ action_type: "link_click", value: "320" }],
    });
    expect(d.cpm).toBe(10);            // 200 / 20000 × 1000
    expect(d.cpc).toBe(0.5);           // 200 / 400
    expect(d.ctrPct).toBe(2);          // 400 / 20000 × 100
    expect(d.resultado).toEqual({ tipo: "link_click", quantidade: 320 });
    expect(d.custoPorResultado).toBe(0.63); // 200 / 320
    expect(d.frequencia).toBe(2.5);
  });

  it("objetivo de alcance tem o ALCANCE como resultado — não inventa lead", () => {
    const d = normalizarDesempenho({
      campaign_id: "c2", objective: "OUTCOME_AWARENESS", spend: "100", reach: "25000", impressions: "40000",
    });
    expect(d.resultado).toEqual({ tipo: "alcance", quantidade: 25000 });
    expect(d.custoPorResultado).toBe(0);
  });

  it("valor em centavos da conta vira unidade da moeda uma vez só", () => {
    const c = normalizarConta({ id: "act_9", name: "X", currency: "USD", account_status: 1, amount_spent: "123456" });
    expect(c.gastoAcumulado).toBe(1234.56);
    expect(c.moeda).toBe("USD");
  });

  it("conta desativada carrega o MOTIVO da Meta, não só o status", () => {
    const c = normalizarConta({ id: "act_9", name: "Dioli", account_status: 2, disable_reason: 1 });
    expect(c.ativa).toBe(false);
    expect(c.statusTexto).toBe("desativada");
    expect(c.motivoDaDesativacao).toMatch(/integridade de anúncios/);
  });
});

// ─── 4. O veredito ──────────────────────────────────────────────────────────

describe("a análise: recomendação sem número é opinião", () => {
  it("a mediana é do PAR, não da campanha boa — com duas campanhas ninguém é acusado à toa", () => {
    // Este teste nasceu de um engano NOSSO ao escrevê-lo: com R$ 5 e R$ 30 por
    // lead, a leitura intuitiva é "a de R$ 30 está queimando". A mediana de
    // [5, 30] é 17,5, e 30 < 35 — logo NÃO chega ao limiar de 2×. O código
    // está certo e a intuição estava errada, que é exatamente o motivo de o
    // limiar ser um número declarado e não um julgamento de cada leitor.
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO,
      campanhas: [campanha({ id: "boa" }), campanha({ id: "ruim" })],
      desempenho: [
        desempenho({ campanhaId: "boa", nome: "Boa", gasto: 100, resultado: { tipo: "lead", quantidade: 20 }, custoPorResultado: 5 }),
        desempenho({ campanhaId: "ruim", nome: "Ruim", gasto: 300, resultado: { tipo: "lead", quantidade: 10 }, custoPorResultado: 30 }),
      ],
    });
    expect(p.achados.some((a) => a.tipo === "queima")).toBe(false);
    // Mas a barata (5 <= 17,5 × 0,7 = 12,25) é candidata a escalar, com número.
    const escala = p.achados.find((a) => a.tipo === "escala" && a.campanhaId === "boa");
    expect(escala).toBeDefined();
    expect(escala!.numero).toBe(5);
    expect(escala!.frase).toMatch(/mediana/);
    expect(p.recomendacao).toMatch(/Escalar aqui/);
  });

  it("campanha ligada que a Meta não reportou entra como ATIVA E SEM ENTREGA", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO,
      campanhas: [campanha({ id: "fantasma", nome: "Fantasma" })],
      desempenho: [],
    });
    const a = p.achados.find((x) => x.tipo === "ativo_indevido");
    expect(a).toBeDefined();
    expect(a!.frase).toMatch(/NENHUMA linha de desempenho/);
    expect(p.semCampanhaAtiva).toBe(false);
  });

  it("WITH_ISSUES é verba de pé com anúncio reprovado — e sai com o orçamento", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO,
      campanhas: [campanha({ id: "c1", statusEfetivo: "WITH_ISSUES", orcamentoDiario: 50 })],
      desempenho: [desempenho({ campanhaId: "c1" })],
    });
    const a = p.achados.find((x) => x.tipo === "ativo_indevido");
    expect(a!.frase).toMatch(/WITH_ISSUES/);
    expect(a!.emJogo).toBe(1500); // 50/dia × 30
  });

  it("gastou e produziu ZERO resultado é queima, com o gasto como número", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO, campanhas: [campanha()],
      desempenho: [desempenho({ gasto: 450, resultado: { tipo: "lead", quantidade: 0 }, custoPorResultado: null })],
    });
    const a = p.achados.find((x) => x.tipo === "queima");
    expect(a!.frase).toMatch(/ZERO lead/);
    expect(a!.emJogo).toBe(450);
  });

  it("gastou e o resultado NÃO FOI MEDIDO é lacuna, não queima", () => {
    // A diferença importa: "não deu resultado" manda pausar; "não medi" manda
    // conferir o pixel. Tratar os dois igual é o erro caro.
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO, campanhas: [campanha()],
      desempenho: [desempenho({ gasto: 450, resultado: null, custoPorResultado: null, acoes: {}, naoMedido: ["a Meta não devolveu ações"] })],
    });
    expect(p.achados.find((x) => x.tipo === "lacuna")).toBeDefined();
    expect(p.achados.find((x) => x.tipo === "queima")).toBeUndefined();
  });

  it("frequência acima do limiar da casa vira 'criativo cansado'", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO, campanhas: [campanha()],
      desempenho: [desempenho({ frequencia: FREQUENCIA_DE_ALERTA + 0.4, gasto: GASTO_MINIMO_PARA_JULGAR + 1 })],
    });
    expect(p.achados.some((a) => /Criativo cansado/.test(a.frase))).toBe(true);
  });

  it("campanha de gasto irrisório não recebe veredito — 3 cliques não provam nada", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO, campanhas: [campanha()],
      desempenho: [desempenho({ gasto: GASTO_MINIMO_PARA_JULGAR - 1, resultado: { tipo: "lead", quantidade: 0 }, custoPorResultado: null, frequencia: 9 })],
    });
    expect(p.achados.filter((a) => a.tipo === "queima")).toHaveLength(0);
  });

  it("nunca compara custo por LEAD com custo por CLIQUE", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO,
      campanhas: [campanha({ id: "a" }), campanha({ id: "b" })],
      desempenho: [
        desempenho({ campanhaId: "a", nome: "Leads", objetivo: "OUTCOME_LEADS", gasto: 300, resultado: { tipo: "lead", quantidade: 10 }, custoPorResultado: 30 }),
        desempenho({ campanhaId: "b", nome: "Tráfego", objetivo: "OUTCOME_TRAFFIC", gasto: 300, resultado: { tipo: "link_click", quantidade: 3000 }, custoPorResultado: 0.1 }),
      ],
    });
    // Um lead a R$ 30 não é "300× pior" que um clique a R$ 0,10: são grandezas
    // diferentes. Com um só de cada tipo, não há mediana a comparar.
    expect(p.achados.filter((a) => a.tipo === "queima" || a.tipo === "escala")).toHaveLength(0);
  });

  it("fora da curva de verdade (>= 2× a mediana) é acusado, e o barato vira escala", () => {
    const p = analisarConta({
      conta: CONTA, periodo: PERIODO,
      campanhas: [campanha({ id: "a" }), campanha({ id: "b" }), campanha({ id: "c" })],
      desempenho: [
        desempenho({ campanhaId: "a", nome: "A", gasto: 100, resultado: { tipo: "lead", quantidade: 20 }, custoPorResultado: 5 }),
        desempenho({ campanhaId: "b", nome: "B", gasto: 200, resultado: { tipo: "lead", quantidade: 20 }, custoPorResultado: 10 }),
        desempenho({ campanhaId: "c", nome: "C", gasto: 400, resultado: { tipo: "lead", quantidade: 10 }, custoPorResultado: 40 }),
      ],
    });
    // Mediana = 10. C (40) >= 10 × 2 → queima. A (5) <= 10 × 0,7 → escala.
    expect(p.achados.some((x) => x.tipo === "queima" && x.campanhaId === "c")).toBe(true);
    expect(p.achados.some((x) => x.tipo === "escala" && x.campanhaId === "a")).toBe(true);
    const queima = p.achados.find((x) => x.tipo === "queima" && x.campanhaId === "c")!;
    // Economia = 400 gastos − 10 leads × mediana 10 = 300.
    expect(queima.emJogo).toBe(300);
    expect(MULTIPLO_FORA_DA_CURVA).toBe(2);
  });
});

// ─── 5. O custo em COTA da leitura ──────────────────────────────────────────

describe("o ritmo: 2 pontos por conta, em série", () => {
  it("pede as campanhas já filtradas por status, declarando operação e conta", async () => {
    graphGet.mockResolvedValue({ data: [] });
    await lerCampanhasAtivas("w", "cx", "act_77");
    const [caminho, , params, opts] = graphGet.mock.calls[0];
    expect(caminho).toBe("act_77/campaigns");
    expect(JSON.parse(params.effective_status)).toEqual(STATUS_QUE_RODAM);
    expect(opts).toEqual({ operacao: "ler_campanha", conta: "act_77" });
  });

  it("o desempenho de TODAS as campanhas sai numa chamada (level=campaign)", async () => {
    graphGet.mockResolvedValue({ data: [] });
    await lerDesempenhoDaConta("w", "cx", "act_77", PERIODO);
    const [caminho, , params, opts] = graphGet.mock.calls[0];
    expect(caminho).toBe("act_77/insights");
    expect(params.level).toBe("campaign");
    expect(JSON.parse(params.time_range)).toEqual({ since: PERIODO.desde, until: PERIODO.ate });
    expect(opts).toEqual({ operacao: "ler_desempenho", conta: "act_77" });
    // Nenhum campo cujo nome a biblioteca não atesta.
    expect(params.fields).not.toMatch(/cpm|ctr|cost_per_action_type/);
  });

  it("a agência inteira custa 1 + 2 por conta ativa — não 1 + N por campanha", async () => {
    graphGet
      .mockResolvedValueOnce({ data: [
        { id: "act_1", name: "A", currency: "BRL", account_status: 1 },
        { id: "act_2", name: "B", currency: "BRL", account_status: 1 },
        { id: "act_3", name: "Desativada", currency: "BRL", account_status: 2, disable_reason: 1 },
      ] })
      // act_1: campanhas + insights
      .mockResolvedValueOnce({ data: [{ id: "c1", name: "C1", objective: "OUTCOME_LEADS", effective_status: "ACTIVE" }] })
      .mockResolvedValueOnce({ data: [{ campaign_id: "c1", campaign_name: "C1", objective: "OUTCOME_LEADS", spend: "100", impressions: "1000", clicks: "50", actions: [{ action_type: "lead", value: "5" }] }] })
      // act_2: sem campanha ativa → NÃO gasta o ponto do insights
      .mockResolvedValueOnce({ data: [] });

    const r = await lerPanoramaDaAgencia("w", "cx", { periodo: PERIODO });
    expect(r.ok).toBe(true);
    const d = r.dados!;
    expect(d.totalDeContas).toBe(3);
    expect(d.contasAtivas).toBe(2);
    expect(d.contasComCampanhaAtiva).toBe(1);
    // 1 (contas) + 2 (act_1) + 1 (act_2, sem campanha) = 4.
    expect(d.pontosGastos).toBe(4);
    expect(graphGet).toHaveBeenCalledTimes(4);
    // A conta desativada não some do relatório: entra declarada, com o motivo.
    expect(d.naoLidas.find((n) => n.conta === "act_3")!.motivo).toMatch(/desativada.*integridade/);
  });

  it("erro numa conta não derruba as outras — entra em naoLidas com o motivo", async () => {
    graphGet
      .mockResolvedValueOnce({ data: [
        { id: "act_1", name: "A", currency: "BRL", account_status: 1 },
        { id: "act_2", name: "B", currency: "BRL", account_status: 1 },
      ] })
      .mockRejectedValueOnce(new FakeGraphError("(#100) Unknown path components"))
      .mockResolvedValueOnce({ data: [] });

    const r = await lerPanoramaDaAgencia("w", "cx", { periodo: PERIODO });
    expect(r.ok).toBe(true);
    expect(r.dados!.naoLidas.some((n) => n.conta === "act_1")).toBe(true);
    expect(r.dados!.contas.some((c) => c.conta.id === "act_2")).toBe(true);
  });

  it("freio de ritmo PARA a varredura — insistir estende o bloqueio", async () => {
    const { TIPO_DE_RITMO_DA_CASA } = await import("@/lib/integrations/meta/ritmo");
    graphGet
      .mockResolvedValueOnce({ data: [
        { id: "act_1", name: "A", currency: "BRL", account_status: 1 },
        { id: "act_2", name: "B", currency: "BRL", account_status: 1 },
      ] })
      .mockRejectedValueOnce(new FakeGraphError("seguramos o ritmo com a Meta", { type: TIPO_DE_RITMO_DA_CASA }));

    const r = await lerPanoramaDaAgencia("w", "cx", { periodo: PERIODO });
    expect(r.ok).toBe(true);
    // 1 listagem + 1 tentativa freada. A segunda conta NÃO foi tentada.
    expect(graphGet).toHaveBeenCalledTimes(2);
    expect(r.dados!.contas).toHaveLength(0);
  });

  it("sem conexão, diz isso — não devolve panorama vazio como se fosse leitura", async () => {
    loadConnectionToken.mockResolvedValue(null);
    const r = await lerContasDeAnuncio("w", "cx");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_conexao");
  });

  it("permissão faltando vira frase de gente, não erro cru da Graph", async () => {
    graphGet.mockRejectedValue(new FakeGraphError("(#200) Requires ads_read permission"));
    const r = await lerContasDeAnuncio("w", "cx");
    expect(r.motivo).toBe("sem_permissao");
    expect(r.erro).toMatch(/App Review/);
  });
});

// ─── 6. A janela ────────────────────────────────────────────────────────────

describe("a janela de 30 dias fecha em ONTEM", () => {
  it("não inclui o dia corrente, que a Meta ainda está consolidando", () => {
    const p = ultimos30Dias(new Date("2026-08-06T12:00:00Z"));
    expect(p.ate).toBe("2026-08-05");
    expect(p.desde).toBe("2026-07-07");
  });
});
