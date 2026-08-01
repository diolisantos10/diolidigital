// despertador.ts — O RELÓGIO DA AGÊNCIA. É o que a faz trabalhar às 3 da manhã.
//
// O problema que ele resolve: a esteira inteira estava construída e correta, mas
// só andava quando alguém cutucava. Cliente aprovava a direção no domingo à
// noite e a produção esperava segunda; uma falha momentânea da IA derrubava uma
// entrega e nada nunca re-tentava; o aviso de WhatsApp ficava na fila para
// sempre. Uma agência que só trabalha quando tem gente olhando não é automática.
//
// POR QUE DENTRO DO APP, e não um cron externo:
// Um agendador externo (Railway cron, GitHub Action, cron-job.org) é mais uma
// peça para configurar à mão, mais um segredo para vazar e mais um lugar onde
// "está no ar?" tem resposta diferente da do app. Aqui o relógio SOBE JUNTO com
// o deploy: se a agência está no ar, o relógio está rodando. Não há estado
// intermediário onde o sistema parece vivo e não é.
//
// O QUE O TORNA SEGURO RODAR SOZINHO:
//   • O motor de produção é idempotente — quem já entregou é pulado.
//   • Há trava anti-concorrência de 10 min no próprio projeto.
//   • Cada passada é limitada (MAX_POR_RODADA) — nunca vira enxurrada.
//   • Erro numa tarefa não derruba as outras nem o servidor.
//
// Desligar: DESPERTADOR=off nas variáveis de ambiente.

import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { dispatchWhatsAppNotifications } from "@/lib/integrations/meta/notifications";

/** De quanto em quanto tempo a agência olha se tem trabalho parado. */
const INTERVALO_MS = Number(process.env.DESPERTADOR_INTERVALO_MS ?? 5 * 60_000);
/** Espera antes da primeira batida — deixa o servidor terminar de subir. */
const ATRASO_INICIAL_MS = 30_000;
/** Teto por rodada: recuperar 5 projetos de cada vez é recuperação; recuperar
 *  200 é uma enxurrada de chamadas de IA que ninguém pediu. */
const MAX_POR_RODADA = 5;
/** Depois de tantas tentativas, o projeto para de ser re-tentado sozinho — algo
 *  ali precisa de gente, e insistir para sempre só queima dinheiro de IA. */
const MAX_TENTATIVAS = 5;
/** "running" por mais que isto = o processo morreu no meio. */
const TRAVADO_MS = 10 * 60_000;

let ligado = false;

function log(msg: string): void {
  console.log(`[despertador] ${msg}`);
}

/**
 * Retoma a produção que parou sozinha:
 *   • travada em "running" há mais de 10 min (o processo caiu no meio);
 *   • "failed" com tentativas sobrando (falha momentânea de IA);
 *   • "pending" — a direção foi aprovada e o disparo não chegou a acontecer.
 */
async function retomarProducao(): Promise<number> {
  const travadoAntesDe = new Date(Date.now() - TRAVADO_MS);
  const candidatos = await prisma.project.findMany({
    where: {
      clientRequestId: { not: null },
      directionApprovedAt: { not: null },
      executionAttempts: { lt: MAX_TENTATIVAS },
      OR: [
        { executionStatus: "running", executionStartedAt: { lt: travadoAntesDe } },
        { executionStatus: "failed" },
        { executionStatus: "pending" },
      ],
    },
    orderBy: { executionRequestedAt: "asc" },
    take: MAX_POR_RODADA,
    select: { id: true },
  });

  let retomados = 0;
  for (const p of candidatos) {
    try {
      const r = await runProjectExecution(p.id);
      if (r.produced.length > 0 || r.status === "done") retomados++;
    } catch (err) {
      // Um projeto problemático não pode derrubar a rodada dos outros.
      log(`projeto ${p.id} falhou na retomada: ${err instanceof Error ? err.message : "erro"}`);
    }
  }
  return retomados;
}

/** Uma batida do relógio. Nunca lança — o relógio não pode morrer. */
export async function baterORelogio(): Promise<{ retomados: number; avisos: number }> {
  let retomados = 0;
  let avisos = 0;

  try {
    retomados = await retomarProducao();
  } catch (err) {
    log(`retomada falhou: ${err instanceof Error ? err.message : "erro"}`);
  }

  try {
    const r = await dispatchWhatsAppNotifications();
    avisos = typeof r?.sent === "number" ? r.sent : 0;
  } catch (err) {
    log(`disparo de avisos falhou: ${err instanceof Error ? err.message : "erro"}`);
  }

  if (retomados > 0 || avisos > 0) log(`rodada: ${retomados} produção(ões) retomada(s), ${avisos} aviso(s) enviado(s)`);
  return { retomados, avisos };
}

/**
 * Liga o relógio. Chamado uma vez por instância do servidor, pelo
 * `instrumentation.ts`. Chamar duas vezes é inofensivo — o segundo é ignorado.
 */
export function ligarDespertador(): void {
  if (ligado) return;
  if ((process.env.DESPERTADOR ?? "").trim().toLowerCase() === "off") {
    log("desligado por DESPERTADOR=off");
    return;
  }
  ligado = true;

  const minutos = Math.round(INTERVALO_MS / 60_000);
  log(`ligado — a agência vai olhar se há trabalho parado a cada ${minutos} min`);

  const tick = () => { void baterORelogio(); };
  setTimeout(() => {
    tick();
    const t = setInterval(tick, INTERVALO_MS);
    // Não segura o processo vivo só por causa do relógio: se o servidor está
    // encerrando, ele encerra.
    if (typeof t.unref === "function") t.unref();
  }, ATRASO_INICIAL_MS).unref?.();
}
