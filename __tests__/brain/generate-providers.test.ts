// generate() — o único lugar por onde a agência raciocina.
//
// Dois assuntos aqui:
//   1. DeepSeek como provedor conectável (API compatível com a da OpenAI).
//   2. A CORRENTE DE RESERVA: se o provedor escolhido falha, o próximo com chave
//      assume. Antes o primeiro que falhava encerrava o pedido, e as outras
//      chaves ficavam paradas assistindo — uma tarde ruim de um fornecedor
//      custava uma entrega.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const chaves = vi.hoisted(() => ({ porProvedor: new Map<string, { apiKey: string; model: string | null }>() }));

vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: vi.fn(async (p: string) => {
    const achou = chaves.porProvedor.get(p);
    return achou ? { ...achou, source: "ui" as const } : null;
  }),
  isAiProvider: (v: string) => ["openai", "claude", "gemini", "deepseek"].includes(v),
  PROVIDER_INTEGRATION_ID: {},
  ALL_PROVIDERS: ["claude", "openai", "gemini", "deepseek"],
}));

import { generate } from "@/lib/ai/generate";

function conecta(provedor: string, model: string | null = null) {
  chaves.porProvedor.set(provedor, { apiKey: `chave-de-${provedor}`, model });
}

/** Resposta no formato chat-completions (OpenAI e DeepSeek usam o mesmo). */
function respostaOk(texto: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: texto } }] }) };
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
  delete process.env.DEEPSEEK_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PEDIDO = { system: "você é o PM", user: "monte o plano" };

describe("DeepSeek conectado", () => {
  it("chama o host da DeepSeek, com Bearer, e devolve o JSON", async () => {
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaOk('{"plano":"ok"}'));

    const r = await generate(PEDIDO);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("deepseek");
    expect(r.data).toEqual({ plano: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer chave-de-deepseek");
  });

  it("sem modelo escolhido usa o barato (v4-flash); o escolhido na tela ganha", async () => {
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaOk("{}"));
    await generate(PEDIDO);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe("deepseek-v4-flash");

    fetchMock.mockClear();
    conecta("deepseek", "deepseek-v4-pro");
    await generate(PEDIDO);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe("deepseek-v4-pro");
  });

  it("pede resposta em JSON — os agentes só sabem ler JSON", async () => {
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaOk("{}"));
    await generate(PEDIDO);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).response_format).toEqual({ type: "json_object" });
  });

  it("erro da DeepSeek é nomeado como DeepSeek, não como OpenAI", async () => {
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaHttp(402));   // 402 = sem saldo
    const r = await generate(PEDIDO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("DeepSeek");
    expect(r.error).not.toContain("OpenAI");
  });
});

describe("quem entra na frente", () => {
  it("com Claude e DeepSeek conectados, Claude atende — DeepSeek é reserva, não padrão", async () => {
    conecta("claude");
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaClaudeOk("{}"));

    const r = await generate(PEDIDO);
    expect(r.ok && r.provider).toBe("claude");
    expect(fetchMock.mock.calls[0][0]).toContain("anthropic.com");
  });

  it("BRAIN_AI_PROVIDER=deepseek põe a DeepSeek na frente de propósito", async () => {
    process.env.BRAIN_AI_PROVIDER = "deepseek";
    conecta("claude");
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaOk("{}"));

    const r = await generate(PEDIDO);
    expect(r.ok && r.provider).toBe("deepseek");
  });

  it("preferredProvider do agente vence a ordem geral", async () => {
    conecta("claude");
    conecta("deepseek");
    fetchMock.mockResolvedValue(respostaOk("{}"));

    const r = await generate({ ...PEDIDO, preferredProvider: "deepseek" });
    expect(r.ok && r.provider).toBe("deepseek");
  });
});

describe("a corrente de reserva", () => {
  it("Claude com chave inválida → DeepSeek entrega, e a entrega acontece", async () => {
    conecta("claude");
    conecta("deepseek");
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("anthropic.com") ? respostaHttp(401) : respostaOk('{"salvou":true}'),
    );

    const r = await generate(PEDIDO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("deepseek");
    expect(r.data).toEqual({ salvou: true });
  });

  it("provedor sem chave não conta como falha — é pulado em silêncio", async () => {
    conecta("deepseek");   // claude, openai e gemini sem chave
    fetchMock.mockResolvedValue(respostaOk("{}"));
    await generate(PEDIDO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("todos falhando → reporta a falha do PRIMEIRO, que é a que interessa investigar", async () => {
    conecta("claude");
    conecta("deepseek");
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("anthropic.com") ? respostaHttp(401) : respostaHttp(403),
    );

    const r = await generate(PEDIDO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Claude HTTP 401");
    expect(r.error).toContain("reservas também falharam");
  });

  it("nenhuma chave em lugar nenhum → diz onde conectar, não um erro técnico", async () => {
    const r = await generate(PEDIDO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Integrações");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o preferido insiste (3 tentativas); a reserva tem um tiro só", async () => {
    conecta("claude");
    conecta("deepseek");
    let claude = 0;
    let deepseek = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("anthropic.com")) { claude++; return respostaHttp(503); }   // 503 = passageiro
      deepseek++; return respostaOk("{}");
    });

    const r = await generate(PEDIDO);
    expect(r.ok && r.provider).toBe("deepseek");
    expect(claude).toBe(3);
    expect(deepseek).toBe(1);
  }, 10_000);
});
