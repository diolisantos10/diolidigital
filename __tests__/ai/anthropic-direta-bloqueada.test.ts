// NENHUMA CHAMADA DIRETA À ANTHROPIC (CEO, 04/10/2026).
// Medido em produção: o calendário tentou o Claude direto e voltou "credit
// balance is too low". Em produção nenhuma chave da Anthropic é resolvida.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    dbIntegrationConfig: {
      findUnique: vi.fn(async (): Promise<{ apiKeyEncrypted: string; selectedModel: null } | null> => null),
      findFirst: vi.fn(async (): Promise<null> => null),
    },
  },
}));

import { anthropicDiretoBloqueado, chaveDoAmbiente, resolveProviderKey } from "@/lib/ai/resolve-key";
import { isClaudeConfigured, callClaude } from "@/lib/ai/claude-provider";

const original = { ...process.env };
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  process.env.DEEPSEEK_API_KEY = "outra-chave";
  delete process.env.PERMITIR_ANTHROPIC_DIRETO;
  process.env.BLOQUEAR_ANTHROPIC_DIRETO = "1"; // o comportamento de produção
});
afterEach(() => {
  process.env = { ...original };
});

describe("Anthropic direta bloqueada", () => {
  it("nenhuma chave da Anthropic é resolvida — do ambiente ou do banco", async () => {
    expect(anthropicDiretoBloqueado()).toBe(true);
    expect(chaveDoAmbiente("claude")).toBeNull();
    expect(await resolveProviderKey("claude", "w1")).toBeNull();
  });

  it("o adaptador do Claude se declara desligado e não chama a rede", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);
    expect(isClaudeConfigured()).toBe(false);
    const r = await callClaude({ system: "s", user: "u" });
    expect(r.ok).toBe(false);
    expect(espiao).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a outra metade: os outros provedores continuam resolvendo", () => {
    expect(chaveDoAmbiente("deepseek")?.apiKey).toBe("outra-chave");
  });

  it("reabrir é decisão explícita: PERMITIR_ANTHROPIC_DIRETO=1", () => {
    process.env.PERMITIR_ANTHROPIC_DIRETO = "1";
    expect(anthropicDiretoBloqueado()).toBe(false);
    expect(chaveDoAmbiente("claude")?.apiKey).toBe("chave-de-teste");
  });
});
