// versoes.ts — a memória do que o cliente já viu.
//
// O furo que este arquivo fecha (Hub, Fase 1, 1.9): "gera nova versão sem
// apagar a anterior" era promessa incumprível. A refação regravava
// `Deliverable.content` por cima e o corpo da v1 sumia do mundo — o cliente
// pedia ajuste, recebia a v2 e nunca mais podia comparar com o que tinha
// aprovado antes. Sem revisor humano na casa, isso é apagar a única
// testemunha da conversa.
//
// O desenho (Fase 2, caminho B): a versão N vira registro IMUTÁVEL antes de
// qualquer sobrescrita; a versão N+1 nasce junto com o novo conteúdo; e
// `Deliverable.content` passa a ser cache da versão corrente. O retrofit é
// preguiçoso de propósito — a v1 de um entregável antigo só materializa no
// primeiro momento em que alguém vai mexer nele, e o unique
// (deliverableId, number) torna a operação idempotente.

import { prisma } from "@/lib/db/client";

/**
 * Preserva o conteúdo ATUAL do entregável como a versão `number` — imutável a
 * partir daqui. Chamar antes de QUALQUER sobrescrita de `content`.
 *
 * Idempotente: se a versão já existe, não toca nela (imutabilidade vale
 * inclusive contra este próprio módulo).
 */
export async function preservarVersaoAtual(entrega: {
  id: string;
  version: number;
  content: string | null;
  ownerAgentId?: string | null;
}): Promise<void> {
  try {
    await prisma.deliverableVersion.create({
      data: {
        deliverableId: entrega.id,
        number: entrega.version,
        content: entrega.content,
        createdBy: entrega.ownerAgentId ?? null,
        note: "Retrofit: conteúdo preservado antes de uma refação.",
      },
    });
  } catch {
    // Unique (deliverableId, number) violado = a versão já foi preservada.
    // É o resultado desejado, não um erro.
  }
}

/**
 * Registra a versão nova (N+1) que acabou de ser gravada em
 * `Deliverable.content`. Devolve o id para vincular à rodada de aprovação —
 * "aprovei a v3" precisa ser registrável (Fase 1, 1.10).
 */
export async function registrarNovaVersao(input: {
  deliverableId: string;
  number: number;
  content: string;
  createdBy?: string | null;
  note?: string;
}): Promise<{ id: string } | null> {
  try {
    const v = await prisma.deliverableVersion.create({
      data: {
        deliverableId: input.deliverableId,
        number: input.number,
        content: input.content,
        createdBy: input.createdBy ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    return v;
  } catch {
    // Best-effort: o registro da versão não pode derrubar a refação que já
    // aconteceu — mas a ausência fica visível no histórico (buraco de número).
    return null;
  }
}
