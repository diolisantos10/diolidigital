// GET /api/portal/drive/conectar?token=<portalToken>
//
// O cliente liga o Google Drive DELE ao portal. Aberto em popup pelo cartão
// "Google Drive" da aba Conexões.
//
// ── AS TRÊS DECISÕES QUE ESTA ROTA CARREGA ──────────────────────────────────
//
// 1. ESCOPO ESTREITO. Só `drive.file` — acesso POR ARQUIVO, ao que o cliente
//    escolher no seletor do Google (fonte:
//    docs/plataformas/google/fontes/drive-api-escopos.md). Nada de `drive` ou
//    `drive.readonly`: são escopos RESTRITOS, exigem verificação restrita e
//    avaliação de segurança de terceiros porque guardamos os bytes — meses de
//    espera. E "alcance nunca é autorização" é regra da casa desde 06/08/2026.
//
// 2. DONO DERIVADO DO TOKEN. `resolvePortalClient` devolve cliente e workspace.
//    Nenhum clientId de query ou corpo é olhado. Comparação seria a porta para
//    o Drive de um cliente cair na conta de outro.
//
// 3. POPUP NUNCA FALA JSON. Toda saída é `paginaDePopup`, com postMessage para
//    a aba que abriu — inclusive nas falhas. Falha invisível é o pior tipo.
//
// SEPARADA de /api/google/conectar (Meu Negócio) de propósito: aquele pede
// `business.manage`, que é ESCRITA pública em nome do cliente. Pedir os dois na
// mesma tela faria um consentimento carregar o outro.

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { paginaDePopup } from "@/lib/integrations/meta/popup";
import { ESCOPO_DRIVE } from "@/lib/integrations/google/escolha-de-material";

export const dynamic = "force-dynamic";

function falha(titulo: string, detalhe: string, oQueFazer: string, etapa: string): Response {
  return paginaDePopup({
    ok: false, titulo, detalhe, oQueFazer,
    carga: { type: "drive_auth_error", error: detalhe, etapa },
  });
}

export function urlDoCallback(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/google/drive/callback`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!token) {
    return falha(
      "Não consegui identificar seu acesso",
      "Esta janela abriu sem o seu link de acesso ao portal.",
      "Feche esta janela, volte ao portal e clique de novo em Conectar Google Drive.",
      "drive/conectar:sem_token",
    );
  }

  const dono = await resolvePortalClient(token);
  if (!dono) {
    return falha(
      "Seu acesso expirou",
      "O link do portal que você está usando não vale mais.",
      "Peça à equipe um link novo do portal e tente de novo.",
      "drive/conectar:token_invalido",
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    // Honesto: é falha NOSSA de configuração, e o cliente não deve achar que
    // errou algo. Ver o parecer sobre publicar o app OAuth.
    return falha(
      "A conexão com o Google ainda não está liberada",
      "A agência ainda está finalizando a liberação do app junto ao Google.",
      "Avise a equipe — não é um problema da sua conta.",
      "drive/conectar:sem_credenciais",
    );
  }

  const estado = randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: urlDoCallback(req),
    response_type: "code",
    scope: ESCOPO_DRIVE,
    // `offline` + `consent` é o que faz o Google devolver o REFRESH token. Sem
    // ele a conexão morre em 1 hora. (Com o app em "Teste", o próprio refresh
    // morre em 7 dias — fonte: fontes/oauth2-tokens-e-expiracao.md.)
    access_type: "offline",
    prompt: "consent",
    state: estado,
    // NADA de include_granted_scopes aqui: ele arrastaria para este token
    // qualquer escopo já concedido antes (inclusive `business.manage`, que é
    // ESCRITA). O ponto desta conexão é ser estreita.
  });

  const res = Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
  const headers = new Headers(res.headers);
  const opts = "HttpOnly; Path=/; Max-Age=600; SameSite=Lax" + (process.env.NODE_ENV === "production" ? "; Secure" : "");
  headers.append("Set-Cookie", `_drive_state=${estado}; ${opts}`);
  headers.append("Set-Cookie", `_drive_portal=${encodeURIComponent(token)}; ${opts}`);
  return new Response(null, { status: 302, headers });
}
