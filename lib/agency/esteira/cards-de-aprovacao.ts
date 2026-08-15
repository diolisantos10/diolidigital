// cards-de-aprovacao.ts — QUEM ABRE O PEDIDO PARA O CLIENTE DECIDIR.
//
// ─── O QUE ESTE MÓDULO NÃO FAZ, E É A PRIMEIRA COISA A DIZER ─────────────────
//
// **Ele não aprova nada.** Aprovar é ato do CLIENTE, no portal dele (ordem do
// CEO, 14/08/2026: *"quem libera, quem aprova, são os clientes"*). O que este
// módulo faz é ABRIR O PEDIDO — o card que aparece na aba de Aprovações do
// portal e que o cliente decide. Ele grava `status: "pending"` e nada mais;
// `reviewedBy`/`reviewedAt` continuam nulos e só `/api/portal/approvals` os
// escreve, com a posse derivada do token do portal.
//
// Se algum dia alguém fizer este módulo gravar "approved", terá reinventado
// exatamente o carimbo que `aprovacao-da-peca.ts` recusa no cabeçalho dele.
//
// ─── POR QUE A REGRA SAIU DA ROTA (14/08/2026) ──────────────────────────────
//
// A regra morava inteira dentro de `app/api/social-posts/aprovacao/route.ts`, e
// aquela rota exige **sessão de master/PM**. Isso bastava enquanto abrir card
// fosse sempre um clique de alguém logado no painel. Deixou de bastar quando o
// piloto do CityJobs precisou do mesmo card sem que ninguém tivesse sessão na
// mão — e a alternativa era uma SEGUNDA cópia da regra dentro de uma rota
// administrativa.
//
// Duas cópias começam idênticas e divergem no primeiro ajuste. Aqui a divergência
// custaria caro de um jeito específico: o corpo do card (`reviewNote`) é o que o
// portal RENDERIZA para o cliente, no formato "título na primeira linha, peças no
// resto" que `AprovacoesDoCliente.tituloDaPeca` lê. Uma segunda régua produziria
// cards que o cliente lê diferente conforme quem os abriu.
//
// Mesmo remédio de `links-do-portal.ts`, pelo mesmo motivo: uma implementação,
// dois donos.
//
//   • `POST /api/social-posts/aprovacao`  — a equipe, com sessão, a partir do
//     calendário. Rigorosa: qualquer peça inelegível vira ERRO HTTP, porque
//     alguém escolheu aquelas peças a dedo e precisa saber que uma não entrou.
//   • `POST /api/admin/cards-de-aprovacao` — o botão administrativo, sem sessão.
//     Tolerante: peça inelegível é EXCLUÍDA com motivo e as outras seguem,
//     porque ninguém escolheu peça nenhuma — pediu-se "as peças deste cliente".
//
// As duas usam a MESMA triagem e o MESMO corpo de card. O que difere é o que
// cada uma faz com a recusa, e isso é contrato de rota, não regra de negócio.

import { prisma } from "@/lib/db/client";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { decisaoEhDoCliente, STATUS_APROVADO } from "@/lib/agency/esteira/aprovacao-da-peca";

/** Teto de peças por card. Um card de aprovação com 50 itens não é decisão,
 *  é fadiga — e a spec do Hub (E3) diz que o objeto de aprovação é indivisível. */
export const MAX_PECAS_POR_CARD = 20;

/** O departamento do card. Um lugar só: o portal filtra por ele. */
export const DEPARTAMENTO = "social-media";

/**
 * Os estados que significam "esta peça AINDA VAI AO AR".
 *
 * O padrão é só `scheduled`, e é deliberadamente estreito: é o único estado que
 * o relógio lê (`publicarAgendados` filtra `status: "scheduled"`). Peça em
 * `draft` não está indo a lugar nenhum — mandá-la ao cliente seria pedir decisão
 * sobre trabalho que a casa ainda não terminou.
 */
export const ESTADOS_QUE_VAO_AO_AR = ["scheduled"] as const;

/** Os estados que este módulo aceita examinar, quando alguém amplia o pedido.
 *  `published` NUNCA entra: a decisão chegaria depois do fato. */
export const ESTADOS_EXAMINAVEIS = ["scheduled", "draft", "approved", "revision_requested"];

export const FORMATO_LEGIVEL: Record<string, string> = {
  carousel: "Carrossel", carrossel: "Carrossel",
  reel: "Reels", video: "Reels", story: "Story", feed: "Feed",
};

export function lerLista(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** A primeira frase da legenda, curta o bastante para ser título de item. */
export function primeiraFrase(caption: string): string {
  const linha = caption.trim().split("\n")[0] ?? "";
  const frase = linha.split(/(?<=[.!?…])\s/)[0] ?? linha;
  return frase.length > 80 ? `${frase.slice(0, 77)}…` : frase;
}

/** O que o card precisa saber de cada peça. Deliberadamente o mesmo `select`
 *  das duas rotas — um campo a mais aqui é um campo a mais lido em produção. */
export interface PecaDoCard {
  id: string;
  clientId: string | null;
  caption: string;
  format: string;
  pillar: string | null;
  status: string;
  visibility: string;
  scenesJson: string | null;
  scheduledFor: Date | null;
}

/**
 * O CORPO DO CARD, no formato que o portal já renderiza.
 *
 * Primeira linha = título (`AprovacoesDoCliente.tituloDaPeca` lê ≤ 90 chars);
 * o resto é texto corrido com whitespace-pre-wrap. Função PURA: ela não lê banco
 * e não escreve nada, então dá para afirmá-la em teste sem montar meia casa.
 */
export function corpoDoCard(pecas: PecaDoCard[]): {
  titulo: string;
  reviewNote: string;
  ordenados: PecaDoCard[];
} {
  const ordenados = [...pecas].sort(
    (a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
  );
  const todosCarrossel = ordenados.every((p) => FORMATO_LEGIVEL[p.format] === "Carrossel");
  const n = ordenados.length;
  const titulo = todosCarrossel
    ? `Carrosséis de lançamento — ${n} peça${n === 1 ? "" : "s"}`
    : `Peças do calendário — ${n} peça${n === 1 ? "" : "s"}`;

  const blocos = ordenados.map((p, i) => {
    const cenas = lerLista(p.scenesJson);
    const linhas = [
      `**${i + 1}. ${primeiraFrase(p.caption) || `Peça ${i + 1}`}**`,
      `- Formato: ${FORMATO_LEGIVEL[p.format] ?? "Feed"}`,
    ];
    if (p.pillar) linhas.push(`- Pilar: ${p.pillar}`);
    if (p.scheduledFor) {
      linhas.push(
        `- Data proposta: ${p.scheduledFor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
      );
    }
    if (p.caption.trim()) linhas.push(`- Legenda: ${p.caption.trim()}`);
    if (cenas.length > 0) linhas.push(`- Telas: ${cenas.map((c, j) => `${j + 1}) ${c}`).join(" · ")}`);
    return linhas.join("\n");
  });

  return { titulo, reviewNote: [titulo, "", ...blocos].join("\n"), ordenados };
}

// ─── A TRIAGEM ──────────────────────────────────────────────────────────────

/** Por que uma peça NÃO entra no card. Cada motivo leva a um conserto
 *  diferente — por isso é um código e não uma contagem (guardrail 6). */
export type MotivoDeExclusao =
  /** Já publicada: a decisão chegaria depois do fato. */
  | "ja_publicada"
  /** `visibility: "interno"`: o cliente só decide o que pode ver. */
  | "interna"
  /** Sem `clientId`: não existe quem a aprove. */
  | "sem_cliente"
  /** Já está num card PENDENTE: abrir outro faria o cliente decidir a mesma
   *  peça duas vezes, com resultados que podem divergir. É a idempotência. */
  | "ja_em_card_pendente"
  /** Já tem card APROVADO PELO CLIENTE: a trava de publicação já passa nela.
   *  Pedir de novo seria pedir ao cliente que aprovasse o que ele já aprovou. */
  | "ja_aprovada_pelo_cliente";

export interface PecaExcluida {
  postId: string;
  motivo: MotivoDeExclusao;
  /** Em português, com a evidência dentro. É o que vai para o placar. */
  detalhe: string;
}

export interface Triagem {
  elegiveis: PecaDoCard[];
  excluidas: PecaExcluida[];
}

/**
 * Os cards que JÁ decidem cada peça, lidos com a MESMA régua da trava.
 *
 * Devolve dois conjuntos, e eles não são a mesma pergunta:
 *   • `emCardPendente`  — o cliente ainda vai decidir. Não se abre outro.
 *   • `aprovadaPeloCliente` — decidida, e decidida por ELE (`client:<nome>`).
 *
 * ⚠️ Card `approved` cujo `reviewedBy` NÃO é `client:` (o carimbo seco de
 *    `aprovarPacote`, ou `equipe:<email>`) **não** entra no segundo conjunto —
 *    de propósito, e é a sutileza que faz este módulo valer. `aprovacaoDaPeca`
 *    recusa esse carimbo, então a peça continua barrada na publicação e PRECISA
 *    de um card de verdade. Tratá-la como aprovada aqui deixaria a peça num
 *    limbo silencioso: ninguém abriria o card, e a trava nunca abriria a porta.
 */
export async function cardsQueJaDecidem(
  clientId: string,
): Promise<{ emCardPendente: Set<string>; aprovadaPeloCliente: Set<string> }> {
  const cards = await prisma.approvalRequest.findMany({
    where: { clientId, sourcePostIdsJson: { not: "[]" } },
    select: { id: true, status: true, reviewedBy: true, sourcePostIdsJson: true },
  });

  const emCardPendente = new Set<string>();
  const aprovadaPeloCliente = new Set<string>();
  for (const c of cards) {
    const ids = lerLista(c.sourcePostIdsJson);
    if (c.status === "pending") {
      for (const id of ids) emCardPendente.add(id);
    } else if (c.status === STATUS_APROVADO && decisaoEhDoCliente(c.reviewedBy)) {
      for (const id of ids) aprovadaPeloCliente.add(id);
    }
  }
  return { emCardPendente, aprovadaPeloCliente };
}

/**
 * QUAIS PEÇAS ENTRAM NO CARD. Função pura — o banco já foi lido por quem chama.
 *
 * A ordem das perguntas é a ordem em que elas doem: publicada primeiro (nada a
 * fazer), depois visibilidade (fail-closed), depois dono, depois os dois estados
 * de "já pedi isso".
 */
export function triarPecas(
  pecas: PecaDoCard[],
  ja: { emCardPendente: Set<string>; aprovadaPeloCliente: Set<string> },
): Triagem {
  const elegiveis: PecaDoCard[] = [];
  const excluidas: PecaExcluida[] = [];

  for (const p of pecas) {
    if (p.status === "published") {
      excluidas.push({
        postId: p.id, motivo: "ja_publicada",
        detalhe: "já publicada — a decisão do cliente chegaria depois do fato.",
      });
      continue;
    }
    if (p.visibility !== "compartilhado") {
      excluidas.push({
        postId: p.id, motivo: "interna",
        detalhe:
          `visibilidade "${p.visibility}": o cliente só decide o que pode ver. ` +
          "Compartilhe a peça no calendário antes de pedir aprovação.",
      });
      continue;
    }
    if (!p.clientId) {
      excluidas.push({
        postId: p.id, motivo: "sem_cliente",
        detalhe: "sem `clientId` — não existe quem a aprove.",
      });
      continue;
    }
    if (ja.emCardPendente.has(p.id)) {
      excluidas.push({
        postId: p.id, motivo: "ja_em_card_pendente",
        detalhe: "já está num card de aprovação PENDENTE — o cliente ainda vai decidir esta peça.",
      });
      continue;
    }
    if (ja.aprovadaPeloCliente.has(p.id)) {
      excluidas.push({
        postId: p.id, motivo: "ja_aprovada_pelo_cliente",
        detalhe: "o cliente JÁ aprovou esta peça, pelo portal dele. A trava de publicação já passa nela.",
      });
      continue;
    }
    elegiveis.push(p);
  }

  return { elegiveis, excluidas };
}

// ─── O CAMINHO ADMINISTRATIVO, DE PONTA A PONTA ─────────────────────────────

export interface PedidoDeCards {
  /** O NOME do cliente, como o CEO o escreve. Nunca um id: quem aperta o botão
   *  não tem id de banco na mão, e pedir um garantiria o erro de digitação
   *  silencioso que abre o card do cliente errado. */
  cliente: string;
  /** `false` (padrão) = LEITURA PURA: mede e relata, sem gravar linha nenhuma. */
  criar?: boolean;
  /** Os estados examinados. Vazio = `ESTADOS_QUE_VAO_AO_AR`. */
  estados?: string[];
}

export type SituacaoDoPedido =
  | "criado"
  | "nada_a_criar"
  | "so_medi"
  | "cliente_nao_existe"
  | "nome_ambiguo"
  | "peças_demais";

export interface RelatorioDeCards {
  situacao: SituacaoDoPedido;
  /** O nome do cliente NO BANCO. `null` quando não houve cliente único. */
  cliente: string | null;
  clientId: string | null;
  estadosExaminados: string[];
  /** Quantas peças o filtro encontrou, antes da triagem. */
  examinadas: number;
  elegiveis: number;
  /** O placar COM MOTIVO — nunca só a contagem. Motivo repetido vira uma linha. */
  excluidas: Array<{ motivo: MotivoDeExclusao; quantas: number; detalhe: string }>;
  /** O card aberto. `null` em leitura pura e em todo caminho de recusa. */
  approvalRequestId: string | null;
  titulo: string | null;
  /** Em português, conclusão primeiro. É a linha que o placar imprime. */
  veredito: string;
  /** Quantos candidatos, quando o nome ficou ambíguo. Sem os nomes: o placar
   *  vive 90 dias num log de CI e nome de cliente não precisa morar lá. */
  candidatos?: number;
}

/**
 * QUAL CLIENTE, pelo NOME que o CEO escreve. Nunca por id: quem aperta o botão
 * administrativo não tem id de banco na mão, e pedir um garantiria o erro de
 * digitação silencioso que age no cliente errado.
 *
 * **Nome ambíguo RECUSA em vez de escolher.** Vale para abrir card (mostra o
 * trabalho de um cliente a outro) e vale para desfazer aprovação (desfaz a
 * decisão de quem não pediu). Os dois erros são do tipo que não se conserta
 * depois — por isso a régua é uma só e mora aqui, não uma cópia por rota
 * administrativa.
 *
 * Busca por conteúdo SEM `mode: insensitive`: o SQLite do Prisma não o suporta e
 * LANÇA em vez de filtrar. Comparação em memória, igual a `links-do-portal.ts`.
 */
export type ClienteEncontrado =
  | { tipo: "unico"; id: string; nome: string }
  | { tipo: "nenhum" }
  | { tipo: "ambiguo"; candidatos: number };

export async function acharClienteUnico(nome: string): Promise<ClienteEncontrado> {
  const alvo = (nome ?? "").trim();
  if (!alvo) return { tipo: "nenhum" };
  const todos = await prisma.client.findMany({ select: { id: true, name: true } });
  const casam = todos.filter((c) => (c.name ?? "").toLowerCase().includes(alvo.toLowerCase()));
  if (casam.length === 0) return { tipo: "nenhum" };
  if (casam.length > 1) return { tipo: "ambiguo", candidatos: casam.length };
  const c = casam[0]!;
  return { tipo: "unico", id: c.id, nome: c.name ?? "" };
}

/** O placar agrupado: um motivo repetido 6 vezes é UMA linha, que é como ele
 *  deve ser lido de qualquer forma. */
function agruparExclusoes(
  excluidas: PecaExcluida[],
): Array<{ motivo: MotivoDeExclusao; quantas: number; detalhe: string }> {
  const porMotivo = new Map<MotivoDeExclusao, { quantas: number; detalhe: string }>();
  for (const e of excluidas) {
    const atual = porMotivo.get(e.motivo);
    if (atual) atual.quantas += 1;
    else porMotivo.set(e.motivo, { quantas: 1, detalhe: e.detalhe });
  }
  return [...porMotivo.entries()].map(([motivo, v]) => ({ motivo, ...v }));
}

/**
 * ABRE O PEDIDO DE APROVAÇÃO das peças de UM cliente.
 *
 * **Não aprova.** O card nasce `pending`, sem `reviewedBy` e sem `reviewedAt` —
 * quem os escreve é o clique do cliente no portal dele.
 *
 * **Idempotente pelo DADO, não por marca:** peça que já está num card pendente é
 * excluída pela própria leitura do banco (`cardsQueJaDecidem`). Rodar duas vezes
 * seguidas não abre um segundo card; a segunda passada volta "nada a criar", com
 * o motivo.
 *
 * **Nunca escolhe cliente por palpite.** Nome que casa com dois clientes recusa
 * — abrir o card errado mostra o trabalho de um cliente a outro, e isso não se
 * desfaz depois que ele viu.
 */
export async function abrirCardsDeAprovacao(pedido: PedidoDeCards): Promise<RelatorioDeCards> {
  const criar = pedido.criar === true;
  const alvo = (pedido.cliente ?? "").trim();
  const pedidos = (pedido.estados ?? []).map((s) => s.trim()).filter(Boolean);
  const estados = pedidos.length > 0
    ? pedidos.filter((e) => ESTADOS_EXAMINAVEIS.includes(e))
    : [...ESTADOS_QUE_VAO_AO_AR];

  const vazio = {
    cliente: null, clientId: null, estadosExaminados: estados,
    examinadas: 0, elegiveis: 0, excluidas: [], approvalRequestId: null, titulo: null,
  };

  const achado = await acharClienteUnico(alvo);

  if (achado.tipo === "nenhum") {
    return {
      ...vazio, situacao: "cliente_nao_existe",
      veredito:
        `Não existe cliente com o nome "${alvo}" neste banco. Sem cliente não há peça e não há card. ` +
        "Nada foi gravado.",
    };
  }
  if (achado.tipo === "ambiguo") {
    return {
      ...vazio, situacao: "nome_ambiguo", candidatos: achado.candidatos,
      veredito:
        `${achado.candidatos} clientes casam com "${alvo}". Não escolhi por conta própria: abrir o card do ` +
        "cliente errado mostra o trabalho de um cliente a outro, e isso não se desfaz. " +
        "Nada foi gravado — refaça o pedido com o nome completo.",
    };
  }

  const c = { id: achado.id };
  const nome = achado.nome;

  const pecas = await prisma.socialPost.findMany({
    where: { clientId: c.id, status: { in: estados } },
    select: {
      id: true, clientId: true, caption: true, format: true,
      pillar: true, status: true, visibility: true, scenesJson: true, scheduledFor: true,
    },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });

  const ja = await cardsQueJaDecidem(c.id);
  const { elegiveis, excluidas } = triarPecas(pecas, ja);
  const placar = agruparExclusoes(excluidas);

  const base = {
    cliente: nome, clientId: c.id, estadosExaminados: estados,
    examinadas: pecas.length, elegiveis: elegiveis.length, excluidas: placar,
    approvalRequestId: null as string | null, titulo: null as string | null,
  };

  if (elegiveis.length === 0) {
    const jaPedidas = placar.find((p) => p.motivo === "ja_em_card_pendente")?.quantas ?? 0;
    const jaAprovadas = placar.find((p) => p.motivo === "ja_aprovada_pelo_cliente")?.quantas ?? 0;
    return {
      ...base, situacao: "nada_a_criar",
      veredito:
        `Nenhuma peça de ${nome} precisa de card novo — nada foi gravado. ` +
        `Das ${pecas.length} examinadas: ${jaPedidas} já estão num card pendente (o cliente ainda vai ` +
        `decidir), ${jaAprovadas} ele JÁ aprovou, e o resto está no placar com o motivo. ` +
        (pecas.length === 0
          ? `Zero examinadas quer dizer que este cliente não tem peça em ${estados.join("/")} — ` +
            "isso é uma resposta, não uma falha."
          : ""),
    };
  }

  if (elegiveis.length > MAX_PECAS_POR_CARD) {
    return {
      ...base, situacao: "peças_demais",
      veredito:
        `${elegiveis.length} peças elegíveis, e o teto por card é ${MAX_PECAS_POR_CARD}. ` +
        "Um card com dezenas de itens não é decisão, é fadiga — e o objeto de aprovação é indivisível. " +
        "Nada foi gravado.",
    };
  }

  const { titulo, reviewNote, ordenados } = corpoDoCard(elegiveis);

  if (!criar) {
    return {
      ...base, titulo, situacao: "so_medi",
      veredito:
        `LEITURA PURA: nada foi gravado. ${elegiveis.length} peça(s) de ${nome} estão prontas para virar ` +
        `UM card de aprovação ("${titulo}"), e hoje NÃO existe card aberto nem aprovação do cliente para ` +
        `elas — é por isso que a publicação as barra. Para abrir o pedido, repita com criar=1.`,
    };
  }

  const aprovacao = await createApprovalRequest({
    clientId: c.id,
    department: DEPARTAMENTO,
    // Origem marcada, e marcada com HONESTIDADE: quem abriu foi a rota
    // administrativa, não uma pessoa com sessão. `equipe:` mantém a grafia que o
    // resto da casa lê como "a agência abriu" — e `aprovacao-da-peca` já recusa
    // essa grafia como carimbo de aprovação, que é exatamente o desejado: abrir
    // o pedido é da casa, decidir é do cliente.
    requestedBy: "equipe:rota-administrativa",
    clientVisible: true,
    reviewNote,
    sourcePostIds: ordenados.map((p) => p.id),
  });

  return {
    ...base, situacao: "criado", titulo,
    approvalRequestId: aprovacao.id,
    veredito:
      `Card aberto para ${nome} com ${elegiveis.length} peça(s): "${titulo}". ` +
      "Ele nasceu PENDENTE — ninguém aprovou nada. Agora o cliente decide no portal dele, e é a " +
      "decisão dele (quem, quando) que a trava de publicação lê.",
  };
}
