import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth/secret";
import { ehPapelDaAgencia, perfilDoPapel } from "@/lib/agency/roles";
import { podeAbrirRota } from "@/lib/agency/organizacao/paginas";

// ── A CAMADA QUE A URL DIGITADA ENCONTRA PRIMEIRO ───────────────────────────
//
// Este arquivo já perguntava "existe sessão válida?" — e liberava tudo depois
// do sim. O menu lateral é que escondia as telas, e menu não protege nada:
// `/agency/settings` digitado na barra de endereço respondia 200 para qualquer
// pessoa logada, de qualquer papel.
//
// Agora ele pergunta as DUAS coisas, no mesmo lugar e antes de qualquer
// render: sessão válida E rota permitida para o perfil daquele papel. Como
// roda em `/agency/**` inteiro pelo matcher, página interna nova nasce
// coberta — ninguém precisa lembrar de proteger a tela que acabou de criar.
//
// Importa só de módulos PUROS (`roles.ts`, `organizacao/*`): nada de Prisma,
// `next/headers` ou `server-only` aqui, que não rodam no Edge.
const SESSION_COOKIE = "dioli-session";
const AGENCY_PATTERN = /^\/agency(\/|$)/;
const PUBLIC_PATHS = ["/auth/signin", "/auth/signout", "/portal/", "/api/"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (AGENCY_PATTERN.test(pathname)) {
    // Obtain signing key — throws in production if AUTH_SECRET is not set.
    let secret: Uint8Array;
    try {
      secret = getAuthSecret();
    } catch (configErr) {
      console.error("[AUTH] Config error:", configErr);
      return new NextResponse(
        "Authentication misconfigured: AUTH_SECRET is not set in Railway Variables.",
        { status: 500 }
      );
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value;

    if (process.env.AUTH_DEBUG === "true") {
      console.log(
        `[PROXY] pathname=${pathname}`,
        `cookiePresent=${Boolean(token)}`,
        `host=${request.headers.get("host")}`,
        `xfProto=${request.headers.get("x-forwarded-proto")}`,
        `secFetchDest=${request.headers.get("sec-fetch-dest")}`,
        `authSecretSet=${Boolean(process.env.AUTH_SECRET)}`
      );
    }

    if (!token) {
      return buildSigninRedirect(request, pathname);
    }

    try {
      const { payload } = await jwtVerify(token, secret);

      // ── A permissão de ROTA, no servidor ────────────────────────────────
      // Papel desconhecido é NEGADO, nunca promovido — mesma regra do login
      // (`app/api/auth/signin/route.ts`), pelo mesmo motivo: um dia o fallback
      // aqui era o papel mais poderoso da casa.
      const papel = typeof payload.role === "string" ? payload.role : "";
      if (!ehPapelDaAgencia(papel)) {
        return buildSemPermissao(request, pathname);
      }
      if (!podeAbrirRota(perfilDoPapel(papel), pathname)) {
        return buildSemPermissao(request, pathname);
      }
      return NextResponse.next();
    } catch {
      // JWT invalid or expired — clear cookie and send to signin.
      const response = buildSigninRedirect(request, pathname);
      response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      return response;
    }
  }

  return NextResponse.next();
}

/**
 * Barrar EXPLICANDO, não com tela em branco nem com 404.
 *
 * `rewrite` e não `redirect`: a URL continua a que a pessoa pediu, então ela
 * entende qual porta bateu e o link continua compartilhável. Redirecionar para
 * o dashboard — que era o comportamento de `requireRole()` — some com o
 * contexto e ensina a pessoa que o sistema "engoliu" o clique.
 *
 * O `sem-permissao` é uma rota `todos_internos`, senão o próprio guarda
 * barraria a tela que existe para explicar o barramento.
 */
function buildSemPermissao(request: NextRequest, fromPath: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/agency/sem-permissao";
  url.search = "";
  url.searchParams.set("de", fromPath);
  const response = NextResponse.rewrite(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  // Torna a decisão VERIFICÁVEL sem abrir o navegador: o teste negativo e o
  // `curl` leem o cabeçalho em vez de adivinhar pelo HTML.
  response.headers.set("x-dioli-acesso", "negado");
  return response;
}

function buildSigninRedirect(request: NextRequest, fromPath: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/signin";
  // Preserve the intended destination so the signin page can redirect back.
  // Only /agency/* paths are allowed to prevent open-redirect attacks.
  if (AGENCY_PATTERN.test(fromPath)) {
    url.searchParams.set("callbackUrl", fromPath);
  } else {
    url.search = "";
  }
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
