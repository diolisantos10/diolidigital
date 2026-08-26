// TURNO SEM TEXTO NÃO VAI AO PROVEDOR.
//
// ⚠️ MEDIDO NO LIVRO-CAIXA DE PRODUÇÃO (26/08/2026), lido por
// `GET /api/ai-run-logs`: quatro chamadas do `comercial-sdr`, quatro segundos
// seguidos, todas **HTTP 400 — `messages.0.content: Field required`**. O turno
// inteiro do prospect se perdeu e ele não recebeu resposta nenhuma.
//
// A causa: `montarConversa` do SDR faz `content: m.text`, e um turno que chega
// do navegador sem `text` vira `content: undefined`. `JSON.stringify` apaga a
// chave, e a Anthropic recusa o corpo. Índice 0 é o primeiro turno do
// HISTÓRICO, não a fala da vez — por isso nenhuma validação da fala do cliente
// pegava isso.
//
// A régua roda sobre `generate()`, que é onde o conserto mora: 29 caminhos
// chamam essa camada, e uma trava por chamador seria a mesma conta repetida
// em 29 lugares.

import { describe, it, expect, beforeEach, vi } from "vitest";

const resolveProviderKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/resolve-key", () => ({ resolveProviderKey }));
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async () => {}) }));

import { generate } from "@/lib/ai/generate";

/** O corpo que a camada REALMENTE mandou à Anthropic. É ele que o 400 recusou. */
function corpoEnviado(): { messages: Array<{ role: string; content?: unknown }> } {
  const chamada = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
  return JSON.parse((chamada[1] as { body: string }).body);
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProviderKey.mockResolvedValue({ apiKey: "k", model: "claude-haiku-4-5-20251001" });
  globalThis.fetch = vi.fn(async () => new Response(
    JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as unknown as typeof fetch;
});

describe("o histórico que chega ao provedor", () => {
  it("🔴 o turno com `content` ausente NÃO entra no corpo — era o HTTP 400 medido", async () => {
    await generate({
      system: "s",
      user: "a fala da vez",
      // Exatamente a forma que produziu os quatro 400: o primeiro turno do
      // histórico sem texto nenhum.
      historico: [
        { role: "user", content: undefined as unknown as string },
        { role: "assistant", content: "resposta anterior" },
      ],
      agentId: "comercial-sdr",
      chaveJaResolvida: { provider: "claude", apiKey: "k", model: "claude-haiku-4-5-20251001" },
    });

    const corpo = corpoEnviado();
    // Nenhuma mensagem pode chegar sem conteúdo de texto — é literalmente a
    // frase que a Anthropic devolveu.
    for (const m of corpo.messages) {
      expect(typeof m.content).toBe("string");
      expect((m.content as string).trim().length).toBeGreaterThan(0);
    }
    // E o turno BOM sobrevive: descartar o vazio não pode custar a conversa.
    expect(corpo.messages.map((m) => m.content)).toEqual(["resposta anterior", "a fala da vez"]);
  });

  it("turno só com espaço em branco também cai — vazio é vazio", async () => {
    await generate({
      system: "s",
      user: "a fala da vez",
      historico: [{ role: "user", content: "   \n  " }],
      agentId: "comercial-sdr",
      chaveJaResolvida: { provider: "claude", apiKey: "k", model: "claude-haiku-4-5-20251001" },
    });
    expect(corpoEnviado().messages).toHaveLength(1);
  });

  it("MUTAÇÃO — histórico inteiro válido chega inteiro, na ordem", async () => {
    // Sem esta asserção, uma régua que simplesmente jogasse o histórico fora
    // passaria nos dois testes acima e destruiria a memória da conversa.
    await generate({
      system: "s",
      user: "c",
      historico: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
      agentId: "comercial-sdr",
      chaveJaResolvida: { provider: "claude", apiKey: "k", model: "claude-haiku-4-5-20251001" },
    });
    expect(corpoEnviado().messages).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
  });

  it("sem histórico o corpo continua com um turno só — nada mudou para quem não usa", async () => {
    await generate({
      system: "s",
      user: "c",
      agentId: "comercial-sdr",
      chaveJaResolvida: { provider: "claude", apiKey: "k", model: "claude-haiku-4-5-20251001" },
    });
    expect(corpoEnviado().messages).toEqual([{ role: "user", content: "c" }]);
  });
});
