// Porta de entrada do portal: /portal/access?token=<token>
//
// Correção A4 (auditoria do Hub, requisito 6.3): o link enviado ao cliente
// continua sendo o link único com token — mas o token sai da URL na PRIMEIRA
// resposta. O servidor troca o token por cookie httpOnly e redireciona para a
// URL limpa (/portal/access/me), sem token no caminho nem na query. O token
// original permanece válido para novos acessos (revalidação de dispositivo).
//
// Token inválido também redireciona: a página valida via API e mostra o erro
// certo (expirado/revogado/inválido) — validar aqui duplicaria a mensagem.

import { NextRequest, NextResponse } from "next/server";
import { gravarCookieDoPortal } from "@/lib/agency/persistence/portal-cookie";

/** Atrás do proxy do Railway, `request.url` carrega o host INTERNO
 *  (0.0.0.0:8080) — um redirect montado com ele manda o cliente para um
 *  endereço que não existe. O host verdadeiro vem nos cabeçalhos forwarded,
 *  como já faz /api/meta/connect. */
function urlPublica(request: NextRequest, caminho: string): URL {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? new URL(`${proto}://${host}${caminho}`) : new URL(caminho, request.url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(urlPublica(request, "/portal/invalid"));
  }
  const response = NextResponse.redirect(urlPublica(request, "/portal/access/me"));
  gravarCookieDoPortal(response, request, token);
  return response;
}
