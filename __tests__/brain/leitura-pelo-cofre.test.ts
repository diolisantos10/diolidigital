// O GANCHO DO COFRE na leitura do brand book (04/10/2026).
//
// Sem Claude (chave ausente ou conta sem saldo), a leitura passa pelo gancho
// do cofre. Enquanto o contrato do gateway não chega, o gancho responde
// "indisponível" — e o recado é de ESPERA, que a tela mostra como "aguardando
// IA", nunca como erro do arquivo.

import { describe, it, expect, vi, beforeEach } from "vitest";

const chave = vi.hoisted(() => ({ atual: null as { apiKey: string; source: string; model: string | null } | null }));
vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: vi.fn(async (): Promise<{ apiKey: string; source: string; model: string | null } | null> => chave.atual),
}));

import { analisarBrandBook } from "@/lib/ai/leitura-de-marca";
import { ehFaltaDeIa, RECADO_SEM_IA } from "@/lib/ai/leitura-pelo-cofre";

const PDF = { bytes: Buffer.from("%PDF-1.4 brand book"), mimeType: "application/pdf", fileName: "bb.pdf", workspaceId: "w1" };

beforeEach(() => {
  chave.atual = null;
  vi.unstubAllGlobals();
});

describe("sem IA, a leitura espera — não falha", () => {
  it("sem chave Claude: passa pelo cofre e devolve o recado de espera", async () => {
    const r = await analisarBrandBook(PDF);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBe(RECADO_SEM_IA);
      expect(ehFaltaDeIa(r.erro)).toBe(true);
    }
  });

  it("conta Claude sem saldo também vira espera (cai no cofre)", async () => {
    chave.atual = { apiKey: "k", source: "env", model: null };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "Your credit balance is too low" } }), { status: 400 },
    )));
    const r = await analisarBrandBook(PDF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe(RECADO_SEM_IA);
  });

  it("a outra metade: erro de verdade continua sendo erro", async () => {
    chave.atual = { apiKey: "k", source: "env", model: null };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("internal", { status: 500 })));
    const r = await analisarBrandBook(PDF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(ehFaltaDeIa(r.erro)).toBe(false);
  });
});
