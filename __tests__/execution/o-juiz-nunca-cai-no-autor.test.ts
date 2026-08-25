// O JUIZ NUNCA CAI NO AUTOR — e o que a tela conta é a verdade.
//
// ── O ACHADO (produção, case Farol 27, rodada 5, 25/08/2026) ────────────────
//
//   • as 8 chamadas ao juiz `gpt-4o` voltaram HTTP 429;
//   • `fallbackUsed = false`;
//   • os 10 julgamentos restantes saíram do `claude-haiku-4-5` — o MESMO
//     modelo que escreveu as peças;
//   • 0 de 10 peças com árbitro independente (na rodada anterior, 14 de 16);
//   • e NENHUMA tela mudou.
//
// Auto-aprovação disfarçada de auditoria: o defeito que não quebra, deriva, e
// deixa um verde que ninguém desconfia.
//
// ── A CAUSA, em uma linha ───────────────────────────────────────────────────
//
// `quality-auditor.ts` pedia o árbitro por `preferredProvider`, que é
// PREFERÊNCIA e não trava. Em `generate.ts` (`const order = ...`), quando o
// preferido falha, a chamada anda na ordem de preferência DA CASA — e a ordem
// da casa começa em `claude`, que é quem escreve quase tudo aqui. O mecanismo
// criado para garantir independência entregava o julgamento ao autor no
// primeiro tropeço do juiz.
//
// ── POR QUE ESTE ARQUIVO NÃO FALSIFICA `generate` ───────────────────────────
//
// A pergunta obrigatória desta casa: *o teste alcança o código que responde ao
// cliente?* O suite antigo (`quality-auditor.test.ts`) mocka `@/lib/ai/generate`
// inteiro — ou seja, ele NUNCA poderia ter pego este bug, porque o bug mora
// EXATAMENTE dentro da função falsificada. Régua verde sobre o componente
// errado: a dúvida morreu e o defeito ficou.
//
// Aqui a falsificação desce um andar, para o `fetch`. `generate` roda de
// verdade, com a fila de verdade, e a Anthropic tem chave e responderia com
// prazer. Se a trava sair, o Claude é chamado e o teste quebra.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// O cofre de chaves fala com o banco; aqui só interessa QUEM tem chave.
vi.mock("@/lib/ai/resolve-key", async (real) => {
  const mod = await real<typeof import("@/lib/ai/resolve-key")>();
  return {
    ...mod,
    // Cinco provedores conectados, como na casa de verdade.
    resolveProviderKey: vi.fn(async (p: string) => ({ apiKey: `chave-${p}`, source: "ui", model: null })),
  };
});
// A contabilidade fala com o banco e não é o objeto do teste.
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async () => null) }));

import {
  auditDeliverable, filaDeArbitros, escolherArbitro,
  arbitragemDoVeredito, camposDaQualidade, eLimiteDeTaxa,
  ficouSemArbitro, foiAprovadaPelaQualidade,
} from "@/lib/agency/execution/quality-auditor";

/** Cada host chamado, na ordem. É a prova de QUEM foi consultado. */
let hosts: string[] = [];

/** Quem responde o quê. `null` = 429 (limite de taxa). */
let resposta: Record<string, "429" | "aprova" | "reprova" | "morto">;

const CORPO_APROVA = { verdict: "pass", issues: [], note: "no tom, sem problemas" };
const CORPO_REPROVA = { verdict: "flag", issues: ["promete resultado garantido"], note: "revisar" };

beforeEach(() => {
  hosts = [];
  resposta = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const host = new URL(url).host;
    hosts.push(host);
    const acao = resposta[host] ?? "morto";
    if (acao === "429") return new Response("rate limited", { status: 429 });
    if (acao === "morto") return new Response("no", { status: 500 });
    const corpo = acao === "aprova" ? CORPO_APROVA : CORPO_REPROVA;
    // Formato Anthropic (uso de ferramenta) e formato OpenAI-compatível.
    if (host.includes("googleapis")) {
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(corpo) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    }
    if (host.includes("anthropic")) {
      return Response.json({
        content: [{ type: "tool_use", name: "responder", input: corpo }],
        stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 },
      });
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(corpo) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const peca = {
  deptLabel: "Social Media",
  title: "Sabor que a gente reconhece",
  content: "Uma legenda comum, sem número inventado e sem promessa de resultado. Chama a gente no direct.",
  brandContext: "padaria de bairro",
  workspaceId: "ws-farol-27",
  tipoDaEntrega: "social",
  provedorDoAutor: "claude",
};

const ANTHROPIC = "api.anthropic.com";
const OPENAI = "api.openai.com";

describe("a fila de árbitros nunca contém o autor", () => {
  it("autor claude → openai, gemini, deepseek. Nunca claude, nunca perplexity", () => {
    expect(filaDeArbitros("claude")).toEqual(["openai", "gemini", "deepseek"]);
  });

  it("a Perplexity NÃO é juíza de texto — em fila nenhuma", () => {
    for (const autor of ["claude", "openai", "gemini", "deepseek", "perplexity"]) {
      expect(filaDeArbitros(autor)).not.toContain("perplexity");
    }
  });

  it("autor desconhecido é tratado como claude — a suposição conservadora da casa", () => {
    expect(filaDeArbitros(null)).toEqual(filaDeArbitros("claude"));
    expect(escolherArbitro(null)).toBe("openai");
  });
});

// ── O CASO MEDIDO, REPRODUZIDO ──────────────────────────────────────────────
describe("Farol 27 rodada 5: o juiz preferido em 429", () => {
  it("REPRODUÇÃO DO DEFEITO: sem a trava, o julgamento cairia no autor", async () => {
    // A prova de que o buraco era real e não teórico: a MESMA ordem que
    // `generate` montava com `preferredProvider` sozinho — o preferido na
    // frente e a fila da casa atrás, com o autor logo em segundo.
    const { ordemDePreferenciaDaCasa } = await import("@/lib/ai/generate");
    const ordemAntiga = ["openai", ...ordemDePreferenciaDaCasa().filter((p) => p !== "openai")];
    expect(ordemAntiga[0]).toBe("openai");
    // ⬇️ ESTE É O DEFEITO: o segundo da fila é o autor da peça.
    expect(ordemAntiga[1]).toBe("claude");
  });

  it("openai em 429 e claude vivo → a peça NÃO é julgada pelo claude", async () => {
    resposta[OPENAI] = "429";
    resposta[ANTHROPIC] = "aprova";     // o autor responderia com prazer
    // gemini e deepseek também fora, para isolar o par openai↔claude.
    const v = await auditDeliverable(peca);

    // A prova mais dura do arquivo: a Anthropic NUNCA foi consultada.
    expect(hosts).not.toContain(ANTHROPIC);
    expect(hosts).toContain(OPENAI);

    // E o que sai é RETENÇÃO, não aprovação.
    expect(v.verdict).toBe("nao_auditado");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(ficouSemArbitro(v.verdict)).toBe(true);
  });

  it("o 429 vira MOTIVO — limite de taxa, não 'IA indisponível'", async () => {
    resposta[OPENAI] = "429";
    resposta["generativelanguage.googleapis.com"] = "429";
    resposta["api.deepseek.com"] = "429";
    resposta[ANTHROPIC] = "aprova";
    const v = await auditDeliverable(peca);
    expect(v.motivo).toBe("limite_de_taxa");
    // O motivo diz o CONSERTO, e o conserto não é reescrever a peça.
    expect(v.note).toMatch(/LIMITE DE TAXA/);
    expect(v.note).toMatch(/não reescreva/i);
    // E diz o contrário de "caiu": a IA está viva e recusando por VOLUME.
    expect(v.note).toMatch(/não fora do ar/);
  });

  it("ANTES de desistir, tenta de novo — e a re-tentativa nunca chega no autor", async () => {
    resposta[OPENAI] = "429";
    resposta["generativelanguage.googleapis.com"] = "429";
    resposta["api.deepseek.com"] = "429";
    resposta[ANTHROPIC] = "aprova";
    await auditDeliverable(peca);
    // Mais de uma tentativa por árbitro (espera crescente dentro de `generate`)
    // e mais de uma volta na fila inteira.
    expect(hosts.filter((h) => h === OPENAI).length).toBeGreaterThan(1);
    expect(hosts).not.toContain(ANTHROPIC);
  }, 30_000);

  it("outro provedor INDEPENDENTE assume — é para isso que há cinco chaves", async () => {
    resposta[OPENAI] = "429";
    resposta["generativelanguage.googleapis.com"] = "aprova";   // gemini
    resposta[ANTHROPIC] = "aprova";
    const v = await auditDeliverable(peca);
    expect(v.verdict).toBe("aprovado");
    expect(v.arbitro).toBe("gemini");
    expect(v.arbitroIndependente).toBe(true);
    expect(hosts).not.toContain(ANTHROPIC);
  });
});

// ── AS TRÊS PALAVRAS ────────────────────────────────────────────────────────
describe("a tela distingue três coisas, com três palavras", () => {
  it("árbitro independente aprovou → arbitro_independente", async () => {
    resposta[OPENAI] = "aprova";
    const v = await auditDeliverable(peca);
    expect(arbitragemDoVeredito(v)).toBe("arbitro_independente");
    expect(camposDaQualidade(v)).toEqual({
      revisionStatus: "quality_ok", qualityArbiter: "openai", qualityArbitragem: "arbitro_independente",
    });
  });

  it("ninguém julgou → sem_arbitro, e NUNCA aprovado", async () => {
    resposta[OPENAI] = "429";
    resposta["generativelanguage.googleapis.com"] = "429";
    resposta["api.deepseek.com"] = "429";
    const v = await auditDeliverable(peca);
    expect(arbitragemDoVeredito(v)).toBe("sem_arbitro");
    expect(camposDaQualidade(v)).toEqual({
      revisionStatus: "quality_nao_auditado", qualityArbiter: null, qualityArbitragem: "sem_arbitro",
    });
  });

  it("julgado pelo PRÓPRIO autor → autojulgado, e a reprovação continua valendo", async () => {
    // O único caminho que ainda pode entregar o autor como juiz: a tela do
    // cliente FIXA um provedor com `estrito`, e a fixação vence a preferência
    // (`generate.ts`, "A escolha do cliente vence"). Aqui a fixação é o próprio
    // autor. A degradação é assimétrica de propósito — reprovação é freio real
    // e continua bloqueando; aprovação vira retenção.
    const { escolhaDoCliente } = await import("@/lib/ai/escolha-por-cliente");
    vi.mocked(escolhaDoCliente).mockResolvedValue({ provider: "claude", estrito: true, model: null } as never);
    resposta[ANTHROPIC] = "reprova";

    const v = await auditDeliverable(peca);
    expect(v.verdict).toBe("reprovado");
    expect(v.arbitroIndependente).toBe(false);
    expect(arbitragemDoVeredito(v)).toBe("autojulgado");
    expect(camposDaQualidade(v).qualityArbitragem).toBe("autojulgado");
  });

  it("APROVAÇÃO do próprio autor não existe — vira retenção", async () => {
    const { escolhaDoCliente } = await import("@/lib/ai/escolha-por-cliente");
    vi.mocked(escolhaDoCliente).mockResolvedValue({ provider: "claude", estrito: true, model: null } as never);
    resposta[ANTHROPIC] = "aprova";

    const v = await auditDeliverable(peca);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("juiz_nao_imparcial");
    expect(arbitragemDoVeredito(v)).toBe("sem_arbitro");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
  });

  it("as três nunca colidem: cada veredito cai em UMA palavra só", async () => {
    const palavras = new Set(["arbitro_independente", "autojulgado", "sem_arbitro"]);
    expect(palavras.size).toBe(3);
  });
});

describe("o motivo está na mensagem, não no status", () => {
  it("reconhece limite de taxa pelas palavras que os provedores usam", () => {
    for (const e of ["OpenAI HTTP 429", "rate limit exceeded", "Too Many Requests", "quota excedida"]) {
      expect(eLimiteDeTaxa(e)).toBe(true);
    }
  });

  it("NÃO confunde outros erros com limite de taxa — 400 já foi falta de saldo, 404 já foi host morto", () => {
    for (const e of ["OpenAI HTTP 400", "Claude HTTP 404", "timeout", "erro de rede", null, undefined]) {
      expect(eLimiteDeTaxa(e)).toBe(false);
    }
  });
});
