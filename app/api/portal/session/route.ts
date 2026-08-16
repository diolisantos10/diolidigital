// POST /api/portal/session — troca um token de portal por cookie httpOnly.
//
// A outra metade da correção A4: quem chega com o token NO CAMINHO
// (/portal/access/<token>, o formato dos links já enviados) também precisa
// sair dele. A página chama esta rota uma vez, o cookie é gravado, e a URL é
// trocada por /portal/access/me sem recarregar. Só grava cookie de token
// VÁLIDO — cookie de token podre é um bug que se esconde por 180 dias.

import { NextRequest, NextResponse } from "next/server";
import { escopoDoToken } from "@/lib/agency/persistence/portal-access-service";
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

  // ── 🔴 A PORTA IRMÃ (16/08/2026, rodada 6) ────────────────────────────────
  //
  // Isto usava `validatePortalAccess` — validade, NUNCA dono. E é esta a rota
  // que a página `/portal/access/[token]` chama, "o formato dos links já
  // enviados". Depois desta frente **todo link de produção é legado**: o
  // cliente entrava, ganhava o cookie podre de 180 dias que o commit irmão diz
  // ter fechado, DESTRUÍA a sessão boa de quem mais usa aquele navegador, e
  // todas as leituras davam 403. Deixava de ser raro e virava o caminho comum.
  //
  // Medido: token legado, token nu e até `ponteiro_andou` — o mesmo que
  // `escopoDoToken` RECUSA — recebiam 200 + `Set-Cookie` de 180 dias.
  const escopo = await escopoDoToken(token);
  if (!escopo.ok) {
    return NextResponse.json(
      { error: "Acesso negado", reason: escopo.motivo },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true });
  gravarCookieDoPortal(response, request, token);
  return response;
}
