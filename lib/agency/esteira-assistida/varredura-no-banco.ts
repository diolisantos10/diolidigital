// A LIGAÇÃO DA VARREDURA COM O BANCO — a única implementação de produção.
//
// `varredura.ts` é o motor puro e injetável (roda em teste com dublês). Este
// arquivo é a tomada: Prisma de um lado, as dependências do outro. A regra é
// a mesma que fez a caixa de entrada não ganhar um segundo qualificador —
// NÃO EXISTE UM SEGUNDO CAMINHO. Quem quiser rodar a esteira em produção
// passa por aqui.

import { prisma } from "@/lib/db/client";
import { varrerAPorta, type DependenciasDaVarredura, type ResultadoDaVarredura, type SolicitacaoNaPorta, type ClienteResolvido } from "./varredura";
import { executarCicloAssistido, type DependenciasDoCiclo } from "./cadeia";
import { realizarComIA } from "./adaptador-de-ia";
import { armazemDeHandoffsNoBanco } from "@/lib/agency/handoff-v2/armazem-prisma";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import type { ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";

const PERFIL_DA_ESTEIRA: PerfilOrganizacional = {
  autoridade: "director",
  departamentos: [],
} as PerfilOrganizacional;

/** Só o que a porta pública produz entra por aqui. */
const ORIGENS_DA_PORTA = ["briefing", "esteira-assistida", "sdr", "portal"];

export function flagsNoBanco(): ArmazemDeFlags {
  return {
    async buscar(chave, escopos) {
      const linhas = await prisma.flagV2.findMany({ where: { chave, escopo: { in: escopos } } });
      return linhas.map((l) => ({ chave: l.chave, escopo: l.escopo, ligada: l.ligada }));
    },
  };
}

/**
 * Acha ou cria a ficha do cliente para uma solicitação da porta.
 *
 * ⚠️ DEDUPLICA POR NOME, e isso é conserto de um defeito conhecido: DUAS
 * rotas desta casa criam `Client` a partir de solicitação sem conferir se já
 * existe alguém com aquele nome (`create-project-from-request.ts` e
 * `orchestrate/apply`), e foi assim que a Camila Pereira ganhou duas fichas.
 * `Client` ainda não tem `@@unique(workspaceId, name)` — enquanto não tiver, a
 * conferência é aqui, em código, e é insensível a caixa e a espaço nas pontas.
 */
async function resolverCliente(s: SolicitacaoNaPorta): Promise<ClienteResolvido | { erro: string }> {
  if (!s.workspaceId) {
    return {
      erro:
        `O briefing de "${s.businessName}" entrou sem agência definida. A esteira é autorizada por agência, ` +
        `então ele não tem por onde andar — adote a solicitação em "Quem procurou" antes.`,
    };
  }
  if (s.clientId) {
    const existente = await prisma.client.findUnique({ where: { id: s.clientId } });
    if (existente) return { id: existente.id, workspaceId: existente.workspaceId, name: existente.name };
    // clientId apontando para ficha apagada (o reset faz exatamente isso).
    // Não se para por causa disto: cai na busca por nome, logo abaixo.
  }

  const nome = s.businessName.trim();
  if (!nome) {
    return { erro: "A solicitação chegou sem nome de negócio — sem isso não dá para abrir ficha de cliente sem inventar." };
  }

  const candidatos = await prisma.client.findMany({ where: { workspaceId: s.workspaceId }, select: { id: true, workspaceId: true, name: true } });
  const alvo = nome.toLocaleLowerCase("pt-BR");
  const achado = candidatos.find((c) => c.name.trim().toLocaleLowerCase("pt-BR") === alvo);
  if (achado) {
    if (s.clientId !== achado.id) {
      await prisma.clientRequestDb.update({ where: { id: s.id }, data: { clientId: achado.id } }).catch(() => undefined);
    }
    return achado;
  }

  const criado = await prisma.client.create({ data: { workspaceId: s.workspaceId, name: nome } });
  await prisma.clientRequestDb.update({ where: { id: s.id }, data: { clientId: criado.id } }).catch(() => undefined);
  return { id: criado.id, workspaceId: criado.workspaceId, name: criado.name };
}

export function dependenciasNoBanco(agora: () => Date = () => new Date()): DependenciasDaVarredura {
  return {
    async solicitacoesNaPorta(limite) {
      const linhas = await prisma.clientRequestDb.findMany({
        where: { status: "new", source: { in: ORIGENS_DA_PORTA } },
        orderBy: { createdAt: "asc" }, // quem espera há mais tempo entra primeiro
        take: limite,
        select: {
          id: true, workspaceId: true, clientId: true, businessName: true,
          rawContext: true, status: true, createdAt: true,
          briefingJson: true, sdrHandoffJson: true,
        },
      });
      // O contato sai do LEITOR ÚNICO (`lerContato`), nunca de um
      // `briefingJson.scope.prospectEmail` reinventado aqui. Ele lê o formato
      // canônico e o legado, e NÃO vasculha o `rawContext`: a arroba de
      // Instagram no meio da conversa é PISTA, nunca contato confirmado.
      return linhas.map(({ briefingJson, sdrHandoffJson, ...resto }) => {
        const contato = lerContato({ briefingJson, sdrHandoffJson });
        return {
          ...resto,
          temComoFalar: contato.temComoFalar,
          porQueNaoDaParaFalar: contato.temComoFalar ? null : contato.motivo,
        };
      });
    },

    resolverCliente,
    flags: flagsNoBanco(),

    async recusaRecente(correlationId, funcaoId, desde) {
      const n = await prisma.recusaV2.count({ where: { correlationId, funcaoId, em: { gte: desde } } });
      return n > 0;
    },

    async registrarRecusa(dados) {
      await prisma.recusaV2.create({
        data: {
          funcaoId: dados.funcaoId,
          motivo: dados.motivo,
          correlationId: dados.correlationId,
          clienteId: dados.clienteId ?? null,
          em: dados.em,
        },
      });
    },

    async jaFeitos(correlationId) {
      const linhas = await prisma.execucaoV2.findMany({
        where: { correlationId, resultado: { not: null } },
        orderBy: { inicio: "asc" },
        select: { funcaoId: true, resultado: true },
      });
      const mapa: Record<string, string> = {};
      for (const l of linhas) if (l.resultado) mapa[l.funcaoId] = l.resultado;
      return mapa;
    },

    /**
     * A reserva é uma escrita CONDICIONAL: `updateMany` com `status: "new"` no
     * filtro. Ler-e-depois-escrever deixaria a janela em que duas passadas
     * pegam a mesma linha e pagam a cadeia duas vezes.
     */
    async reservar(solicitacaoId) {
      const r = await prisma.clientRequestDb.updateMany({
        where: { id: solicitacaoId, status: "new" },
        data: { status: "in_progress" },
      });
      return r.count === 1;
    },

    async marcarStatus(solicitacaoId, status) {
      await prisma.clientRequestDb.update({ where: { id: solicitacaoId }, data: { status } }).catch(() => undefined);
    },

    async rodarCiclo(pedido) {
      const deps: DependenciasDoCiclo = {
        executor: {
          flagLigada: async (chave, escopos) => {
            const linhas = await prisma.flagV2.findMany({ where: { chave, escopo: { in: [...escopos, "global"] } } });
            for (const escopo of [...escopos, "global"]) {
              const linha = linhas.find((l) => l.escopo === escopo);
              if (linha) return linha.ligada;
            }
            return false;
          },
          async gravarExecucao(registro) {
            await prisma.execucaoV2.create({
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
            });
          },
          async gravarRecusa(recusa) {
            await prisma.recusaV2.create({
              data: {
                funcaoId: recusa.funcaoId,
                motivo: recusa.motivo,
                correlationId: recusa.correlationId,
                clienteId: recusa.clienteId,
                em: recusa.em,
              },
            });
          },
          realizar: realizarComIA({ workspaceId: pedido.workspaceId, clienteId: pedido.clienteId }),
          agora,
        },
        handoffs: armazemDeHandoffsNoBanco(prisma),
        perfil: PERFIL_DA_ESTEIRA,
        agora,
      };
      return executarCicloAssistido(pedido, deps);
    },

    async abrirAprovacao({ clienteId, solicitacaoId, resumo }) {
      const approval = await createApprovalRequest({
        clientId: clienteId,
        clientRequestId: solicitacaoId,
        department: "design",
        requestedBy: "esteira-automatica",
        clientVisible: true,
        reviewNote: `Esteira automática — escopo/proposta da cadeia completa aguardando aprovação humana. ${resumo}`,
      });
      return { id: approval.id };
    },

    agora,
  };
}

/** A perna do relógio. Uma linha para o despertador chamar. */
export async function varrerAPortaNoBanco(): Promise<ResultadoDaVarredura> {
  return varrerAPorta(dependenciasNoBanco());
}
