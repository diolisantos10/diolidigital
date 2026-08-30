// A PORTA DA RUA TEM UM SEGUNDO PROVEDOR — ter chave não é ter saldo.
//
// ⚠️ MEDIDO EM PRODUÇÃO (cliente oculto, 26/08/2026, 07:24:54Z). O PRIMEIRO
// turno da jornada devolveu `{"ok":false,"reason":"sem_saldo_no_provedor"}`.
// Conferido no livro-caixa no mesmo minuto:
//
//   claude-haiku-4-5 · error · "Your credit balance is too low to access the
//   Anthropic API"
//
// A conta da Anthropic zerou; a da OpenAI já estava zerada desde a véspera
// ("You have no credits remaining"). E havia **Gemini com chave e funcionando
// na mesma base** — 12 chamadas com sucesso na mesma janela.
//
// A porta da rua da agência — a única que atende quem ainda NÃO é cliente —
// ficou fechada para toda a internet com um provedor bom parado ao lado, porque
// `primeiraChaveDeRotaPublica` escolhe o primeiro que tem CHAVE e não olha mais.
// O resto da casa (`generate`) sempre teve essa rede; só a porta pública não.

import { describe, it, expect, beforeEach, vi } from "vitest";

const chaveDeRotaPublica = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/client-request-service", () => ({
  resolverWorkspacePublico: vi.fn(async () => "ws-1"),
}));
vi.mock("@/lib/auth/posse-de-workspace", () => ({ workspaceUnico: vi.fn(async () => ({ ambiguo: false })) }));
vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: chaveDeRotaPublica,
  chaveDoAmbiente: vi.fn(() => null),
}));

import { chavesDeRotaPublica } from "@/lib/ai/chave-publica";
import { classificarFalhaDeProvedor } from "@/lib/ai/falha-de-provedor";

beforeEach(() => vi.clearAllMocks());

describe("a lista de provedores da porta pública", () => {
  it("devolve TODOS os que têm chave, na ordem da casa — não só o primeiro", async () => {
    // Claude e Gemini têm chave; OpenAI não. Era exatamente o estado da base.
    chaveDeRotaPublica.mockImplementation(async (p: string) =>
      p === "claude" ? { apiKey: "k-claude" } : p === "gemini" ? { apiKey: "k-gemini" } : null,
    );
    const lista = await chavesDeRotaPublica(["claude", "openai", "gemini", "deepseek"]);
    expect(lista.map((x) => x.provider)).toEqual(["claude", "gemini"]);
  });

  it("sem chave nenhuma devolve lista vazia — e a rota responde `not_configured`", async () => {
    chaveDeRotaPublica.mockResolvedValue(null);
    expect(await chavesDeRotaPublica(["claude", "openai"])).toEqual([]);
  });

  it("a ordem da casa é preservada — o segundo é o SEGUNDO, não um qualquer", async () => {
    chaveDeRotaPublica.mockResolvedValue({ apiKey: "k" });
    const lista = await chavesDeRotaPublica(["claude", "openai", "gemini"]);
    expect(lista.map((x) => x.provider)).toEqual(["claude", "openai", "gemini"]);
  });
});

describe("qual falha faz a porta andar para o próximo provedor", () => {
  // A régua do LAÇO da rota, e ela é a MESMA da casa: `lib/ai/generate.ts` cai
  // para o próximo provedor em QUALQUER falha que não tenha produzido texto.
  //
  // ⚠️ CORREÇÃO DE ROTA DECLARADA. O primeiro conserto desta frente (07:47Z) só
  // andava em `sem_saldo` e `sem_chave`, com o argumento de que 429 passa
  // sozinho. Medido no turno seguinte, em produção: claude devolveu `sem_saldo`
  // (andou), a OpenAI devolveu **HTTP 429** — que naquela conta é a conta
  // zerada vestida de teto de ritmo — e a porta continuou fechada com Gemini
  // funcionando ao lado. A régua estava mais dura que a doutrina da casa.
  //
  // O argumento de custo não se sustenta: só se anda sobre um turno JÁ PERDIDO.
  // Gastar uma chamada num provedor que funciona é estritamente melhor que
  // devolver silêncio.
  const anda = (r: { ok: boolean; error?: string; textoCru?: string | null }): boolean =>
    !r.ok && !r.textoCru;

  it("🔴 a frase EXATA da Anthropic que fechou a porta faz andar", () => {
    expect(anda({ ok: false, error: 'Claude HTTP 400: "Your credit balance is too low"' })).toBe(true);
    expect(classificarFalhaDeProvedor("Your credit balance is too low to access the Anthropic API")).toBe("sem_saldo");
  });

  it("🔴 o HTTP 429 da OpenAI — a conta zerada vestida de teto de ritmo — TAMBÉM faz andar", () => {
    // Este é o teste que o meu primeiro conserto reprovaria. Ele existe porque
    // a produção o reprovou primeiro.
    expect(anda({ ok: false, error: "OpenAI HTTP 429" })).toBe(true);
  });

  it("provedor fora do ar e timeout fazem andar — o turno já está perdido", () => {
    expect(anda({ ok: false, error: "Claude HTTP 503 service unavailable" })).toBe(true);
    expect(anda({ ok: false, error: "timeout" })).toBe(true);
  });

  it("🔴 MUTAÇÃO — resposta que VEIO não faz andar, nem quando falhou", () => {
    // É a trava que impede o desperdício de verdade. Texto cru, mesmo truncado
    // ou malformado, tem ESCOPO a resgatar — as quatro conquistas desta rota
    // vivem disso, e regerar num segundo provedor jogaria fora o que o cliente
    // acabou de dizer.
    expect(anda({ ok: false, error: "JSON malformado", textoCru: '{"reply":"oi, tudo b' })).toBe(false);
  });

  it("MUTAÇÃO — sucesso nunca faz andar", () => {
    expect(anda({ ok: true, textoCru: '{"reply":"oi"}' })).toBe(false);
    // Sucesso sem textoCru também não: `ok` já resolve sozinho.
    expect(anda({ ok: true })).toBe(false);
  });

  it("a casa continua sabendo NOMEAR a falha, mesmo sem usá-la para decidir", () => {
    // O motivo classificado não decide mais o laço, mas continua indo ao log e
    // ao diário — é ele que separa "o CEO precisa pôr saldo" de "o provedor
    // soluçou". Perder essa distinção seria trocar um defeito por outro.
    expect(classificarFalhaDeProvedor("You have no credits remaining.")).toBe("sem_saldo");
    expect(classificarFalhaDeProvedor("OpenAI HTTP 429")).toBe("teto_de_ritmo");
    expect(classificarFalhaDeProvedor("OpenAI HTTP 401: invalid_api_key")).toBe("sem_chave");
    expect(classificarFalhaDeProvedor("Resposta DeepSeek vazia")).toBeNull();
  });
});
