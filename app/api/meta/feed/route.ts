// GET /api/meta/feed?connectionId=<id>&limit=12 — lê o feed do Instagram de
// uma conexão guardada no cofre.
//
// Existe porque o Design precisa OLHAR o feed do cliente antes de produzir —
// identidade visual não se lê por legenda. O token de longa duração mora
// cifrado no banco e não sai de lá; esta rota usa o token no servidor e
// devolve só o que uma pessoa veria olhando o perfil: tipo, URL da mídia,
// legenda, data. Nenhum token na resposta.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { loadConnectionToken } from "@/lib/integrations/meta/connections";
import { GRAPH_BASE } from "@/lib/integrations/meta/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const connectionId = request.nextUrl.searchParams.get("connectionId") ?? "";
  const limit = Math.min(24, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 12)));
  if (!connectionId) return NextResponse.json({ error: "connectionId obrigatório" }, { status: 400 });

  const conexao = await loadConnectionToken(session!.workspaceId, connectionId);
  if (!conexao || conexao.platform !== "instagram") {
    return NextResponse.json({ error: "Conexão de Instagram não encontrada" }, { status: 404 });
  }

  const igUserId = (conexao.metaJson.igUserId as string | undefined) ?? conexao.externalId;
  const token = conexao.token;

  const url = new URL(`${GRAPH_BASE}/${igUserId}/media`);
  url.searchParams.set("fields", "media_type,media_url,thumbnail_url,caption,permalink,timestamp,children{media_url,media_type}");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", token);

  const res = await fetch(url).catch(() => null);
  const dados = res ? await res.json().catch(() => null) : null;
  if (!res?.ok || !dados) {
    const motivo = (dados as { error?: { message?: string } })?.error?.message ?? "a Meta não respondeu";
    return NextResponse.json({ error: `não consegui ler o feed: ${motivo}` }, { status: 502 });
  }

  return NextResponse.json({ feed: (dados as { data?: unknown[] }).data ?? [] });
}
