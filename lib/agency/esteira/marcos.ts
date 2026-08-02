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
async function falarComOCliente(
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
    select: { id: true, name: true, revisionStatus: true },
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

  // A partir daqui o cliente enxerga as aprovações — todas juntas, não pingando.
  if (projeto.clientRequestId) {
    await prisma.approvalRequest.updateMany({
      where: { clientRequestId: projeto.clientRequestId, status: "pending" },
      data: { clientVisible: true },
    }).catch(() => { /* best-effort: a apresentação não pode falhar por isto */ });
  }

  const linhas = [
    `Terminamos! 🎉 Preparei ${entregaveis.length === 1 ? "a sua entrega" : `as suas ${entregaveis.length} entregas`} e revisei tudo antes de te mostrar:`,
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

  const agora = new Date();
  await prisma.project.update({
    where: { id: projectId },
    data: { clientApprovedAt: agora, stage: "implementation" },
  });

  if (projeto.clientRequestId) {
    await prisma.approvalRequest.updateMany({
      where: { clientRequestId: projeto.clientRequestId, status: "pending" },
      data: { status: "approved", reviewedBy: "cliente", reviewedAt: agora },
    }).catch(() => { /* best-effort */ });
  }

  const { abrirCiclo } = await import("@/lib/agency/esteira/ciclos");
  await abrirCiclo(projectId, agora);

  // A aprovação do pacote É o consentimento para publicar. Só aqui o calendário
  // sai de rascunho — antes disto nenhum post desta casa vai ao ar.
  try {
    const { aprovarCalendario } = await import("@/lib/agency/esteira/publicacao");
    await aprovarCalendario(projectId);
  } catch { /* best-effort: a aprovação não pode falhar por causa do calendário */ }

  const avisou = await falarComOCliente(
    projeto,
    "Aprovado! ✅ Vamos colocar tudo no ar. A partir de agora você acompanha por aqui: toda semana eu te trago o que foi publicado e como está performando.",
    "ciclo",
  );

  return { ok: true, avisouCliente: avisou };
}
