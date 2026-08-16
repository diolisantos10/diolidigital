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
import { escopoDoToken } from "@/lib/agency/persistence/portal-access-service";

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

  // ── 🔴 RODADA 5: CONFERIR VALIDADE NÃO É CONFERIR DONO ────────────────────
  //
  // Isto usava `conferirTokenDoPortal`, que confere existência, revogação e
  // prazo — e **nunca o dono**. Medido em navegador real: token legado (sem
  // dono escrito) recebia `307 → /portal/access/me` **com
  // `Set-Cookie: dioli_portal=...; Max-Age=15552000`** — o cookie podre de 180
  // dias que o cabeçalho DESTE arquivo diz que não pode acontecer. E a
  // `/portal/invalid`, que tem contato clicável, ficava inalcançável.
  //
  // Agora quem decide é o resolvedor único: sem dono, não entra e não grava.
  if ((await escopoDoToken(token)).ok) {
    const response = NextResponse.redirect(urlPublica(request, "/portal/access/me"));
    gravarCookieDoPortal(response, request, token);
    return response;
  }

  // ── 🔴 F5 (15/08/2026): TOKEN RUIM NÃO PODE CAIR NO PORTAL DE OUTRO ────────
  //
  // Aqui estava escrito que o cookie antigo NÃO era apagado, "para quem já tem
  // acesso bom e clica num link velho não ser expulso". A intenção era boa e a
  // consequência é o incidente:
  //
  //   o cliente B clica no link DELE, que expirou. O token não valida, nada é
  //   gravado — e a rota redirecionava assim mesmo para `/portal/access/me`,
  //   onde o cookie manda. Se aquele navegador tinha o cookie do cliente A
  //   (o CEO abre o portal de todos), B cai **dentro do portal de A**, marca,
  //   projetos, conversa e tudo. O selo da tela não dispara: vista e chat leem
  //   o MESMO cookie e concordam entre si.
  //
  // É o caminho mais banal que existe — link expirado — e não tinha teste.
  //
  // A regra nova: **token ruim nunca leva a uma sessão que não é dele.** Vai
  // para a tela de acesso inválido, que explica e não expõe portal nenhum. O
  // cookie da sessão legítima daquele navegador é PRESERVADO (apagar seria a
  // negação de serviço que o `seguranca` mostrou no `proxy.ts`): quem tinha
  // acesso bom continua tendo — só não entra por esta porta, com este token.
  return NextResponse.redirect(urlPublica(request, "/portal/invalid"));
}
