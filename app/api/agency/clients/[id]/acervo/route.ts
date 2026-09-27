// GET /api/agency/clients/[id]/acervo — a grade do acervo do Instagram já
// importado (ver `lib/integrations/meta/acervo.ts`). Leitura: qualquer papel
// de staff da agência vê a grade (mesma régua de `PacoteDaMarca` — nunca
// esconder o dado, só o controle de escrita); portal do cliente não alcança
// esta rota (é ferramenta interna, de produção, não de entrega).
//
// Contrato de resposta — `components/agency/clients/Acervo.tsx` consome
// exatamente isto:
//   { acervoImportadoEm: string | null, posts: [{
//       id, igMediaId, mediaType, caption, permalink, publicadoEm,
//       likeCount, commentsCount, alcance, thumbUrl, referencia, familiaLayout
//   }] }
// ordenado por publicadoEm desc. `alcance` vem de `insightsJson.reach` —
// `null` quando não medido (guardrail: ausência não é zero). `thumbUrl` é
// sempre um link da PRÓPRIA casa (`/api/media/<id>`, nunca a URL da Meta —
// ela expira), e `null` quando nenhuma mídia foi baixada com sucesso.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";

export const dynamic = "force-dynamic";

/** Vídeo/reel usa a capa (thumbnail) quando existe; senão a própria mídia.
 *  Carrossel usa a primeira tela. Ausência total → `null` (nunca link quebrado). */
function assetIdDaThumb(post: {
  mediaType: string;
  mediaAssetId: string | null;
  thumbnailAssetId: string | null;
  telasJson: string;
}): string | null {
  if (post.thumbnailAssetId) return post.thumbnailAssetId;
  if (post.mediaAssetId) return post.mediaAssetId;
  if (post.mediaType === "CAROUSEL_ALBUM") {
    try {
      const telas = JSON.parse(post.telasJson) as unknown;
      if (Array.isArray(telas) && typeof telas[0] === "string") return telas[0];
    } catch {
      // telasJson corrompido não é motivo para recusar a rota inteira — só
      // esta capa fica sem prévia.
    }
  }
  return null;
}

/** `insightsJson` é texto cru gravado por `acervo.ts` — `null`/ilegível vira
 *  "não medido", nunca zero (guardrail da casa). */
function alcanceDoPost(insightsJson: string | null): number | null {
  if (!insightsJson) return null;
  try {
    const m = JSON.parse(insightsJson) as Record<string, unknown>;
    const v = m.reach;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [cliente, posts] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { acervoImportadoEm: true } }),
    prisma.acervoPost.findMany({
      where: { clientId: id, workspaceId: session.workspaceId },
      orderBy: { publicadoEm: "desc" },
    }),
  ]);

  return NextResponse.json({
    acervoImportadoEm: cliente?.acervoImportadoEm ?? null,
    posts: posts.map((p) => ({
      id: p.id,
      igMediaId: p.igMediaId,
      mediaType: p.mediaType,
      caption: p.caption || null,
      permalink: p.permalink,
      publicadoEm: p.publicadoEm,
      likeCount: p.likeCount,
      commentsCount: p.commentsCount,
      alcance: alcanceDoPost(p.insightsJson),
      thumbUrl: (() => {
        const assetId = assetIdDaThumb(p);
        return assetId ? `/api/media/${assetId}` : null;
      })(),
      referencia: p.referencia,
      familiaLayout: p.familiaLayout,
    })),
  });
}
