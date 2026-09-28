// POST /api/social/analises/rodar — dispara a análise semanal FORA da
// batida de segunda de manhã do despertador (F2-F1). Só "master". Corpo:
// `{ clientId?, semanaDe? }` — `clientId` ausente roda todas as marcas do
// workspace; `semanaDe` ("AAAA-MM-DD", a SEGUNDA daquela semana em Brasília)
// ausente usa a última semana fechada (`semanaAnterior`); presente
// reprocessa a semana pedida (backfill/reexecução manual).
//
// Guarda igual a `/api/agency/clients/[id]/dna/gerar`: só master, CSRF na
// mutação, rate limit BAIXO (cada rodada pode chamar IA e ler métricas da
// Meta por marca) — e, sem `clientId`, um TETO de marcas por chamada
// (`LIMITE_DE_MARCAS_SEM_CLIENTE`, abaixo): a rota é a porta MANUAL do mesmo
// motor que o despertador roda com `limite: 1` por tique, e "todas as marcas
// do workspace numa chamada só" é rajada na Meta e na IA, não backfill.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { rodarAnaliseSemanal, semanaDaData, type JanelaDaSemana } from "@/lib/agency/esteira/analista-semanal";

export const dynamic = "force-dynamic";

const PODEM_RODAR = ["master"] as const;

/**
 * Teto de marcas efetivamente ANALISADAS por chamada quando `clientId` NÃO é
 * informado (backfill do workspace inteiro). Sem isto, um workspace com N
 * marcas conectadas à Meta dispararia N leituras de métrica (Graph API) + N
 * chamadas de IA numa única requisição, sequenciais e sem pausa — a mesma
 * classe de rajada que a vitrine de segurança já nomeia ("Fail closed já é o
 * padrão desta casa") e que restringiu a conta de anúncios da agência em
 * 03/08/2026. O despertador já resolve isto com `limite: 1` por tique
 * (`despertador.ts`); esta rota é a porta MANUAL do mesmo motor e não herdava
 * o teto — só o rate limit da PRÓPRIA rota (6/min), que limita quantas vezes
 * o master CHAMA a rota, não quantas marcas uma única chamada processa.
 *
 * Maior que 1 porque aqui é ação deliberada de um master (não um relógio
 * automático) e o caso de uso normal é backfill de algumas marcas — mas
 * ainda um NÚMERO, nunca "todas de uma vez". A idempotência por
 * (clientId, semanaDe) faz uma segunda chamada pular de graça as marcas já
 * analisadas (sem tocar Meta/IA) e processar as próximas — o master repete a
 * chamada para varrer um workspace grande, em vez de uma rajada só.
 */
export const LIMITE_DE_MARCAS_SEM_CLIENTE = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_RODAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  // Teto baixo: cada rodada pode ler métricas de várias marcas na Meta e
  // chamar IA para o relatório de cada uma — não é uma gravação de campo.
  const { allowed, retryAfter } = rateLimit(`analise-semanal-rodar:${session.userId}`, 6, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas rodadas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => ({}))) as { clientId?: unknown; semanaDe?: unknown };

  let clientId: string | undefined;
  if (typeof corpo.clientId === "string" && corpo.clientId.trim()) {
    if (!(await clienteOuNulo(corpo.clientId, session))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    clientId = corpo.clientId;
  }

  let semanaForcada: JanelaDaSemana | undefined;
  if (typeof corpo.semanaDe === "string" && corpo.semanaDe.trim()) {
    semanaForcada = semanaDaData(corpo.semanaDe) ?? undefined;
    if (!semanaForcada) {
      return NextResponse.json({ error: `semanaDe inválida: "${corpo.semanaDe}" — use o formato AAAA-MM-DD (a segunda daquela semana)` }, { status: 400 });
    }
  }

  const r = await rodarAnaliseSemanal({
    workspaceId: session.workspaceId,
    clientId,
    agora: new Date(),
    semanaForcada,
    // Com `clientId`, só aquela marca é tocada — sem risco de rajada. Sem
    // ele, teto explícito (ver LIMITE_DE_MARCAS_SEM_CLIENTE acima).
    limite: clientId ? undefined : LIMITE_DE_MARCAS_SEM_CLIENTE,
  });

  return NextResponse.json({
    analisadas: r.analisadas,
    puladas: r.puladas,
    falhas: r.falhas,
  });
}
