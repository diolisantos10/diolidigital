// GET /api/meta/callback
// Meta redirects here after the user authenticates. This route:
//   1. Validates the state cookie (CSRF).
//   2. Exchanges the code for a short-lived token, then a long-lived one.
//   3. Discovers the user's Pages + linked Instagram Business accounts.
//   4. Stores each as a MetaConnection (token encrypted at rest).
//   5. Returns an HTML popup that postMessages the result to the opener.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { resolveMetaAppCredentials, DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import { exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/integrations/meta/oauth";
import { discoverPages } from "@/lib/integrations/meta/discovery";
import { saveConnection } from "@/lib/integrations/meta/connections";
import { donoDe } from "@/lib/integrations/meta/ativos-autorizados";
import {
  gravarSomenteAutorizados, fraseFaltaEscolher,
} from "@/lib/integrations/meta/escolha-de-ativos";

function safeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

function popupHtml(payload: Record<string, string>): Response {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const isError = payload.type === "meta_auth_error";
  // "escolher" não é sucesso nem falha: o acesso foi concedido e NADA foi
  // liberado ainda. Dizer "Conta conectada ✓" aqui seria mentir para o dono do
  // negócio sobre o que a agência passou a enxergar.
  const isEscolher = payload.type === "meta_auth_escolher";
  const heading = isError
    ? "Não foi possível conectar"
    : isEscolher
      ? "Falta escolher as contas"
      : "Conta Meta conectada ✓";
  const detail = isError
    ? `Motivo: ${safeAttr(payload.error ?? "desconhecido")}`
    : `${safeAttr(payload.summary || "Contas conectadas")}. Já pode fechar esta janela.`;
  const color = isError ? "#dc2626" : isEscolher ? "#9B7B2D" : "#16a34a";
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;padding:2rem;text-align:center;color:#1a1a1a">
<h2 style="color:${color};font-size:18px;margin-bottom:8px">${heading}</h2>
<p style="color:#6b7280;font-size:14px;word-break:break-word">${detail}</p>
<script>
var payload = ${json};
var hadOpener = false;
try {
  if (window.opener && typeof window.opener.postMessage === "function") {
    window.opener.postMessage(payload, window.location.origin);
    hadOpener = true;
  }
} catch(e) {}
if (hadOpener) { setTimeout(function(){ window.close(); }, 800); }
</script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  // ── 06/08/2026: A META EXPLICA, E A NOSSA TELA APAGAVA A EXPLICAÇÃO ────────
  //
  // O CEO recebeu "Motivo: no_code" numa janela em branco. A Meta tinha
  // mandado, na MESMA URL, `error_code=100` e a razão por extenso — permissões
  // inválidas no pedido. Nós lemos só dois dos cinco campos dela e, quando os
  // dois vinham vazios, inventamos um rótulo interno que não significa nada
  // para quem lê.
  //
  // "no_code" descreve o que FALTOU no nosso lado; nunca o que ACONTECEU no
  // lado da Meta. Mensagem de erro que não carrega a causa não é diagnóstico —
  // é a agência dizendo "não sei" com cara de resposta técnica.
  const err =
    searchParams.get("error_description") ??
    searchParams.get("error_message") ??
    searchParams.get("error_reason") ??
    searchParams.get("error") ??
    null;
  const codigoDaMeta = searchParams.get("error_code");

  if (err || codigoDaMeta || !code || !state) {
    const detalhe = [err, codigoDaMeta ? `código ${codigoDaMeta} da Meta` : null]
      .filter(Boolean)
      .join(" · ");
    return popupHtml({
      type: "meta_auth_error",
      // Sem NENHUM sinal da Meta, o honesto é dizer que a autorização não
      // voltou — e não um rótulo de variável nossa.
      error: detalhe || "A Meta não devolveu a autorização (nenhum motivo informado).",
    });
  }

  // CSRF: state must match the cookie set in /api/meta/connect.
  const storedState = req.cookies.get("_meta_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return popupHtml({ type: "meta_auth_error", error: "state_mismatch" });
  }

  // Dois donos possíveis para este retorno:
  //   • PARCEIRO — veio de /api/meta/connect-parceiro, sem sessão. O cookie
  //     `_meta_oauth_portal` carrega o token do portal, e o clientId/workspace
  //     são DERIVADOS dele de novo aqui (derivação, não comparação — o cookie
  //     `_meta_oauth_client` só serve de conferência de que nada mudou no meio).
  //   • MASTER — o fluxo original, inalterado: sessão master no popup.
  let workspaceId: string;
  let clientId: string | null;

  const portalToken = req.cookies.get("_meta_oauth_portal")?.value;
  if (portalToken) {
    const dono = await resolvePortalClient(portalToken);
    if (!dono) return popupHtml({ type: "meta_auth_error", error: "acesso do portal inválido ou expirado" });
    // O clientId vem SEMPRE do token do portal. Se o cookie de cliente divergir,
    // algo mexeu nos cookies no meio do fluxo — aborta.
    const cookieClient = req.cookies.get("_meta_oauth_client")?.value || null;
    if (cookieClient && cookieClient !== dono.clientId) {
      return popupHtml({ type: "meta_auth_error", error: "client_mismatch" });
    }
    workspaceId = dono.workspaceId;
    clientId = dono.clientId;
  } else {
    // The popup carries the same session cookie — resolve the workspace from it.
    const session = await getSession();
    if (!session) return popupHtml({ type: "meta_auth_error", error: "sessão expirada" });
    workspaceId = session.workspaceId;
    clientId = req.cookies.get("_meta_oauth_client")?.value || null;
  }

  const creds = await resolveMetaAppCredentials(workspaceId);
  if (!creds) return popupHtml({ type: "meta_auth_error", error: "app_not_configured" });

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  const redirectUri = `${proto}://${host}/api/meta/callback`;

  try {
    // 1. code → short-lived token
    const shortTok = await exchangeCodeForToken({
      appId: creds.appId,
      appSecret: creds.appSecret,
      redirectUri,
      code,
    });
    // 2. short-lived → long-lived (~60 days)
    const longTok = await exchangeForLongLivedToken({
      appId: creds.appId,
      appSecret: creds.appSecret,
      shortLivedToken: shortTok.access_token,
    });
    const userToken = longTok.access_token;
    const userTokenExpiry = longTok.expires_in
      ? new Date(Date.now() + longTok.expires_in * 1000)
      : null;

    // ── O TOKEN DE USUÁRIO PRECISA SOBREVIVER ────────────────────────────────
    // Até 02/08/2026 ele era usado para descobrir as Páginas e DESCARTADO. Só
    // que várias coisas da Meta exigem token de USUÁRIO, não de Página:
    // `me/adaccounts`, autorizar conta de anúncio no app, e a Marketing API
    // inteira. Sem guardá-lo, o único caminho para tráfego pago era alguém
    // colar id de conta à mão no painel da Meta.
    //
    // Fica como conexão de plataforma "user": é o mesmo cofre cifrado, com o
    // mesmo ciclo de vida, e nenhum leitor de Página o confunde com uma.
    await saveConnection({
      workspaceId,
      clientId,
      platform: "user",
      name: "Acesso da conta Meta",
      externalId: `user:${workspaceId}${clientId ? `:${clientId}` : ""}`,
      accessToken: userToken,
      tokenExpiresAt: userTokenExpiry,
      scopes: DEFAULT_SCOPES,
      meta: { tipo: "user_token" },
    }).catch(() => { /* best-effort: perder isto não pode derrubar a conexão das Páginas */ });

    // 3. Descobre as Páginas + Instagram vinculados.
    const pages = await discoverPages(userToken);

    // ── 4. O QUE É GRAVADO — E POR QUE MUDOU EM 06/08/2026 ──────────────────
    //
    // Até hoje este laço gravava TODAS as Páginas e todos os Instagram que o
    // token alcançava, carimbados com o `clientId` de quem clicou. Com o token
    // do CEO no portal da Foocci, isso significou guardar as Páginas de
    // Santioh, Dilix, Queise, DileeBags e as pessoais dele **como conexões da
    // Foocci, com o token de Página junto** — token que publica.
    //
    // "O token alcança" nunca foi "o cliente autorizou". Agora:
    //
    //   • CLIENTE (`clientId` preenchido): grava-se SÓ o que já está na lista
    //     que ele marcou (`MetaAtivoAutorizado`). Na primeira conexão essa
    //     lista está vazia — de propósito. O popup devolve
    //     `meta_auth_escolher`, e a tela dele pede quais contas liberar. Zero
    //     conexão gravada até ele marcar. Fail-closed.
    //   • AGÊNCIA (`clientId` nulo): **desde 06/08/2026 (noite), a MESMA regra.**
    //     Havia aqui um ramo `fluxo_master` que chamava `autorizarAtivos` para
    //     tudo que o token alcançava — "alcance = autorização" escrito em outro
    //     lugar do código, a mesma frase que produziu o incidente. A perícia em
    //     produção mostrou que a porta da agência era o vetor real (19 Páginas
    //     de terceiros gravadas em 03/08). O ramo não existe mais: o operador
    //     escolhe em `/api/meta/ativos`, exatamente como o cliente escolhe no
    //     portal dele.
    const ehDaAgencia = donoDe(clientId) === null;
    const { gravadas: saved, faltamEscolher: ignorados, nomes: names } =
      await gravarSomenteAutorizados({ workspaceId, clientId, paginas: pages, scopes: DEFAULT_SCOPES });

    if (saved === 0 && ignorados > 0) {
      // NÃO é erro: é a trava. O acesso foi concedido e o token está guardado;
      // falta o dono dizer QUAIS contas a agência pode usar.
      return popupHtml({
        type: "meta_auth_escolher",
        summary: fraseFaltaEscolher(ignorados, ehDaAgencia ? "agencia" : "cliente"),
      });
    }

    if (saved === 0) {
      return popupHtml({
        type: "meta_auth_error",
        error: "Nenhuma Página/Instagram encontrado nesta conta. Verifique se você administra uma Página com Instagram Business vinculado.",
      });
    }

    // Keep the user token available (best-effort) for future discovery under a
    // pseudo-connection is out of scope; Page tokens are what publishing needs.
    void userToken;
    void userTokenExpiry;

    return popupHtml({
      type: "meta_auth_success",
      summary: `${saved} conta(s) conectada(s) — ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}`,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown";
    console.error("[meta/callback] failed:", reason);
    return popupHtml({ type: "meta_auth_error", error: reason });
  }
}
