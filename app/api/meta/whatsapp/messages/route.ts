// WhatsApp single-inbox API.
//   GET                 — list conversation threads (one per contact).
//   GET ?contact=<waId> — list the messages of one thread.
//   POST                — reply to a contact with free-form text (only valid
//                         inside the 24h customer-service window). Records the
//                         outbound message. Master only.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { sendWhatsAppDirect } from "@/lib/integrations/meta/client";
import { loadConnectionToken } from "@/lib/integrations/meta/connections";
import { resolveWhatsAppEnv } from "@/lib/integrations/meta/config";
import { listThreads, listMessages, recordOutbound } from "@/lib/integrations/meta/inbox";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { provaParaTelefone } from "@/lib/agency/consentimento/quem-pode-receber";

// Resolve the sending number + token for a workspace: stored connection wins,
// else env vars.
async function resolveSender(workspaceId: string): Promise<{ phoneNumberId: string; token: string } | null> {
  const conn = await prisma.metaConnection.findFirst({
    where: { workspaceId, platform: "whatsapp", status: "connected" },
    orderBy: { connectedAt: "desc" },
  });
  if (conn) {
    const loaded = await loadConnectionToken(workspaceId, conn.id);
    if (loaded) return { phoneNumberId: loaded.externalId, token: loaded.token };
  }
  const env = resolveWhatsAppEnv();
  if (env) return { phoneNumberId: env.phoneNumberId, token: env.token };
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = request.nextUrl.searchParams.get("contact");
  if (contact) {
    const messages = await listMessages(session.workspaceId, contact);
    return NextResponse.json({ contact, messages });
  }
  const threads = await listThreads(session.workspaceId);
  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // FAIXA 1 do CSRF: forjar este POST dispara WhatsApp real em nome da agência.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const body = (await request.json()) as { contactWaId?: string; text?: string };
  const contactWaId = (body.contactWaId ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!contactWaId || !text) {
    return NextResponse.json({ error: "contactWaId e text são obrigatórios" }, { status: 400 });
  }

  const sender = await resolveSender(session.workspaceId);
  if (!sender) return NextResponse.json({ error: "Nenhum número WhatsApp conectado" }, { status: 503 });

  // ── RESPOSTA NÃO É ABORDAGEM, E A DIFERENÇA É CONFERIDA (24/08/2026) ──────
  // Esta caixa responde quem escreveu para a marca — e responder é o que a
  // pessoa pediu. Mas "é resposta" não pode ser afirmação de quem clica: o
  // resolvedor procura a mensagem RECEBIDA daquele contato. Achou, é resposta e
  // sai. Não achou, a caixa está sendo usada para abordar um número que nunca
  // falou com a marca — exatamente o que uma base importada faz — e aí a trava
  // fecha, dizendo o que falta.
  const consentimento = await provaParaTelefone(session.workspaceId, contactWaId);
  const send = await sendWhatsAppDirect(sender.phoneNumberId, sender.token, {
    connectionId: "", to: contactWaId, text, consentimento,
  });
  if (!send.ok) return NextResponse.json({ ok: false, error: send.error }, { status: 400 });

  await recordOutbound({
    workspaceId: session.workspaceId,
    phoneNumberId: sender.phoneNumberId,
    contactWaId,
    body: text,
    externalId: send.externalPostId,
    status: "sent",
  });

  return NextResponse.json({ ok: true, messageId: send.externalPostId });
}
