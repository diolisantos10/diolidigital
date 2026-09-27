// GET /api/social-posts/collab-pendentes — o painel dos convites de
// COLABORAÇÃO (1C-C1, 27/09/2026) que a Meta ainda não confirmou.
//
// Não existe endpoint na Graph API para ACEITAR um convite de colaboração —
// só o painel do Instagram faz isso (ver `lib/integrations/meta/collab.ts`).
// Esta rota é a visibilidade que falta: quem opera vê QUAL post, QUAL
// cliente e QUAIS contas ainda estão com `invite_status` pendente, e vai
// cutucar o colaborador fora da API.
//
// Sessão de AGÊNCIA, escopada por WORKSPACE — nunca lê `collabJson` de post
// de outro inquilino. O filtro de posse mora no PRÓPRIO `where`, nunca numa
// comparação feita depois de já ter lido a linha.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { convitePendente, type ConviteDeColaborador } from "@/lib/integrations/meta/collab";

interface CollabGravado {
  pedidos?: string[];
  enviadoEm?: string;
  resposta?: unknown;
  convites?: ConviteDeColaborador[];
  erroDaConferencia?: string;
  conferidoEm?: string;
}

/** Parse defensivo: `collabJson` corrompido não pode derrubar o painel. */
function lerCollab(bruto: string | null | undefined): CollabGravado | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto);
    return v && typeof v === "object" ? (v as CollabGravado) : null;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const posts = await prisma.socialPost
    .findMany({
      // Posse por workspace — no WHERE, não numa comparação depois de ler.
      where: { workspaceId: session.workspaceId, collabJson: { not: null } },
      select: { id: true, clientId: true, permalink: true, publishedAt: true, collabJson: true },
      orderBy: { publishedAt: "desc" },
    })
    .catch(() => null);
  if (posts === null) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const comConvitePendente = posts
    .map((p) => ({ p, collab: lerCollab(p.collabJson) }))
    .filter(({ collab }) => (collab?.convites ?? []).some((c) => convitePendente(c)));

  if (comConvitePendente.length === 0) return NextResponse.json({ posts: [] });

  const idsDeCliente = [
    ...new Set(comConvitePendente.map(({ p }) => p.clientId).filter((id): id is string => !!id)),
  ];
  const clientes = idsDeCliente.length > 0
    ? await prisma.client.findMany({ where: { id: { in: idsDeCliente } }, select: { id: true, name: true } })
    : [];
  const nomePorCliente = new Map(clientes.map((c) => [c.id, c.name]));

  return NextResponse.json({
    posts: comConvitePendente.map(({ p, collab }) => ({
      postId: p.id,
      clientId: p.clientId,
      cliente: p.clientId ? nomePorCliente.get(p.clientId) ?? null : null,
      permalink: p.permalink,
      publicadoEm: p.publishedAt ? p.publishedAt.toISOString() : null,
      contas: collab?.convites ?? [],
    })),
  });
}
