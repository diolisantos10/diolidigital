// POST /api/social-posts/semana — finaliza a legenda e manda desenhar a arte
// das peças "pauta" de UMA JANELA de datas, e aplica o modo de aprovação.
//
// É por esta rota que o Diretor gera manualmente a semana 28/09–04/10 (ou
// qualquer outra) depois do merge — o relógio (`despertador.ts`) faz o mesmo
// trabalho sozinho toda quinta 10h Brasília, para a semana SEGUINTE; esta
// rota existe para não depender de esperar a próxima quinta para provar o
// caminho inteiro, e para reprocessar uma semana específica se precisar.
//
// Guarda copiada de `publicar-agora/route.ts`: sessão de staff (aqui, só
// "master" — abrir card/aprovar por regra é ato de negócio, não de produção),
// nunca portal, CSRF e rate-limit. `de`/`ate` viram os limites do DIA em
// Brasília (`inicioDoDiaBrasilia`/`fimDoDiaBrasilia`, de `modo-de-aprovacao.ts`
// — mesma régua de fuso que o resto da casa usa, uma implementação só).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { finalizarSemana } from "@/lib/agency/esteira/semana-editorial";
import { inicioDoDiaBrasilia, fimDoDiaBrasilia } from "@/lib/agency/esteira/modo-de-aprovacao";

const PODEM_FINALIZAR = ["master"] as const;

/** Ato de negócio raro (abre card, aprova por regra) — teto baixo de propósito. */
const CHAMADAS_POR_MINUTO = 5;

/** Um mês inteiro no máximo — a rotina normal é 7 dias; a rota manual serve
 *  para reprocessar UMA janela, não o calendário inteiro de uma vez. */
const MAX_DIAS_NO_INTERVALO = 31;

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_FINALIZAR]);
  if (error) return error;
  // Sessão de portal nunca finaliza semana em nome da agência.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`semana-editorial:${session.userId}`, CHAMADAS_POR_MINUTO, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas chamadas em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as {
    de?: string;
    ate?: string;
    clientId?: string;
  } | null;

  const deStr = corpo?.de?.trim();
  const ateStr = corpo?.ate?.trim();
  if (!deStr || !ateStr || !DATA_REGEX.test(deStr) || !DATA_REGEX.test(ateStr)) {
    return NextResponse.json({ error: 'de e ate são obrigatórios, no formato "AAAA-MM-DD"' }, { status: 400 });
  }

  const de = inicioDoDiaBrasilia(deStr);
  const ate = fimDoDiaBrasilia(ateStr);
  if (!de || !ate) {
    return NextResponse.json({ error: 'de/ate inválidos — use o formato "AAAA-MM-DD"' }, { status: 400 });
  }
  if (ate.getTime() < de.getTime()) {
    return NextResponse.json({ error: '"ate" não pode vir antes de "de"' }, { status: 400 });
  }
  const dias = Math.ceil((ate.getTime() - de.getTime()) / (24 * 60 * 60_000));
  if (dias > MAX_DIAS_NO_INTERVALO) {
    return NextResponse.json(
      { error: `intervalo máximo é de ${MAX_DIAS_NO_INTERVALO} dias — este pedido cobre ${dias}` },
      { status: 400 },
    );
  }

  const clientId = corpo?.clientId?.trim() || undefined;
  if (clientId) {
    const cliente = await clienteOuNulo(clientId, { workspaceId: session.workspaceId });
    if (!cliente) {
      // 404, nunca 403: não confirma que o id existe em outro workspace.
      return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    }
  }

  const resultado = await finalizarSemana({
    workspaceId: session.workspaceId,
    clientId,
    de,
    ate,
  });

  return NextResponse.json({
    ok: true,
    clientesProcessados: resultado.clientesProcessados,
    postsFinalizados: resultado.postsFinalizados,
    falhas: resultado.falhas,
    aprovacoes: resultado.aprovacoes,
  });
}
