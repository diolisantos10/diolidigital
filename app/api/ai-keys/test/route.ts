// Live connection test for a saved AI provider key.
// Makes a minimal real request to the provider to verify the key works,
// then records the result on the integration config.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey, PROVIDER_INTEGRATION_ID, type AiProvider } from "@/lib/ai/resolve-key";

const PROVIDERS: AiProvider[] = ["openai", "claude", "gemini"];
function isProvider(v: string): v is AiProvider {
  return (PROVIDERS as string[]).includes(v);
}

const TIMEOUT_MS = 15_000;

async function testClaude(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  if (res.ok) return { ok: true, message: "Conexão com Claude OK" };
  if (res.status === 401) return { ok: false, message: "Chave inválida (401)" };
  return { ok: false, message: `Claude respondeu HTTP ${res.status}` };
}

async function testOpenAI(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { ok: true, message: "Conexão com OpenAI OK" };
  if (res.status === 401) return { ok: false, message: "Chave inválida (401)" };
  return { ok: false, message: `OpenAI respondeu HTTP ${res.status}` };
}

async function testGemini(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    {},
  );
  if (res.ok) return { ok: true, message: "Conexão com Gemini OK" };
  if (res.status === 400 || res.status === 403) return { ok: false, message: "Chave inválida" };
  return { ok: false, message: `Gemini respondeu HTTP ${res.status}` };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isProvider(provider)) return NextResponse.json({ error: "Provider inválido" }, { status: 400 });

  const resolved = await resolveProviderKey(provider, session.workspaceId);
  if (!resolved) {
    return NextResponse.json({ ok: false, message: "Nenhuma chave configurada para este provedor" });
  }

  let result: { ok: boolean; message: string };
  try {
    if (provider === "claude") result = await testClaude(resolved.apiKey);
    else if (provider === "openai") result = await testOpenAI(resolved.apiKey);
    else result = await testGemini(resolved.apiKey);
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    result = { ok: false, message: `Falha ao testar (${reason})` };
  }

  // Record the result (only for UI-stored keys — env keys have no row to update).
  if (resolved.source === "ui") {
    await prisma.dbIntegrationConfig.updateMany({
      where: { workspaceId: session.workspaceId, integrationId: PROVIDER_INTEGRATION_ID[provider] },
      data: {
        lastTestStatus: result.ok ? "pass" : "fail",
        lastTestMessage: result.message,
        lastTestAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: result.ok, message: result.message, source: resolved.source });
}
