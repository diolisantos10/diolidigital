// POST /api/meta/token — conectar a Meta COLANDO um token, sem popup.
//
// Existe porque no dia do lançamento da Foocci (03/08/2026) o diálogo de OAuth
// recusou o admin do app com "domínio não incluído" mesmo com todos os domínios
// gravados — um estado do painel da Meta que não se corrige por API. A operação
// não pode depender de um popup da Meta estar de bom humor.
//
// É o MESMO caminho que o antigo "agente da Meta" do CEO usava: um token de
// usuário gerado no Graph API Explorer (developers.facebook.com/tools/explorer),
// colado aqui. O resto do fluxo é idêntico ao callback do OAuth: troca por
// long-lived, descobre as Páginas/Instagram, grava tudo no cofre cifrado.
//
// ── AS TRÊS CONFERÊNCIAS ANTES DE ACEITAR ───────────────────────────────────
// Um campo que aceita token é uma porta; estas são as fechaduras:
//   1. `debug_token` com o app access token prova que o token é DESTE app —
//      um token de outro app qualquer é recusado na porta.
//   2. O token precisa estar válido (is_valid) e pertencer a um usuário.
//   3. Só o master, autenticado, pode colar. E o token nunca volta na resposta.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { resolveMetaAppCredentials, GRAPH_BASE, DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import { exchangeForLongLivedToken } from "@/lib/integrations/meta/oauth";
import { discoverPages } from "@/lib/integrations/meta/discovery";
import { saveConnection } from "@/lib/integrations/meta/connections";

export const dynamic = "force-dynamic";

interface DebugToken {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    type?: string;
    scopes?: string[];
    expires_at?: number;
    user_id?: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  let body: { token?: string; clientId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const bruto = body.token?.trim();
  if (!bruto || bruto.length < 30) {
    return NextResponse.json({ error: "Cole o token gerado no Graph API Explorer." }, { status: 400 });
  }

  const creds = await resolveMetaAppCredentials(session!.workspaceId);
  if (!creds) return NextResponse.json({ error: "App da Meta não configurado" }, { status: 503 });

  // ── Fechadura 1 e 2: o token é deste app, e está vivo? ────────────────────
  const appToken = `${creds.appId}|${creds.appSecret}`;
  const dbg = new URL(`${GRAPH_BASE}/debug_token`);
  dbg.searchParams.set("input_token", bruto);
  dbg.searchParams.set("access_token", appToken);
  const dbgRes = await fetch(dbg).catch(() => null);
  const info = dbgRes ? ((await dbgRes.json().catch(() => ({}))) as DebugToken) : {};

  if (!info.data?.is_valid) {
    return NextResponse.json({ error: "Esse token não está válido. Gere um novo no Graph API Explorer." }, { status: 400 });
  }
  if (info.data.app_id !== creds.appId) {
    // Token de OUTRO app: recusado. Aceitar conectaria a agência a um app que
    // não é o nosso — com as permissões de quem quer que o tenha gerado.
    return NextResponse.json({ error: "Esse token pertence a outro app da Meta. No Explorer, selecione o app Dioli Digital Studio antes de gerar." }, { status: 400 });
  }

  const escopos = info.data.scopes ?? [];
  const faltando = ["ads_management", "pages_show_list"].filter((s) => !escopos.includes(s));

  // ── Troca por long-lived. Token do Explorer dura ~1h; 60 dias é operação. ──
  let token = bruto;
  let expiraEm: Date | null = info.data.expires_at ? new Date(info.data.expires_at * 1000) : null;
  try {
    const longo = await exchangeForLongLivedToken({
      appId: creds.appId, appSecret: creds.appSecret, shortLivedToken: bruto,
    });
    if (longo.access_token) {
      token = longo.access_token;
      expiraEm = longo.expires_in ? new Date(Date.now() + longo.expires_in * 1000) : null;
    }
  } catch { /* alguns tokens já são long-lived e a troca falha — o original serve */ }

  const clientId = body.clientId?.trim() || "";

  // ── O token de usuário: a chave do tráfego pago ───────────────────────────
  await saveConnection({
    workspaceId: session!.workspaceId,
    clientId,
    platform: "user",
    name: "Acesso da conta Meta (token colado)",
    externalId: `user:${session!.workspaceId}${clientId ? `:${clientId}` : ""}`,
    accessToken: token,
    tokenExpiresAt: expiraEm,
    scopes: escopos.length > 0 ? escopos : DEFAULT_SCOPES,
    meta: { tipo: "user_token", origem: "explorer" },
  });

  // ── Páginas e Instagram, igual ao callback ────────────────────────────────
  let paginas = 0;
  const nomes: string[] = [];
  try {
    for (const page of await discoverPages(token)) {
      await saveConnection({
        workspaceId: session!.workspaceId, clientId,
        platform: "facebook", name: page.name, externalId: page.id,
        accessToken: page.accessToken, tokenExpiresAt: null,
        scopes: escopos, meta: { pageId: page.id },
      });
      paginas++; nomes.push(`FB: ${page.name}`);
      if (page.instagram) {
        await saveConnection({
          workspaceId: session!.workspaceId, clientId,
          platform: "instagram",
          name: page.instagram.username ? `@${page.instagram.username}` : `IG ${page.instagram.id}`,
          externalId: page.instagram.id,
          accessToken: page.accessToken, tokenExpiresAt: null,
          scopes: escopos, meta: { pageId: page.id, igUserId: page.instagram.id },
        });
        paginas++; nomes.push(`IG: ${page.instagram.username ?? page.instagram.id}`);
      }
    }
  } catch { /* sem pages_show_list ainda dá para rodar anúncio — não derruba */ }

  return NextResponse.json({
    ok: true,
    contas: paginas,
    nomes,
    validoAte: expiraEm,
    ...(faltando.length > 0
      ? { aviso: `O token veio sem: ${faltando.join(", ")}. Gere de novo marcando essas permissões para liberar tudo.` }
      : {}),
  });
}
