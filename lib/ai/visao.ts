// ─── visao.ts — a camada de VISÃO da casa. SERVER-ONLY. ─────────────────────
//
// Existe por uma ordem do CEO (04/08/2026): a agência lia só as LEGENDAS do
// Instagram do cliente e deduzia o estilo dali. Nenhuma IA da casa enxergava
// imagem — e peça com "a cara da marca" não se acerta lendo texto.
//
// ESTA CAMADA É BURRA DE PROPÓSITO. Recebe imagens + uma pergunta, devolve a
// resposta do modelo. Ela NÃO analisa estilo (isso é do departamento), NÃO fala
// com a Meta, NÃO grava nada no banco e NÃO monta prompt de negócio. Quem
// souber o que perguntar, pergunta.
//
// CONTRATO DE ERRO — igual ao de lib/integrations/meta/leitura.ts: NADA aqui
// lança exceção para o chamador. Toda falha vira `{ ok: false, erro, motivo }`.
// A degradação é DECLARADA: sem provedor com visão conectado, o retorno é
// `motivo: "sem_provedor_com_visao"` e o chamador segue sem visão — nunca
// quebra. Visão é advisory (Lei 2 do kit), não caminho crítico.
//
// ── QUEM ENXERGA, HOJE ──────────────────────────────────────────────────────
//   openai  → gpt-4o-mini (multimodal)      ✅ chave CONFIRMADA em produção
//                                              (cofre cifrado do banco; provada
//                                              em 02/08/2026 no /api/generate-image)
//   claude  → claude-haiku-4-5 (multimodal) ✅ se houver chave
//   gemini  → gemini-1.5-flash (multimodal) ✅ se houver chave
//   deepseek, perplexity → SEM VISÃO na API que a casa usa. Ficam de fora da
//   lista: mandar imagem para elas é erro 400 pago.
//
// ⚠️ O MODELO DE VISÃO NÃO É O MODELO ESCOLHIDO NA TELA. `resolveProviderKey`
// devolve `model` — o modelo que o operador escolheu em Integrações para
// TEXTO, e que pode perfeitamente ser um modelo cego (o-series, um sonar, um
// deepseek-chat). Usar aquele modelo aqui trocaria "sem visão" por um HTTP 400
// cobrado e ilegível. Por isso o modelo daqui é fixo por provedor, com
// override por env (VISAO_OPENAI_MODEL / VISAO_CLAUDE_MODEL / VISAO_GEMINI_MODEL).
//
// ── CUSTO (isto roda POR CLIENTE, POR CICLO — leia antes de aumentar o teto) ─
// A imagem é cobrada como TOKEN DE ENTRADA, e o texto da pergunta é ruído perto
// dela.
//
// ⚠️ `detalhe: "baixo"` SÓ EXISTE NA OPENAI. Não é um conceito da casa, é um
// parâmetro do fornecedor (`image_url.detail`). Claude e Gemini NÃO têm esse
// botão: eles cobram a imagem pela ÁREA EM PIXELS que você mandou, e mandar
// "baixo" para eles não muda um centavo. Como CLAUDE É O PRIMEIRO DA ORDEM DE
// PREFERÊNCIA, o caso PADRÃO desta camada é o caso que ignora `detalhe`.
// O resultado devolve `detalheAplicado` dizendo se o pedido de barateamento
// pegou ou não — degradação declarada, igual a `imagensIgnoradas`.
//
// Por que não reduzimos a imagem antes de enviar (que faria "baixo" valer em
// todo provedor): exigiria um decodificador de imagem — `sharp` ou equivalente,
// binário nativo — como DEPENDÊNCIA DECLARADA do projeto, mudando o build do
// Railway. Está fora do território desta camada e não se paga: o ganho é da
// ordem de US$ 0,01 por ciclo. Se um dia o volume mudar essa conta, o lugar da
// redução é aqui, em `prepararImagens`, antes do base64.
//
// Ordem de grandeza por IMAGEM de feed típica (1024×1024), preços de 04/08/2026
// — confira a tabela do fornecedor antes de prometer número a alguém:
//   • openai gpt-4o-mini, detalhe "baixo" → 85 tokens de imagem (fatia única,
//     independe do tamanho), com o multiplicador de imagem do mini ≈ 2,8k tokens
//     faturados ≈ US$ 0,0004/imagem. Ciclo de 8 ≈ US$ 0,003.
//   • openai gpt-4o-mini, detalhe "alto"  → a imagem é fatiada em tiles de 512px
//     (~4 tiles aqui) ≈ 6 a 9× o custo acima. Ciclo de 8 ≈ US$ 0,02–0,03. Só
//     peça quando precisar LER TEXTO dentro da arte.
//   • claude haiku      → ≈ (largura × altura) / 750 tokens ≈ 1,4k tokens
//     ≈ US$ 0,0014/imagem. Ciclo de 8 ≈ US$ 0,011. IGNORA `detalhe`.
//   • gemini 1.5 flash  → 258 tokens até 384px; acima disso, fatias de 768px
//     (~4 aqui) ≈ 1k tokens ≈ US$ 0,00008/imagem. Ciclo de 8 ≈ US$ 0,0006.
//     IGNORA `detalhe`. É o mais barato dos três por uma ordem de grandeza.
//   • CADA RETENTATIVA REENVIA AS IMAGENS e é cobrada de novo. Por isso a
//     retentativa aqui é curta (`TENTATIVAS_DO_PREFERIDO` = 2 no preferido,
//     `TENTATIVAS_DA_RESERVA` = 1 na reserva) — bem menos que as 3 do
//     generate(), que só reenvia texto.
//   • ⚠️ OS NÚMEROS DE "CICLO DE 8" ACIMA SÃO DE **UMA** CHAMADA BEM-SUCEDIDA
//     NA PRIMEIRA TENTATIVA. Com os três provedores conectados, o PIOR CASO é
//     2 + 1 + 1 = 4 chamadas pagas (`chamadasPagasNoPiorCaso(3)`) — ou seja,
//     até 4× o número da linha. Foi assim que a telemetria de custo em
//     `leitura-do-cliente.ts` subestimou o gasto: o número estava escrito à mão
//     num comentário e ignorava a retentativa. Por isso o retorno agora traz
//     `chamadasPagas` MEDIDO — quem quiser reportar custo usa esse campo, não
//     um número copiado daqui.
// O teto de 8 imagens por chamada não é estético: é a diferença entre "custo de
// um cafezinho por cliente por ciclo" e uma fatura que ninguém revisou.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveProviderKey, isAiProvider, type AiProvider } from "@/lib/ai/resolve-key";

// ─── Contrato ───────────────────────────────────────────────────────────────

/** Uma imagem para analisar: URL pública (a do CDN da Meta) ou bytes já em mão. */
export type ImagemDeEntrada =
  | { tipo: "url"; url: string; rotulo?: string }
  | { tipo: "bytes"; bytes: Uint8Array; mime: string; rotulo?: string };

/** Por que a chamada não deu certo. A UI/chamador decide o que dizer a partir daqui. */
export type MotivoDeFalhaDeVisao =
  | "sem_provedor_com_visao" // degradação declarada: ninguém com visão conectado
  | "pedido_invalido"        // sem pergunta, sem imagem, imagem malformada
  | "nenhuma_imagem_lida"    // todas as imagens falharam no download/validação
  | "erro_do_provedor"       // HTTP != 2xx vindo da IA
  | "resposta_vazia"         // 2xx sem conteúdo utilizável
  | "timeout"
  | "erro_de_rede";

/** Uma imagem que ficou de fora — o chamador precisa saber que a leitura é parcial. */
export interface ImagemIgnorada {
  /** Rótulo dado pelo chamador, ou a posição na lista. Nunca a URL inteira. */
  rotulo: string;
  motivo: string;
}

export interface PedidoDeVisao {
  /** Até LIMITE_DE_IMAGENS. O excedente é ignorado e reportado, não é erro. */
  imagens: ImagemDeEntrada[];
  /** A pergunta sobre as imagens. Obrigatória — esta camada não inventa prompt. */
  pergunta: string;
  /** Instrução de sistema. Opcional; há um padrão neutro. */
  sistema?: string;
  /** "json" pede JSON e tenta extrair para `dados`; `texto` vem sempre. */
  formato?: "texto" | "json";
  /**
   * "baixo" (padrão) = barato. "alto" só para ler texto dentro da imagem.
   * ⚠️ SÓ TEM EFEITO NA OPENAI — Claude e Gemini cobram pela área em pixels e
   * não expõem esse botão. Ver a seção de CUSTO no cabeçalho. O resultado
   * informa em `detalheAplicado` se o pedido pegou.
   */
  detalhe?: "baixo" | "alto";
  workspaceId?: string;
  maxTokens?: number;
  /** Põe um provedor na frente. Se ele não tiver visão ou chave, é ignorado. */
  provedorPreferido?: AiProvider;
}

export type ResultadoDeVisao =
  | {
      ok: true;
      /** A resposta do modelo, crua. */
      texto: string;
      /** Só quando formato "json" e o JSON foi extraído. */
      dados?: unknown;
      provedor: ProvedorComVisao;
      modelo: string;
      /**
       * O `detalhe` pedido chegou a ser aplicado? `false` quando o provedor que
       * atendeu (Claude, Gemini) cobra pela área e ignora o campo — ou seja, a
       * imagem foi cobrada INTEIRA mesmo com `detalhe: "baixo"`. Dito, nunca
       * escondido: quem paga a fatura precisa saber. Ver CUSTO no cabeçalho.
       */
      detalheAplicado: boolean;
      imagensLidas: number;
      /**
       * QUANTAS CHAMADAS PAGAS esta análise custou de verdade — retentativa e
       * troca de provedor incluídas, porque cada uma REENVIA as imagens e é
       * cobrada de novo. Existe porque o custo estava escrito à mão em
       * comentário de outro arquivo ("≈US$ 0,011 por ciclo") e subestimava em
       * até 4×: número em cabeçalho não é derivado do código e envelhece
       * errado. Este é medido.
       */
      chamadasPagas: number;
      /** Vazio quando tudo foi lido. Leitura parcial é dita, nunca escondida. */
      imagensIgnoradas: ImagemIgnorada[];
    }
  | {
      ok: false;
      erro: string;
      /** Idem: a falha também custou — tentativa que falha foi cobrada. */
      chamadasPagas: number;
      motivo: MotivoDeFalhaDeVisao;
      imagensIgnoradas?: ImagemIgnorada[];
    };

// ─── Tetos ──────────────────────────────────────────────────────────────────

/** Imagens por chamada. Ver a seção de CUSTO no cabeçalho antes de subir. */
export const LIMITE_DE_IMAGENS = 8;
/** Tentativas no provedor PREFERIDO. Cada uma reenvia as imagens e é cobrada. */
export const TENTATIVAS_DO_PREFERIDO = 2;
/** Tentativas em cada provedor de RESERVA. */
export const TENTATIVAS_DA_RESERVA = 1;
/** O pior caso de chamadas PAGAS numa análise, dado quantos provedores estão
 *  conectados. É a conta que a telemetria de custo tem de usar — escrever o
 *  número à mão em comentário foi exatamente o que envelheceu errado. */
export function chamadasPagasNoPiorCaso(provedoresConectados: number): number {
  if (provedoresConectados <= 0) return 0;
  return TENTATIVAS_DO_PREFERIDO + (provedoresConectados - 1) * TENTATIVAS_DA_RESERVA;
}
/** Por imagem. Acima disso é foto de câmera, não peça de feed. */
export const TAMANHO_MAXIMO_POR_IMAGEM = 5 * 1024 * 1024;
/** Somado. Segura o caso de 8 imagens no limite virarem um corpo de 40 MB. */
export const TAMANHO_MAXIMO_TOTAL = 20 * 1024 * 1024;
/** O que os três provedores aceitam em comum. */
export const MIMES_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const TIMEOUT_DOWNLOAD_MS = 15_000;
const TIMEOUT_PROVEDOR_MS = 90_000;
const MAX_TOKENS_PADRAO = 1500;

const SISTEMA_PADRAO =
  "Você analisa imagens e responde de forma objetiva, apenas sobre o que está visível. " +
  "Não invente informação que a imagem não mostra.";

// ─── Provedores que enxergam ────────────────────────────────────────────────
// A ordem é a mesma do generate(): ranking de qualidade da casa, filtrado por
// quem tem visão. DeepSeek e Perplexity NÃO entram — não é esquecimento.

export type ProvedorComVisao = "claude" | "openai" | "gemini";

export const PROVEDORES_COM_VISAO: ProvedorComVisao[] = ["claude", "openai", "gemini"];

export function temVisao(p: AiProvider): p is ProvedorComVisao {
  return (PROVEDORES_COM_VISAO as string[]).includes(p);
}

/** Modelo multimodal por provedor. NÃO é o modelo escolhido na tela — ver cabeçalho. */
function modeloDeVisao(p: ProvedorComVisao): string {
  if (p === "openai") return process.env.VISAO_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (p === "claude") return process.env.VISAO_CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001";
  return process.env.VISAO_GEMINI_MODEL?.trim() || "gemini-1.5-flash";
}

function ordemDeVisao(preferido?: AiProvider): ProvedorComVisao[] {
  const env = (process.env.BRAIN_AI_PROVIDER ?? "").trim().toLowerCase();
  const frente: ProvedorComVisao[] = [];
  if (preferido && temVisao(preferido)) frente.push(preferido);
  if (isAiProvider(env) && temVisao(env) && !frente.includes(env)) frente.push(env);
  return [...frente, ...PROVEDORES_COM_VISAO.filter((p) => !frente.includes(p))];
}

/**
 * Existe alguma IA com visão conectada? Para o chamador decidir ANTES de montar
 * um pedido caro — e para a tela de capacidades dizer a verdade.
 * Nunca lança.
 */
export async function visaoDisponivel(
  workspaceId?: string,
): Promise<{ disponivel: boolean; provedor: ProvedorComVisao | null; modelo: string | null }> {
  for (const p of ordemDeVisao()) {
    const chave = await resolveProviderKey(p, workspaceId).catch(() => null);
    if (chave) return { disponivel: true, provedor: p, modelo: modeloDeVisao(p) };
  }
  return { disponivel: false, provedor: null, modelo: null };
}

// ─── Preparo das imagens ────────────────────────────────────────────────────

interface ImagemPronta {
  mime: string;
  base64: string;
  bytes: number;
}

/** Rótulo seguro para relatório: nunca a URL inteira (ela carrega token do CDN). */
function rotuloDe(img: ImagemDeEntrada, i: number): string {
  return img.rotulo?.trim() || `imagem ${i + 1}`;
}

/**
 * Hospedeiro proibido. Esta camada recebe URL de fora (o CDN da Meta hoje,
 * outra coisa amanhã) e a busca a partir do SERVIDOR — que enxerga a rede
 * interna e o metadata do provedor de nuvem. Sem esta trava, uma URL
 * envenenada vira leitura de host interno com a resposta devolvida na API.
 *
 * VALE PARA CADA SALTO DE REDIRECIONAMENTO, não só para a URL original — ver
 * `buscarSeguindoSaltos`. Checar só a primeira é a versão da trava que não
 * protege nada: qualquer URL pública pode responder 302 para
 * http://169.254.169.254/ e a trava seguiria feliz.
 *
 * LIMITAÇÃO DITA COM TODAS AS LETRAS: isto barra o nome/IP literal, não
 * DNS-rebinding nem um domínio público que resolve para IP privado. A trava
 * completa exige resolver o DNS e checar o IP antes de conectar — não foi feito
 * nesta rodada porque `fetch` não expõe o socket. Trate como higiene, não como
 * garantia.
 */
function hospedeiroProibido(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

/** Saltos de redirecionamento tolerados. CDN → CDN regional → objeto é 2; 3 sobra. */
export const MAXIMO_DE_SALTOS = 3;

/** O porteiro: protocolo e hospedeiro. Roda na URL original E em cada salto. */
function urlPermitida(bruta: string | URL): { ok: true; alvo: URL } | { ok: false; motivo: string } {
  let alvo: URL;
  try {
    alvo = typeof bruta === "string" ? new URL(bruta) : bruta;
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (alvo.protocol !== "http:" && alvo.protocol !== "https:") {
    return { ok: false, motivo: `protocolo não permitido (${alvo.protocol.replace(":", "")})` };
  }
  if (hospedeiroProibido(alvo.hostname)) {
    return { ok: false, motivo: "endereço interno recusado" };
  }
  return { ok: true, alvo };
}

/**
 * Busca seguindo redirecionamento NA MÃO, revalidando cada salto.
 *
 * Por que não `redirect: "follow"`: com o follow automático, só o hostname
 * ORIGINAL passa pelo porteiro. Uma URL pública — e estas URLs vêm do feed do
 * cliente, ou seja, de terceiro — que responde 302 para
 * http://169.254.169.254/latest/meta-data/iam/security-credentials/ seria
 * seguida sem nova checagem, e o corpo voltaria como "imagem" para dentro da
 * casa. Esse endereço é o metadata da nuvem: é onde moram credenciais.
 *
 * `redirect: "manual"` no fetch do Node (undici) devolve a resposta 3xx real,
 * com o `location` legível. Isto é SERVER-ONLY — no browser viria opaca.
 */
async function buscarSeguindoSaltos(
  primeira: URL,
  signal: AbortSignal,
): Promise<{ ok: true; res: Response } | { ok: false; motivo: string }> {
  let atual = primeira;
  for (let salto = 0; salto <= MAXIMO_DE_SALTOS; salto++) {
    const res = await fetch(atual.toString(), { signal, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return { ok: true, res };

    const destino = res.headers.get("location");
    if (!destino) return { ok: false, motivo: `redirecionamento sem destino (HTTP ${res.status})` };
    // Location pode ser relativa; resolver contra a URL ATUAL, não a original.
    let absoluta: URL;
    try {
      absoluta = new URL(destino, atual);
    } catch {
      return { ok: false, motivo: "redirecionamento para URL inválida" };
    }
    const proximo = urlPermitida(absoluta);
    if (!proximo.ok) {
      return { ok: false, motivo: `redirecionamento recusado: ${proximo.motivo}` };
    }
    atual = proximo.alvo;
  }
  return { ok: false, motivo: `redirecionamentos demais (limite de ${MAXIMO_DE_SALTOS})` };
}

/**
 * Baixa a imagem da URL. As URLs do feed vêm do CDN da Meta e EXPIRAM (elas
 * carregam token e prazo na query) — por isso o download acontece aqui, na hora,
 * e não é delegado ao provedor de IA: entregar uma URL vencida à OpenAI devolve
 * um erro genérico do fornecedor, cobrado e sem dizer qual imagem morreu. Aqui,
 * uma URL vencida vira "imagem inacessível (HTTP 403)" com o rótulo certo, e as
 * outras imagens seguem.
 */
async function baixar(url: string): Promise<{ ok: true; mime: string; bytes: Uint8Array } | { ok: false; motivo: string }> {
  const inicial = urlPermitida(url);
  if (!inicial.ok) return inicial;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_DOWNLOAD_MS);
  try {
    const busca = await buscarSeguindoSaltos(inicial.alvo, controller.signal);
    if (!busca.ok) return busca;
    const res = busca.res;
    if (!res.ok) {
      // 403/404 no CDN da Meta = link expirado ou mídia removida. É o caso
      // comum, não uma exceção: reler o feed produz URLs novas.
      const extra = res.status === 403 || res.status === 404 ? " — link do CDN provavelmente expirou" : "";
      return { ok: false, motivo: `imagem inacessível (HTTP ${res.status})${extra}` };
    }

    const declarado = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_POR_IMAGEM) {
      return { ok: false, motivo: `imagem grande demais (${Math.round(declarado / 1024)} KB)` };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return { ok: false, motivo: "imagem vazia" };
    if (bytes.byteLength > TAMANHO_MAXIMO_POR_IMAGEM) {
      return { ok: false, motivo: `imagem grande demais (${Math.round(bytes.byteLength / 1024)} KB)` };
    }

    // O content-type é a fonte declarada; quando o CDN não manda (ou manda
    // octet-stream), o sniff dos primeiros bytes decide. Sem um dos dois, não
    // adianta enviar: o provedor recusa o mime.
    const mime = normalizarMime(res.headers.get("content-type")) ?? sniffMime(bytes);
    if (!mime) return { ok: false, motivo: "formato de imagem não reconhecido" };
    return { ok: true, mime, bytes };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return { ok: false, motivo: abortou ? "tempo esgotado ao baixar a imagem" : "erro de rede ao baixar a imagem" };
  } finally {
    clearTimeout(timer);
  }
}

function normalizarMime(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const m = bruto.split(";")[0]!.trim().toLowerCase();
  const equivalente = m === "image/jpg" ? "image/jpeg" : m;
  return (MIMES_ACEITOS as readonly string[]).includes(equivalente) ? equivalente : null;
}

/** Assinatura dos formatos aceitos, para quando o servidor não declara o tipo. */
function sniffMime(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  return null;
}

/**
 * Transforma a lista pedida em imagens prontas para enviar, sem derrubar o lote:
 * imagem que falha entra em `ignoradas` e as outras seguem. Leitura parcial é
 * melhor que nenhuma — e é DITA no resultado.
 */
async function prepararImagens(
  imagens: ImagemDeEntrada[],
): Promise<{ prontas: ImagemPronta[]; ignoradas: ImagemIgnorada[] }> {
  const prontas: ImagemPronta[] = [];
  const ignoradas: ImagemIgnorada[] = [];

  const consideradas = imagens.slice(0, LIMITE_DE_IMAGENS);
  for (const [i, extra] of imagens.slice(LIMITE_DE_IMAGENS).entries()) {
    ignoradas.push({
      rotulo: rotuloDe(extra, LIMITE_DE_IMAGENS + i),
      motivo: `acima do limite de ${LIMITE_DE_IMAGENS} imagens por chamada`,
    });
  }

  let total = 0;
  for (const [i, img] of consideradas.entries()) {
    const rotulo = rotuloDe(img, i);

    let mime: string | null;
    let bytes: Uint8Array;

    if (img.tipo === "bytes") {
      mime = normalizarMime(img.mime) ?? sniffMime(img.bytes);
      bytes = img.bytes;
      if (!bytes || bytes.byteLength === 0) {
        ignoradas.push({ rotulo, motivo: "imagem vazia" });
        continue;
      }
      if (bytes.byteLength > TAMANHO_MAXIMO_POR_IMAGEM) {
        ignoradas.push({ rotulo, motivo: `imagem grande demais (${Math.round(bytes.byteLength / 1024)} KB)` });
        continue;
      }
      if (!mime) {
        ignoradas.push({ rotulo, motivo: "formato de imagem não aceito" });
        continue;
      }
    } else {
      const baixada = await baixar(img.url);
      if (!baixada.ok) {
        ignoradas.push({ rotulo, motivo: baixada.motivo });
        continue;
      }
      mime = baixada.mime;
      bytes = baixada.bytes;
    }

    if (total + bytes.byteLength > TAMANHO_MAXIMO_TOTAL) {
      ignoradas.push({ rotulo, motivo: "estouraria o tamanho total permitido na chamada" });
      continue;
    }
    total += bytes.byteLength;
    prontas.push({ mime, base64: Buffer.from(bytes).toString("base64"), bytes: bytes.byteLength });
  }

  return { prontas, ignoradas };
}

// ─── Chamada por provedor ───────────────────────────────────────────────────

type RespostaCrua = { ok: true; texto: string } | { ok: false; erro: string; motivo: MotivoDeFalhaDeVisao };

function comTimeout(): { signal: AbortSignal; limpar: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_PROVEDOR_MS);
  return { signal: c.signal, limpar: () => clearTimeout(t) };
}

function falhaDeRede(err: unknown): RespostaCrua {
  const abortou = err instanceof Error && err.name === "AbortError";
  return abortou
    ? { ok: false, erro: "tempo esgotado esperando a IA", motivo: "timeout" }
    : { ok: false, erro: "erro de rede ao falar com a IA", motivo: "erro_de_rede" };
}

async function chamarOpenAI(
  apiKey: string, modelo: string, p: PedidoInterno,
): Promise<RespostaCrua> {
  const { signal, limpar } = comTimeout();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        max_tokens: p.maxTokens,
        messages: [
          { role: "system", content: p.sistema },
          {
            role: "user",
            content: [
              { type: "text", text: p.pergunta },
              ...p.imagens.map((img) => ({
                type: "image_url" as const,
                image_url: {
                  url: `data:${img.mime};base64,${img.base64}`,
                  detail: p.detalhe === "alto" ? "high" : "low",
                },
              })),
            ],
          },
        ],
      }),
      signal,
    });
    if (!res.ok) return { ok: false, erro: `OpenAI HTTP ${res.status}`, motivo: "erro_do_provedor" };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = json.choices?.[0]?.message?.content?.trim();
    if (!texto) return { ok: false, erro: "resposta vazia (OpenAI)", motivo: "resposta_vazia" };
    return { ok: true, texto };
  } catch (err) {
    return falhaDeRede(err);
  } finally {
    limpar();
  }
}

async function chamarClaude(
  apiKey: string, modelo: string, p: PedidoInterno,
): Promise<RespostaCrua> {
  const { signal, limpar } = comTimeout();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: p.maxTokens,
        system: p.sistema,
        messages: [
          {
            role: "user",
            content: [
              ...p.imagens.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mime, data: img.base64 },
              })),
              { type: "text" as const, text: p.pergunta },
            ],
          },
        ],
      }),
      signal,
    });
    if (!res.ok) return { ok: false, erro: `Claude HTTP ${res.status}`, motivo: "erro_do_provedor" };
    const json = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const texto = json.content?.map((c) => c.text ?? "").join("").trim();
    if (!texto) return { ok: false, erro: "resposta vazia (Claude)", motivo: "resposta_vazia" };
    return { ok: true, texto };
  } catch (err) {
    return falhaDeRede(err);
  } finally {
    limpar();
  }
}

async function chamarGemini(
  apiKey: string, modelo: string, p: PedidoInterno,
): Promise<RespostaCrua> {
  const { signal, limpar } = comTimeout();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.sistema }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: p.pergunta },
              ...p.imagens.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
            ],
          },
        ],
        generationConfig: { maxOutputTokens: p.maxTokens, temperature: 0.4 },
      }),
      signal,
    });
    if (!res.ok) return { ok: false, erro: `Gemini HTTP ${res.status}`, motivo: "erro_do_provedor" };
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = json.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("").trim();
    if (!texto) return { ok: false, erro: "resposta vazia (Gemini)", motivo: "resposta_vazia" };
    return { ok: true, texto };
  } catch (err) {
    return falhaDeRede(err);
  } finally {
    limpar();
  }
}

interface PedidoInterno {
  sistema: string;
  pergunta: string;
  imagens: ImagemPronta[];
  maxTokens: number;
  detalhe: "baixo" | "alto";
}

/**
 * Este provedor honra `detalhe`? Só a OpenAI — é o único que tem o botão
 * (`image_url.detail`). Claude e Gemini cobram pela área em pixels enviada.
 * Não é esquecimento de implementação: não existe o parâmetro na API deles.
 */
export function honraDetalhe(p: ProvedorComVisao): boolean {
  return p === "openai";
}

function chamar(p: ProvedorComVisao, apiKey: string, modelo: string, pedido: PedidoInterno): Promise<RespostaCrua> {
  if (p === "openai") return chamarOpenAI(apiKey, modelo, pedido);
  if (p === "claude") return chamarClaude(apiKey, modelo, pedido);
  return chamarGemini(apiKey, modelo, pedido);
}

/** Vale re-tentar? Só o que é soluço. Erro permanente (401, 400) não melhora
 *  na segunda — e a segunda REENVIA as imagens, ou seja, é paga. */
function ehPassageiro(motivo: MotivoDeFalhaDeVisao, erro: string): boolean {
  if (motivo === "timeout" || motivo === "erro_de_rede" || motivo === "resposta_vazia") return true;
  return /HTTP (429|5\d\d)/.test(erro);
}

function extrairJson(texto: string): unknown | null {
  const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini === -1 || fim === -1) return null;
  try {
    return JSON.parse(limpo.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

// ─── A função ───────────────────────────────────────────────────────────────

/**
 * Manda imagens + pergunta para a primeira IA com visão que tiver chave e
 * devolve a resposta. **Nunca lança.**
 *
 * Degradação declarada: sem nenhum provedor com visão conectado, devolve
 * `{ ok: false, motivo: "sem_provedor_com_visao" }` — o chamador segue o
 * trabalho SEM visão, não quebra.
 *
 * Custo dito: `detalheAplicado` no retorno diz se o `detalhe` pedido pegou —
 * Claude e Gemini cobram a imagem inteira. Ver CUSTO no cabeçalho.
 *
 * Leitura parcial é dita: imagem que não baixou entra em `imagensIgnoradas` e
 * as demais são analisadas. Só quando NENHUMA imagem sobrevive é que a chamada
 * falha (`motivo: "nenhuma_imagem_lida"`) — sem gastar um centavo de IA.
 */
export async function analisarImagens(pedido: PedidoDeVisao): Promise<ResultadoDeVisao> {
  // O contador de gasto REAL. Cada `chamar` abaixo incrementa antes de sair —
  // inclusive as que falham, porque a tentativa que falha também foi cobrada.
  let chamadasPagas = 0;
  try {
    const pergunta = (pedido.pergunta ?? "").trim();
    if (!pergunta) {
      return { ok: false, chamadasPagas, motivo: "pedido_invalido", erro: "Pergunta vazia — esta camada não inventa o que perguntar." };
    }
    if (!Array.isArray(pedido.imagens) || pedido.imagens.length === 0) {
      return { ok: false, chamadasPagas, motivo: "pedido_invalido", erro: "Nenhuma imagem enviada." };
    }

    // A ordem importa: descobrir que NÃO há provedor antes de baixar 8 imagens
    // economiza rede e tempo — e é o caminho comum quando a visão está desligada.
    const ordem = ordemDeVisao(pedido.provedorPreferido);
    const conectados: Array<{ provedor: ProvedorComVisao; apiKey: string }> = [];
    for (const p of ordem) {
      const chave = await resolveProviderKey(p, pedido.workspaceId).catch(() => null);
      if (chave) conectados.push({ provedor: p, apiKey: chave.apiKey });
    }
    if (conectados.length === 0) {
      return {
        ok: false,
        chamadasPagas,
        motivo: "sem_provedor_com_visao",
        erro:
          "Nenhuma IA com visão conectada (OpenAI, Claude ou Gemini). " +
          "Conecte uma chave em Integrações → IAs. Seguindo sem análise de imagem.",
      };
    }

    const { prontas, ignoradas } = await prepararImagens(pedido.imagens);
    if (prontas.length === 0) {
      return {
        ok: false,
        chamadasPagas,
        motivo: "nenhuma_imagem_lida",
        erro: "Nenhuma das imagens pôde ser lida.",
        imagensIgnoradas: ignoradas,
      };
    }

    const interno: PedidoInterno = {
      sistema: pedido.sistema?.trim() || SISTEMA_PADRAO,
      pergunta:
        pedido.formato === "json"
          ? `${pergunta}\n\nResponda SOMENTE com um objeto JSON válido, sem texto fora dele.`
          : pergunta,
      imagens: prontas,
      maxTokens: pedido.maxTokens ?? MAX_TOKENS_PADRAO,
      detalhe: pedido.detalhe ?? "baixo",
    };

    let primeiraFalha: string | null = null;
    // O motivo da PRIMEIRA falha viaja junto: achatar tudo em "erro_do_provedor"
    // faria um timeout e uma chave inválida chegarem iguais ao chamador — e são
    // decisões diferentes (esperar e tentar de novo × ir configurar).
    let primeiroMotivo: MotivoDeFalhaDeVisao = "erro_do_provedor";
    for (const [i, { provedor, apiKey }] of conectados.entries()) {
      const modelo = modeloDeVisao(provedor);
      // O preferido tem direito a uma segunda tentativa; a reserva, a um tiro
      // só. Cada tentativa REENVIA as imagens e é cobrada — ver CUSTO.
      const tentativas = i === 0 ? TENTATIVAS_DO_PREFERIDO : TENTATIVAS_DA_RESERVA;
      let r: RespostaCrua = { ok: false, erro: "sem tentativas", motivo: "erro_do_provedor" };
      for (let t = 0; t < tentativas; t++) {
        r = await chamar(provedor, apiKey, modelo, interno);
        chamadasPagas += 1;
        if (r.ok || !ehPassageiro(r.motivo, r.erro)) break;
        if (t < tentativas - 1) await new Promise((res) => setTimeout(res, 600));
      }

      if (r.ok) {
        const dados = pedido.formato === "json" ? extrairJson(r.texto) : null;
        return {
          ok: true,
          texto: r.texto,
          ...(dados !== null ? { dados } : {}),
          provedor,
          modelo,
          detalheAplicado: honraDetalhe(provedor),
          chamadasPagas,
          imagensLidas: prontas.length,
          imagensIgnoradas: ignoradas,
        };
      }
      if (primeiraFalha === null) {
        primeiraFalha = `${provedor}: ${r.erro}`;
        primeiroMotivo = r.motivo;
      }
    }

    return {
      ok: false,
      chamadasPagas,
      motivo: primeiroMotivo,
      erro: `Análise de imagem indisponível — ${primeiraFalha}`,
      imagensIgnoradas: ignoradas,
    };
  } catch (err) {
    // Cinto de segurança do contrato "nunca lança": se algo aqui dentro
    // escapar, o chamador recebe um erro, não uma exceção no meio da execução.
    return {
      ok: false,
      chamadasPagas,
      motivo: "erro_de_rede",
      erro: `falha inesperada na análise de imagem: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    };
  }
}
