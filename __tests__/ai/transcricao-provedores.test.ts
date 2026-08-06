// O PROVEDOR DE TRANSCRIÇÃO VIROU SUBSTITUÍVEL — e isso é mecanismo, não frase.
//
// 06/08/2026: a conta da OpenAI ficou sem crédito e o microfone morreu de uma
// vez no portal, no briefing público e no chat. A causa não foi a fatura: foi a
// camada falar DIRETO com um fornecedor só. Este arquivo trava as duas metades:
//   • fornecedor caído passa a bola para o próximo configurado;
//   • falha do ÁUDIO não vira roleta de provedor (não multiplica custo e espera).
// E a terceira, que é de honestidade: nenhum provedor configurado devolve
// `sem_chave` — a tela diz que o caminho não existe, em vez de culpar o áudio.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const resolveProviderKey = vi.hoisted(() => vi.fn());
const chaveDeRotaPublica = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey,
  chaveDoAmbiente: vi.fn(() => null),
}));
vi.mock("@/lib/ai/chave-publica", () => ({ chaveDeRotaPublica }));

import { transcreverPelaCasa, provedoresDeTranscricaoDisponiveis } from "@/lib/ai/transcricao-servidor";
import { transcreverAudio, classificarFalhaDoGemini, falhaDeTranscricao } from "@/lib/ai/transcricao";

const AUDIO = () => new Blob([new Uint8Array(5_000)], { type: "audio/webm" });
const WS = { tipo: "workspace", workspaceId: "ws-1" } as const;

function chave(k: string) {
  return { apiKey: k, source: "ui" as const, model: null };
}
function respostaOk(texto: string) {
  return new Response(JSON.stringify({ text: texto }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function respostaErro(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.GROQ_API_KEY;
  delete process.env.TRANSCRICAO_PROVEDORES;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.TRANSCRICAO_PROVEDORES;
});

describe("a cadeia de provedores", () => {
  // O CASO EXATO DE 06/08/2026, lido do log de produção:
  //   429 · code=credit_balance_exhausted type=insufficient_quota
  it("conta SEM CRÉDITO na OpenAI não derruba o ditado quando há outro provedor", async () => {
    resolveProviderKey.mockImplementation(async (p: string) =>
      p === "openai" ? chave("sk-vazia") : null,
    );
    process.env.GROQ_API_KEY = "gsk-boa";

    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url.includes("openai.com")) {
        return respostaErro(429, { error: { code: "credit_balance_exhausted", type: "insufficient_quota" } });
      }
      return respostaOk("mudar a cor do post");
    }));

    const { resultado, provedor } = await transcreverPelaCasa({ arquivo: AUDIO(), escopo: WS });

    expect(resultado).toEqual({ ok: true, texto: "mudar a cor do post" });
    expect(provedor).toBe("groq");
    expect(chamadas[0]).toContain("openai.com");
    expect(chamadas[1]).toContain("groq.com");
  });

  it("nenhum provedor configurado = `sem_chave`, e nenhuma chamada é feita", async () => {
    resolveProviderKey.mockResolvedValue(null);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);

    const { resultado, provedor } = await transcreverPelaCasa({ arquivo: AUDIO(), escopo: WS });

    expect(resultado).toEqual(falhaDeTranscricao("sem_chave"));
    expect(provedor).toBeNull();
    expect(f).not.toHaveBeenCalled();
    // E a frase manda escrever, não esperar: o caminho não existe.
    expect((resultado as { mensagem: string }).mensagem).toMatch(/escreva/i);
  });

  it("todos caídos: volta o diagnóstico do PRIMEIRO — é lá que o operador mexe", async () => {
    resolveProviderKey.mockImplementation(async (p: string) =>
      p === "openai" ? chave("sk-vazia") : null,
    );
    process.env.GROQ_API_KEY = "gsk-ruim";
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("openai.com")
        ? respostaErro(429, { error: { type: "insufficient_quota" } })
        : respostaErro(500, {}),
    ));

    const { resultado } = await transcreverPelaCasa({ arquivo: AUDIO(), escopo: WS });
    expect(resultado).toEqual(falhaDeTranscricao("sem_saldo"));
  });

  // A OUTRA METADE: trocar de provedor não faz silêncio virar frase.
  it("falha do ÁUDIO para na hora — não vira roleta de fornecedor", async () => {
    resolveProviderKey.mockImplementation(async (p: string) => (p === "openai" ? chave("sk-ok") : null));
    process.env.GROQ_API_KEY = "gsk-ok";
    const f = vi.fn(async () => respostaOk("   ")); // transcreveu, mas veio vazio
    vi.stubGlobal("fetch", f);

    const { resultado } = await transcreverPelaCasa({ arquivo: AUDIO(), escopo: WS });
    expect(resultado).toEqual(falhaDeTranscricao("sem_texto"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("áudio curto nem chega a tocar na chave", async () => {
    resolveProviderKey.mockResolvedValue(chave("sk-ok"));
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { resultado } = await transcreverPelaCasa({
      arquivo: new Blob([new Uint8Array(10)], { type: "audio/webm" }),
      escopo: WS,
    });
    expect(resultado).toEqual(falhaDeTranscricao("audio_curto"));
    expect(f).not.toHaveBeenCalled();
  });

  it("a ordem é configurável por env — trocar de fornecedor não pede deploy de código", async () => {
    process.env.TRANSCRICAO_PROVEDORES = "gemini";
    resolveProviderKey.mockImplementation(async (p: string) => (p === "gemini" ? chave("g-ok") : null));
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "oi" }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", f);

    const { resultado, provedor } = await transcreverPelaCasa({ arquivo: AUDIO(), escopo: WS });
    expect(provedor).toBe("gemini");
    expect(resultado).toEqual({ ok: true, texto: "oi" });
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain("generativelanguage");
  });

  it("rota PÚBLICA resolve a chave pelo caminho público — nunca 'a primeira do banco'", async () => {
    chaveDeRotaPublica.mockResolvedValue(null);
    const disponiveis = await provedoresDeTranscricaoDisponiveis({ tipo: "publico" });
    expect(disponiveis).toEqual([]);
    expect(chaveDeRotaPublica).toHaveBeenCalled();
    expect(resolveProviderKey).not.toHaveBeenCalled();
  });

  it("disponibilidade lista quem tem chave — é o que a tela pergunta antes de gravar", async () => {
    resolveProviderKey.mockImplementation(async (p: string) => (p === "gemini" ? chave("g") : null));
    expect(await provedoresDeTranscricaoDisponiveis(WS)).toEqual(["gemini"]);
  });
});

describe("Gemini — outro desenho, mesmo contrato", () => {
  it("manda o áudio embutido e devolve só o texto", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " quero um vídeo " }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", f);

    const r = await transcreverAudio({ apiKey: "g-ok", arquivo: AUDIO(), provedor: "gemini" });
    expect(r).toEqual({ ok: true, texto: "quero um vídeo" });

    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const corpo = JSON.parse(String(init.body)) as { contents: { parts: { inline_data?: { mime_type: string } }[] }[] };
    expect(corpo.contents[0].parts[1].inline_data?.mime_type).toBe("audio/webm");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-ok");
  });

  it("chave recusada continua chave recusada — cada erro com o seu conserto", () => {
    expect(classificarFalhaDoGemini(400, "PERMISSION_DENIED")).toBe("chave_recusada");
    expect(classificarFalhaDoGemini(429, "RESOURCE_EXHAUSTED")).toBe("ritmo");
    expect(classificarFalhaDoGemini(400, "INVALID_ARGUMENT")).toBe("audio_recusado");
    expect(classificarFalhaDoGemini(503, null)).toBe("provedor_indisponivel");
  });

  it("PII: o log do Gemini não leva a fala de ninguém", async () => {
    const erros: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...a) => { erros.push(...a); });
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaErro(400, { error: { status: "INVALID_ARGUMENT", message: "telefone 11 99999-0000" } }),
    ));

    await transcreverAudio({ apiKey: "g-ok", arquivo: AUDIO(), provedor: "gemini" });
    expect(erros.join(" ")).not.toContain("99999");
    expect(erros.join(" ")).not.toContain("g-ok");
    expect(erros.join(" ")).toContain("INVALID_ARGUMENT");
  });
});

describe("Groq — o mesmo Whisper por uma API compatível", () => {
  it("usa a URL da Groq e o modelo dela, com idioma pt", async () => {
    const f = vi.fn(async () => respostaOk("oi"));
    vi.stubGlobal("fetch", f);

    const r = await transcreverAudio({ apiKey: "gsk", arquivo: AUDIO(), provedor: "groq" });
    expect(r).toEqual({ ok: true, texto: "oi" });

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.groq.com");
    const corpo = init.body as FormData;
    expect(corpo.get("language")).toBe("pt");
    expect(String(corpo.get("model"))).toContain("whisper");
  });

  it("sem provedor declarado, o padrão continua sendo o de sempre (OpenAI)", async () => {
    const f = vi.fn(async () => respostaOk("oi"));
    vi.stubGlobal("fetch", f);
    await transcreverAudio({ apiKey: "sk", arquivo: AUDIO() });
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain("api.openai.com");
  });
});
