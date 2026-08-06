// /api/meta/contas-de-anuncio — resolve sozinho a pendência "0/100".
//
// GET  → lista as contas de anúncio que o acesso alcança, e diz quais já estão
//        autorizadas no app.
// POST → AUTORIZA as contas no app da Meta.
//
// ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// O painel da Meta mostra "Identificações de contas de anúncios autorizadas
// (0/100)" nas configurações avançadas. Enquanto o app não passa pelo App
// Review, essa lista é o ÚNICO jeito de o app agir sobre uma conta de anúncio
// — é o modo de teste da Meta. Com ela vazia, toda chamada de campanha é
// recusada, mesmo com token válido e conta conectada.
//
// Preencher à mão exige achar o id da conta em outro painel, copiar e colar.
// Aqui é um POST: a agência lê as contas que o acesso já alcança e autoriza.
//
// ── POR QUE PRECISA DO TOKEN DE USUÁRIO ────────────────────────────────────
//
// `me/adaccounts` e `authorized_adaccounts` respondem `(#102) A user access
// token is required`. Token de app não serve, token de Página não serve. É por
// isso que o callback passou a GUARDAR o token de usuário — antes ele era usado
// para descobrir as Páginas e jogado fora.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { decryptSecret } from "@/lib/security/crypto";
import { resolveMetaAppCredentials } from "@/lib/integrations/meta/config";
import { GRAPH_BASE } from "@/lib/integrations/meta/config";
import { donoDe } from "@/lib/integrations/meta/ativos-autorizados";

export const dynamic = "force-dynamic";

interface ContaDeAnuncio {
  id: string;
  nome: string;
  moeda: string;
  ativa: boolean;
  autorizadaNoApp: boolean;
}

/** O token de usuário da conexão. Sem ele nada aqui funciona, e o motivo
 *  precisa chegar em português a quem estiver olhando a tela. */
async function tokenDeUsuario(workspaceId: string, clientId: string | null): Promise<string | null> {
  const c = await prisma.metaConnection.findFirst({
    where: { workspaceId, platform: "user", status: "connected", ...(clientId ? { clientId } : {}) },
    orderBy: { connectedAt: "desc" },
  }).catch(() => null);
  if (!c) return null;
  return decryptSecret(c.accessTokenEncrypted);
}

async function autorizadasNoApp(appId: string, token: string): Promise<Set<string>> {
  try {
    const u = new URL(`${GRAPH_BASE}/${appId}/authorized_adaccounts`);
    u.searchParams.set("access_token", token);
    u.searchParams.set("limit", "100");
    const r = await fetch(u);
    if (!r.ok) return new Set();
    const j = (await r.json()) as { data?: Array<{ account_id?: string; id?: string }> };
    // A Meta devolve ora `account_id` (sem "act_"), ora `id` (com). Normalizar
    // aqui evita autorizar de novo o que já está autorizado.
    return new Set((j.data ?? []).flatMap((c) => [c.id, c.account_id, c.account_id ? `act_${c.account_id}` : null].filter((v): v is string => !!v)));
  } catch {
    return new Set();
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  const clientId = request.nextUrl.searchParams.get("clientId") || null;
  const token = await tokenDeUsuario(session!.workspaceId, clientId);
  if (!token) {
    return NextResponse.json({
      error: "Nenhuma conta Meta conectada com acesso de usuário. Conecte em Integrações → Meta.",
      contas: [],
    }, { status: 409 });
  }

  const cred = await resolveMetaAppCredentials(session!.workspaceId);
  if (!cred) return NextResponse.json({ error: "App da Meta não configurado" }, { status: 503 });

  const u = new URL(`${GRAPH_BASE}/me/adaccounts`);
  u.searchParams.set("fields", "id,account_id,name,currency,account_status");
  u.searchParams.set("access_token", token);
  u.searchParams.set("limit", "50");

  const r = await fetch(u).catch(() => null);
  if (!r?.ok) {
    const corpo = r ? await r.text().catch(() => "") : "";
    return NextResponse.json({
      error: /permission|ads_/i.test(corpo)
        ? "A Meta ainda não liberou as permissões de anúncio deste app — depende do App Review."
        : "Não consegui listar as contas de anúncio.",
      detalhe: corpo.slice(0, 200),
    }, { status: 502 });
  }

  const j = (await r.json()) as { data?: Array<{ id: string; account_id?: string; name?: string; currency?: string; account_status?: number }> };
  const jaAutorizadas = await autorizadasNoApp(cred.appId, token);

  const contas: ContaDeAnuncio[] = (j.data ?? []).map((c) => ({
    id: c.id,
    nome: c.name ?? c.id,
    moeda: c.currency ?? "BRL",
    ativa: c.account_status === 1,
    autorizadaNoApp: jaAutorizadas.has(c.id) || (!!c.account_id && jaAutorizadas.has(c.account_id)),
  }));

  return NextResponse.json({
    total: contas.length,
    autorizadas: contas.filter((c) => c.autorizadaNoApp).length,
    contas,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  let body: { contas?: string[]; clientId?: string };
  try { body = await request.json(); }
  catch { body = {}; }

  const token = await tokenDeUsuario(session!.workspaceId, donoDe(body.clientId));
  if (!token) {
    return NextResponse.json({ error: "Nenhuma conta Meta conectada com acesso de usuário." }, { status: 409 });
  }
  const cred = await resolveMetaAppCredentials(session!.workspaceId);
  if (!cred) return NextResponse.json({ error: "App da Meta não configurado" }, { status: 503 });

  // Sem lista explícita, autoriza tudo o que o acesso alcança. É o caso comum:
  // o dono do negócio tem uma conta de anúncio só, e obrigá-lo a escolher entre
  // uma opção é burocracia sem função.
  let alvos = (body.contas ?? []).filter((c) => typeof c === "string" && c.trim());
  if (alvos.length === 0) {
    const u = new URL(`${GRAPH_BASE}/me/adaccounts`);
    u.searchParams.set("fields", "id");
    u.searchParams.set("access_token", token);
    const r = await fetch(u).catch(() => null);
    if (!r?.ok) return NextResponse.json({ error: "Não consegui listar as contas de anúncio." }, { status: 502 });
    const j = (await r.json()) as { data?: Array<{ id: string }> };
    alvos = (j.data ?? []).map((c) => c.id);
  }
  if (alvos.length === 0) {
    return NextResponse.json({ error: "Nenhuma conta de anúncio encontrada nesta conexão." }, { status: 404 });
  }

  const autorizadas: string[] = [];
  const falhas: Array<{ conta: string; erro: string }> = [];

  for (const conta of alvos.slice(0, 100)) {
    // A Meta espera o id SEM o prefixo "act_" neste endpoint. Mandar com o
    // prefixo devolve um erro genérico que não diz qual é o problema.
    const idLimpo = conta.replace(/^act_/, "");
    const res = await fetch(`${GRAPH_BASE}/${cred.appId}/authorized_adaccounts`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ adaccount_id: idLimpo, access_token: token }),
    }).catch(() => null);

    if (!res?.ok) {
      const corpo = res ? await res.text().catch(() => "") : "";
      let msg = corpo.slice(0, 180);
      try { msg = (JSON.parse(corpo) as { error?: { message?: string } }).error?.message ?? msg; } catch { /* texto cru */ }
      falhas.push({ conta, erro: msg || "a Meta recusou" });
      continue;
    }
    autorizadas.push(conta);
  }

  return NextResponse.json({
    ok: falhas.length === 0,
    autorizadas: autorizadas.length,
    contas: autorizadas,
    ...(falhas.length > 0 ? { falhas } : {}),
  });
}
