// A tomada do gavião no banco. Motor puro em `vigilancia-de-handoff.ts`.

import { prisma } from "@/lib/db/client";
import {
  cobrarOsBastoesNoChao as cobrarPuro,
  type DependenciasDoGaviao,
  type ResultadoDoGaviao,
} from "./vigilancia-de-handoff";

export function dependenciasDoGaviaoNoBanco(agora: () => Date = () => new Date()): DependenciasDoGaviao {
  return {
    async handoffsAguardando() {
      return prisma.handoffV2.findMany({
        where: { status: "aguardando_recebimento" },
        orderBy: { criadoEm: "asc" },
        take: 100,
        select: {
          id: true, deDepartamento: true, paraDepartamento: true,
          responsavelEntrega: true, correlationId: true, prazoProximo: true, criadoEm: true,
        },
      });
    },
    async cobrancaRecente(correlationId, desde) {
      const n = await prisma.recusaV2.count({ where: { correlationId, em: { gte: desde } } });
      return n > 0;
    },
    async registrarCobranca(dados) {
      await prisma.recusaV2.create({
        data: {
          funcaoId: dados.funcaoId,
          motivo: dados.motivo,
          correlationId: dados.correlationId,
          clienteId: null,
          em: dados.em,
        },
      });
    },
    agora,
  };
}

export async function cobrarOsBastoesNoChao(): Promise<ResultadoDoGaviao> {
  return cobrarPuro(dependenciasDoGaviaoNoBanco());
}
