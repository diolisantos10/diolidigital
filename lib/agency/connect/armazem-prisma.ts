// O ARMAZÉM DO CONNECT NO BANCO — a única ponte do despacho para o Prisma.
//
// `despacho.ts` é puro; este arquivo é onde `ExecucaoV2` e `RecusaV2` entram.
// Injetável de propósito, pelo mesmo motivo de `handoff-v2/armazem-prisma.ts`:
// o teste que PROVA a execução aponta este mesmo código para um SQLite
// descartável, com as migrations reais. Prova contra banco de mentira não é
// prova — um mock devolve o que o autor do mock quis.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ArmazemDoConnect, LinhaDeExecucaoLida } from "./despacho";
import { resolverClienteDeHomologacao } from "./cliente-de-homologacao";

/** Quantas execuções anteriores do mesmo fio entram no contexto do turno. */
export const ANTECEDENTES_NO_FIO = 20;

function linha(l: {
  id: string;
  funcaoId: string;
  departamentoId: string;
  correlationId: string;
  inicio: Date;
  fim: Date | null;
  resultado: string | null;
  ator: string;
  modelo: string | null;
  custoUsd: number | null;
}): LinhaDeExecucaoLida {
  return {
    id: l.id,
    funcaoId: l.funcaoId,
    departamentoId: l.departamentoId,
    correlationId: l.correlationId,
    inicio: l.inicio,
    fim: l.fim,
    resultado: l.resultado,
    ator: l.ator,
    modelo: l.modelo,
    custoUsd: l.custoUsd,
  };
}

export function armazemDoConnectNoBanco(db: PrismaClient): ArmazemDoConnect {
  return {
    async gravarExecucao(registro) {
      const criado = await db.execucaoV2.create({
        data: {
          ator: registro.ator,
          usuarioId: registro.usuarioId,
          modelo: registro.modelo,
          versaoModelo: registro.versaoModelo,
          custoUsd: registro.custoUsd,
          funcaoId: registro.funcaoId,
          departamentoId: registro.departamentoId,
          ferramentas: JSON.stringify(registro.ferramentas),
          correlationId: registro.correlationId,
          inicio: registro.inicio,
          fim: registro.fim,
          resultado: registro.resultado,
          clienteId: registro.clienteId,
          entradas: registro.entradas ? JSON.stringify(registro.entradas) : null,
        },
        select: { id: true },
      });
      return { id: criado.id };
    },

    async gravarRecusa(recusa) {
      const criada = await db.recusaV2.create({
        data: {
          funcaoId: recusa.funcaoId,
          motivo: recusa.motivo,
          correlationId: recusa.correlationId,
          clienteId: recusa.clienteId,
          em: recusa.em,
        },
        select: { id: true },
      });
      return { id: criada.id };
    },

    async relerExecucao(id) {
      const l = await db.execucaoV2.findUnique({ where: { id } });
      return l ? linha(l) : null;
    },

    async antecedentes(correlationId) {
      const linhas = await db.execucaoV2.findMany({
        where: { correlationId },
        orderBy: { inicio: "asc" },
        take: ANTECEDENTES_NO_FIO,
      });
      return linhas.map(linha);
    },

    // ⭐ O cliente sintético sai do BANCO, não do corpo do pedido. A regra e as
    // duas conferências moram em `cliente-de-homologacao.ts`; aqui é só a ponte.
    async clienteDeHomologacao() {
      return resolverClienteDeHomologacao(db);
    },
  };
}
