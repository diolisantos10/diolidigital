// ─── Dioli Design Engine ──────────────────────────────────────────────────────
// SERVER-ONLY. The single, official image/design generator for the whole
// platform — internal assets AND client deliverables. Powered by OpenAI's
// image models (GPT image), because Claude does not generate images.
//
// Resolution order for the key: Integrations UI (encrypted DB) → OPENAI_API_KEY.
// Model preference: gpt-image-1 (current, best quality) with an automatic
// fallback to dall-e-3 when the account has no access to gpt-image-1.
//
// ─── O LIVRO-CAIXA (24/08/2026) ──────────────────────────────────────────────
//
// Medido em produção no case Farol 27: as 47 chamadas de TEXTO daquela rodada
// foram contabilizadas (US$ 0,53) e as de IMAGEM, nenhuma — este arquivo era o
// único motor pago da casa que não escrevia uma linha no `AIRunLog`. O efeito é
// duplo e nos dois sentidos ruim: o relatório de custo contava uma história mais
// barata que a fatura, e o TETO por workspace (`lib/ai/teto-de-custo.ts`), que
// soma exatamente aquela tabela, não enxergava o item MAIS CARO da casa
// (~US$ 0,17–0,25 por imagem, contra frações de centavo por texto).
//
// A gravação mora AQUI, dentro do motor, e não em cada chamador: são quatro
// (`artes.ts` em dois pontos, `logo.ts` e a tela manual `/api/generate-image`),
// e um quinto vai nascer. Contabilidade repetida por chamador é a doença que
// esta casa já pagou — quem lembrasse do `workspaceId` esqueceria do resto.
//
// Regra herdada de `registro-de-custo.ts` e não afrouxada: **fail-open, nunca
// fail-silencioso.** Falhar ao gravar a linha não pode derrubar a entrega da
// peça; falhar em silêncio faria o relatório mentir sem testemunha.
//
// Always returns a renderable `url`: a hosted URL (dall-e-3) or a base64 data
// URL (gpt-image-1), so every consumer can render it the same way.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveProviderKey } from "./resolve-key";
import { registrarChamadaDeIa } from "@/lib/ai/registro-de-custo";
import type { TamanhoDeImagem } from "@/lib/ai/precos";
import { classificarFalhaDeProvedor, ROTULO_DA_FALHA, type MotivoDaFalha } from "@/lib/ai/falha-de-provedor";

const IMAGES_URL = "https://api.openai.com/v1/images/generations";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ═════════════════════════════════════════════════════════════════════════════
// A FILA DE ESCORREGAMENTO DA IMAGEM (26/08/2026, ordem do CEO)
// ═════════════════════════════════════════════════════════════════════════════
//
// ── O que produziu esta fila ────────────────────────────────────────────────
//
// Até aqui **só a OpenAI gerava arte**. Ela cair ou ficar sem saldo parava a
// produção da casa INTEIRA — foi o que derrubou Design para 3 e deixou oito
// departamentos sem nota. O texto, na mesma volta, não parou: a fila de
// `lib/ai/generate.ts` escorregou para o Gemini e o cliente foi atendido.
//
// A arte passa a ter a MESMA disciplina, e de propósito a mesma gramática:
// tenta um produtor; **sem saldo, 429, resposta vazia, JSON/imagem inválida,
// timeout ou 5xx → escorrega para o próximo.**
//
// ── A EXCEÇÃO QUE NÃO É DETALHE: FALTA DE CHAVE NÃO ESCORREGA ───────────────
//
// Chave ausente ou inválida é CONFIGURAÇÃO — alguém conecta e volta. Escorregar
// por cima dela é a casa trocar de produtor em silêncio por um problema que uma
// pessoa resolve em um minuto, e depois ninguém saber que a chave está errada
// porque nada nunca falhou. Aqui, `sem_chave` PARA a fila, com dono e próxima
// ação. É a diferença entre "o provedor está fora" e "nós configuramos errado".
//
// (Um produtor que simplesmente não tem chave configurada não entra na fila —
// isso não é falha, é ausência. O que para é a chave que EXISTE e é recusada,
// e a fila vazia inteira.)
//
// ── OS DOIS FREIOS QUE VÊM JUNTO, E NENHUM É OPCIONAL ──────────────────────
//
//   • **Fundo diferente é peça diferente.** As réguas de peça (portão de fundo,
//     régua da peça final, contraste) rodam sobre os BYTES, depois deste
//     arquivo, e não perguntam quem produziu. Nada aqui as afrouxa por
//     provedor — provado em `__tests__/design/a-fila-da-imagem.test.ts`.
//   • **Fila esgotada para com o MOTIVO CERTO.** Se todos caírem, o erro que
//     sobe é o mais grave da fila, com o rótulo da casa (`SEM SALDO na conta do
//     provedor…`), nunca "não consegui gerar a tela 1 de 4". Status de erro não
//     é motivo.

/** Quem sabe produzir imagem nesta casa. Ordem = ranking de qualidade. */
export type ProdutorDeImagem = "openai" | "gemini";

const ORDEM_BASE: ProdutorDeImagem[] = ["openai", "gemini"];

function ehProdutorDeImagem(v: string): v is ProdutorDeImagem {
  return v === "openai" || v === "gemini";
}

/**
 * A ordem dos produtores de imagem. `BRAIN_IMAGE_PROVIDER` põe um na frente —
 * nunca REMOVE os outros, pelo mesmo motivo da fila do texto: escolher o
 * preferido não é desligar a reserva.
 *
 * FUNÇÃO, não constante de módulo: como constante a env seria lida uma vez no
 * import e trocá-la no Railway não surtiria efeito até o processo reiniciar —
 * a lição já escrita em `modeloPadrao` de `generate.ts`.
 */
export function ordemDosProdutoresDeImagem(): ProdutorDeImagem[] {
  const env = (process.env.BRAIN_IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (ehProdutorDeImagem(env)) return [env, ...ORDEM_BASE.filter((p) => p !== env)];
  return ORDEM_BASE;
}

/**
 * Este motivo faz a fila ESCORREGAR para o próximo produtor?
 *
 * A régua é a irmã de `isTransientError` (`generate.ts`) e a lista é a da ordem
 * do CEO: sem saldo, teto de ritmo (429), indisponível (5xx/timeout/rede) e a
 * resposta que não veio ou não é imagem. `sem_chave` é o único que NÃO
 * escorrega — ver o bloco acima.
 *
 * `null` (motivo não reconhecido) escorrega: quem não sabe o que aconteceu com
 * o produtor A não tem argumento para negar o produtor B ao cliente. O risco
 * dos dois lados é assimétrico — errar escorregando custa uma chamada; errar
 * parando custa a peça.
 */
export function escorregaParaOProximo(motivo: MotivoDaFalha | null): boolean {
  return motivo !== "sem_chave";
}

/** Qual das falhas da fila é a que a casa CONTA quando todas caem. Sem saldo
 *  primeiro: é a única que nenhuma pessoa resolve em código, e é a que tem de
 *  chegar ao CEO. */
const GRAVIDADE: MotivoDaFalha[] = ["sem_saldo", "sem_chave", "indisponivel", "teto_de_ritmo"];

function aPiorFalha(falhas: readonly QuedaDeProdutor[]): QuedaDeProdutor | null {
  for (const m of GRAVIDADE) {
    const achou = falhas.find((f) => f.motivo === m);
    if (achou) return achou;
  }
  return falhas[0] ?? null;
}

/** Uma queda de produtor na fila — o que ele era, o que disse e como a casa
 *  classificou. É o que vira o motivo final quando a fila esgota. */
export interface QuedaDeProdutor {
  produtor: ProdutorDeImagem;
  motivo: MotivoDaFalha | null;
  erro: string;
}

/**
 * A frase que sobe quando a fila INTEIRA cai — com o motivo real, o dono e a
 * próxima ação. Nunca "não consegui gerar": status de erro não é motivo.
 */
export function motivoDaFilaEsgotada(quedas: readonly QuedaDeProdutor[]): string {
  if (quedas.length === 0) {
    return "nenhum produtor de imagem está conectado. Dono: CEO. " +
      "Próxima ação: conectar uma chave de imagem (OpenAI ou Gemini) em Integrações → IAs.";
  }
  const pior = aPiorFalha(quedas)!;
  const rotulo = pior.motivo ? ROTULO_DA_FALHA[pior.motivo] : pior.erro;
  const quem = quedas.map((q) => q.produtor).join(" → ");
  const acao =
    pior.motivo === "sem_saldo"
      ? "Dono: CEO. Próxima ação: pôr crédito na conta do provedor — nenhuma pessoa da equipe resolve isto em código."
      : pior.motivo === "sem_chave"
      ? "Dono: CEO. Próxima ação: conferir a chave em Integrações → IAs."
      : "Dono: Operações. Próxima ação: tentar de novo na próxima rodada; se insistir, é notícia.";
  return `a fila de imagem caiu inteira (${quem}): ${rotulo}. ${acao}`;
}

export type DesignSize = "square" | "portrait" | "landscape";
export type DesignQuality = "standard" | "high";

/**
 * A QUEM ESTA IMAGEM É COBRADA. Tudo opcional — a linha do livro-caixa sai com
 * o que houver, e `departmentId` cai em `"design"` porque é o departamento que
 * este motor É. Um campo ausente vira `null` na linha, nunca um palpite: gasto
 * atribuído ao cliente errado é pior que gasto sem cliente.
 */
export interface ContaDaImagem {
  departmentId?: string;
  agentId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

export interface DesignRequest {
  prompt: string;
  size?: DesignSize;
  quality?: DesignQuality;
  /** Sem ele NÃO há a quem cobrar: a linha não é gravada e o aviso sobe no log.
   *  Mesma regra de `lib/ai/generate.ts` — ver `registrarNoLivroCaixa`. */
  workspaceId?: string;
  /** Ver `ContaDaImagem`. */
  conta?: ContaDaImagem;
}

export interface DesignResult {
  ok: boolean;
  url?: string;          // hosted URL or base64 data URL — always renderable
  /** QUEM produziu — o produtor da fila, não o modelo. Freio 3 da ordem do
   *  CEO: é ele que vai para o carimbo do arquivo (`produtorDaPeca`). */
  provider?: ProdutorDeImagem;
  model?: string;        // which model actually produced it
  revisedPrompt?: string; // model's rewritten prompt (dall-e-3 returns this)
  error?: string;
  reason?: "not_configured" | "provider_error" | "timeout" | "network_error" | "bad_request";
  /** Cada produtor que caiu nesta chamada, na ordem. Vazio = ninguém caiu (ou
   *  ninguém foi tentado). É a prova por trás da frase de `motivoDaFilaEsgotada`. */
  quedas?: QuedaDeProdutor[];
}

// Map our friendly sizes to each model's accepted dimensions.
const SIZE_GPT: Record<DesignSize, string> = {
  square:    "1024x1024",
  portrait:  "1024x1536",
  landscape: "1536x1024",
};
const SIZE_DALLE: Record<DesignSize, string> = {
  square:    "1024x1024",
  portrait:  "1024x1792",
  landscape: "1792x1024",
};

const TIMEOUT_MS = 90_000;

/**
 * Gera UMA peça de arte, andando a fila de produtores.
 *
 * Ver o bloco "A FILA DE ESCORREGAMENTO DA IMAGEM", no topo do arquivo, para o
 * porquê de cada regra. O resumo do caminho:
 *
 *   1. produtor sem chave configurada NÃO entra na fila (ausência não é falha);
 *   2. fila vazia → para, com dono e próxima ação;
 *   3. o primeiro produtor com chave tenta. Deu certo, acabou;
 *   4. falhou → classifica. `sem_chave` PARA a fila; qualquer outro motivo
 *      escorrega para o próximo;
 *   5. fila esgotada → para com o motivo MAIS GRAVE dos que caíram, no rótulo
 *      da casa.
 */
export async function generateDesign(req: DesignRequest): Promise<DesignResult> {
  const prompt = (req.prompt ?? "").trim();
  if (!prompt) {
    return { ok: false, reason: "bad_request", error: "Prompt vazio." };
  }

  const size = req.size ?? "square";
  const quality = req.quality ?? "high";
  const quedas: QuedaDeProdutor[] = [];

  for (const produtor of ordemDosProdutoresDeImagem()) {
    const resolved = await resolveProviderKey(produtor, req.workspaceId);
    // Ausência de chave é ausência, não queda: o produtor simplesmente não está
    // nesta casa. Contá-la como falha faria a frase final acusar um provedor
    // que ninguém pediu.
    if (!resolved) continue;

    const r =
      produtor === "openai"
        ? await produzirPelaOpenAi(req, resolved.apiKey, size, quality)
        // `quedas` entra aqui para o livro-caixa saber se ALGUÉM caiu antes —
        // ver o bloco em `produzirPeloGemini`.
        : await produzirPeloGemini(req, resolved.apiKey, size, quality, quedas);

    if (r.ok) return r;

    const motivo = classificarFalhaDeProvedor(r.error);
    quedas.push({ produtor, motivo, erro: r.error ?? "" });

    // `bad_request` é problema NOSSO (prompt recusado pelo provedor por
    // conteúdo, tamanho inválido). Escorregar levaria o mesmo pedido ruim ao
    // produtor seguinte e gastaria de novo para ouvir a mesma coisa.
    if (r.reason === "bad_request") break;
    if (!escorregaParaOProximo(motivo)) break;
  }

  const motivoFinal = motivoDaFilaEsgotada(quedas);
  const pior = quedas.length > 0 ? aPiorFalha(quedas) : null;
  return {
    ok: false,
    // `not_configured` quando o problema é chave (nenhuma, ou recusada): é o
    // código que os chamadores já leem como "do CEO, não da casa".
    reason: quedas.length === 0 || pior?.motivo === "sem_chave" ? "not_configured" : "provider_error",
    error: motivoFinal,
    quedas,
  };
}

/**
 * O produtor OpenAI: `gpt-image-1` e, quando a conta não tem acesso a ele,
 * `dall-e-3`. Os dois modelos são o MESMO produtor da fila — a troca entre
 * eles é interna e não conta como escorregamento.
 */
async function produzirPelaOpenAi(
  req: DesignRequest,
  apiKey: string,
  size: DesignSize,
  quality: DesignQuality,
): Promise<DesignResult> {
  const prompt = req.prompt.trim();
  const qualidadeGpt = quality === "high" ? "high" : "medium";
  const comecoGpt = Date.now();
  const first = await callOpenAiImage(apiKey, {
    model: "gpt-image-1",
    prompt,
    size: SIZE_GPT[size],
    quality: qualidadeGpt,
  });
  // A LINHA SAI AQUI, e não só no sucesso: uma chamada que a OpenAI recusou é
  // notícia para o relatório (ela custa zero, ver `registro-de-custo.ts`), e
  // uma que deu certo é o dinheiro de verdade saindo.
  registrarNoLivroCaixa(req, "openai", "gpt-image-1", TAMANHO_DA_CONTA[size], qualidadeGpt, first, Date.now() - comecoGpt, false);
  if (first.ok || !first.modelAccessIssue) return toResult(first, "openai", "gpt-image-1");

  const qualidadeDalle = quality === "high" ? "hd" : "standard";
  const comecoDalle = Date.now();
  const second = await callOpenAiImage(apiKey, {
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000), // dall-e-3 hard limit
    size: SIZE_DALLE[size],
    quality: qualidadeDalle,
  });
  // `fallbackUsed`: sem isto o relatório mostraria duas chamadas irmãs sem dizer
  // que a segunda só existiu porque a primeira não tinha acesso ao modelo.
  registrarNoLivroCaixa(
    req, "openai", "dall-e-3", TAMANHO_DA_CONTA[size], qualidadeDalle, second, Date.now() - comecoDalle, true,
    first.error ?? "gpt-image-1 indisponível para esta conta",
  );
  return toResult(second, "openai", "dall-e-3");
}

/**
 * O produtor Gemini — o SEGUNDO da fila, e a razão de a arte não parar mais
 * quando a conta da OpenAI zera.
 *
 * Mesma porta `:generateContent` que a fila do texto já usa (`callGemini` em
 * `generate.ts`), com o modelo de imagem: a resposta vem em `inlineData`
 * (base64), que este arquivo já sabe entregar como data URL — todo consumidor
 * renderiza igual, venha de quem vier.
 */
async function produzirPeloGemini(
  req: DesignRequest,
  apiKey: string,
  size: DesignSize,
  quality: DesignQuality,
  /** Quem já caiu nesta chamada, ANTES do Gemini. Ver o bloco abaixo. */
  quedasAntes: readonly QuedaDeProdutor[] = [],
): Promise<DesignResult> {
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const comeco = Date.now();
  const raw = await callGeminiImage(apiKey, model, req.prompt.trim(), size);
  // O Gemini não cobra por tamanho/qualidade como a OpenAI. A linha sai com a
  // mesma forma para o livro-caixa não ter duas gramáticas — e `estimarCustoDe
  // Imagem` devolve `null` para um modelo fora da tabela, que é o comportamento
  // certo: "não sei medir" nunca vira zero.
  //
  // ── E O MOTIVO SÓ SE ESCREVE QUANDO ELE ACONTECEU (27/08/2026) ────────────
  //
  // MEDIDO EM PRODUÇÃO, na rodada paga. Com `BRAIN_IMAGE_PROVIDER=gemini` o
  // Gemini é o PRIMEIRO da fila e produziu de primeira — ninguém caiu. Mesmo
  // assim a linha saiu com `fallbackUsed: true` e
  // `fallbackReason: "a fila de imagem escorregou para o Gemini"`, porque as duas
  // coisas eram constantes escritas à mão neste ponto.
  //
  // O estrago é de LEITURA, e ela é a única defesa que a casa tem: quem for
  // responder *"com que frequência a OpenAI cai?"* conta uma queda que nunca
  // existiu. É a irmã do defeito de 26/08 em `provedoresCaidos` — o dado estava
  // sendo escrito, e escrito errado. Preferir escolher o produtor não é a
  // reserva entrando; são fatos diferentes e agora o livro os separa.
  const escorregou = quedasAntes.length > 0;
  registrarNoLivroCaixa(req, "gemini", model, TAMANHO_DA_CONTA[size], quality, raw, Date.now() - comeco, escorregou,
    escorregou
      ? `a fila de imagem escorregou para o Gemini (caiu: ${quedasAntes.map((q) => q.produtor).join(", ")})`
      : undefined);
  return toResult(raw, "gemini", model);
}

/** O recorte que cada produtor entende. O Gemini não recebe dimensão na API —
 *  ela vai como INSTRUÇÃO no prompt, que é o único canal que ele tem. */
const PROPORCAO_NO_PROMPT: Record<DesignSize, string> = {
  square: "quadrada (1:1)",
  portrait: "vertical (2:3, retrato)",
  landscape: "horizontal (3:2, paisagem)",
};

async function callGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
  size: DesignSize,
): Promise<RawCall> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nProporção da imagem: ${PROPORCAO_NO_PROMPT[size]}.` }] }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      // ⚠️ O STATUS ENTRA NA MENSAGEM DE PROPÓSITO. `classificarFalhaDeProvedor`
      // lê a MENSAGEM, e a do Gemini nem sempre diz "429" com todas as letras —
      // sem o número, um teto de ritmo viraria "motivo não reconhecido".
      const msg = errJson.error?.message
        ? `Gemini HTTP ${res.status}: ${errJson.error.message}`
        : `Gemini HTTP ${res.status}`;
      return { ok: false, status: res.status, error: msg, reason: "provider_error" };
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    };
    const parte = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const dados = parte?.inlineData?.data;
    if (!dados) {
      // Resposta sem imagem É motivo de escorregar (a lista da ordem: "resposta
      // vazia"). A frase carrega a palavra que `classificarFalhaDeProvedor`
      // não reconhece — e não reconhecer também escorrega, de propósito.
      return { ok: false, error: "Resposta Gemini vazia (sem imagem).", reason: "provider_error" };
    }
    const mime = parte?.inlineData?.mimeType?.trim() || "image/png";
    return { ok: true, url: `data:${mime};base64,${dados}` };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "Tempo esgotado ao gerar imagem (Gemini)." : "Erro de rede ao contatar o Gemini.",
      reason: isAbort ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** O nome que a casa usa para cada recorte, na tabela de preço de imagem. */
const TAMANHO_DA_CONTA: Record<DesignSize, TamanhoDeImagem> = {
  square: "quadrada",
  portrait: "retrato",
  landscape: "paisagem",
};

/**
 * Escreve UMA linha no livro-caixa. Nunca lança, nunca segura a entrega — e
 * nunca fica calada quando não consegue gravar.
 */
function registrarNoLivroCaixa(
  req: DesignRequest,
  /** QUEM produziu. Era fixo em `"openai"` — com a fila, um gasto do Gemini
   *  gravado como OpenAI faria o alarme de SEM SALDO acusar a conta errada. */
  provider: ProdutorDeImagem,
  model: string,
  tamanho: TamanhoDeImagem,
  qualidade: string,
  raw: RawCall,
  duracaoMs: number,
  fallbackUsed: boolean,
  fallbackReason?: string,
): void {
  if (!req.workspaceId) {
    // Sem dono não há conta, e ficar calado faria o relatório de gasto parecer
    // completo quando não é. Mesma frase de `lib/ai/generate.ts`, de propósito:
    // as duas linhas são procuradas com o mesmo `grep`.
    console.warn(`[custo-de-ia] chamada SEM workspace, fora da conta — ${provider}/${model}`);
    return;
  }
  // Sem `await`: a contabilidade não segura a entrega da peça.
  // `registrarChamadaDeIa` nunca rejeita, então não há promessa órfã.
  void registrarChamadaDeIa({
    workspaceId: req.workspaceId,
    departmentId: req.conta?.departmentId ?? "design",
    agentId: req.conta?.agentId ?? null,
    clientId: req.conta?.clientId ?? null,
    projectId: req.conta?.projectId ?? null,
    provider,
    model,
    status: raw.ok ? "success" : "error",
    // Imagem não tem token. O preço vem da tabela de IMAGEM.
    uso: null,
    imagem: { tamanho, qualidade, quantas: 1 },
    duracaoMs,
    erro: raw.ok ? null : (raw.error ?? null),
    fallbackUsed,
    fallbackReason: fallbackUsed ? (fallbackReason ?? null) : null,
  });
}

// ── internals ──────────────────────────────────────────────────────────────

interface RawCall {
  ok: boolean;
  url?: string;
  revisedPrompt?: string;
  status?: number;
  error?: string;
  modelAccessIssue?: boolean;
  reason?: DesignResult["reason"];
}

async function callOpenAiImage(
  apiKey: string,
  body: { model: string; prompt: string; size: string; quality: string },
): Promise<RawCall> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, n: 1 }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      // ⚠️ O STATUS ENTRA NA MENSAGEM (26/08/2026). Antes a mensagem do
      // provedor substituía o status, e `classificarFalhaDeProvedor` — que lê a
      // MENSAGEM, nunca o status sozinho — ficava sem o número. Medido ao
      // escrever a fila: uma chave inválida devolve *"Incorrect API key
      // provided"*, sem a palavra "invalid api key" e sem o 401. A régua
      // devolvia `null`, e `null` ESCORREGA — ou seja, uma chave errada faria a
      // casa trocar de produtor em silêncio, que é exatamente o que a ordem
      // proíbe. É a mesma lição de 24/08 ("nunca do status sozinho") valendo
      // agora no sentido inverso: nem da mensagem sozinha.
      const msg = errJson.error?.message
        ? `OpenAI HTTP ${res.status}: ${errJson.error.message}`
        : `OpenAI HTTP ${res.status}`;
      // ── A RECUSA DE CONTEÚDO VEM PRIMEIRO, E ELA É PEDIDO RUIM ───────────
      //
      // MEDIDO EM PRODUÇÃO (rodada paga, 26/08/2026, rodada D da fila). A OpenAI
      // devolveu, palavra por palavra:
      //
      //   "OpenAI HTTP 400: Your request was rejected by the safety system."
      //
      // Isso é o pedido NOSSO sendo recusado — não é o provedor fora do ar, e
      // **não melhora tentando de novo, nem com outro produtor**. O cabeçalho
      // deste arquivo já diz a regra: *"`bad_request` é problema NOSSO. Escorregar
      // levaria o mesmo pedido ruim ao produtor seguinte e gastaria de novo para
      // ouvir a mesma coisa."* A regra existia; o classificador não a alcançava.
      //
      // Dois vazamentos de dinheiro fechados aqui, os dois medidos:
      //
      //   1. `reason` saía "provider_error", então `generateDesign` NÃO quebrava
      //      a fila — na ordem padrão (openai → gemini) uma recusa de conteúdo
      //      escorregaria e **pagaria uma segunda imagem** para ouvir o mesmo não.
      //      Pior: se o Gemini gerasse, a casa entregaria ao cliente a arte que a
      //      OpenAI tinha recusado — sem ninguém saber que ela foi recusada.
      //   2. `modelAccessIssue` casava por `not.*allowed`, e a frase da OpenAI
      //      para conteúdo é *"...is not allowed by our safety system"*. Ou seja,
      //      a recusa de conteúdo se disfarçava de "conta sem acesso ao modelo" e
      //      disparava a segunda chamada PAGA ao dall-e-3, que recusa igual.
      //
      // Por isso a régua da recusa é lida ANTES da régua de acesso ao modelo: das
      // duas frases que casam, a de segurança é a específica.
      const recusaDeConteudo =
        res.status === 400 &&
        /safety system|content policy|content_policy|rejected as a result of our safety|moderation/i.test(msg);
      if (recusaDeConteudo) {
        return { ok: false, status: res.status, error: msg, modelAccessIssue: false, reason: "bad_request" };
      }

      // 400/403 on gpt-image-1 usually means the org isn't verified for it →
      // signal that the caller should fall back to dall-e-3.
      const modelAccessIssue =
        (res.status === 400 || res.status === 403) &&
        /gpt-image|model|verif|access|not.*allowed|must be verified/i.test(msg);
      return {
        ok: false,
        status: res.status,
        error: msg,
        modelAccessIssue,
        reason: "provider_error",
      };
    }

    const data = (await res.json()) as {
      data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
    };
    const item = data.data?.[0];
    if (!item) return { ok: false, error: "Resposta sem imagem.", reason: "provider_error" };

    const url = item.url
      ? item.url
      : item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : undefined;
    if (!url) return { ok: false, error: "Resposta sem imagem.", reason: "provider_error" };

    return { ok: true, url, revisedPrompt: item.revised_prompt };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "Tempo esgotado ao gerar imagem." : "Erro de rede ao contatar a OpenAI.",
      reason: isAbort ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toResult(raw: RawCall, provider: ProdutorDeImagem, model: string): DesignResult {
  if (raw.ok) return { ok: true, url: raw.url, provider, model, revisedPrompt: raw.revisedPrompt };
  return { ok: false, provider, model, error: raw.error, reason: raw.reason ?? "provider_error" };
}
