// ARMAZÉM DE HANDOFFS NO BANCO — a tabela HandoffV2 atrás do contrato.
//
// O motor (`handoff.ts`) é puro e testado em memória; este arquivo é a única
// ponte para o Prisma. Injetável de propósito: o teste de integração usa a
// mesma função com um client apontado para SQLite descartável.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ArmazemDeHandoffs, LinhaDeHandoff } from "./handoff";

export function armazemDeHandoffsNoBanco(db: PrismaClient): ArmazemDeHandoffs {
  return {
    async criar(linha) {
      const criado = await db.handoffV2.create({
        data: {
          deDepartamento: linha.deDepartamento,
          paraDepartamento: linha.paraDepartamento,
          responsavelEntrega: linha.responsavelEntrega,
          entrada: linha.entrada,
          saida: linha.saida,
          versaoArtefato: linha.versaoArtefato,
          criterios: linha.criterios,
          prazoProximo: linha.prazoProximo ?? null,
          bloqueios: JSON.stringify(linha.bloqueios),
          correlationId: linha.correlationId,
          workspaceId: linha.workspaceId ?? null,
          status: linha.status,
          criadoEm: linha.criadoEm,
        },
        select: { id: true },
      });
      return { id: criado.id };
    },
    async buscar(id) {
      const linha = await db.handoffV2.findUnique({ where: { id } });
      if (!linha) return null;
      return {
        id: linha.id,
        deDepartamento: linha.deDepartamento,
        paraDepartamento: linha.paraDepartamento,
        responsavelEntrega: linha.responsavelEntrega,
        responsavelRecebe: linha.responsavelRecebe ?? undefined,
        entrada: linha.entrada,
        saida: linha.saida,
        versaoArtefato: linha.versaoArtefato,
        criterios: linha.criterios,
        prazoProximo: linha.prazoProximo ?? undefined,
        bloqueios: JSON.parse(linha.bloqueios) as string[],
        correlationId: linha.correlationId,
        workspaceId: linha.workspaceId ?? undefined,
        status: linha.status as LinhaDeHandoff["status"],
        criadoEm: linha.criadoEm,
        aceitoEm: linha.aceitoEm ?? undefined,
      };
    },
    async aceitar(id, responsavelRecebe, em) {
      await db.handoffV2.update({
        where: { id },
        data: { status: "aceito", responsavelRecebe, aceitoEm: em },
      });
    },
  };
}
