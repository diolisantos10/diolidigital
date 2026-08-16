// A LIGAÇÃO DA VARREDURA COM O BANCO — a única implementação de produção.
//
// `varredura.ts` é o motor puro e injetável (roda em teste com dublês). Este
// arquivo é a tomada: Prisma de um lado, as dependências do outro. A regra é
// a mesma que fez a caixa de entrada não ganhar um segundo qualificador —
// NÃO EXISTE UM SEGUNDO CAMINHO. Quem quiser rodar a esteira em produção
// passa por aqui.

import { prisma } from "@/lib/db/client";
import { varrerAPorta, correlationDaSolicitacao, type DependenciasDaVarredura, type ResultadoDaVarredura, type SolicitacaoNaPorta, type ClienteResolvido } from "./varredura";
import { PORTA_DA_ESTEIRA } from "./recusa-visivel";
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

  // 🔴 O CONTATO VIAJA COM A FICHA (achado do `experiencia`, 16/08/2026).
  //
  // A primeira versão criava o `Client` com `{ workspaceId, name }` e mais
  // nada. O contato que fez o lead PASSAR NO PORTÃO — o WhatsApp ou o e-mail —
  // ficava para trás, dentro do `briefingJson` da solicitação. Resultado: a
  // agência abria um card no portal de um cliente para quem **não tinha como
  // mandar o link de acesso**, e a promessa da tela pública ("entramos em
  // contato pelo canal informado em até 1 dia útil") ficava impossível de
  // cumprir por construção. Perder o único dado que permite responder, no ato
  // de criar a ficha de quem se quer responder, é o pior lugar para perdê-lo.
  const criado = await prisma.client.create({
    data: {
      workspaceId: s.workspaceId,
      name: nome,
      ...(s.contatoEmail ? { email: s.contatoEmail } : {}),
      ...(s.contatoWhatsapp ? { phone: s.contatoWhatsapp } : {}),
    },
  });
  await prisma.clientRequestDb.update({ where: { id: s.id }, data: { clientId: criado.id } }).catch(() => undefined);
  return { id: criado.id, workspaceId: criado.workspaceId, name: criado.name };
}

/**
 * 🔴 O INCIDENTE RENASCIDO — briefing reservado que morre em `in_progress`.
 *
 * `reservar()` grava `in_progress` ANTES de gastar (é a trava anti-corrida, e
 * ela está certa). Mas se a cadeia lançar exceção, ou o contêiner reiniciar
 * num deploy no meio dela, a linha fica em `in_progress` **para sempre**: some
 * de `AINDA_NA_PORTA` (`new/triaged/qualifying`), não é `precisa_decisao`, e
 * some de `/agency/leads`. **Some das quatro listas** — que é exatamente o
 * incidente do CityJobs de novo, com outra roupa.
 *
 * `ContentRequest` tem varredura de travado de 10 minutos; `ClientRequestDb`
 * não tinha nenhuma. Esta é ela. Devolve a linha para a fila com a idade
 * ORIGINAL correndo (`createdAt` não é tocado — a espera do lead é a espera
 * dele, não a do nosso retry).
 */
export const MINUTOS_ATE_DESTRAVAR = 20;

export async function destravarReservasMortas(agora: Date = new Date()): Promise<{ devolvidas: number }> {
  const limite = new Date(agora.getTime() - MINUTOS_ATE_DESTRAVAR * 60_000);
  const presas = await prisma.clientRequestDb.findMany({
    where: { status: "in_progress", source: { in: ORIGENS_DA_PORTA }, updatedAt: { lt: limite } },
    select: { id: true, businessName: true, clientId: true, workspaceId: true },
    take: 50,
  });
  let devolvidas = 0;
  for (const p of presas) {
    // Escrita CONDICIONAL, como a reserva: se outro processo mexeu no meio, não
    // se atropela. E o motivo vira LINHA VISÍVEL — desaparecer em silêncio é o
    // defeito que esta função existe para matar.
    const r = await prisma.clientRequestDb.updateMany({
      where: { id: p.id, status: "in_progress" },
      data: { status: "new" },
    });
    if (r.count !== 1) continue;
    devolvidas += 1;
    await prisma.recusaV2
      .create({
        data: {
          funcaoId: PORTA_DA_ESTEIRA,
          motivo:
            `"${p.businessName}" ficou preso em processamento por mais de ${MINUTOS_ATE_DESTRAVAR} min — ` +
            `a cadeia caiu no meio (falha, reinício de servidor ou deploy). Devolvido à fila com a espera original ` +
            `correndo; a próxima passada retoma de onde parou, sem repagar o que já foi feito.`,
          correlationId: correlationDaSolicitacao(p.id),
          clienteId: p.clientId,
          workspaceId: p.workspaceId,
          em: agora,
        },
      })
      .catch(() => undefined);
  }
  return { devolvidas };
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
          contatoEmail: contato.email ?? null,
          contatoWhatsapp: contato.whatsapp ?? null,
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
          // O motivo carrega o NOME DO NEGÓCIO do lead. Sem dono de agência,
          // o PM de uma casa lia a fila comercial da outra (G-5).
          workspaceId: dados.workspaceId ?? null,
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
                workspaceId: pedido.workspaceId,
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

    /**
     * 🔴 O PACOTE PARA NUM HUMANO DA AGÊNCIA — não na mesa do cliente.
     *
     * Achados G-1 e B-1 do `seguranca` na PR #166, e os dois eram meus:
     *
     *   • `clientVisible: true` faz o portal marcar `decidesIt: "Cliente"`.
     *     Numa casa 100% IA, sem revisor humano, minha cadeia de seis funções
     *     ia do briefing anônimo DIRETO para a mesa do cliente pagante. Eu
     *     tinha escrito "o fim da cadeia é GENTE" — é gente, mas era a pessoa
     *     errada, e a diferença é a diferença inteira.
     *   • O `reviewNote` levava `funcaoId` e `custoUsd` passo a passo, e o
     *     portal renderiza a nota como CORPO do card. O cliente veria quanto a
     *     agência gastou de IA com ele.
     *
     * `clientVisible: false` conserta os dois de uma vez, e o resumo passou a
     * ser limpo de qualquer jeito (`resumoDoPacote`) — defesa em profundidade,
     * porque uma linha futura que virasse a visibilidade não pode reabrir o
     * vazamento de custo junto.
     *
     * O que passa a acontecer no lugar: o card nasce na fila de aprovação DA
     * AGÊNCIA. Um humano daqui revisa e, aí sim, decide o que vai ao cliente.
     */
    async abrirAprovacao({ clienteId, solicitacaoId, resumo }) {
      const approval = await createApprovalRequest({
        clientId: clienteId,
        clientRequestId: solicitacaoId,
        department: "design",
        requestedBy: "esteira-automatica",
        clientVisible: false,
        reviewNote: `Esteira automática — pacote aguardando revisão da AGÊNCIA antes de ir ao cliente. ${resumo}`,
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
