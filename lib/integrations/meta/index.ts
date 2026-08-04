// Public surface of the Meta integration — the "contrato de encaixe".
// The Planner, Social Agent, autonomous engine and portal import from here.
//
//   import { publishPost, sendWhatsAppMessage } from "@/lib/integrations/meta";
//
// LEITURA de métricas NÃO sai daqui: é `@/lib/integrations/meta/leitura`
// (`lerMetricasDaConta`, `lerFeedDoCliente`, `lerMetricasDosPosts`).
// `getInsights` foi removido em 04/08/2026 — pedia métrica descontinuada (impressions) e lia o valor de um dia.

export {
  publishPost,
  sendWhatsAppMessage,
  sendWhatsAppDirect,
} from "./client";

export {
  resolveMetaAppCredentials,
  isMetaConfigured,
  META_INTEGRATION_ID,
  GRAPH_VERSION,
  DEFAULT_SCOPES,
} from "./config";

export {
  listConnections,
  saveConnection,
  loadConnectionToken,
  deleteConnection,
} from "./connections";

export { verifyWebhookSignature } from "./webhooks";

export { dispatchWhatsAppNotifications } from "./notifications";
export type { DispatchResult } from "./notifications";

export {
  ALL_TEMPLATES,
  PROPOSAL_SENT_TEMPLATE,
  createTemplate,
  listTemplates,
} from "./templates";

export type {
  MetaPlatform,
  MetaConnectionView,
  MetaAppCredentials,
  PublishInput,
  PublishResult,
  WhatsAppMessageInput,
} from "./types";
