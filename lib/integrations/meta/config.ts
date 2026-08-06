// Central resolver for the Meta APP credentials (App ID + App Secret) of the
// "Dioli Digital" app. SERVER-ONLY.
//
// Mirrors lib/ai/resolve-key.ts exactly:
//   1. Credentials saved through the Integrations UI (encrypted in the DB) win.
//   2. Environment variables (META_APP_ID / META_APP_SECRET) are the fallback.
//
// This lets the non-technical owner paste the App ID/Secret in the UI without
// touching env vars, while a Railway env-based setup keeps working unchanged.

import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/security/crypto";
import type { MetaAppCredentials } from "./types";

// The DbIntegrationConfig row key that stores the Meta App credentials.
//   apiKeyEncrypted -> App Secret (encrypted)
//   accountId       -> App ID (public, not a secret)
export const META_INTEGRATION_ID = "int-meta";

// Graph API version. Overridable via env so we can bump without a code change.
export const GRAPH_VERSION = (process.env.META_GRAPH_VERSION?.trim() || "v21.0").replace(/^\/?/, "");
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// OAuth authorize endpoint (Facebook Login).
export const FB_OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// As permissões que pedimos ao cliente na hora de conectar. Cobrem publicação e
// métricas do Instagram, gestão de páginas do Facebook, WhatsApp e — desde
// 02/08/2026 — ANÚNCIOS.
//
// Por que os dois de anúncio entram AGORA, antes de existir código que os use:
// `ads_management` e `ads_read` são permissões AVANÇADAS. A Meta só as libera
// via App Review, com justificativa e vídeo de demonstração, e a análise leva
// dias. Pedir depois de o código estar pronto significaria construir tudo e
// esperar. Pedindo já, a espera da Meta corre em paralelo com o trabalho.
//
// A consequência de NÃO ter estes dois é absoluta e não tem contorno: sem eles
// a Meta recusa qualquer chamada de anúncio — com token válido, conta conectada
// e tudo no lugar. Não existe gestão de tráfego pago sem esta linha.
// ── 06/08/2026: TRÊS PERMISSÕES SAÍRAM, E QUEM MANDOU TIRAR FOI A META ──────
//
// O CEO clicou em conectar e o diálogo respondeu, com os nomes:
//   "Invalid Scopes: email, pages_manage_posts, read_insights."
//
// Este app usa **Login do Facebook para Empresas**, e ali o diálogo só aceita o
// que está na configuração do caso de uso — `email` nem existe nesse fluxo. A
// própria Meta avisa que "usuários do app vão ignorar estas permissões", ou
// seja: pedir não dava erro fatal, dava **silêncio**. Permissão pedida e
// ignorada é a pior forma de falha, porque a casa acha que tem acesso e
// descobre que não na hora de publicar em nome do cliente.
//
// As três saíram pelo nome que a Meta deu, não por dedução nossa. O que a
// publicação em Página precisar vem da configuração do caso de uso — e se
// faltar, a conexão diz o que faltou em vez de tentar e morrer calada.
export const DEFAULT_SCOPES = [
  "public_profile",
  // Facebook — páginas
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
  // Instagram — publicar, medir, moderar
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
  // WhatsApp — atendimento
  "whatsapp_business_management",
  "whatsapp_business_messaging",
  // Anúncios — criar/pausar campanha e ler desempenho pago.
  // AVANÇADAS: exigem App Review aprovado para funcionar fora das contas do
  // próprio administrador do app.
  "ads_management",
  "ads_read",
];

/** As permissões que a Meta classifica como AVANÇADAS — só funcionam depois do
 *  App Review aprovado. Existe como lista para a tela poder dizer ao operador
 *  "isto aqui ainda depende da Meta", em vez de a conexão falhar sem explicação. */
export const SCOPES_QUE_EXIGEM_APP_REVIEW = [
  "ads_management",
  "ads_read",
  "instagram_content_publish",
  "instagram_manage_insights",
  "whatsapp_business_messaging",
  "business_management",
];

// Resolves the Meta App credentials for a workspace. Returns null when neither
// the UI vault nor env vars have both an App ID and App Secret.
export async function resolveMetaAppCredentials(
  workspaceId?: string,
): Promise<MetaAppCredentials | null> {
  try {
    const row = workspaceId
      ? await prisma.dbIntegrationConfig.findUnique({
          where: { workspaceId_integrationId: { workspaceId, integrationId: META_INTEGRATION_ID } },
        })
      : await prisma.dbIntegrationConfig.findFirst({
          where: { integrationId: META_INTEGRATION_ID, apiKeyEncrypted: { not: null } },
        });

    if (row?.apiKeyEncrypted && row.accountId) {
      const appSecret = decryptSecret(row.apiKeyEncrypted);
      if (appSecret) {
        return { appId: row.accountId, appSecret, source: "ui" };
      }
    }
  } catch {
    // DB unavailable — fall through to env.
  }

  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (appId && appSecret) return { appId, appSecret, source: "env" };

  return null;
}

export async function isMetaConfigured(workspaceId?: string): Promise<boolean> {
  return (await resolveMetaAppCredentials(workspaceId)) !== null;
}

// WhatsApp Cloud API sender resolved from environment variables. This is the
// zero-UI path: set META_WHATSAPP_PHONE_ID / META_WHATSAPP_TOKEN (+ optional
// META_WHATSAPP_WABA_ID) in Railway and the notifier + template tools work
// without a stored MetaConnection row. A DB connection (when present) wins.
export interface WhatsAppEnvSender {
  phoneNumberId: string;
  token: string;
  wabaId: string;
}
export function resolveWhatsAppEnv(): WhatsAppEnvSender | null {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_ID?.trim();
  const token = process.env.META_WHATSAPP_TOKEN?.trim();
  const wabaId = process.env.META_WHATSAPP_WABA_ID?.trim() ?? "";
  if (phoneNumberId && token) return { phoneNumberId, token, wabaId };
  return null;
}

// O token que valida a assinatura do webhook (o desafio do GET).
//
// ⚠️ NÃO TEM MAIS DEFAULT, e isso é o conserto. O valor caía em
// "dioli-meta-webhook" quando a env faltava — um segredo publicado no
// repositório, igual em qualquer clone, que permitiria a um terceiro assinar
// nossa URL de webhook no app dele. Segredo com valor padrão no código não é
// segredo: é uma senha compartilhada com quem lê o GitHub.
//
// Sem a env, devolve null e o desafio é recusado (403). Configuração faltando
// vira porta FECHADA, nunca porta aberta.
export function webhookVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null;
}

/**
 * O MESMO TOKEN, mas resolvido também pelo COFRE — para o segredo poder ser
 * definido de dentro do nosso painel, sem depender do painel do provedor de
 * hospedagem.
 *
 * Por que isto passou a existir em 05/08/2026: a verificação do webhook da Meta
 * exigia uma variável de ambiente, e variável de ambiente só quem tem acesso ao
 * Railway define. Resultado: uma tela do produto ficava bloqueada por uma senha
 * que mora fora do produto. Configuração de integração pertence à integração.
 *
 * A ordem é deliberada: AMBIENTE primeiro, cofre depois. Quem tem acesso à
 * infraestrutura manda mais do que quem tem acesso ao painel — e assim uma
 * conta de painel comprometida não redireciona o webhook da casa.
 *
 * Sem nenhum dos dois, continua devolvendo null: configuração faltando é porta
 * FECHADA, e o desafio da Meta é recusado com 403.
 */
export async function resolverWebhookVerifyToken(workspaceId?: string): Promise<string | null> {
  const doAmbiente = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (doAmbiente) return doAmbiente;

  try {
    // O webhook chega SEM sessão: sem workspace conhecido, vale a única
    // configuração de Meta que existir na base. Com duas, não se adivinha.
    const linhas = workspaceId
      ? await prisma.dbIntegrationConfig.findMany({
          where: { workspaceId, integrationId: META_INTEGRATION_ID, webhookUrl: { not: null } },
          take: 2,
        })
      : await prisma.dbIntegrationConfig.findMany({
          where: { integrationId: META_INTEGRATION_ID, webhookUrl: { not: null } },
          take: 2,
        });
    if (linhas.length !== 1) return null;
    // `webhookUrl` guarda o token de verificação: coluna já existente, sem
    // migration nova. O nome vem de antes; o comentário evita a confusão.
    return linhas[0]!.webhookUrl?.trim() || null;
  } catch {
    return null;
  }
}
