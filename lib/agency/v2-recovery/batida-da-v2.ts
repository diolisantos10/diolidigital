// A BATIDA DA V2 — outbox, heartbeat e detector, num lugar só e com DOIS relógios.
//
// ── O ACHADO DE 25/08/2026, E POR QUE ESTE ARQUIVO EXISTE ────────────────────
//
// `POST /api/cron/v2` foi construído no Marco 6 e **nunca teve um chamador**.
// Nem workflow do GitHub, nem `scripts/`, nem perna do despertador: medido
// arquivo por arquivo, zero. Consequência exata, e ela não é teórica:
//
//   • o OUTBOX nunca foi processado. O aviso de atraso que o Gerente Geral
//     enfileira em `gerencia/rodada.ts` como `mensagem_ao_cliente` ficava
//     `pending` para sempre — a casa gravava a intenção de avisar e não avisava;
//   • o HEARTBEAT do `cron-v2` nunca era gravado, então o detector de relógios
//     ausentes acusava a si mesmo e ninguém lia;
//   • o DETECTOR DE PARADOS nunca rodava.
//
// Motor construído e mudo é o defeito que esta casa já viu três vezes. A ordem
// era **pendurar no relógio que existe, não criar relógio novo** — e é o que
// este módulo permite: a batida virou função, e agora tem dois chamadores, o
// `POST /api/cron/v2` (para quando alguém ligar um agendador externo) e a perna
// do `despertador.ts`, que é quem bate de 5 em 5 minutos com o app no ar.
//
// Idempotente por desenho: o outbox tem chave de idempotência e o heartbeat é
// um `upsert`. Duas batidas na mesma janela não produzem dois avisos.

import { prisma } from "@/lib/db/client";
import { processarOutbox, type ArmazemDeOutbox, type Executor } from "@/lib/agency/v2-recovery/processador-outbox";
import { detectarAusencias, RELOGIOS_ESPERADOS } from "@/lib/agency/v2-recovery/heartbeat";
import { detectarParados, type ItemMonitorado } from "@/lib/agency/v2-recovery/detector-de-parados";
import { rodadaDoGerenteGeral } from "@/lib/agency/gerencia/rodada";
import { entregarAvisoAoCliente } from "@/lib/agency/gerencia/aviso-ao-cliente";
import type { ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";

/** Executores por tipo de efeito. Tipo sem executor vira falha declarada →
 *  retry → fila morta: efeito novo só nasce quando o executor dele existir.
 *
 *  EXPORTADO para que o teste alcance o EFEITO REAL, e não uma cópia dele.
 *  A mutação que removia o aviso de atraso ao cliente daqui sobrevivia à suíte
 *  inteira — 656 testes verdes com o gatilho arrancado. Gatilho que nenhum
 *  teste alcança é gatilho que a próxima refatoração apaga sem ninguém ver. */
export const EXECUTORES: Record<string, Executor> = {
  // O primeiro executor real: um registro de log estruturado — usado pelos
  // testes de ponta e pelo piloto sintético do M7. Efeitos com consequência
  // externa (mensagem, publicação) ganham executor quando o fluxo que os
  // enfileira for ligado por flag, nunca antes.
  registro_de_teste: async (payload, correlationId) => {
    console.log("[cron/v2] efeito de teste processado", { payload, correlationId });
  },

  // ── A FALA DO GERENTE GERAL COM O CLIENTE ────────────────────────────────
  //
  // Enfileirada por `lib/agency/gerencia/rodada.ts` quando um prazo PROMETIDO
  // queima. "Coluna gravada não é cliente informado" — mas informar o cliente
  // é efeito com consequência externa, e nesta casa efeito externo nasce
  // FECHADO: só sai com a flag `v2_execucao` ligada NO ESCOPO DAQUELE cliente
  // (allowlist; jamais global). Sem linha de flag, o efeito falha declarado,
  // volta para a fila e nada é enviado — que é o comportamento certo enquanto
  // o CEO não mandar ligar, com motivo e dono.
  mensagem_ao_cliente: async (payload, correlationId) => {
    await entregarAvisoAoCliente(payload, correlationId, {
      armazemDeFlags: armazemDeFlags(),
      async gravarMensagem({ clienteId, autorNome, corpo }) {
        await prisma.portalMessage.create({
          data: { clientId: clienteId, authorRole: "team", authorName: autorNome, body: corpo, readByTeam: true },
        });

        // ── "COLUNA GRAVADA NÃO É CLIENTE INFORMADO" — a régua estava escrita
        // aqui em cima desde sempre, e o código parava na coluna (27/08/2026).
        //
        // A `PortalMessage` só chega a quem ABRE o portal. O cliente cujo prazo
        // queimou é exatamente o que não está olhando — ele está esperando. O
        // aviso agora sai pelo canal ÚNICO do cliente (`avisarCliente`), que
        // tenta WhatsApp, cai para e-mail, e vira fila manual se os dois
        // falharem. Não é um segundo caminho de envio: é O caminho, que este
        // ponto não usava.
        //
        // Best-effort: perder o aviso é ruim, perder o registro é pior — e o
        // registro acima já está feito.
        try {
          const cliente = await prisma.client.findUnique({
            where: { id: clienteId },
            select: { workspaceId: true },
          });
          if (cliente?.workspaceId) {
            const { avisarCliente } = await import("@/lib/agency/esteira/avisos");
            await avisarCliente({
              workspaceId: cliente.workspaceId,
              clientId: clienteId,
              tipo: "atraso",
              texto: corpo,
            });
          }
        } catch (e) {
          console.warn("[cron/v2] o atraso foi gravado mas não consegui avisar o cliente:", e instanceof Error ? e.message : e);
        }
      },
    });
    console.log("[cron/v2] Gerente Geral avisou o cliente sobre atraso", { correlationId });
  },
};

function armazemDeFlags(): ArmazemDeFlags {
  return {
    async buscar(chave, escopos) {
      const linhas = await prisma.flagV2.findMany({ where: { chave, escopo: { in: escopos } } });
      return linhas.map((l) => ({ chave: l.chave, escopo: l.escopo, ligada: l.ligada }));
    },
  };
}

function armazemDePrisma(): ArmazemDeOutbox {
  return {
    async pendentesProntos(agora, limite) {
      return prisma.outboxV2.findMany({
        where: { status: "pending", proximaTentativaEm: { lte: agora } },
        orderBy: { proximaTentativaEm: "asc" },
        take: limite,
        select: { id: true, tipo: true, payload: true, tentativas: true, chaveIdempotencia: true, correlationId: true },
      });
    },
    async marcarEnviado(id, em) {
      await prisma.outboxV2.update({ where: { id }, data: { status: "sent", enviadoEm: em } });
    },
    async marcarFalha(id, tentativas, proximaTentativa, erro) {
      await prisma.outboxV2.update({
        where: { id },
        data: { status: "pending", tentativas, proximaTentativaEm: proximaTentativa, ultimoErro: erro },
      });
    },
    async marcarMorto(id, erro) {
      await prisma.outboxV2.update({ where: { id }, data: { status: "dead", ultimoErro: erro } });
    },
  };
}


export interface ResultadoDaBatidaV2 {
  agora: string;
  outbox: Awaited<ReturnType<typeof processarOutbox>>;
  ausencias: ReturnType<typeof detectarAusencias>;
  parados: ReturnType<typeof detectarParados>;
  gerenteGeral: unknown;
}

/**
 * UMA batida da V2. Chamada pelo `POST /api/cron/v2` e pelo despertador.
 *
 * `rodarGerenteGeral: false` existe para o despertador, que já chama a rodada
 * do Gerente Geral na perna anterior dele — chamar duas vezes na mesma batida
 * não quebraria nada (a rodada é idempotente), mas dobraria o trabalho de
 * varredura e faria o placar mentir sobre quantas rodadas houve.
 */
export async function baterORelogioDaV2(
  agora: Date = new Date(),
  opcoes: { rodarGerenteGeral?: boolean } = {},
): Promise<ResultadoDaBatidaV2> {
  const rodarGG = opcoes.rodarGerenteGeral ?? true;

  // 1. A própria batida.
  await prisma.heartbeatDoRelogio.upsert({
    where: { relogio: "cron-v2" },
    update: { ultimaBatida: agora },
    create: { relogio: "cron-v2", ultimaBatida: agora },
  });

  // 2. O outbox.
  const outbox = await processarOutbox(EXECUTORES, armazemDePrisma(), agora);

  // 3. Relógios ausentes.
  const batidas = await prisma.heartbeatDoRelogio.findMany();
  const ausencias = detectarAusencias(
    [...RELOGIOS_ESPERADOS],
    batidas.map((b) => ({ relogio: b.relogio, ultimaBatida: b.ultimaBatida })),
    agora,
    30,
  );

  // 4. Itens parados por estado+SLA (só quem já tem estadoCanonico — o
  //    detector cresce junto com o backfill do rollout).
  const [tarefas, aprovacoes] = await Promise.all([
    prisma.task.findMany({
      where: { estadoCanonico: { not: null } },
      select: { id: true, estadoCanonico: true, updatedAt: true },
      take: 500,
    }),
    prisma.approvalRequest.findMany({
      where: { estadoCanonico: { not: null } },
      select: { id: true, estadoCanonico: true, updatedAt: true },
      take: 500,
    }),
  ]);
  const monitorados: ItemMonitorado[] = [
    ...tarefas.map((t) => ({ id: t.id, entidadeTipo: "Task", estadoCanonico: t.estadoCanonico, atualizadoEm: t.updatedAt })),
    ...aprovacoes.map((a) => ({ id: a.id, entidadeTipo: "ApprovalRequest", estadoCanonico: a.estadoCanonico, atualizadoEm: a.updatedAt })),
  ];
  const parados = detectarParados(monitorados, agora);

  if (ausencias.length > 0) {
    console.error("[cron/v2] relógios ausentes:", ausencias);
  }
  if (parados.parados.length > 0) {
    console.error(`[cron/v2] ${parados.parados.length} item(ns) parados além do SLA`);
  }

  // 5. O LAÇO QUE NÃO PARA — o Gerente Geral percorre os projetos abertos e
  //    diz, de cada um: no prazo ou atrasado, de quem é a bola e qual a
  //    próxima ação. Atraso vira BloqueioV2 (dono + ação), e prazo prometido
  //    queimado vira aviso ao cliente na fila. Erro aqui não derruba a batida:
  //    o relógio da V2 continua sendo o do outbox e do detector.
  let gerenteGeral: unknown = null;
  try {
    gerenteGeral = rodarGG ? await rodadaDoGerenteGeral(agora) : { pulado: "o despertador já rodou o Gerente Geral nesta batida" };
  } catch (err) {
    console.error("[cron/v2] rodada do Gerente Geral falhou", err);
    gerenteGeral = { erro: err instanceof Error ? err.message : String(err) };
  }
  return { agora: agora.toISOString(), outbox, ausencias, parados, gerenteGeral };
}
