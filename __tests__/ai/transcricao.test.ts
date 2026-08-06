// Ditado por voz no portal — o contrato que não pode quebrar.
//
// A regra da casa: transcrição é ADVISORY. Se ela falhar, o campo de texto
// continua lá e a decisão do cliente segue. Por isso o teste central não é
// "transcreve bem" — é "NUNCA lança, em nenhum caminho".

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  transcreverAudio,
  enviarAudioParaTranscricao,
  falhaDeTranscricao,
  juntarTranscricao,
  extensaoDeAudio,
  suportaDitado,
  MAX_BYTES_DE_AUDIO,
  MIN_BYTES_DE_AUDIO,
} from "@/lib/ai/transcricao";

const CHAVE = "sk-teste";
const audio = (bytes: number, tipo = "audio/webm") =>
  new Blob([new Uint8Array(bytes)], { type: tipo });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("transcreverAudio — servidor", () => {
  it("devolve o texto quando o provedor responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ text: "  precisa trocar a cor do logo  " }), { status: 200 })));

    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual({ ok: true, texto: "precisa trocar a cor do logo" });
  });

  it("sem chave não chama o provedor", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await transcreverAudio({ apiKey: "", arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("sem_chave"));
    expect(f).not.toHaveBeenCalled();
  });

  it("clique acidental (áudio minúsculo) não vira chamada paga", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(MIN_BYTES_DE_AUDIO - 1) });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("áudio acima do teto é barrado ANTES do upload", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(MAX_BYTES_DE_AUDIO + 1) });
    expect(r).toEqual(falhaDeTranscricao("audio_grande"));
    expect(f).not.toHaveBeenCalled();
  });

  it("erro do provedor vira estado legível, não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("provedor_indisponivel"));
  });

  it("falha de rede vira estado legível, não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("rede"));
  });

  it("timeout tem motivo próprio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("tempo_esgotado"));
  });

  it("silêncio (texto vazio) NÃO é sucesso — senão o campo receberia nada e o cliente acharia que ditou", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "   " }), { status: 200 })));
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("sem_texto"));
  });

  it("JSON quebrado do provedor não lança", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r.ok).toBe(false);
  });

  it("PII: o texto transcrito nunca vai para log", async () => {
    const erros: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...a) => { erros.push(...a); });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("o cliente disse o telefone 11 99999-0000", { status: 500 })));

    await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(erros.join(" ")).not.toContain("99999");
    // e a chave também não
    expect(erros.join(" ")).not.toContain(CHAVE);
  });

  it("manda idioma pt e o modelo da casa", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ text: "oi" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    const corpo = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(corpo.get("language")).toBe("pt");
    expect(corpo.get("model")).toBe("whisper-1");
  });
});

// ─── O bug do microfone do portal (06/08/2026) ───────────────────────────────
// Sintoma: áudio válido e chave presente devolviam `provedor_indisponivel`.
// Causa da CEGUEIRA (não do bug): quatro problemas com quatro consertos
// diferentes chegavam com a mesma palavra e uma linha de log que só dizia o
// número. O motivo agora diz qual dos quatro é.
describe("a recusa do provedor deixou de ser uma palavra só", () => {
  const comStatus = async (status: number, corpo: unknown = {}) => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    return transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
  };

  it("401 é CHAVE RECUSADA — e nunca 'sem_chave', que mandaria procurar o que já está lá", async () => {
    const r = await comStatus(401, { error: { code: "invalid_api_key", type: "invalid_request_error" } });
    expect(r).toEqual(falhaDeTranscricao("chave_recusada"));
    expect(r).not.toEqual(falhaDeTranscricao("sem_chave"));
  });

  it("403 e 402 (sem saldo) também são chave recusada — é conta da agência, não do cliente", async () => {
    expect(await comStatus(403)).toEqual(falhaDeTranscricao("chave_recusada"));
    expect(await comStatus(402, { error: { code: "insufficient_quota" } })).toEqual(falhaDeTranscricao("chave_recusada"));
  });

  it("429 do provedor vira 'ritmo' — esperar resolve, mexer na chave não", async () => {
    expect(await comStatus(429)).toEqual(falhaDeTranscricao("ritmo"));
  });

  it("400 é ÁUDIO recusado — o conserto é regravar, não mexer na configuração", async () => {
    expect(await comStatus(400, { error: { code: "invalid_file_format" } })).toEqual(falhaDeTranscricao("audio_recusado"));
    expect(await comStatus(415)).toEqual(falhaDeTranscricao("audio_recusado"));
  });

  it("5xx continua sendo 'provedor_indisponivel' — o caso limpo não foi reclassificado", async () => {
    // A outra metade: a mudança não pode transformar queda de provedor em
    // alarme de configuração, senão o operador vai caçar chave boa toda vez
    // que a OpenAI piscar.
    expect(await comStatus(500)).toEqual(falhaDeTranscricao("provedor_indisponivel"));
    expect(await comStatus(503)).toEqual(falhaDeTranscricao("provedor_indisponivel"));
  });

  it("o log leva status, code e type — e NUNCA a mensagem do provedor", async () => {
    // `error.message` é texto livre e pode ecoar o que foi enviado. O que foi
    // enviado é a fala do cliente.
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "invalid_api_key", type: "invalid_request_error", message: "sk-abc123 é inválida; pedido do cliente: bolo de morango" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      )));
    await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });

    const linhas = erro.mock.calls.flat().join(" ");
    expect(linhas).toContain("401");
    expect(linhas).toContain("invalid_api_key");
    expect(linhas).toContain("invalid_request_error");
    expect(linhas).not.toContain("bolo de morango");
    expect(linhas).not.toContain("sk-abc123");
  });

  it("corpo de erro ilegível não vira um segundo erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await transcreverAudio({ apiKey: CHAVE, arquivo: audio(5_000) });
    expect(r).toEqual(falhaDeTranscricao("provedor_indisponivel"));
  });

  it("todo motivo novo tem frase em português — nenhum chega cru na tela", () => {
    for (const m of ["chave_recusada", "audio_recusado"] as const) {
      const f = falhaDeTranscricao(m);
      expect(f.mensagem.length).toBeGreaterThan(20);
      expect(f.mensagem).not.toContain("_");
    }
  });
});

describe("enviarAudioParaTranscricao — navegador", () => {
  it("propaga o motivo devolvido pela rota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, motivo: "sem_chave", mensagem: "x" }), { status: 200 })));
    const r = await enviarAudioParaTranscricao(audio(5_000), { endpoint: "/api/portal/transcricao" });
    expect(r).toEqual(falhaDeTranscricao("sem_chave"));
  });

  it("429 vira 'ritmo' mesmo sem corpo reconhecível", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const r = await enviarAudioParaTranscricao(audio(5_000), { endpoint: "/api/portal/transcricao" });
    expect(r).toEqual(falhaDeTranscricao("ritmo"));
  });

  it("rede caída não lança", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await enviarAudioParaTranscricao(audio(5_000), { endpoint: "/api/portal/transcricao" });
    expect(r).toEqual(falhaDeTranscricao("rede"));
  });

  it("token vazio (modo cookie) não vai como campo vazio", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, texto: "oi" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await enviarAudioParaTranscricao(audio(5_000), {
      endpoint: "/api/portal/transcricao",
      campos: { token: "" },
    });
    const corpo = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(corpo.get("token")).toBeNull();
    expect(corpo.get("file")).toBeInstanceOf(Blob);
  });
});

describe("juntarTranscricao — o ditado é ADITIVO", () => {
  it("nunca apaga o que o cliente já escreveu", () => {
    expect(juntarTranscricao("trocar a cor", "e o texto do rodapé"))
      .toBe("trocar a cor e o texto do rodapé");
  });
  it("no campo vazio, é só o ditado", () => {
    expect(juntarTranscricao("", "trocar a cor")).toBe("trocar a cor");
  });
  it("transcrição vazia devolve o texto intacto", () => {
    expect(juntarTranscricao("trocar a cor", "   ")).toBe("trocar a cor");
  });
});

describe("degradação", () => {
  it("sem MediaRecorder, suportaDitado é false — o botão não deve aparecer", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(suportaDitado()).toBe(false);
  });

  it("toda falha tem mensagem em português e não vaza jargão técnico", () => {
    for (const m of ["sem_suporte", "sem_permissao", "audio_curto", "sem_chave", "rede", "sem_texto"] as const) {
      const f = falhaDeTranscricao(m);
      expect(f.ok).toBe(false);
      expect(f.mensagem.length).toBeGreaterThan(20);
      expect(f.mensagem).not.toMatch(/undefined|Error|null|\bfetch\b/);
    }
  });

  it("extensão acompanha o mime — Safari/iOS grava mp4, não webm", () => {
    expect(extensaoDeAudio("audio/mp4")).toBe("mp4");
    expect(extensaoDeAudio("audio/webm;codecs=opus")).toBe("webm");
    expect(extensaoDeAudio("audio/ogg")).toBe("ogg");
  });
});
