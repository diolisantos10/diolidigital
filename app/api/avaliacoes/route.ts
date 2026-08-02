// GET /api/avaliacoes — as avaliações que esperam decisão de gente.
//
// Existe pelo mesmo motivo de `/api/pacotes-travados`: escalada invisível é o
// mesmo que escalada nenhuma. A agência escreve o rascunho da resposta a uma
// avaliação ruim e PARA ali de propósito — mas se ninguém vê a fila, o cliente
// fica dias sem resposta no perfil dele, que é justamente o pior cenário.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { avaliacoesEsperando } from "@/lib/agency/esteira/avaliacoes";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const lista = await avaliacoesEsperando(session?.workspaceId);
  return NextResponse.json({
    total: lista.length,
    avaliacoes: lista.map((a) => ({
      id: a.id,
      autor: a.reviewerName,
      estrelas: a.starRating,
      comentario: a.comment,
      quando: a.createdAtGoogle,
      rascunhoDaResposta: a.reply,
      porQueEscalou: a.escalatedReason,
    })),
  });
}
