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
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
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

    // 1c. DE QUEM SÃO AS APROVAÇÕES ABERTAS — as DUAS chaves de posse.
    //
    // ── O QUE ESTA MEDIDA FECHOU (15/08/2026) ────────────────────────────────
    // A coleta de produção mostrou **7 aprovações pendentes, todas
    // `clientVisible: true`**, e o censo por cliente (`por-cliente.ts`) dava
    // **ZERO nos 5 clientes**. Parecia — e foi levantado como — cartão de
    // decisão visível a cliente nenhum: a família de defeito mais cara desta
    // casa (escopo de posse).
    //
    // NÃO ERA. `ApprovalRequest` tem posse por **duas** chaves, e isso está
    // escrito no schema desde o lançamento da Foocci: `clientRequestId` (fluxo
    // do briefing) **OU** `clientId` (cliente criado direto). O censo por
    // cliente perguntava só a segunda. Sete cards do primeiro tipo são
    // invisíveis para ele **por construção da consulta**, não por falta de dono.
    //
    // A lição é a de sempre nesta casa: **o número não estava errado — a
    // pergunta estava.** Duas medidas que não somam entre si viram "defeito de
    // escopo" na cabeça de quem lê, e ninguém consegue refutar sem abrir o
    // schema. Agora a soma fecha aqui dentro, e a divergência tem nome.
    const aprovacoesPorSolicitacao = await prisma.approvalRequest.count({
      where: { status: "pending", clientRequestId: { not: null } },
    });
    const aprovacoesPorCliente = await prisma.approvalRequest.count({
      where: { status: "pending", clientRequestId: null, clientId: { not: null } },
    });
    medidas.aprovacoesPendentesPorSolicitacao = aprovacoesPorSolicitacao;
    medidas.aprovacoesPendentesPorClienteDireto = aprovacoesPorCliente;

    // O QUE SOBRA depois das duas chaves é o que realmente não tem dono.
    // `createApprovalRequest` LANÇA sem dono (approval-service.ts), então o
    // caminho vivo não escreve card órfão — mas dado antigo, seed ou import
    // podem ter escrito, e afirmar "é impossível" sem contar é fé.
    const aprovacoesSemChave = await prisma.approvalRequest.count({
      where: { status: "pending", clientRequestId: null, clientId: null },
    });
    medidas.aprovacoesPendentesSemChaveDePosse = aprovacoesSemChave;
    if (aprovacoesSemChave > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "aprovacao-sem-dono",
        titulo: "Aprovação pendente sem clientRequestId E sem clientId",
        evidencia:
          `${aprovacoesSemChave} card(s) em "pending" sem nenhuma das duas chaves de posse. ` +
          "Ninguém consegue vê-lo nem decidi-lo: o portal deriva a posse do token e nada baterá.",
        local: "ApprovalRequest.clientRequestId / .clientId",
        gravidade: "alto",
      });
    }

    // O ÓRFÃO DE VERDADE: `ApprovalRequest.clientId` **não tem `@relation`** no
    // schema — só `clientRequest` tem, com `onDelete: Cascade`. Apagar um
    // `Client` deixa o `clientId` do card apontando para o nada, sem cascata e
    // sem erro. Contar exige comparar as duas listas; são dezenas de linhas.
    const donosDeCards = await prisma.approvalRequest.findMany({
      where: { status: "pending", clientId: { not: null } },
      select: { clientId: true },
      distinct: ["clientId"],
      take: 500,
    });
    const idsDeCards = donosDeCards.map((a) => a.clientId!).filter(Boolean);
    let pendura = 0;
    if (idsDeCards.length > 0) {
      const vivos = await prisma.client.findMany({
        where: { id: { in: idsDeCards } },
        select: { id: true },
      });
      const conjunto = new Set(vivos.map((c) => c.id));
      const mortos = idsDeCards.filter((id) => !conjunto.has(id));
      if (mortos.length > 0) {
        pendura = await prisma.approvalRequest.count({
          where: { status: "pending", clientId: { in: mortos } },
        });
        achados.push({
          padrao: "estado-morto",
          chave: "aprovacao-com-cliente-apagado",
          titulo: "Aprovação pendente apontando para um cliente que não existe mais",
          evidencia:
            `${pendura} card(s) em "pending" com clientId sem Client correspondente (${mortos.length} id(s) mortos). ` +
            "ApprovalRequest.clientId não tem @relation no schema: apagar o Client não cascateia e não dá erro.",
          local: "ApprovalRequest.clientId (sem FK)",
          gravidade: "alto",
        });
      }
    }
    medidas.aprovacoesPendentesComClienteApagado = pendura;

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

    // 10. O CLIENTE PEDIU E NINGUÉM PEGOU.
    //
    // A cicatriz é de 06/08/2026 e é a mais cara desta lista. O CEO pediu um
    // roteiro de vídeo em 05/08 às 14h47; o pedido gravou com status "novo" e
    // ficou lá **dois dias**, até ele cobrar dizendo que o ChatGPT entregaria
    // em um minuto e meio.
    //
    // O raio-x enxergava peça presa, mensagem sem leitura e material não
    // perguntado — e **não enxergava pedido preso**. O balde mais próximo do
    // dinheiro era justamente o que ninguém media: é do pedido do cliente que
    // sai projeto novo. Estado "novo" não aciona ninguém, e o que não aciona
    // ninguém precisa, no mínimo, acordar alguém pela madrugada.
    // A varredura olha o `ContentRequest` — é ONDE o pedido do portal mora e
    // onde o roteiro travado estava. (A primeira versão contava
    // `ClientRequestDb.status === "novo"`, que nunca casa: o default daquela
    // tabela é "new". A varredura devolvia zero e passava por saudável.)
    //
    // Desde 06/08/2026 a triagem é automática, então três estados prendem
    // trabalho e os três entram:
    //   • "novo"/"em_triagem" parados     → a passagem não rodou;
    //   • "triado"/"em_producao" parados  → triou e não produziu;
    //   • "precisa_decisao"               → a máquina parou e CHAMOU. Isto não é
    //     defeito — é o fail-closed funcionando —, mas parado +24h vira balde
    //     igual, só que com motivo escrito.
    const PARADOS = ["novo", "em_triagem", "triado", "em_producao"];
    const pedidosAbertos = await prisma.contentRequest.count({ where: { status: { in: PARADOS } } });
    const pedidosParados = await prisma.contentRequest.count({
      where: { status: { in: PARADOS }, createdAt: { lt: ontem(agora) } },
    });
    const pedidosEsperandoGente = await prisma.contentRequest.count({
      where: { status: "precisa_decisao", createdAt: { lt: ontem(agora) } },
    });
    medidas.pedidosDoClienteAbertos = pedidosAbertos;
    medidas.pedidosDoClienteParadosHaMaisDeUmDia = pedidosParados;
    medidas.pedidosEsperandoDecisaoHaMaisDeUmDia = pedidosEsperandoGente;
    if (pedidosParados > 0) {
      const maisAntigo = await prisma.contentRequest.findFirst({
        where: { status: { in: PARADOS }, createdAt: { lt: ontem(agora) } },
        select: { id: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      achados.push({
        padrao: "estado-morto",
        chave: "pedido-do-cliente-parado",
        titulo: "Pedido do cliente parado sem a esteira andar",
        evidencia:
          `${pedidosParados} pedido(s) sem sair do lugar há +24h (${pedidosAbertos} em aberto no total). ` +
          `O mais antigo: ${maisAntigo?.id} em "${maisAntigo?.status}" desde ${maisAntigo?.createdAt?.toISOString()}`,
        local: "ContentRequest.status",
        gravidade: "alto",
      });
    }
    if (pedidosEsperandoGente > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "pedido-esperando-decisao",
        titulo: "Pedido que a máquina parou e ninguém decidiu",
        evidencia: `${pedidosEsperandoGente} pedido(s) em "precisa_decisao" há +24h. O fail-closed chamou; ninguém atendeu.`,
        local: "ContentRequest.status",
        gravidade: "medio",
      });
    }
    // 11. A FILA DA PORTA DA FRENTE — o interessado que entrou e ninguém varreu.
    //
    // Medido em produção em 08/08/2026: **três** solicitações em `"new"`, a mais
    // velha parada há **51 dias** (Sushi Cazza, 18/06), as outras há 29 e 28.
    // Briefing completo, com paleta, ticket e público-alvo. **Nenhuma com
    // contato.**
    //
    // Por que nada tocou: o item 10 acima olha `ContentRequest` — o pedido de
    // quem JÁ É cliente. Estas moram em `ClientRequestDb`, que é a porta do
    // prospect, e nenhuma varredura desta casa a olhava. O item 9 conta órfãs
    // por workspace e não olha status. O cargo de PM nasceu por DOIS dias de
    // atraso num pedido do próprio CEO; aqui foram sete semanas de gente de fora
    // com dinheiro na mão, e o painel não tinha uma linha vermelha.
    //
    // POR QUE O HORIZONTE É 24h, E NÃO MAIS:
    // a própria tela de confirmação do briefing promete ao prospect *"entramos
    // em contato pelo e-mail informado em até 1 dia útil"*. Alarme que só toca
    // em 48h ou 72h toca **depois de a promessa já estar quebrada** — ele
    // registra o dano, não o previne. E 24h é o mesmo horizonte de todos os
    // outros baldes deste arquivo: um segundo relógio na mesma varredura é uma
    // segunda regra para alguém esquecer. O custo de um alarme que aparece num
    // sábado é uma linha a mais num relatório noturno; o custo de errar para o
    // outro lado tem nome e são três.
    //
    // DOIS BALDES, porque a AÇÃO é diferente:
    //   • parada COM contato  → alguém pode pegar o telefone hoje;
    //   • parada SEM contato  → não há para onde ligar. É o pior dos dois, e é
    //     também o termômetro do gate de contato: se este número cresce depois
    //     de 08/08, o gate do briefing está vazando.
    const ABERTAS = ["new", "lead_incompleto"];
    const limite = ontem(agora);
    const totalAbertas = await prisma.clientRequestDb.count({ where: { status: { in: ABERTAS } } });
    const totalParadas = await prisma.clientRequestDb.count({
      where: { status: { in: ABERTAS }, createdAt: { lt: limite } },
    });
    medidas.solicitacoesDeBriefingAbertas = totalAbertas;
    medidas.solicitacoesDeBriefingParadasHaMaisDeUmDia = totalParadas;

    // O teto existe para o raio-x não puxar a base inteira. Quando ele morde, a
    // divisão abaixo vira AMOSTRA — e isso aparece como medida, nunca escondido:
    // um split que some com o total é um número que mente sem avisar.
    const TETO_DE_CLASSIFICACAO = 200;
    const paradas = await prisma.clientRequestDb.findMany({
      where: { status: { in: ABERTAS }, createdAt: { lt: limite } },
      select: { id: true, businessName: true, status: true, createdAt: true, briefingJson: true, sdrHandoffJson: true },
      orderBy: { createdAt: "asc" },
      take: TETO_DE_CLASSIFICACAO,
    });
    medidas.solicitacoesClassificadas = paradas.length;

    const comContato = paradas.filter((s) => lerContato(s).temComoFalar);
    const semContato = paradas.filter((s) => !lerContato(s).temComoFalar);
    medidas.solicitacoesParadasComContato = comContato.length;
    medidas.solicitacoesParadasSemContato = semContato.length;

    const diasDe = (d: Date) => Math.floor((agora.getTime() - d.getTime()) / DIA);

    if (comContato.length > 0) {
      const v = comContato[0];
      achados.push({
        padrao: "estado-morto",
        chave: "briefing-parado-com-contato",
        titulo: "Interessado com contato esperando a agência responder",
        evidencia:
          `${comContato.length} solicitação(ões) de briefing parada(s) há +24h COM forma de falar. ` +
          `A mais antiga: "${v.businessName}" (${v.id}) em "${v.status}" há ${diasDe(v.createdAt)} dia(s).`,
        local: "ClientRequestDb.status",
        gravidade: "alto",
      });
    }

    if (semContato.length > 0) {
      const v = semContato[0];
      achados.push({
        padrao: "estado-morto",
        chave: "briefing-parado-sem-contato",
        titulo: "Interessado contou tudo e a agência não tem como falar com ele",
        evidencia:
          `${semContato.length} solicitação(ões) parada(s) há +24h SEM nome de contato e SEM canal. ` +
          `A mais antiga: "${v.businessName}" (${v.id}) há ${diasDe(v.createdAt)} dia(s). ` +
          `O briefing está gravado inteiro; não há para onde ligar.`,
        local: "ClientRequestDb.briefingJson.contato",
        gravidade: "alto",
      });
    }

    // ── 12, 13 e 14: OS TRÊS BALDES QUE FALTAVAM PARA RELIGAR O RELÓGIO ──────
    //
    // Levantados em 15/08/2026 na auditoria do raio-x. Os três prendem trabalho
    // já PAGO — peça produzida, direção aprovada, aviso redigido — no último
    // metro, que é justamente onde esta casa já foi mordida quatro vezes.

    // 12. DIREÇÃO APROVADA E EXECUÇÃO QUE NÃO ANDOU.
    //     `directionApprovedAt` é fato datado: o cliente disse "vai". Se depois
    //     disso a execução está `idle` (ninguém pediu) ou `failed` (pediu e
    //     quebrou), o "vai" dele morreu dentro de casa. Só conta passadas 24h do
    //     aval — projeto aprovado agora está em operação normal, não preso.
    const direcaoSemExecucao = await prisma.project.count({
      where: {
        directionApprovedAt: { not: null, lt: ontem(agora) },
        executionStatus: { in: ["idle", "failed"] },
      },
    });
    medidas.projetosComDirecaoAprovadaESemExecucao = direcaoSemExecucao;
    if (direcaoSemExecucao > 0) {
      const maisAntigo = await prisma.project.findFirst({
        where: {
          directionApprovedAt: { not: null, lt: ontem(agora) },
          executionStatus: { in: ["idle", "failed"] },
        },
        select: { id: true, executionStatus: true, executionError: true, directionApprovedAt: true },
        orderBy: { directionApprovedAt: "asc" },
      });
      achados.push({
        padrao: "estado-morto",
        chave: "direcao-aprovada-sem-execucao",
        titulo: "Cliente aprovou a direção e a execução não andou",
        evidencia:
          `${direcaoSemExecucao} projeto(s) com direção aprovada há +24h e execução em "idle"/"failed". ` +
          `O mais antigo: ${maisAntigo?.id} em "${maisAntigo?.executionStatus}" desde ` +
          `${maisAntigo?.directionApprovedAt?.toISOString()}${maisAntigo?.executionError ? ` — ${maisAntigo.executionError}` : " — sem erro registrado"}`,
        local: "Project.directionApprovedAt + .executionStatus",
        gravidade: "alto",
      });
    }

    // 12b. Execução que PEDIU e nunca terminou. Estado diferente do de cima e
    //      ação diferente: aqui a máquina está pendurada, não parada.
    const execucaoPendurada = await prisma.project.count({
      where: { executionStatus: { in: ["pending", "running"] }, executionRequestedAt: { lt: ontem(agora) } },
    });
    medidas.projetosComExecucaoPenduradaHaMaisDeUmDia = execucaoPendurada;
    if (execucaoPendurada > 0) {
      achados.push({
        padrao: "estado-morto",
        chave: "execucao-pendurada",
        titulo: "Execução pedida há mais de um dia e nunca terminou",
        evidencia: `${execucaoPendurada} projeto(s) em "pending"/"running" com pedido de +24h — nem terminou nem falhou`,
        local: "Project.executionStatus",
        gravidade: "alto",
      });
    }

    // 13. PACOTE BARRADO PELA QUALIDADE.
    //     `revisionStatus: "quality_flag"` é o freio que impede a peça de ser
    //     apresentada (`marcos.ts`, `escada/repescagem.ts`). O freio funciona —
    //     o que não existia era ALGUÉM CONTANDO quantas peças ele segura. Freio
    //     sem contador é o modo mais silencioso de a agência parar de entregar:
    //     tudo "funcionando", nada chegando.
    const barradasPelaQualidade = await prisma.deliverable.count({
      where: { revisionStatus: "quality_flag" },
    });
    medidas.entregaveisBarradosPelaQualidade = barradasPelaQualidade;
    if (barradasPelaQualidade > 0) {
      const exemplo = await prisma.deliverable.findFirst({
        where: { revisionStatus: "quality_flag" },
        select: { id: true, projectId: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
      });
      achados.push({
        padrao: "estado-morto",
        chave: "entregavel-barrado-pela-qualidade",
        titulo: "Entregável barrado pela Qualidade e parado",
        evidencia:
          `${barradasPelaQualidade} entregável(is) em "quality_flag" — não são apresentados ao cliente enquanto a ressalva não cair. ` +
          `O mais antigo: ${exemplo?.id} (projeto ${exemplo?.projectId}) desde ${exemplo?.updatedAt?.toISOString()}`,
        local: "Deliverable.revisionStatus",
        gravidade: "alto",
      });
    }

    // 14. 🔴 AVISO AO CLIENTE QUE NUNCA SAIU — o furo de instrumento mais grave
    //     desta lista.
    //
    //     O item 8 acima conta `WhatsAppOutbox` em `"failed"`, e isso NÃO é o
    //     mesmo fato: `WhatsAppOutbox` é a fila de saída do WhatsApp, e "failed"
    //     é a mensagem que TENTOU sair e a Meta recusou. `ClientNotice` é o
    //     aviso redigido para o cliente (direção, material, entrega, ciclo), e
    //     `"pendente"` é o aviso que **nunca foi tentado**.
    //
    //     Um aviso preso em `pendente` é invisível para os dois: não aparece no
    //     balde do WhatsApp (outro modelo, outro estado) e não aparece em lugar
    //     nenhum. É a forma exata da cicatriz que criou o cargo de PM — trabalho
    //     escrito, ninguém avisado, e o painel verde.
    const avisosPendentes = await prisma.clientNotice.count({ where: { status: "pendente" } });
    const avisosPendentesAntigos = await prisma.clientNotice.count({
      where: { status: "pendente", createdAt: { lt: ontem(agora) } },
    });
    const avisosFalhados = await prisma.clientNotice.count({ where: { status: "falhou" } });
    medidas.avisosAoClientePendentes = avisosPendentes;
    medidas.avisosAoClientePendentesHaMaisDeUmDia = avisosPendentesAntigos;
    medidas.avisosAoClienteFalhados = avisosFalhados;
    if (avisosPendentesAntigos > 0) {
      const maisAntigo = await prisma.clientNotice.findFirst({
        where: { status: "pendente", createdAt: { lt: ontem(agora) } },
        select: { id: true, kind: true, channel: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      achados.push({
        padrao: "estado-morto",
        chave: "aviso-ao-cliente-nunca-enviado",
        titulo: "Aviso ao cliente redigido e nunca enviado",
        evidencia:
          `${avisosPendentesAntigos} aviso(s) em "pendente" há +24h (${avisosPendentes} no total). ` +
          `O mais antigo: ${maisAntigo?.id} (${maisAntigo?.kind}, canal "${maisAntigo?.channel}") de ${maisAntigo?.createdAt?.toISOString()}. ` +
          "Nunca tentou sair — não aparece no balde de WhatsApp falhado, que é outro modelo e outro estado.",
        local: "ClientNotice.status",
        gravidade: "alto",
      });
    }
    if (avisosFalhados > 0) {
      const exemplo = await prisma.clientNotice.findFirst({
        where: { status: "falhou" },
        select: { id: true, failReason: true },
        orderBy: { updatedAt: "desc" },
      });
      achados.push({
        padrao: "trabalho-invisivel",
        chave: "aviso-ao-cliente-falhou",
        titulo: "Aviso ao cliente tentou sair e falhou",
        evidencia: `${avisosFalhados} aviso(s) em "falhou". Último: ${exemplo?.id} — ${exemplo?.failReason ?? "sem motivo registrado"}`,
        local: "ClientNotice.failReason",
        gravidade: "medio",
      });
    }
  } catch (erro) {
    // Banco fora do ar é AUSÊNCIA DE INFORMAÇÃO, e ausência de informação não é
    // informação: a varredura volta cega, com motivo, e não conta como "tudo bem".
    return cega(NOME, "estado-morto", `banco não respondeu: ${(erro as Error).message}`);
  }

  return { varredura: NOME, padrao: "estado-morto", status: "rodou", achados, medidas };
}
