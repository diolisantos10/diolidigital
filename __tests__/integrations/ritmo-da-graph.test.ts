// O BALDE da Meta — o freio que faltava na única porta desta casa para a Graph.
//
// Estes testes NÃO mockam `graph.ts` (os outros arquivos de teste da Meta
// mockam, e é justamente por isso que o furo passou tanto tempo): aqui quem é
// falsificado é o `fetch`. Assim o que se prova é o caminho real —
// graph.ts → ritmo.ts → rede.
//
// O que precisa ficar provado, nas duas metades:
//   • a rajada é BARRADA (o que restringiu a conta em 03/08/2026);
//   • o uso normal PASSA (dashboard aberto não pode virar erro);
//   • o caminho de ANÚNCIOS é contado — era o que ia direto, sem teto nenhum;
//   • os cabeçalhos da Meta mandam mais que a nossa conta local;
//   • erro de limite FREIA e não retenta.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const loadConnectionToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/integrations/meta/config", () => ({
  GRAPH_BASE: "https://graph.facebook.com/v21.0",
}));

import { graphGet, graphPost, GraphApiError } from "@/lib/integrations/meta/graph";
import {
  limparRitmo, configurarRitmo, retratoDoRitmo, chaveDoToken,
  lerUsoDosCabecalhos, tierDeAnunciosObservado,
  TETO_POR_HORA, FICHAS_DE_RAJADA, TIPO_DE_RITMO_DA_CASA,
} from "@/lib/integrations/meta/ritmo";
import { lerDesempenho, limparCacheDeDesempenho } from "@/lib/integrations/meta/ads";
// A cota por pontuação da Marketing API é FAIL-CLOSED: sem banco, o caminho de
// anúncios recusa a chamada antes de qualquer coisa. Aqui ela roda num SQLite
// em memória para o que está sob teste continuar sendo o BALDE.
import { subirCotaDeTeste, baixarCotaDeTeste } from "./_cota";
import { configurarRitmoNoBanco } from "@/lib/integrations/meta/ritmo-no-banco";

// ─── Relógio de mentira: o teste não pode dormir de verdade ─────────────────
// `dormir` avança o relógio em vez de esperar. É o que permite provar o
// ESPAÇAMENTO (segundos/minutos de curva) numa suíte que roda em milissegundos.

let relogio = 1_700_000_000_000;
let dormidoMs = 0;

function resposta(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

/** Uma resposta NOVA a cada chamada: o corpo de um Response só pode ser lido
 *  uma vez, e reaproveitar o mesmo objeto testaria o mock, não o código. */
function sempre(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return async () => resposta(body, init);
}

let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  relogio = 1_700_000_000_000;
  dormidoMs = 0;
  limparRitmo();
  await limparCacheDeDesempenho();
  configurarRitmo({
    agora: () => relogio,
    dormir: async (ms) => { dormidoMs += ms; relogio += ms; },
  });
  await subirCotaDeTeste(() => relogio);
  fetchFalso = vi.fn(sempre({ ok: true }));
  vi.stubGlobal("fetch", fetchFalso);
  loadConnectionToken.mockResolvedValue({ token: "token-do-cliente", platform: "facebook", externalId: "1" });
});

afterEach(() => {
  baixarCotaDeTeste();
  configurarRitmo();
  limparRitmo();
  vi.unstubAllGlobals();
});

// ─── Metade 1: o uso normal passa ───────────────────────────────────────────

describe("a metade que deixa passar — uso humano não pode virar erro", () => {
  it("um dashboard inteiro (28 chamadas) passa sem esperar nem falhar", async () => {
    // 28 é o custo real de um dashboard de cliente em leitura.ts: perfil +
    // série + totais + 2 por post. Se isto falhar, o produto quebrou.
    for (let i = 0; i < 28; i++) {
      await expect(graphGet("me", "tk-dash")).resolves.toBeTruthy();
    }
    expect(fetchFalso).toHaveBeenCalledTimes(28);
    expect(dormidoMs).toBe(0);
  });

  it("a rajada cabe na capacidade de fichas e o excesso ESPERA em vez de falhar", async () => {
    for (let i = 0; i < FICHAS_DE_RAJADA + 4; i++) {
      await graphGet("me", "tk-espaco");
    }
    // As quatro que passaram da rajada foram ESPAÇADAS, não recusadas.
    expect(fetchFalso).toHaveBeenCalledTimes(FICHAS_DE_RAJADA + 4);
    expect(dormidoMs).toBeGreaterThan(0);
  });
});

// ─── Metade 2: a rajada é barrada ───────────────────────────────────────────

describe("a metade que barra — o ritmo de máquina de 03/08 não passa de novo", () => {
  it("estourado o teto da hora, a chamada falha NA HORA (não espera)", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-teto");
    expect((await retratoDoRitmo(chaveDoToken("tk-teto"))).gastasNaHora).toBe(TETO_POR_HORA);

    const chamadasAntes = fetchFalso.mock.calls.length;
    await expect(graphGet("me", "tk-teto")).rejects.toThrow(/seguramos o ritmo/i);
    // O que prova que PAROU: a rede não foi tocada.
    expect(fetchFalso.mock.calls.length).toBe(chamadasAntes);
  });

  it("o erro do balde é carimbado como NOSSO, não como recusa da Meta", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-carimbo");
    const erro: unknown = await graphGet("me", "tk-carimbo").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(GraphApiError);
    const g = erro as GraphApiError;
    expect(g.status).toBe(429);
    expect(g.detail?.type).toBe(TIPO_DE_RITMO_DA_CASA);
    // Dizer "a Meta limitou" quando fomos nós produz diagnóstico errado.
    expect(g.detail?.message).not.toMatch(/a Meta limitou/i);
  });

  // ─── 06/08/2026: a janela mudou de FORMA ao sair da memória ──────────────
  // Antes eram marcas de tempo numa lista (janela deslizante exata) — barato em
  // memória, caro no banco: guardar 200 timestamps por chave e podar a cada
  // chamada. No volume a janela é a HORA, e a conta soma a hora ATUAL MAIS A
  // ANTERIOR. É de propósito e é mais conservador: janela fixa pura deixaria
  // passar 2× o teto na virada (200 às 10h59 e mais 200 às 11h01). Somar as
  // duas nunca libera mais que o teto em nenhum intervalo de 60 minutos.
  it("estourado o teto, a hora seguinte AINDA não libera — a virada não é porta", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-janela");
    await expect(graphGet("me", "tk-janela")).rejects.toThrow();
    relogio += 3_600_001; // uma hora depois: a janela anterior ainda conta
    await expect(graphGet("me", "tk-janela")).rejects.toThrow(/seguramos o ritmo/i);
  });

  it("passadas duas janelas, libera de novo — o teto é freio, não banimento", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-janela2");
    await expect(graphGet("me", "tk-janela2")).rejects.toThrow();
    relogio += 2 * 3_600_001;
    await expect(graphGet("me", "tk-janela2")).resolves.toBeTruthy();
  });

  // FAIL-CLOSED, provado: sem contador, ninguém fala com a Meta.
  it("contador fora do ar NEGA a chamada — e a rede nem é tocada", async () => {
    configurarRitmoNoBanco({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("banco fora"); },
        consultar: async () => { throw new Error("banco fora"); },
      },
    });
    const antes = fetchFalso.mock.calls.length;
    await expect(graphGet("me", "tk-sem-banco")).rejects.toThrow(/não consegui contabilizar|ritmo/i);
    expect(fetchFalso.mock.calls.length).toBe(antes);
  });

  // ─── A prova que dá nome a esta frente: O DEPLOY NÃO DEVOLVE A RAJADA ─────
  // `limparRitmo()` é o que acontece quando o processo reinicia: os baldes em
  // memória nascem cheios. Se o teto ainda morasse lá, este teste passaria a
  // chamada — e um deploy no meio de uma rajada seria a rajada de novo.
  it("REINICIAR O PROCESSO no meio da rajada não devolve a cota", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-deploy");
    await expect(graphGet("me", "tk-deploy")).rejects.toThrow();

    limparRitmo(); // o deploy

    const antes = fetchFalso.mock.calls.length;
    await expect(graphGet("me", "tk-deploy")).rejects.toThrow(/seguramos o ritmo/i);
    expect(fetchFalso.mock.calls.length).toBe(antes);
  });

  it("cada token tem o seu balde — um cliente ruidoso não derruba o outro", async () => {
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "tk-A");
    await expect(graphGet("me", "tk-A")).rejects.toThrow();
    await expect(graphGet("me", "tk-B")).resolves.toBeTruthy();
  });
});

// ─── O caminho de ANÚNCIOS — o que ia direto, sem teto nenhum ───────────────

describe("o caminho de anúncios passa a ser CONTADO", () => {
  it("lerDesempenho gasta ficha do mesmo balde do token", async () => {
    fetchFalso.mockImplementation(sempre({ data: [{ spend: "10", impressions: "100", clicks: "5", reach: "80" }] }));
    const chave = chaveDoToken("token-do-cliente");
    expect((await retratoDoRitmo(chave)).gastasNaHora).toBe(0);

    const r = await lerDesempenho("w1", "c1", "camp_1", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(true);
    expect((await retratoDoRitmo(chave)).gastasNaHora).toBe(1);
  });

  it("criar campanha (POST) também é contado — escrita não escapa do balde", async () => {
    fetchFalso.mockImplementation(sempre({ id: "camp_9" }));
    // `operacao` é obrigatória desde 06/08/2026: escrita na Marketing API que
    // não está no catálogo fechado (travas.ts) nem chega na rede.
    await graphPost("act_123/campaigns", "token-de-anuncio", { name: "x", status: "PAUSED" },
      { operacao: "criar_campanha_pausada", conta: "act_123" });
    expect((await retratoDoRitmo(chaveDoToken("token-de-anuncio"))).gastasNaHora).toBe(1);
  });

  it("com o balde estourado, lerDesempenho devolve motivo `ritmo` em português", async () => {
    fetchFalso.mockImplementation(sempre({ data: [{ spend: "10", clicks: "1" }] }));
    for (let i = 0; i < TETO_POR_HORA; i++) await graphGet("me", "token-do-cliente");

    const r = await lerDesempenho("w1", "c1", "camp_2", { desde: "2026-08-01", ate: "2026-08-02" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("ritmo");
    expect(r.erro).toMatch(/ritmo/i);
  });

  it("a varredura da esteira não repete a leitura: o cache segura a rodada seguinte", async () => {
    fetchFalso.mockImplementation(sempre({ data: [{ spend: "10", impressions: "100", clicks: "5", reach: "80" }] }));
    const periodo = { desde: "2026-08-01", ate: "2026-08-02" };
    await lerDesempenho("w1", "c1", "camp_3", periodo);
    await lerDesempenho("w1", "c1", "camp_3", periodo);
    await lerDesempenho("w1", "c1", "camp_3", periodo);
    // Três varreduras de 5 minutos, UMA chamada à Meta.
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});

// ─── Camada 3: o número é da META, não o nosso palpite ──────────────────────

describe("os cabeçalhos da Meta mandam mais que a nossa conta local", () => {
  it("lê call_count/total_time/total_cputime e o tier do X-Business-Use-Case-Usage", () => {
    const h = new Headers({
      "x-business-use-case-usage": JSON.stringify({
        "66782684": [{
          type: "ads_management", call_count: 95, total_cputime: 20, total_time: 20,
          estimated_time_to_regain_access: 19, ads_api_access_tier: "development_access",
        }],
      }),
    });
    const uso = lerUsoDosCabecalhos(h);
    expect(uso.usoPct).toBe(95);
    expect(uso.esperarMin).toBe(19);
    expect(uso.tier).toBe("development_access");
  });

  it("X-App-Usage em 95% freia a chave mesmo com o nosso contador folgado", async () => {
    fetchFalso.mockImplementation(sempre({ ok: true }, {
      headers: { "x-app-usage": JSON.stringify({ call_count: 95, total_time: 10, total_cputime: 10 }) },
    }));
    await graphGet("me", "tk-freio");
    // Uma chamada só: o nosso teto de 200/h nem foi arranhado. Quem freou foi a
    // Meta, dizendo pelo cabeçalho que a cota já estava em 95%.
    expect((await retratoDoRitmo(chaveDoToken("tk-freio"))).bloqueadoPorMin).toBeGreaterThan(0);
    await expect(graphGet("me", "tk-freio")).rejects.toThrow(/95%|freado/i);
  });

  it("o tempo de bloqueio é o que a META informou, não um chute nosso", async () => {
    fetchFalso.mockImplementation(sempre({ ok: true }, {
      headers: {
        "x-business-use-case-usage": JSON.stringify({
          "1": [{ type: "ads_management", call_count: 100, estimated_time_to_regain_access: 19 }],
        }),
      },
    }));
    await graphGet("act_1/campaigns", "tk-eta");
    expect((await retratoDoRitmo(chaveDoToken("tk-eta"))).bloqueadoPorMin).toBe(19);
  });

  it("o tier de anúncios observado fica registrado (development_access = cota mínima)", async () => {
    fetchFalso.mockImplementation(sempre({ ok: true }, {
      headers: {
        "x-business-use-case-usage": JSON.stringify({
          "1": [{ type: "ads_management", call_count: 3, ads_api_access_tier: "development_access" }],
        }),
      },
    }));
    await graphGet("act_1", "tk-tier");
    expect(tierDeAnunciosObservado()).toBe("development_access");
  });

  it("cabeçalho ilegível não derruba a chamada", async () => {
    fetchFalso.mockImplementation(sempre({ ok: true }, { headers: { "x-app-usage": "isto não é json" } }));
    await expect(graphGet("me", "tk-lixo")).resolves.toBeTruthy();
  });
});

// ─── Camada 4: erro de limite FREIA, e não retenta ──────────────────────────

describe("erro de limite: a regra da Meta é PARAR, não insistir", () => {
  it("código 80004 (ads_management) freia a chave e a próxima chamada nem sai", async () => {
    fetchFalso.mockImplementation(sempre(
      { error: { message: "(#80004) limite", code: 80004, type: "OAuthException" } },
      { status: 400 },
    ));
    await expect(graphGet("act_1/insights", "tk-80004")).rejects.toThrow(/80004/);
    const chamadas = fetchFalso.mock.calls.length;
    // Insistir aumenta a contagem e estende o bloqueio — por isso não sai.
    await expect(graphGet("act_1/insights", "tk-80004")).rejects.toThrow(/freado|limite/i);
    expect(fetchFalso.mock.calls.length).toBe(chamadas);
  });

  it("código 4 (limite do app) também freia", async () => {
    fetchFalso.mockImplementation(sempre(
      { error: { message: "(#4) Application request limit reached", code: 4 } },
      { status: 400 },
    ));
    await expect(graphGet("me", "tk-4")).rejects.toThrow();
    expect((await retratoDoRitmo(chaveDoToken("tk-4"))).bloqueadoPorMin).toBeGreaterThan(0);
  });

  it("erro 4xx que NÃO é de limite não freia — não é para punir a conta por um campo errado", async () => {
    fetchFalso.mockImplementation(sempre(
      { error: { message: "(#100) campo inválido", code: 100 } },
      { status: 400 },
    ));
    await expect(graphGet("me", "tk-100")).rejects.toThrow(/campo inválido/);
    expect((await retratoDoRitmo(chaveDoToken("tk-100"))).bloqueadoPorMin).toBe(0);
    await expect(graphGet("me", "tk-100")).rejects.toThrow(/campo inválido/);
    expect(fetchFalso.mock.calls.length).toBe(2);
  });

  it("5xx é transitório: retenta com espera crescente e cada tentativa é contada", async () => {
    fetchFalso
      .mockImplementationOnce(sempre({ error: { message: "temporário" } }, { status: 503 }))
      .mockImplementation(sempre({ ok: true }));
    await expect(graphGet("me", "tk-5xx")).resolves.toBeTruthy();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    // Duas idas à rede, duas fichas gastas: retentativa também é chamada.
    expect((await retratoDoRitmo(chaveDoToken("tk-5xx"))).gastasNaHora).toBe(2);
  });
});

// ─── A chave do balde ───────────────────────────────────────────────────────

describe("a chave do balde nunca é o token", () => {
  it("a impressão digital não contém o token e é estável", () => {
    const chave = chaveDoToken("EAAB-um-token-secreto-de-verdade");
    expect(chave).not.toContain("EAAB");
    expect(chave).not.toContain("secreto");
    expect(chave).toBe(chaveDoToken("EAAB-um-token-secreto-de-verdade"));
    expect(chave).not.toBe(chaveDoToken("outro-token"));
  });
});
