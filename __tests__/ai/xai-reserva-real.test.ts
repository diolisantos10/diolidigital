// xAI É RESERVA REAL — ordem do CEO, 01/10/2026.
//
// Com Anthropic, OpenAI e Gemini sem saldo, só DeepSeek e xAI respondiam, e a
// xAI nem estava na fila. Este arquivo prova as duas metades:
//   • com todos os da frente sem saldo, o texto sai pela xAI;
//   • a xAI só entra DEPOIS da DeepSeek (reserva não se promove sozinha).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/ai/resolve-key", async (real) => {
  const mod = await real<typeof import("@/lib/ai/resolve-key")>();
  return {
    ...mod,
    resolveProviderKey: vi.fn(async (p: string) => ({ apiKey: `chave-${p}`, source: "ui", model: null })),
  };
});
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async () => null) }));

import { generate } from "@/lib/ai/generate";
import { esquecerProvedoresForaDeJogo } from "@/lib/ai/provedor-fora-de-jogo";

let hosts: string[] = [];
let comSaldo: Set<string>;

function semSaldo(host: string): Response {
  if (host.includes("anthropic")) {
    return Response.json(
      { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
      { status: 400 },
    );
  }
  return Response.json(
    { error: { type: "insufficient_quota", message: "You exceeded your current quota, please check your plan and billing details." } },
    { status: 429 },
  );
}

beforeEach(() => {
  hosts = [];
  esquecerProvedoresForaDeJogo();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const host = new URL(url).host;
    hosts.push(host);
    if (!comSaldo.has(host)) return semSaldo(host);
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ ok: true, por: host }) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); esquecerProvedoresForaDeJogo(); });

const chamada = { system: "responda json", user: "escreva algo", workspaceId: "ws-xai", agentId: "teste-xai" };

describe("xAI na fila do texto", () => {
  it("com Anthropic, OpenAI, Gemini e DeepSeek sem saldo, o texto sai pela xAI", async () => {
    comSaldo = new Set(["api.x.ai"]);
    const r = await generate(chamada);
    expect(r.ok).toBe(true);
    expect(hosts).toContain("api.x.ai");
    expect(hosts[hosts.length - 1]).toBe("api.x.ai");
  });

  it("com DeepSeek com saldo, a xAI nem é chamada", async () => {
    comSaldo = new Set(["api.deepseek.com", "api.x.ai"]);
    const r = await generate(chamada);
    expect(r.ok).toBe(true);
    expect(hosts).toContain("api.deepseek.com");
    expect(hosts).not.toContain("api.x.ai");
  });
});
