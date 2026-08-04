// GET /api/meta/feed?clientId=<id>&limit=24  (caminho novo — por cliente)
// GET /api/meta/feed?connectionId=<id>&limit=12  (compatibilidade)
//
// Existe porque o Design precisa OLHAR o feed do cliente antes de produzir —
// identidade visual não se lê por legenda. O token de longa duração mora
// cifrado no banco e não sai de lá; a camada de leitura (leitura.ts) usa o
// token no servidor e devolve só o que uma pessoa veria olhando o perfil:
// tipo, URL da mídia, legenda, data — e agora curtidas/comentários, que é o
// que diz QUAIS posts do cliente funcionam. Nenhum token na resposta.
//
// Estados de conexão saem com 200 e `ok:false` (semConexao/precisaReconectar):
// para quem monta a tela, "cliente sem Instagram" é informação, não erro 5xx.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import {
  lerFeedDoCliente,
  lerFeedPorConexao,
  LIMITE_MAXIMO_DO_FEED,
  LIMITE_PADRAO_DO_FEED,
} from "@/lib/integrations/meta/leitura";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const q = request.nextUrl.searchParams;
  const clientId = q.get("clientId") ?? "";
  const connectionId = q.get("connectionId") ?? "";
  const limite = Math.min(
    LIMITE_MAXIMO_DO_FEED,
    Math.max(1, Number(q.get("limit") ?? LIMITE_PADRAO_DO_FEED) || LIMITE_PADRAO_DO_FEED),
  );
  if (!clientId && !connectionId) {
    return NextResponse.json({ error: "informe clientId (ou connectionId)" }, { status: 400 });
  }

  const r = clientId
    ? await lerFeedDoCliente(session!.workspaceId, clientId, { limite })
    : await lerFeedPorConexao(session!.workspaceId, connectionId, { limite });

  if (!r.ok) {
    return NextResponse.json({
      ok: false,
      error: r.error,
      semConexao: r.semConexao ?? false,
      precisaReconectar: r.precisaReconectar ?? false,
    });
  }
  // A chave `feed` fica pelo nome antigo da rota; `posts` é o mesmo array com
  // o shape documentado em leitura.ts (PostDoFeed).
  return NextResponse.json({ ok: true, feed: r.posts });
}
