// A TRAVA DE FORMATO DO CLAUDE — medida no corpo da requisição, não no comentário.
//
// ─── O DEFEITO, medido em 24/08/2026 ────────────────────────────────────────
//
// A bateria do cliente falso rodou ao vivo e barrou 10 de 16 turnos. O laudo de
// forma foi unânime em duas rodadas independentes: *"o modelo não abriu JSON
// nenhum (respondeu em prosa, 201–319 caracteres)"*. Não era corte pelo teto,
// não era preâmbulo, não era erro dentro do JSON — o modelo escrevia uma
// resposta conversacional perfeita e não a embrulhava no envelope pedido.
//
// A causa não era do SDR: era da CAMADA. `openai`, `deepseek` e `gemini` já
// mandavam o mecanismo de formato do próprio provedor; a Perplexity declarava
// que não garante, com o motivo; o Claude não garantia e não declarava — a pior
// das três posições, porque parecia coberto. As 29 chamadas desta casa que
// passam por `generate()` corriam o mesmo risco.
//
// ⚠️ ESTE ARQUIVO REPROVA CONTRA O CÓDIGO ANTIGO. Antes de 24/08 o corpo
// enviado ao Claude não tinha `tools` nem `tool_choice`, e a resposta era lida
// de `content[0].text`. Os dois primeiros testes falham nessa versão.

import { describe, it, expect, beforeEach, vi } from "vitest";

const resolveProviderKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/resolve-key", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, resolveProviderKey };
});
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn() }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async () => null) }));

import { generate } from "@/lib/ai/generate";

function respostaDeFerramenta(input: unknown, stop = "tool_use") {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: "tool_use", name: "responder", input }],
      stop_reason: stop,
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  };
}

let corpoEnviado: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  corpoEnviado = {};
  resolveProviderKey.mockImplementation(async (p: string) =>
    p === "claude" ? { apiKey: "k", source: "ui", model: "claude-sonnet-4-6" } : null,
  );
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    corpoEnviado = JSON.parse(init.body);
    return respostaDeFerramenta({ reply: "oi", scope: { businessName: "Cantina" } });
  }));
});

describe("o Claude não pode responder em prosa — o canal de prosa não é oferecido", () => {
  it("manda a ferramenta E força o uso dela", async () => {
    await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });

    expect(corpoEnviado.tools, "sem `tools`, o modelo pode responder em texto").toBeDefined();
    expect(corpoEnviado.tool_choice).toEqual({ type: "tool", name: "responder" });
  });

  it("lê o pacote da ENTRADA da ferramenta — já objeto, sem pescar JSON em texto", async () => {
    const r = await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ reply: "oi", scope: { businessName: "Cantina" } });
    // Não houve texto: é a trava funcionando, e o `null` diz isso.
    expect(r.textoCru).toBeNull();
  });
});

describe("as conquistas da rota do SDR sobrevivem à camada", () => {
  it("devolve o stop_reason — é o que separa `truncado` de `malformado`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDeFerramenta({ scope: { a: 1 } }, "max_tokens")));
    const r = await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });
    expect(r.motivoDeParada).toBe("max_tokens");
  });

  it("quando o pacote NÃO abre, devolve o texto cru — sem ele morre o resgate do escopo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "isto não é json nenhum" }], stop_reason: "end_turn" }),
    })));
    const r = await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });
    expect(r.ok).toBe(false);
    expect(r.textoCru).toBe("isto não é json nenhum");
  });
});

describe("conversa de vários turnos — a lacuna que impedia o SDR de entrar na camada", () => {
  it("o histórico entra ANTES da fala da vez", async () => {
    await generate({
      system: "s",
      user: "a fala de agora",
      agentId: "comercial-sdr",
      workspaceId: "ws",
      historico: [
        { role: "user", content: "primeira" },
        { role: "assistant", content: "resposta" },
      ],
    });

    expect(corpoEnviado.messages).toEqual([
      { role: "user", content: "primeira" },
      { role: "assistant", content: "resposta" },
      { role: "user", content: "a fala de agora" },
    ]);
  });

  it("SEM histórico o corpo é o de sempre — os 29 chamadores não mudam de forma", async () => {
    await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });
    expect(corpoEnviado.messages).toEqual([{ role: "user", content: "u" }]);
  });
});

describe("a chave entregue pronta não passa pelo cofre", () => {
  it("com `chaveJaResolvida`, `resolveProviderKey` não é chamado — é o furo da rota pública fechado", async () => {
    await generate({
      system: "s",
      user: "u",
      agentId: "comercial-sdr",
      chaveJaResolvida: { provider: "claude", apiKey: "k-publica", model: null },
    });
    expect(resolveProviderKey).not.toHaveBeenCalled();
  });
});
