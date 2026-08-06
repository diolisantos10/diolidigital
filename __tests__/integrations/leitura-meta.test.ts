// A camada de LEITURA da Meta (leitura.ts): feed com paginação, métricas com
// série, os dois estados de conexão que a UI precisa distinguir, e o cache.
// Tudo com graphGet mockado — teste aqui não fala com a Meta nunca.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());
const marcarConexaoExpirada = vi.hoisted(() => vi.fn());

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  status: number;
  detail?: { message?: string; code?: number; type?: string };
  constructor(message: string, code?: number) {
    super(message);
    this.name = "GraphApiError";
    this.status = 400;
    this.detail = { message, code };
  }
});

vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet, GraphApiError: FakeGraphError }));
vi.mock("@/lib/integrations/meta/connections", () => ({
  conexaoDoCliente, loadConnectionToken, marcarConexaoExpirada,
}));

import {
  lerFeedDoCliente,
  lerMetricasDaConta,
  lerMetricasDosPosts,
  limparCacheDeLeitura,
  LIMITE_MAXIMO_DO_FEED,
  ROTULO_DO_ALCANCE,
  TETO_DE_CHAMADAS_POR_HORA,
  FRASE_DO_TETO,
} from "@/lib/integrations/meta/leitura";

// O teto por hora e o cache desta camada são contados NO BANCO desde
// 06/08/2026, e o teto é FAIL-CLOSED: sem banco, a leitura recusa antes de
// tudo. Por isso a suíte sobe um SQLite em memória a partir do arquivo de
// migration REAL — sem ele, o que se mediria seria a recusa, não o comportamento.
import { subirCotaDeTeste, baixarCotaDeTeste } from "./_cota";
import { retratoNoBanco, configurarRitmoNoBanco } from "@/lib/integrations/meta/ritmo-no-banco";

const CONEXAO_VIVA = {
  id: "mc1", platform: "instagram", externalId: "ig9", status: "connected",
  tokenExpiresAt: null, metaJson: { igUserId: "ig9" }, token: "tk",
};

function paginaDeFeed(n: number, comProxima: boolean) {
  return {
    data: Array.from({ length: n }, (_, i) => ({
      id: `m${i}`, caption: `post ${i}`, media_type: "IMAGE", media_product_type: "FEED",
      media_url: `https://cdn/x${i}.jpg`, permalink: `https://ig/p/${i}`,
      timestamp: "2026-08-01T10:00:00+0000", like_count: 10 + i, comments_count: i,
    })),
    ...(comProxima ? { paging: { next: "https://graph.facebook.com/next-page" } } : {}),
  };
}

let relogio = 1_700_000_000_000;

beforeEach(async () => {
  vi.clearAllMocks();
  relogio = 1_700_000_000_000;
  await subirCotaDeTeste(() => relogio);
  await limparCacheDeLeitura();
  conexaoDoCliente.mockResolvedValue({ ...CONEXAO_VIVA });
  marcarConexaoExpirada.mockResolvedValue(undefined);
});

afterEach(() => {
  baixarCotaDeTeste();
});

describe("os dois estados que a UI não pode confundir", () => {
  it("cliente sem conexão → 'nenhuma rede conectada', não 'reconecte'", async () => {
    conexaoDoCliente.mockResolvedValue(null);
    const r = await lerMetricasDaConta("ws1", "c1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.semConexao).toBe(true);
      expect(r.precisaReconectar).toBeUndefined();
      expect(r.error).toMatch(/não conectou/);
    }
  });

  it("conexão com status expired → 'reconecte', não 'conecte'", async () => {
    conexaoDoCliente.mockResolvedValue({ ...CONEXAO_VIVA, status: "expired" });
    const r = await lerFeedDoCliente("ws1", "c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.precisaReconectar).toBe(true);
  });

  it("token com validade vencida nem vai à Meta — vira 'reconecte' na hora", async () => {
    conexaoDoCliente.mockResolvedValue({
      ...CONEXAO_VIVA, tokenExpiresAt: new Date(Date.now() - 1000),
    });
    const r = await lerMetricasDaConta("ws1", "c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.precisaReconectar).toBe(true);
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("a Meta recusando o token (código 190) vira 'reconecte' E carimba a conexão", async () => {
    graphGet.mockRejectedValue(new FakeGraphError("Error validating access token", 190));
    const r = await lerMetricasDaConta("ws1", "c1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.precisaReconectar).toBe(true);
      expect(r.error).toMatch(/reconectar/);
    }
    expect(marcarConexaoExpirada).toHaveBeenCalledWith("mc1");
  });
});

describe("o feed do cliente — paginação com teto", () => {
  it("segue o cursor da Meta e PARA no limite pedido", async () => {
    graphGet
      .mockResolvedValueOnce(paginaDeFeed(25, true))
      .mockResolvedValueOnce(paginaDeFeed(25, true)); // teria mais — não pode buscar
    const r = await lerFeedDoCliente("ws1", "c1", { limite: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.posts).toHaveLength(30);
    // Duas páginas bastaram; a terceira seria chamada jogada fora.
    expect(graphGet).toHaveBeenCalledTimes(2);
    // A segunda página vem pela URL `paging.next` da própria Meta.
    expect(graphGet.mock.calls[1]![0]).toBe("https://graph.facebook.com/next-page");
  });

  it("like_count e comments_count vêm no shape — é o que diz o que funciona", async () => {
    graphGet.mockResolvedValueOnce(paginaDeFeed(2, false));
    const r = await lerFeedDoCliente("ws1", "c1", { limite: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.posts[0]!.like_count).toBe(10);
      expect(r.posts[1]!.comments_count).toBe(1);
    }
  });

  it("pedido acima do teto da casa é aparado — leitura de estilo, não raspagem", async () => {
    graphGet.mockResolvedValue(paginaDeFeed(25, false));
    const r = await lerFeedDoCliente("ws1", "c1", { limite: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.posts.length).toBeLessThanOrEqual(LIMITE_MAXIMO_DO_FEED);
  });
});

describe("métricas da conta — série e totais, sem inventar", () => {
  function armarMetaSaudavel() {
    graphGet.mockImplementation(async (path: string, _tk: string, params: Record<string, unknown> = {}) => {
      if (path === "ig9") return { followers_count: 812, media_count: 96 };
      if (path === "ig9/insights" && params.metric === "reach") {
        return {
          data: [{
            name: "reach",
            values: [
              { value: 100, end_time: "2026-08-01T07:00:00+0000" },
              { value: 50, end_time: "2026-08-02T07:00:00+0000" },
            ],
          }],
        };
      }
      if (path === "ig9/insights") {
        return {
          data: [
            { name: "views", total_value: { value: 900 } },
            { name: "accounts_engaged", total_value: { value: 40 } },
            { name: "total_interactions", total_value: { value: 55 } },
          ],
        };
      }
      throw new Error(`chamada inesperada: ${path}`);
    });
  }

  it("monta a série diária de alcance e soma o total", async () => {
    armarMetaSaudavel();
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.serie).toEqual([
        { data: "2026-08-01", alcance: 100 },
        { data: "2026-08-02", alcance: 50 },
      ]);
      expect(r.totais.alcance).toBe(150);
      expect(r.totais.visualizacoes).toBe(900);
      expect(r.totais.interacoes).toBe(55);
      expect(r.perfil.seguidores).toBe(812);
      expect(r.periodo).toEqual({ desde: "2026-08-01", ate: "2026-08-02" });
    }
  });

  it("insights indisponíveis não derrubam o perfil — viram aviso, nunca zero", async () => {
    graphGet.mockImplementation(async (path: string) => {
      if (path === "ig9") return { followers_count: 90, media_count: 4 };
      throw new FakeGraphError("(#10) Not enough permission", 10);
    });
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perfil.seguidores).toBe(90);
      expect(r.totais.alcance).toBeNull(); // "não medi", jamais 0
      expect(r.aviso).toMatch(/não medid/);
    }
  });

  it("janela maior que 30 dias é encurtada COM aviso — a Meta recusa mais que isso", async () => {
    armarMetaSaudavel();
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-07-01", ate: "2026-07-31" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.periodo.desde).toBe("2026-07-02");
      expect(r.aviso).toMatch(/30 dias/);
    }
  });

  it("cache: a mesma janela em seguida NÃO chama a Meta de novo", async () => {
    armarMetaSaudavel();
    await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    const chamadas = graphGet.mock.calls.length;
    const r2 = await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r2.ok).toBe(true);
    expect(graphGet.mock.calls.length).toBe(chamadas);
  });
});

// ── O ALCANCE NÃO PODE SER UM NÚMERO AMBÍGUO ───────────────────────────────
// Somar 28 dias de reach conta a mesma pessoa até 28 vezes. Chamar isso de
// "contas únicas alcançadas" é falso — e é o número que o cliente lê.
describe("alcance: de onde veio o número decide como ele se chama", () => {
  it("com total_value, o alcance é DEDUPLICADO e o rótulo diz isso", async () => {
    graphGet.mockImplementation(async (path: string, _tk: string, params: Record<string, unknown> = {}) => {
      if (path === "ig9") return { followers_count: 812, media_count: 96 };
      if (params.metric_type === "time_series") {
        return { data: [{ name: "reach", values: [
          { value: 100, end_time: "2026-08-01T07:00:00+0000" },
          { value: 90, end_time: "2026-08-02T07:00:00+0000" },
        ] }] };
      }
      return { data: [
        { name: "reach", total_value: { value: 150 } },   // ≠ 190: dedup de verdade
        { name: "views", total_value: { value: 900 } },
        { name: "total_interactions", total_value: { value: 55 } },
      ] };
    });
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totais.alcance).toBe(150);
      expect(r.alcanceOrigem).toBe("unicas_no_periodo");
      expect(r.rotuloDoAlcance).toBe(ROTULO_DO_ALCANCE.unicas_no_periodo);
      // A série continua existindo — ela é o GRÁFICO, não o total.
      expect(r.serie).toHaveLength(2);
    }
    // O reach total NÃO custa chamada extra: vai junto no GET de totais.
    expect(graphGet.mock.calls.filter((c) => String(c[0]).endsWith("/insights"))).toHaveLength(2);
  });

  it("sem total_value, a soma da série entra COM outro nome — nunca 'contas únicas'", async () => {
    graphGet.mockImplementation(async (path: string, _tk: string, params: Record<string, unknown> = {}) => {
      if (path === "ig9") return { followers_count: 812, media_count: 96 };
      if (params.metric_type === "time_series") {
        return { data: [{ name: "reach", values: [
          { value: 100, end_time: "2026-08-01T07:00:00+0000" },
          { value: 50, end_time: "2026-08-02T07:00:00+0000" },
        ] }] };
      }
      return { data: [{ name: "views", total_value: { value: 900 } }] };
    });
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totais.alcance).toBe(150);
      expect(r.alcanceOrigem).toBe("soma_diaria");
      expect(r.rotuloDoAlcance).toBe(ROTULO_DO_ALCANCE.soma_diaria);
      expect(r.rotuloDoAlcance).not.toMatch(/únicas/);
    }
  });
});

// ── DIA SEM DADO É DIA SEM DADO ────────────────────────────────────────────
// A Meta devolve 6 de 28 dias em conta pequena. Antes, isso passava como se
// fosse o período inteiro e o card somava só os 6.
describe("a série não pode mentir sobre os dias que faltam", () => {
  function serieCom(dias: Array<{ value: number; dia: string }>) {
    graphGet.mockImplementation(async (path: string, _tk: string, params: Record<string, unknown> = {}) => {
      if (path === "ig9") return { followers_count: 40, media_count: 4 };
      if (params.metric_type === "time_series") {
        return { data: [{ name: "reach", values: dias.map((d) => ({ value: d.value, end_time: `${d.dia}T07:00:00+0000` })) }] };
      }
      return { data: [{ name: "views", total_value: { value: 10 } }] };
    });
  }

  it("série com buraco → aviso dizendo em quantos dias de quantos foi medido", async () => {
    serieCom([{ value: 10, dia: "2026-07-01" }, { value: 12, dia: "2026-07-05" }]);
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-07-01", ate: "2026-07-07" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toContain("alcance medido em 2 de 7 dias do período");
  });

  it("série completa → nenhum aviso inventado", async () => {
    serieCom([
      { value: 10, dia: "2026-07-01" }, { value: 12, dia: "2026-07-02" }, { value: 9, dia: "2026-07-03" },
    ]);
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-07-01", ate: "2026-07-03" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toBeUndefined();
  });
});

// ── O TETO DE RITMO ────────────────────────────────────────────────────────
// `desde`/`ate` são livres e entram na chave do cache: varrer janelas era
// centenas de GETs em segundos na mesma conta — a assinatura exata do que
// restringiu a conta da agência em 03/08/2026.
describe("teto de ritmo por conexão: o cache não protege janela livre", () => {
  beforeEach(() => {
    graphGet.mockImplementation(async (path: string) => {
      if (path === "ig9") return { followers_count: 10, media_count: 1 };
      return { data: [] };
    });
  });

  it("janela no futuro cai no MESMO balde de hoje — não vira chave nova por dia", async () => {
    const amanha = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const depois = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await lerMetricasDaConta("ws1", "c1", { ate: amanha });
    const chamadas = graphGet.mock.calls.length;
    const r = await lerMetricasDaConta("ws1", "c1", { ate: depois });
    expect(r.ok).toBe(true);
    expect(graphGet.mock.calls.length).toBe(chamadas); // veio do cache
  });

  it("varredura de janelas bate no teto e recebe a frase de ritmo — não mais GETs", async () => {
    let ultima;
    // Cada leitura de conta custa 3 chamadas; o teto é por conexão por hora.
    for (let i = 0; i < TETO_DE_CHAMADAS_POR_HORA; i++) {
      // Janelas realmente distintas (e todas no passado): é o cenário de quem
      // varre o seletor de datas — cada uma fura o cache por definição.
      const ate = new Date(Date.UTC(2026, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
      ultima = await lerMetricasDaConta("ws1", "c1", { desde: "2026-01-01", ate });
      if (!ultima.ok) break;
    }
    expect(ultima!.ok).toBe(false);
    // A frase vem do contador do banco e diz o QUE aconteceu (teto da hora),
    // não só "limitou": quem lê precisa saber se espera, se reconecta ou se o
    // contador caiu. `FRASE_DO_TETO` continua sendo o piso do contrato.
    if (!ultima!.ok) {
      const erro = (ultima as { error: string }).error;
      expect(erro).toMatch(/ritmo|teto/i);
      expect(erro.length).toBeGreaterThan(10);
    }
    // E o teto é DURO: passar dele não gasta mais nenhuma chamada com a Meta.
    const gastas = graphGet.mock.calls.length;
    await lerMetricasDaConta("ws1", "c1", { desde: "2026-04-01", ate: "2026-04-10" });
    expect(graphGet.mock.calls.length).toBe(gastas);
  });

  // ─── A MUDANÇA DE 06/08/2026, dita como teste ────────────────────────────
  // Antes, `limparCacheDeLeitura()` zerava TAMBÉM o contador da hora, porque os
  // dois moravam no mesmo Map. Isso era uma porta: reconectar (ou reiniciar)
  // devolvia a cota já gasta com a Meta. Agora o cache é uma coisa e o contador
  // é outra — e só o cache é apagável.
  it("limpar o cache NÃO devolve a cota já gasta com a Meta", async () => {
    for (let i = 0; i < 10; i++) {
      const ate = new Date(Date.UTC(2026, 5, 2) + i * 86_400_000).toISOString().slice(0, 10);
      await lerMetricasDaConta("ws1", "c1", { desde: "2026-06-01", ate });
    }
    const antes = await retratoNoBanco("conexao:mc1");
    expect(antes.gastas).toBe(30); // 10 leituras × 3 chamadas

    await limparCacheDeLeitura();

    const depois = await retratoNoBanco("conexao:mc1");
    expect(depois.gastas).toBe(30);
  });

  // A OUTRA METADE: o teto não pode inventar recusa no caso limpo.
  it("uma leitura só, com o contador zerado, passa sem nenhum atrito", async () => {
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-03-01", ate: "2026-03-10" });
    expect(r.ok).toBe(true);
  });

  // FAIL-CLOSED, provado: contador fora do ar RECUSA, não libera.
  it("contador indisponível NEGA a leitura — trava que se abre sozinha não é trava", async () => {
    configurarRitmoNoBanco({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("banco fora"); },
        consultar: async () => { throw new Error("banco fora"); },
      },
    });
    const chamadas = graphGet.mock.calls.length;
    const r = await lerMetricasDaConta("ws1", "c1", { desde: "2026-07-01", ate: "2026-07-10" });
    expect(r.ok).toBe(false);
    // O que prova que PAROU: a Meta não foi tocada.
    expect(graphGet.mock.calls.length).toBe(chamadas);
  });
});

describe("métricas por post — cada tipo tem seu set, e um post ruim não derruba o lote", () => {
  it("reels pedem o set de reels; feed pede o de feed", async () => {
    graphGet.mockImplementation(async (path: string, _tk: string, params: Record<string, unknown> = {}) => {
      if (path === "m_reel") return { media_product_type: "REELS" };
      if (path === "m_feed") return { media_product_type: "FEED" };
      if (path.endsWith("/insights")) {
        return { data: [{ name: "reach", values: [{ value: 7 }] }] };
      }
      throw new Error(`inesperado: ${path}`);
    });
    const r = await lerMetricasDosPosts("ws1", "c1", ["m_reel", "m_feed"]);
    expect(r.ok).toBe(true);
    const pedidos = graphGet.mock.calls
      .filter((c) => String(c[0]).endsWith("/insights"))
      .map((c) => (c[2] as { metric: string }).metric);
    expect(pedidos[0]).toContain("ig_reels_avg_watch_time");
    expect(pedidos[1]).not.toContain("ig_reels_avg_watch_time");
    if (r.ok) expect(r.posts[0]!.metricas.reach).toBe(7);
  });

  it("post sem métrica entra com `erro` e os outros seguem", async () => {
    graphGet.mockImplementation(async (path: string) => {
      if (path === "m_ok") return { media_product_type: "FEED" };
      if (path === "m_ok/insights") return { data: [{ name: "views", values: [{ value: 3 }] }] };
      throw new FakeGraphError("(#100) métrica indisponível para esta mídia", 100);
    });
    const r = await lerMetricasDosPosts("ws1", "c1", ["m_quebrado", "m_ok"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.posts[0]!.erro).toBeTruthy();
      expect(r.posts[1]!.erro).toBeNull();
      expect(r.posts[1]!.metricas.views).toBe(3);
    }
  });

  it("token morto derruba o LOTE — insistir post a post seria rajada de erro", async () => {
    graphGet.mockRejectedValue(new FakeGraphError("token expirado", 190));
    const r = await lerMetricasDosPosts("ws1", "c1", ["a", "b", "c"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.precisaReconectar).toBe(true);
    // Parou no primeiro — não tentou os outros dois.
    expect(graphGet).toHaveBeenCalledTimes(1);
  });
});
