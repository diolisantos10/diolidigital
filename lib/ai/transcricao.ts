// transcricao.ts — ditado por voz: áudio → texto. ISOMÓRFICO (server + client).
//
// Existe por pedido do CEO (05/08/2026): "na parte da devolutiva lá na
// aprovação, eu gostaria que tivesse essa ferramenta de áudio que transcreve,
// eu não gosto de digitar". O alvo é o campo de "solicitar ajustes" e "tenho
// uma dúvida" no portal do cliente.
//
// ESTE É O CAMINHO 2, NÃO O ÚNICO (06/08/2026)
//   Gravar e enviar para um provedor pago é a REDE, não a rua principal. A rua
//   principal é `lib/ai/ditado-nativo.ts` — o `SpeechRecognition` do próprio
//   navegador: grátis, sem chave, e o áudio nem sai do aparelho. Aqui só cai
//   quem não tem reconhecimento nativo.
//
//   O comentário que ficava neste lugar defendia o contrário ("servidor, e não
//   SpeechRecognition") pelos motivos certos: no Safari o nativo é
//   `webkitSpeechRecognition`, exige gesto do usuário e corta no silêncio. O
//   erro não foi preferir o servidor — foi ter SÓ o servidor. Em 06/08/2026 a
//   conta do provedor ficou sem crédito e o microfone morreu para o dono e para
//   todo cliente pagante. Um campo de texto não pode depender de saldo.
//
// PROVEDOR É SUBSTITUÍVEL — e isso é mecanismo, não intenção
//   Até 06/08/2026 este arquivo falava DIRETO com `api.openai.com`: uma conta
//   sem saldo = ditado morto, sem rota de fuga. Agora existe `MotorDeTranscricao`
//   (openai · groq · gemini) e o servidor tenta os configurados EM CADEIA
//   (`lib/ai/transcricao-servidor.ts`). Nenhum configurado = o caminho 2 não
//   existe, e a tela DIZ isso — nunca finge.
//
// POR QUE NÃO PASSA PELO `provider-registry`
//   O contrato do registry é `call(messages) → texto` — raciocínio. Não há
//   superfície de áudio nele, e transcrição não é raciocínio: não decide nada,
//   só datilografa. A chave continua vindo do cofre pelo `resolveProviderKey`,
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
  /** o navegador TEM gravador, mas ele recusou começar (contêiner que a engine
   *  não escreve, microfone tomado por outro app, aba em segundo plano). É
   *  falha do APARELHO, não de permissão — e dizer "verifique a permissão" aqui
   *  manda o usuário mexer onde não é. Ver `mimeDeGravacaoSuportado`. */
  | "gravacao_falhou"
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
  /** existe chave e o provedor a RECUSOU (401/403): inválida, revogada, sem
   *  saldo ou sem permissão de áudio. É configuração da agência, não do cliente
   *  — e era o caso que mais se disfarçava de "indisponível". */
  | "chave_recusada"
  /** a chave é VÁLIDA e a conta do provedor está SEM CRÉDITO. Não é ritmo (não
   *  passa esperando) e não é chave errada (não passa trocando a chave): passa
   *  quando alguém põe saldo. Ver `classificarFalhaDoProvedor`. */
  | "sem_saldo"
  /** o provedor recusou o ARQUIVO (400/415/422): formato, codec ou tamanho */
  | "audio_recusado"
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
  gravacao_falhou:
    "Não consegui iniciar a gravação neste aparelho. Feche outros apps que usem o microfone e tente de novo — ou escreva no campo acima.",
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
  chave_recusada:
    "A transcrição por voz está com um problema de configuração do nosso lado. Escreva no campo acima — nada se perde, e já fomos avisados.",
  sem_saldo:
    "A transcrição por voz está temporariamente fora do ar por uma pendência da nossa conta. Escreva no campo acima — nada se perde, e já fomos avisados.",
  audio_recusado:
    "Não consegui processar este áudio. Grave de novo, de preferência mais curto — ou escreva no campo acima.",
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
/**
 * Abaixo disto é clique acidental, não fala.
 *
 * CONFERIDO CONTRA O AAC DO iPHONE (06/08/2026), porque um piso calibrado para
 * Opus recusaria áudio legítimo do aparelho do dono. A conta é a favor, e com
 * folga grande: o AAC que o WebKit grava fica na faixa de 64–128 kbps, ou seja
 * **8–16 KB por segundo de fala** — um segundo de iPhone é 7 a 13 vezes este
 * piso. O Opus do Chrome é que é o formato apertado (24–64 kbps, ~3–8 KB/s), e
 * mesmo ele passa folgado. 1.200 bytes pega o que se quer pegar: o toque
 * acidental, que não chega a um décimo de segundo de som.
 *
 * A direção do erro também importa: piso ALTO recusa a fala do cliente pagante
 * com a frase errada ("curto demais") quando o problema é outro. Por isso ele
 * fica onde está e a checagem de formato acontece antes, no aparelho.
 */
export const MIN_BYTES_DE_AUDIO = 1_200;
/**
 * Corte automático da gravação. Não envia nada — só PARA de gravar.
 *
 * ⚠️ ESTE CORTE É DO NAVEGADOR, E SÓ DELE. Dito com todas as letras porque a
 * confusão aqui seria cara: um POST direto na rota, sem passar pela tela, pode
 * mandar 12 minutos de áudio dentro dos 6 MB e ninguém barra por DURAÇÃO.
 *
 * DECISÃO (05/08/2026, auditoria 7): **o teto de BYTES é a trava; duração não
 * vira trava de servidor.** Os porquês, na ordem que importa:
 *   • Ele é mecanismo, não aviso: `transcreverAudio` recusa acima de
 *     `MAX_BYTES_DE_AUDIO` ANTES de tocar na chave, e a rota recusa antes dele.
 *   • Custo é proporcional à duração, e bytes limitam a duração. Whisper cobra
 *     ~US$ 0,006/min; o pior caso real de 6 MB é áudio muito comprimido
 *     (~24 kbps) ≈ 33 min ≈ US$ 0,20 por requisição — com o balde de 15/min por
 *     IP, um teto de gasto que a agência aguenta, não um ralo aberto.
 *   • Medir duração no servidor exigiria DECODIFICAR o contêiner (webm/ogg/mp4,
 *     cada um com seu jeito de guardar — e nenhum obrigado a declarar duração
 *     no cabeçalho). Ou entra dependência nativa no build do Railway, ou entra
 *     um parser caseiro que erra: e um parser que erra REJEITA ÁUDIO LEGÍTIMO
 *     do cliente. Trocar um teto que funciona por uma trava que às vezes
 *     recusa a fala do cliente pagante é piorar.
 * Se um dia a fatura mostrar abuso por duração, o conserto barato é BAIXAR
 * `MAX_BYTES_DE_AUDIO` — mesmo mecanismo, número menor.
 */
export const MAX_SEGUNDOS_DE_GRAVACAO = 180;

const TIMEOUT_PADRAO_MS = 30_000;
const URL_OPENAI = "https://api.openai.com/v1/audio/transcriptions";
/** Mesmo modelo já em uso em `app/api/sdr/transcribe` — ~US$ 0,006 por minuto. */
const MODELO_PADRAO = "whisper-1";
/** Groq serve Whisper por uma API compatível com a da OpenAI — mesmo corpo,
 *  outra URL. É por isso que ele custa dez linhas aqui e não um arquivo novo. */
const URL_GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODELO_GROQ = "whisper-large-v3-turbo";
const MODELO_GEMINI = "gemini-2.0-flash";
function urlGemini(modelo: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
}

/**
 * O que a casa MANDA para cada motor, e por que MP4 do iPhone chega inteiro.
 *
 * Conferido na documentação oficial em 06/08/2026 (não de memória):
 *   • OpenAI Whisper — aceita `mp4` e `m4a` na lista de formatos. Quem decide é
 *     a EXTENSÃO do arquivo no multipart, e é isso que `extensaoDeAudio` monta.
 *   • Groq — mesma API, mesma lista (mp4/m4a inclusos).
 *   • Gemini — `ai.google.dev/gemini-api/docs/audio`, seção "Supported audio
 *     formats": wav · mp3 · aiff · **aac** · ogg · flac. **MP4 não está na
 *     lista** (WebM também não). Mandar um mime que a documentação não promete é
 *     torcer para o servidor adivinhar.
 *
 * Por isso, e SÓ para o Gemini, o contêiner MP4 é anunciado pelo codec que ele
 * de fato carrega: **AAC**. É a etiqueta documentada mais próxima da verdade do
 * arquivo — não é chute, é dizer o que tem dentro. Os demais mimes passam
 * intactos de propósito: WebM/Opus é o que já roda em produção hoje e trocar a
 * etiqueta dele seria apostar em cima do que funciona.
 *
 * E a rede embaixo disso continua valendo: o Gemini é o ÚLTIMO da cadeia
 * (`transcricao-servidor.ts`), e `audio_recusado` passa para o próximo motor.
 */
export function mimeParaGemini(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a")) return "audio/aac";
  return mime || "audio/webm";
}

export function extensaoDeAudio(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mpeg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

// ─── Leitura do erro do provedor ─────────────────────────────────────────────

/**
 * Status HTTP do provedor → motivo da casa.
 *
 * Sem esta tabela, quatro problemas com quatro consertos diferentes chegavam à
 * tela como a mesma frase — e o operador não tinha por onde começar:
 *
 *   401/403 → chave inválida, revogada ou sem permissão  → mexer nas Integrações
 *   402     → sem saldo na conta do provedor             → pagar
 *   429     → teto do provedor                           → esperar
 *   4xx     → o provedor recusou o ARQUIVO               → regravar
 *   5xx     → o provedor caiu                            → esperar
 *
 * Note que `chave_recusada` NÃO vira `sem_chave`: "não configurado" e
 * "configurado e recusado" pedem ações opostas, e trocar um pelo outro manda o
 * operador procurar uma chave que já está lá.
 *
 * ─── 06/08/2026 — POR QUE O STATUS SOZINHO AINDA MENTIA ─────────────────────
 * O log de produção do deploy c98d8f88 trouxe a linha inteira:
 *
 *     [transcricao] provedor respondeu 429 · code=credit_balance_exhausted
 *                                            type=insufficient_quota
 *
 * A chave está lá e é válida; a CONTA está sem crédito. A OpenAI devolve isso
 * como **429**, o MESMO status do teto por minuto — está na documentação dela,
 * com todas as letras: "429 insufficient_quota — You exceeded your current
 * quota, please check your plan and billing details".
 *
 * Só pelo status, o cliente do CEO lia "Muitas gravações seguidas. Aguarde
 * alguns segundos" para um problema que **nenhuma espera resolve**. É a mesma
 * família de defeito de `provedor_indisponivel`: uma palavra cobrindo dois
 * consertos opostos — só que esta manda o operador esperar para sempre.
 *
 * Por isso a classificação lê `code`/`type` quando eles existem. Os dois são
 * enum fechado do provedor (não texto livre), então a regra de PII continua
 * inteira. Sem corpo legível, 429 volta a ser `ritmo` — o palpite certo quando
 * não há informação, e ausência de informação não vira informação.
 */
const CODIGOS_DE_SEM_SALDO = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "billing_hard_limit_reached",
  "account_deactivated",
]);

export function classificarFalhaDoProvedor(
  status: number,
  diag?: { code?: string; type?: string } | null,
): MotivoDeFalhaDeTranscricao {
  const semSaldo =
    (diag?.code && CODIGOS_DE_SEM_SALDO.has(diag.code)) ||
    (diag?.type && CODIGOS_DE_SEM_SALDO.has(diag.type));
  if (semSaldo) return "sem_saldo";

  if (status === 401 || status === 403 || status === 402) return "chave_recusada";
  if (status === 429) return "ritmo";
  if (status === 413) return "audio_grande";
  if (status >= 400 && status < 500) return "audio_recusado";
  return "provedor_indisponivel";
}

/**
 * Extrai SÓ `code` e `type` do corpo de erro. Nunca `message`, nunca o corpo.
 *
 * Os dois são identificadores fechados do provedor. `message` é texto livre e
 * pode conter eco do que foi enviado — e o que foi enviado é a fala do cliente.
 * Nunca lança: falhar ao ler um erro não pode virar um segundo erro.
 */
export async function codigoDeErroDoProvedor(
  res: Response,
): Promise<{ code?: string; type?: string } | null> {
  try {
    const corpo = (await res.clone().json()) as { error?: { code?: unknown; type?: unknown } };
    const code = typeof corpo.error?.code === "string" ? corpo.error.code : undefined;
    const type = typeof corpo.error?.type === "string" ? corpo.error.type : undefined;
    return code || type ? { code, type } : null;
  } catch {
    return null;
  }
}

// ─── Servidor: áudio → texto ─────────────────────────────────────────────────

/**
 * Os provedores que a casa sabe usar para transcrever.
 *
 * `openai` e `groq` servem o MESMO Whisper por APIs compatíveis; `gemini` é
 * outro desenho (multimodal, o áudio vai embutido no prompt). Nenhum deles é
 * obrigatório: quem decide quais existem é a chave configurada — ver
 * `lib/ai/transcricao-servidor.ts`.
 */
export type ProvedorDeTranscricao = "openai" | "groq" | "gemini";

export const PROVEDORES_DE_TRANSCRICAO: ProvedorDeTranscricao[] = ["openai", "groq", "gemini"];

export function ehProvedorDeTranscricao(v: string): v is ProvedorDeTranscricao {
  return (PROVEDORES_DE_TRANSCRICAO as string[]).includes(v);
}

export interface OpcoesDeTranscricao {
  apiKey: string;
  arquivo: Blob;
  /** Qual motor usar. Ausente = `openai` (compatibilidade com o chamador antigo). */
  provedor?: ProvedorDeTranscricao;
  modelo?: string;
  idioma?: string;
  timeoutMs?: number;
}

/**
 * Porta de entrada única. Valida o que é da CASA (chave, tamanho) antes de
 * qualquer motor — a trava de bytes continua acontecendo ANTES de tocar na
 * chave, como documentado em `MAX_SEGUNDOS_DE_GRAVACAO`.
 */
export async function transcreverAudio(opts: OpcoesDeTranscricao): Promise<ResultadoDeTranscricao> {
  const { apiKey, arquivo } = opts;

  if (!apiKey) return falhaDeTranscricao("sem_chave");
  if (arquivo.size > MAX_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_grande");
  if (arquivo.size < MIN_BYTES_DE_AUDIO) return falhaDeTranscricao("audio_curto");

  switch (opts.provedor ?? "openai") {
    case "gemini":
      return transcreverComGemini(opts);
    case "groq":
      return transcreverCompativelComOpenAI(opts, URL_GROQ, MODELO_GROQ, "groq");
    default:
      return transcreverCompativelComOpenAI(opts, URL_OPENAI, MODELO_PADRAO, "openai");
  }
}

/** OpenAI e Groq: mesmo multipart, mesmo formato de erro, URLs diferentes. */
async function transcreverCompativelComOpenAI(
  opts: OpcoesDeTranscricao,
  url: string,
  modeloPadrao: string,
  etiqueta: string,
): Promise<ResultadoDeTranscricao> {
  const { apiKey, arquivo } = opts;

  const ext = extensaoDeAudio(arquivo.type || "audio/webm");
  const form = new FormData();
  form.append("file", arquivo, `audio.${ext}`);
  form.append("model", opts.modelo ?? modeloPadrao);
  form.append("language", opts.idioma ?? "pt");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      // ── 06/08/2026 — POR QUE ISTO DEIXOU DE SER UM MOTIVO SÓ ──────────────
      // Bug reproduzido em produção: o microfone do portal devolvia
      // `provedor_indisponivel` com áudio válido e chave presente. E era
      // impossível avançar: chave inválida, saldo zerado, formato recusado e
      // provedor fora do ar chegavam TODOS aqui, com a mesma palavra e uma
      // linha de log que só dizia o número. Diagnóstico não pode depender de
      // adivinhação — a resposta certa para "qual é o erro?" nunca é "algum".
      //
      // O que entra no log agora: status + `error.code`/`error.type`. Esses
      // dois são ENUM do provedor (`invalid_api_key`, `insufficient_quota`,
      // `invalid_request_error`), nunca texto livre — a regra de PII continua
      // inteira: `error.message` e o corpo NÃO são logados, porque a mensagem
      // do provedor pode ecoar trechos do que foi dito.
      const diag = await codigoDeErroDoProvedor(res);
      console.error(
        `[transcricao:${etiqueta}] provedor respondeu ${res.status}` +
          (diag ? ` · code=${diag.code ?? "-"} type=${diag.type ?? "-"}` : ""),
      );
      return falhaDeTranscricao(classificarFalhaDoProvedor(res.status, diag));
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
    console.error(`[transcricao:${etiqueta}] ${abortado ? "tempo_esgotado" : "rede"}`);
    return falhaDeTranscricao(abortado ? "tempo_esgotado" : "rede");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini: outro desenho, mesmo contrato ───────────────────────────────────
// O Gemini não tem endpoint de transcrição: o áudio entra EMBUTIDO no prompt de
// um modelo multimodal. Por isso ele é o único motor com instrução em texto — e
// a instrução é deliberadamente pobre: "escreva o que ouviu, e nada mais". O
// campo é um recado do cliente; um modelo que resume ou corrige estaria pondo
// palavra na boca de quem paga.

const INSTRUCAO_GEMINI =
  "Transcreva literalmente a fala deste áudio em português do Brasil. " +
  "Responda apenas com o texto transcrito, sem aspas, sem resumo, sem comentário. " +
  "Se não houver fala, responda com uma linha vazia.";

function paraBase64(bytes: ArrayBuffer): string {
  const g = globalThis as { Buffer?: { from(b: ArrayBuffer): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) {
    bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * Erro do Gemini → motivo da casa.
 *
 * O corpo é `{ error: { code:number, status:"RESOURCE_EXHAUSTED", ... } }` — o
 * `status` é enum fechado (como `code`/`type` na OpenAI), então continua valendo
 * a regra de PII: `message` nunca é lido nem logado.
 */
export function classificarFalhaDoGemini(
  status: number,
  googleStatus?: string | null,
): MotivoDeFalhaDeTranscricao {
  if (googleStatus === "PERMISSION_DENIED" || googleStatus === "UNAUTHENTICATED") return "chave_recusada";
  if (googleStatus === "RESOURCE_EXHAUSTED") return "ritmo";
  if (status === 401 || status === 403) return "chave_recusada";
  if (status === 429) return "ritmo";
  if (status === 413) return "audio_grande";
  if (status >= 400 && status < 500) return "audio_recusado";
  return "provedor_indisponivel";
}

async function statusDoGemini(res: Response): Promise<string | null> {
  try {
    const corpo = (await res.clone().json()) as { error?: { status?: unknown } };
    return typeof corpo.error?.status === "string" ? corpo.error.status : null;
  } catch {
    return null;
  }
}

async function transcreverComGemini(opts: OpcoesDeTranscricao): Promise<ResultadoDeTranscricao> {
  const { apiKey, arquivo } = opts;
  const modelo = opts.modelo?.startsWith("gemini") ? opts.modelo : MODELO_GEMINI;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    const base64 = paraBase64(await arquivo.arrayBuffer());
    const res = await fetch(urlGemini(modelo), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: INSTRUCAO_GEMINI },
              { inline_data: { mime_type: mimeParaGemini(arquivo.type), data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const gstatus = await statusDoGemini(res);
      console.error(`[transcricao:gemini] provedor respondeu ${res.status} · status=${gstatus ?? "-"}`);
      return falhaDeTranscricao(classificarFalhaDoGemini(res.status, gstatus));
    }

    let texto = "";
    try {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: unknown }[] } }[];
      };
      texto = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join(" ")
        .trim();
    } catch {
      return falhaDeTranscricao("provedor_indisponivel");
    }

    if (!texto) return falhaDeTranscricao("sem_texto");
    return { ok: true, texto };
  } catch (err) {
    const abortado = err instanceof Error && err.name === "AbortError";
    console.error(`[transcricao:gemini] ${abortado ? "tempo_esgotado" : "rede"}`);
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

/**
 * NO iPHONE, TODO NAVEGADOR É WebKit — inclusive o Chrome.
 *
 * A App Store obriga: Chrome (`CriOS`), Edge (`EdgiOS`) e Firefox (`FxiOS`) no
 * iOS são casca em cima do WebKit do sistema. Consequência direta e cara para
 * esta casa: **o `SpeechRecognition` nativo não existe no Chrome do iPhone** —
 * ele é exposto só pelo Safari — então o caminho 2 (gravar e enviar) é a RUA
 * PRINCIPAL para a maioria dos nossos usuários, não a rede de segurança.
 *
 * Isto é *sniffing* de UA, e sniffing é presunção. Por isso ele não decide
 * SUPORTE (isso continua sendo `MediaRecorder.isTypeSupported`, medido) —
 * decide só PREFERÊNCIA de contêiner entre formatos que a engine já disse que
 * aceita. Presumir preferência erra num formato pior; presumir suporte
 * derrubaria a gravação.
 *
 * O iPad a partir do iPadOS 13 se anuncia como "Macintosh": o desempate é o
 * toque, que Mac de verdade não tem.
 */
export function ehWebKitDeIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Mime que o aparelho realmente grava — ou `null` para "deixe o navegador
 * escolher o padrão dele".
 *
 * ─── 06/08/2026 · POR QUE A ORDEM DEIXOU DE SER FIXA ─────────────────────────
 * A lista era `webm;codecs=opus → webm → mp4 → ogg`, igual para todo mundo. No
 * WebKit isso é pedir o contêiner errado para a engine errada: quem escreve o
 * arquivo lá é o AVAssetWriter, cujo caminho testado, acelerado por hardware e
 * de dez anos de estrada é **MP4/AAC**. WebM no WebKit é adição recente e vem
 * atrás de um feature flag (`MediaRecorderPrivateAVFImpl::isTypeSupported`,
 * ramo `ENABLE(MEDIA_RECORDER_WEBM)` — fonte: WebKit/WebKit, `Source/WebCore/
 * platform/mediarecorder/MediaRecorderPrivateAVFImpl.cpp`, lido em 06/08/2026).
 *
 * O QUE FOI MEDIDO, E O QUE NÃO FOI — porque a diferença muda a conclusão:
 *   • flag DESLIGADA → `isTypeSupported("audio/webm")` é `false`. Emulado no
 *     Chromium com as regras do WebKit (06/08/2026): o código antigo do hook
 *     caía no `{}` e o aparelho gravava MP4 sozinho. **Não houve quebra.** A
 *     suspeita de `NotSupportedError` no construtor NÃO se confirmou, e não
 *     podia mesmo: `MediaRecorder::create` chama o MESMO `isTypeSupported`
 *     (MediaRecorder.cpp:84), então "reportado como suportado" e "aceito pelo
 *     construtor" nunca divergem.
 *   • flag LIGADA → aí sim o código antigo pedia `audio/webm` explicitamente, e
 *     gravávamos WebM num escritor cujo caminho de casa é MP4: trocando o
 *     formato provado, acelerado por hardware, pelo formato novo — de graça.
 * A troca vale por isso, não por um crash: é preferir o caminho que a engine
 * anda melhor. O construtor sem `try` continuava sendo dívida, e virou `try`.
 *
 * Agora a preferência acompanha a engine, e a decisão final continua sendo da
 * medição: só entra o que `isTypeSupported` confirmar. Nada confirmado devolve
 * `null`, e `null` NÃO é erro — é "não passe `mimeType`", que pela especificação
 * faz o navegador usar o padrão dele (mp4/aac no iPhone, webm/opus no Chrome de
 * desktop). O palpite mais seguro sobre o formato de um aparelho é o do próprio
 * aparelho.
 *
 * Os três motores da casa aceitam os dois contêineres — ver `extensaoDeAudio` e
 * `mimeParaGemini`.
 */
export function mimeDeGravacaoSuportado(): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  const aceita = (m: string): boolean => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      /* isTypeSupported pode lançar em engines antigas */
      return false;
    }
  };

  const preferencia = ehWebKitDeIOS()
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

  for (const m of preferencia) if (aceita(m)) return m;
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

    // `texto` é o contrato desta casa; `text` é o que `/api/sdr/transcribe`
    // devolve desde antes deste arquivo existir. Ler os dois é o que permitiu o
    // briefing público parar de ter uma SEGUNDA implementação de envio dentro
    // do hook — e foi a cópia divergente que deixou o iPhone falhar calado.
    let corpo: Partial<FalhaDeTranscricao> & { texto?: unknown; text?: unknown } = {};
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

    const bruto = typeof corpo.texto === "string" ? corpo.texto : corpo.text;
    const texto = typeof bruto === "string" ? bruto.trim() : "";
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
