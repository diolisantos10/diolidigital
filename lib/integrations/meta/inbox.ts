// WhatsApp single-inbox: persist + read the conversation history so the agency
// answers clients from inside the system using ONE number. SERVER-ONLY.
//
// Inbound messages are written by the webhook (app/api/meta/webhooks); outbound
// by the reply endpoint (app/api/meta/whatsapp/messages POST). Both go through
// here so storage + dedupe are consistent.

import { prisma } from "@/lib/db/client";

// Resolve which workspace a WhatsApp number belongs to.
//
// ─── POR QUE O ATALHO ANTIGO ERA UM VAZAMENTO ───────────────────────────────
// Era `agencyWorkspace.findFirst()`: sem conexão registrada para o
// phone-number-id, a mensagem caía no PRIMEIRO workspace do banco. Mensagem de
// WhatsApp é telefone + texto — dado pessoal de uma pessoa que escreveu para
// OUTRA empresa. Com um inquilino só, o atalho era invisível; no segundo, é
// PII de cliente aparecendo na caixa de entrada de quem não deveria vê-la, e
// nada no sistema avisaria.
//
// Agora o palpite só vale quando não há palpite possível: se existe UM único
// workspace no banco, "o primeiro" e "o certo" são a mesma coisa. A partir do
// segundo, número desconhecido devolve `null` — e o webhook já sabe ignorar
// (app/api/meta/webhooks/route.ts: `if (!workspaceId) continue`). Perder uma
// mensagem de origem desconhecida é reversível; entregá-la ao inquilino errado
// não é.
export async function resolveWorkspaceForPhone(phoneNumberId: string): Promise<string | null> {
  const conn = await prisma.metaConnection.findFirst({
    where: { platform: "whatsapp", externalId: phoneNumberId },
  });
  if (conn) return conn.workspaceId;

  // Dois basta para saber que há ambiguidade — não precisamos contar o banco
  // inteiro para decidir não adivinhar.
  const workspaces = await prisma.agencyWorkspace.findMany({ select: { id: true }, take: 2 });
  if (workspaces.length === 1) return workspaces[0].id;
  return null;
}

interface InboundInput {
  workspaceId: string;
  phoneNumberId: string;
  contactWaId: string;
  contactName?: string;
  type?: string;
  body?: string;
  externalId?: string;
  timestamp?: Date;
}

// Idempotent on externalId (Meta re-delivers webhooks).
export async function recordInbound(input: InboundInput): Promise<void> {
  if (input.externalId) {
    const existing = await prisma.whatsAppMessage.findFirst({ where: { externalId: input.externalId } });
    if (existing) return;
  }
  await prisma.whatsAppMessage.create({
    data: {
      workspaceId: input.workspaceId,
      phoneNumberId: input.phoneNumberId,
      contactWaId: input.contactWaId,
      contactName: input.contactName ?? null,
      direction: "in",
      type: input.type ?? "text",
      body: input.body ?? "",
      externalId: input.externalId ?? null,
      timestamp: input.timestamp ?? new Date(),
    },
  });
}

interface OutboundInput {
  workspaceId: string;
  phoneNumberId: string;
  contactWaId: string;
  type?: string;
  body?: string;
  externalId?: string;
  status?: string;
}

export async function recordOutbound(input: OutboundInput): Promise<void> {
  await prisma.whatsAppMessage.create({
    data: {
      workspaceId: input.workspaceId,
      phoneNumberId: input.phoneNumberId,
      contactWaId: input.contactWaId,
      direction: "out",
      type: input.type ?? "text",
      body: input.body ?? "",
      externalId: input.externalId ?? null,
      status: input.status ?? "sent",
    },
  });
}

// Update the delivery status of an outbound message (from status webhooks).
export async function updateMessageStatus(externalId: string, status: string): Promise<void> {
  await prisma.whatsAppMessage.updateMany({ where: { externalId }, data: { status } });
}

export interface InboxThread {
  contactWaId: string;
  contactName: string | null;
  lastBody: string;
  lastDirection: string;
  lastAt: string;
  unread: number;
}

// One entry per contact, most-recent first (a lightweight thread list).
export async function listThreads(workspaceId: string, limit = 50): Promise<InboxThread[]> {
  const rows = await prisma.whatsAppMessage.findMany({
    where: { workspaceId },
    orderBy: { timestamp: "desc" },
    take: 500,
  });
  const byContact = new Map<string, InboxThread>();
  for (const m of rows) {
    if (!byContact.has(m.contactWaId)) {
      byContact.set(m.contactWaId, {
        contactWaId: m.contactWaId,
        contactName: m.contactName,
        lastBody: m.body,
        lastDirection: m.direction,
        lastAt: m.timestamp.toISOString(),
        unread: 0,
      });
    }
  }
  return Array.from(byContact.values()).slice(0, limit);
}

export async function listMessages(
  workspaceId: string,
  contactWaId: string,
  limit = 100,
): Promise<Array<{ id: string; direction: string; body: string; type: string; status: string | null; at: string }>> {
  const rows = await prisma.whatsAppMessage.findMany({
    where: { workspaceId, contactWaId },
    orderBy: { timestamp: "asc" },
    take: limit,
  });
  return rows.map((m) => ({
    id: m.id,
    direction: m.direction,
    body: m.body,
    type: m.type,
    status: m.status,
    at: m.timestamp.toISOString(),
  }));
}
