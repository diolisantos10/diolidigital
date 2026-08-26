// POST /api/cron/execute — a REDE DE SEGURANÇA da produção.
//
// ── O RELÓGIO QUE BATIA E NÃO DIZIA (26/08/2026) ───────────────────────────
//
// O instrumento da própria casa gritava "relógio ausente: cron-execute" a cada
// batida do despertador — 7 vezes em 24h no `/api/pulso`. A leitura óbvia era
// "ninguém chama esta rota". **Ela está errada, e foi conferida:**
//
//   • `.github/workflows/cron-execute.yml` existe e dispara por `schedule`;
//   • 759 execuções registradas, e as 30 últimas TODAS `success`;
//   • a rota responde 401 (e não 503) a POST sem token, o que prova que o
//     `CRON_SECRET` está configurado no servidor.
//
// A rota rodava. O que ela nunca fazia era **registrar a própria batida** em
// `HeartbeatDoRelogio` — só `cron-v2` gravava a dele (`batida-da-v2.ts`). Um
// relógio vivo carimbado de morto, para sempre.
//
// Isso é pior que um alarme inútil: é um alarme que ENSINA A IGNORAR ALARME —
// a lição que esta casa já escreveu em `instrumentation.ts` sobre o "crash" que
// era rodízio de contêiner. Quando `cron-execute` morrer de verdade, a linha no
// pulso vai ser a mesma das outras sete da semana.
//
// Duas metades, e as duas são de medida:
//   1. a rota GRAVA a batida (aqui embaixo, antes de qualquer trabalho: a
//      batida é "eu fui chamado", não "eu consegui recuperar algo");
//   2. a TOLERÂNCIA passa a ser por relógio (`heartbeat.ts`). `schedule` do
//      GitHub é best-effort: medido em 26/08 sobre 30 disparos reais, o
//      intervalo mediano foi de 41,6 min e o máximo de 67,8 — com os 30 min
//      antigos, o alarme dispararia sobre um relógio saudável na metade das
//      janelas.
//
// ── E NENHUM RELÓGIO NOVO NASCEU ───────────────────────────────────────────
//
// Nem precisava: a perna `retomarProducao()` do despertador
// (`lib/agency/despertador.ts`, dentro do servidor, de 5 em 5 min) faz o mesmo
// trabalho desta rota — com os MESMOS números (5 por passada, 5 tentativas, 10
// min de "running" travado), a MESMA função de recuperação
// (`runProjectExecution`) e um candidato A MAIS (`pending`). Esta rota é o
// reforço de fora, para o caso de o servidor estar de pé e parado.
//
// `__tests__/plataforma/o-segundo-relogio-nao-diverge.test.ts` impede que as
// duas metades divirjam em silêncio, que é o único jeito de isso virar defeito.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";

const MAX_PER_TICK = 5;
/**
 * Quantas passadas SEGUIDAS sem fechar antes de o projeto parar de ser
 * retomado sozinho.
 *
 * É "seguidas", não "na vida": `runProjectExecution` zera `executionAttempts`
 * toda vez que fecha o pacote. Enquanto o contador era vitalício, o cliente de
 * mensalidade gastava as cinco tentativas nos dois primeiros meses e, do mês 3
 * em diante, qualquer falha ficava sem recuperação para sempre — sem log, sem
 * alerta, sem ninguém saber.
 */
const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MS = 10 * 60_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized — invalid CRON_SECRET" }, { status: 401 });
  }

  // A BATIDA É GRAVADA ANTES DO TRABALHO, e de propósito: ela responde "esta
  // rota foi chamada", não "esta rota recuperou algo". Gravar só no fim faria a
  // passada que não achou candidato — que é a maioria delas, e a que prova que
  // o relógio está vivo — continuar sem deixar rastro.
  //
  // Best-effort: uma falha ao gravar o diagnóstico não pode derrubar a
  // recuperação de produção que é o trabalho de verdade daqui.
  await prisma.heartbeatDoRelogio
    .upsert({
      where: { relogio: "cron-execute" },
      update: { ultimaBatida: new Date() },
      create: { relogio: "cron-execute", ultimaBatida: new Date() },
    })
    .catch((e: unknown) => {
      console.error("[cron-execute] não consegui gravar a batida do relógio:", e);
    });

  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  // Candidatos: travados em "running" (caíram no meio) OU "failed" com tentativas
  // sobrando. Ordena pelos mais antigos primeiro.
  //
  // "blocked" NÃO entra de propósito: é o estado de quem produziu e foi RECUSADO
  // duas passadas seguidas (piso de verdade ou contrato de saída). Retentar é
  // re-rolar o dado a 2 chamadas de IA por especialista, e o caso já está
  // escalado em `ActivityEvent`. Quem tira de "blocked" é a virada de ciclo ou o
  // material que o cliente enviar.
  const candidates = await prisma.project.findMany({
    where: {
      clientRequestId: { not: null },
      executionAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { executionStatus: "running", executionStartedAt: { lt: staleBefore } },
        { executionStatus: "failed" },
      ],
    },
    orderBy: { executionRequestedAt: "asc" },
    take: MAX_PER_TICK,
    select: { id: true },
  });

  const results: Array<{ projectId: string; status: string; produced: number }> = [];
  for (const p of candidates) {
    const r = await runProjectExecution(p.id);
    results.push({ projectId: p.id, status: r.status, produced: r.produced.length });
  }

  return NextResponse.json({ ok: true, recovered: results.length, results });
}
