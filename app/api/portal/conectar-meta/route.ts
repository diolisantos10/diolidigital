// GET /api/portal/conectar-meta — ponte do modo cookie para o OAuth da Meta.
//
// Correção A4: na URL limpa o navegador não conhece o token do portal (está no
// cookie httpOnly, de propósito). Mas o fluxo OAuth existente
// (/api/meta/connect-parceiro) autentica por `?token=` — e é rota da Meta,
// intocável pela trava de plataforma. Esta ponte lê o cookie no servidor e
// redireciona para o fluxo existente. O token aparece uma única vez, num
// redirect interno nosso — mesmo custo do link de compatibilidade, e o
// connect-parceiro mantém intactos state CSRF e re-derivação do dono.

import { NextRequest, NextResponse } from "next/server";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request);
  if (!token) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }
  return NextResponse.redirect(
    new URL(`/api/meta/connect-parceiro?token=${encodeURIComponent(token)}`, request.url),
  );
}
