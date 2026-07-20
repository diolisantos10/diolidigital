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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "executivo_comercial", "social_staff", "design_staff", "ads_staff"]);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!clientRequestId) return NextResponse.json({ error: "clientRequestId obrigatório" }, { status: 400 });

  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  // Last few messages for tone/continuity (most recent thread state).
  const recent = await prisma.portalMessage.findMany({
    where: { clientRequestId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { authorRole: true, body: true },
  });
  const thread = recent.reverse()
    .map((m) => `${m.authorRole === "client" ? "Cliente" : "Equipe"}: ${m.body}`)
    .join("\n");

  const businessName = req.businessName || "o cliente";

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
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  const data = result.data as Record<string, unknown>;
  const message = typeof data.message === "string" ? data.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Resposta vazia da IA" }, { status: 502 });
  return NextResponse.json({ message });
}
