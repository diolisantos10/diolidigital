// O CACHE DE PROMPT — ligado onde paga, desligado onde custaria.
//
// ─── O NÚMERO QUE CRIOU ISTO (24/08/2026) ───────────────────────────────────
// O prompt do SDR tem ~10.700 tokens e era reenviado nos 16 turnos de uma
// conversa: 171k dos 192k tokens de entrada de um briefing eram o MESMO texto.
// ~US$ 0,65 por prospect real, em produção, de puro desperdício.
//
// ⚠️ E o cache NÃO é de graça: gravar custa ~1,25x. Para quem chama uma vez com
// prompt próprio — a maioria dos 29 caminhos de IA desta casa — o cache nunca
// seria lido e a gravação só encareceria. Por isso é opt-in, e por isso este
// arquivo trava as DUAS metades: liga para quem reusa, e continua desligado
// para quem não reusa.

import { describe, it, expect, beforeEach, vi } from "vitest";

const resolveProviderKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/resolve-key", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, resolveProviderKey };
});
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn() }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async () => null) }));

import { generate } from "@/lib/ai/generate";

let corpo: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  corpo = {};
  resolveProviderKey.mockImplementation(async (p: string) =>
    p === "claude" ? { apiKey: "k", source: "ui", model: "claude-sonnet-4-6" } : null,
  );
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    corpo = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        content: [{ type: "tool_use", name: "responder", input: { reply: "oi" } }],
        stop_reason: "tool_use",
        usage: {
          input_tokens: 120, output_tokens: 40,
          cache_creation_input_tokens: 10678, cache_read_input_tokens: 0,
        },
      }),
    };
  }));
});

describe("liga só para quem reusa o mesmo prompt", () => {
  it("SEM o pedido, o system vai como string crua — os 29 chamadores não mudam", async () => {
    await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws" });
    expect(corpo.system, "gravar cache para quem chama uma vez só ENCARECE").toBe("s");
  });

  it("COM o pedido, o system vira bloco com ponto de corte do cache", async () => {
    await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws", cachearSistema: true });
    expect(corpo.system).toEqual([{ type: "text", text: "s", cache_control: { type: "ephemeral" } }]);
  });

  it("o que VARIA fica depois do corte — senão o prefixo nunca casa", async () => {
    await generate({
      system: "s", user: "fala da vez", agentId: "comercial-sdr", workspaceId: "ws",
      cachearSistema: true, historico: [{ role: "user", content: "antes" }],
    });
    // Histórico e fala vivem em `messages`, que é renderizado DEPOIS do system.
    expect(corpo.messages).toEqual([
      { role: "user", content: "antes" },
      { role: "user", content: "fala da vez" },
    ]);
  });
});

describe("a economia é MEDIDA, não afirmada", () => {
  it("devolve quanto foi gravado e quanto foi lido do cache", async () => {
    const r = await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws", cachearSistema: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.uso?.cacheEscrito).toBe(10678);
    expect(r.uso?.cacheLido).toBe(0);
  });

  it("provedor que NÃO informa cache devolve null, nunca 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "tool_use", name: "responder", input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })));
    const r = await generate({ system: "s", user: "u", agentId: "comercial-sdr", workspaceId: "ws", cachearSistema: true });
    if (!r.ok) return;
    // 0 diria "o cache não foi lido"; null diz "não sei". São fatos diferentes.
    expect(r.uso?.cacheLido).toBeNull();
  });
});
