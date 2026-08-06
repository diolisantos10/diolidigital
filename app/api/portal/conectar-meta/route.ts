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
import { popupDeFalha } from "@/lib/integrations/meta/popup";
import { urlPublica } from "@/lib/http/endereco-publico";

export async function GET(request: NextRequest): Promise<Response> {
  const token = tokenDoPortal(request);
  if (!token) {
    // Mesma razão do connect-parceiro: quem lê esta resposta é uma pessoa,
    // numa janela pequena, não um cliente HTTP.
    return popupDeFalha("sem_acesso", "conectar-meta:sem_cookie");
  }
  // ⚠️ NÃO usar `new URL(caminho, request.url)`: atrás do proxy do Railway,
  // `request.url` é `http://0.0.0.0:8080/…` — o endereço em que o processo
  // escuta, não o endereço em que o cliente chega. Em 06/08/2026 foi
  // exatamente isso que abriu na janela do CEO.
  const destino = urlPublica(request, `/api/meta/connect-parceiro?token=${encodeURIComponent(token)}`);
  if (!destino) {
    return popupDeFalha("app_nao_configurado", "conectar-meta:sem_endereco_publico");
  }
  return NextResponse.redirect(destino);
}
