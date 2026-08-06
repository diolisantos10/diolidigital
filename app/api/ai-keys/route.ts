// API key management for AI providers.
//   GET    — list provider status (configured, hint, model) — NEVER returns the key
//   POST   — save/replace a key (encrypted) for a provider
//   DELETE — remove a key for a provider
//
// Only the workspace "master" may write. Keys are encrypted at rest.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { encryptSecret, keyHint } from "@/lib/security/crypto";
import { PROVIDER_INTEGRATION_ID, ALL_PROVIDERS, isAiProvider } from "@/lib/ai/resolve-key";

// Both taken from resolve-key so a new provider appears here the moment it is
// supported — no local list to forget to update.
const PROVIDERS = ALL_PROVIDERS;
const isProvider = isAiProvider;

// GET — provider configuration status. No secrets ever leave the server.
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.dbIntegrationConfig.findMany({
    where: {
      workspaceId: session.workspaceId,
      integrationId: { in: Object.values(PROVIDER_INTEGRATION_ID) },
    },
  });

  // ⚠️ `lastTestMessage` guarda a resposta CRUA do provedor, e provedores
  // ecoam pedaço da chave em erro de autenticação. Este GET exige só sessão —
  // qualquer staff. O status ("pass"/"fail") todo mundo pode ver; o texto do
  // provedor é do master. A rota não é fechada inteira porque a tela de
  // Operações depende do booleano `configured` para dizer "IA conectada".
  const podeVerDetalheDoProvedor = session.role === "master";

  const status = PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.integrationId === PROVIDER_INTEGRATION_ID[provider]);
    const hasUiKey = !!row?.apiKeyEncrypted;
    return {
      provider,
      configured: hasUiKey,
      hint: row?.apiKeyHint ?? null,
      model: row?.selectedModel ?? null,
      lastTestStatus: row?.lastTestStatus ?? "not_run",
      lastTestMessage: podeVerDetalheDoProvedor ? row?.lastTestMessage ?? null : null,
      lastTestAt: row?.lastTestAt ?? null,
    };
  });

  return NextResponse.json({ providers: status });
}

// POST — save or replace a provider's API key.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { provider?: string; apiKey?: string; model?: string };
  const provider = body.provider ?? "";
  const apiKey = (body.apiKey ?? "").trim();

  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  }
  if (apiKey.length < 8) {
    return NextResponse.json({ error: "Chave muito curta" }, { status: 400 });
  }

  const integrationId = PROVIDER_INTEGRATION_ID[provider];
  const encrypted = encryptSecret(apiKey);
  const hint = keyHint(apiKey);

  await prisma.dbIntegrationConfig.upsert({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId } },
    create: {
      workspaceId: session.workspaceId,
      integrationId,
      configured: true,
      apiKeyEncrypted: encrypted,
      apiKeyHint: hint,
      selectedModel: body.model ?? null,
      lastTestStatus: "not_run",
      lastConfiguredAt: new Date(),
    },
    update: {
      configured: true,
      apiKeyEncrypted: encrypted,
      apiKeyHint: hint,
      selectedModel: body.model ?? undefined,
      lastTestStatus: "not_run",
      lastTestMessage: null,
      lastConfiguredAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, hint });
}

// PATCH — troca SÓ o modelo, sem exigir a chave de novo.
//
// Existe porque o POST só aceita `model` acompanhado de `apiKey`, e ninguém tem
// a chave à mão depois de colada (ela sai criptografada e nunca volta). Isso
// tornava "trocar de modelo" uma operação impossível sem ir buscar a chave no
// provedor — e é exatamente a operação de que a troca para a faixa gratuita
// depende. Nunca cria linha: sem chave configurada, não há o que ajustar.
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { provider?: string; model?: string };
  const provider = body.provider ?? "";
  const model = (body.model ?? "").trim();

  if (!isProvider(provider)) return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  if (!model) return NextResponse.json({ error: "Modelo vazio" }, { status: 400 });

  const integrationId = PROVIDER_INTEGRATION_ID[provider];
  const row = await prisma.dbIntegrationConfig.findUnique({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId } },
  });
  if (!row?.apiKeyEncrypted) {
    return NextResponse.json({ error: "Nenhuma chave configurada para este provedor" }, { status: 404 });
  }

  await prisma.dbIntegrationConfig.update({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId } },
    // O modelo mudou: o resultado do teste anterior era sobre OUTRO modelo e
    // deixa de valer. Mantê-lo verde é o mesmo verde falso de antes.
    data: { selectedModel: model, lastTestStatus: "not_run", lastTestMessage: null },
  });

  return NextResponse.json({ ok: true, provider, model });
}

// DELETE — remove a provider's stored key.
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isProvider(provider)) return NextResponse.json({ error: "Provider inválido" }, { status: 400 });

  const integrationId = PROVIDER_INTEGRATION_ID[provider];
  await prisma.dbIntegrationConfig.updateMany({
    where: { workspaceId: session.workspaceId, integrationId },
    data: {
      configured: false,
      apiKeyEncrypted: null,
      apiKeyHint: null,
      lastTestStatus: "not_run",
      lastTestMessage: null,
    },
  });

  return NextResponse.json({ ok: true });
}
