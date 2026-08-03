// portal-cookie.ts — a correção do achado A4 da auditoria do Hub.
//
// O token de portal é a ÚNICA credencial do cliente e viajava em query string
// em toda chamada — parava em log de servidor, de proxy e no histórico do
// navegador. A troca: no primeiro acesso o servidor grava o token num cookie
// httpOnly e redireciona para URL limpa; daí em diante as rotas do portal
// aceitam o cookie ALÉM do parâmetro (compatibilidade — links antigos e testes
// continuam válidos até a transição fechar, Fase 2 seção 6.3 item 3).
//
// Por que `path: "/"` e não `/portal` como a spec sugeriu: as rotas de dados
// vivem em /api/portal/*, /api/brain/portal-data e /api/media — um cookie com
// escopo /portal nunca chegaria a elas. O escopo real é o domínio da app.

import type { NextRequest, NextResponse } from "next/server";

export const PORTAL_COOKIE = "dioli_portal";

/** 180 dias — o default proposto pela spec para o acesso de portal (6.3 item 5),
 *  renovado a cada visita porque o cookie é regravado no primeiro acesso. */
export const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Resolve o token do portal: o explícito (query/corpo) vence; sem ele, o
 * cookie httpOnly. Devolve null quando não há credencial nenhuma.
 */
export function tokenDoPortal(
  request: NextRequest,
  explicito?: string | null,
): string | null {
  const direto = explicito?.trim();
  if (direto) return direto;
  const cookie = request.cookies.get(PORTAL_COOKIE)?.value?.trim();
  return cookie || null;
}

/** Grava o cookie de sessão do portal numa resposta. `secure` acompanha o
 *  protocolo real (localhost roda em http e um cookie Secure simplesmente não
 *  seria gravado — o bug ficaria invisível em dev e explodiria só em teste). */
export function gravarCookieDoPortal(
  response: NextResponse,
  request: NextRequest,
  token: string,
): void {
  response.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_COOKIE_MAX_AGE,
  });
}
