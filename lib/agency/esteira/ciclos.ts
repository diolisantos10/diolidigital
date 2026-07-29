// ciclos.ts — onde a relação vitalícia acontece de verdade.
//
// "Cuidar do cliente para sempre" não é um projeto que nunca fecha. Projeto sem
// fim não é medível: nada é entregue de fato, nada é comparado com o mês
// anterior, e o painel nunca fica verde — o que é péssimo para a equipe (não se
// sabe se ganhou ou perdeu) e péssimo para o cliente (ele nunca vê um resultado,
// só um trabalho eterno).
//
// A operação contínua é uma SEQUÊNCIA DE CICLOS: cada mês nasce, entrega, mede
// e fecha. É isso que permite dizer "agosto foi melhor que julho" — e é essa
// frase, mês após mês, que segura um cliente por anos.
//
// O plano do ciclo é CONGELADO na abertura. Sem congelar, "o que a gente
// prometeu este mês" muda junto com o que foi feito, e aí todo mês bate certo:
// um relatório que nunca erra é um relatório que não mede nada.

import { prisma } from "@/lib/db/client";

export type StatusDoCiclo = "aberto" | "entregue" | "fechado";

export interface ItemDoPlano {
  agentId: string;
  titulo: string;
}

export interface CicloResumido {
  id: string;
  referencia: string;
  status: StatusDoCiclo;
  comeca: string;
  termina: string;
  itens: ItemDoPlano[];
  resumo: string | null;
}

/** AAAA-MM da data. É a competência do ciclo. */
export function referenciaDe(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

function primeiroDia(data: Date): string {
  return `${referenciaDe(data)}-01`;
}

function ultimoDia(data: Date): string {
  const fim = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
  return `${referenciaDe(fim)}-${String(fim.getUTCDate()).padStart(2, "0")}`;
}

function lerPlano(json: string): ItemDoPlano[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ItemDoPlano[]) : [];
  } catch {
    return [];
  }
}

/**
 * Abre o ciclo do mês da data informada.
 *
 * Idempotente pela competência: chamar duas vezes no mesmo mês devolve o ciclo
 * que já existe. Sem isso, um clique duplo criaria dois "agosto" e o relatório
 * do mês passaria a contar tudo em dobro.
 *
 * O plano congelado sai das tarefas do projeto — é o que a agência se
 * comprometeu a entregar naquele mês.
 */
export async function abrirCiclo(projectId: string, quando: Date = new Date()): Promise<CicloResumido | null> {
  const referencia = referenciaDe(quando);
  try {
    const existente = await prisma.cycle.findUnique({
      where: { projectId_reference: { projectId, reference: referencia } },
    });
    if (existente) {
      return {
        id: existente.id, referencia: existente.reference, status: existente.status as StatusDoCiclo,
        comeca: existente.startsOn, termina: existente.endsOn,
        itens: lerPlano(existente.planJson), resumo: existente.summary,
      };
    }

    const tarefas = await prisma.task.findMany({
      where: { projectId },
      select: { title: true, agentId: true },
    });
    const plano: ItemDoPlano[] = tarefas.map((t) => ({ agentId: t.agentId ?? "", titulo: t.title }));

    const criado = await prisma.cycle.create({
      data: {
        projectId, reference: referencia, status: "aberto",
        startsOn: primeiroDia(quando), endsOn: ultimoDia(quando),
        planJson: JSON.stringify(plano),
      },
    });
    return {
      id: criado.id, referencia: criado.reference, status: "aberto",
      comeca: criado.startsOn, termina: criado.endsOn, itens: plano, resumo: null,
    };
  } catch (e) {
    console.warn("[esteira] não consegui abrir o ciclo:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** O ciclo que está rodando agora, se houver. */
export async function cicloAberto(projectId: string): Promise<CicloResumido | null> {
  try {
    const c = await prisma.cycle.findFirst({
      where: { projectId, status: { in: ["aberto", "entregue"] } },
      orderBy: { reference: "desc" },
    });
    if (!c) return null;
    return {
      id: c.id, referencia: c.reference, status: c.status as StatusDoCiclo,
      comeca: c.startsOn, termina: c.endsOn, itens: lerPlano(c.planJson), resumo: c.summary,
    };
  } catch {
    return null;
  }
}

/**
 * Fecha o ciclo com o que foi medido e abre o próximo.
 *
 * Fechar e abrir juntos é de propósito: um ciclo fechado sem sucessor é uma
 * relação que parou sem ninguém decidir parar. A rotina precisa continuar
 * sozinha — é isso que "vitalício" quer dizer na prática.
 */
export async function fecharCiclo(input: {
  projectId: string;
  cycleId: string;
  resultados: Record<string, unknown>;
  resumo: string;
  abrirProximo?: boolean;
  quando?: Date;
}): Promise<{ fechado: boolean; proximo: CicloResumido | null }> {
  const agora = input.quando ?? new Date();
  try {
    await prisma.cycle.update({
      where: { id: input.cycleId },
      data: {
        status: "fechado",
        resultsJson: JSON.stringify(input.resultados ?? {}),
        summary: input.resumo,
        closedAt: agora,
      },
    });
  } catch (e) {
    console.warn("[esteira] não consegui fechar o ciclo:", e instanceof Error ? e.message : e);
    return { fechado: false, proximo: null };
  }

  if (input.abrirProximo === false) return { fechado: true, proximo: null };

  const proximoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  const proximo = await abrirCiclo(input.projectId, proximoMes);
  return { fechado: true, proximo };
}

/** Os ciclos anteriores, do mais novo para o mais velho — a linha do tempo. */
export async function historicoDeCiclos(projectId: string, limite = 12): Promise<CicloResumido[]> {
  try {
    const linhas = await prisma.cycle.findMany({
      where: { projectId },
      orderBy: { reference: "desc" },
      take: Math.max(1, Math.min(limite, 60)),
    });
    return linhas.map((c) => ({
      id: c.id, referencia: c.reference, status: c.status as StatusDoCiclo,
      comeca: c.startsOn, termina: c.endsOn, itens: lerPlano(c.planJson), resumo: c.summary,
    }));
  } catch {
    return [];
  }
}
