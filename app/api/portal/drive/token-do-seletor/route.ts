// GET /api/portal/drive/token-do-seletor
//
// O seletor de arquivos do Google (Google Picker) roda NO NAVEGADOR e exige um
// access token para mostrar o Drive do usuário. Não há como contornar: é assim
// que o produto do Google funciona, e o Picker é justamente o que torna o escopo
// estreito `drive.file` utilizável
// (fonte: docs/plataformas/google/fontes/drive-api-escopos.md — "o escopo
// drive.file em combinação com a API Google Picker otimiza a experiência e a
// segurança").
//
// ── O TRADE-OFF, DITO COM TODAS AS LETRAS ───────────────────────────────────
//
// A regra da casa é "nenhum token de acesso sai pelo portal" (é o que
// /api/portal/conexoes cumpre). Aqui ela é aberta, com limites estreitos e por
// um motivo estrutural:
//
//   • o token é do PRÓPRIO cliente, para o Drive DELE, no navegador DELE;
//   • ele carrega SÓ `drive.file` — conferido nesta rota antes de sair. Um token
//     com escopo mais amplo (`business.manage`, por exemplo) nunca sai daqui;
//   • ele vive no máximo 1 hora, e o navegador o usa por segundos;
//   • nada da AGÊNCIA viaja: não é token nosso, não abre nada nosso.
//
// O que NÃO é permitido, e por isso está escrito: reusar esta rota para
// qualquer outra coisa. Se um dia algum código precisar de token no navegador
// por outro motivo, ele não vem daqui.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { comTokenDoDrive } from "@/lib/integrations/google/drive";
import { ESCOPO_DRIVE } from "@/lib/integrations/google/escolha-de-material";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!t) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const dono = await resolvePortalClient(t);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const conexao = await prisma.googleDriveConnection.findUnique({
    where: { workspaceId_clientId: { workspaceId: dono.workspaceId, clientId: dono.clientId } },
    select: { id: true, status: true, escopos: true },
  }).catch(() => null);

  if (!conexao || conexao.status === "revoked") {
    return NextResponse.json({ error: "Conecte seu Google Drive primeiro." }, { status: 409 });
  }

  // A TRAVA DESTA ROTA: escopo estreito ou nada sai. Fail-closed.
  if (!conexao.escopos.includes(ESCOPO_DRIVE) || conexao.escopos.split(/\s+/).filter(Boolean).some((e) => e !== ESCOPO_DRIVE && e.startsWith("https://www.googleapis.com/auth/drive"))) {
    return NextResponse.json({
      error: "A autorização do seu Drive não está no formato que usamos. Reconecte.",
    }, { status: 409 });
  }

  const vivo = await comTokenDoDrive(conexao.id);
  if (!vivo) {
    return NextResponse.json({
      error: "O acesso ao seu Drive expirou. Reconecte para escolher arquivos.",
      expirado: true,
    }, { status: 409 });
  }

  // Sem cache em lugar nenhum: token em cache de proxy é token vazado.
  return NextResponse.json(
    { token: vivo.token },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } },
  );
}
