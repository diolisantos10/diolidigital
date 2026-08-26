// O ÁRBITRO QUE GAGUEJA GANHA SEGUNDA VOLTA — e mesmo assim ninguém aprova sem juiz.
//
// ── O ACHADO (produção, 7ª volta de cliente oculto, 26/08/2026) ─────────────
//
// A Qualidade reteve o pacote com a frase certa
// (`apresentacao_bloqueada: 1 entrega que NINGUÉM auditou`) porque os TRÊS
// árbitros independentes falharam, cada um de um jeito:
//
//   • OpenAI   → HTTP 429 (fila cheia);
//   • DeepSeek → corpo VAZIO;
//   • Gemini   → JSON INVÁLIDO.
//
// A retenção está certa. O que estava errado é que ela veio depois de UMA
// VOLTA SÓ na fila: `if (!houve429) break` guardava a segunda volta atrás do
// 429, e o comentário ao lado dizia "resposta ilegível não melhora".
//
// Isso contradiz o motor da própria casa: `generate.isTransientError` trata
// "vazia" e "json" como TRANSITÓRIOS e repete por dentro. O auditor discordava
// do seu próprio motor — chamava de veredito final o que o motor chama de
// soluço. Dois árbitros vivos, que só gaguejaram, foram descartados sem
// segunda chance.
//
// ── O QUE ESTE ARQUIVO PROVA, E POR QUE NO NÍVEL DO `fetch` ─────────────────
//
// A pergunta obrigatória da casa: *o teste alcança o código que responde ao
// cliente?* Mockar `@/lib/ai/generate` não alcançaria — metade do mecanismo
// (o `callWithRetry` transitório) mora DENTRO dele. Aqui a falsificação desce
// para o `fetch`: `generate` roda de verdade, com a fila de verdade.
//
// E a metade que mais importa: a segunda volta é mais uma CHANCE DE ACHAR
// JUIZ, nunca um caminho para aprovar sem juiz. Os dois últimos testes são a
// prova pelo lado do freio.
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

import {
  auditDeliverable, eRespostaIlegivel, mereceOutraVolta,
  ficouSemArbitro, foiAprovadaPelaQualidade,
} from "@/lib/agency/execution/quality-auditor";

const ANTHROPIC = "api.anthropic.com";
const OPENAI = "api.openai.com";
const DEEPSEEK = "api.deepseek.com";
const GEMINI = "generativelanguage.googleapis.com";

/** Como cada host se comporta. Uma função por host = dá para mudar a resposta
 *  DEPOIS de N chamadas, que é como se prova "a segunda volta encontrou juiz". */
type Acao = "429" | "vazia" | "json_invalido" | "aprova" | "reprova";
let roteiro: Record<string, Acao[]>;
/** Cada host chamado, na ordem — a prova de QUEM foi consultado e QUANTAS vezes. */
let hosts: string[] = [];

const CORPO_APROVA = { verdict: "pass", issues: [], note: "no tom, sem problemas" };
const CORPO_REPROVA = { verdict: "flag", issues: ["promete resultado garantido"], note: "revisar" };

/** A vez `n` (0-based) daquele host. O último item do roteiro se repete — assim
 *  "sempre 429" é `["429"]` e "429 e depois aprova" é `["429","aprova"]`. */
function acaoDe(host: string, n: number): Acao {
  const script = roteiro[host];
  if (!script || script.length === 0) return "429";
  return script[Math.min(n, script.length - 1)]!;
}

function corpoDe(host: string, acao: Acao): Response {
  const corpo = acao === "aprova" ? CORPO_APROVA : CORPO_REPROVA;
  if (host.includes("googleapis")) {
    if (acao === "vazia") {
      return Response.json({ candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "STOP" }] });
    }
    if (acao === "json_invalido") {
      return Response.json({
        candidates: [{ content: { parts: [{ text: "claro! aqui vai: {verdict: pass," }] }, finishReason: "STOP" }],
      });
    }
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
  const texto = acao === "vazia" ? ""
    : acao === "json_invalido" ? "desculpe, não consegui: {verdict:"
    : JSON.stringify(corpo);
  return Response.json({
    choices: [{ message: { content: texto }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

beforeEach(() => {
  hosts = [];
  roteiro = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const host = new URL(url).host;
    const n = hosts.filter((h) => h === host).length;
    hosts.push(host);
    const acao = acaoDe(host, n);
    if (acao === "429") return new Response("rate limited", { status: 429 });
    return corpoDe(host, acao);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const peca = {
  deptLabel: "Social Media",
  title: "Sabor que a gente reconhece",
  content: "Uma legenda comum, sem número inventado e sem promessa de resultado. Chama a gente no direct.",
  brandContext: "padaria de bairro",
  workspaceId: "ws-setima-volta",
  tipoDaEntrega: "social",
  provedorDoAutor: "claude",
};

describe("as palavras novas dizem o que dizem", () => {
  it("corpo vazio e JSON quebrado são ILEGÍVEIS — as duas frases que os provedores usam", () => {
    expect(eRespostaIlegivel("Resposta DeepSeek vazia")).toBe(true);
    expect(eRespostaIlegivel("JSON inválido (Gemini)")).toBe(true);
    expect(eRespostaIlegivel("resposta ilegível")).toBe(true);
    // O que NÃO é soluço de formato.
    expect(eRespostaIlegivel("OpenAI HTTP 429")).toBe(false);
    expect(eRespostaIlegivel('Provedor "gemini" não está configurado.')).toBe(false);
  });

  it("merece outra volta o que o TEMPO conserta — e falta de chave nunca merece", () => {
    for (const e of ["OpenAI HTTP 429", "Resposta DeepSeek vazia", "JSON inválido (Gemini)",
                     "timeout", "erro de rede", "OpenAI HTTP 503"]) {
      expect(mereceOutraVolta(e), e).toBe(true);
    }
    // Provedor sem chave não ganha chave esperando: insistir só atrasa a
    // retenção honesta. Esta linha é a que impede a segunda volta de virar
    // enrolação para o cliente.
    for (const e of ['Provedor "gemini" não está configurado. Conecte a chave em Integrações.',
                     "Nenhuma IA conectada. Conecte uma chave em Integrações.",
                     'Provedor "openai" está fixado neste cliente e não tem chave conectada.']) {
      expect(mereceOutraVolta(e), e).toBe(false);
    }
  });
});

describe("o trio exato da 7ª volta em produção", () => {
  it("429 + corpo vazio + JSON inválido → a fila é percorrida DUAS vezes, não uma", async () => {
    roteiro = { [OPENAI]: ["429"], [DEEPSEEK]: ["vazia"], [GEMINI]: ["json_invalido"] };

    const v = await auditDeliverable(peca);

    // O freio continua: ninguém auditou, ninguém aprovou.
    expect(v.verdict).toBe("nao_auditado");
    expect(ficouSemArbitro(v.verdict)).toBe(true);
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Devolva `if (!houve429) break` para `if (!valeOutraVolta) break` e este
    // teste ainda passa (houve 429 na fila). O que mata a mutação de verdade é
    // o teste seguinte, onde NÃO há 429 nenhum. Aqui o que se mede é que os
    // três árbitros foram MESMO consultados duas vezes cada.
    expect(hosts.filter((h) => h === OPENAI).length).toBeGreaterThanOrEqual(2);
    expect(hosts.filter((h) => h === DEEPSEEK).length).toBeGreaterThanOrEqual(2);
    expect(hosts.filter((h) => h === GEMINI).length).toBeGreaterThanOrEqual(2);

    // E o autor NUNCA foi consultado. Fail-closed é isto.
    expect(hosts).not.toContain(ANTHROPIC);
  });

  it("SEM 429 nenhum — só vazio e JSON quebrado — a segunda volta acontece igual", async () => {
    // ── ESTE É O TESTE QUE MATA A MUTAÇÃO ──────────────────────────────────
    // Com `if (!houve429) break`, `houve429` é false aqui e o laço para na
    // primeira volta: cada host seria chamado 3 vezes (as re-tentativas
    // internas do `generate`) e não 6. O `>= 4` só passa com a segunda volta.
    roteiro = { [OPENAI]: ["vazia"], [DEEPSEEK]: ["vazia"], [GEMINI]: ["json_invalido"] };

    const v = await auditDeliverable(peca);

    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("resposta_invalida");
    expect(hosts.filter((h) => h === OPENAI).length).toBeGreaterThanOrEqual(4);
    expect(hosts.filter((h) => h === GEMINI).length).toBeGreaterThanOrEqual(4);
    expect(hosts).not.toContain(ANTHROPIC);
  });

  it("o árbitro que gaguejou e depois falou É OUVIDO — a segunda volta serve para achar juiz", async () => {
    // DeepSeek devolve vazio nas 3 tentativas internas da 1ª volta e responde
    // na 4ª chamada — exatamente o soluço que a versão anterior descartava.
    roteiro = {
      [OPENAI]: ["429"],
      [GEMINI]: ["json_invalido"],
      [DEEPSEEK]: ["vazia", "vazia", "vazia", "reprova"],
    };

    const v = await auditDeliverable(peca);

    // Sem a segunda volta, esta peça teria sido RETIDA por falta de juiz. Com
    // ela, existe veredito de um árbitro independente — e o veredito é dele,
    // não da casa.
    expect(v.verdict).toBe("reprovado");
    expect(v.arbitro).toBe("deepseek");
    expect(v.arbitroIndependente).toBe(true);
    expect(hosts).not.toContain(ANTHROPIC);
  });
});

describe("o freio não afrouxa — a segunda volta nunca vira aprovação", () => {
  it("fila esgotada nas DUAS voltas → retém. Ausência de juiz NUNCA é aprovado", async () => {
    roteiro = { [OPENAI]: ["429"], [DEEPSEEK]: ["429"], [GEMINI]: ["429"] };
    const v = await auditDeliverable(peca);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("limite_de_taxa");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(v.arbitro).toBeUndefined();
  });

  it("o AUTOR não entra na fila em volta nenhuma — nem quando os três caem duas vezes", async () => {
    roteiro = { [OPENAI]: ["vazia"], [DEEPSEEK]: ["json_invalido"], [GEMINI]: ["vazia"] };
    const v = await auditDeliverable(peca);
    expect(hosts).not.toContain(ANTHROPIC);
    expect(v.arbitro).toBeUndefined();
    expect(v.verdict).toBe("nao_auditado");
  });

  it("uma aprovação continua sendo aprovação — a mudança não deixou o caminho feliz para trás", async () => {
    roteiro = { [OPENAI]: ["aprova"] };
    const v = await auditDeliverable(peca);
    expect(v.verdict).toBe("aprovado");
    expect(v.arbitro).toBe("openai");
    expect(v.arbitroIndependente).toBe(true);
    // Achou juiz de primeira: nenhuma segunda volta, nenhum tempo desperdiçado.
    expect(hosts.length).toBe(1);
  });
});
