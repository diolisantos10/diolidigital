// GET /api/portal/conexoes?token=<portalToken>
// Lista as conexões Meta do CLIENTE dono do token — para a aba "Conexões" do
// portal. Sem sessão: a única credencial é o token do portal.
//
// Regra da casa: derivação, não comparação. O clientId vem do token; qualquer
// clientId em query/corpo é ignorado. E nenhum token de acesso sai daqui —
// só nome, plataforma e status.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!token) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const rows = await prisma.metaConnection.findMany({
    where: { workspaceId: dono.workspaceId, clientId: dono.clientId },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      platform: true,
      name: true,
      status: true,
      connectedAt: true,
      // Nada de accessTokenEncrypted / tokenHint / externalId — o portal só
      // precisa saber O QUE está conectado, nunca as credenciais.
    },
  });

  return NextResponse.json({
    conexoes: rows
      // A pseudo-conexão "user" é infraestrutura (token de usuário para a
      // Marketing API) — não é uma conta que o cliente reconheça.
      .filter((r) => r.platform !== "user")
      .map((r) => ({
        id: r.id,
        platform: r.platform,
        name: r.name,
        status: r.status,
        connectedAt: r.connectedAt.toISOString(),
      })),
  });
}
