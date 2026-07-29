// Public surface of the Meta integration — the "contrato de encaixe".
// The Planner, Social Agent, autonomous engine and portal import from here.
//
//   import { publishPost, getInsights, sendWhatsAppMessage } from "@/lib/integrations/meta";

export {
  publishPost,
  getInsights,
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
  InsightsResult,
  WhatsAppMessageInput,
} from "./types";
