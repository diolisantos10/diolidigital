// /api/portal/projetos — os projetos do cliente POR clientId, não por solicitação.
//
// Por que esta rota existe: no lançamento da Foocci (03/08/2026) o CEO abriu o
// portal e perguntou "onde eu vejo o projeto?". A aba Projetos estava vazia
// porque TUDO no portal derivava de clientRequestId — e cliente criado direto
// (sem passar pelo briefing público) não tem solicitação. O projeto existia, os
// posts do carrossel estavam agendados por clientId, e o cliente não via nada.
//
// Aqui a chave é o clientId derivado do token (regra da casa, 03/08/2026:
// derivação, nunca comparação — clientId de query/corpo não entra). Funciona
// para os dois mundos: cliente que veio do briefing e cliente criado direto.
//
// Fronteira do portal — o que NUNCA sai por aqui:
//   • proposalPricing / proposalScope / proposalStatus — preço não vai ao
//     cliente nesta versão (a decisão registrada aparece via aprovações);
//   • executionError / executionStatus / agents — o cliente não precisa saber
//     que uma IA falhou, precisa saber em que pé está o trabalho dele;
//   • post com visibility "interno" — fail-closed, mesma regra do calendário.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

/**
 * A etapa em português de gente, derivada dos carimbos do Project — a mesma
 * leitura da esteira para cliente direto (trilhaDoProjetoDireto, corrigida no
 * lançamento). Nunca do campo `stage` escrito à mão: status digitado mente.
 */
function etapaLegivel(p: {
  presentedAt: Date | null;
  clientApprovedAt: Date | null;
  directionApprovedAt: Date | null;
}): string {
  if (p.clientApprovedAt) return "Aprovado por você — colocando no ar";
  if (p.presentedAt) return "Esperando a sua aprovação";
  return "Em produção";
}

/** O estado do post como o CLIENTE entende — espelho do CalendarioDoMes. */
function statusLegivel(s: string): string {
  switch (s) {
    case "published": return "No ar";
    case "scheduled": return "Programado";
    case "failed":    return "Com problema";
    // A decisão do cliente propagada pelo card de calendário volta legível.
    case "approved":  return "Aprovado por você";
    case "revision_requested": return "Em ajuste";
    default:          return "Esperando você";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  // O dono vem SEMPRE do token — único caminho público desta rota.
  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const [projetos, posts] = await Promise.all([
      prisma.project.findMany({
        where: { clientId: dono.clientId },
        orderBy: { createdAt: "desc" },
        // Select explícito — o que não entra aqui não tem COMO vazar.
        select: {
          id: true, name: true, goal: true, createdAt: true,
          presentedAt: true, clientApprovedAt: true, directionApprovedAt: true,
        },
      }),
      prisma.socialPost.findMany({
        // Por clientId: pega também os posts agendados sem clientRequestId —
        // o buraco exato que deixou o calendário da Foocci invisível.
        where: { clientId: dono.clientId, visibility: "compartilhado" },
        orderBy: { scheduledFor: "asc" },
        select: {
          id: true, caption: true, networks: true, format: true, pillar: true,
          mediaUrl: true, scheduledFor: true, status: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      projetos: projetos.map((p) => ({
        id: p.id,
        nome: p.name,
        objetivo: p.goal,
        etapa: etapaLegivel(p),
        criadoEm: p.createdAt,
      })),
      calendario: posts.map((p) => ({
        id: p.id,
        caption: p.caption,
        networks: (() => { try { return JSON.parse(p.networks) as string[]; } catch { return []; } })(),
        format: p.format,
        pillar: p.pillar,
        mediaUrl: p.mediaUrl,
        scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
        // O cru para o componente agrupar; o legível para quem consome direto.
        status: p.status,
        statusLegivel: statusLegivel(p.status),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar agora" }, { status: 503 });
  }
}
