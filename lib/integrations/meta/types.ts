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
  /**
   * 1C-C1 (27/09/2026) — parecer do `meta`, PODE COM AJUSTE. Contas de
   * terceiro citadas como colaboração/marca parceira na peça (o "Tag
   * collaborator" do Instagram — a pessoa marcada vira coautora do post no
   * feed dela também). Regras do parecer, aplicadas em `client.ts`:
   *
   *   • 1 a 3 usernames, sem "@", `[A-Za-z0-9._]{1,30}` cada;
   *   • só em feed de imagem, carrossel e reels — em STORY é ignorado (e
   *     registrado no resultado, nunca enviado à Meta);
   *   • no carrossel, vai no contêiner PAI — a doc oficial não confirma isso
   *     para certo, então a resposta crua da Meta é capturada em
   *     `PublishResult.collabResponse` para o primeiro uso real confirmar.
   *
   * A FONTE de quem entra aqui é o pacote da marca
   * (`pacote.colaboradores`, `esteira/pacote-da-marca.ts`) — este tipo só
   * carrega o que o chamador já decidiu enviar.
   */
  collaborators?: string[];
}

export interface PublishResult {
  ok: boolean;
  // The published post/media id on Meta's side, when successful.
  externalPostId?: string;
  permalink?: string;
  error?: string;
  /** 27/09/2026 — IDEMPOTÊNCIA: `true` quando o erro aconteceu DURANTE ou
   *  DEPOIS da chamada de `media_publish` (o pedido que efetivamente coloca a
   *  peça no ar), e por isso não dá para afirmar que ela NÃO foi publicada —
   *  a exceção pode ter vindo depois de a Meta já ter aceitado o pedido.
   *  Ausente/`false` = falha CLARA, antes de qualquer `media_publish` (criação
   *  de container, validação, trava da casa): sabemos que nada foi ao ar.
   *  Quem lê isto (`lib/agency/esteira/publicacao.ts`) usa para decidir entre
   *  devolver a peça para "scheduled" (falha clara, pode tentar de novo) ou
   *  parar para conferência humana em "publish_unknown" (ambígua — nunca
   *  reenviada sozinha, para não publicar a mesma peça duas vezes). */
  talvezPublicado?: boolean;
  /**
   * 1C-C1 (27/09/2026) — os usernames de `collaborators` que o pedido trazia
   * mas que NÃO foram enviados à Meta porque o formato é `story` (o parecer
   * do `meta` fecha essa porta). `undefined` = ou não veio `collaborators`,
   * ou o formato aceitava e eles foram enviados. Existe para "ignora" nunca
   * ser silencioso — quem chamou consegue ver que o pedido foi descartado.
   */
  collaboratorsIgnorados?: string[];
  /**
   * 1C-C1 (27/09/2026) — a resposta CRUA da Meta na criação do contêiner que
   * recebeu `collaborators` (o pai, no carrossel; o único contêiner, em feed
   * e reels). A doc oficial não confirma em qual contêiner do carrossel o
   * parâmetro realmente é aplicado nem o que a Meta ecoa de volta — isto
   * existe para o primeiro uso real em produção confirmar, sem precisar
   * reproduzir a chamada. `undefined` quando `collaborators` não foi enviado.
   */
  collabResponse?: unknown;
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
