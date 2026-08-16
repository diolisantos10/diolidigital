// POST /api/social-posts/publicar-agora — adianta o relógio de UMA peça.
//
// Por que existe (15/08/2026): até hoje a casa só publicava pelo relógio. Quem
// quisesse ver uma peça ir ao ar tinha de esperar a hora marcada — e isso
// bloqueava duas coisas ao mesmo tempo:
//
//   1. O vídeo de demonstração do App Review da Meta, que precisa MOSTRAR a
//      publicação acontecendo. Revisor não espera cron virar.
//   2. A operação em tempo integral: peça aprovada e pronta ficava parada
//      esperando o ponteiro, sem ninguém poder soltá-la.
//
// O QUE ESTA ROTA **NÃO** FAZ, e é o ponto inteiro do desenho: ela não publica
// nada por conta própria e não abre exceção nenhuma. Ela move `scheduledFor`
// para agora e chama a MESMA rodada de sempre, filtrada naquela peça. Todas as
// travas continuam na frente: aprovação do cliente peça por peça, freio de
// emergência (`PUBLICACAO_ORGANICA`), ativo autorizado pelo dono, formato do
// arquivo, ritmo do perfil. Se qualquer uma barrar, a peça não sai — e a
// resposta diz qual barrou, com a frase da própria trava.
//
// Só peça JÁ AGENDADA entra: `draft` não teve aval e `approved` ainda não virou
// agendamento. Adiantar o relógio de quem já tinha hora marcada é diferente de
// dar hora a quem não tinha.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/client";
import { publicarAgendados } from "@/lib/agency/esteira/publicacao";

const PODEM_PUBLICAR = ["master", "project_manager", "social_staff"] as const;
/** Ritmo de gente, não de máquina — o mesmo teto de `/api/meta/publish`. */
const PUBLICACOES_POR_MINUTO = 6;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_PUBLICAR]);
  if (error) return error;
  // Sessão de portal nunca publica, mesmo carregando papel interno.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(
    `publicar-agora:${session.userId}`,
    PUBLICACOES_POR_MINUTO,
    60_000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas publicações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as { postId?: string } | null;
  const postId = corpo?.postId?.trim();
  if (!postId) {
    return NextResponse.json({ error: "postId é obrigatório" }, { status: 400 });
  }

  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    select: { id: true, workspaceId: true, status: true, scheduledFor: true },
  });
  if (!post) {
    return NextResponse.json({ error: "peça não encontrada" }, { status: 404 });
  }
  // Peça de outro workspace não existe para esta sessão — e o 404 não conta
  // que ela existe em outro lugar.
  if (post.workspaceId !== session.workspaceId) {
    return NextResponse.json({ error: "peça não encontrada" }, { status: 404 });
  }
  if (post.status !== "scheduled") {
    return NextResponse.json(
      {
        error:
          `esta peça está em "${post.status}" — só peça AGENDADA se adianta. ` +
          "Peça sem hora marcada não teve o aval que o agendamento representa: " +
          "leve-a ao card de aprovação do cliente primeiro.",
      },
      { status: 409 },
    );
  }

  // O ponteiro anda; nada mais muda.
  await prisma.socialPost.update({ where: { id: post.id }, data: { scheduledFor: new Date() } });

  const resultado = await publicarAgendados({ apenasPostId: post.id });
  const falha = resultado.falhas.find((f) => f.postId === post.id);
  const adiada = resultado.adiados.find((a) => a.postId === post.id);

  if (resultado.publicados > 0 && !falha) {
    return NextResponse.json({ ok: true, publicado: true, postId: post.id });
  }
  if (falha) {
    // A frase é da trava que barrou — quem lê entende o que fazer, em vez de
    // ver "erro ao publicar" e procurar defeito onde há regra.
    return NextResponse.json({ ok: false, publicado: false, motivo: falha.erro }, { status: 400 });
  }
  if (adiada) {
    return NextResponse.json({ ok: false, publicado: false, motivo: adiada.motivo ?? "adiada nesta rodada" }, { status: 409 });
  }
  return NextResponse.json(
    { ok: false, publicado: false, motivo: "a rodada não alcançou esta peça — tente de novo em instantes." },
    { status: 409 },
  );
}
