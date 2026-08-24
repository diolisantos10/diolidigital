import type { ConsentimentoDeSaida } from "@/lib/agency/consentimento/prova";

// Shared types for the Meta integration (Instagram / Facebook / WhatsApp).
// SERVER-ONLY types are fine to import from client components (types are erased
// at build), but the modules that USE them (graph, oauth, client) are server-only.

export type MetaPlatform = "instagram" | "facebook" | "whatsapp" | "user";
/** "user" NÃO é uma rede social: é o acesso da PESSOA que conectou, guardado
 *  porque `me/adaccounts`, a autorização de conta de anúncio e a Marketing API
 *  exigem token de usuário — token de Página não serve. */

export const META_PLATFORMS: MetaPlatform[] = ["instagram", "facebook", "whatsapp"];

// A connected account as exposed to the UI / callers — NEVER includes the token.
export interface MetaConnectionView {
  id: string;
  platform: MetaPlatform;
  name: string;
  externalId: string;
  clientId: string | null;
  status: string;
  tokenHint: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  connectedAt: string;
  lastSyncedAt: string | null;
}

// The App-level credentials (App ID + App Secret) for the "Dioli Digital" app.
export interface MetaAppCredentials {
  appId: string;
  appSecret: string;
  source: "ui" | "env";
}

// ─── Publishing contract ────────────────────────────────────────────────────
// This is the interface the Planner / Social Agent / autonomous engine call.
// They describe WHAT to publish; this layer handles HOW (Graph API calls).

export interface PublishInput {
  // Which connected account to publish through.
  connectionId: string;
  /** QUAL peça está indo ao ar (`SocialPost.id`).
   *
   *  Obrigatório na prática desde 14/08/2026: `conferirPublicacao` pergunta se
   *  o CLIENTE DONO desta peça a aprovou (ordem do CEO — quem libera é o
   *  cliente, peça por peça), e essa pergunta não existe sem saber de que peça
   *  se trata. Continua opcional no TIPO para não fingir que um campo novo
   *  sempre existiu; ausente, a trava RECUSA — não presume.
   *
   *  Ele aponta a peça e só isso. Quem a aprovou se lê no registro de
   *  aprovação, nunca no que o chamador diz. */
  postId?: string;
  // instagram | facebook — WhatsApp uses sendWhatsAppMessage instead.
  platform: MetaPlatform;
  // feed | reel | story (Instagram) — Facebook currently supports feed.
  format?: "feed" | "reel" | "story" | "carousel" | "video";
  // The text caption / message.
  caption?: string;
  // Public URL(s) to the creative. Meta fetches media from a URL it can reach.
  mediaUrl?: string;
  mediaUrls?: string[]; // for carousels
  // Optional cover / thumbnail for reels/video.
  thumbnailUrl?: string;
}

export interface PublishResult {
  ok: boolean;
  // The published post/media id on Meta's side, when successful.
  externalPostId?: string;
  permalink?: string;
  error?: string;
}

/**
 * @deprecated Órfão desde 04/08/2026, quando `getInsights` foi removido de
 * `client.ts`. `impressions` está DESCONTINUADA na Graph e este shape não
 * distingue "não medi" de "deu zero". Use `MetricasDaConta` de `./leitura`.
 */
export interface InsightsResult {
  ok: boolean;
  // Normalized headline metrics for the portal. Raw payload kept under `raw`.
  followers?: number;
  reach?: number;
  impressions?: number;
  engagement?: number;
  raw?: unknown;
  error?: string;
}

export interface WhatsAppMessageInput {
  connectionId: string;
  /**
   * ⛔ OBRIGATÓRIO. Isto é RESPOSTA (a pessoa escreveu para a marca) ou
   * ABORDAGEM (a casa fala primeiro)? E, sendo abordagem, qual é a prova do
   * consentimento?
   *
   * É campo obrigatório de propósito: **a próxima porta de disparo que alguém
   * abrir sem declarar consentimento não compila.** Ver
   * `lib/agency/consentimento/prova.ts` — o Farol 27 mediu ~6 mil contatos
   * declarados sem comprovação, e nada no código barrava o uso deles.
   */
  consentimento: ConsentimentoDeSaida;
  to: string; // E.164 phone number, e.g. "5511999998888"
  // Either a free-form text (only inside the 24h window) or a template.
  text?: string;
  templateName?: string;
  templateLanguage?: string; // e.g. "pt_BR"
  templateComponents?: unknown[];
}
