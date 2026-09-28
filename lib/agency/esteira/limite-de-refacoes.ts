// limite-de-refacoes.ts — O LIMITE MENSAL DE REFAÇÕES DO CLIENTE (1C-C2, 28/09/2026)
//
// ═══════════════════════════════════════════════════════════════════════════
// A ORDEM DO CEO
// ═══════════════════════════════════════════════════════════════════════════
//
// A partir da TRAVA DA SEMANA (`semana-editorial.ts`, `semanaTravada`), mudar
// uma peça — pedido do cliente no portal ou edição da equipe — vira
// REGENERAÇÃO DA PEÇA e conta contra um teto mensal, por cliente. Estourou o
// teto: a peça NÃO é regenerada, o cliente lê que o limite acabou e que a
// equipe vai falar com ele, e a equipe recebe o aviso. Nada é cobrado
// automaticamente — decisão comercial fica com gente, sempre.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE O LIMITE É "TRAVA DA SEMANA" E NÃO "TODO PEDIDO DE AJUSTE"
// ═══════════════════════════════════════════════════════════════════════════
//
// Um ajuste ANTES da trava (a peça ainda está na janela colaborativa normal,
// entre a proposta e a quinta-feira que a finaliza) não é refação — é a
// conversa de sempre sobre um rascunho que ainda não foi ao cliente como
// definitivo. Só depois da trava é que mudar a peça tem custo real (arte já
// gerada, calendário já fechado) e é isso que o limite mede. Por isso
// `RefacaoDaPeca` sempre registra uma linha (auditoria completa de todo
// pedido de mudança), mas só `contaNoLimite: true` — isto é, só quando
// `semanaTravada` já era verdadeiro no momento — soma contra o teto.
//
// ═══════════════════════════════════════════════════════════════════════════
// O PADRÃO DA CASA, E POR QUÊ
// ═══════════════════════════════════════════════════════════════════════════
//
// `Client.limiteRefacoesMes` nulo (o CEO não configurou um número específico
// para este cliente) cai no padrão abaixo: 4 por mês — uma por semana do
// calendário editorial. Acima disso o padrão da casa é "algo saiu errado no
// briefing ou na marca", não "um ajuste pontual" — e o caminho para isso é
// conversa com a equipe, não mais uma rodada de IA.

import { prisma } from "@/lib/db/client";
import { civilBrasilia } from "@/lib/agency/esteira/semana-editorial";

/** Uma refação por semana do calendário editorial — acima disso, é sinal de
 *  desalinhamento, não de ajuste pontual. Configurável por cliente em
 *  `Client.limiteRefacoesMes`; isto é só o piso quando ele está nulo. */
export const LIMITE_PADRAO_MENSAL_DA_CASA = 4;

/** A frase que o cliente lê no portal quando o limite do mês acabou. */
export const FRASE_LIMITE_ESTOURADO_AO_CLIENTE =
  "o limite de refações deste mês acabou — a equipe vai falar com você";

/** O AAAA-MM, em Brasília — nunca UTC. A virada de mês em Brasília não
 *  coincide com a virada em UTC (Brasília é UTC-3): um evento às 21h30 de
 *  Brasília do último dia do mês é já 00h30 UTC do dia seguinte, e contá-lo
 *  pelo UTC jogaria a refação para o mês ERRADO. */
export function mesReferenciaBrasilia(agora: Date): string {
  const c = civilBrasilia(agora);
  return `${c.ano}-${String(c.mesIndex + 1).padStart(2, "0")}`;
}

/** Quantas refações deste cliente JÁ CONTAM no limite, neste mês (Brasília).
 *  Só `contaNoLimite: true` — a auditoria de mudanças anteriores à trava
 *  (`contaNoLimite: false`) nunca soma aqui. */
export async function refacoesNoMes(clientId: string, mes: string): Promise<number> {
  return prisma.refacaoDaPeca.count({
    where: { clientId, mesReferencia: mes, contaNoLimite: true },
  });
}

export type VereditoDoLimite =
  | { pode: true; restantes: number }
  | { pode: false; motivo: string };

/**
 * PODE refazer? Lê o limite do CLIENTE (`Client.limiteRefacoesMes`, ou o
 * padrão da casa quando nulo) contra o que já foi usado neste mês.
 *
 * Cliente inexistente (leitura falhou) cai no padrão da casa — fail-closed
 * do lado que protege o bolso da agência, nunca do lado que abriria refação
 * ilimitada por um erro de leitura.
 */
export async function podeRefazer(input: { clientId: string; agora?: Date }): Promise<VereditoDoLimite> {
  const agora = input.agora ?? new Date();
  const mes = mesReferenciaBrasilia(agora);

  // `try/catch` (não `.catch()` encadeado): pega inclusive o delegate
  // inexistente — a mesma razão do comentário abaixo, em `refacoesNoMes`.
  let cliente: { limiteRefacoesMes: number | null } | null;
  try {
    cliente = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { limiteRefacoesMes: true },
    });
  } catch {
    cliente = null;
  }
  const limite = cliente?.limiteRefacoesMes ?? LIMITE_PADRAO_MENSAL_DA_CASA;

  // ── LEITURA INDISPONÍVEL RECUSA, NUNCA LIBERA ────────────────────────────
  // A MESMA régua do portão de pagamento (`portao-de-pagamento.ts`): "banco
  // tossindo" vira recusa explícita, jamais uma liberação silenciosa. `try`
  // (não só `.catch()` encadeado) pega até `prisma.refacaoDaPeca` não existir.
  let usadas: number;
  try {
    usadas = await refacoesNoMes(input.clientId, mes);
  } catch (e) {
    return {
      pode: false,
      motivo: `não consegui confirmar o limite mensal de refações agora (${e instanceof Error ? e.message : "erro"}) — tente de novo em instantes`,
    };
  }

  const restantes = limite - usadas;
  if (restantes <= 0) {
    return { pode: false, motivo: FRASE_LIMITE_ESTOURADO_AO_CLIENTE };
  }
  return { pode: true, restantes };
}

/**
 * Registra UMA regeneração de peça — chamada por quem efetivamente refez
 * (o card de semana em `refacao.ts`, o PATCH da equipe em
 * `app/api/social-posts/[id]/route.ts`). `contaNoLimite` é sempre
 * `semanaTravada(post, agora)` no momento da chamada — nunca uma escolha do
 * chamador, para as duas frentes nunca divergirem sobre o que "conta".
 *
 * Best-effort de propósito: falha ao GRAVAR o registro não pode desfazer uma
 * regeneração que já aconteceu (texto e arte já foram trocados) — perder a
 * contagem de UM evento é reparável; fingir que a refação não ocorreu não é.
 */
export async function registrarRefacaoDaPeca(input: {
  workspaceId: string;
  clientId: string;
  socialPostId: string;
  motivo: string;
  /** "cliente_portal" | "equipe" */
  origem: "cliente_portal" | "equipe";
  contaNoLimite: boolean;
  agora?: Date;
}): Promise<void> {
  const agora = input.agora ?? new Date();
  // `try/catch` (não `.catch()` encadeado): pega inclusive o acesso síncrono
  // a `prisma.refacaoDaPeca` quando o delegate ainda não existe (schema não
  // migrado/gerado) — um `.catch()` pendurado no fim da cadeia não pegaria.
  try {
    await prisma.refacaoDaPeca.create({
      data: {
        workspaceId: input.workspaceId,
        clientId: input.clientId,
        socialPostId: input.socialPostId,
        motivo: input.motivo.slice(0, 900),
        origem: input.origem,
        contaNoLimite: input.contaNoLimite,
        mesReferencia: mesReferenciaBrasilia(agora),
      },
    });
  } catch {
    /* best-effort — ver o comentário acima */
  }
}
