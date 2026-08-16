// Execução de inteligência de departamento por provedor — e a BANCADA de
// comparação entre provedores.
//
// Este arquivo tinha um cérebro paralelo: falava com os endpoints da OpenAI e
// da Anthropic direto, com dois provedores no braço. Agora chama `generate()`
// como todo mundo, o que traz de graça o retry, os cinco provedores e a
// resolução de chave pelo cofre.
//
// `estrito: true` desliga a reserva. É o que permite comparar caminho pago e
// caminho gratuito medindo o que se pediu, e é o que prova que provedor
// indisponível PARA em vez de improvisar.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAgencyRole } from "@/lib/auth/session";
import { resolveProviderKey, isAiProvider, type AiProvider } from "@/lib/ai/resolve-key";
import { generate } from "@/lib/ai/generate";
import {
  buildMessages,
  isOpenAIDepartment,
  validateStrategyOutput,
  validateSocialOutput,
  validatePMOutput,
  validateDesignOutput,
  validateTrafficOutput,
  type AIRunContext,
  type OpenAIMessages,
} from "@/lib/agency/intelligence/openai-schemas";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

function validateOutput(departmentId: string, raw: unknown) {
  if (departmentId === "strategy")          return validateStrategyOutput(raw);
  if (departmentId === "social-media")      return validateSocialOutput(raw);
  if (departmentId === "project-management") return validatePMOutput(raw);
  if (departmentId === "design")            return validateDesignOutput(raw);
  if (departmentId === "paid-traffic")      return validateTrafficOutput(raw);
  return null;
}

// GET — non-secret provider status for UI + System Doctor.
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const claudeConfigured = !!(await resolveProviderKey("claude", session.workspaceId));
  const openaiConfigured = !!(await resolveProviderKey("openai", session.workspaceId));
  return NextResponse.json({ openaiConfigured, claudeConfigured });
}

// POST — roda a inteligência de um departamento pelo provedor pedido.
//
// `provider` aceita qualquer um dos cinco. `estrito: true` proíbe a reserva:
// o provedor pedido atende ou o resultado é a falha dele.
//
// A degradação continua DECLARADA: chave ausente, falha do provedor ou saída
// que não passa no validador do departamento devolvem `mode:"fallback"` com o
// motivo escrito — o chamador segue nas regras locais sabendo que seguiu.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // FAIXA 1 do CSRF: gasta a chave de IA da agência a cada chamada.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  let body: {
    departmentId?: string;
    projectId?: string;
    provider?: string;
    estrito?: boolean;
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
      { error: "departmentId must be one of: strategy, social-media, project-management, design, paid-traffic" },
      { status: 400 },
    );
  }

  if (!provider || !isAiProvider(provider)) {
    return NextResponse.json({ error: "provider inválido — use claude, openai, gemini, deepseek ou perplexity" }, { status: 400 });
  }

  if (!context || typeof context !== "object" || !context.prompt) {
    return NextResponse.json({ error: "context with prompt is required" }, { status: 400 });
  }

  const messages = buildMessages(departmentId, context);
  const comecou = Date.now();
  const result = await generate({
    system: messages.system,
    user: messages.user,
    maxTokens: 2048,
    workspaceId: session.workspaceId,
    preferredProvider: provider as AiProvider,
    apenasOPreferido: body.estrito === true,
    // Console do operador: gasto real, sem cliente. Fica no departamento
    // `operacao-interna` para não engordar o custo de nenhum projeto.
    agentId: "console-ia",
  });
  const ms = Date.now() - comecou;

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      ms,
      fallbackReason: result.error,
      warnings: [`Falha na execução ${provider}: ${result.error} — usando regras locais`],
    });
  }

  const output = validateOutput(departmentId, result.data);
  if (!output) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      ms,
      // Quem realmente respondeu importa no diagnóstico: "inválido" de um
      // provedor de reserva manda investigar o provedor errado.
      provider: result.provider,
      model: result.model,
      fallbackReason: "Resposta em formato inválido",
      warnings: ["A resposta da IA não passou na validação — usando regras locais"],
    });
  }

  return NextResponse.json({
    ok: true,
    mode: result.provider,
    provider: result.provider,
    model: result.model,
    ms,
    output,
  });
}
