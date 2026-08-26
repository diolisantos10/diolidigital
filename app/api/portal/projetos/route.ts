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
 *
 * ── O CLIENTE OCULTO PEGOU ESTA FUNÇÃO MENTINDO (26/08/2026) ───────────────
 *
 * Ela tinha três ramos e o último era um `else` que dizia **"Em produção"**
 * para tudo o que não tinha sido apresentado. Medido em produção, no projeto
 * cmt9f1f7w001y0xo781zi2jt4 (CANTINA DO PORTO TESTE):
 *
 *   • o despertador dizia "1 projeto(s) parados por falta de pagamento
 *     confirmado";
 *   • `/api/portal/messages` dizia ao cliente, corretamente, "Este projeto
 *     está aguardando o pagamento";
 *   • e `/api/portal/projetos` — o CARTÃO do projeto, que é o que ele vê
 *     primeiro — dizia **"Em produção"**.
 *
 * Duas superfícies do MESMO portal, contando coisas opostas. E o `else` mentia
 * do jeito mais caro: dizendo que o trabalho está andando quando ele está
 * parado esperando uma ação DELE. O docstring acima já dizia "status digitado
 * mente" — e o rótulo derivado mentia igual, por omissão de ramo.
 *
 * `directionApprovedAt` estava no `select`, chegava aqui e **não era lido por
 * ninguém**. Agora é: sem o aval da direção, o projeto não está em produção —
 * está esperando o cliente.
 */
function etapaLegivel(p: {
  presentedAt: Date | null;
  clientApprovedAt: Date | null;
  directionApprovedAt: Date | null;
}, pago: boolean): string {
  if (p.clientApprovedAt) return "Aprovado por você — colocando no ar";
  if (p.presentedAt) return "Esperando a sua aprovação";
  // Antes de qualquer trabalho: o dinheiro e o aval, nesta ordem — que é a
  // ordem em que a esteira os cobra (`ligar-projeto`, no despertador).
  if (!pago) return "Aguardando o pagamento para começar";
  if (!p.directionApprovedAt) return "Esperando o seu aval no caminho";
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
          // O pedido é o que liga o projeto à testemunha de pagamento. Entra no
          // select porque `etapaLegivel` passou a precisar dele — e continua
          // sem VAZAR: o id do pedido não vai para a resposta.
          clientRequestId: true,
        },
      }),
      prisma.socialPost.findMany({
        // Por clientId: pega também os posts agendados sem clientRequestId —
        // o buraco exato que deixou o calendário da Foocci invisível.
        where: { clientId: dono.clientId, visibility: "compartilhado" },
        orderBy: { scheduledFor: "asc" },
        select: {
          id: true, caption: true, networks: true, format: true, pillar: true,
          mediaUrl: true, mediaUrlsJson: true, scheduledFor: true, status: true,
        },
      }),
    ]);

    // ── QUEM JÁ PAGOU, LIDO PELA MESMA TESTEMUNHA DA ESTEIRA ───────────────
    //
    // `PagamentoConfirmado` é a mesma tabela que `conferirPagamento` consulta
    // para LIBERAR a produção. Ler outra fonte aqui faria o cartão do cliente
    // divergir da trava — que é exatamente o defeito que este bloco conserta.
    //
    // Falha de leitura NÃO vira "pago": o `catch` devolve conjunto vazio, e
    // conjunto vazio faz o cartão dizer "aguardando o pagamento". Errar para o
    // lado de "ainda não começou" é honesto; errar para "em produção" é a
    // mentira que o cliente oculto encontrou.
    const idsDePedido = projetos.map((p) => p.clientRequestId).filter((id): id is string => !!id);
    const pagos = new Set<string>(
      idsDePedido.length === 0 ? [] :
      (await prisma.pagamentoConfirmado
        .findMany({ where: { clientRequestId: { in: idsDePedido }, valorCentavos: { gt: 0 } },
                    select: { clientRequestId: true } })
        .catch(() => [] as { clientRequestId: string }[])
      ).map((r) => r.clientRequestId),
    );

    return NextResponse.json({
      ok: true,
      projetos: projetos.map((p) => ({
        id: p.id,
        nome: p.name,
        objetivo: p.goal,
        etapa: etapaLegivel(p, !!p.clientRequestId && pagos.has(p.clientRequestId)),
        criadoEm: p.createdAt,
      })),
      calendario: posts.map((p) => ({
        id: p.id,
        caption: p.caption,
        networks: (() => { try { return JSON.parse(p.networks) as string[]; } catch { return []; } })(),
        format: p.format,
        pillar: p.pillar,
        mediaUrl: p.mediaUrl,
        // As telas do carrossel — o cliente clica no post agendado e vê a peça
        // INTEIRA, não só a miniatura da capa. Parse defensivo: JSON quebrado
        // vira lista vazia, nunca 500. (São artes prontas; o scenesJson —
        // descrição interna — continua fora da fronteira.)
        telas: (() => { try { const v = JSON.parse(p.mediaUrlsJson ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } })(),
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
