// ─── THE CONTRACT ────────────────────────────────────────────────────────────
// This module is the clean interface the Planner, Social Agent, and autonomous
// engine call. They describe WHAT to publish / WHICH account to read; this
// layer performs the real Graph API work (create media container → publish,
// read insights, send WhatsApp). SERVER-ONLY.
//
//   await publishPost({ connectionId, platform, format, caption, mediaUrl })
//   await sendWhatsAppMessage({ connectionId, to, text })
//
// LEITURA NÃO MORA MAIS AQUI. `getInsights` foi REMOVIDO em 04/08/2026: ele
// pedia `metric: "reach,impressions"` — `impressions` está DESCONTINUADA na
// conta (v22.0; todas as versões em 21/04/2025) — e lia `values[0]`, o valor de
// UM DIA, chamando isso de alcance do mês. Não tinha chamador vivo, mas o nome
// certo num código errado é armadilha: o próximo a precisar de métrica o
// encontraria primeiro. Quem lê a Meta agora é `./leitura.ts`
// (`lerMetricasDaConta`, `lerFeedDoCliente`, `lerMetricasDosPosts`), que tem
// janela, série, teto de ritmo e rótulo honesto do alcance.

import { graphGet, graphPost, graphPostJson, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";
import { conferirPublicacao } from "./trava-de-publicacao";
import type {
  PublishInput,
  PublishResult,
  WhatsAppMessageInput,
} from "./types";

function errMessage(e: unknown): string {
  if (e instanceof GraphApiError) return e.detail?.message ?? e.message;
  if (e instanceof Error) return e.message;
  return "erro desconhecido";
}

// ─── Espera de container: BACKOFF, não intervalo fixo ───────────────────────
// O jeito antigo era `attempts: 12, delayMs: 2500`: doze GETs a cada 2,5s, POR
// CONTAINER. Num carrossel de 10 imagens isso é até 120 GETs em rajada, mais o
// pai, o publish e o permalink — ~130 chamadas por post. Com dez publicações
// numa rodada, ~1.300 chamadas em minutos contra a mesma conta. É a assinatura
// de máquina que restringiu a conta da agência em 03/08/2026, e é o oposto do
// que a Meta manda fazer ("Espalhe as consultas de maneira uniforme para evitar
// picos de tráfego" — fontes/graph-api-limites-de-taxa.md).
//
// Agora: a primeira conferência é imediata (imagem quase sempre já sai
// FINISHED, e nesse caso é UMA chamada), e as seguintes espaçam com backoff
// exponencial até o teto. Menos chamadas, mais espalhadas, e um ORÇAMENTO de
// tempo em vez de um número mágico de tentativas.
//
// O jitter não é enfeite: intervalo perfeitamente regular é assinatura de bot, e
// dez containers em paralelo com o mesmo intervalo batem na Meta em ondas.

/** Espera inicial entre conferências, em ms. */
const ESPERA_INICIAL_MS = 2_000;
/** Multiplicador do backoff a cada conferência sem resposta. */
const FATOR_DO_BACKOFF = 2;
/** Teto da espera: acima disso o backoff não cresce mais. */
const ESPERA_MAXIMA_MS = 15_000;
/** Orçamento de tempo para uma imagem de carrossel (processa rápido). */
export const ORCAMENTO_DE_IMAGEM_MS = 45_000;
/** Orçamento de tempo para vídeo/reel/pai de carrossel (processa devagar). */
export const ORCAMENTO_DE_VIDEO_MS = 120_000;

function comJitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

// Wait until an IG media container is ready to publish (videos/reels process
// asynchronously). Images are usually FINISHED immediately.
async function waitForContainer(
  containerId: string,
  token: string,
  { orcamentoMs = ORCAMENTO_DE_VIDEO_MS }: { orcamentoMs?: number } = {},
): Promise<void> {
  const limite = Date.now() + orcamentoMs;
  let espera = ESPERA_INICIAL_MS;

  for (;;) {
    const res = await graphGet<{ status_code?: string }>(containerId, token, {
      fields: "status_code",
    });
    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR") throw new Error("Falha ao processar a mídia (ERROR)");

    const pausa = comJitter(espera);
    // Sem tempo para mais uma conferência: para aqui em vez de gastar uma
    // chamada que já nasce fora do orçamento.
    if (Date.now() + pausa >= limite) break;
    await new Promise((r) => setTimeout(r, pausa));
    espera = Math.min(ESPERA_MAXIMA_MS, espera * FATOR_DO_BACKOFF);
  }
  throw new Error("Tempo esgotado ao processar a mídia");
}

// ─── Instagram ───────────────────────────────────────────────────────────────

async function publishInstagram(
  igUserId: string,
  token: string,
  input: PublishInput,
): Promise<PublishResult> {
  const format = input.format ?? "feed";

  // ── CARROSSEL ─────────────────────────────────────────────────────────────
  // Fluxo próprio, e não um `if` a mais no de baixo: o carrossel exige criar um
  // container POR IMAGEM (cada um com `is_carousel_item`), esperar todos, e só
  // então criar o container-pai. Legenda vai só no pai — repetir nos filhos faz
  // a Meta recusar.
  if (format === "carousel") {
    const urls = (input.mediaUrls ?? []).filter(Boolean);
    // A Meta aceita de 2 a 10. Publicar "carrossel" com uma imagem só é
    // entregar um post de feed com nome errado.
    if (urls.length < 2) return { ok: false, error: "carrossel precisa de pelo menos 2 imagens" };
    if (urls.length > 10) urls.length = 10;

    const filhos: string[] = [];
    for (const url of urls) {
      const filho = await graphPost<{ id: string }>(`${igUserId}/media`, token, {
        image_url: url,
        is_carousel_item: "true",
      });
      filhos.push(filho.id);
    }
    // Cada filho precisa estar processado ANTES de o pai ser criado. Criar o
    // pai com um filho ainda em processamento derruba o carrossel inteiro.
    // Sequencial e com orçamento de IMAGEM: filho de carrossel é foto, e foto
    // costuma sair FINISHED na primeira conferência (uma chamada por filho).
    for (const id of filhos) await waitForContainer(id, token, { orcamentoMs: ORCAMENTO_DE_IMAGEM_MS });

    const pai = await graphPost<{ id: string }>(`${igUserId}/media`, token, {
      media_type: "CAROUSEL",
      children: filhos.join(","),
      ...(input.caption ? { caption: input.caption } : {}),
    });
    await waitForContainer(pai.id, token);
    const publicado = await graphPost<{ id: string }>(`${igUserId}/media_publish`, token, {
      creation_id: pai.id,
    });

    let link: string | undefined;
    try {
      const m = await graphGet<{ permalink?: string }>(publicado.id, token, { fields: "permalink" });
      link = m.permalink;
    } catch { /* non-fatal */ }
    return { ok: true, externalPostId: publicado.id, permalink: link };
  }

  // 1. Create the media container.
  const containerParams: Record<string, string> = {};
  if (input.caption) containerParams.caption = input.caption;

  if (format === "reel" || format === "video") {
    if (!input.mediaUrl) return { ok: false, error: "mediaUrl (vídeo) obrigatório para reels" };
    containerParams.media_type = "REELS";
    containerParams.video_url = input.mediaUrl;
    if (input.thumbnailUrl) containerParams.cover_url = input.thumbnailUrl;
  } else if (format === "story") {
    if (!input.mediaUrl) return { ok: false, error: "mediaUrl obrigatório para stories" };
    containerParams.media_type = "STORIES";
    // Story aceita imagem OU vídeo, e o parâmetro é diferente para cada um.
    // Mandar um .mp4 em `image_url` faz a Meta aceitar o container e falhar na
    // publicação — erro que aparece tarde e sem explicação.
    if (/\.(mp4|mov|webm)(\?|$)/i.test(input.mediaUrl)) {
      containerParams.video_url = input.mediaUrl;
    } else {
      containerParams.image_url = input.mediaUrl;
    }
  } else {
    if (!input.mediaUrl) return { ok: false, error: "mediaUrl obrigatório para feed" };
    containerParams.image_url = input.mediaUrl;
  }

  const container = await graphPost<{ id: string }>(`${igUserId}/media`, token, containerParams);

  // 2. Wait for processing, then publish. Foto tem orçamento curto: esperar
  //    dois minutos por uma imagem é gastar conferência à toa.
  const ehVideo = containerParams.media_type === "REELS" || Boolean(containerParams.video_url);
  await waitForContainer(container.id, token, {
    orcamentoMs: ehVideo ? ORCAMENTO_DE_VIDEO_MS : ORCAMENTO_DE_IMAGEM_MS,
  });
  const published = await graphPost<{ id: string }>(`${igUserId}/media_publish`, token, {
    creation_id: container.id,
  });

  // 3. Fetch permalink (best-effort).
  let permalink: string | undefined;
  try {
    const media = await graphGet<{ permalink?: string }>(published.id, token, { fields: "permalink" });
    permalink = media.permalink;
  } catch { /* non-fatal */ }

  return { ok: true, externalPostId: published.id, permalink };
}

// ─── Facebook Page ─────────────────────────────────────────────────────────────

async function publishFacebook(
  pageId: string,
  token: string,
  input: PublishInput,
): Promise<PublishResult> {
  // Photo post when there's an image; otherwise a text/link feed post.
  if (input.mediaUrl && (input.format ?? "feed") !== "video") {
    const res = await graphPost<{ id: string; post_id?: string }>(`${pageId}/photos`, token, {
      url: input.mediaUrl,
      caption: input.caption ?? "",
    });
    return { ok: true, externalPostId: res.post_id ?? res.id };
  }
  const res = await graphPost<{ id: string }>(`${pageId}/feed`, token, {
    message: input.caption ?? "",
    ...(input.mediaUrl ? { link: input.mediaUrl } : {}),
  });
  return { ok: true, externalPostId: res.id };
}

// ─── Public: publishPost ────────────────────────────────────────────────────

export async function publishPost(
  workspaceId: string,
  input: PublishInput,
): Promise<PublishResult> {
  const conn = await loadConnectionToken(workspaceId, input.connectionId);
  if (!conn) return { ok: false, error: "Conexão Meta não encontrada ou token inválido" };

  // ── A TRAVA DE PUBLICAÇÃO — ANTES DE QUALQUER CHAMADA DE REDE ─────────────
  // Ver `trava-de-publicacao.ts` para o porquê inteiro. Em duas linhas: até
  // 07/08/2026 esta função publicava em QUALQUER perfil cuja conexão existisse,
  // sem consultar a lista de ativos autorizados e sem decisão de ninguém — e
  // faltavam nove horas para ela postar sozinha no @foocci_.
  //
  // O dono é DERIVADO da conexão (`conn.clientId`, já normalizado por
  // `loadConnectionToken`), nunca do chamador: `input` não tem — e não pode
  // ter — voz sobre de quem é o perfil.
  //
  // A recusa vira `{ ok: false, error }` em vez de exceção porque é assim que
  // `esteira/publicacao.ts` já sabe reagir: o post continua `scheduled`, o
  // motivo aparece em `lastError` e sobe ao painel como `publicacao_falhou`.
  // Trabalho pago não é enterrado — fica visível, esperando decisão.
  // 14/08/2026 — a TERCEIRA pergunta entrou aqui junto: "o cliente dono desta
  // peça a aprovou?". `input.postId` diz QUAL peça; quem a aprovou é lido do
  // registro de aprovação, nunca do chamador. Sem `postId` a trava recusa, e é
  // o comportamento desejado: publicação avulsa no perfil de um cliente não tem
  // quem a tenha aprovado, por construção.
  const parecer = await conferirPublicacao({
    workspaceId,
    clientId: conn.clientId,
    platform: conn.platform,
    externalId: conn.externalId,
    postId: input.postId ?? null,
  });
  if (!parecer.pode) return { ok: false, error: parecer.motivo };

  try {
    if (conn.platform === "instagram") {
      return await publishInstagram(conn.externalId, conn.token, input);
    }
    if (conn.platform === "facebook") {
      return await publishFacebook(conn.externalId, conn.token, input);
    }
    return { ok: false, error: `Publicação não suportada para ${conn.platform}` };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

// ─── Public: sendWhatsAppMessage ─────────────────────────────────────────────

function buildWhatsAppBody(input: WhatsAppMessageInput): Record<string, unknown> {
  const body: Record<string, unknown> = { messaging_product: "whatsapp", to: input.to };
  if (input.templateName) {
    body.type = "template";
    body.template = {
      name: input.templateName,
      language: { code: input.templateLanguage ?? "pt_BR" },
      ...(input.templateComponents ? { components: input.templateComponents } : {}),
    };
  } else {
    body.type = "text";
    body.text = { body: input.text ?? "" };
  }
  return body;
}

// Low-level send: post to /{phoneNumberId}/messages with a token. Used by both
// the stored-connection path and the env-var path.
export async function sendWhatsAppDirect(
  phoneNumberId: string,
  token: string,
  input: WhatsAppMessageInput,
): Promise<PublishResult> {
  try {
    const res = await graphPostJson<{ messages?: Array<{ id: string }> }>(
      `${phoneNumberId}/messages`,
      token,
      buildWhatsAppBody(input),
    );
    return { ok: true, externalPostId: res.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

export async function sendWhatsAppMessage(
  workspaceId: string,
  input: WhatsAppMessageInput,
): Promise<PublishResult> {
  const conn = await loadConnectionToken(workspaceId, input.connectionId);
  if (!conn) return { ok: false, error: "Conexão WhatsApp não encontrada ou token inválido" };
  if (conn.platform !== "whatsapp") return { ok: false, error: "Conexão não é do WhatsApp" };
  return sendWhatsAppDirect(conn.externalId, conn.token, input);
}
