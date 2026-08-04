// GET /api/portal/metricas[?desde=&ate=] — as métricas do Instagram DO CLIENTE
// do token, para o dashboard do portal.
//
// Mesmo shape de /api/meta/insights (a UI consome os dois às cegas), com a
// regra do portal (03/08/2026): o clientId é DERIVADO do token — derivação,
// nunca comparação; clientId de query não entra aqui.
//
// Os dois estados que o cliente precisa ver com todas as letras:
//   { ok:false, semConexao:true }        → "nenhuma rede conectada"
//   { ok:false, precisaReconectar:true } → "precisa reconectar o Instagram"

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerMetricasDaConta } from "@/lib/integrations/meta/leitura";

export const dynamic = "force-dynamic";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Query (compatibilidade) ou cookie httpOnly — o padrão das rotas do portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const desde = q.get("desde") ?? undefined;
  const ate = q.get("ate") ?? undefined;
  if ((desde && !DATA_VALIDA.test(desde)) || (ate && !DATA_VALIDA.test(ate))) {
    return NextResponse.json({ error: "desde/ate devem ser AAAA-MM-DD" }, { status: 400 });
  }

  try {
    const conta = await lerMetricasDaConta(dono.workspaceId, dono.clientId, { desde, ate });
    if (!conta.ok) {
      return NextResponse.json({
        ok: false,
        // A frase já vem em português de gente da camada de leitura.
        error: conta.error,
        semConexao: conta.semConexao ?? false,
        precisaReconectar: conta.precisaReconectar ?? false,
      });
    }
    return NextResponse.json({
      ok: true,
      conta: {
        perfil: conta.perfil,
        periodo: conta.periodo,
        totais: conta.totais,
        // Mesmo shape de /api/meta/insights: o rótulo do alcance é decidido no
        // servidor, porque "soma do alcance diário" não é "contas únicas".
        alcanceOrigem: conta.alcanceOrigem,
        rotuloDoAlcance: conta.rotuloDoAlcance,
        ...(conta.aviso ? { aviso: conta.aviso } : {}),
      },
      serie: conta.serie,
    });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar agora" }, { status: 503 });
  }
}
