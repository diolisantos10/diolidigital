// ─── THE CONTRACT ────────────────────────────────────────────────────────────
// This module is the clean interface the Planner, Social Agent, and autonomous
// engine call. They describe WHAT to publish / WHICH account to read; this
// layer performs the real Graph API work (create media container → publish,
// read insights, send WhatsApp). SERVER-ONLY.
//
//   await publishPost({ connectionId, platform, format, caption, mediaUrl })
//   await getInsights(connectionId)
//   await sendWhatsAppMessage({ connectionId, to, text })

import { graphGet, graphPost, graphPostJson, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";
import type {
  PublishInput,
  PublishResult,
  InsightsResult,
  WhatsAppMessageInput,
} from "./types";

function errMessage(e: unknown): string {
  if (e instanceof GraphApiError) return e.detail?.message ?? e.message;
  if (e instanceof Error) return e.message;
  return "erro desconhecido";
}

// Wait until an IG media container is ready to publish (videos/reels process
// asynchronously). Images are usually FINISHED immediately.
async function waitForContainer(
  containerId: string,
  token: string,
  { attempts = 12, delayMs = 2500 }: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await graphGet<{ status_code?: string }>(containerId, token, {
      fields: "status_code",
    });
    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR") throw new Error("Falha ao processar a mídia (ERROR)");
    await new Promise((r) => setTimeout(r, delayMs));
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
    for (const id of filhos) await waitForContainer(id, token);

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

  // 2. Wait for processing, then publish.
  await waitForContainer(container.id, token);
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

// ─── Public: getInsights ────────────────────────────────────────────────────

export async function getInsights(
  workspaceId: string,
  connectionId: string,
): Promise<InsightsResult> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, error: "Conexão Meta não encontrada ou token inválido" };

  try {
    if (conn.platform === "instagram") {
      const profile = await graphGet<{ followers_count?: number; media_count?: number }>(
        conn.externalId,
        conn.token,
        { fields: "followers_count,media_count" },
      );
      let reach: number | undefined;
      let impressions: number | undefined;
      try {
        const ins = await graphGet<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
          `${conn.externalId}/insights`,
          conn.token,
          { metric: "reach,impressions", period: "day" },
        );
        for (const m of ins.data ?? []) {
          const v = m.values?.[0]?.value;
          if (m.name === "reach") reach = v;
          if (m.name === "impressions") impressions = v;
        }
      } catch { /* insights may need extra permissions — non-fatal */ }
      return {
        ok: true,
        followers: profile.followers_count,
        reach,
        impressions,
        raw: profile,
      };
    }

    if (conn.platform === "facebook") {
      const page = await graphGet<{ fan_count?: number; followers_count?: number }>(
        conn.externalId,
        conn.token,
        { fields: "fan_count,followers_count" },
      );
      return { ok: true, followers: page.followers_count ?? page.fan_count, raw: page };
    }

    return { ok: false, error: `Insights não suportado para ${conn.platform}` };
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
