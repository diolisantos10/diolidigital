// reverter-aprovacao-do-pacote.ts — DESFAZER O CLIQUE QUE NINGUÉM QUIS DAR.
//
// ─── O QUE ACONTECEU (15/08/2026) ───────────────────────────────────────────
//
// O CEO abriu o portal da CityJobs procurando os criativos, viu um botão escrito
// "Aprovar as entregas prontas" e apertou. Ele não queria aprovar — queria ver.
// `POST /api/portal/esteira {decisao:"aprovar_pacote"}` chamou
// `marcos.aprovarPacote`, que gravou duas coisas:
//
//   • `Project.clientApprovedAt` — o carimbo de "o cliente aprovou o pacote";
//   • os `ApprovalRequest` prontos daquela solicitação viraram
//     `status:"approved"`, `reviewedBy:"cliente"`, `reviewedAt:<agora>`.
//
// Ele pediu para cancelar. Este módulo é o cancelamento.
//
// ─── REVERTE SÓ O QUE AQUELE CLIQUE FEZ ─────────────────────────────────────
//
// É a única coisa que importa aqui, e por isso o alvo é definido por DUAS
// coordenadas que têm de bater juntas:
//
//   1. **A grafia.** Só `reviewedBy` exatamente `"cliente"` — a string seca que
//      só `aprovarPacote` gravava, e que deixou de ser gravável no mesmo dia
//      (`autoria-da-aprovacao.ts`). Aprovação de verdade do cliente é
//      `client:<nome>` e **nunca é tocada**; carimbo de equipe é `equipe:<email>`
//      e **também não**.
//   2. **A janela.** `reviewedAt` tem de coincidir com o `clientApprovedAt` do
//      projeto — `aprovarPacote` usa o MESMO `Date` nos dois lugares, então eles
//      são iguais ao milissegundo. A tolerância existe só para sobreviver a um
//      refactor futuro, não para pescar.
//
// Uma coordenada sozinha não basta e as duas juntas são estreitas de propósito:
// desfazer demais é pior do que não desfazer, porque apaga a assinatura de
// alguém que assinou de verdade.
//
// ─── MOSTRA ANTES DE GRAVAR ─────────────────────────────────────────────────
//
// Leitura pura por padrão. Sem `aplicar`, ele lista item por item o que
// mudaria — e lista também o que ele **se recusa** a tocar, com o motivo. Um
// "desfazer" que só diz quantas linhas mudou é o mesmo tipo de botão que criou
// este problema.
//
// ─── DEIXA RASTRO ───────────────────────────────────────────────────────────
//
// A reversão grava um `ActivityEvent` com AUTOR e MOTIVO. Desfazer sem rastro é
// pior que não desfazer: o histórico passaria a dizer que a aprovação nunca
// existiu, e a próxima pessoa que investigasse por que a peça voltou a pedir
// decisão não teria como saber.
//
// ─── O QUE ELE NÃO DESFAZ, E DIZ QUE NÃO DESFAZ ─────────────────────────────
//
// `aprovarPacote` também abriu o ciclo mensal, carimbou `cycleId` nas entregas e
// chamou `aprovarCalendario` (que promove peça `draft`/`approved` a `scheduled`).
// Nada disso é revertido aqui, e o relatório diz isso com todas as letras:
//
//   • o ciclo é idempotente por (projeto, referência) — reaprovar não duplica;
//   • o `stage` do projeto NÃO é mexido: ninguém guardou qual era antes, e
//     inventar um valor seria trocar um dado errado por outro;
//   • peça promovida a `scheduled` continua barrada na publicação, porque
//     `aprovacao-da-peca` recusa o carimbo `"cliente"` — é justamente o que o
//     relatório mede em `pecasLiberadasParaPublicar`.
//
// ─── NÃO PUBLICA NADA ───────────────────────────────────────────────────────
//
// Nenhuma chamada de plataforma, direta ou por import dinâmico. Este arquivo
// importa `prisma` e duas funções de leitura desta mesma pasta, e nada mais.

import { prisma } from "@/lib/db/client";
import { acharClienteUnico, cardsQueJaDecidem } from "@/lib/agency/esteira/cards-de-aprovacao";
import {
  CARIMBO_SECO,
  PREFIXO_DA_EQUIPE,
  PREFIXO_DO_CLIENTE,
} from "@/lib/agency/esteira/autoria-da-aprovacao";

/** Quanto o `reviewedAt` do card pode divergir do `clientApprovedAt` do projeto
 *  e ainda contar como o MESMO clique. `aprovarPacote` grava o mesmo `Date` nos
 *  dois, então na prática é zero — a folga é seguro contra refactor, e é curta
 *  para não pescar decisão vizinha. */
export const TOLERANCIA_DO_MESMO_CLIQUE_MS = 5_000;

/** Quanto tempo para trás olhar, por padrão. Quatro horas cobre "o CEO acabou de
 *  clicar e me chamou" com folga, e não chega perto do pacote do mês passado. */
export const JANELA_PADRAO_MINUTOS = 240;

/** Teto da janela. Uma reversão que varre um mês inteiro não é desfazer um
 *  clique, é reescrever histórico — e essa não é a ferramenta para isso. */
export const JANELA_MAXIMA_MINUTOS = 7 * 24 * 60;

/** É o carimbo seco de `aprovarPacote` — a assinatura do clique que se desfaz.
 *  Estreito de propósito: `client:` e `equipe:` NÃO casam aqui. */
export function ehCarimboDoPacoteAntigo(reviewedBy: string | null | undefined): boolean {
  return (reviewedBy ?? "").trim().toLowerCase() === CARIMBO_SECO;
}

/** Como um carimbo aparece no relatório — e por que ele é ou não é alvo. */
export type LeituraDoCarimbo = "carimbo_do_pacote" | "decisao_do_cliente" | "carimbo_de_equipe" | "outro";

export function lerCarimbo(reviewedBy: string | null | undefined): LeituraDoCarimbo {
  const cru = (reviewedBy ?? "").trim().toLowerCase();
  if (cru === CARIMBO_SECO) return "carimbo_do_pacote";
  if (cru.startsWith(PREFIXO_DO_CLIENTE) && cru.length > PREFIXO_DO_CLIENTE.length) return "decisao_do_cliente";
  if (cru.startsWith(PREFIXO_DA_EQUIPE) && cru.length > PREFIXO_DA_EQUIPE.length) return "carimbo_de_equipe";
  return "outro";
}

export interface CardAfetado {
  id: string;
  department: string;
  /** O que estava gravado. Vai para a tela do operador ANTES de qualquer escrita. */
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface CardPreservado extends CardAfetado {
  leitura: LeituraDoCarimbo;
  /** Por que este NÃO é tocado. Em português, com a evidência dentro. */
  motivo: string;
}

/** Uma peça que volta da fila de publicação para rascunho. */
export interface PecaDesagendada {
  postId: string;
  /** O que ela dizia, curto — o operador precisa reconhecer a peça na lista. */
  caption: string;
  quando: string | null;
}

export interface ProjetoNaReversao {
  projectId: string;
  projeto: string;
  /** O carimbo que será (ou seria) apagado. */
  clientApprovedAt: string;
  /** O carimbo do projeto será limpo? `false` quando há decisão legítima do
   *  cliente no mesmo instante — aí o carimbo é dele, e fica. */
  limpaCarimboDoProjeto: boolean;
  /** Os cards que voltam a `pending`. */
  reverte: CardAfetado[];
  /** Os cards do mesmo instante que ficam como estão, cada um com o motivo. */
  preserva: CardPreservado[];
  /**
   * AS PEÇAS QUE SAEM DA FILA DE PUBLICAÇÃO (27/08/2026).
   *
   * O clique do pacote não parava nos cards: ele seguia para a promoção do
   * calendário, que leva as peças de `draft` a `scheduled` — e `scheduled` é o
   * estado que o relógio publica. (A promoção NÃO é chamada aqui: este arquivo
   * escreve o estado da peça direto, e o teste de fonte confere isso.) Reverter os cards e deixar as
   * peças agendadas desfazia a papelada e não a consequência: foi por isso que,
   * na rodada paga, tirar UMA peça de teste da fila exigiu `/reprovar`.
   *
   * Volta a `draft`, que é o mesmo caminho que a reabertura de card já usa para
   * RETIRAR o aval. Peça com aprovação `client:` de verdade **não entra aqui**,
   * e peça já publicada muito menos — desfazer demais não tem volta.
   */
  desagenda: PecaDesagendada[];
}

export type SituacaoDaReversao =
  | "revertido"
  | "so_medi"
  | "nada_a_reverter"
  | "cliente_nao_existe"
  | "nome_ambiguo"
  | "sem_autor"
  | "sem_motivo";

export interface RelatorioDaReversao {
  situacao: SituacaoDaReversao;
  cliente: string | null;
  clientId: string | null;
  janelaMinutos: number;
  /** O instante a partir do qual se olhou. ISO, para o operador conferir. */
  desde: string;
  projetos: ProjetoNaReversao[];
  /** Quantos cards voltariam (ou voltaram) a `pending`. */
  cardsRevertidos: number;
  /** Quantos carimbos de projeto seriam (ou foram) limpos. */
  carimbosLimpos: number;
  /** Quantas peças saem (ou saíram) da fila de publicação. */
  pecasDesagendadas: number;
  /**
   * ── A RESPOSTA DA PERGUNTA QUE VEM DEPOIS ───────────────────────────────
   * Quantas peças deste cliente têm aprovação `client:` de verdade — as ÚNICAS
   * que a trava de publicação libera. É o número que responde "esse clique
   * chegou a deixar alguma peça publicável?" sem ninguém precisar deduzir.
   * `null` quando não deu para medir (e "não sei" nunca vira zero).
   */
  pecasLiberadasParaPublicar: number | null;
  /** Conclusão primeiro, em português. É a linha que o placar imprime. */
  veredito: string;
  candidatos?: number;
}

export interface PedidoDeReversao {
  /** O NOME do cliente, como o CEO o escreve. */
  cliente: string;
  /** `false` (padrão) = LEITURA PURA: mostra e não grava. */
  aplicar?: boolean;
  janelaMinutos?: number;
  /** QUEM mandou desfazer. Obrigatório: reversão sem autor tem exatamente o
   *  mesmo defeito da aprovação sem autor, e é o defeito que estamos
   *  consertando hoje. */
  autor: string;
  /** POR QUE. Obrigatório pelo mesmo motivo. */
  motivo: string;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** O motivo pelo qual um card do mesmo instante NÃO é tocado. Cada leitura leva
 *  a uma frase diferente porque cada uma é um caso diferente. */
function motivoDePreservar(leitura: LeituraDoCarimbo): string {
  switch (leitura) {
    case "decisao_do_cliente":
      return (
        `carimbo "${PREFIXO_DO_CLIENTE}<nome>": é uma decisão de verdade do cliente, tomada no portal dele. ` +
        "Reverter apagaria a assinatura de quem assinou — nunca."
      );
    case "carimbo_de_equipe":
      return (
        `carimbo "${PREFIXO_DA_EQUIPE}<email>": alguém da agência decidiu, declaradamente. Não foi o clique ` +
        "do portal que estamos desfazendo, e este carimbo já não libera publicação nenhuma."
      );
    case "outro":
      return "grafia que não é a do clique do pacote. Na dúvida não se mexe: desfazer demais não tem volta.";
    default:
      return "";
  }
}

/**
 * DESFAZ a aprovação de pacote gravada pelo carimbo seco `"cliente"`.
 *
 * **Leitura pura por padrão.** Sem `aplicar: true` nada é gravado — e o relatório
 * é o mesmo, item por item, para que o que se aprova ler seja exatamente o que
 * vai acontecer.
 *
 * **Idempotente.** O projeto entra pela janela do `clientApprovedAt`; depois de
 * revertido, o carimbo é nulo e ele não entra mais. Rodar duas vezes devolve
 * `nada_a_reverter`. As duas escritas de cada projeto vão numa transação, então
 * não existe meio-caminho para uma segunda passada consertar.
 */
export async function reverterAprovacaoDoPacote(pedido: PedidoDeReversao): Promise<RelatorioDaReversao> {
  const aplicar = pedido.aplicar === true;
  const autor = (pedido.autor ?? "").trim();
  const motivo = (pedido.motivo ?? "").trim();
  const janelaMinutos = Math.min(
    JANELA_MAXIMA_MINUTOS,
    Math.max(1, Math.trunc(pedido.janelaMinutos ?? JANELA_PADRAO_MINUTOS)),
  );
  const desde = new Date(Date.now() - janelaMinutos * 60_000);

  const vazio = {
    cliente: null, clientId: null, janelaMinutos, desde: desde.toISOString(),
    projetos: [] as ProjetoNaReversao[], cardsRevertidos: 0, carimbosLimpos: 0,
    pecasDesagendadas: 0, pecasLiberadasParaPublicar: null,
  };

  // ── Autor e motivo vêm ANTES do banco ─────────────────────────────────────
  // Recusar depois de ler seria recusar depois de ter gasto a consulta; recusar
  // antes deixa claro que a falta é do pedido, não do dado.
  if (!autor) {
    return { ...vazio, situacao: "sem_autor", veredito: "Reversão sem autor não é reversão. Informe quem está desfazendo. Nada foi lido nem gravado." };
  }
  if (!motivo) {
    return { ...vazio, situacao: "sem_motivo", veredito: "Reversão sem motivo não deixa rastro que sirva a alguém. Informe por quê. Nada foi lido nem gravado." };
  }

  const achado = await acharClienteUnico(pedido.cliente);
  if (achado.tipo === "nenhum") {
    return {
      ...vazio, situacao: "cliente_nao_existe",
      veredito: `Não existe cliente com o nome "${(pedido.cliente ?? "").trim()}" neste banco. Nada foi gravado.`,
    };
  }
  if (achado.tipo === "ambiguo") {
    return {
      ...vazio, situacao: "nome_ambiguo", candidatos: achado.candidatos,
      veredito:
        `${achado.candidatos} clientes casam com "${(pedido.cliente ?? "").trim()}". Não escolhi por conta ` +
        "própria: desfazer a aprovação do cliente errado apaga a decisão de quem não pediu nada. " +
        "Nada foi gravado — refaça com o nome completo.",
    };
  }

  const base = { ...vazio, cliente: achado.nome, clientId: achado.id };

  const projetos = await prisma.project.findMany({
    where: { clientId: achado.id, clientApprovedAt: { gte: desde } },
    select: {
      id: true, name: true, workspaceId: true, clientId: true,
      clientRequestId: true, clientApprovedAt: true,
    },
    orderBy: { clientApprovedAt: "desc" },
  });

  // As peças com aprovação `client:` de verdade. Lidas UMA vez, antes do laço,
  // e pela mesma função que responde "esse clique liberou alguma peça?" —
  // duas leituras do mesmo fato divergiriam justamente no caso raro.
  const decididasPeloCliente = await cardsQueJaDecidem(achado.id)
    .then((r) => r.aprovadaPeloCliente)
    .catch(() => new Set<string>());

  const leitura: ProjetoNaReversao[] = [];

  for (const p of projetos) {
    const carimbo = p.clientApprovedAt;
    if (!carimbo) continue;

    // Os cards que PODEM ter sido daquele clique: aprovados, do mesmo dono.
    const alvos: Array<{ clientRequestId: string } | { clientId: string }> = [];
    if (p.clientRequestId) alvos.push({ clientRequestId: p.clientRequestId });
    if (p.clientId) alvos.push({ clientId: p.clientId });
    if (alvos.length === 0) continue;

    const cards = await prisma.approvalRequest.findMany({
      where: { status: "approved", OR: alvos },
      select: { id: true, department: true, reviewedBy: true, reviewedAt: true },
      orderBy: { reviewedAt: "desc" },
    });

    // A SEGUNDA coordenada: o mesmo instante do carimbo do projeto.
    const doMesmoClique = cards.filter(
      (c) => c.reviewedAt != null
        && Math.abs(c.reviewedAt.getTime() - carimbo.getTime()) <= TOLERANCIA_DO_MESMO_CLIQUE_MS,
    );

    const reverte: CardAfetado[] = [];
    const preserva: CardPreservado[] = [];
    for (const c of doMesmoClique) {
      const l = lerCarimbo(c.reviewedBy);
      const linha = { id: c.id, department: c.department, reviewedBy: c.reviewedBy, reviewedAt: iso(c.reviewedAt) };
      if (l === "carimbo_do_pacote") reverte.push(linha);
      else preserva.push({ ...linha, leitura: l, motivo: motivoDePreservar(l) });
    }

    // ── O CARIMBO DO PROJETO SÓ CAI SE NADA LEGÍTIMO O SUSTENTAR ────────────
    // Havendo decisão `client:` no mesmo instante, o `clientApprovedAt` é dela
    // — apagá-lo desfaria uma aprovação de verdade. O mesmo vale para o carimbo
    // de equipe: veio de outra porta, e não é este clique.
    const sustentadoPorOutro = preserva.some(
      (c) => c.leitura === "decisao_do_cliente" || c.leitura === "carimbo_de_equipe",
    );
    const limpaCarimboDoProjeto = !sustentadoPorOutro;

    // ── AS PEÇAS QUE O MESMO CLIQUE MANDOU PARA A FILA ─────────────────────
    //
    // O clique do pacote → a promoção do calendário → `scheduled`. Sem isto a
    // reversão desfazia a papelada e deixava a consequência de pé.
    //
    // As três exclusões são as que impedem "desfazer demais":
    //   • peça já PUBLICADA não volta (o fato aconteceu);
    //   • peça com aprovação `client:` de verdade não volta (é decisão dele);
    //   • peça que não é do pedido deste projeto nem é olhada.
    const desagenda: PecaDesagendada[] = [];
    if (p.clientRequestId) {
      const agendadas = await prisma.socialPost.findMany({
        where: { clientRequestId: p.clientRequestId, status: "scheduled", publishedAt: null },
        select: { id: true, caption: true, scheduledFor: true },
        orderBy: { scheduledFor: "asc" },
      }).catch(() => []);
      for (const peca of agendadas) {
        if (decididasPeloCliente.has(peca.id)) continue;
        desagenda.push({ postId: peca.id, caption: (peca.caption ?? "").slice(0, 120), quando: iso(peca.scheduledFor) });
      }
    }

    if (reverte.length === 0 && !limpaCarimboDoProjeto && desagenda.length === 0) continue;

    leitura.push({
      projectId: p.id,
      projeto: p.name,
      clientApprovedAt: carimbo.toISOString(),
      limpaCarimboDoProjeto,
      reverte,
      preserva,
      desagenda,
    });
  }

  const cardsRevertidos = leitura.reduce((n, p) => n + p.reverte.length, 0);
  const carimbosLimpos = leitura.filter((p) => p.limpaCarimboDoProjeto).length;
  const pecasDesagendadas = leitura.reduce((n, p) => n + p.desagenda.length, 0);

  // ── A pergunta que vem depois, medida em vez de deduzida ──────────────────
  const liberadas = await cardsQueJaDecidem(achado.id)
    .then((r) => r.aprovadaPeloCliente.size)
    .catch(() => null);

  const placar = { ...base, projetos: leitura, cardsRevertidos, carimbosLimpos, pecasDesagendadas, pecasLiberadasParaPublicar: liberadas };

  if (leitura.length === 0) {
    return {
      ...placar, situacao: "nada_a_reverter",
      veredito:
        `Nada a desfazer para ${achado.nome} nas últimas ${janelaMinutos} minutos: nenhum projeto com ` +
        `\`clientApprovedAt\` nessa janela carregando o carimbo "${CARIMBO_SECO}". Se a reversão já rodou, ` +
        "é este o resultado esperado — rodar de novo não faz mal. Nada foi gravado.",
    };
  }

  if (!aplicar) {
    return {
      ...placar, situacao: "so_medi",
      veredito:
        `LEITURA PURA — nada foi gravado. Se você aplicar: ${cardsRevertidos} card(s) voltam a "pending" ` +
        `com autor e data limpos, ${carimbosLimpos} carimbo(s) de aprovação de projeto voltam a nulo, e ` +
        `${pecasDesagendadas} peça(s) SAEM DA FILA DE PUBLICAÇÃO (voltam a rascunho). ` +
        `${leitura.reduce((n, p) => n + p.preserva.length, 0)} carimbo(s) do mesmo instante ficam como estão ` +
        "(veja `preserva`, com o motivo de cada um). Confira a lista item por item antes de aplicar.",
    };
  }

  for (const alvo of leitura) {
    const projeto = projetos.find((p) => p.id === alvo.projectId)!;
    const ids = alvo.reverte.map((c) => c.id);

    // ── AS DUAS ESCRITAS SÃO UMA SÓ ────────────────────────────────────────
    // Transação porque um meio-caminho aqui é pior que não desfazer: cards de
    // volta a `pending` com o projeto ainda carimbado (ou o contrário) é um
    // estado que ninguém sabe ler, e que a segunda passada não reconheceria.
    //
    // O `where` da atualização repete as DUAS condições da seleção. Não é
    // cinto e suspensório: entre a leitura e a escrita alguém pode ter decidido
    // o card de verdade, e a reversão não pode passar por cima disso.
    const escritas = [];
    if (ids.length > 0) {
      escritas.push(
        prisma.approvalRequest.updateMany({
          where: { id: { in: ids }, status: "approved", reviewedBy: CARIMBO_SECO },
          data: { status: "pending", reviewedBy: null, reviewedAt: null },
        }),
      );
    }
    const idsDasPecas = alvo.desagenda.map((x) => x.postId);
    if (idsDasPecas.length > 0) {
      escritas.push(
        prisma.socialPost.updateMany({
          // Compare-and-set: se alguém publicou ou mexeu no estado entre a
          // leitura e a escrita, a peça não é tocada.
          where: { id: { in: idsDasPecas }, status: "scheduled", publishedAt: null },
          data: { status: "draft" },
        }),
      );
    }
    if (alvo.limpaCarimboDoProjeto) {
      escritas.push(
        prisma.project.update({
          where: { id: alvo.projectId },
          // `stage` NÃO volta: ninguém guardou qual era antes de "implementation",
          // e inventar um valor troca um dado errado por outro. O que o cliente
          // vê é derivado de `clientApprovedAt`, e esse volta ao lugar.
          data: { clientApprovedAt: null },
        }),
      );
    }
    if (escritas.length > 0) await prisma.$transaction(escritas);

    // ── O RASTRO ───────────────────────────────────────────────────────────
    // Best-effort declarado: perder o registro é ruim, não desfazer o que o CEO
    // pediu é pior. Mas o evento carrega a evidência inteira — autor, motivo,
    // ids e o que foi preservado — porque "uma reversão aconteceu" sem o caso
    // concreto é ruído que ninguém investiga (guardrail 6).
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId: alvo.projectId,
        clientId: projeto.clientId,
        type: "aprovacao_do_pacote_revertida",
        message:
          `Aprovação do pacote REVERTIDA por ${autor}. Motivo: ${motivo}. ` +
          `Carimbo do projeto ${alvo.limpaCarimboDoProjeto ? `(${alvo.clientApprovedAt}) apagado` : "MANTIDO (há decisão legítima no mesmo instante)"}; ` +
          `${ids.length} card(s) de volta a "pending": ${ids.join(", ") || "nenhum"}. ` +
          `${idsDasPecas.length} peça(s) fora da fila de publicação: ${idsDasPecas.join(", ") || "nenhuma"}. ` +
          `Preservados: ${alvo.preserva.map((c) => `${c.id} (${c.leitura})`).join(", ") || "nenhum"}.`
            .slice(0, 900),
      },
    }).catch((e) => {
      console.error("[reverter-pacote] a reversão foi feita e o registro NÃO foi gravado", alvo.projectId, e);
    });
  }

  return {
    ...placar, situacao: "revertido",
    veredito:
      `Feito: ${cardsRevertidos} card(s) voltaram a "pending" (sem autor e sem data), ${carimbosLimpos} ` +
      `projeto(s) voltaram a esperar a decisão do cliente e ${pecasDesagendadas} peça(s) saíram da FILA DE ` +
      `PUBLICAÇÃO (voltaram a rascunho). Autor: ${autor}. A reversão ficou registrada na ` +
      "linha do tempo de cada projeto. Rodar de novo não faz mal — a segunda passada não encontra nada.",
  };
}
