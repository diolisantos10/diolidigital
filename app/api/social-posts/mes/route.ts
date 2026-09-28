// POST /api/social-posts/mes — garante o calendário do mês, finaliza a
// legenda e a arte de todas as peças e abre UM card de aprovação com o mês
// inteiro, para toda marca em modo MENSAL.
//
// É por esta rota que o Diretor gera manualmente o mês de novembro (ou
// qualquer outro) depois do merge — o relógio (`despertador.ts`) faz o mesmo
// trabalho sozinho todo dia 25 10h Brasília, para o mês SEGUINTE; esta rota
// existe para não depender de esperar o próximo dia 25 para provar o
// caminho inteiro, e para reprocessar um mês específico se precisar.
//
// Guarda copiada de `semana/route.ts`, pelo MESMO motivo: sessão de staff
// (aqui, só "master" — abrir card é ato de negócio, não de produção), nunca
// portal, CSRF e rate-limit.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { finalizarMes, janelaDoMesTexto } from "@/lib/agency/esteira/mes-editorial";

const PODEM_FINALIZAR = ["master"] as const;

/** Ato de negócio raro (garante calendário, abre card) — teto baixo de
 *  propósito, o mesmo de `semana/route.ts`. */
const CHAMADAS_POR_MINUTO = 5;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_FINALIZAR]);
  if (error) return error;
  // Sessão de portal nunca finaliza o mês em nome da agência.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`mes-editorial:${session.userId}`, CHAMADAS_POR_MINUTO, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas chamadas em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as {
    mes?: string;
    clientId?: string;
  } | null;

  const mes = corpo?.mes?.trim();
  if (!mes || !janelaDoMesTexto(mes)) {
    return NextResponse.json({ error: 'mes é obrigatório, no formato "AAAA-MM"' }, { status: 400 });
  }

  const clientId = corpo?.clientId?.trim() || undefined;
  if (clientId) {
    const cliente = await clienteOuNulo(clientId, { workspaceId: session.workspaceId });
    if (!cliente) {
      // 404, nunca 403: não confirma que o id existe em outro workspace.
      return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    }
  }

  const resultado = await finalizarMes({
    workspaceId: session.workspaceId,
    clientId,
    mes,
  });

  return NextResponse.json({
    ok: true,
    clientesElegiveis: resultado.clientesElegiveis,
    calendariosGerados: resultado.calendariosGerados,
    postsFinalizados: resultado.postsFinalizados,
    falhas: resultado.falhas,
    recusas: resultado.recusas,
    cards: resultado.cards,
  });
}
