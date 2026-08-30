// PROVEDOR SEM SALDO SAI DA FILA — e a independência do árbitro não cede um milímetro.
//
// ═══ O DEFEITO, MEDIDO NO AR (27/08/2026) ═══════════════════════════════════
//
// Log do Railway, deployment `271e3e59`, de 5 em 5 minutos das 13:38 às 15:48
// sem falhar uma batida — 27 linhas idênticas:
//
//   [generate] claude (Claude HTTP 400: {"type":"error","error":{"type":
//   "invalid_request_error","message":"Your credit balance is too low to
//   access the Anthropic API..."}}) falhou — entregue por openai (gpt-4o)
//
// A conta da Anthropic está zerada há horas e a casa SABE disso — o alarme do
// despertador grita sobre ela a cada rodada. Mesmo assim a fila continuava
// abrindo por `claude` em TODA chamada. Ela escorregava na direção errada:
// caía para quem NÃO tem saldo antes de cair para quem tem.
//
// ═══ POR QUE ESTE TESTE DESCE ATÉ O `fetch` ═════════════════════════════════
//
// A pergunta obrigatória desta casa: *o teste alcança o código que responde ao
// cliente?* Mockar `@/lib/ai/generate` não alcançaria — metade do mecanismo
// (`isTransientError`, `callWithRetry`, a caminhada na fila) mora DENTRO dele.
// Aqui a falsificação desce para o `fetch`: `generate` roda de verdade, a fila
// de verdade, o `quality-auditor` de verdade. Só a rede é fingida.
//
// ═══ A TRAVA QUE NÃO PODE CAIR ══════════════════════════════════════════════
//
// O árbitro NUNCA pode ser o mesmo provedor que escreveu a peça. Consertar a
// fila não pode afrouxar isso, e a última seção deste arquivo é a prova pelo
// lado do freio: em nenhuma volta, em nenhum ramo, com qualquer combinação de
// contas zeradas, o autor é consultado — e fila esgotada RETÉM, nunca aprova.
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
import {
  auditDeliverable, foiAprovadaPelaQualidade, ficouSemArbitro, mereceOutraVolta,
} from "@/lib/agency/execution/quality-auditor";
import {
  esquecerProvedoresForaDeJogo, marcarForaDeJogo, provedorForaDeJogo, limparForaDeJogo,
  filtrarForaDeJogo, motivoTerminal, eFalhaTerminal, TEMPO_FORA_DE_JOGO_MS,
} from "@/lib/ai/provedor-fora-de-jogo";

const ANTHROPIC = "api.anthropic.com";
const OPENAI = "api.openai.com";
const DEEPSEEK = "api.deepseek.com";
const GEMINI = "generativelanguage.googleapis.com";

// ── AS FRASES REAIS DOS PROVEDORES ──────────────────────────────────────────
// Copiadas do log de produção e da doutrina da casa. Inventar uma frase aqui
// tornaria o teste verde sobre um texto que nenhum provedor manda — régua verde
// sobre o componente errado é pior que régua nenhuma.
const SEM_SALDO_ANTHROPIC = {
  type: "error",
  error: {
    type: "invalid_request_error",
    message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  },
};
const SEM_SALDO_OPENAI = {
  error: {
    type: "insufficient_quota",
    message: "You exceeded your current quota, please check your plan and billing details.",
  },
};

type Acao = "sem_saldo" | "429" | "aprova" | "reprova" | "responde";
let roteiro: Record<string, Acao[]>;
let hosts: string[] = [];

const CORPO_APROVA = { verdict: "pass", issues: [], note: "no tom, sem problemas" };
const CORPO_REPROVA = { verdict: "flag", issues: ["promete resultado garantido"], note: "revisar" };

function acaoDe(host: string, n: number): Acao {
  const script = roteiro[host];
  if (!script || script.length === 0) return "sem_saldo";
  return script[Math.min(n, script.length - 1)]!;
}

function corpoDe(host: string, acao: Acao): Response {
  if (acao === "sem_saldo") {
    // ⚠️ HTTP **400**, não 402 e não 429. É esse o status que a Anthropic manda
    // para conta zerada — o mesmo de um corpo malformado. É por isso que a
    // régua desta casa lê a MENSAGEM e nunca o status.
    if (host.includes("anthropic")) return Response.json(SEM_SALDO_ANTHROPIC, { status: 400 });
    return Response.json(SEM_SALDO_OPENAI, { status: 429 });
  }
  if (acao === "429") return new Response("rate limited", { status: 429 });

  const corpo = acao === "aprova" ? CORPO_APROVA : acao === "reprova" ? CORPO_REPROVA : { ok: true };
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
}

beforeEach(() => {
  hosts = [];
  roteiro = {};
  // A memória de fora-de-jogo é de PROCESSO. Sem esta linha um caso envenenaria
  // o seguinte, e o arquivo passaria a medir a ordem dos testes.
  esquecerProvedoresForaDeJogo();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const host = new URL(url).host;
    const n = hosts.filter((h) => h === host).length;
    hosts.push(host);
    return corpoDe(host, acaoDe(host, n));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); esquecerProvedoresForaDeJogo(); });

const chamada = {
  system: "responda json",
  user: "escreva algo",
  workspaceId: "ws-sem-saldo",
  agentId: "teste-fila",
};

// ════════════════════════════════════════════════════════════════════════════
describe("a régua: terminal não é soluço", () => {
  it("as frases REAIS de conta zerada são TERMINAIS — nos dois provedores", () => {
    // A frase da Anthropic, palavra por palavra do log de produção.
    expect(motivoTerminal(`Claude HTTP 400: ${JSON.stringify(SEM_SALDO_ANTHROPIC)}`)).toBe("sem_saldo");
    // E a da OpenAI, que a casa já pagou uma volta inteira para aprender.
    expect(motivoTerminal("You have no credits remaining. Add credits to continue using the API")).toBe("sem_saldo");
    expect(motivoTerminal(`OpenAI HTTP 429: ${JSON.stringify(SEM_SALDO_OPENAI)}`)).toBe("sem_saldo");
    // Chave recusada também: ninguém ganha chave esperando.
    expect(motivoTerminal("OpenAI HTTP 401: invalid_api_key")).toBe("sem_chave");
  });

  it("o soluço continua sendo soluço — 429 puro, corpo vazio, timeout, 5xx", () => {
    for (const e of ["OpenAI HTTP 429", "Resposta DeepSeek vazia", "JSON inválido (Gemini)",
                     "timeout", "erro de rede", "OpenAI HTTP 503"]) {
      expect(eFalhaTerminal(e), e).toBe(false);
    }
  });

  it("⚠️ TERMINAL vence o 429: 'exceeded your current quota' NÃO merece outra volta", () => {
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Tire o `if (eFalhaTerminal(erro)) return false` de `mereceOutraVolta` e
    // esta linha fica VERMELHA: `eLimiteDeTaxa` procura a palavra "quota", que
    // está dentro da mensagem de conta zerada da OpenAI. A casa daria mais uma
    // volta inteira e carimbaria a retenção de "espere que passa" — sobre algo
    // que não passa esperando nunca.
    expect(mereceOutraVolta(`OpenAI HTTP 429: ${JSON.stringify(SEM_SALDO_OPENAI)}`)).toBe(false);
    // E o 429 de VERDADE continua merecendo. Sem esta linha, a correção acima
    // poderia ter sido feita matando a segunda volta inteira.
    expect(mereceOutraVolta("OpenAI HTTP 429")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("a memória entre chamadas: a porta fechada não é batida duas vezes", () => {
  it("a 1ª chamada bate no claude e cai para a openai; a 2ª JÁ NÃO BATE no claude", async () => {
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [OPENAI]: ["responde"] };

    const primeira = await generate(chamada);
    expect(primeira.ok).toBe(true);
    expect(primeira.ok && primeira.provider).toBe("openai");
    // A primeira paga o preço do descobrimento — é assim que a casa aprende.
    expect(hosts).toContain(ANTHROPIC);

    const antes = hosts.filter((h) => h === ANTHROPIC).length;
    const segunda = await generate(chamada);
    expect(segunda.ok).toBe(true);
    expect(segunda.ok && segunda.provider).toBe("openai");

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Devolva o provedor morto à fila (troque `ordemViva` por `order` no laço
    // de `generate`, ou apague o `marcarForaDeJogo`) e esta linha fica
    // VERMELHA: a segunda chamada volta a bater na Anthropic. É exatamente a
    // batida que produção repetiu 27 vezes em duas horas.
    expect(hosts.filter((h) => h === ANTHROPIC).length).toBe(antes);
  });

  it("falta de saldo NÃO é repetida 3x dentro da mesma chamada — porta fechada não melhora em 600ms", async () => {
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [OPENAI]: ["responde"] };
    await generate(chamada);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Tire o `if (eFalhaTerminal(error)) return false` de `isTransientError` e
    // o HTTP 429 da OpenAI-zerada passaria a ser repetido 3x com espera
    // crescente. Aqui a Anthropic responde 400, que já não era transitório —
    // então a prova de verdade é a linha de baixo, com a OpenAI na frente.
    expect(hosts.filter((h) => h === ANTHROPIC).length).toBe(1);
  });

  it("conta zerada que devolve 429 (OpenAI) também não é repetida — o status mentiria", async () => {
    // Preferido = openai, com reserva. A OpenAI zerada devolve **429**, que é o
    // status de "fila cheia" — e é justamente por isso que ler o status seria
    // fatal aqui: a casa repetiria 3x e depois daria outra volta.
    roteiro = { [OPENAI]: ["sem_saldo"], [GEMINI]: ["responde"] };
    const r = await generate({ ...chamada, preferredProvider: "openai" });
    expect(r.ok).toBe(true);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Sem o `eFalhaTerminal` no topo de `isTransientError`, este número vira 3.
    expect(hosts.filter((h) => h === OPENAI).length).toBe(1);
  });

  it("o provedor que RESPONDE volta ao topo na hora — recarga vale sem deploy", async () => {
    marcarForaDeJogo("claude", `Claude HTTP 400: ${JSON.stringify(SEM_SALDO_ANTHROPIC)}`);
    expect(provedorForaDeJogo("claude")).not.toBeNull();

    // Uma chamada boa apaga a marca. É isto que impede a casa de servir pela
    // reserva — mais cara e pior — muito depois de a conta ter sido paga.
    limparForaDeJogo("claude");
    expect(provedorForaDeJogo("claude")).toBeNull();
  });

  it("a marca EXPIRA sozinha — banir para sempre trocaria um defeito por outro", () => {
    const t0 = 1_000_000;
    marcarForaDeJogo("claude", "credit balance is too low", t0);
    expect(provedorForaDeJogo("claude", t0 + TEMPO_FORA_DE_JOGO_MS - 1)).not.toBeNull();
    expect(provedorForaDeJogo("claude", t0 + TEMPO_FORA_DE_JOGO_MS)).toBeNull();
  });

  it("o filtro só REMOVE — nunca acrescenta um nome que não entrou", () => {
    marcarForaDeJogo("claude", "credit balance is too low");
    const { fila, barrados } = filtrarForaDeJogo(["openai", "gemini", "deepseek"]);
    // O `claude` estava fora de jogo E fora da fila de entrada. Não aparece em
    // lado nenhum: é isto que garante que a independência do árbitro sobrevive.
    expect(fila).toEqual(["openai", "gemini", "deepseek"]);
    expect(barrados).toEqual([]);
    // E a ordem do que sobra é preservada.
    expect(filtrarForaDeJogo(["claude", "openai", "gemini"]).fila).toEqual(["openai", "gemini"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("a fila esgotada PARA com o motivo real — nunca com 'provider_error'", () => {
  it("os DOIS provedores sem saldo: não entrega nada, e diz SEM SALDO", async () => {
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [OPENAI]: ["sem_saldo"], [GEMINI]: ["sem_saldo"], [DEEPSEEK]: ["sem_saldo"] };

    const r = await generate(chamada);
    expect(r.ok).toBe(false);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Troque `motivoLegivel(firstFailure)` de volta por `firstFailure` puro e
    // esta linha fica VERMELHA: sobra o JSON cru da Anthropic, que manda quem
    // lê investigar um "invalid_request_error" — o corpo da requisição — em vez
    // de pôr crédito na conta. *Status de erro não é motivo.*
    expect(!r.ok && r.error).toMatch(/SEM SALDO na conta do provedor/i);
    // O texto cru continua junto: ele é a PROVA, o rótulo é a interpretação.
    expect(!r.ok && r.error).toContain("credit balance is too low");
  });

  it("a fila esgotada NA SEGUNDA chamada para SEM bater em ninguém, e ainda diz o motivo", async () => {
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [OPENAI]: ["sem_saldo"], [GEMINI]: ["sem_saldo"], [DEEPSEEK]: ["sem_saldo"] };
    await generate(chamada);
    const batidasAntes = hosts.length;

    const r = await generate(chamada);
    expect(r.ok).toBe(false);
    // Nenhuma chamada de rede nova: a casa já sabia que todas as portas estão
    // fechadas. Isto é o fim do ruído de 5 em 5 minutos — e é dinheiro e
    // latência que deixam de ser gastos para ouvir a mesma recusa.
    expect(hosts.length).toBe(batidasAntes);
    // E mesmo sem bater em ninguém, ela NÃO mente dizendo "nenhuma IA
    // conectada". Há chave; o que falta é crédito.
    expect(!r.ok && r.error).toMatch(/SEM SALDO na conta do provedor/i);
    expect(!r.ok && r.error).not.toMatch(/Nenhuma IA conectada/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
const peca = {
  deptLabel: "Social Media",
  title: "Sabor que a gente reconhece",
  content: "Uma legenda comum, sem número inventado e sem promessa de resultado. Chama a gente no direct.",
  brandContext: "padaria de bairro",
  workspaceId: "ws-sem-saldo",
  tipoDaEntrega: "social",
};

describe("o árbitro: a fila conserta, a independência NÃO cede", () => {
  it("autor=openai, claude sem saldo: o juiz sai do gemini e o claude não é batido de novo", async () => {
    // Fila do autor `openai` = [claude, gemini, deepseek] — o `claude` na
    // frente, exatamente como produção. Ele está zerado.
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [GEMINI]: ["reprova"], [DEEPSEEK]: ["reprova"] };

    const primeira = await auditDeliverable({ ...peca, provedorDoAutor: "openai" });
    expect(primeira.verdict).toBe("reprovado");
    expect(primeira.arbitro).toBe("gemini");
    expect(primeira.arbitroIndependente).toBe(true);
    // O AUTOR nunca foi consultado — a trava de sempre.
    expect(hosts).not.toContain(OPENAI);

    const antes = hosts.filter((h) => h === ANTHROPIC).length;
    const segunda = await auditDeliverable({ ...peca, provedorDoAutor: "openai" });
    expect(segunda.arbitro).toBe("gemini");
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Devolva o provedor morto à fila do árbitro (troque
    // `filtrarForaDeJogo(filaDeArbitros(autor))` por `filaDeArbitros(autor)`) e
    // esta linha fica VERMELHA: a segunda auditoria volta a gastar uma vaga de
    // juiz batendo numa conta zerada.
    expect(hosts.filter((h) => h === ANTHROPIC).length).toBe(antes);
    expect(hosts).not.toContain(OPENAI);
  });

  it("TODOS os árbitros sem saldo → RETÉM com 'provedor_sem_saldo', e nunca aprova", async () => {
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [GEMINI]: ["sem_saldo"], [DEEPSEEK]: ["sem_saldo"] };

    const v = await auditDeliverable({ ...peca, provedorDoAutor: "openai" });

    // Fail-closed. Árbitro ausente NUNCA vira aprovado — isto é RESULTADO, não
    // falha: a peça fica retida até alguém recarregar a conta.
    expect(v.verdict).toBe("nao_auditado");
    expect(ficouSemArbitro(v.verdict)).toBe(true);
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(v.arbitro).toBeUndefined();

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Tire o `if (houveSemSaldo) return semArbitro("provedor_sem_saldo")` e o
    // motivo volta a ser `limite_de_taxa` (a OpenAI-zerada devolve 429 e a
    // palavra "quota") ou `ia_indisponivel`. As duas mandam a pessoa fazer a
    // coisa errada: esperar, ou investigar um servidor que está de pé.
    expect(v.motivo).toBe("provedor_sem_saldo");
    expect(v.note).toMatch(/SEM SALDO/i);

    // E o autor não foi consultado em NENHUMA das duas voltas.
    expect(hosts).not.toContain(OPENAI);
  });

  it("com a fila JÁ vazia por saldo, a retenção continua e o autor segue de fora", async () => {
    // A casa já aprendeu que os três estão zerados numa rodada anterior.
    roteiro = { [ANTHROPIC]: ["sem_saldo"], [GEMINI]: ["sem_saldo"], [DEEPSEEK]: ["sem_saldo"] };
    await auditDeliverable({ ...peca, provedorDoAutor: "openai" });
    hosts = [];

    const v = await auditDeliverable({ ...peca, provedorDoAutor: "openai" });

    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("provedor_sem_saldo");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    // ⚠️ A PROVA MAIS IMPORTANTE DO ARQUIVO. Com a fila de juízes VAZIA, o
    // caminho fácil seria "não há juiz independente, use quem der" — que é o
    // autor. Nenhuma chamada sai: nem para o autor, nem para ninguém.
    expect(hosts).toEqual([]);
  });

  it("autor=claude com o próprio claude zerado: ele não julga, nem por acidente", async () => {
    // O caso que mais dói: o autor É o provedor sem saldo. Ele está fora por
    // dois motivos independentes — e nenhum dos dois pode ser o único.
    roteiro = { [OPENAI]: ["aprova"], [GEMINI]: ["aprova"], [DEEPSEEK]: ["aprova"] };
    marcarForaDeJogo("claude", `Claude HTTP 400: ${JSON.stringify(SEM_SALDO_ANTHROPIC)}`);

    const v = await auditDeliverable({ ...peca, provedorDoAutor: "claude" });

    expect(v.verdict).toBe("aprovado");
    expect(v.arbitroIndependente).toBe(true);
    expect(v.arbitro).not.toBe("claude");
    expect(hosts).not.toContain(ANTHROPIC);
  });
});
