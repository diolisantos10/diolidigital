// Porta de entrada do portal: /portal/access?token=<token>
//
// Correção A4 (auditoria do Hub, requisito 6.3): o link enviado ao cliente
// continua sendo o link único com token — mas o token sai da URL na PRIMEIRA
// resposta. O servidor troca o token por cookie httpOnly e redireciona para a
// URL limpa (/portal/access/me), sem token no caminho nem na query. O token
// original permanece válido para novos acessos (revalidação de dispositivo).
//
// ⚠️ SÓ SE GRAVA COOKIE DE TOKEN VÁLIDO. A rota irmã (POST /api/portal/session)
// já dizia isso com todas as letras — "cookie de token podre é um bug que se
// esconde por 180 dias" — e esta aqui gravava QUALQUER string que viesse na
// query. O estrago não é acesso indevido (o token continua sendo conferido em
// toda leitura de dado); é um cookie httpOnly de 180 dias, que o cliente não
// enxerga e não sabe limpar, mandando lixo em cada requisição e mascarando o
// link bom que ele receber depois: `tokenDoPortal` prefere o explícito, mas
// qualquer chamada sem token na query passa a usar o cookie podre e o portal
// "para de funcionar" sem motivo visível.
//
// Token inválido continua redirecionando para a tela do portal — é lá que a
// página traduz o motivo (expirado/revogado/inválido) pela API. O que muda é
// que ele não deixa rastro no navegador.

import { NextRequest, NextResponse } from "next/server";
import { gravarCookieDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { conferirTokenDoPortal } from "@/lib/agency/persistence/portal-access-service";

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
  // Sem token válido, NADA é gravado — e o cookie que já existir também não é
  // apagado: quem já tem acesso bom e clica num link velho não pode ser expulso
  // por isso. O redirecionamento continua igual; a página mostra o erro.
  if (await conferirTokenDoPortal(token)) {
    gravarCookieDoPortal(response, request, token);
  }
  return response;
}
