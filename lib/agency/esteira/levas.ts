// levas.ts — A SEGUNDA E A TERCEIRA PASSADA DO MÊS.
//
// ═══ O DEFEITO QUE PRODUZIU ESTE ARQUIVO (25/08/2026) ════════════════════════
//
// A casa entregava UMA passada por mês. Medido, não achado: `mes.ts::
// virarOsMesesVencidos` vira o ciclo vencido e marca o projeto `pending`;
// `despertador.ts::retomarProducao` roda UM `runProjectExecution` para quem está
// `pending`; e a idempotência do motor é por especialista DENTRO DO CICLO. Feita
// a primeira passada, o projeto vira `done` e ninguém o põe de volta na fila até
// o mês virar. Não havia segunda passada agendada em lugar nenhum do
// repositório.
//
// Teto real: 12 peças/mês, contra planos que anunciavam de 34 a 160.
//
// ═══ O QUE DISSOLVEU O DILEMA ═══════════════════════════════════════════════
//
// Cada peça custa à casa ~R$ 1,30 entre texto e imagem. 32 peças custam ~R$ 45
// contra um plano de R$ 1.790. **O limite de 12 era escolha de software, não de
// dinheiro** — então o conserto certo é o motor entregar mais vezes, não a
// vitrine prometer menos.
//
// ═══ E NENHUM RELÓGIO NOVO ══════════════════════════════════════════════════
//
// Esta casa perdeu dez dias com um cron que morreu em silêncio com o painel
// verde. Este arquivo NÃO agenda nada: ele é uma perna do despertador que já
// bate a cada 5 minutos, colada na virada do mês e ANTES de `retomarProducao` —
// exatamente o mesmo molde que a virada usa. Tudo o que ele faz é pôr o projeto
// de volta em `pending`, que é o único estado que a retomada sabe ler. Quem
// produz continua sendo o caminho de sempre.
//
// ═══ O QUE ELE NÃO AFROUXA ══════════════════════════════════════════════════
//
//   • **O portão de pagamento (D-0A7).** Ele não é conferido aqui de propósito:
//     `pending` não gasta um centavo, e `runProjectExecution` confere o portão
//     antes de qualquer token. Mais capacidade não virou produzir sem pagar —
//     um projeto sem pagamento confirmado volta para `idle` na mesma rodada.
//   • **O portão de direção.** Idem: sem `directionApprovedAt` a leva nem entra
//     na fila, porque a consulta abaixo o exige.
//   • **O teto por passada.** Continua 12. O que mudou é quantas vezes ele é
//     aplicado no mês.
//   • **O teto diário de imagens por cliente** (40, `artes.ts`) e o teto de
//     custo por workspace continuam por baixo, intocados — e as levas os
//     ALIVIAM em vez de pressioná-los: 32 peças distribuídas em três datas
//     custam menos por dia do que 32 no mesmo dia.

import { prisma } from "@/lib/db/client";
import {
  levaDevidaEm, LEVAS_POR_CICLO, DIAS_ENTRE_LEVAS,
} from "@/lib/agency/execution/escopo-do-cliente";

/** Quantos projetos por rodada. O mesmo espírito do resto do despertador:
 *  poucos por batida, os mais antigos primeiro — produção é chamada cara de IA,
 *  e uma leva atrasada em cinco minutos não é urgência. */
const MAX_POR_RODADA = 5;

/** Quem produz PEÇA. A leva é contada por ele: pauta do mês, base de marca e
 *  relatório são UM por ciclo e não marcam leva nova. Espelha `produzemPeca`
 *  em `run-execution.ts` — e o teste `a-leva-abre-a-producao` prova que as duas
 *  listas são a mesma, porque duas listas que combinam hoje divergem no
 *  primeiro especialista novo. */
export const ESPECIALISTAS_DE_PECA = ["social-copy"] as const;

export interface LevaAberta {
  projectId: string;
  /** A leva que passou a estar vencida — 2 ou 3. */
  leva: number;
  /** A última leva que este ciclo já produziu. */
  jaProduzida: number;
}

export interface LevasDaRodada {
  abertas: LevaAberta[];
  /** O que não deu para decidir. Nunca silêncio: leva que não abre e não avisa
   *  é o cliente recebendo menos do que pagou, invisível — que é exatamente
   *  como o teto de 12 viveu meses sem ninguém saber. */
  avisos: string[];
}

/**
 * Põe de volta em `pending` todo projeto cuja próxima leva do ciclo venceu.
 *
 * IDEMPOTENTE: um projeto que já produziu a leva devida não é tocado. Rodar
 * isto a cada 5 minutos não abre 288 levas por dia — abre no máximo
 * `LEVAS_POR_CICLO - 1` por ciclo, porque a condição é a leva devida ser MAIOR
 * que a última já produzida.
 */
export async function abrirLevasVencidas(agora = new Date()): Promise<LevasDaRodada> {
  const avisos: string[] = [];
  const abertas: LevaAberta[] = [];

  if (LEVAS_POR_CICLO <= 1) return { abertas, avisos };

  const ciclos = await prisma.cycle.findMany({
    where: {
      status: "aberto",
      project: {
        clientRequestId: { not: null },
        directionApprovedAt: { not: null },
        // `running` fica de fora: a passada corrente ainda está escrevendo, e
        // marcá-la `pending` por cima competiria com a trava anti-concorrência.
        // `failed` também: quem cuida dele é a retomada, com as tentativas dela.
        executionStatus: { in: ["done", "idle"] },
      },
    },
    orderBy: { startsOn: "asc" },
    select: { id: true, projectId: true, startsOn: true, reference: true },
    take: MAX_POR_RODADA * 4,
  });

  for (const ciclo of ciclos) {
    if (abertas.length >= MAX_POR_RODADA) break;

    const inicio = new Date(`${ciclo.startsOn}T00:00:00Z`);
    if (Number.isNaN(inicio.getTime())) {
      // Data ilegível não vira "produz agora": vira aviso. Abrir leva por uma
      // data que ninguém entendeu é gastar dinheiro por um bug de formato.
      avisos.push(`ciclo ${ciclo.reference} do projeto ${ciclo.projectId}: startsOn ilegível ("${ciclo.startsOn}") — a leva NÃO foi aberta`);
      continue;
    }

    const devida = levaDevidaEm(inicio, agora);
    if (devida <= 1) continue;

    const ultima = await prisma.deliverable
      .findFirst({
        where: {
          projectId: ciclo.projectId,
          cycleId: ciclo.id,
          ownerAgentId: { in: [...ESPECIALISTAS_DE_PECA] },
        },
        orderBy: { leva: "desc" },
        select: { leva: true },
      })
      .catch(() => "erro" as const);

    if (ultima === "erro") {
      avisos.push(`projeto ${ciclo.projectId}: não consegui ler a última leva do ciclo ${ciclo.reference} — a leva NÃO foi aberta`);
      continue;
    }
    // Nenhuma peça no ciclo ainda? Então não há leva vencida a repor: a leva 1
    // é trabalho da virada do mês e da retomada, não desta perna. Abrir aqui
    // duplicaria o disparo do dia 1.
    if (!ultima) continue;

    const jaProduzida = ultima.leva ?? 1;
    if (devida <= jaProduzida) continue;

    // O passo é de UMA leva por vez, mesmo que o ciclo tenha atrasado duas: a
    // passada seguinte do despertador abre a próxima. Assim um ciclo esquecido
    // não despeja o mês inteiro no cliente numa tarde — que é o cenário que o
    // ritmo de dez dias existe para evitar.
    const marcou = await prisma.project.updateMany({
      where: { id: ciclo.projectId, executionStatus: { in: ["done", "idle"] } },
      data: {
        executionStatus: "pending",
        executionError: null,
        // As tentativas são por PASSADA, não por vida do projeto: sem zerar,
        // um projeto que gastou as cinco tentativas no mês 1 nunca mais teria
        // uma leva aberta, e o cliente pagaria por peças que não viriam.
        executionAttempts: 0,
        executionRequestedAt: agora,
      },
    });
    if (marcou.count === 1) abertas.push({ projectId: ciclo.projectId, leva: jaProduzida + 1, jaProduzida });
  }

  return { abertas, avisos };
}

/** O texto do estado, para o log e para `/api/health`. */
export function resumoDasLevas(r: LevasDaRodada): string {
  if (r.abertas.length === 0) return "";
  return (
    `${r.abertas.length} leva(s) do mês entraram na fila ` +
    `(uma a cada ${DIAS_ENTRE_LEVAS} dias, ${LEVAS_POR_CICLO} por ciclo): ` +
    r.abertas.map((a) => `${a.projectId} leva ${a.leva}`).join(" · ")
  );
}
