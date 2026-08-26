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
  // Esta é a régua do LAÇO da rota. Só duas falhas fazem andar, e as duas são
  // de CONTA: custam zero e não melhoram com o tempo. As outras passam sozinhas,
  // e trocar de provedor nelas multiplicaria gasto e trocaria a VOZ do SDR no
  // meio da conversa por um soluço de rede.
  const anda = (msg: string): boolean => {
    const c = classificarFalhaDeProvedor(msg);
    return c === "sem_saldo" || c === "sem_chave";
  };

  it("🔴 a frase EXATA da Anthropic que fechou a porta faz andar", () => {
    expect(anda('Claude HTTP 400: {"type":"error","error":{"type":"invalid_request_error",'
      + '"message":"Your credit balance is too low to access the Anthropic API."}}')).toBe(true);
  });

  it("🔴 a frase EXATA da OpenAI medida na véspera faz andar", () => {
    expect(anda("You have no credits remaining. Add credits to continue using the API at "
      + "https://platform.openai.com/settings/organization/billing/.")).toBe(true);
  });

  it("chave inválida também é conta — insistir daria a mesma resposta", () => {
    expect(anda("OpenAI HTTP 401: invalid_api_key")).toBe(true);
  });

  it("MUTAÇÃO — 429 NÃO faz andar: teto de ritmo passa sozinho", () => {
    // Sem esta asserção, uma régua frouxa trocaria de provedor a cada soluço e
    // multiplicaria o gasto — os 15 `gpt-4o HTTP 429` da janela medida viraram
    // 15 chamadas pagas num segundo provedor, por nada.
    expect(anda("OpenAI HTTP 429")).toBe(false);
  });

  it("MUTAÇÃO — provedor fora do ar e timeout NÃO fazem andar", () => {
    expect(anda("Claude HTTP 503 service unavailable")).toBe(false);
    expect(anda("timeout")).toBe(false);
  });

  it("MUTAÇÃO — falha que a casa não reconhece NÃO faz andar", () => {
    // Ausência de classificação não é permissão. Guardrail 1.
    expect(anda("Resposta DeepSeek vazia")).toBe(false);
    expect(anda("")).toBe(false);
  });
});
