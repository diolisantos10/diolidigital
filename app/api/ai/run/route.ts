import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAgencyRole } from "@/lib/auth/session";
import { isOpenAIConfigured, callOpenAI } from "@/lib/ai/openai-provider";
import {
  buildMessages,
  isOpenAIDepartment,
  validateStrategyOutput,
  validateSocialOutput,
  validatePMOutput,
  type AIRunContext,
} from "@/lib/agency/intelligence/openai-schemas";

// GET — non-secret provider status for UI + System Doctor.
// Returns only a boolean; never the key. Requires an internal session.
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ openaiConfigured: isOpenAIConfigured() });
}

// POST — run department intelligence through OpenAI (server-side only).
// Falls back gracefully: returns mode:"fallback" with a reason whenever the key
// is missing, the call fails, or the response is invalid. The client then runs
// the rule-based engine locally. Never exposes the API key.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  // Block unauthenticated AND client-portal users — only internal agency roles.
  if (!session || session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    departmentId?: string;
    projectId?: string;
    provider?: string;
    context?: AIRunContext;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { departmentId, provider, context } = body;

  if (!departmentId || !isOpenAIDepartment(departmentId)) {
    return NextResponse.json(
      { error: "departmentId must be one of: strategy, social-media, project-management" },
      { status: 400 },
    );
  }
  if (provider !== "openai") {
    return NextResponse.json({ error: "This route only handles provider=openai" }, { status: 400 });
  }
  if (!context || typeof context !== "object" || !context.prompt) {
    return NextResponse.json({ error: "context with prompt is required" }, { status: 400 });
  }

  // Key missing → graceful fallback signal (HTTP 200, mode fallback).
  if (!isOpenAIConfigured()) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: "OPENAI_API_KEY não configurado no servidor",
      warnings: ["Provedor OpenAI selecionado mas a chave não está configurada — usando regras locais"],
    });
  }

  const messages = buildMessages(departmentId, context);
  const result = await callOpenAI(messages);

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: result.error,
      warnings: [`Falha na execução OpenAI: ${result.error} — usando regras locais`],
    });
  }

  const output =
    departmentId === "strategy"
      ? validateStrategyOutput(result.data)
      : departmentId === "social-media"
      ? validateSocialOutput(result.data)
      : validatePMOutput(result.data);

  if (!output) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: "Resposta OpenAI em formato inválido",
      warnings: ["A resposta da OpenAI não passou na validação — usando regras locais"],
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "openai",
    model: result.model,
    output,
  });
}
