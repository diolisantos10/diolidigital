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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/portal/invalid", request.url));
  }
  const response = NextResponse.redirect(new URL("/portal/access/me", request.url));
  gravarCookieDoPortal(response, request, token);
  return response;
}
