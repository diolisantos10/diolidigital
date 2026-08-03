// POST /api/portal/session — troca um token de portal por cookie httpOnly.
//
// A outra metade da correção A4: quem chega com o token NO CAMINHO
// (/portal/access/<token>, o formato dos links já enviados) também precisa
// sair dele. A página chama esta rota uma vez, o cookie é gravado, e a URL é
// trocada por /portal/access/me sem recarregar. Só grava cookie de token
// VÁLIDO — cookie de token podre é um bug que se esconde por 180 dias.

import { NextRequest, NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { gravarCookieDoPortal } from "@/lib/agency/persistence/portal-cookie";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });
  }

  const acesso = await validatePortalAccess(token);
  if (!acesso.valid) {
    return NextResponse.json(
      { error: "Acesso negado", reason: acesso.reason },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true });
  gravarCookieDoPortal(response, request, token);
  return response;
}
