// marcos.ts — os três momentos em que alguém decide, e a esteira anda.
//
// Tudo o mais na esteira é derivado do dado real. Estes três não: são decisões
// que alguém tomou, e por isso ficam gravadas com hora.
//
//   1. aprovarDirecao   — o cliente avaliza o caminho. É o que LIBERA a produção.
//   2. apresentar       — o PM mostra o pacote inteiro, de uma vez.
//   3. aprovarPacote    — o cliente dá o aval final. Abre a implementação.
//
// Por que existe um arquivo só para isto: antes, "o projeto andou" era um efeito
// colateral espalhado por telas e rotas — cada uma mexendo num pedaço do estado,
// nenhuma responsável pelo todo. Um caminho esquecia de avisar o cliente, outro
// esquecia de ligar o motor. Aqui cada marco faz TUDO que aquele marco significa,
// num lugar só, e quem chama não precisa lembrar de nada.

import { prisma } from "@/lib/db/client";
import { runProjectExecution, type ExecutionResult } from "@/lib/agency/execution/run-execution";
import { avisarCliente, type TipoDeAviso } from "@/lib/agency/esteira/avisos";
import { escadaFiltraEntregas } from "@/lib/agency/escada/registro";
// A MESMA forma canônica de agente→departamento que a escada usa. Ver o bloco
// de publicação de cards em `apresentar`.
import { departamentoDoAgente } from "@/lib/agency/escada/degraus";

export interface ResultadoDoMarco {
  ok: boolean;
  erro?: string;
  /** Presente quando o marco disparou a produção. */
  execucao?: ExecutionResult;
  /** O que foi comunicado ao cliente, quando houve comunicação. */
  avisouCliente?: boolean;
}

async function carregar(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, clientRequestId: true, workspaceId: true, clientId: true,
      directionApprovedAt: true, presentedAt: true, clientApprovedAt: true,
    },
  });
}

/**
 * Fala com o cliente: escreve no portal E dispara o aviso.
 *
 * Os dois passos são um só de propósito. Escrever no portal sem avisar é o que
 * fazia o projeto parar em silêncio — a mensagem existia, o cliente não sabia.
 * Quem chama não deveria precisar lembrar das duas coisas.
 */
export async function falarComOCliente(
  projeto: { clientRequestId: string | null; workspaceId?: string; clientId?: string; id?: string },
  corpo: string,
  tipo: TipoDeAviso,
): Promise<boolean> {
  if (!projeto.clientRequestId) return false;
  try {
    await prisma.portalMessage.create({
      data: { clientRequestId: projeto.clientRequestId, authorRole: "team", authorName: "Gerente de projeto", body: corpo, readByTeam: true },
    });
  } catch (e) {
    console.warn("[esteira] não consegui falar com o cliente:", e instanceof Error ? e.message : e);
    return false;
  }

  // O aviso é best-effort e nunca derruba o marco: perder o aviso é ruim,
  // perder o registro do que foi combinado é pior.
  if (projeto.workspaceId && projeto.clientId) {
    await avisarCliente({
      workspaceId: projeto.workspaceId,
      clientId: projeto.clientId,
      ...(projeto.id ? { projectId: projeto.id } : {}),
      tipo,
      texto: corpo,
    }).catch(() => undefined);
  }
  return true;
}

/**
 * MARCO 0 — o PM terminou o desenho e manda a direção para o cliente avalizar.
 *
 * É o passo que fazia falta: o projeto nascia e ficava parado esperando alguém
 * que nunca vinha. Aqui, no instante em que o projeto é criado, o cliente já
 * recebe o que vai ser feito e o pedido de aval — e a esteira tem para onde
 * andar sozinha.
 *
 * Best-effort: se a mensagem falhar, o projeto continua criado. A equipe pode
 * mandar a direção pela tela; perder o projeto por causa de um aviso seria bem
 * pior do que um aviso que não saiu.
 */
export async function pedirDirecao(projectId: string): Promise<ResultadoDoMarco> {
  const projeto = await carregar(projectId);
  if (!projeto) return { ok: false, erro: "Projeto não encontrado" };
  if (projeto.directionApprovedAt) return { ok: true, erro: "a direção já foi aprovada" };

  const tarefas = await prisma.task.findMany({
    where: { projectId },
    select: { title: true },
    orderBy: { createdAt: "asc" },
    take: 12,
  }).catch(() => [] as Array<{ title: string }>);

  const linhas = [
    `Montamos o plano do projeto ${projeto.name}. Antes de começar a produzir, queria seu aval no caminho:`,
    "",
    ...tarefas.map((t) => `• ${t.title}`),
    "",
    "Faz sentido pra você? Se sim, é só aprovar e a gente começa hoje mesmo.",
    "Se quiser mudar algo, agora é a melhor hora — mudar o rumo aqui é rápido; depois da produção, custa bem mais.",
  ];

  const avisou = await falarComOCliente(projeto, linhas.join("\n"), "direcao");
  return { ok: true, avisouCliente: avisou };
}

/**
 * MARCO 1 — a direção foi aprovada. A produção começa AGORA.
 *
 * Este é o marco que liga o motor. Antes dele, a produção fica parada de
 * propósito: aprovar uma direção custa uma conversa, refazer um mês de produção
 * custa o mês.
 *
 * Idempotente: aprovar de novo não re-dispara nada nem duplica mensagem.
 */
export async function aprovarDirecao(projectId: string, opts: { produzirAgora?: boolean } = {}): Promise<ResultadoDoMarco> {
  const projeto = await carregar(projectId);
  if (!projeto) return { ok: false, erro: "Projeto não encontrado" };
  if (projeto.directionApprovedAt) {
    return { ok: true, erro: "a direção já estava aprovada — nada mudou" };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      directionApprovedAt: new Date(),
      // Pedido de produção registrado no banco: se esta chamada morrer no meio,
      // o cron encontra o projeto e retoma. A esteira não depende do navegador.
      executionStatus: "pending",
      executionRequestedAt: new Date(),
      executionError: null,
    },
  });

  const avisou = await falarComOCliente(
    projeto,
    "Direção aprovada — obrigado! 🎯 A produção já começou. Assim que estiver tudo pronto, eu te apresento o pacote completo de uma vez.",
    "direcao",
  );

  if (opts.produzirAgora === false) return { ok: true, avisouCliente: avisou };

  const execucao = await runProjectExecution(projectId);
  return { ok: true, execucao, avisouCliente: avisou };
}

/**
 * MARCO 2 — o PM apresenta o pacote ao cliente, de uma vez.
 *
 * Só acontece com a produção terminada. É aqui que as aprovações ficam visíveis
 * ao cliente: antes disso elas existem, mas caladas — o cliente não deve receber
 * entrega pingando peça por peça.
 *
 * Recusa apresentar se a Qualidade ainda tem ressalva: mostrar ao cliente algo
 * que a própria casa sabe que está torto é o jeito mais rápido de perder a
 * confiança dele.
 */
export async function apresentar(projectId: string, opts: { mesmoComRessalva?: boolean } = {}): Promise<ResultadoDoMarco> {
  const projeto = await carregar(projectId);
  if (!projeto) return { ok: false, erro: "Projeto não encontrado" };
  if (projeto.presentedAt) return { ok: true, erro: "já apresentado — nada mudou" };
  if (!projeto.directionApprovedAt) return { ok: false, erro: "a direção ainda não foi aprovada" };

  const entregaveis = await prisma.deliverable.findMany({
    where: { projectId },
    // `ownerAgentId` entra porque é ele que diz DE QUE DEPARTAMENTO é a peça —
    // e é o departamento que tem degrau na escada de exposição.
    select: { id: true, name: true, revisionStatus: true, ownerAgentId: true },
  });
  if (entregaveis.length === 0) return { ok: false, erro: "não há nada pronto para apresentar" };

  const comRessalva = entregaveis.filter((d) => d.revisionStatus === "quality_flag");
  if (comRessalva.length > 0 && opts.mesmoComRessalva !== true) {
    return {
      ok: false,
      erro: `${comRessalva.length} entrega(s) com ressalva da Qualidade. Resolva antes de mostrar ao cliente.`,
    };
  }

  const pendentes = await prisma.materialRequest.count({ where: { projectId, status: "pending" } });

  await prisma.project.update({ where: { id: projectId }, data: { presentedAt: new Date() } });

  // ⚠️ 07/08/2026 — A ORDEM DESTES DOIS BLOCOS ERA O DEFEITO, E ELA FOI INVERTIDA.
  //
  // Antes, a publicação das aprovações vinha PRIMEIRO e era um `updateMany` sem
  // condição: TODA aprovação pendente da solicitação virava `clientVisible`.
  // Só DEPOIS a escada de exposição decidia quais ENTREGAS podiam virar
  // "compartilhado". As duas metades andavam soltas, e o resultado é o que o CEO
  // encontrou em produção: departamento em SOMBRA tem a entrega retida (certo,
  // é o que "sombra" quer dizer) e mesmo assim o card de decisão dele ia para a
  // tela do cliente — título, subtítulo e três botões, sem uma linha de corpo.
  //
  // **A escada protegia o conteúdo e deixava passar o PEDIDO DE DECISÃO sobre
  // ele.** Pedir "aprove isto" escondendo o "isto" é pior do que não pedir: é o
  // mesmo erro de "sem gate = aprovado", com a assinatura do cliente em cima.
  //
  // Agora a escada corre primeiro e ela é quem define a lista: só o
  // departamento cuja entrega foi LIBERADA ganha card visível. O que ficou em
  // sombra fica calado dos dois lados — corpo e botão.
  const escada = await escadaFiltraEntregas({
    workspaceId: projeto.workspaceId,
    clientId: projeto.clientId,
    entregas: entregaveis.map((d) => ({ id: d.id, ownerAgentId: d.ownerAgentId })),
  });

  // Apresentar É o ato de publicação do contrato de visibilidade (Hub, Fase 1,
  // 2.2): as entregas nascem "interno" e só aqui viram "compartilhado". Sem
  // este carimbo, o portal (que agora filtra por `visibility`, fail-closed)
  // mostraria o card de aprovação sem o corpo da entrega.
  //
  // ── E A ESCADA DE EXPOSIÇÃO DECIDE QUAIS ────────────────────────────────────
  // Apresentar é o ato; a escada é quem tem direito de participar dele. Peça de
  // departamento em SOMBRA foi produzida, foi registrada e NÃO vira
  // "compartilhado" — é literalmente o que "sombra" quer dizer. Em ALLOWLIST,
  // vira só se este cliente estiver marcado. Em WIDE, vira sem atrito.
  //
  // O `updateMany` daqui era por `projectId` inteiro: uma única linha que
  // publicava tudo o que existisse. Agora publica por LISTA DE IDS, e o que
  // ficou de fora vira alarme com o caso concreto — "algo foi retido" sem dizer
  // o quê é ruído que ninguém investiga.
  if (escada.liberados.length > 0) {
    await prisma.deliverable.updateMany({
      where: { id: { in: escada.liberados } },
      data: { visibility: "compartilhado" },
    }).catch(() => { /* best-effort */ });
  }

  // A partir daqui o cliente enxerga as aprovações — todas juntas, não pingando.
  // Mas SÓ as dos departamentos cuja entrega a escada acabou de liberar.
  //
  // A lista de departamentos sai dos ids LIBERADOS, pelo mesmo
  // `departamentoDoAgente` que a escada usou — não por uma segunda tabela
  // escrita à mão aqui (foi exatamente uma segunda tabela dessas, de 3 linhas
  // para 14 especialistas, que cegou o corpo do card no portal).
  //
  // Fail-closed: nenhum departamento liberado ⇒ nenhum card publicado. O
  // projeto fica apresentado e sem pedir decisão, que é o estado honesto de
  // "produzimos, e ainda não é para o cliente ver".
  if (projeto.clientRequestId) {
    const liberados = new Set(entregaveis.map((d) => d.id));
    const deptsLiberados = [
      ...new Set(
        escada.liberados
          .filter((id) => liberados.has(id))
          .map((id) => departamentoDoAgente(entregaveis.find((d) => d.id === id)?.ownerAgentId))
          .filter((d): d is string => !!d),
      ),
    ];
    if (deptsLiberados.length > 0) {
      await prisma.approvalRequest.updateMany({
        where: {
          clientRequestId: projeto.clientRequestId,
          status: "pending",
          department: { in: deptsLiberados },
        },
        data: { clientVisible: true },
      }).catch(() => { /* best-effort: a apresentação não pode falhar por isto */ });
    }
  }
  if (escada.retidos.length > 0) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId,
        clientId: projeto.clientId,
        type: "escada_reteve_entrega",
        message: `${escada.retidos.length} entrega(s) NÃO foram compartilhadas com o cliente pela escada de exposição: ${escada.retidos.map((r) => `${r.id} (${r.departmentId ?? "sem departamento"}): ${r.motivo}`).join(" | ")}`.slice(0, 900),
      },
    }).catch(() => { /* best-effort */ });
  }

  // ── A FRASE SÓ AFIRMA A REVISÃO QUE EXISTIU ───────────────────────────────
  //
  // A mensagem dizia "revisei tudo antes de te mostrar" SEMPRE — inclusive
  // quando o pacote inteiro estava `quality_nao_auditado`, ou seja, quando a
  // casa sabia que nenhum árbitro tinha olhado. Afirmar ao cliente exatamente
  // a revisão que o próprio código se recusa a declarar é a pior forma da
  // mentira: ela é dita pela agência, por escrito, no portal dele.
  //
  // Só `quality_ok` conta como revisada — `!== "quality_flag"` seria o mesmo
  // bug com outra roupa. E o texto alternativo NÃO alarma: ele simplesmente
  // não afirma o que não houve. Quem precisa saber do buraco é o time, e para
  // isso existe o evento logo abaixo — não a mensagem ao cliente.
  const revisadas = entregaveis.filter((d) => d.revisionStatus === "quality_ok").length;
  const semArbitro = entregaveis.filter((d) => d.revisionStatus === "quality_nao_auditado");
  const tudoRevisado = revisadas === entregaveis.length;
  const quantas = entregaveis.length === 1 ? "a sua entrega" : `as suas ${entregaveis.length} entregas`;

  if (semArbitro.length > 0) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId, projectId, clientId: projeto.clientId,
        type: "apresentado_sem_auditoria",
        message: `${projeto.name}: ${semArbitro.length} de ${entregaveis.length} entrega(s) foram ao cliente SEM auditoria da Qualidade — ${semArbitro.map((d) => d.name).join("; ")}.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort: o registro não pode impedir a apresentação */ });
  }

  const linhas = [
    tudoRevisado
      ? `Terminamos! 🎉 Preparei ${quantas} e revisei tudo antes de te mostrar:`
      : `Terminamos! 🎉 Preparei ${quantas} para você ver:`,
    "",
    ...entregaveis.map((d) => `• ${d.name}`),
    "",
    "Está tudo na aba de aprovações. Dá uma olhada com calma e me diz o que acha — se quiser mudar alguma coisa, é só falar.",
  ];
  if (pendentes > 0) {
    linhas.push("", `Só uma observação: ainda faltam ${pendentes} material(is) seu(s) que pedi antes. Nada trava sua análise, mas vamos precisar deles para colocar tudo no ar.`);
  }

  // O pacote apresentado vira calendário na mesma hora. Nasce em rascunho: o
  // cliente vê as datas junto com as peças e aprova as duas coisas de uma vez.
  // Import dinâmico pelo mesmo motivo dos outros: publicacao.ts fala com a Meta.
  try {
    const { agendarPostsDaEntrega } = await import("@/lib/agency/esteira/publicacao");
    await agendarPostsDaEntrega(projectId);
  } catch { /* best-effort: o calendário não pode impedir a apresentação */ }

  const avisou = await falarComOCliente(projeto, linhas.join("\n"), "entrega");
  return { ok: true, avisouCliente: avisou };
}

/**
 * MARCO 3 — o cliente aprovou. Implementação e primeiro ciclo mensal.
 *
 * O ciclo é aberto aqui de propósito: é o instante exato em que a relação deixa
 * de ser um projeto com fim e vira operação contínua. Se dependesse de alguém
 * lembrar de abrir depois, a rotina simplesmente não começaria.
 */
export async function aprovarPacote(projectId: string): Promise<ResultadoDoMarco> {
  const projeto = await carregar(projectId);
  if (!projeto) return { ok: false, erro: "Projeto não encontrado" };
  if (projeto.clientApprovedAt) return { ok: true, erro: "já aprovado — nada mudou" };
  if (!projeto.presentedAt) return { ok: false, erro: "o pacote ainda não foi apresentado ao cliente" };

  // ── TRAVA, NÃO AVISO (CEO, 08/08/2026) ────────────────────────────────────
  //
  // Esconder o botão "Aprovar tudo" na tela é APARÊNCIA. `POST
  // /api/portal/esteira { decisao: "aprovar_pacote" }` é uma rota pública por
  // token: um link antigo, um F5 numa aba velha, um `curl` — qualquer um deles
  // chegaria aqui com a tela nova instalada e mesmo assim aprovaria o nada.
  //
  // E o estrago não é cosmético. Daqui para baixo esta função abre o ciclo,
  // carimba `clientApprovedAt` e chama `aprovarCalendario`, que é o ÚNICO
  // consentimento de publicação desta casa. Um pacote sem corpo aprovado às
  // cegas libera o calendário de um trabalho que ninguém viu.
  //
  // Então a recusa mora AQUI, no servidor, antes da primeira escrita — e ela é
  // total: nada muda de estado, nem o carimbo, nem o ciclo, nem o calendário.
  const { retratoDoPacote } = await import("@/lib/agency/esteira/pacote");
  const pacote = await retratoDoPacote(projectId);
  if (!pacote.pedeAprovacao) {
    return {
      ok: false,
      erro:
        "não há nenhuma entrega com material para aprovar — o pacote está em produção. " +
        (pacote.emProducao.length > 0
          ? `Ainda sem material: ${pacote.emProducao.map((i) => i.titulo).join(", ")}.`
          : "Nenhuma aprovação pendente visível ao cliente."),
    };
  }

  const agora = new Date();
  await prisma.project.update({
    where: { id: projectId },
    data: { clientApprovedAt: agora, stage: "implementation" },
  });

  // ── "APROVAR TUDO" APROVA O QUE ESTÁ PRONTO, NÃO O QUE ESTÁ PENDENTE ──────
  //
  // Antes era `status: "pending"` sem mais nada: no pacote MISTO — duas
  // entregas com material e uma ainda em produção — o clique carimbava as três.
  // A entrega sem corpo saía "aprovada pelo cliente" sem que ele jamais a
  // tivesse visto, e o histórico registrava a assinatura dele nisso.
  //
  // A lista vem do MESMO retrato que autorizou o botão, casada por id. O que
  // está em produção continua pendente e volta a pedir decisão quando ganhar
  // corpo — que é o comportamento que o cliente espera de "está em produção".
  const idsProntos = pacote.prontas.map((i) => i.id);
  if (idsProntos.length > 0) {
    await prisma.approvalRequest.updateMany({
      where: { id: { in: idsProntos }, status: "pending" },
      data: { status: "approved", reviewedBy: "cliente", reviewedAt: agora },
    }).catch(() => { /* best-effort */ });
  }

  const { abrirCiclo } = await import("@/lib/agency/esteira/ciclos");
  const ciclo = await abrirCiclo(projectId, agora);

  // O pacote inicial passa a pertencer ao ciclo 1. Sem este carimbo, o motor
  // olharia o ciclo recém-aberto, veria zero entregas e produziria tudo de novo
  // no minuto seguinte à aprovação — cobrando IA por trabalho já feito.
  if (ciclo) {
    await prisma.deliverable.updateMany({
      where: { projectId, cycleId: null },
      data: { cycleId: ciclo.id },
    }).catch(() => { /* best-effort */ });
    await prisma.cycle.update({
      where: { id: ciclo.id },
      data: { presentedAt: projeto.presentedAt ?? agora },
    }).catch(() => { /* best-effort */ });
  }

  // A aprovação do pacote É o consentimento para publicar. Só aqui o calendário
  // sai de rascunho — antes disto nenhum post desta casa vai ao ar.
  try {
    const { aprovarCalendario } = await import("@/lib/agency/esteira/publicacao");
    await aprovarCalendario(projectId);
  } catch { /* best-effort: a aprovação não pode falhar por causa do calendário */ }

  // Tráfego pago é o caso em que "automático" significa PREPARAR, não fazer: a
  // campanha nasce pausada e espera o cliente ligar. Dinheiro gasto não volta.
  try {
    const { prepararCampanha } = await import("@/lib/agency/esteira/trafego");
    await prepararCampanha(projectId);
  } catch { /* best-effort */ }

  const avisou = await falarComOCliente(
    projeto,
    "Aprovado! ✅ Vamos colocar tudo no ar. A partir de agora você acompanha por aqui: toda semana eu te trago o que foi publicado e como está performando.",
    "ciclo",
  );

  return { ok: true, avisouCliente: avisou };
}
