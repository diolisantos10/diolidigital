// A TROCA PARA A FAIXA GRATUITA — as duas metades.
//
// O CEO pediu para sair da dependência de conta paga. A parte perigosa não é
// "o gratuito funciona": é o que acontece quando ele NÃO funciona. Se o
// caminho gratuito cair e alguém atender por baixo, ninguém mede nada e o
// cliente recebe uma peça pior achando que é o padrão da agência.
//
// Metade 1: o caminho gratuito produz.
// Metade 2: o caminho gratuito indisponível PARA — não improvisa, não deixa
//           um provedor pago atender no lugar sem avisar.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { generate } from "@/lib/ai/generate";

function conecta(provedor: string, model: string | null = null) {
  chaves.porProvedor.set(provedor, { apiKey: `chave-de-${provedor}`, model });
}

function respostaGeminiOk(texto: string) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
}
function respostaClaudeOk(texto: string) {
  return { ok: true, status: 200, json: async () => ({ content: [{ text: texto }] }) };
}
function respostaHttp(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  chaves.porProvedor.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.BRAIN_AI_PROVIDER;
  delete process.env.GEMINI_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PEDIDO = { system: "você é o estrategista", user: "monte o plano da Dioli", agentId: "strategy-posicionamento" };

describe("o modelo do Gemini precisa ser um modelo VIVO", () => {
  // Verificado contra a chave DESTA casa em 06/08/2026, um nome por vez:
  // `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-2.5-flash`,
  // `gemini-2.5-flash-lite`, `gemini-2.5-pro` e `gemini-3-flash` → todos 404.
  // Só os APELIDOS MÓVEIS geraram: `gemini-flash-latest`, `gemini-pro-latest`,
  // `gemini-flash-lite-latest`. Um default morto faz a faixa gratuita nascer
  // sem gerar um caractere — e o sintoma que chega é "IA indisponível", que
  // manda procurar o defeito em qualquer lugar menos onde ele está.
  it("o default é um apelido móvel, nunca um nome versionado morto", async () => {
    conecta("gemini");
    fetchMock.mockResolvedValue(respostaGeminiOk("{}"));
    await generate(PEDIDO);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toMatch(/gemini-\d/);   // nada de 1.5 / 2.0 / 2.5 / 3
    expect(url).toContain("gemini-flash-latest");
  });

  it("GEMINI_MODEL no ambiente troca o modelo sem mexer em código", async () => {
    process.env.GEMINI_MODEL = "gemini-2.0-flash";
    conecta("gemini");
    fetchMock.mockResolvedValue(respostaGeminiOk("{}"));
    await generate(PEDIDO);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-2.0-flash");
  });

  it("o modelo escolhido na tela vence o default", async () => {
    conecta("gemini", "gemini-pro-latest");
    fetchMock.mockResolvedValue(respostaGeminiOk("{}"));
    await generate(PEDIDO);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-pro-latest");
  });
});

describe("metade 1 — o caminho gratuito produz", () => {
  it("BRAIN_AI_PROVIDER=gemini põe o gratuito na frente do pago", async () => {
    process.env.BRAIN_AI_PROVIDER = "gemini";
    conecta("claude");
    conecta("gemini");
    fetchMock.mockResolvedValue(respostaGeminiOk('{"plano":"ok"}'));

    const r = await generate(PEDIDO);
    expect(r.ok && r.provider).toBe("gemini");
    expect(r.ok && r.data).toEqual({ plano: "ok" });
  });
});

describe("metade 2 — indisponível PARA, não improvisa", () => {
  it("estrito: Gemini fora do ar NÃO deixa o Claude atender por baixo", async () => {
    conecta("claude");
    conecta("gemini");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("googleapis.com") ? respostaHttp(429) : respostaClaudeOk('{"plano":"pago"}'),
    );

    const r = await generate({ ...PEDIDO, preferredProvider: "gemini", apenasOPreferido: true });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Gemini");
    // A prova é esta: nenhuma chamada saiu para o provedor pago.
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("anthropic.com");
    }
  }, 10_000);

  it("estrito sem chave do provedor pedido: erro nomeia QUEM falta, e nada é chamado", async () => {
    conecta("claude");   // pago conectado, gratuito não

    const r = await generate({ ...PEDIDO, preferredProvider: "gemini", apenasOPreferido: true });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("gemini");
    expect(r.error).toContain("Integrações");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SEM estrito a reserva continua valendo — o modo estrito não é o padrão", async () => {
    conecta("claude");
    conecta("gemini");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("googleapis.com") ? respostaHttp(429) : respostaClaudeOk('{"plano":"reserva"}'),
    );

    const r = await generate({ ...PEDIDO, preferredProvider: "gemini" });
    expect(r.ok && r.provider).toBe("claude");
  }, 10_000);
});
