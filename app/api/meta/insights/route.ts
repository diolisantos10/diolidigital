// GET /api/meta/insights?clientId=<id>&desde=AAAA-MM-DD&ate=AAAA-MM-DD&posts=1
//
// As métricas REAIS do Instagram do cliente para o dashboard da equipe:
// perfil, totais do período, série diária de alcance e (com `posts=1`) as
// métricas dos últimos posts. LEITURA pura — nenhuma escrita na Meta.
//
// Estados são resposta, não exceção: cliente sem rede conectada e token
// vencido saem com HTTP 200 e `ok:false` + `semConexao`/`precisaReconectar`,
// porque para o dashboard isso É um dado ("mostre o botão de conectar"), não
// uma falha do servidor.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import {
  lerFeedDoCliente,
  lerMetricasDaConta,
  lerMetricasDosPosts,
} from "@/lib/integrations/meta/leitura";

export const dynamic = "force-dynamic";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
/** Quantos posts recebem métricas quando `posts=1`. Cada um custa até 2 GETs. */
const POSTS_COM_METRICAS = 12;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const q = request.nextUrl.searchParams;
  const clientId = q.get("clientId") ?? "";
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const desde = q.get("desde") ?? undefined;
  const ate = q.get("ate") ?? undefined;
  if ((desde && !DATA_VALIDA.test(desde)) || (ate && !DATA_VALIDA.test(ate))) {
    return NextResponse.json({ error: "desde/ate devem ser AAAA-MM-DD" }, { status: 400 });
  }

  const conta = await lerMetricasDaConta(session!.workspaceId, clientId, { desde, ate });
  if (!conta.ok) {
    return NextResponse.json({
      ok: false,
      error: conta.error,
      semConexao: conta.semConexao ?? false,
      precisaReconectar: conta.precisaReconectar ?? false,
    });
  }

  // Métricas por post são opt-in: custam feed + 2 GETs por post.
  let posts: unknown;
  if (q.get("posts") === "1") {
    const feed = await lerFeedDoCliente(session!.workspaceId, clientId, { limite: POSTS_COM_METRICAS });
    if (feed.ok) {
      const m = await lerMetricasDosPosts(
        session!.workspaceId,
        clientId,
        feed.posts.map((p) => p.id),
      );
      // Best-effort: a conta já respondeu; posts sem métricas não derrubam o painel.
      posts = m.ok ? m.posts : undefined;
    }
  }

  return NextResponse.json({
    ok: true,
    conta: {
      perfil: conta.perfil,
      periodo: conta.periodo,
      totais: conta.totais,
      ...(conta.aviso ? { aviso: conta.aviso } : {}),
    },
    serie: conta.serie,
    ...(posts !== undefined ? { posts } : {}),
  });
}
