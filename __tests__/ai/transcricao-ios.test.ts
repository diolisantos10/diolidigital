// O CHROME DO iPHONE — o caso majoritário, provado onde dá para provar.
//
// Recado do CEO em 06/08/2026: "todo mundo usa o Chrome". No iPhone isso não
// é um detalhe de preferência: a App Store obriga TODO navegador do iOS a rodar
// WebKit, e o `SpeechRecognition` é exposto só pelo Safari. Consequência:
//   • no Chrome do iPhone o caminho 1 (nativo) NÃO EXISTE;
//   • logo, gravar-e-enviar é a RUA PRINCIPAL, e não a rede de segurança;
//   • e o WebKit grava MP4/AAC, não WebM/Opus.
//
// ─── O LIMITE DESTA PROVA, DITO COM TODAS AS LETRAS ─────────────────────────
// Isto NÃO é um iPhone. É o comportamento do WebKit REPRODUZIDO a partir do
// código-fonte dele (`Source/WebCore/platform/mediarecorder/
// MediaRecorderPrivateAVFImpl.cpp`, lido em 06/08/2026): `isTypeSupported`
// aceita `audio/mp4` e recusa `audio/webm` quando a flag de WebM está
// desligada. O Playwright desta máquina só tem Chromium — não há WebKit
// instalado para rodar de verdade. Então o que estes testes garantem é a LÓGICA
// da escolha de formato, não o aparelho do CEO.
//
// E o que a emulação DESMENTIU fica escrito, porque também é resultado: a
// hipótese de que o código antigo lançava `NotSupportedError` no construtor não
// se sustentou. `MediaRecorder::create` chama o mesmo `isTypeSupported`
// (MediaRecorder.cpp:84), então o que a engine reporta o construtor aceita.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mimeDeGravacaoSuportado,
  ehWebKitDeIOS,
  extensaoDeAudio,
  mimeParaGemini,
  falhaDeTranscricao,
  MIN_BYTES_DE_AUDIO,
} from "@/lib/ai/transcricao";

/** UA real do Chrome no iPhone. `CriOS` é a casca; o motor é WebKit. */
const UA_CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1";
const UA_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";
const UA_IPADOS = // iPadOS 13+ se anuncia como Macintosh; o toque desmente
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Safari/605.1.15";

function comNavegador(ua: string, toques = 5) {
  vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: toques });
}

/** WebKit do iOS: MP4 sim; WebM só com a flag ligada (default: desligada). */
function comWebKit({ webm = false } = {}) {
  vi.stubGlobal("MediaRecorder", {
    isTypeSupported: (m: string) => {
      if (m.startsWith("audio/mp4") || m.startsWith("video/mp4")) return true;
      if (m.startsWith("audio/webm")) return webm;
      return false;
    },
  });
}

/** Blink de desktop: WebM/Opus é o caminho de casa. */
function comBlink() {
  vi.stubGlobal("MediaRecorder", {
    isTypeSupported: (m: string) => m.startsWith("audio/webm") || m === "audio/mp4",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("quem é WebKit de iOS — a detecção decide PREFERÊNCIA, nunca suporte", () => {
  it("Chrome do iPhone é WebKit — é o caso do CEO", () => {
    comNavegador(UA_CHROME_IOS);
    expect(ehWebKitDeIOS()).toBe(true);
  });

  it("Safari do iPhone também", () => {
    comNavegador(UA_SAFARI_IOS);
    expect(ehWebKitDeIOS()).toBe(true);
  });

  it("iPad que se anuncia como Mac é desmentido pelo toque", () => {
    comNavegador(UA_IPADOS, 5);
    expect(ehWebKitDeIOS()).toBe(true);
  });

  it("Mac de verdade não tem toque — e não é iOS", () => {
    comNavegador(UA_IPADOS, 0);
    expect(ehWebKitDeIOS()).toBe(false);
  });

  it("Chrome de desktop não é iOS", () => {
    comNavegador(UA_CHROME_DESKTOP, 0);
    expect(ehWebKitDeIOS()).toBe(false);
  });
});

describe("escolha de formato — a gravação não pode falhar ANTES de sair do aparelho", () => {
  it("iPhone escolhe MP4, que é o caminho nativo do AVAssetWriter", () => {
    comNavegador(UA_CHROME_IOS);
    comWebKit();
    expect(mimeDeGravacaoSuportado()).toBe("audio/mp4");
  });

  it("mesmo com a flag de WebM LIGADA, o iPhone não recebe pedido de WebM", () => {
    // Este é o caso que o código antigo errava de verdade. Com a flag ligada,
    // `isTypeSupported("audio/webm")` vira `true` e o hook forçava
    // `{mimeType:"audio/webm"}` — gravando WebM num escritor cujo caminho de
    // casa (acelerado, provado) é MP4. Não é crash; é trocar o caminho bom pelo
    // caminho novo sem ganhar nada.
    comNavegador(UA_CHROME_IOS);
    comWebKit({ webm: true }); // mesmo com a flag de WebM LIGADA
    expect(mimeDeGravacaoSuportado()).not.toContain("webm");
  });

  it("Chrome de desktop continua em WebM/Opus — nada regride para quem já funcionava", () => {
    comNavegador(UA_CHROME_DESKTOP, 0);
    comBlink();
    expect(mimeDeGravacaoSuportado()).toBe("audio/webm;codecs=opus");
  });

  it("engine que não confirma nenhum contêiner devolve null — 'deixe o navegador escolher'", () => {
    comNavegador(UA_CHROME_IOS);
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    // null NÃO é erro: o chamador passa `{}` e o padrão do aparelho vale. O
    // melhor palpite sobre o formato de um aparelho é o do próprio aparelho.
    expect(mimeDeGravacaoSuportado()).toBeNull();
  });

  it("isTypeSupported que LANÇA não derruba a escolha", () => {
    comNavegador(UA_CHROME_IOS);
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: () => { throw new Error("engine antiga"); },
    });
    expect(mimeDeGravacaoSuportado()).toBeNull();
  });

  it("sem MediaRecorder nenhum, null (e o botão nem aparece)", () => {
    comNavegador(UA_CHROME_IOS);
    vi.stubGlobal("MediaRecorder", undefined);
    expect(mimeDeGravacaoSuportado()).toBeNull();
  });
});

describe("o que o iPhone produz chega inteiro no provedor", () => {
  it("MP4 vira extensão .mp4 no multipart — OpenAI e Groq aceitam mp4/m4a", () => {
    expect(extensaoDeAudio("audio/mp4")).toBe("mp4");
    expect(extensaoDeAudio("audio/mp4;codecs=mp4a.40.2")).toBe("mp4");
  });

  it("Gemini recebe o codec que ele DOCUMENTA: MP4 é anunciado como AAC", () => {
    // ai.google.dev/gemini-api/docs/audio, "Supported audio formats":
    // wav · mp3 · aiff · aac · ogg · flac. MP4 não está na lista.
    expect(mimeParaGemini("audio/mp4")).toBe("audio/aac");
    expect(mimeParaGemini("audio/mp4;codecs=mp4a.40.2")).toBe("audio/aac");
  });

  it("o que já roda em produção não muda de etiqueta", () => {
    expect(mimeParaGemini("audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(mimeParaGemini("audio/ogg")).toBe("audio/ogg");
  });
});

describe("o piso de bytes não recusa a fala do iPhone", () => {
  it("um segundo de AAC do WebKit passa com folga de 7x ou mais", () => {
    // AAC do WebKit: 64–128 kbps = 8.000–16.000 bytes por segundo de fala.
    const UM_SEGUNDO_DE_AAC = 8_000;
    expect(UM_SEGUNDO_DE_AAC).toBeGreaterThan(MIN_BYTES_DE_AUDIO * 6);
  });

  it("um segundo do Opus mais apertado também passa", () => {
    const UM_SEGUNDO_DE_OPUS = 3_000; // 24 kbps
    expect(UM_SEGUNDO_DE_OPUS).toBeGreaterThan(MIN_BYTES_DE_AUDIO);
  });
});

describe("mensagem honesta — problema de formato NÃO manda mexer em permissão", () => {
  it("gravação que não inicia tem frase própria, e ela não fala de permissão", () => {
    const f = falhaDeTranscricao("gravacao_falhou");
    expect(f.ok).toBe(false);
    expect(f.mensagem.toLowerCase()).not.toContain("permiss");
    expect(f.mensagem.toLowerCase()).not.toContain("bloquead");
    expect(f.mensagem.length).toBeGreaterThan(20);
  });

  it("e continua sendo outra frase que 'não grava áudio' — as causas são diferentes", () => {
    expect(falhaDeTranscricao("gravacao_falhou").mensagem)
      .not.toBe(falhaDeTranscricao("sem_suporte").mensagem);
  });
});
