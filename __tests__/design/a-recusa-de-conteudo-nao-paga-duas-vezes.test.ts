// A RECUSA DE CONTEÚDO NÃO PAGA DUAS VEZES (Fase 2, 27/08/2026).
//
// ═══ MEDIDO EM PRODUÇÃO, NA RODADA PAGA ═════════════════════════════════════
//
// Exercitando a fila da imagem no ar (`POST /api/generate-image`, produção), com
// o Gemini derrubado de propósito, a OpenAI devolveu, palavra por palavra:
//
//     OpenAI HTTP 400: Your request was rejected by the safety system.
//
// Isso é o pedido NOSSO sendo recusado. Não é provedor fora do ar, não passa
// sozinho e **não melhora com outro produtor**. O cabeçalho de `design-engine.ts`
// já dizia a regra desde que a fila nasceu:
//
//     "`bad_request` é problema NOSSO (prompt recusado pelo provedor por
//      conteúdo...). Escorregar levaria o mesmo pedido ruim ao produtor seguinte
//      e gastaria de novo para ouvir a mesma coisa."
//
// A regra existia. O classificador não a alcançava — `callOpenAiImage` devolvia
// `reason: "provider_error"` para TODA resposta não-ok, recusa de conteúdo
// inclusive. Dois vazamentos de dinheiro, os dois reais:
//
//   1. a fila NÃO quebrava. Na ordem padrão (openai → gemini) uma recusa de
//      conteúdo escorregava e pagava uma SEGUNDA imagem para ouvir o mesmo não —
//      ou, pior, o Gemini gerava e a casa entregava ao cliente a arte que a
//      OpenAI tinha recusado, sem ninguém saber que ela foi recusada;
//   2. `modelAccessIssue` casava por `not.*allowed`, e a frase da OpenAI para
//      conteúdo é *"...is not allowed by our safety system"*. A recusa se
//      disfarçava de "conta sem acesso ao modelo" e disparava a chamada PAGA ao
//      dall-e-3, que recusa igual.
//
// Nenhuma chamada paga aqui: o `fetch` é dublê e devolve as frases medidas.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async () => {}) }));
const resolveProviderKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/resolve-key", () => ({ resolveProviderKey }));

import { generateDesign } from "@/lib/ai/design-engine";
import { registrarChamadaDeIa } from "@/lib/ai/registro-de-custo";

// A FRASE MEDIDA EM PRODUÇÃO, inteira.
const RECUSA_DE_SEGURANCA = "Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and provide an error ID.";
// A outra grafia da mesma recusa, a que casava com `not.*allowed`.
const RECUSA_NOT_ALLOWED = "Your prompt may contain text that is not allowed by our safety system.";

function respostaDeErro(status: number, message: string) {
  return { ok: false, status, json: async () => ({ error: { message } }) };
}
function respostaComImagem() {
  return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BRAIN_IMAGE_PROVIDER;
  delete process.env.GEMINI_IMAGE_MODEL;
  // Os dois produtores CONECTADOS: é a única forma de ver a fila escorregar.
  resolveProviderKey.mockResolvedValue({ apiKey: "chave", source: "ui", model: null });
});

describe("🔴 a recusa de conteúdo QUEBRA a fila — não escorrega", () => {
  it("a OpenAI recusa por segurança e o Gemini NUNCA é chamado", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return respostaDeErro(400, RECUSA_DE_SEGURANCA);
    }));

    const r = await generateDesign({ prompt: "um pedido que a OpenAI recusa", workspaceId: "ws" });

    expect(r.ok).toBe(false);
    // UMA chamada só: nem dall-e-3, nem Gemini. ANTES eram TRÊS.
    expect(chamadas).toHaveLength(1);
    expect(chamadas.every((c) => c.includes("openai.com"))).toBe(true);
    expect(chamadas.some((c) => c.includes("generativelanguage"))).toBe(false);
    // E o motivo que sobe carrega a recusa, não "provedor indisponível".
    expect(r.error).toContain("safety system");
  });

  it("a grafia 'is not allowed by our safety system' também NÃO vira dall-e-3", async () => {
    // Esta é a que se disfarçava de falta de acesso ao modelo e pagava duas vezes.
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return respostaDeErro(400, RECUSA_NOT_ALLOWED);
    }));

    await generateDesign({ prompt: "outro pedido recusado", workspaceId: "ws" });
    expect(chamadas).toHaveLength(1);
  });
});

describe("MUTAÇÃO — o que NÃO pode ter sido quebrado junto", () => {
  it("conta sem acesso ao gpt-image-1 CONTINUA caindo para o dall-e-3", async () => {
    // A recusa de conteúdo é lida ANTES da régua de acesso; se a ordem estivesse
    // errada, este caminho legítimo teria morrido.
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n++;
      return n === 1
        ? respostaDeErro(403, "Your organization must be verified to use the model `gpt-image-1`.")
        : respostaComImagem();
    }));

    const r = await generateDesign({ prompt: "peça normal", workspaceId: "ws" });
    expect(r.ok).toBe(true);
    expect(r.model).toBe("dall-e-3");
  });

  it("provedor FORA DO AR continua escorregando para o Gemini", async () => {
    // A quebra vale só para pedido ruim. Se ela tivesse vazado para o 5xx, a
    // fila inteira — a razão de a arte não parar mais — teria sido desligada.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("openai.com")) return respostaDeErro(503, "The server is overloaded or not ready yet.");
      return { ok: true, status: 200, json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] } }],
      }) };
    }));

    const r = await generateDesign({ prompt: "peça normal", workspaceId: "ws" });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("gemini");
  });
});

describe("🔴 o livro-caixa não afirma escorregamento que não houve", () => {
  it("Gemini PRIMEIRO na fila e produzindo: fallbackUsed é FALSO", async () => {
    // Medido em produção com BRAIN_IMAGE_PROVIDER=gemini: a linha saía com
    // fallbackUsed:true e "a fila de imagem escorregou para o Gemini" — ninguém
    // tinha caído. Quem fosse contar quedas da OpenAI contaria uma inexistente.
    process.env.BRAIN_IMAGE_PROVIDER = "gemini";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] } }],
    }) })));

    const r = await generateDesign({ prompt: "peça normal", workspaceId: "ws" });
    expect(r.ok).toBe(true);
    const linha = vi.mocked(registrarChamadaDeIa).mock.calls.at(-1)![0];
    expect(linha.provider).toBe("gemini");
    expect(linha.fallbackUsed).toBe(false);
    expect(linha.fallbackReason).toBeNull();
  });

  it("Gemini como RESERVA de verdade: fallbackUsed é verdadeiro e diz QUEM caiu", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("openai.com")) return respostaDeErro(503, "overloaded");
      return { ok: true, status: 200, json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] } }],
      }) };
    }));

    await generateDesign({ prompt: "peça normal", workspaceId: "ws" });
    const linha = vi.mocked(registrarChamadaDeIa).mock.calls.at(-1)![0];
    expect(linha.fallbackUsed).toBe(true);
    expect(linha.fallbackReason).toContain("openai");
  });
});
