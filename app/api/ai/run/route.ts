import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAgencyRole } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
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

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 30_000;

type ProviderResult = { ok: true; data: unknown; model: string } | { ok: false; error: string };

async function callWithKey(
  provider: "openai" | "claude",
  apiKey: string,
  model: string,
  messages: OpenAIMessages,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res: Response;
    if (provider === "claude") {
      res = await fetch(CLAUDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: messages.system,
          messages: [{ role: "user", content: messages.user }],
        }),
        signal: controller.signal,
      });
    } else {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      return { ok: false, error: `${provider === "claude" ? "Claude" : "OpenAI"} respondeu HTTP ${res.status}` };
    }

    let rawText: string;
    if (provider === "claude") {
      const json = (await res.json()) as { content?: { type: string; text: string }[] };
      rawText = json.content?.[0]?.text ?? "";
    } else {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      rawText = json.choices?.[0]?.message?.content ?? "";
    }

    if (!rawText) return { ok: false, error: "Resposta vazia do provedor" };

    const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) return { ok: false, error: "JSON não encontrado na resposta" };

    try {
      return { ok: true, data: JSON.parse(stripped.slice(start, end + 1)), model };
    } catch {
      return { ok: false, error: "JSON inválido na resposta" };
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    return { ok: false, error: `Falha ao chamar ${provider} (${reason})` };
  } finally {
    clearTimeout(timer);
  }
}

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

// POST — run department intelligence through Claude or OpenAI.
// Falls back gracefully: returns mode:"fallback" whenever the key is missing,
// the call fails, or the response is invalid.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
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
      { error: "departmentId must be one of: strategy, social-media, project-management, design, paid-traffic" },
      { status: 400 },
    );
  }

  if (provider !== "openai" && provider !== "claude") {
    return NextResponse.json({ error: "provider must be 'openai' or 'claude'" }, { status: 400 });
  }

  if (!context || typeof context !== "object" || !context.prompt) {
    return NextResponse.json({ error: "context with prompt is required" }, { status: 400 });
  }

  const resolvedKey = await resolveProviderKey(
    provider as "openai" | "claude",
    session.workspaceId,
  );

  if (!resolvedKey) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: `Chave ${provider === "claude" ? "Claude" : "OpenAI"} não configurada`,
      warnings: [`Provedor ${provider} selecionado mas a chave não está configurada — usando regras locais`],
    });
  }

  const model = resolvedKey.model
    ?? (provider === "claude" ? DEFAULT_CLAUDE_MODEL : DEFAULT_OPENAI_MODEL);

  const messages = buildMessages(departmentId, context);
  const result = await callWithKey(provider as "openai" | "claude", resolvedKey.apiKey, model, messages);

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: result.error,
      warnings: [`Falha na execução ${provider}: ${result.error} — usando regras locais`],
    });
  }

  const output = validateOutput(departmentId, result.data);
  if (!output) {
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      fallbackReason: "Resposta em formato inválido",
      warnings: ["A resposta da IA não passou na validação — usando regras locais"],
    });
  }

  return NextResponse.json({
    ok: true,
    mode: provider,
    model: result.model,
    output,
  });
}
