// POST /api/portal/messages/suggest
//
// Drafts a warm, professional message from the agency team to the client, so
// the PM just reviews, tweaks and sends instead of writing from scratch.
// Team-only (session). Grounded in the client's name, the thread so far, and an
// optional "situation" hint (e.g. "o escopo acabou de ser aprovado").

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { generate } from "@/lib/ai/generate";
import { conversaDoCliente, conversaDaSolicitacao, solicitacaoDoWorkspace } from "@/app/api/messages/conversa";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "executivo_comercial", "social_staff", "design_staff", "ads_staff"]);
  if (error) return error;

  // FAIXA 1 do CSRF: gasta a chave de IA da agência a cada chamada.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : "";
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!clientRequestId && !clientId) {
    return NextResponse.json({ error: "clientId ou clientRequestId obrigatório" }, { status: 400 });
  }

  // A conversa é do CLIENTE, não da solicitação — a mesma âncora que a rota de
  // mensagens usa. Sem isto, o "✨ Sugerir mensagem" só existia para cliente
  // vindo de briefing: no cliente direto ele nunca teria contexto nenhum.
  let conversa;
  let businessName: string;
  if (clientId) {
    const dono = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: session.workspaceId },
      select: { id: true, name: true },
    });
    if (!dono) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    conversa = await conversaDoCliente(dono.id);
    businessName = dono.name || "o cliente";
  } else {
    const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
    if (!req) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
    if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
    }
    conversa = await conversaDaSolicitacao(clientRequestId);
    businessName = req.businessName || "o cliente";
  }

  // Last few messages for tone/continuity (most recent thread state).
  const recent = conversa.filtro
    ? await prisma.portalMessage.findMany({
        where: conversa.filtro,
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { authorRole: true, body: true },
      })
    : [];
  const thread = recent.reverse()
    .map((m) => `${m.authorRole === "client" ? "Cliente" : "Equipe"}: ${m.body}`)
    .join("\n");

  const system = `Você é um Project Manager sênior da Dioli Digital escrevendo para um cliente pelo canal de atendimento.
Tom: caloroso, profissional, humano e objetivo. Português do Brasil.
Escreva UMA mensagem curta (2 a 4 frases), pronta para enviar. Sem assinatura, sem "Prezado", sem formalidade exagerada — como uma pessoa atenciosa escreve no dia a dia.
Responda SOMENTE com JSON válido: {"message": "..."}`;

  const user = `Cliente: ${businessName}.
${context ? `Situação: ${context}` : "Situação: dar um retorno/atualização ao cliente."}
${thread ? `\nÚltimas mensagens da conversa (para continuidade de tom):\n${thread}` : ""}

Escreva a mensagem da equipe para o cliente agora.`;

  const result = await generate({
    system, user,
    maxTokens: 400,
    workspaceId: session.workspaceId,
    preferredProvider: "claude",
    agentId: "portal-sugestao",
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  const data = result.data as Record<string, unknown>;
  const message = typeof data.message === "string" ? data.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Resposta vazia da IA" }, { status: 502 });
  return NextResponse.json({ message });
}
