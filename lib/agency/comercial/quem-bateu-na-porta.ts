// QUEM BATEU NA PORTA E NÃO FOI ATENDIDO.
//
// ── A CICATRIZ QUE ESTE ARQUIVO FECHA ───────────────────────────────────────
//
// Medido em produção em 08/08/2026: três interessados entraram pelo briefing
// público — Sushi Cazza (**51 dias**), Camila Pereira (29) e Beatriz Gimenes
// (28) — com a conversa inteira gravada, ticket, público-alvo e paleta. Briefing
// melhor que o de cliente pagante.
//
// Duas coisas foram consertadas depois disso, e uma não:
//
//   ✅ o briefing passou a PEDIR contato (`question-engine.ts`);
//   ✅ existe um leitor único de contato (`contato-do-lead.ts`);
//   ❌ **ninguém varre a fila.** Continuava não havendo nada que dissesse
//      "estas pessoas entraram e não foram respondidas".
//
// A casa já sabia fazer isso em dois outros lugares — `fila-que-se-cobra.ts`
// para o aviso interno e `o-que-espera-no-portao.ts` para a proposta parada. A
// porta da frente, que é por onde entra dinheiro novo, era a que não tinha.
//
// ── A DISTINÇÃO QUE FAZ ESTE ARQUIVO VALER ─────────────────────────────────
//
// "Ninguém respondeu" e "não temos como responder" parecem a mesma linha na
// tela e são problemas OPOSTOS:
//
//   • **esperando** → é desleixo nosso. O conserto é uma pessoa abrir e falar.
//   • **sem caminho** → é buraco de dado. Falar é impossível, e cobrar alguém
//     por não ter falado seria cobrar o impossível.
//
// Somar os dois num número só produziria um alarme que ninguém sabe atender —
// e alarme que não diz o conserto é ruído que se aprende a ignorar.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, E É DE PROPÓSITO ───────────────────────────
//
// **Não fala com ninguém.** Não manda e-mail, não manda WhatsApp, não escreve no
// banco. Ele CONTA. Dois motivos, e os dois têm peso:
//
//   1. quem aborda lead é gente, não máquina — abordagem automática em quem
//      demonstrou interesse é o caminho mais curto para queimar a marca e o
//      número;
//   2. **ordem do CEO, 10/08/2026:** nenhuma demanda de cliente até a agência
//      estar pronta. Uma varredura que dispara mensagem violaria a ordem no dia
//      em que fosse ligada, sem ninguém decidir isso.
//
// Contar é seguro sob a ordem dele. Falar não é. Há teste para as duas coisas.

import { prisma } from "@/lib/db/client";
import { lerContato, pistasDeContato, type PistaDeContato } from "@/lib/agency/comercial/contato-do-lead";

/** A partir de quantos dias sem resposta a espera vira negligência. Dois dias:
 *  quem preencheu um briefing inteiro espera retorno rápido, e no terceiro dia
 *  ele já falou com outra agência. */
export const DIAS_ATE_VIRAR_DESLEIXO = 2;

/**
 * Status que significam "ainda não foi atendido". Um pedido já convertido em
 * projeto saiu da porta e não é mais fila de entrada.
 *
 * ⚠️ ESTA É A LISTA ÚNICA, e virou única em 16/08/2026. Havia DUAS verdades
 * sobre a mesma fila, e a segunda foi achada pelo `experiencia`:
 * `/api/agency/leads` lia `"new,lead_incompleto"` enquanto esta função lia
 * `new/triaged/qualifying`. Consequência: `lead_incompleto` — quem entrou e
 * recusou deixar contato — **nunca aparecia na sala do PM**, e `triaged`/
 * `qualifying` nunca apareciam em "Quem procurou". Cada tela tinha uma fila
 * diferente, e nenhuma tinha a fila.
 *
 * `lead_incompleto` ENTRA aqui porque ele é literalmente o caso que esta
 * função já modela melhor que qualquer outra: `temComoFalar: false`, contado
 * no balde `semCaminho`, separado de quem espera resposta. Ele não é lixo — é
 * a matéria-prima que esta agência mais desperdiça.
 */
export const AINDA_NA_PORTA = ["new", "triaged", "qualifying", "lead_incompleto"];

export interface NaPorta {
  id: string;
  negocio: string;
  /** Dias desde que a pessoa entrou. CALCULADO — nunca digitado. */
  diasEsperando: number;
  /** `true` quando existe canal declarado. Nome sozinho não conta. */
  temComoFalar: boolean;
  /** Por que não dá para falar. Nulo quando dá. */
  porQueNaoDaParaFalar: string | null;
  /** Pistas achadas no texto — Instagram, telefone solto. **NÃO é contato**, e
   *  nunca faz `temComoFalar` virar `true`. Serve para uma pessoa decidir se
   *  vale a pena tentar. */
  pistas: PistaDeContato[];
  /** Passou do prazo de virar desleixo. */
  desleixo: boolean;
}

/**
 * Quem entrou pela porta da frente e ainda não foi atendido.
 *
 * Nunca lança: uma leitura que falha não pode esconder a fila.
 */
export async function quemBateuNaPorta(workspaceId: string, agora: Date): Promise<NaPorta[]> {
  const pedidos = await prisma.clientRequestDb.findMany({
    where: { workspaceId, status: { in: AINDA_NA_PORTA } },
    orderBy: { createdAt: "asc" },
    take: 200,
  }).catch(() => []);

  return pedidos.map((p) => {
    const contato = lerContato({ briefingJson: p.briefingJson, sdrHandoffJson: p.sdrHandoffJson });
    const dias = Math.floor((agora.getTime() - p.createdAt.getTime()) / 86_400_000);
    return {
      id: p.id,
      negocio: p.businessName,
      diasEsperando: dias,
      temComoFalar: contato.temComoFalar,
      porQueNaoDaParaFalar: contato.temComoFalar ? null : contato.motivo,
      pistas: contato.temComoFalar ? [] : pistasDeContato(p.rawContext),
      desleixo: contato.temComoFalar && dias >= DIAS_ATE_VIRAR_DESLEIXO,
    };
  });
}

export interface ResumoDaPorta {
  /** Total parado na porta. */
  naPorta: number;
  /** Dá para falar, e ninguém falou. **É o número que cobra a casa.** */
  esperandoResposta: number;
  /** Passou do prazo. Subconjunto de `esperandoResposta`. */
  desleixo: number;
  /** Não dá para falar. Problema de DADO, não de atendimento — e é por isso que
   *  ele é contado separado: cobrar alguém por não ter ligado para quem não
   *  deixou telefone é cobrar o impossível. */
  semCaminho: number;
  /** Há quantos dias espera o mais antigo de quem DÁ para responder.
   *  Nulo quando não há ninguém nessa situação — nunca zero. */
  maisAntigoEmDias: number | null;
}

/** O resumo que sobe para quem olha a casa. Conclusão primeiro. */
export async function resumoDaPorta(workspaceId: string, agora: Date): Promise<ResumoDaPorta> {
  const fila = await quemBateuNaPorta(workspaceId, agora);
  const alcancaveis = fila.filter((f) => f.temComoFalar);
  return {
    naPorta: fila.length,
    esperandoResposta: alcancaveis.length,
    desleixo: fila.filter((f) => f.desleixo).length,
    semCaminho: fila.filter((f) => !f.temComoFalar).length,
    // Nulo, e não zero: zero afirmaria "o mais antigo espera há zero dias" sobre
    // uma fila que não existe.
    maisAntigoEmDias: alcancaveis.length === 0 ? null : Math.max(...alcancaveis.map((f) => f.diasEsperando)),
  };
}
