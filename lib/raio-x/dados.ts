// A METADE DE DADOS — o raio-x do banco de produção. Somente leitura.
//
// A metade de código pergunta "que forma perigosa existe no repositório?". Esta
// pergunta outra coisa: **o que está preso AGORA?** Foi um número desses que
// teria evitado a cicatriz — "6 peças aprovadas, 0 agendadas" apareceria na
// madrugada anterior à manhã em que nada publicaria.
//
// TRAVA: só `findMany`/`count`/`findFirst` entram aqui. Nenhum verbo de escrita,
// nenhuma chamada a IA, nenhuma mensagem enviada. O teste
// `raio-x-nao-escreve.test.ts` prova isso lendo este arquivo — porque garantia
// sem teste não existe (guardrail 4).

import { prisma } from "@/lib/db/client";
import { cega, type Achado, type ResultadoDeVarredura } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

/** Um dia é o horizonte de "preso": abaixo disso é operação normal, acima é
 *  alguém esperando. */
function ontem(agora: Date): Date {
  return new Date(agora.getTime() - DIA);
}

export async function varrerDadosPresos(agora: Date = new Date()): Promise<ResultadoDeVarredura> {
  const NOME = "dados-presos";
  const achados: Achado[] = [];
  const medidas: Record<string, number> = {};

  try {
    // 1. A CICATRIZ. Aprovado pelo cliente e nada agendado — o beco sem saída.
    const aprovados = await prisma.socialPost.count({ where: { status: "approved" } });
    const agendados = await prisma.socialPost.count({ where: { status: "scheduled" } });
    medidas.postsAprovados = aprovados;
    medidas.postsAgendados = agendados;
    if (aprovados > 0 && agendados === 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "aprovado-sem-agendado",
        titulo: "Peça aprovada pelo cliente e nenhuma agendada",
        evidencia: `${aprovados} post(s) em "approved" e 0 em "scheduled" — é a forma exata do beco sem saída de 04/08`,
        local: "SocialPost.status",
        gravidade: "alto",
      });
    }

    // 1b. O RETRATO COMPLETO DA ESTEIRA. Contar só "approved" e "scheduled"
    //     esconde o caso mais comum de peça parada: a que nunca saiu de
    //     rascunho. Em 05/08/2026 o CEO disse "os carrosséis não chegaram para
    //     eu aprovar" e as duas medidas anteriores respondiam zero — zero que
    //     não distingue "não existe" de "existe e está em outro estado".
    const rascunhos = await prisma.socialPost.count({ where: { status: "draft" } });
    const publicados = await prisma.socialPost.count({ where: { status: "published" } });
    const totalDePosts = await prisma.socialPost.count();
    const carrosseis = await prisma.socialPost.count({ where: { format: "carousel" } });
    const visiveisAoCliente = await prisma.socialPost.count({ where: { visibility: "compartilhado" } });
    medidas.postsRascunho = rascunhos;
    medidas.postsPublicados = publicados;
    medidas.postsTotal = totalDePosts;
    medidas.postsCarrossel = carrosseis;
    medidas.postsVisiveisAoCliente = visiveisAoCliente;

    // Aprovações abertas: é o que o cliente VÊ como "esperando você".
    const aprovacoesPendentes = await prisma.approvalRequest.count({ where: { status: "pending" } });
    const aprovacoesVisiveis = await prisma.approvalRequest.count({
      where: { status: "pending", clientVisible: true },
    });
    medidas.aprovacoesPendentes = aprovacoesPendentes;
    medidas.aprovacoesVisiveisAoCliente = aprovacoesVisiveis;
    medidas.clientes = await prisma.client.count();
    medidas.projetos = await prisma.project.count();

    // A ARMADILHA QUE JÁ ACONTECEU: peça pronta, aprovação criada, e o cliente
    // não enxerga porque o card nasceu invisível.
    if (aprovacoesPendentes > 0 && aprovacoesVisiveis === 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "aprovacao-invisivel",
        titulo: "Aprovação pendente que o cliente NÃO enxerga",
        evidencia: `${aprovacoesPendentes} card(s) em "pending" e nenhum com clientVisible — o portal dele mostra vazio`,
        local: "ApprovalRequest.clientVisible",
        gravidade: "alto",
      });
    }

    // 2. Agendado para o passado e não publicado: o relógio parou e ninguém viu.
    const atrasados = await prisma.socialPost.findMany({
      where: { status: "scheduled", scheduledFor: { lt: agora } },
      select: { id: true, scheduledFor: true },
      orderBy: { scheduledFor: "asc" },
      take: 5,
    });
    const totalAtrasados = await prisma.socialPost.count({
      where: { status: "scheduled", scheduledFor: { lt: agora } },
    });
    medidas.postsAtrasados = totalAtrasados;
    if (totalAtrasados > 0) {
      achados.push({
        padrao: "trabalho-invisivel",
        chave: "post-agendado-no-passado",
        titulo: "Post agendado para o passado e ainda não publicado",
        evidencia: `${totalAtrasados} post(s). O mais antigo: ${atrasados[0]?.id} para ${atrasados[0]?.scheduledFor?.toISOString()}`,
        local: "SocialPost",
        gravidade: "alto",
      });
    }

    // 3. Falha de publicação registrada e parada.
    const falhados = await prisma.socialPost.count({ where: { status: "failed" } });
    medidas.postsFalhados = falhados;
    if (falhados > 0) {
      const exemplo = await prisma.socialPost.findFirst({
        where: { status: "failed" },
        select: { id: true, lastError: true },
        orderBy: { updatedAt: "desc" },
      });
      achados.push({
        padrao: "trabalho-invisivel",
        chave: "post-falhado",
        titulo: "Publicação falhou e ficou parada",
        evidencia: `${falhados} post(s) em "failed". Último: ${exemplo?.id} — ${exemplo?.lastError ?? "sem motivo registrado"}`,
        local: "SocialPost.lastError",
        gravidade: "medio",
      });
    }

    // 4. O cliente falou e ninguém leu. O índice `readByTeam` existiu escrito em
    //    11 lugares e lido em nenhum até 05/08 — a mensagem gravava e morria.
    const naoLidas = await prisma.portalMessage.count({
      where: { authorRole: "client", readByTeam: false },
    });
    const naoLidasAntigas = await prisma.portalMessage.count({
      where: { authorRole: "client", readByTeam: false, createdAt: { lt: ontem(agora) } },
    });
    medidas.mensagensNaoLidas = naoLidas;
    medidas.mensagensNaoLidasHaMaisDeUmDia = naoLidasAntigas;
    if (naoLidasAntigas > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "mensagem-do-cliente-sem-leitura",
        titulo: "Mensagem do cliente esperando há mais de um dia",
        evidencia: `${naoLidasAntigas} mensagem(ns) de cliente sem leitura da equipe há +24h (${naoLidas} no total)`,
        local: "PortalMessage.readByTeam",
        gravidade: "alto",
      });
    }

    // 5. Aprovação pendente vencida: o prazo passou e o card continua parado.
    const vencidas = await prisma.approvalRequest.count({
      where: { status: "pending", expiresAt: { lt: agora } },
    });
    medidas.aprovacoesVencidas = vencidas;
    if (vencidas > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "aprovacao-vencida",
        titulo: "Aprovação pendente com prazo vencido",
        evidencia: `${vencidas} card(s) em "pending" com expiresAt no passado`,
        local: "ApprovalRequest",
        gravidade: "medio",
      });
    }

    // 6. Material pedido ao cliente e nunca pedido de fato (o agente travou e a
    //    pergunta não saiu).
    const materialSemPergunta = await prisma.materialRequest.count({
      where: { status: "pending", askedClientAt: null, requestedAt: { lt: ontem(agora) } },
    });
    medidas.materiaisNaoPerguntados = materialSemPergunta;
    if (materialSemPergunta > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "material-nao-perguntado",
        titulo: "Agente travou por falta de material e a pergunta nunca chegou ao cliente",
        evidencia: `${materialSemPergunta} pedido(s) pendentes há +24h com askedClientAt vazio`,
        local: "MaterialRequest.askedClientAt",
        gravidade: "alto",
      });
    }

    // 7. Gasto de IA nas últimas 24h. Não é achado por si — é a curva que
    //    denuncia o laço que sangra ANTES de a fatura chegar.
    const chamadas24h = await prisma.aIRunLog.count({ where: { createdAt: { gte: ontem(agora) } } });
    const falhas24h = await prisma.aIRunLog.count({
      where: { createdAt: { gte: ontem(agora) }, status: { not: "success" } },
    });
    medidas.chamadasDeIA24h = chamadas24h;
    medidas.chamadasDeIAComFalha24h = falhas24h;

    // 8. Fila de WhatsApp presa.
    const outboxFalhou = await prisma.whatsAppOutbox.count({ where: { status: "failed" } });
    medidas.whatsappFalhado = outboxFalhou;
    if (outboxFalhou > 0) {
      achados.push({
        padrao: "trabalho-invisivel",
        chave: "whatsapp-falhado",
        titulo: "Mensagem de WhatsApp que não saiu",
        evidencia: `${outboxFalhou} item(ns) da fila em "failed"`,
        local: "WhatsAppOutbox",
        gravidade: "medio",
      });
    }

    // 9. Solicitação órfã (sem workspace). Caso legítimo nesta casa, mas o
    //    número precisa ser visto: é ele que decide se a política da órfã
    //    continua sustentável ou virou porta.
    const orfas = await prisma.clientRequestDb.count({ where: { workspaceId: null } });
    medidas.solicitacoesOrfas = orfas;
  } catch (erro) {
    // Banco fora do ar é AUSÊNCIA DE INFORMAÇÃO, e ausência de informação não é
    // informação: a varredura volta cega, com motivo, e não conta como "tudo bem".
    return cega(NOME, "estado-morto", `banco não respondeu: ${(erro as Error).message}`);
  }

  return { varredura: NOME, padrao: "estado-morto", status: "rodou", achados, medidas };
}
