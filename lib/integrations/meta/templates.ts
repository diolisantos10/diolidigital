// WhatsApp message templates for business-initiated (proactive) messages.
// SERVER-ONLY.
//
// WhatsApp REQUIRES an approved template for any message sent OUTSIDE the 24h
// customer-service window (which is our case: we notify the client when the
// proposal is ready). Free-form text would be rejected. These templates are
// submitted to Meta for approval via createTemplate() and then used by
// sendWhatsAppMessage({ templateName, ... }).

import { graphGet, graphPost } from "./graph";

export interface TemplateDefinition {
  name: string;
  language: string; // e.g. "pt_BR"
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  // Number of {{n}} variables in the body, in order.
  bodyText: string;
  example: string[]; // one example value per variable, for Meta's review
}

// The proposal-ready notification.
//   {{1}} = nome do cliente
//   {{2}} = link do portal
export const PROPOSAL_SENT_TEMPLATE: TemplateDefinition = {
  name: "proposta_pronta",
  language: "pt_BR",
  category: "UTILITY",
  bodyText:
    "Oi {{1}}! Sua proposta da Dioli já está pronta no seu portal. É só abrir e conferir: {{2}} 💛",
  example: ["Marina", "https://dioli-agency-os-1-production.up.railway.app/portal/access/abc123"],
};

export const ALL_TEMPLATES: TemplateDefinition[] = [PROPOSAL_SENT_TEMPLATE];

// Submit a template to Meta for approval under a WhatsApp Business Account.
// Returns { id, status } (status is usually PENDING right after submission).
export async function createTemplate(
  wabaId: string,
  token: string,
  def: TemplateDefinition,
): Promise<{ id?: string; status?: string; error?: string }> {
  try {
    const res = await graphPost<{ id: string; status: string }>(
      `${wabaId}/message_templates`,
      token,
      {
        name: def.name,
        language: def.language,
        category: def.category,
        components: JSON.stringify([
          {
            type: "BODY",
            text: def.bodyText,
            example: { body_text: [def.example] },
          },
        ]),
      },
    );
    return { id: res.id, status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "erro ao criar template" };
  }
}

// List templates already registered under a WABA (name + status).
export async function listTemplates(
  wabaId: string,
  token: string,
): Promise<Array<{ name: string; status: string; language: string }>> {
  const res = await graphGet<{ data?: Array<{ name: string; status: string; language: string }> }>(
    `${wabaId}/message_templates`,
    token,
    { fields: "name,status,language", limit: 100 },
  );
  return res.data ?? [];
}
