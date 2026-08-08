// GET /api/portal/conexoes?token=<portalToken>
// Lista as conexões Meta do CLIENTE dono do token — para a aba "Conexões" do
// portal. Sem sessão: a única credencial é o token do portal.
//
// Regra da casa: derivação, não comparação. O clientId vem do token; qualquer
// clientId em query/corpo é ignorado. E nenhum token de acesso sai daqui —
// só nome, plataforma e estado.
//
// ── O QUE MUDOU EM 08/08/2026, E POR QUÊ ────────────────────────────────────
//
// Esta rota devolvia `status` cru e `connectedAt`, e o cartão do portal escrevia
// **"Conectada · desde 03/08/2026"**. As duas metades daquela frase eram
// enganosas ao mesmo tempo:
//
//   • "Conectada" vinha de uma coluna que só muda quando algum caminho de
//     leitura topa com um erro 190 — ou seja, verde por FALTA de notícia;
//   • "desde 03/08" é a data em que a LINHA foi criada. O dono do negócio lê
//     aquilo como "funciona desde 03/08", que a casa nunca verificou.
//
// Agora quem decide é `estadoDaConexao` (`lib/integrations/meta/verificacao.ts`),
// a MESMA função que a rota de diagnóstico usa. Duas cópias da mesma regra
// divergem — é o defeito que quebrou o portal em 07/08. O cliente recebe o
// estado em três valores (`viva` | `nao_verificada` | `caiu`), a data em que o
// acesso funcionou pela última vez, e o motivo cru quando caiu.
//
// ⚠️ Esta rota **não fala com a Meta**. Ela lê o carimbo que o diagnóstico
// deixou. Tela de cliente que consulta a plataforma a cada F5 é rajada de GET —
// a assinatura do que restringiu a conta da agência em 03/08/2026.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { estadoDaConexao, lerMetaJson } from "@/lib/integrations/meta/verificacao";

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
      // `metaJson` guarda o carimbo do último exame — data, prova e, quando a
      // Meta recusou, o código e a frase dela. Não é credencial.
      metaJson: true,
      // Nada de accessTokenEncrypted / tokenHint / externalId — o portal só
      // precisa saber O QUE está conectado, nunca as credenciais.
    },
  });

  return NextResponse.json({
    conexoes: rows
      // A pseudo-conexão "user" é infraestrutura (token de usuário para a
      // Marketing API) — não é uma conta que o cliente reconheça.
      .filter((r) => r.platform !== "user")
      .map((r) => {
        const retrato = estadoDaConexao({
          status: r.status,
          connectedAt: r.connectedAt,
          metaJson: lerMetaJson(r.metaJson),
        });
        return {
          id: r.id,
          platform: r.platform,
          name: r.name,
          // `status` continua saindo para não quebrar quem já lê este campo —
          // mas quem MANDA na tela é `estado`.
          status: r.status,
          estado: retrato.estado,
          /** Quando o acesso funcionou pela última vez. `null` = nunca medimos. */
          funcionouEm: retrato.confirmadoEm,
          provaDoAcesso: retrato.provaDoAcesso,
          /** O que a Meta respondeu ao recusar. `null` quando não caiu. */
          falha: retrato.falha,
          /** Quem resolve. É o que decide se o cliente vê "reconecte" — código
           *  10 é permissão do app DA AGÊNCIA, e reconectar não conserta. */
          quemResolve: retrato.quemResolve,
          oQueFazer: retrato.oQueFazer,
          /** A data em que a LINHA nasceu. Nunca vai à tela sem esse nome. */
          registradaEm: retrato.registradaEm,
          connectedAt: r.connectedAt.toISOString(),
        };
      }),
  });
}
