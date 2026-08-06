// Live connection test for a saved AI provider key.
// Makes a minimal real request to the provider to verify the key works,
// then records the result on the integration config.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey, PROVIDER_INTEGRATION_ID, isAiProvider } from "@/lib/ai/resolve-key";

const isProvider = isAiProvider;

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

// ⚠️ ANTES este teste era `GET /v1/models`. Listar modelos responde 200 com a
// conta ZERADA — a tela dizia "Conexão com OpenAI OK" enquanto toda geração
// falhava por falta de saldo. Verde falso é pior que vermelho: manda procurar o
// defeito em qualquer lugar menos onde ele está.
//
// O teste agora é a menor GERAÇÃO possível, no modelo escolhido na tela: é a
// única pergunta que interessa — esta chave PRODUZ?
async function testOpenAI(apiKey: string, model?: string | null): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: (model ?? "").trim() || "gpt-4o-mini",
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 16,
    }),
  });
  if (res.ok) return { ok: true, message: "OpenAI gerou — chave válida e com saldo" };
  if (res.status === 401) return { ok: false, message: "Chave inválida (401)" };
  if (res.status === 429) return { ok: false, message: `Chave válida, mas SEM SALDO ou no limite (OpenAI 429): ${await erroDaApi(res)}` };
  if (res.status === 404) return { ok: false, message: `Modelo "${(model ?? "").trim() || "gpt-4o-mini"}" não existe nesta conta (404)` };
  return { ok: false, message: `OpenAI recusou o pedido (HTTP ${res.status}): ${await erroDaApi(res)}` };
}

// DeepSeek mirrors OpenAI's API, including GET /models with a Bearer token —
// the cheapest possible "is this key real?" check: no tokens billed, no
// generation, and a 401 that means exactly one thing.
async function testDeepSeek(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { ok: true, message: "Conexão com DeepSeek OK" };
  if (res.status === 401) return { ok: false, message: "Chave inválida (401)" };
  if (res.status === 402) return { ok: false, message: "Chave válida, mas sem saldo na conta DeepSeek (402)" };
  return { ok: false, message: `DeepSeek respondeu HTTP ${res.status}` };
}

// Perplexity também espelha a OpenAI, mas NÃO expõe GET /models. O teste mais
// barato que existe é a menor geração possível: 1 token. Custa quase nada e
// responde a única pergunta que importa — a chave é real e tem saldo?
async function testPerplexity(apiKey: string, model?: string | null): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      // O modelo ESCOLHIDO na tela, não um chute fixo. Um nome de modelo que a
      // conta não tem devolve 400 — e 400 lido como "chave ruim" manda a pessoa
      // trocar uma chave que estava perfeita.
      model: (model ?? "").trim() || "sonar",
      messages: [{ role: "user", content: "ok" }],
      // 1 token é aceito por uns provedores e recusado por outros. 16 é barato
      // e não corre esse risco.
      max_tokens: 16,
    }),
  });
  if (res.ok) return { ok: true, message: "Conexão com Perplexity OK" };
  if (res.status === 401) return { ok: false, message: "Chave inválida (401)" };
  if (res.status === 402 || res.status === 429) return { ok: false, message: "Chave válida, mas sem saldo ou no limite (Perplexity)" };
  // Qualquer outra coisa: DIZER O QUE A API DISSE. "HTTP 400" sozinho não conta
  // nada a quem está tentando resolver — e foi exatamente o que aconteceu aqui.
  return { ok: false, message: `Perplexity recusou o pedido (HTTP ${res.status}): ${await erroDaApi(res)}` };
}

/** O motivo que a API deu, em uma linha legível. Vale para qualquer provedor:
 *  a mensagem deles é sempre mais útil que o nosso número de status. */
async function erroDaApi(res: Response): Promise<string> {
  try {
    const txt = (await res.text()).slice(0, 600);
    try {
      const j = JSON.parse(txt) as { error?: { message?: string } | string; message?: string; detail?: unknown };
      const e = j.error;
      const msg = typeof e === "string" ? e : e?.message ?? j.message ?? (j.detail ? JSON.stringify(j.detail) : "");
      if (msg) return String(msg).slice(0, 300);
    } catch { /* não era JSON — devolve o texto cru */ }
    return txt || "sem detalhe";
  } catch {
    return "sem detalhe";
  }
}

// Mesmo defeito que a OpenAI tinha, agravado: listar modelos responde 200 mesmo
// quando o modelo ESCOLHIDO na tela foi aposentado pela Google (`gemini-1.5-*`
// devolve 404 em qualquer geração). A tela dizia "OK" e a faixa gratuita não
// gerava um caractere. Aqui também se testa gerando, no modelo escolhido.
async function testGemini(apiKey: string, model?: string | null): Promise<{ ok: boolean; message: string }> {
  const modelo = (model ?? "").trim() || process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ok" }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
    },
  );
  if (res.ok) return { ok: true, message: `Gemini gerou com ${modelo}` };
  if (res.status === 401 || res.status === 403) return { ok: false, message: "Chave inválida ou sem permissão" };
  if (res.status === 404) return { ok: false, message: `Modelo "${modelo}" não existe mais na API do Gemini (404) — escolha um modelo atual` };
  if (res.status === 429) return { ok: false, message: `Cota da faixa gratuita esgotada (Gemini 429): ${await erroDaApi(res)}` };
  return { ok: false, message: `Gemini recusou o pedido (HTTP ${res.status}): ${await erroDaApi(res)}` };
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

/**
 * Tira da mensagem do provedor qualquer coisa com cara de credencial.
 *
 * ⚠️ Por que existe: esta mensagem é PERSISTIDA em `lastTestMessage` e depois
 * servida por `GET /api/ai-keys`. Provedores ecoam parte da chave enviada no
 * erro de autenticação ("Incorrect API key provided: sk-proj-…XyZ"). Guardar o
 * texto cru transformava um teste de conexão num vazamento de credencial com
 * persistência — o pior tipo, porque fica.
 *
 * Corta os prefixos conhecidos (`sk-`, `sk-ant-`, `AIza`, `pplx-`) e qualquer
 * sequência longa de caracteres de token. Preferimos apagar demais a de menos:
 * quem depura precisa do MOTIVO, não do segredo.
 */
export function sanitizarMensagemDeProvedor(msg: string): string {
  return msg
    .replace(/\b(sk|pplx|xai|gsk)-[A-Za-z0-9_\-]{6,}/gi, "«credencial removida»")
    .replace(/\bAIza[A-Za-z0-9_\-]{10,}/g, "«credencial removida»")
    .replace(/\b[A-Za-z0-9_\-]{40,}\b/g, "«credencial removida»")
    .slice(0, 300);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Testar chave dispara chamada PAGA ao provedor e escreve na configuração da
  // integração. Quem configura credencial é o master — e só ele testa.
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isProvider(provider)) return NextResponse.json({ error: "Provider inválido" }, { status: 400 });

  const resolved = await resolveProviderKey(provider, session.workspaceId);
  if (!resolved) {
    return NextResponse.json({ ok: false, message: "Nenhuma chave configurada para este provedor" });
  }

  let result: { ok: boolean; message: string };
  try {
    if (provider === "claude") result = await testClaude(resolved.apiKey);
    else if (provider === "openai") result = await testOpenAI(resolved.apiKey, resolved.model);
    else if (provider === "deepseek") result = await testDeepSeek(resolved.apiKey);
    else if (provider === "perplexity") result = await testPerplexity(resolved.apiKey, resolved.model);
    else result = await testGemini(resolved.apiKey, resolved.model);
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    result = { ok: false, message: `Falha ao testar (${reason})` };
  }

  const mensagem = sanitizarMensagemDeProvedor(result.message);

  // Record the result (only for UI-stored keys — env keys have no row to update).
  if (resolved.source === "ui") {
    await prisma.dbIntegrationConfig.updateMany({
      where: { workspaceId: session.workspaceId, integrationId: PROVIDER_INTEGRATION_ID[provider] },
      data: {
        lastTestStatus: result.ok ? "pass" : "fail",
        lastTestMessage: mensagem,
        lastTestAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: result.ok, message: mensagem, source: resolved.source });
}
