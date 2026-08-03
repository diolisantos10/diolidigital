// Facebook Login / Meta OAuth helpers. SERVER-ONLY.
// Flow: buildLoginUrl → user authenticates → callback receives `code` →
// exchangeCodeForToken → exchangeForLongLivedToken → we then discover the
// user's Pages / IG business accounts / WhatsApp numbers and store them.

import { FB_OAUTH_DIALOG, GRAPH_BASE } from "./config";

export interface ShortLivedToken {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface LongLivedToken {
  access_token: string;
  token_type?: string;
  expires_in?: number; // seconds (~5,184,000 = 60 days) when present
}

// Build the Facebook Login dialog URL the user is redirected to.
//
// "Login do Facebook para EMPRESAS" (o único produto de login que a Meta
// oferece a apps tipo Business, como o nosso) NÃO usa `scope`: usa uma
// CONFIGURAÇÃO criada no painel, passada como `config_id`. Mandar `scope` num
// app desses faz o diálogo recusar o usuário com mensagens enganosas — foi uma
// tarde inteira do lançamento da Foocci (03/08/2026) perdida nisso.
//
// `META_LOGIN_CONFIG_ID` vem do painel: Login do Facebook para Empresas →
// Configurações (a tabela de configurações), coluna ID. Com ela presente, o
// diálogo vai por config_id; sem ela, cai no fluxo clássico de `scope` — que
// continua certo para apps tipo Consumer.
export function buildLoginUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
  configId?: string;
}): string {
  const configId = opts.configId ?? process.env.META_LOGIN_CONFIG_ID?.trim();
  const params = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: "code",
    ...(configId
      ? { config_id: configId }
      : { scope: opts.scopes.join(",") }),
  });
  return `${FB_OAUTH_DIALOG}?${params.toString()}`;
}

// Exchange the authorization `code` for a short-lived user access token.
export async function exchangeCodeForToken(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<ShortLivedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code", opts.code);

  const res = await fetch(url.toString(), { method: "GET" });
  const raw = await res.text();
  if (!res.ok) {
    let reason = `token_exchange_http_${res.status}`;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) reason = j.error.message;
    } catch { /* keep generic */ }
    throw new Error(reason);
  }
  return JSON.parse(raw) as ShortLivedToken;
}

// Exchange a short-lived user token for a long-lived one (~60 days).
export async function exchangeForLongLivedToken(opts: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<LongLivedToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("fb_exchange_token", opts.shortLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const raw = await res.text();
  if (!res.ok) {
    let reason = `long_lived_exchange_http_${res.status}`;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) reason = j.error.message;
    } catch { /* keep generic */ }
    throw new Error(reason);
  }
  return JSON.parse(raw) as LongLivedToken;
}
