// O 400 QUE NÃO ERA CORPO MALFORMADO.
//
// Ronda de 24/08/2026, produção, 07:29: `Claude HTTP 400` no departamento do
// SDR. Um 400 diz "requisição inválida" e a investigação inteira foi para o
// corpo — ferramenta forçada, bloco de cache, ordem dos campos. Nada disso era.
// Perguntando à API o que ela recusou (sonda contra a API de verdade), veio:
//
//   "Your credit balance is too low to access the Anthropic API."
//
// A Anthropic devolve 400 `invalid_request_error` para FALTA DE SALDO — mesmo
// status e mesma família de um corpo malformado. Estes testes usam a mensagem
// LITERAL medida naquele dia: teste alimentado por texto inventado prova que a
// função lê texto inventado.

import { describe, it, expect } from "vitest";
import {
  classificarFalhaDeProvedor, motivoLegivel, precisamDeGente, ROTULO_DA_FALHA,
} from "@/lib/ai/falha-de-provedor";

/** A mensagem REAL, copiada da resposta da API em 24/08/2026. */
const SEM_SALDO_ANTHROPIC =
  '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';

describe("falta de saldo não pode ser lida como corpo malformado", () => {
  it("reconhece a mensagem literal que a Anthropic devolveu em produção", () => {
    expect(classificarFalhaDeProvedor(SEM_SALDO_ANTHROPIC)).toBe("sem_saldo");
  });

  it("o texto do 400 já vem com o status embutido, e mesmo assim é SALDO", () => {
    // É esta a forma que a camada monta hoje: `Claude HTTP 400: <corpo>`.
    expect(classificarFalhaDeProvedor(`Claude HTTP 400: ${SEM_SALDO_ANTHROPIC}`)).toBe("sem_saldo");
  });

  it("reconhece o mesmo caso nos outros provedores da casa", () => {
    expect(classificarFalhaDeProvedor("You exceeded your current quota, please check your plan and billing details")).toBe("sem_saldo");
    expect(classificarFalhaDeProvedor("insufficient_quota")).toBe("sem_saldo");
  });

  it("NÃO confunde chave inválida com saldo — são consertos diferentes", () => {
    expect(classificarFalhaDeProvedor("Claude HTTP 401: invalid x-api-key")).toBe("sem_chave");
  });

  it("teto de ritmo é passageiro e NÃO é saldo", () => {
    expect(classificarFalhaDeProvedor("Claude HTTP 429: rate_limit_error")).toBe("teto_de_ritmo");
  });

  it("indisponibilidade é outra coisa ainda", () => {
    expect(classificarFalhaDeProvedor("Claude HTTP 529: overloaded")).toBe("teto_de_ritmo");
    expect(classificarFalhaDeProvedor("Claude HTTP 503")).toBe("indisponivel");
    expect(classificarFalhaDeProvedor("erro de rede")).toBe("indisponivel");
  });

  it("o que não reconhece vira null — dizer 'não sei' é melhor que encaixar à força", () => {
    expect(classificarFalhaDeProvedor("aconteceu alguma coisa esquisita")).toBeNull();
    expect(classificarFalhaDeProvedor("")).toBeNull();
    expect(classificarFalhaDeProvedor(null)).toBeNull();
  });

  it("motivoLegivel devolve o texto cru quando não classifica — nunca inventa categoria", () => {
    expect(motivoLegivel("coisa nunca vista")).toBe("coisa nunca vista");
    expect(motivoLegivel(SEM_SALDO_ANTHROPIC)).toBe(ROTULO_DA_FALHA.sem_saldo);
  });
});

describe("quem acorda gente, e quem não", () => {
  const caido = (motivo: ReturnType<typeof classificarFalhaDeProvedor>) => ({
    provider: "claude", motivo, exemplo: "x", quantas: 3, ultimaEm: new Date(),
  });

  it("sem saldo e sem chave acordam gente — ninguém conserta em código", () => {
    const r = precisamDeGente([caido("sem_saldo"), caido("sem_chave")]);
    expect(r).toHaveLength(2);
  });

  it("teto de ritmo NÃO acorda ninguém — passa sozinho", () => {
    expect(precisamDeGente([caido("teto_de_ritmo")])).toHaveLength(0);
  });

  it("o rótulo do saldo DIZ que a casa está servindo pela reserva", () => {
    // Quem lê o alarme precisa saber a consequência, não só o fato.
    expect(ROTULO_DA_FALHA.sem_saldo).toMatch(/reserva/i);
    expect(ROTULO_DA_FALHA.sem_saldo).toMatch(/pessoa/i);
  });
});

describe("a camada não pode voltar a esconder o motivo", () => {
  it("callClaude devolve o CORPO do erro junto do status", async () => {
    const fonte = await import("node:fs/promises").then((fs) => fs.readFile("lib/ai/generate.ts", "utf-8"));
    // A linha que existia antes e apagava o diagnóstico.
    expect(fonte).not.toMatch(/return \{ ok: false, error: `Claude HTTP \$\{res\.status\}` \}/);
    expect(fonte).toContain("Claude HTTP ${res.status}${detalhe");
  });

  it("o relógio olha os provedores caídos a cada rodada", async () => {
    const fonte = await import("node:fs/promises").then((fs) => fs.readFile("lib/agency/despertador.ts", "utf-8"));
    expect(fonte).toContain("provedoresCaidos");
    expect(fonte).toContain("precisamDeGente");
  });
});

describe("a bateria nomeia a falta de saldo em vez de dizer 'provider_error'", () => {
  it("a rota do SDR classifica o motivo pela mensagem do provedor", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/sdr/chat/route.ts", "utf-8"));
    expect(fonte).toContain("classificarFalhaDeProvedor");
    expect(fonte).toContain("sem_saldo_no_provedor");
  });

  it("o placar trata falta de saldo como 'não coberto', não como culpa da casa", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/agency/cliente-falso/verificacoes.ts", "utf-8"));
    expect(fonte).toContain('"sem_saldo_no_provedor"');
    // E DIZ, em português, que precisa de gente — não deixa virar mais uma sigla.
    expect(fonte).toMatch(/SEM SALDO na conta do provedor/);
  });
});
