// AS DUAS METADES DE CADA UMA DAS DUAS FRENTES.
//
// Frente 1 — a escolha por cliente:
//   metade A: fixar o provedor num cliente TROCA o provedor daquele cliente;
//   metade B: e NÃO VAZA para os outros. Um seletor que muda todo mundo é o
//             mesmo `BRAIN_AI_PROVIDER` global com outra roupa — e era ele que
//             punha a Foocci na cobaia junto com a Dioli.
//
// Frente 2 — a conta:
//   metade A: o log GRAVA o que aconteceu (quem, provedor, tokens, custo);
//   metade B: e quando o log falha, A ENTREGA SOBREVIVE — com rastro de que não
//             gravou. Fail-open aqui é certo; fail-silencioso nunca é.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Dublês ───────────────────────────────────────────────────────────────────

const chaves = vi.hoisted(() => ({ porProvedor: new Map<string, { apiKey: string; model: string | null }>() }));
vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: vi.fn(async (p: string) => {
    const achou = chaves.porProvedor.get(p);
    return achou ? { ...achou, source: "ui" as const } : null;
  }),
  isAiProvider: (v: string) => ["openai", "claude", "gemini", "deepseek", "perplexity"].includes(v),
  PROVIDER_INTEGRATION_ID: {},
  ALL_PROVIDERS: ["claude", "openai", "gemini", "deepseek", "perplexity"],
}));

const db = vi.hoisted(() => ({
  fixados: new Map<string, { clientId: string; provider: string; model: string | null; estrito: boolean; motivo: string | null; decididoPor: string | null; updatedAt: Date }>(),
  gravados: [] as Record<string, unknown>[],
  /** Liga o defeito do próprio log: a gravação passa a estourar. */
  logQuebrado: false,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    clientAiProvider: {
      findUnique: vi.fn(async ({ where }: { where: { workspaceId_clientId: { clientId: string } } }) =>
        db.fixados.get(where.workspaceId_clientId.clientId) ?? null),
      findMany: vi.fn(async () => [...db.fixados.values()]),
    },
    aIRunLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (db.logQuebrado) throw new Error("SQLITE_BUSY: database is locked");
        db.gravados.push(data);
        return data;
      }),
    },
  },
}));

const { generate } = await import("@/lib/ai/generate");
const { estimarCusto, precoDoModelo, TABELA_VERSAO } = await import("@/lib/ai/precos");

// ── Utilidades ───────────────────────────────────────────────────────────────

function conecta(provedor: string, model: string | null = null) {
  chaves.porProvedor.set(provedor, { apiKey: `chave-de-${provedor}`, model });
}
function fixa(clientId: string, provider: string, over: Partial<{ estrito: boolean; model: string | null }> = {}) {
  db.fixados.set(clientId, {
    clientId, provider, model: over.model ?? null, estrito: over.estrito ?? true,
    motivo: "teste", decididoPor: "teste", updatedAt: new Date(),
  });
}
function respostaGemini(texto: string, uso = { promptTokenCount: 1000, candidatesTokenCount: 500 }) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: uso }) };
}
function respostaClaude(texto: string, uso = { input_tokens: 2000, output_tokens: 800 }) {
  return { ok: true, status: 200, json: async () => ({ content: [{ text: texto }], usage: uso }) };
}
function http(status: number) { return { ok: false, status, json: async () => ({}) }; }

const fetchMock = vi.fn();
const PEDIDO = { system: "estrategista", user: "monte o plano" };
const WS = "ws-dioli";

beforeEach(() => {
  chaves.porProvedor.clear();
  db.fixados.clear();
  db.gravados.length = 0;
  db.logQuebrado = false;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.BRAIN_AI_PROVIDER;
  delete process.env.GEMINI_MODEL;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ═════════════════════════════════════════════════════════════════════════════
// FRENTE 1 — A ESCOLHA POR CLIENTE
// ═════════════════════════════════════════════════════════════════════════════

describe("metade A — a escolha por cliente MUDA o provedor daquele cliente", () => {
  it("cliente fixado no gratuito é atendido pelo gratuito, mesmo com o pago na frente", async () => {
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini('{"plano":"gratuito"}'));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });

    expect(r.ok && r.provider).toBe("gemini");
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain("anthropic.com");
  });

  it("a fixação vence até o provedor que o ESPECIALISTA pediu", async () => {
    // `especialistas.ts` manda `preferredProvider: "claude"` na maioria dos
    // agentes. Se a fixação do cliente perdesse dele, a tela não mandaria nada
    // no caminho que realmente produz peça.
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini("{}"));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli", preferredProvider: "claude" });
    expect(r.ok && r.provider).toBe("gemini");
  });

  it("o modelo fixado no cliente vai no fio, não o default do provedor", async () => {
    conecta("gemini");
    fixa("cli-dioli", "gemini", { model: "gemini-flash-lite-latest" });
    fetchMock.mockResolvedValue(respostaGemini("{}"));

    await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-flash-lite-latest");
  });
});

describe("metade B — e NÃO VAZA para os outros clientes", () => {
  it("cliente sem fixação continua no padrão da casa enquanto o outro está no gratuito", async () => {
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini");                        // só a agência na cobaia
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("googleapis.com") ? respostaGemini("{}") : respostaClaude('{"plano":"pago"}'));

    const foocci = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-foocci" });
    expect(foocci.ok && foocci.provider).toBe("claude");

    const dioli = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });
    expect(dioli.ok && dioli.provider).toBe("gemini");
  });

  it("chamada SEM cliente (trabalho interno) não é afetada por fixação nenhuma", async () => {
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaClaude("{}"));

    const r = await generate({ ...PEDIDO, workspaceId: WS });
    expect(r.ok && r.provider).toBe("claude");
  });

  it("provedor irreconhecível no banco NÃO explode: cai no padrão da casa", async () => {
    conecta("claude");
    fixa("cli-dioli", "geminii");                       // typo numa correção manual
    fetchMock.mockResolvedValue(respostaClaude("{}"));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });
    expect(r.ok && r.provider).toBe("claude");
  });
});

describe("fail-closed: o fixado indisponível PARA, não improvisa", () => {
  it("fixado fora do ar NÃO deixa o pago atender por baixo", async () => {
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("googleapis.com") ? http(429) : respostaClaude('{"plano":"pago"}'));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });

    expect(r.ok).toBe(false);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain("anthropic.com");
  }, 10_000);

  it("fixado sem chave: a casa DIZ que não consegue e nomeia o que falta", async () => {
    conecta("claude");                                  // o pago está lá, e não entra
    fixa("cli-dioli", "gemini");

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("gemini");
    expect(r.error).toContain("Integrações");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com reserva LIGADA na tela (estrito:false), a reserva volta a valer", async () => {
    // A metade que prova que a trava não é rigidez: quem escolheu reserva, tem.
    conecta("claude");
    conecta("gemini");
    fixa("cli-dioli", "gemini", { estrito: false });
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("googleapis.com") ? http(429) : respostaClaude('{"plano":"reserva"}'));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli" });
    expect(r.ok && r.provider).toBe("claude");
  }, 10_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// FRENTE 2 — A CONTA
// ═════════════════════════════════════════════════════════════════════════════

describe("metade A — o log grava o que aconteceu", () => {
  it("uma chamada bem-sucedida grava dono, provedor, modelo, tokens e custo", async () => {
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini("{}", { promptTokenCount: 1000, candidatesTokenCount: 500 }));

    await generate({
      ...PEDIDO, workspaceId: WS, clientId: "cli-dioli",
      departmentId: "social", agentId: "social-calendario", projectId: "prj-1",
    });

    expect(db.gravados).toHaveLength(1);
    const g = db.gravados[0];
    expect(g.clientId).toBe("cli-dioli");
    expect(g.departmentId).toBe("social");
    expect(g.agentId).toBe("social-calendario");
    expect(g.provider).toBe("gemini");
    expect(g.status).toBe("success");
    expect(g.tokensEntrada).toBe(1000);
    expect(g.tokensSaida).toBe(500);
    expect(g.custoEstimadoUsd).toBeTypeOf("number");
    expect(g.custoTabela).toBe(TABELA_VERSAO);
    // PII: o prompt carrega o briefing do cliente e NÃO pode entrar no log.
    expect(g.promptSummary).toBeNull();
    expect(g.outputSummary).toBeNull();
  });

  it("a chamada que FALHA também entra na conta — erro não é de graça", async () => {
    // Resposta 200 com JSON inválido consumiu token igual. Contar só sucesso
    // faria a casa achar que retentativa é grátis.
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini("isto não é json", { promptTokenCount: 900, candidatesTokenCount: 10 }));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli", departmentId: "social" });

    expect(r.ok).toBe(false);
    expect(db.gravados.length).toBeGreaterThanOrEqual(1);
    const g = db.gravados[0];
    expect(g.status).toBe("error");
    expect(g.tokensEntrada).toBe(900);
    expect(g.erro).toBeTruthy();
  }, 10_000);

  it("chamada sem cliente grava com clientId nulo — gasto sem dono é uma resposta, não uma falta", async () => {
    conecta("claude");
    fetchMock.mockResolvedValue(respostaClaude("{}"));

    await generate({ ...PEDIDO, workspaceId: WS, departmentId: "comercial" });

    expect(db.gravados[0].clientId).toBeNull();
    expect(db.gravados[0].departmentId).toBe("comercial");
  });
});

describe("metade B — o log falhando NÃO derruba a entrega", () => {
  it("banco travado na hora de gravar: a peça sai igual", async () => {
    db.logQuebrado = true;
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini('{"plano":"entregue"}'));

    const r = await generate({ ...PEDIDO, workspaceId: WS, clientId: "cli-dioli", departmentId: "social" });

    expect(r.ok).toBe(true);
    expect(r.ok && r.data).toEqual({ plano: "entregue" });
    expect(db.gravados).toHaveLength(0);
  });

  it("…mas deixa RASTRO de que não gravou — fail-open não é fail-silencioso", async () => {
    db.logQuebrado = true;
    conecta("gemini");
    fixa("cli-dioli", "gemini");
    fetchMock.mockResolvedValue(respostaGemini("{}"));

    const { registrarChamadaDeIa } = await import("@/lib/ai/registro-de-custo");
    const gravou = await registrarChamadaDeIa({
      workspaceId: WS, departmentId: "social", clientId: "cli-dioli",
      provider: "gemini", model: "gemini-flash-latest", status: "success",
      uso: { entrada: 100, saida: 50 },
    });

    expect(gravou).toBe(false);
    expect(console.error).toHaveBeenCalled();
    const msg = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(msg).toContain("[custo-de-ia] NÃO GRAVADO");
    expect(msg).toContain("cli-dioli");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A TABELA DE PREÇO — estimativa DECLARADA, nunca número inventado
// ═════════════════════════════════════════════════════════════════════════════

describe("custo estimado é estimativa declarada", () => {
  it("modelo fora da tabela custa NULL, nunca zero", async () => {
    // Zero afirmaria que a chamada foi de graça, e um modelo novo entrando na
    // casa apareceria como economia.
    expect(estimarCusto("modelo-que-ninguem-viu", 1000, 500).usd).toBeNull();
    expect(precoDoModelo("modelo-que-ninguem-viu")).toBeNull();
  });

  it("sem contagem de token, o custo é NULL — ausência não é zero", () => {
    expect(estimarCusto("gpt-4o-mini", null, null).usd).toBeNull();
    expect(estimarCusto("gpt-4o-mini", 1000, null).usd).toBeNull();
  });

  it("o sufixo de data não desmonta o casamento de preço", () => {
    expect(precoDoModelo("claude-haiku-4-5-20251001")).toEqual(precoDoModelo("claude-haiku-4-5"));
  });

  it("o prefixo MAIS LONGO vence: sonar-pro não é cobrado a preço de sonar", () => {
    const sonar = precoDoModelo("sonar")!;
    const pro = precoDoModelo("sonar-pro")!;
    expect(pro.saida).toBeGreaterThan(sonar.saida);
  });

  it("todo custo sai carimbado com a versão da tabela que o produziu", () => {
    const c = estimarCusto("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(c.versao).toBe(TABELA_VERSAO);
    expect(c.usd).toBeCloseTo(0.15 + 0.60, 6);
  });
});
