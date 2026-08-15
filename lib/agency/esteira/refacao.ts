// refacao.ts — O CLIENTE PEDIU MUDANÇA. É a hora mais perigosa da relação.
//
// O buraco: o portal tinha os três botões — aprovar, pedir revisão, reprovar —
// e SÓ o de proposta fazia alguma coisa. Quando a aprovação era de uma ENTREGA,
// o clique do cliente gravava um status no banco e acabava ali. Nada era
// refeito, ninguém era avisado, e do lado dele a tela dizia "revisão
// solicitada" para sempre. É a pior forma de falhar que existe: o cliente
// acredita que pediu, a agência não sabe que foi pedido, e o silêncio é lido
// como descaso.
//
// O que este arquivo garante: pedido de mudança do cliente é refeito na hora,
// COM AS PALAVRAS DELE na mão do especialista, e o cliente é avisado do que
// mudou. Sem gente no meio.
//
// O teto existe pelo motivo oposto do da Qualidade. Lá, o teto protege o
// dinheiro de IA. Aqui, o teto protege a RELAÇÃO: se o cliente pediu a mesma
// peça três vezes, o problema não é a peça — é um desentendimento sobre o que
// ele quer, e mais uma rodada de IA só aumenta a frustração dele. Na terceira,
// vira gente.
//
// ── 05/08/2026: o mesmo bug sobrevivia pelo OUTRO ramo ───────────────────────
// Tudo aqui dentro era ancorado SÓ em `clientRequestId`, e a rota do portal só
// chamava esta função quando o card tinha esse campo. Card de CLIENTE DIRETO
// (criado por /api/social-posts/aprovacao, que nasce só com `clientId` — o caso
// Foocci) caía fora do `if`: o cliente escrevia o que queria mudar, a peça virava
// "revision_requested", o comentário ficava gravado, e NADA acontecia. Não
// refazia, não escalava, não avisava. O portal dizia "Ajustes solicitados" para
// sempre — que é literalmente o defeito que este arquivo dizia ter consertado.
//
// A regra nova é a mesma que a conversa já adotou (`app/api/messages/conversa.ts`):
// o pedido pertence ao CLIENTE, não à solicitação. A leitura une as duas chaves,
// a escrita carimba as duas quando ambas são deriváveis, e nenhuma chave nula
// entra em filtro — `{ clientId: null }` casaria com todo registro órfão do
// banco, que é vazamento entre clientes.
//
// E o SILÊNCIO deixou de ser possível: quando não há projeto (cliente direto,
// posts sem entregável), esta função não devolve mais um objeto e vai embora —
// ela escala para a equipe e escreve no portal antes de retornar. Pedido de
// cliente que não chega a ninguém é a pior falha que esta casa conhece.

import { prisma } from "@/lib/db/client";
import { renderizarEntrega, ESQUEMA_DA_ENTREGA } from "@/lib/agency/esteira/renderizar-entrega";
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
import { generate } from "@/lib/ai/generate";
import { TODOS_OS_ESPECIALISTAS, conferirContrato } from "@/lib/agency/execution/especialistas";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";
import { preservarVersaoAtual, registrarNovaVersao } from "@/lib/agency/esteira/versoes";
import { lerProibicoes, registrarProibicoes } from "@/lib/agency/esteira/proibicoes";
import { revisionStatusDoVeredito } from "@/lib/agency/execution/quality-auditor";

/** Quantas vezes a máquina refaz por pedido do CLIENTE antes de virar gente. */
export const MAX_REFACOES_DO_CLIENTE = 2;

export interface RefacaoFeita {
  /** Entregas efetivamente refeitas, pelo nome. */
  refeitas: string[];
  /** Ids das `DeliverableVersion` recém-nascidas — a rodada nova de aprovação
   *  precisa registrar QUAL versão será decidida (Fase 2, T3/T7). */
  versoesNovas: string[];
  /** Virou assunto de gente — e por quê. */
  escalado: boolean;
  motivo?: string;
  avisouCliente: boolean;
}

/** Onde uma mensagem deste pedido é gravada. As DUAS chaves quando ambas são
 *  deriváveis — é o que mantém a conversa única por cliente. */
interface AncoraDoPedido {
  clientId: string | null;
  clientRequestId: string | null;
}

/**
 * Refaz o que o cliente pediu para mudar.
 *
 * `department` vem da `ApprovalRequest`: é a casa que produziu a peça. Refaz as
 * entregas daquele departamento no ciclo corrente — não o pacote inteiro. O
 * cliente que reclamou do texto do social não quer o logo dele redesenhado.
 *
 * Aceita as DUAS chaves de dono e exige pelo menos uma. `clientRequestId` é o
 * caminho do fluxo Brain; `clientId` é o do cliente criado direto, que não tem
 * solicitação nenhuma e até 05/08/2026 não era atendido por ninguém.
 */
export async function refazerPorPedidoDoCliente(input: {
  clientRequestId?: string | null;
  clientId?: string | null;
  department: string;
  comentario?: string;
}): Promise<RefacaoFeita> {
  const saida: RefacaoFeita = { refeitas: [], versoesNovas: [], escalado: false, avisouCliente: false };

  const clientRequestId = input.clientRequestId?.trim() || null;
  // O dono: quando só veio a solicitação, o cliente é derivado dela. Derivação,
  // nunca invenção — solicitação de prospect (sem cliente) fica com `null`, e
  // aí a âncora é só a solicitação mesmo.
  let clientId = input.clientId?.trim() || null;
  const req = clientRequestId
    ? await prisma.clientRequestDb.findUnique({
        where: { id: clientRequestId },
        select: { businessName: true, clientId: true },
      }).catch(() => null)
    : null;
  if (!clientId) clientId = req?.clientId ?? null;

  if (!clientRequestId && !clientId) {
    // Sem nenhuma das duas chaves não existe a quem responder nem onde escrever.
    // Devolver "escalado" sem escalar seria repetir o silêncio; aqui o retorno
    // é honesto e quem chama (a rota) registra o erro.
    return { ...saida, escalado: true, motivo: "pedido sem dono: nem clientRequestId nem clientId" };
  }

  const ancora: AncoraDoPedido = { clientId, clientRequestId };

  // ── A PROIBIÇÃO NASCE AQUI, e é aqui que ela mais nasce ──────────────────
  // O pedido de ajuste é onde o cliente escreve "não use mais essa palavra".
  // Registrar ANTES de montar a verdade faz a proibição valer já nesta refação
  // — registrar depois a faria valer só na próxima peça, que é exatamente a
  // demora que ele reclamou. Best-effort: registro não derruba refação.
  if (clientId && input.comentario?.trim()) {
    await registrarProibicoes(clientId, input.comentario, "ajuste");
  }

  // O projeto é procurado pelas DUAS chaves. Só por `clientRequestId`, todo
  // cliente direto caía em "projeto não encontrado" — e saía por uma porta que
  // não avisava ninguém.
  const chavesDoProjeto = [
    ...(clientRequestId ? [{ clientRequestId }] : []),
    ...(clientId ? [{ clientId }] : []),
  ];
  const projeto = await prisma.project.findFirst({
    where: { OR: chavesDoProjeto },
    select: {
      id: true, workspaceId: true, clientId: true, clientRequestId: true,
      client: { select: { name: true, phone: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // O cliente é lido mesmo sem projeto: é dele que sai o workspace onde a
  // escalação será registrada, e o nome do negócio da mensagem.
  const cliente = clientId
    ? await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true, workspaceId: true },
      }).catch(() => null)
    : null;

  const negocio = req?.businessName ?? projeto?.client?.name ?? cliente?.name ?? "o cliente";
  const workspaceId = projeto?.workspaceId ?? cliente?.workspaceId ?? null;
  const dono = {
    id: projeto?.id ?? null,
    workspaceId,
    clientId: projeto?.clientId ?? clientId,
  };

  const comentario = input.comentario?.trim();

  // ── SEM PROJETO: não há o que a máquina refaça — mas ALGUÉM precisa saber ──
  // É o caso do cliente direto cujas peças nasceram no calendário, sem
  // `Deliverable`. Antes, esta linha era um `return` mudo. Agora é o caminho
  // curto e completo: registra para a equipe e responde ao cliente.
  if (!projeto) {
    await escalar(dono, negocio,
      `pedido de mudança do cliente sem projeto correspondente (departamento "${input.department}") — ` +
      `as peças estão marcadas "em ajuste" no calendário e esperam alguém da equipe`,
      comentario ?? "(sem descrição)");
    const avisou = await escreverNoPortal(ancora, comentario
      ? "Recebi seu pedido de ajuste e já passei para a equipe olhar. Te retorno em breve com a mudança feita. 💛"
      : "Recebi seu pedido de ajuste! Só me conta em uma frase o que você quer diferente — assim a equipe já refaz certo. 💛");
    return { ...saida, escalado: true, avisouCliente: avisou, motivo: "projeto não encontrado" };
  }

  // Um pedido sem palavras é o caso mais comum e o mais perigoso: refazer no
  // escuro produz outra peça igualmente errada e queima uma das tentativas.
  // Perguntar é mais rápido e mais barato do que adivinhar.
  if (!comentario) {
    const avisou = await escreverNoPortal(ancora,
      "Recebi seu pedido de ajuste! Só me conta em uma frase o que você quer diferente — assim eu refaço já certo, sem te fazer pedir de novo. 💛");
    return { ...saida, escalado: false, avisouCliente: avisou, motivo: "pedido sem descrição — perguntei ao cliente" };
  }

  const cicloAtual = await prisma.cycle.findFirst({
    where: { projectId: projeto.id, status: { in: ["aberto", "entregue"] } },
    orderBy: { reference: "desc" },
    select: { id: true },
  }).catch(() => null);

  // Quais especialistas moram no departamento que o cliente apontou.
  const idsDoDepartamento = TODOS_OS_ESPECIALISTAS
    .filter((e) => e.departamentoId === input.department)
    .map((e) => e.id);

  const candidatas = await prisma.deliverable.findMany({
    where: {
      projectId: projeto.id,
      ...(cicloAtual ? { cycleId: cicloAtual.id } : {}),
      ...(idsDoDepartamento.length > 0 ? { ownerAgentId: { in: idsDoDepartamento } } : {}),
    },
    select: { id: true, name: true, content: true, ownerAgentId: true, version: true, clientFeedback: true, revisionStatus: true },
  });

  // ── A PEÇA REPROVADA PELA QUALIDADE NÃO ENTRA AQUI (6ª auditoria, 04/08/2026)
  //
  // Este caminho grava `quality_nao_auditado` por cima do estado anterior. Numa
  // peça `quality_flag` isso é ABSOLVIÇÃO: a ressalva some, e `apresentar`
  // (marcos.ts) — que só barra `quality_flag` — passa a mostrar ao cliente a
  // peça que a própria casa reprovou. E o gatilho é alcançável sem má-fé: o
  // card de aprovação é POR DEPARTAMENTO e fica visível mesmo sendo de ciclo
  // anterior, então um clique legítimo em "pedir revisão" levava a peça barrada
  // de carona.
  //
  // O argumento "aqui o árbitro é o cliente" não cobre esta peça: ela NUNCA foi
  // apresentada, logo o cliente não a viu e não pode arbitrar sobre ela. Peça
  // reprovada é assunto do `pacote-travado`, que refaz COM o parecer da
  // Qualidade na mão e REAUDITA antes de liberar.
  //
  // A exclusão é feita aqui, e não no `where`, de propósito: `revisionStatus` é
  // anulável, e `{ not: "quality_flag" }` depende da semântica de NULL do ORM
  // para não descartar silenciosamente toda peça sem status. Filtrar em memória
  // é decidível pela leitura — e ainda me deixa contar as barradas, que é o que
  // permite falar a verdade certa ao cliente logo abaixo.
  const barradas = candidatas.filter((d) => d.revisionStatus === "quality_flag");
  const alvos = candidatas.filter((d) => d.revisionStatus !== "quality_flag");

  if (alvos.length === 0) {
    // Duas ausências diferentes, duas frases diferentes. Dizer "não achei sua
    // entrega" quando a entrega EXISTE e está barrada é mentira — e das que o
    // cliente descobre sozinho no mês seguinte.
    const tudoBarrado = barradas.length > 0;
    const motivo = tudoBarrado
      ? "entrega do departamento está reprovada pela Qualidade — o pedido do cliente precisa entrar na refação dela"
      : "sem entrega correspondente";
    await escalar(
      dono, negocio,
      tudoBarrado
        ? `pedido de mudança do cliente sobre entrega BARRADA pela Qualidade (${barradas.map((d) => d.name).join(", ")}) — junte o que ele pediu à correção antes de apresentar`
        : `pedido de mudança do cliente sem entrega correspondente (departamento "${input.department}")`,
      comentario,
    );
    const avisou = await escreverNoPortal(ancora, tudoBarrado
      ? "Recebi seu pedido de ajuste! Essa entrega ainda está em revisão aqui com a equipe — vou juntar o que você pediu na versão nova e te aviso assim que ela ficar pronta. 💛"
      : "Recebi seu pedido de ajuste e já passei para a equipe olhar. Te retorno em breve com a mudança feita. 💛");
    return { ...saida, escalado: true, motivo, avisouCliente: avisou };
  }

  // Parcial: o cliente pediu ajuste num departamento onde ALGUMA peça está
  // barrada. As boas seguem refeitas abaixo; a barrada continua com a Qualidade,
  // mas o pedido dele não pode se perder no caminho — vira registro para gente.
  if (barradas.length > 0) {
    await escalar(dono, negocio,
      `o pedido do cliente também toca entrega(s) barrada(s) pela Qualidade (${barradas.map((d) => d.name).join(", ")}) — essas não foram refeitas por aqui`,
      comentario);
  }

  const verdade: VerdadeDoCliente = {
    businessName: negocio,
    telefones: [projeto.client?.phone].filter((v): v is string => !!v),
    emails: [projeto.client?.email].filter((v): v is string => !!v),
    servicos: [], valores: [],
    // Sem a verdade operacional lida do banco, o piso trata toda classe como
    // "não informada" e barra a refação que apenas repete o horário ou o canal
    // que o cliente já tinha contado. Fail-closed é o default certo; deixar de
    // ligar a fiação transforma isso em falso positivo.
    // A verdade operacional é lida pela solicitação — a do pedido, ou a que o
    // projeto carrega. Cliente direto não tem nenhuma das duas: aí a operação
    // fica `undefined` e o piso volta a ser fail-closed para essas classes, que
    // é o comportamento certo quando a verdade não existe para ser conferida.
    operacao:
      (clientRequestId ?? projeto.clientRequestId)
        ? (await buildVerdadeOperacional((clientRequestId ?? projeto.clientRequestId)!)) ?? undefined
        : undefined,
    // As PROIBIÇÕES valem com força extra aqui: a refação nasce de um pedido de
    // ajuste, e o pedido de ajuste é onde o cliente costuma dizer "nunca mais
    // use isso". Refazer violando de novo o que ele acabou de proibir é o pior
    // desfecho possível deste caminho. Ver `esteira/proibicoes.ts`.
    proibicoes: await lerProibicoes(projeto.clientId),
  };

  for (const entrega of alvos) {
    if (entrega.version > MAX_REFACOES_DO_CLIENTE) {
      saida.escalado = true;
      saida.motivo = `"${entrega.name}" já foi refeita ${entrega.version - 1}x a pedido do cliente`;
      continue;
    }

    const esp = TODOS_OS_ESPECIALISTAS.find((e) => e.id === entrega.ownerAgentId);
    const r = await generate({
      system:
        `Você é o especialista de ${esp?.label ?? "produção"} de uma agência de marketing brasileira. ` +
        "O CLIENTE — não a Qualidade, o cliente que paga — pediu mudança na sua entrega. " +
        "O pedido dele é a instrução final: atenda o que ele pediu, sem discutir e sem defender a versão anterior. " +
        "Mude o que ele apontou e preserve o resto — refazer do zero o que ele não reclamou faz o cliente sentir que perdeu o que já tinha aprovado. " +
        "Responda SOMENTE com JSON válido, no mesmo formato.",
      user: [
        `NEGÓCIO: ${negocio}`,
        `ENTREGA ATUAL — "${entrega.name}":`,
        entrega.content ?? "",
        "",
        `O QUE O CLIENTE PEDIU, com as palavras dele: "${comentario}"`,
        entrega.clientFeedback ? `\nELE JÁ TINHA PEDIDO ANTES: "${entrega.clientFeedback}" — não repita o erro anterior.` : "",
        "",
        'Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>" — nunca invente para preencher.',
        // `cenas` NÃO é opcional aqui, e a razão não é de formato: se o item
        // tinha telas e volta sem elas, `extrairPecas` lê `cenas=[]` e
        // `publicacao.ts:1046` REBAIXA o carrossel para feed. O cliente comprou
        // 5 telas e recebe uma imagem, sem ninguém ficar vermelho.
        ESQUEMA_DA_ENTREGA,
        "Se o item já tinha CENAS (telas de carrossel), devolva TODAS elas no mesmo formato numerado. Carrossel que volta sem telas deixa de ser carrossel.",
      ].join("\n"),
      maxTokens: 1800,
      workspaceId: projeto.workspaceId,
      preferredProvider: esp?.provedor ?? "claude",
      agentId: "esteira-refacao",
      clientId: projeto.clientId ?? null,
      projectId: projeto.id,
    });

    if (!r.ok) {
      // IA fora do ar não gasta tentativa — o problema não é a peça.
      saida.escalado = true;
      saida.motivo = "não consegui refazer agora (provedor de IA indisponível)";
      continue;
    }

    const dados = r.data as Record<string, unknown>;
    const corpo = renderizar(dados);
    if (corpo.length < 60) {
      saida.escalado = true;
      saida.motivo = "a refação saiu vazia";
      continue;
    }

    // ── O CONTRATO DE SAÍDA VALE AQUI TAMBÉM ────────────────────────────────
    //
    // Este caminho tinha o piso e NÃO tinha o contrato. A diferença aparece no
    // caso mais comum da refação: o cliente pede "muda só o gancho do primeiro"
    // e o modelo devolve UM item — os outros dois somem. O piso aprova (nada
    // foi inventado), o cliente pediu a mudança (não há árbitro), e a peça é
    // gravada com um terço do que ele comprou.
    //
    // "O cliente mandou" vale para o CONTEÚDO, não para a contagem: ninguém
    // pediu para receber menos. Encolheu, não grava — a versão que ele está
    // vendo continua de pé e o caso vira decisão de gente, com o motivo.
    const contrato = esp ? conferirContrato(esp, dados) : { cumpriu: true, violacoes: [] as string[] };
    if (!contrato.cumpriu) {
      saida.escalado = true;
      saida.motivo = `a refação saiu fora do formato contratado (${contrato.violacoes.join("; ")})`;
      continue;
    }

    // O piso vale igual: peça refeita a pedido do cliente vai direto ao cliente.
    const piso = conferirPisoDeVerdade(corpo, verdade);
    if (!piso.aprovado) {
      saida.escalado = true;
      saida.motivo = `a refação inventou dado: ${resumirViolacoes(piso.violacoes)}`;
      continue;
    }

    // A versão que o cliente estava vendo vira registro imutável ANTES da
    // sobrescrita — era exatamente aqui que a v1 sumia do mundo (Hub, Fase 1,
    // 1.9). `content` continua sendo gravado, mas agora como cache da corrente.
    await preservarVersaoAtual(entrega);

    await prisma.deliverable.update({
      where: { id: entrega.id },
      data: {
        name: typeof dados.title === "string" && dados.title.trim() ? dados.title : entrega.name,
        content: corpo,
        version: { increment: 1 },
        // ── NINGUÉM DA QUALIDADE OLHOU ESTA VERSÃO — e é assim que fica escrito.
        //
        // Até 04/08/2026 gravávamos `quality_ok` aqui. Era mentira de estado:
        // a peça passou pelo piso determinístico (acima) e por mais nada. Piso
        // é chão, não é parecer — ele barra dado inventado, não julga tom,
        // promessa ou aderência ao briefing.
        //
        // Por que NÃO chamamos o auditor aqui, ao contrário do relatório mensal
        // e do pacote reprovado: neste caminho o árbitro é o CLIENTE. Ele pediu
        // a mudança com as palavras dele, e logo abaixo a aprovação volta a
        // ficar PENDENTE para ele decidir a versão nova. Um auditor que
        // reprovasse o que o cliente pediu explicitamente colocaria a máquina
        // contra o dono do briefing — e o briefing do cliente manda. O que
        // devíamos ao sistema não era um juiz a mais; era parar de afirmar um
        // veredito que não existe.
        revisionStatus: revisionStatusDoVeredito("nao_auditado"),
        clientFeedback: comentario.slice(0, 500),
        lastFeedback: `Refeita a pedido do cliente: ${comentario}`.slice(0, 500),
      },
    });

    const novaVersao = await registrarNovaVersao({
      deliverableId: entrega.id,
      number: entrega.version + 1,
      content: corpo,
      createdBy: entrega.ownerAgentId,
      note: `Refeita a pedido do cliente: "${comentario.slice(0, 300)}"`,
    });
    if (novaVersao) saida.versoesNovas.push(novaVersao.id);
    saida.refeitas.push(entrega.name);
  }

  if (saida.refeitas.length > 0) {
    // A aprovação volta a ficar pendente: a peça mudou, e o "sim" anterior não
    // vale para uma versão que o cliente ainda não viu. A rodada nova aponta
    // para a versão recém-nascida — quando a refação produziu UMA versão; com
    // várias entregas no mesmo departamento o vínculo 1:1 não é decidível aqui
    // (o card de aprovação é por departamento) e fica nulo, que é o estado
    // honesto: sem vínculo, o portal não mostra corpo (regra anti-A2).
    // Posse pelas DUAS chaves, com a MESMA guarda da conversa: só entra chave
    // com valor. `{ clientId: null }` casaria com toda aprovação órfã do banco
    // e reabriria card de outro cliente — vazamento, não conserto.
    await prisma.approvalRequest.updateMany({
      where: {
        OR: [
          ...(clientRequestId ? [{ clientRequestId }] : []),
          ...(clientId ? [{ clientId }] : []),
        ],
        department: input.department,
      },
      data: {
        status: "pending", clientVisible: true, reviewedAt: null, reviewedBy: null,
        // Dúvida aberta era sobre a versão anterior; a rodada nova zera o relógio.
        questionOpenedAt: null,
        deliverableVersionId: saida.versoesNovas.length === 1 ? saida.versoesNovas[0] : null,
      },
    }).catch(() => { /* best-effort */ });

    saida.avisouCliente = await escreverNoPortal(ancora, [
      "Refiz o que você pediu! ✏️",
      "",
      ...saida.refeitas.map((n) => `• ${n}`),
      "",
      `Ajustei com base no que você falou: "${comentario.slice(0, 200)}"`,
      "Dá uma olhada na aba de aprovações e me diz se ficou como você queria.",
    ].join("\n"));
  }

  if (saida.escalado) {
    await escalar(dono, negocio, saida.motivo ?? "refação não concluída", comentario);
    if (saida.refeitas.length === 0) {
      saida.avisouCliente = await escreverNoPortal(ancora,
        "Recebi seu pedido e já estou olhando com atenção. Te retorno em breve com o ajuste. 💛");
    }
  }

  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

/**
 * Escreve no portal carimbando as DUAS chaves quando ambas existem — a regra de
 * `app/api/messages/conversa.ts`: a conversa pertence ao cliente, e a leitura
 * une `clientId` com as solicitações dele. Carimbar só uma partia o histórico
 * do cliente que ganha (ou troca de) solicitação depois.
 */
async function escreverNoPortal(ancora: AncoraDoPedido, corpo: string): Promise<boolean> {
  if (!ancora.clientId && !ancora.clientRequestId) return false;
  try {
    await prisma.portalMessage.create({
      data: {
        ...(ancora.clientRequestId ? { clientRequestId: ancora.clientRequestId } : {}),
        ...(ancora.clientId ? { clientId: ancora.clientId } : {}),
        authorRole: "team", authorName: "Gerente de projeto", body: corpo, readByTeam: true,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Manda o pedido para gente.
 *
 * `workspaceId` pode faltar (cliente sem workspace legível): sem ele o
 * `ActivityEvent` nem existe no modelo. Nesse caso o log do servidor é o último
 * recurso — mas ele GRITA, porque o pedido de um cliente pagante acabou de
 * ficar sem destinatário e alguém tem que descobrir isso hoje, não no mês que vem.
 */
async function escalar(
  dono: { id: string | null; workspaceId: string | null; clientId: string | null },
  negocio: string,
  motivo: string,
  comentario: string,
): Promise<void> {
  const mensagem =
    `${negocio} pediu mudança e a máquina não resolveu: ${motivo}. O que ele pediu: "${comentario}"`.slice(0, 900);
  if (!dono.workspaceId) {
    console.error("[refacao] PEDIDO DE CLIENTE SEM DESTINATÁRIO (sem workspace):", mensagem);
    return;
  }
  await prisma.activityEvent.create({
    data: {
      workspaceId: dono.workspaceId,
      ...(dono.id ? { projectId: dono.id } : {}),
      clientId: dono.clientId,
      type: "refacao_escalada",
      message: mensagem,
    },
  }).catch(() => { /* best-effort */ });
}

/** O markdown que o cliente lê. Era uma CÓPIA que se declarava "mesmo
 *  formato de texto que o motor usa" e NÃO era: faltava a linha
 *  `["cenas","Cenas"]`, e sem ela o carrossel refeito perdia as telas,
 *  `extrairPecas` lia `cenas=[]` e `publicacao.ts:1046` rebaixava a peça
 *  para feed. Comentário dizendo "igual ao motor" não é mecanismo; import é. */
const renderizar = renderizarEntrega;
