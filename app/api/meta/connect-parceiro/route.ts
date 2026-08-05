// GET /api/meta/connect-parceiro?token=<portalToken>
// Inicia o OAuth da Meta para um PARCEIRO — o cliente que entra pelo portal,
// autenticado por token de portal, sem sessão master. Aberto em popup pela aba
// "Conexões" do portal.
//
// Regra da casa (modelo de parceria, 03/08/2026): o dono da conexão é derivado
// do TOKEN do portal — nunca de query/corpo. Sem token válido, 401. O cookie
// `_meta_oauth_portal` avisa o callback de que este retorno é de um parceiro.

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { resolveMetaAppCredentials, DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import { buildLoginUrl } from "@/lib/integrations/meta/oauth";
import { popupDeFalha } from "@/lib/integrations/meta/popup";

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    // Esta janela é um POPUP na frente de um dono de negócio. JSON aqui é o
    // mesmo que tela branca: ele conclui que não funciona, e o portal nunca
    // fica sabendo que ele tentou.
    return popupDeFalha("sem_acesso", "connect-parceiro:sem_token");
  }

  // Derivação, não comparação: cliente e workspace vêm do token do portal.
  const dono = await resolvePortalClient(token);
  if (!dono) {
    return popupDeFalha("sem_acesso", "connect-parceiro:token_invalido");
  }

  const creds = await resolveMetaAppCredentials(dono.workspaceId);
  if (!creds) {
    return popupDeFalha("app_nao_configurado", "connect-parceiro:sem_credenciais");
  }

  // Mesmo redirect URI do fluxo master: o callback é um só, e distingue o
  // parceiro pelo cookie `_meta_oauth_portal`.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  const redirectUri = `${proto}://${host}/api/meta/callback`;

  const state = crypto.randomUUID(); // CSRF token

  const url = buildLoginUrl({
    appId: creds.appId,
    redirectUri,
    state,
    scopes: DEFAULT_SCOPES,
  });

  const res = NextResponse.redirect(url);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600, // 10 minutes
    path: "/",
  };
  res.cookies.set("_meta_oauth_state", state, cookieOpts);
  // clientId derivado do token — o callback confere que continua batendo.
  res.cookies.set("_meta_oauth_client", dono.clientId, cookieOpts);
  res.cookies.set("_meta_oauth_portal", token, cookieOpts);
  return res;
}
