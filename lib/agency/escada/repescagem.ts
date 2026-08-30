// A REPESCAGEM — o que a escada reteve ONTEM não sai sozinho quando ela abre.
//
// ─── O DEFEITO, E ELE QUASE PASSOU ───────────────────────────────────────────
//
// `escadaFiltraEntregas` roda em UM instante só: o ato de apresentar
// (`marcos.apresentar`, `mes.apresentarCiclo`). E os dois recusam repetição —
// `if (projeto.presentedAt) return { ok: true, erro: "já apresentado" }`. Isso
// está certo: apresentar duas vezes avisa o cliente duas vezes.
//
// A consequência não estava: **a entrega retida por um degrau fechado fica
// `interno` PARA SEMPRE.** Abrir a escada depois não a alcança — não existe
// caminho no repositório que volte a olhá-la. Foi exatamente o estado das peças
// do CityJobs: produzidas, com molde, no banco, e invisíveis.
//
// Soltar a escada sem esta função seria decoração: o degrau mudaria de valor e
// nada chegaria ao cliente. *Sem gate = reprovado* vale nos dois sentidos — um
// portão que abre e não deixa passar o legítimo é tão inútil quanto um que não
// fecha.
//
// ─── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não reapresenta.** Não mexe em `presentedAt`, não manda aviso, não fala
//     com o cliente. Ela reavalia VISIBILIDADE, e só.
//   • **Não passa por cima da Qualidade.** Entrega com `quality_flag` fica
//     retida — é a mesma recusa que `apresentar` faz, e um caminho lateral que
//     a ignorasse seria a porta dos fundos do portão de qualidade.
//   • **Não antecipa ciclo.** Só olha o que já FOI apresentado: entrega do
//     pacote inicial num projeto com `presentedAt`, ou entrega de um ciclo com
//     `presentedAt`. O que ainda não teve seu ato de apresentação continua
//     esperando por ele.
//   • **Não reimplementa a régra.** Quem decide é `escadaFiltraEntregas`, a
//     MESMA função dos dois atos de apresentar. Duas cópias da regra divergem —
//     é o defeito que já cegou o corpo do card no portal.
//   • **Não publica nada em plataforma nenhuma.** Visibilidade no portal é o
//     card de aprovação do cliente; publicar continua sendo clique dele.

import { prisma } from "@/lib/db/client";
import { escadaFiltraEntregas } from "./registro";
import { departamentoDoAgente } from "./degraus";

export interface ResultadoDaRepescagem {
  /** Entregas que estavam retidas e passaram a ser visíveis ao cliente. */
  liberadas: number;
  /** Continuam retidas — com o motivo concreto de cada uma. */
  aindaRetidas: Array<{ id: string; motivo: string }>;
  /** Projetos tocados. */
  projetos: number;
  avisos: string[];
}

/** Teto por passada: repescagem é conserto, não migração em massa. */
const MAX_POR_RODADA = 200;

/**
 * Reavalia as entregas `interno` que JÁ passaram pelo ato de apresentar.
 *
 * Idempotente por construção: uma entrega liberada vira `compartilhado` e some
 * do universo desta consulta. Numa casa em dia, ela lê zero linha e escreve
 * nada.
 *
 * NUNCA lança — roda dentro do relógio da agência.
 */
export async function repescarEntregasRetidas(): Promise<ResultadoDaRepescagem> {
  const r: ResultadoDaRepescagem = { liberadas: 0, aindaRetidas: [], projetos: 0, avisos: [] };

  type Candidata = {
    id: string; ownerAgentId: string | null; revisionStatus: string | null; cycleId: string | null;
    project: { id: string; workspaceId: string; clientId: string; clientRequestId: string | null; presentedAt: Date | null };
  };
  let candidatas: Candidata[];
  try {
    // ⚠️ `Deliverable` NÃO tem relação com `Cycle` — só o `cycleId` solto. Por
    // isso a apresentação do ciclo é resolvida numa SEGUNDA consulta, e não num
    // `where` aninhado que não existe no schema.
    const retidas: Candidata[] = await prisma.deliverable.findMany({
      where: {
        visibility: "interno",
        // A entrega com ressalva da Qualidade NÃO é candidata. Está na consulta,
        // e não num filtro depois, para que nenhuma refatoração futura a
        // "esqueça" no caminho.
        NOT: { revisionStatus: "quality_flag" },
      },
      take: MAX_POR_RODADA,
      select: {
        id: true, ownerAgentId: true, revisionStatus: true, cycleId: true,
        project: { select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true } },
      },
    });

    const idsDeCiclo = [...new Set(retidas.map((d) => d.cycleId).filter((x): x is string => !!x))];
    const ciclosApresentados = new Set<string>();
    if (idsDeCiclo.length > 0) {
      const ciclos = await prisma.cycle.findMany({
        where: { id: { in: idsDeCiclo }, presentedAt: { not: null } },
        select: { id: true },
      });
      for (const c of ciclos) ciclosApresentados.add(c.id);
    }

    // O ato de apresentação TEM que ter acontecido. Sem esta linha, a repescagem
    // adiantaria entrega de um ciclo que ainda nem foi mostrado — mostrar peça
    // fora do pacote é o defeito que a apresentação existe para não cometer.
    candidatas = retidas.filter((d) =>
      d.cycleId ? ciclosApresentados.has(d.cycleId) : d.project.presentedAt !== null,
    );
  } catch (e) {
    r.avisos.push(`não consegui ler as entregas retidas: ${e instanceof Error ? e.message : "erro"}`);
    return r;
  }
  if (candidatas.length === 0) return r;

  // Agrupa por projeto: a escada decide por (workspace, cliente), e uma consulta
  // por entrega seria uma rajada de leituras do banco para a mesma resposta.
  const porProjeto = new Map<string, Candidata[]>();
  for (const d of candidatas) {
    if (!porProjeto.has(d.project.id)) porProjeto.set(d.project.id, []);
    porProjeto.get(d.project.id)!.push(d);
  }

  for (const [projectId, entregas] of porProjeto) {
    const projeto = entregas[0].project;
    try {
      const escada = await escadaFiltraEntregas({
        workspaceId: projeto.workspaceId,
        clientId: projeto.clientId,
        entregas: entregas.map((d) => ({ id: d.id, ownerAgentId: d.ownerAgentId })),
      });
      for (const x of escada.retidos) r.aindaRetidas.push({ id: x.id, motivo: x.motivo });
      if (escada.liberados.length === 0) continue;

      await prisma.deliverable.updateMany({
        where: { id: { in: escada.liberados } },
        data: { visibility: "compartilhado" },
      });
      r.liberadas += escada.liberados.length;
      r.projetos++;

      // O CARD DE DECISÃO vai junto — e pela MESMA regra de `apresentar`.
      // Liberar o corpo e deixar o pedido de aprovação escondido é a metade
      // inútil: o cliente veria a peça e não teria como aprová-la. (O inverso,
      // que é o perigoso, já tem trava lá: card sem corpo não sai.)
      if (projeto.clientRequestId) {
        const depts = [...new Set(
          escada.liberados
            .map((id) => departamentoDoAgente(entregas.find((d) => d.id === id)?.ownerAgentId))
            .filter((d): d is string => !!d),
        )];
        if (depts.length > 0) {
          await prisma.approvalRequest.updateMany({
            where: { clientRequestId: projeto.clientRequestId, status: "pending", department: { in: depts } },
            data: { clientVisible: true },
          }).catch(() => { /* best-effort: a repescagem não pode falhar por isto */ });
        }
      }

      // ── O CALENDÁRIO VEM JUNTO (13/08/2026) ──────────────────────────────
      //
      // `agendarPostsDaEntrega` passou a recusar entrega que a escada não
      // liberou (`publicacao.ts`, `motivoParaNaoVirarCalendario`) — que é o
      // conserto do furo pelo qual peça retida virava post compartilhado. Sem
      // esta chamada, o conserto criaria o defeito simétrico: a entrega
      // liberada DEPOIS da apresentação nunca viraria calendário, porque o
      // único gatilho de agendamento é o ato de apresentar, e ele não repete.
      //
      // É o próprio argumento do cabeçalho deste arquivo — *"um portão que abre
      // e não deixa passar o legítimo é tão inútil quanto um que não fecha"*.
      //
      // Isto NÃO viola o contrato declarado lá em cima ("não publica nada"): o
      // post nasce `draft`, e `draft → scheduled` continua exigindo o aval do
      // cliente. Idempotente por `deliverableId`, então repetir é no-op; e
      // best-effort, porque calendário que falha não pode desfazer a liberação
      // que já foi gravada.
      try {
        const { agendarPostsDaEntrega } = await import("@/lib/agency/esteira/publicacao");
        await agendarPostsDaEntrega(projectId);
      } catch (e) {
        r.avisos.push(`projeto ${projectId}: entregas liberadas, mas o calendário não foi montado (${e instanceof Error ? e.message : "erro"})`);
      }

      // O rastro fica no projeto: quem abrir o histórico entende por que uma
      // entrega apareceu no portal dias depois de apresentada.
      await prisma.activityEvent.create({
        data: {
          workspaceId: projeto.workspaceId,
          projectId,
          clientId: projeto.clientId,
          type: "escada_repescou_entrega",
          message: `${escada.liberados.length} entrega(s) que a escada tinha retido passaram a ser visíveis ao cliente — o degrau do departamento abriu depois da apresentação. Nenhuma reapresentação, nenhum aviso novo, nada publicado.`.slice(0, 900),
        },
      }).catch(() => { /* best-effort */ });
    } catch (e) {
      r.avisos.push(`projeto ${projectId}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  return r;
}

// ═════════════════════════════════════════════════════════════════════════════
// A OUTRA METADE: O PEDIDO RETIDO PELA ESCADA TAMBÉM VOLTA SOZINHO (25/08/2026)
// ═════════════════════════════════════════════════════════════════════════════
//
// `repescarEntregasRetidas`, acima, conserta a ENTREGA que ficou `interno`. Ela
// nunca alcançou o outro caso, e o outro caso é o que doeu em produção:
//
//   17:02:12 — a escada reteve a peça do balcão e o PEDIDO parou em
//              `precisa_decisao` (`producao-de-pedido.ts`, o bloco da escada);
//   17:03:16 — 64 segundos depois, o relógio aplicou `DECISOES_DO_DONO` e
//              incluiu a mesma cliente na lista.
//
// A entrega nem existia para ser repescada — a produção parou ANTES de criar o
// `Deliverable`. O pedido ficou em `precisa_decisao`, que é um estado que só
// gente tira. Foi preciso retriá-lo à mão: um dos dois empurrões manuais que
// ainda sobravam, e a meta é zero.
//
// ── COMO ELA VOLTA, E POR QUE NÃO É UM RELÓGIO NOVO ────────────────────────
//
// Esta casa perdeu dez dias com um cron próprio que morreu em silêncio com o
// painel verde. Então não há cron aqui: esta função é uma perna do despertador
// que já bate a cada 5 minutos, chamada colada na repescagem de entregas —
// que é chamada colada na aplicação da decisão do dono. A ordem é a garantia:
// na MESMA rodada em que o degrau abre, o pedido é rearmado.
//
// ── E POR QUE ELA NÃO REPRODUZ A PEÇA ──────────────────────────────────────
//
// Rearmar é devolver o pedido a `triado`, e `triado` custa uma produção de IA
// inteira na rodada seguinte. Por isso ela NÃO rearma "para ver se agora vai":
// ela pergunta ao portão — `escadaFiltraEntregas`, a MESMA função que reteve —
// se a peça passaria AGORA. Enquanto o degrau estiver fechado, esta perna lê e
// não escreve nada, e não queima um token.
//
// ── O QUE ELA NÃO FAZ ──────────────────────────────────────────────────────
//
//   • **Não toca em pedido parado por outro motivo.** Só o que tem
//     `escadaRetidaEm` gravado. Qualidade reprovou, piso de verdade barrou,
//     tarefa sem especialista: continuam esperando gente, como devem.
//   • **Não reimplementa a régua.** Quem decide é `escadaFiltraEntregas`.
//   • **Não fala com ninguém.** Não manda mensagem, não publica, não
//     reapresenta. Devolve o pedido à fila e sai.
//   • **Não tenta para sempre.** Ver o freio abaixo.

/**
 * O FREIO. Todo conserto precisa do seu.
 *
 * Três, e o número tem motivo — não é "um número pequeno qualquer":
 *
 *   • O caso que esta função existe para resolver se fecha na PRIMEIRA volta:
 *     o relógio aplica a decisão do dono e, na mesma rodada, esta perna rearma.
 *     Uma tentativa já bastaria para o defeito medido.
 *   • A segunda e a terceira existem para o degrau que abre e fecha (alguém
 *     usou `descerDegrau` no meio, uma corrida entre rodadas). Custam, no pior
 *     caso, duas produções de IA a mais — teto conhecido e barato.
 *   • Da quarta em diante, "o degrau ia abrir a qualquer momento" deixou de ser
 *     uma explicação: o que segura o pedido é estrutural (falta evidência,
 *     falta decisão declarada), e isso é trabalho de gente. Continuar tentando
 *     seria queimar IA para chegar sempre na mesma parede — o laço caro que o
 *     contador de `productionAttempts` já existe para não repetir.
 *
 * Deliberadamente MENOR que `MAX_TENTATIVAS_DE_PRODUCAO` (5, em
 * `producao-de-pedido.ts`): lá o que
 * falha é o mundo (rede, provedor), que volta sozinho; aqui o que falha é uma
 * decisão da casa, que não volta sozinha depois da terceira vez.
 */
export const MAX_REPESCAGENS_DO_PEDIDO = 3;

/** Teto por passada: repescagem é conserto, não migração em massa. */
const MAX_PEDIDOS_POR_RODADA = 100;

export interface ResultadoDaRepescagemDePedidos {
  /** Pedidos que voltaram para a fila de produção. */
  rearmados: number;
  /** O degrau continua fechado — não é falha, é a escada funcionando. */
  aindaRetidos: Array<{ id: string; motivo: string }>;
  /**
   * PARADA DECLARADA: esgotou o teto. Cada linha tem motivo, dono e próxima
   * ação — nunca "não deu certo".
   */
  desistidos: Array<{ id: string; motivo: string }>;
  avisos: string[];
}

/**
 * Rearma os pedidos que a escada reteve e que a escada já não retém.
 *
 * Idempotente: o pedido rearmado sai de `precisa_decisao` e some do universo
 * desta consulta. Numa casa em dia, lê zero linha e escreve nada.
 *
 * NUNCA lança — roda dentro do relógio da agência.
 */
export async function repescarPedidosRetidosPelaEscada(): Promise<ResultadoDaRepescagemDePedidos> {
  const r: ResultadoDaRepescagemDePedidos = { rearmados: 0, aindaRetidos: [], desistidos: [], avisos: [] };

  type Retido = {
    id: string; clientId: string; taskId: string | null; projectId: string | null;
    escadaRepescagens: number;
  };
  let retidos: Retido[];
  // ⚠️ `ContentRequest` NÃO tem relação com `Project` — só o `projectId` solto
  // (ponteiro sem FK, declarado no schema). Por isso o projeto vem numa SEGUNDA
  // consulta, e não num `select` aninhado que o schema não tem.
  const projetos = new Map<string, { id: string; workspaceId: string; clientId: string }>();
  try {
    retidos = await prisma.contentRequest.findMany({
      where: {
        // O carimbo, e não o texto do motivo: `declineReason` é frase para o
        // cliente ler, e casar defeito por substring quebra na primeira vez que
        // alguém melhora a frase.
        escadaRetidaEm: { not: null },
        status: "precisa_decisao",
      },
      take: MAX_PEDIDOS_POR_RODADA,
      select: { id: true, clientId: true, taskId: true, projectId: true, escadaRepescagens: true },
    });
    const ids = [...new Set(retidos.map((x) => x.projectId).filter((x): x is string => !!x))];
    if (ids.length > 0) {
      const achados = await prisma.project.findMany({
        where: { id: { in: ids } },
        select: { id: true, workspaceId: true, clientId: true },
      });
      for (const pr of achados) projetos.set(pr.id, pr);
    }
  } catch (e) {
    r.avisos.push(`não consegui ler os pedidos retidos pela escada: ${e instanceof Error ? e.message : "erro"}`);
    return r;
  }
  if (retidos.length === 0) return r;

  for (const pedido of retidos) {
    try {
      const projeto = pedido.projectId ? projetos.get(pedido.projectId) ?? null : null;
      if (!projeto) {
        r.avisos.push(`pedido ${pedido.id}: carimbado pela escada e sem projeto — não sei por qual workspace perguntar`);
        continue;
      }

      // ── O TETO, CONFERIDO ANTES DE QUALQUER LEITURA CARA ─────────────────
      if (pedido.escadaRepescagens >= MAX_REPESCAGENS_DO_PEDIDO) {
        const motivo =
          `pedido ${pedido.id}: a escada já o reteve depois de ${MAX_REPESCAGENS_DO_PEDIDO} rearmes — PAREI de tentar. ` +
          "Motivo: o degrau do departamento não abre sozinho (falta evidência ou falta decisão do dono declarada). " +
          "Dono: a equipe da agência. Próxima ação: subir o degrau pela porta certa " +
          "(`POST /api/agency/escada`, ação `liberar_cliente` ou `subir`, que exigem a evidência) " +
          "ou declarar a decisão do dono em `DECISOES_DO_DONO`. O pedido segue visível em `precisa_decisao`.";
        r.desistidos.push({ id: pedido.id, motivo });
        continue;
      }

      // QUEM produziria. É a mesma derivação da produção (`Task.agentId`), e
      // não um palpite: sem o executor, a escada não sabe de que departamento
      // é a peça, e "não sei" é fail-closed.
      const tarefa = pedido.taskId
        ? await prisma.task.findUnique({ where: { id: pedido.taskId }, select: { agentId: true } })
        : null;
      if (!tarefa?.agentId) {
        r.avisos.push(`pedido ${pedido.id}: carimbado pela escada e sem tarefa com especialista — a repescagem não adivinha o departamento`);
        continue;
      }

      // ── A PERGUNTA, AO MESMO PORTÃO QUE RETEVE ───────────────────────────
      // Nada de reimplementar a regra aqui: duas cópias divergem, e foi
      // exatamente uma divergência dessas que produziu este defeito.
      const escada = await escadaFiltraEntregas({
        workspaceId: projeto.workspaceId,
        clientId: pedido.clientId ?? projeto.clientId ?? null,
        entregas: [{ id: pedido.id, ownerAgentId: tarefa.agentId }],
      });
      if (escada.liberados.length === 0) {
        // NÃO é falha e NÃO consome tentativa: o degrau continua fechado, e a
        // escada segurando peça é a escada funcionando. Consumir tentativa aqui
        // esgotaria o teto sem nunca ter produzido nada.
        r.aindaRetidos.push({ id: pedido.id, motivo: escada.retidos[0]?.motivo ?? "retido pela escada" });
        continue;
      }

      // ── O REARME ─────────────────────────────────────────────────────────
      // `triado` é de onde o despertador pega em até 5 minutos. Não se produz
      // nada aqui dentro: esta perna roda no relógio, e produzir IA em linha
      // dentro dela seria uma rodada que estoura o tempo por causa do conserto.
      //
      // O `updateMany` com o status no `where` é a trava: se alguém tirou o
      // pedido de `precisa_decisao` entre a leitura e agora, não há o que
      // rearmar, e a contagem não sobe.
      const tomou = await prisma.contentRequest.updateMany({
        where: { id: pedido.id, status: "precisa_decisao" },
        data: {
          status: "triado",
          escadaRetidaEm: null,
          escadaRepescagens: pedido.escadaRepescagens + 1,
          declineReason: null,
        },
      });
      if (tomou.count === 0) continue;
      r.rearmados++;

      // O rastro, para que ninguém precise adivinhar por que um pedido saiu de
      // `precisa_decisao` sem gente ter tocado nele.
      await prisma.activityEvent.create({
        data: {
          workspaceId: projeto.workspaceId,
          projectId: projeto.id,
          clientId: pedido.clientId,
          type: "escada_repescou_pedido",
          message: (
            `O degrau que tinha retido este pedido abriu. Ele voltou sozinho para a fila de produção ` +
            `(rearme ${pedido.escadaRepescagens + 1} de ${MAX_REPESCAGENS_DO_PEDIDO}). ` +
            `Nenhum aviso novo ao cliente, nada publicado.`
          ).slice(0, 900),
        },
      }).catch(() => { /* best-effort: o rastro não pode desfazer o rearme */ });
    } catch (e) {
      r.avisos.push(`pedido ${pedido.id}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  return r;
}
