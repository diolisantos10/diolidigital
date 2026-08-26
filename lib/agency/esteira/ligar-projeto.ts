// ligar-projeto.ts — O PROJETO QUE NASCEU E NINGUÉM LIGA.
//
// ═══ O DEFEITO, MEDIDO NA PRODUÇÃO EM 24/08/2026 (case Farol 27) ═════════════
//
// A cadeia inteira andou — do pedido à entrega — mas só porque uma pessoa deu
// três empurrões à mão. O primeiro deles é este: **o projeto nasce `idle` e
// nenhum relógio o liga.**
//
// `Project.executionStatus` tem `@default("idle")` (`prisma/schema.prisma`), e
// as DUAS varreduras que existiam ignoram esse estado:
//
//   • `app/api/cron/execute/route.ts` — só `running` travado e `failed`;
//   • `despertador.ts → retomarProducao` — só `running` travado, `failed` e
//     `pending`, e ainda exige `directionApprovedAt` preenchido.
//
// `idle` não é candidato de ninguém. Projeto recém-aceito fica parado para
// sempre esperando alguém apertar — e ninguém aperta.
//
// ── E há um caminho que DEVOLVE o projeto para `idle` prometendo o contrário ──
//
// `run-execution.ts`, no portão de pagamento, escreve `executionStatus: "idle"`
// e comenta: *"O projeto volta a `idle` e espera — assim que o pagamento for
// registrado, a próxima rodada do despertador o pega sem intervenção."*
//
// **Isso era falso.** Nenhuma rodada olhava `idle`. O pagamento podia ser
// registrado no minuto seguinte e o projeto continuaria parado para sempre, com
// o comentário do código afirmando que estava tudo bem. É o pior formato de
// defeito desta casa: a promessa escrita ao lado da linha que não a cumpre.
//
// ═══ O QUE ESTA PERNA FAZ, E O QUE ELA NÃO FAZ ═══════════════════════════════
//
// **Não é um relógio novo.** Esta casa perdeu 10 dias com um cron que morreu em
// silêncio com o painel verde. Isto é uma perna do relógio que já roda a cada 5
// minutos e sobe junto com o deploy (`despertador.ts`). Um agendador a mais
// seria mais um lugar onde "está no ar?" tem resposta diferente da do app.
//
// **A TRAVA DE PAGAMENTO (D-0A7) CONTINUA INTEIRA — E É CONFERIDA DUAS VEZES.**
// Ligar sozinho não pode virar produzir sem pagar. Esta perna:
//
//   1. confere o pagamento ANTES de mexer em qualquer coisa, e sem prova
//      positiva NÃO enfileira nada (`conferirPagamento` nunca lança e falha
//      fechada — pedido ausente, registro ausente, valor zero, banco fora do ar:
//      tudo recusa);
//   2. quando enfileira, enfileira para `pending` — e quem produz é
//      `runProjectExecution`, que confere o MESMO portão outra vez, antes de
//      gastar um token. Não existe caminho daqui até a IA que pule a régua.
//
// E o projeto sem pagamento **não fica mudo**: a instrução gêmea da recusa
// (`mensagemAoCliente`) vai para a conversa do portal, uma vez, dizendo que
// está aguardando pagamento e como liberar. Silêncio era metade do defeito.
//
// **Não pula o aval de direção.** O portão de direção é do cliente e é o que
// separa "aprovar barato" de "refazer caro" — quem o abre é ele, pelo botão
// (que a partir de hoje existe sempre que a etapa exige, ver `fases.ts`). O que
// esta perna garante é que o PEDIDO de aval tenha efetivamente chegado até ele:
// `pedirDirecao` é best-effort e, quando a mensagem morre no meio, o projeto
// fica esperando uma decisão que nunca foi solicitada.

import { prisma } from "@/lib/db/client";
import { conferirPagamento } from "@/lib/agency/financeiro/portao-de-pagamento";

import { VOZ_DO_CLIENTE } from "@/lib/agency/gerencia/voz-unica";
/** Teto por rodada — o mesmo de tudo que o despertador toca. Recuperar alguns é
 *  recuperação; recuperar 200 é uma enxurrada que ninguém pediu. */
const MAX_POR_RODADA = 5;

/**
 * Quanto tempo um aviso de "aguardando pagamento" cala antes de poder repetir.
 * Repetir a cada 5 minutos seria a rajada que esta casa já pagou caro; nunca
 * repetir deixaria o cliente que perdeu a mensagem esperando para sempre.
 */
export const SILENCIO_DO_AVISO_DE_PAGAMENTO_MS = 3 * 24 * 60 * 60 * 1000;

/** O tipo do registro que serve de MEMÓRIA do aviso. Não existe "alguém
 *  lembra": a idempotência mora no banco. */
export const EVENTO_AGUARDANDO_PAGAMENTO = "projeto_aguardando_pagamento";
export const EVENTO_DIRECAO_REPEDIDA = "direcao_repedida";

export type DesfechoDoProjeto =
  /** Saiu de `idle`: entrou na fila de produção. */
  | { projectId: string; desfecho: "ligado" }
  /** Pagamento sem prova: continua parado, e o cliente foi avisado. */
  | { projectId: string; desfecho: "aguardando_pagamento"; avisou: boolean }
  /** Pago, mas o aval do cliente ainda não veio: continua parado, de propósito. */
  | { projectId: string; desfecho: "aguardando_direcao"; repediu: boolean }
  /** Nada a fazer com este projeto nesta rodada. */
  | { projectId: string; desfecho: "sem_acao"; motivo: string };

export interface RodadaDeLigamento {
  ligados: number;
  aguardandoPagamento: number;
  aguardandoDirecao: number;
  desfechos: DesfechoDoProjeto[];
}

/** Já avisamos este cliente sobre isto, e faz pouco tempo? */
async function jaRegistrado(
  workspaceId: string,
  projectId: string,
  type: string,
  desde: Date,
): Promise<boolean> {
  const achado = await prisma.activityEvent.findFirst({
    where: { workspaceId, projectId, type, timestamp: { gte: desde } },
    select: { id: true },
  }).catch(() => null);
  return achado !== null;
}

async function registrar(
  p: { workspaceId: string; id: string; clientId: string | null },
  type: string,
  message: string,
): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      workspaceId: p.workspaceId,
      projectId: p.id,
      ...(p.clientId ? { clientId: p.clientId } : {}),
      type,
      message: message.slice(0, 900),
    },
  }).catch(() => { /* best-effort: o registro não pode derrubar a rodada */ });
}

/**
 * Uma passada: os projetos parados em `idle` saem do lugar — ou dizem por que
 * não saem.
 *
 * NUNCA LANÇA. Um projeto torto não pode derrubar a rodada dos outros, e a
 * rodada não pode derrubar o relógio.
 */
export async function ligarProjetosParados(agora: Date = new Date()): Promise<RodadaDeLigamento> {
  const saida: RodadaDeLigamento = {
    ligados: 0, aguardandoPagamento: 0, aguardandoDirecao: 0, desfechos: [],
  };

  let parados: Array<{
    id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null;
    directionApprovedAt: Date | null; name: string;
  }>;
  try {
    parados = await prisma.project.findMany({
      where: {
        executionStatus: "idle",
        // Sem pedido não há o que conferir nem a quem falar — e é o próprio
        // portão de pagamento que recusa este caso (`pedido_ausente`).
        clientRequestId: { not: null },
        // O pacote já entregue e aprovado não volta para a fila: `idle` ali é
        // repouso, não parada. Ligar isto produziria de novo o que o cliente já
        // aprovou — e o motor é idempotente, mas a mensagem ao cliente não é.
        clientApprovedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_POR_RODADA,
      select: {
        id: true, workspaceId: true, clientId: true, clientRequestId: true,
        directionApprovedAt: true, name: true,
      },
    });
  } catch {
    return saida;
  }

  for (const p of parados) {
    try {
      // ── 1. O DINHEIRO, ANTES DE QUALQUER OUTRA COISA ──────────────────────
      // O portão mais barato e o mais duro. Falha fechada por construção.
      const pagamento = await conferirPagamento(p.clientRequestId!);
      if (!pagamento.liberado) {
        saida.aguardandoPagamento++;
        const desde = new Date(agora.getTime() - SILENCIO_DO_AVISO_DE_PAGAMENTO_MS);
        const jaFalamos = await jaRegistrado(p.workspaceId, p.id, EVENTO_AGUARDANDO_PAGAMENTO, desde);
        let avisou = false;
        if (!jaFalamos) {
          // A INSTRUÇÃO GÊMEA vai inteira ao cliente: o que está acontecendo E
          // o que fazer para liberar. Sem isto o projeto fica parado e mudo, que
          // é como o cliente conclui que a agência sumiu.
          await prisma.portalMessage.create({
            data: {
              clientRequestId: p.clientRequestId!,
              authorRole: "team",
              authorName: VOZ_DO_CLIENTE,
              body: pagamento.mensagemAoCliente,
              readByTeam: true,
            },
          }).then(() => { avisou = true; }).catch(() => { /* best-effort */ });
          await registrar(p, EVENTO_AGUARDANDO_PAGAMENTO,
            `${p.name}: produção NÃO iniciada — ${pagamento.motivo} (${pagamento.detalhe}). ` +
            (avisou ? "O cliente foi avisado no portal." : "O aviso ao cliente NÃO pôde ser escrito."));
        }
        saida.desfechos.push({ projectId: p.id, desfecho: "aguardando_pagamento", avisou });
        continue;
      }

      // ── 2. O AVAL DO CLIENTE ──────────────────────────────────────────────
      // Pago, mas sem o aval da direção: continua parado, e isso está CERTO.
      // O que não pode é o cliente estar esperando um pedido que nunca chegou.
      if (!p.directionApprovedAt) {
        saida.aguardandoDirecao++;
        const jaPedimos = await prisma.portalMessage.findFirst({
          where: { clientRequestId: p.clientRequestId!, authorRole: "team", body: { contains: "aval no caminho" } },
          select: { id: true },
        }).catch(() => null);
        let repediu = false;
        if (!jaPedimos) {
          // `pedirDirecao` é best-effort no nascimento do projeto: quando ela
          // morre, ninguém tenta de novo e o projeto espera uma decisão que o
          // cliente não sabe que tem de tomar. Aqui é a rede.
          const { pedirDirecao } = await import("@/lib/agency/esteira/marcos");
          const r = await pedirDirecao(p.id).catch(() => null);
          repediu = r?.avisouCliente === true;
          if (repediu) {
            await registrar(p, EVENTO_DIRECAO_REPEDIDA,
              `${p.name}: o pedido de aval da direção nunca tinha chegado ao portal do cliente. Enviado agora.`);
          }
        }
        saida.desfechos.push({ projectId: p.id, desfecho: "aguardando_direcao", repediu });
        continue;
      }

      // ── 3. PAGO E AVALIZADO, E MESMO ASSIM PARADO ─────────────────────────
      // Este é o buraco puro: nada mais falta e nenhuma varredura olhava para
      // ele. Vai para `pending` — e quem produz continua sendo
      // `runProjectExecution`, que confere o portão de pagamento de novo.
      const enfileirou = await prisma.project.updateMany({
        // O estado esperado vai no WHERE: se outro caminho tirou o projeto de
        // `idle` entre a leitura e agora, quem ganha é ele.
        where: { id: p.id, executionStatus: "idle" },
        data: {
          executionStatus: "pending",
          executionRequestedAt: agora,
          executionError: null,
          // As tentativas anteriores morreram esperando pagamento ou aval, não
          // por defeito. Sem zerar, um projeto que esperou chegaria ao teto e
          // nunca mais seria retomado.
          executionAttempts: 0,
        },
      });
      if (enfileirou.count === 1) {
        saida.ligados++;
        saida.desfechos.push({ projectId: p.id, desfecho: "ligado" });
      } else {
        saida.desfechos.push({ projectId: p.id, desfecho: "sem_acao", motivo: "outro caminho tirou o projeto de idle antes" });
      }
    } catch (e) {
      saida.desfechos.push({
        projectId: p.id, desfecho: "sem_acao",
        motivo: e instanceof Error ? e.message : "erro ao ligar o projeto",
      });
    }
  }

  return saida;
}
