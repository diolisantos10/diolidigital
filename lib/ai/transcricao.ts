// transcricao.ts — ditado por voz: áudio → texto. ISOMÓRFICO (server + client).
//
// Existe por pedido do CEO (05/08/2026): "na parte da devolutiva lá na
// aprovação, eu gostaria que tivesse essa ferramenta de áudio que transcreve,
// eu não gosto de digitar". O alvo é o campo de "solicitar ajustes" e "tenho
// uma dúvida" no portal do cliente.
//
// POR QUE SERVIDOR E NÃO `SpeechRecognition` DO NAVEGADOR
//   O `SpeechRecognition` é grátis e não tira o áudio do aparelho — mas no
//   Safari/iOS (que é ONDE O CEO USA) ele é `webkitSpeechRecognition`, exige
//   gesto do usuário a cada início, corta sozinho no silêncio e em várias
//   versões simplesmente não existe fora do Safari. "Funciona no meu Chrome e
//   não funciona no iPhone do dono" é a pior falha possível para este pedido.
//   A casa JÁ decidiu isso uma vez: `lib/hooks/useSpeechToText.ts` nasceu como
//   hook de Web Speech e foi trocado por MediaRecorder + Whisper no servidor
//   ("Drop-in replacement for the old Web Speech API hook"). Este arquivo é a
//   extração dessa decisão para um lugar reutilizável — não uma segunda via.
//
// POR QUE NÃO PASSA PELO `provider-registry`
//   O contrato do registry é `call(messages) → texto` — raciocínio. Não há
//   superfície de áudio nele, e transcrição não é raciocínio: não decide nada,
//   só datilografa. O precedente da casa (`app/api/sdr/transcribe/route.ts`)
//   resolve a chave por `resolveProviderKey("openai")` e chama o endpoint de
//   áudio direto. Seguimos o mesmo caminho — a chave continua vindo do cofre,
//   nunca de env hardcoded (vitrine: "A chave de IA da tela é a fonte de
//   verdade").
//
// CONTRATO DE ERRO (padrão de `lib/integrations/meta/leitura.ts`)
//   NADA aqui lança. Toda saída é `{ ok:true, texto }` ou
//   `{ ok:false, motivo, mensagem }`, com a mensagem já em português e já
//   pronta para a tela. Ditado é ADVISORY: se falhar, o campo de texto continua
//   lá e o cliente digita. Nenhum caminho de falha pode impedir a decisão.
//
// PII — o texto ditado é fala do cliente e PODE conter nome, telefone e valor.
//   Ele NUNCA é logado, nem em erro. O que se registra é o `motivo`, só.

// ─── Contrato ────────────────────────────────────────────────────────────────

export type MotivoDeFalhaDeTranscricao =
  /** navegador sem MediaRecorder/getUserMedia — o botão nem aparece */
  | "sem_suporte"
  /** o usuário negou (ou o SO bloqueou) o microfone */
  | "sem_permissao"
  /** clipe curto demais para render texto — clique acidental */
  | "audio_curto"
  /** passou do teto de bytes aceito */
  | "audio_grande"
  /** corpo da requisição não trouxe um áudio */
  | "formato_invalido"
  /** nenhuma chave de transcrição configurada nas Integrações */
  | "sem_chave"
  /** token de portal inválido/expirado */
  | "acesso_negado"
  /** rate limit local */
  | "ritmo"
  /** o provedor respondeu erro */
  | "provedor_indisponivel"
  /** estourou o tempo */
  | "tempo_esgotado"
  /** falha de rede no envio */
  | "rede"
  /** transcreveu, mas veio vazio (silêncio, ruído) */
  | "sem_texto";

export interface FalhaDeTranscricao {
  ok: false;
  motivo: MotivoDeFalhaDeTranscricao;
  /** Já em português, já pronta para a tela. Nunca contém o áudio nem o texto. */
  mensagem: string;
}
export type ResultadoDeTranscricao = { ok: true; texto: string } | FalhaDeTranscricao;

const MENSAGENS: Record<MotivoDeFalhaDeTranscricao, string> = {
  sem_suporte:
    "Este navegador não grava áudio. Escreva no campo acima — funciona igual.",
  sem_permissao:
    "O microfone está bloqueado. Libere o acesso nas configurações do navegador e tente de novo — ou escreva no campo acima.",
  audio_curto:
    "Gravação curta demais. Segure o botão e fale por pelo menos um segundo.",
  audio_grande:
    "O áudio ficou longo demais. Grave em partes menores.",
  formato_invalido:
    "Não consegui ler o áudio. Tente gravar de novo.",
  sem_chave:
    "A transcrição por voz não está configurada. Escreva no campo acima — nada se perde.",
  acesso_negado:
    "Seu acesso ao portal expirou. Recarregue a página e tente de novo.",
  ritmo:
    "Muitas gravações seguidas. Aguarde alguns segundos e tente de novo.",
  provedor_indisponivel:
    "A transcrição está indisponível agora. Escreva no campo acima — nada se perde.",
  tempo_esgotado:
    "A transcrição demorou demais. Tente um áudio mais curto ou escreva no campo acima.",
  rede:
    "Falha ao enviar o áudio. Verifique a conexão e tente de novo.",
  sem_texto:
    "Não identifiquei fala no áudio. Tente gravar de novo mais perto do microfone.",
};

export function falhaDeTranscricao(motivo: MotivoDeFalhaDeTranscricao): FalhaDeTranscricao {
  return { ok: false, motivo, mensagem: MENSAGENS[motivo] };
}

// ─── Limites ─────────────────────────────────────────────────────────────────
// O teto do Whisper é 25 MB. Aqui o teto é MENOR de propósito: este campo é um
// recado de ajuste, não um podcast. Teto baixo = custo previsível e upload que
// termina no 4G do celular.

/** ~12 min de voz em Opus. Acima disto é uso indevido do campo. */
export const MAX_BYTES_DE_AUDIO = 6 * 1024 * 1024;
/** Abaixo disto é clique acidental, não fala. */
export const MIN_BYTES_DE_AUDIO = 1_200;
/** Corte automático da gravação. Não envia nada — só PARA de gravar. */
export const MAX_SEGUNDOS_DE_GRAVACAO = 180;

const TIMEOUT_PADRAO_MS = 30_000;
const URL_OPENAI = "https://api.openai.com/v1/audio/transcriptions";
/** Mesmo modelo já em uso em `app/api/sdr/transcribe` — ~US$ 0,006 por minuto. */
const MODELO_PADRAO = "whisper-1";

export function extensaoDeAudio(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mpeg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

// ─── Servidor: áudio → texto ─────────────────────────────────────────────────

export async function transcreverAudio(opts: {
  apiKey: string;
  arquivo: Blob;
  modelo?: string;
  idioma?: string;
  timeoutMs?: number;
}): Promise<ResultadoDeTranscricao> {
  const { apiKey, arquivo } = opts;

  if (!apiKey) return falhaDeTranscricao("sem_chave");
  if (arquivo.size > MAX_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_grande");
  if (arquivo.size < MIN_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_curto");

  const ext = extensaoDeAudio(arquivo.type || "audio/webm");
  const form = new FormData();
  form.append("file", arquivo, `audio.${ext}`);
  form.append("model", opts.modelo ?? MODELO_PADRAO);
  form.append("language", opts.idioma ?? "pt");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    const res = await fetch(URL_OPENAI, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Só o status entra no log. O corpo do erro do provedor pode ecoar
      // trechos do que foi dito — e isso é fala do cliente.
      console.error(`[transcricao] provedor respondeu ${res.status}`);
      return falhaDeTranscricao("provedor_indisponivel");
    }

    let texto = "";
    try {
      const data = (await res.json()) as { text?: unknown };
      texto = typeof data.text === "string" ? data.text.trim() : "";
    } catch {
      return falhaDeTranscricao("provedor_indisponivel");
    }

    if (!texto) return falhaDeTranscricao("sem_texto");
    return { ok: true, texto };
  } catch (err) {
    const abortado = err instanceof Error && err.name === "AbortError";
    console.error(`[transcricao] ${abortado ? "tempo_esgotado" : "rede"}`);
    return falhaDeTranscricao(abortado ? "tempo_esgotado" : "rede");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Navegador: suporte e envio ──────────────────────────────────────────────

/** true só quando dá para gravar DE VERDADE. Se der false, o botão de voz não
 *  deve ser renderizado — botão que não faz nada é pior que botão ausente. */
export function suportaDitado(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Mime que o aparelho realmente grava. Safari/iOS só entrega mp4/aac. */
export function mimeDeGravacaoSuportado(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported pode lançar em engines antigas */
    }
  }
  return null;
}

/** Envia o blob para uma rota de transcrição da casa. NUNCA lança. */
export async function enviarAudioParaTranscricao(
  blob: Blob,
  opts: { endpoint: string; campos?: Record<string, string>; sinal?: AbortSignal },
): Promise<ResultadoDeTranscricao> {
  if (blob.size < MIN_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_curto");
  if (blob.size > MAX_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_grande");

  const form = new FormData();
  form.append("file", blob, `audio.${extensaoDeAudio(blob.type || "audio/webm")}`);
  for (const [k, v] of Object.entries(opts.campos ?? {})) {
    if (v) form.append(k, v);
  }

  try {
    const res = await fetch(opts.endpoint, { method: "POST", body: form, signal: opts.sinal });

    let corpo: Partial<FalhaDeTranscricao> & { texto?: unknown } = {};
    try {
      corpo = (await res.json()) as typeof corpo;
    } catch {
      return falhaDeTranscricao(res.ok ? "provedor_indisponivel" : "rede");
    }

    if (corpo.ok === false || !res.ok) {
      const motivo = corpo.motivo;
      return falhaDeTranscricao(
        motivo && motivo in MENSAGENS ? motivo : res.status === 429 ? "ritmo" : "provedor_indisponivel",
      );
    }

    const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
    if (!texto) return falhaDeTranscricao("sem_texto");
    return { ok: true, texto };
  } catch {
    return falhaDeTranscricao("rede");
  }
}

/** Cola a transcrição no que já está escrito, sem comer o texto do usuário nem
 *  grudar palavras. É por isso que ditar é ADITIVO: nada é sobrescrito. */
export function juntarTranscricao(atual: string, novo: string): string {
  const base = atual.trimEnd();
  const adicao = novo.trim();
  if (!adicao) return atual;
  if (!base) return adicao;
  return `${base} ${adicao}`;
}
