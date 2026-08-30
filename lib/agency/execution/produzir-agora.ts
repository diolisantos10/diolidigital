// produzir-agora.ts — O BOTÃO DE PRODUZIR, COM A CONTA NA FRENTE.
//
// ─── POR QUE ELE EXISTE (15/08/2026) ────────────────────────────────────────
//
// Ordem do CEO: *"produz as peças"*, para a CityJobs. Ao medir o caminho, a
// esteira tem TRÊS trechos e nenhum deles tem porta de entrada por HTTP:
//
//   1. `runProjectExecution` — escreve as entregas do ciclo. Tem rota
//      (`/api/cron/execute`), mas ela só recolhe projeto `running` travado ou
//      `failed`: projeto `pending` ou `idle` **não entra**, e o despertador é o
//      único que os pega.
//   2. `agendarPostsDaEntrega` — a entrega vira PEÇA com data. Tem exatamente
//      três chamadores (`marcos.apresentar`, `mes.apresentarCiclo`,
//      `escada/repescagem`), e os três são eventos que já passaram. Entrega
//      liberada depois da apresentação fica no banco sem nunca virar peça.
//   3. `produzirArtesPendentes` — a imagem, que é a parte PAGA. **Zero
//      chamadores fora do despertador**: não há rota, não há workflow, não há
//      script. Quem apertou `/api/cron/execute` esperando criativo apertou um
//      botão que não passa perto do gerador de imagem.
//
// Este módulo é a porta dos três, na ordem, para UM cliente por vez.
//
// ─── A CONTA VEM ANTES DA GRAVAÇÃO, SEMPRE ──────────────────────────────────
//
// Leitura pura por padrão: diz **quantas imagens** sairiam e **quanto custam**,
// peça por peça, sem gastar um centavo. `aplicar` é ato explícito e separado.
// Gasto que ninguém previu é o tipo de coisa que só se descobre na fatura.
//
// O custo é **estimativa de tabela pública**, e está dito assim no relatório —
// não é fatura medida. Esta casa não tem leitura de faturamento do provedor, e
// batizar estimativa de medição é como se inventa dado.
//
// ─── O TETO É CONTRA LAÇO, NÃO CONTRA VOLUME ────────────────────────────────
//
// Ordem do CEO, 15/08: *"deixe produzir mais peças"*. O teto desta passada
// nasce largo e **aparece no relatório e no botão**, para poder subir. Ele
// existe para impedir dez mil imagens por engano, não vinte de propósito.
//
// O teto de SEGURANÇA da casa continua onde estava e **não é tocado aqui**:
// `MAX_IMAGENS_POR_CLIENTE_POR_DIA` (40) mora em `artes.ts`, é fail-closed e
// vale para qualquer chamador. Este módulo o LÊ e o mostra; nunca o contorna.
//
// ─── NADA PUBLICA ───────────────────────────────────────────────────────────
//
// Peça criada nasce `draft` (`publicacao.agendarPostsDaEntrega`), que é o estado
// de "data proposta, sem aval do cliente". Nenhuma chamada de plataforma sai
// daqui, direta ou por import dinâmico — e há teste lendo o FONTE deste arquivo
// para provar a ausência.
//
// ─── NENHUM PORTÃO É AFROUXADO ──────────────────────────────────────────────
//
// Este arquivo não decide nada sobre qualidade, verdade, escada ou pilar. Ele
// chama as MESMAS funções do despertador e obedece ao que elas responderem:
//
//   • sem `directionApprovedAt`, `runProjectExecution` recusa e o relatório diz
//     que recusou — o portão de direção não tem atalho aqui;
//   • entrega que a escada não liberou, ou que a Qualidade reprovou, não vira
//     peça (`motivoParaNaoVirarCalendario`);
//   • pilar bloqueado não vira peça e não vira imagem (`conferirPilar`);
//   • sem Chromium, a passada para ANTES de pagar a primeira imagem.

import { prisma } from "@/lib/db/client";
import { acharClienteUnico } from "@/lib/agency/esteira/cards-de-aprovacao";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import {
  agendarPostsDaEntrega, extrairPecas, motivoParaNaoVirarCalendario,
} from "@/lib/agency/esteira/publicacao";
import {
  produzirArtesPendentes, contarTentativas,
  MAX_ARTES_POR_RODADA, MAX_TENTATIVAS_POR_PECA,
  MAX_IMAGENS_POR_CLIENTE_POR_DIA, MAX_TELAS_POR_CARROSSEL,
  type ArtesFeitas,
} from "@/lib/agency/execution/artes";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { PRECO_DE_TABELA_USD } from "@/lib/ai/precos";

// ── O QUE UMA IMAGEM CUSTA ───────────────────────────────────────────────────

/**
 * Preço de UMA imagem, em dólar, pela tabela pública do `gpt-image-1` em
 * qualidade `high` — que é a qualidade que `artes.ts` pede, sem opção.
 *
 * ⚠️ **É ESTIMATIVA DE TABELA, NÃO FATURA.** Esta casa não lê o faturamento do
 * provedor; o número serve para o operador decidir ANTES de apertar, e o
 * relatório o rotula como estimativa em todo lugar onde ele aparece. Chamar
 * isto de "custo medido" seria exatamente o defeito que a casa já nomeou duas
 * vezes: converter o que não se sabe em afirmação.
 *
 * O recorte segue `artes.ts:325` — `story` sai em retrato (1024×1536), todo o
 * resto sai quadrado (1024×1024). Carrossel multiplica por tela.
 */
// A tabela mora em `lib/ai/precos.ts`, junto das outras verdades de preço da
// casa, e é a MESMA que o livro-caixa carimba em cada linha de imagem desde
// 24/08/2026. Aqui só se reexporta o nome, para quem já o importava daqui:
// dois números iguais em dois arquivos já estão errados em um deles no dia em
// que a OpenAI mudar a tabela.
export { PRECO_DE_TABELA_USD } from "@/lib/ai/precos";

/** Teto padrão de imagens desta passada. Igual ao teto DIÁRIO da casa de
 *  propósito: assim este botão nunca é o freio mais estreito — quem freia
 *  continua sendo a trava de segurança que já existia. */
export const TETO_PADRAO_DA_PASSADA = MAX_IMAGENS_POR_CLIENTE_POR_DIA;

/** Teto do teto. Não é opinião sobre volume: é a distância entre "o CEO pediu
 *  muitas peças" e "alguém digitou um número com três zeros a mais". O teto
 *  diário por cliente continua valendo por baixo deste. */
export const TETO_MAXIMO_DA_PASSADA = 200;

/** Guarda de laço. Cada rodada de `produzirArtesPendentes` produz no máximo
 *  `MAX_ARTES_POR_RODADA`; sem um teto de rodadas, uma fila que não anda viraria
 *  laço infinito. O laço também para sozinho na primeira rodada sem progresso —
 *  esta é a segunda trava, não a primeira. */
export const MAX_RODADAS_DE_ARTE = 40;

// ── O QUE SE MEDE ────────────────────────────────────────────────────────────

/** Uma peça que ainda não tem arte, e o que ela vai custar. */
export interface PecaSemArte {
  /** O que aparece para o operador. Nunca o id — o corpo do relatório sai em
   *  log de CI, e id de peça não é assunto de log. */
  titulo: string;
  formato: string;
  /** Quantas imagens PAGAS esta peça pede. Carrossel = uma por tela. */
  imagens: number;
  proporcao: "quadrada" | "retrato";
  custoUsd: number;
}

/** Peça que existe, não tem arte, e NÃO vai receber imagem — com o motivo. */
export interface PecaQueNaoRecebeArte {
  titulo: string;
  motivo: string;
}

/** Entrega já escrita que ainda não virou peça de calendário. */
export interface EntregaQueViraPeca {
  nome: string;
  /** Peças que o leitor consegue extrair do texto dela. */
  pecas: number;
  /** `null` = vira calendário. Preenchido = não vira, e por quê. */
  retidaPor: string | null;
}

export interface ProjetoNaPassada {
  projeto: string;
  /** O portão que barra a produção de TEXTO deste projeto, ou `null`. */
  portao: string | null;
  executionStatus: string | null;
  executionAttempts: number;
  cicloAberto: string | null;
  /** Especialistas escalados que ainda não entregaram NESTE ciclo. É o que a
   *  passada de texto produziria — zero quer dizer "o ciclo já está escrito". */
  especialistasQueFaltam: number;
  entregas: EntregaQueViraPeca[];
}

export type SituacaoDaProducao =
  | "so_medi"
  | "produzido"
  | "nada_a_produzir"
  | "sem_renderizador"
  | "cliente_nao_existe"
  | "nome_ambiguo"
  | "sem_autor"
  | "sem_motivo";

export interface RelatorioDaProducao {
  situacao: SituacaoDaProducao;
  cliente: string | null;
  projetos: ProjetoNaPassada[];
  /** Peças que existem hoje sem arte. */
  pecasSemArte: PecaSemArte[];
  /** Peças sem arte que a passada NÃO vai tentar, com o motivo de cada uma. */
  pecasParadas: PecaQueNaoRecebeArte[];
  /** Imagens que as peças de hoje pedem. */
  imagensPedidas: number;
  /** Peças NOVAS que nasceriam das entregas já escritas e ainda não agendadas.
   *  Elas também vão pedir imagem — na mesma passada, se couber no teto. */
  pecasNovasPrevistas: number;
  teto: {
    daPassada: number;
    doDiaPorCliente: number;
    /** Quantas imagens saem por rodada. É o RITMO, não o volume: a passada faz
     *  quantas rodadas precisar até o teto efetivo. */
    porRodada: number;
    gastasHoje: number;
    restamHoje: number;
    /** O menor dos tetos — é este que manda. */
    efetivo: number;
  };
  custo: {
    /** Estimativa para as imagens que de fato cabem no teto efetivo. */
    estimadoUsd: number;
    /** Estimativa se TUDO que está pedindo imagem fosse produzido. */
    seTudoSaisseUsd: number;
    fonte: string;
  };
  renderizador: { disponivel: boolean; motivo: string | null };
  /** Preenchido só quando `aplicar`. */
  feito?: {
    execucoes: Array<{ projeto: string; status: string; entregas: number; erro?: string }>;
    pecasCriadas: number;
    pecasRetidas: Array<{ nome: string; motivo: string }>;
    imagensProduzidas: number;
    rodadas: number;
    falhas: string[];
    /** Peças que a passada não tentou por teto diário. Não é falha. */
    semOrcamento: number;
  };
  veredito: string;
}

// ── A MEDIÇÃO ────────────────────────────────────────────────────────────────

/** Exportada para o refazimento com direção (`refazer-com-direcao.ts`) ler o
 *  MESMO preço pela MESMA régua. Duas cópias divergem no primeiro ajuste. */
export function proporcaoDe(formato: string | null | undefined): "quadrada" | "retrato" {
  // Espelha `artes.ts:325` — `story` é o único retrato. Se aquela linha mudar,
  // o teste `produzir-agora` que compara as duas fica vermelho.
  return (formato ?? "").toLowerCase() === "story" ? "retrato" : "quadrada";
}

/** Exportada pelo mesmo motivo de `proporcaoDe`: quem estima o custo de refazer
 *  tem de contar imagem exatamente como quem estima o custo de produzir. */
export function imagensDoPost(post: { format: string | null; scenesJson: string | null }): number {
  const f = (post.format ?? "").toLowerCase();
  if (f !== "carousel" && f !== "carrossel") return 1;
  let cenas: string[] = [];
  try {
    const v = JSON.parse(post.scenesJson ?? "[]");
    if (Array.isArray(v)) cenas = v.filter((x): x is string => typeof x === "string");
  } catch { /* corrompido = sem cenas, e sem cenas o carrossel nem tenta */ }
  return cenas.length;
}

/** O título curto que vai ao relatório. Nunca o id. */
function tituloCurto(caption: string | null): string {
  const t = (caption ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 72) : "(peça sem legenda)";
}

/**
 * Por que esta peça NÃO recebe imagem nesta passada — ou `null` quando recebe.
 *
 * As três razões são exatamente as de `produzirArtesPendentes`, lidas dos MESMOS
 * objetos. Uma cópia com régua própria diria "vai sair" para peça que a produção
 * recusa, e um número que promete o que a máquina não faz é pior que nenhum.
 */
export function motivoParaNaoReceberArte(post: {
  format: string | null;
  pillar: string | null;
  lastError: string | null;
  scenesJson: string | null;
}): string | null {
  const veredito = conferirPilar(post.pillar);
  if (veredito.bloqueado) return motivoCurto(veredito);

  const f = (post.format ?? "").toLowerCase();
  if (f === "reel" || f === "video") {
    return "é vídeo: a casa EDITA o material do cliente, não gera imagem — nada de imagem paga aqui";
  }
  if (contarTentativas(post.lastError) >= MAX_TENTATIVAS_POR_PECA) {
    return `já falhou ${MAX_TENTATIVAS_POR_PECA} vezes e desistiu sozinha — precisa de gente, não de mais uma tentativa paga`;
  }
  const telas = imagensDoPost(post);
  if ((f === "carousel" || f === "carrossel") && telas < 2) {
    return "carrossel sem telas descritas — não há o que desenhar";
  }
  if (telas > MAX_TELAS_POR_CARROSSEL) {
    return `carrossel com ${telas} telas e o teto é ${MAX_TELAS_POR_CARROSSEL} — cada tela é uma imagem paga`;
  }
  return null;
}

/** Quantas imagens este cliente já pagou HOJE. Mesma consulta de
 *  `abrirOrcamentoDoDia` em `artes.ts` — se as duas divergirem, o teto que o
 *  operador lê não é o teto que a produção aplica. */
export async function imagensGastasHoje(clientId: string): Promise<number | null> {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  return prisma.mediaAsset
    .count({
      where: {
        clientId,
        kind: "generated",
        fileName: { startsWith: "fundo-" },
        createdAt: { gte: inicioDoDia },
      },
    })
    .catch(() => null);
}

export interface PedidoDeProducao {
  cliente: string;
  /** Quem está mandando produzir. Obrigatório: a passada gasta dinheiro. */
  autor?: string;
  /** Por quê. Vai para o `ActivityEvent`. */
  motivo?: string;
  /** Teto de imagens desta passada. Fora da faixa é aparado, e o relatório diz. */
  teto?: number;
  /** `false` (padrão) = leitura pura, nada é gravado e nada é pago. */
  aplicar?: boolean;
}

/**
 * Mede — e, se mandarem, produz — as peças de UM cliente.
 *
 * Um cliente por chamada, de propósito: uma passada que produz a casa inteira
 * gasta imagem paga de quem ninguém autorizou.
 */
export async function produzirAgora(pedido: PedidoDeProducao): Promise<RelatorioDaProducao> {
  const aplicar = pedido.aplicar === true;

  const vazio = (situacao: SituacaoDaProducao, veredito: string, cliente: string | null = null): RelatorioDaProducao => ({
    situacao, cliente, projetos: [], pecasSemArte: [], pecasParadas: [],
    imagensPedidas: 0, pecasNovasPrevistas: 0,
    teto: {
      daPassada: 0, doDiaPorCliente: MAX_IMAGENS_POR_CLIENTE_POR_DIA,
      porRodada: MAX_ARTES_POR_RODADA, gastasHoje: 0, restamHoje: 0, efetivo: 0,
    },
    custo: { estimadoUsd: 0, seTudoSaisseUsd: 0, fonte: FONTE_DO_PRECO },
    renderizador: { disponivel: false, motivo: "não medido" },
    veredito,
  });

  // Autor e motivo ANTES do banco, e antes de qualquer leitura: uma passada que
  // gasta dinheiro sem dizer quem mandou e por quê não deixa rastro que sirva a
  // alguém. Mesma regra da reversão de aprovação, pelo mesmo motivo.
  if (aplicar && !(pedido.autor ?? "").trim()) {
    return vazio("sem_autor", "Quem está mandando produzir? Passada que gasta imagem paga sem autor não deixa rastro. Nada foi lido nem gravado.");
  }
  if (aplicar && !(pedido.motivo ?? "").trim()) {
    return vazio("sem_motivo", "Por que produzir agora? O motivo vai para o registro. Nada foi lido nem gravado.");
  }

  const achado = await acharClienteUnico(pedido.cliente).catch(() => ({ tipo: "nenhum" as const }));
  if (achado.tipo === "nenhum") {
    return vazio("cliente_nao_existe", `Nenhum cliente com o nome "${pedido.cliente}". Confira a grafia — nada foi lido nem gravado.`);
  }
  if (achado.tipo === "ambiguo") {
    return vazio("nome_ambiguo", `"${pedido.cliente}" casa com ${achado.candidatos} clientes e esta passada não adivinha: produzir para o cliente errado gasta o dinheiro dele e mostra o trabalho de um a outro. Repita com o nome completo.`);
  }

  const clientId = achado.id;
  const cliente = achado.nome;

  // ── O TETO, APARADO E DECLARADO ───────────────────────────────────────────
  const tetoPedido = Number.isFinite(pedido.teto) ? Math.floor(pedido.teto as number) : TETO_PADRAO_DA_PASSADA;
  const tetoDaPassada = Math.max(0, Math.min(tetoPedido, TETO_MAXIMO_DA_PASSADA));

  // ── OS PROJETOS ───────────────────────────────────────────────────────────
  const projetos = await prisma.project.findMany({
    where: { clientId },
    select: {
      id: true, name: true, workspaceId: true, clientRequestId: true, directionApprovedAt: true,
      presentedAt: true, executionStatus: true, executionAttempts: true, agents: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const retratoDosProjetos: ProjetoNaPassada[] = [];
  /** Projetos onde vale chamar o motor de texto: há especialista faltando OU o
   *  banco registrou um pedido de produção que não foi atendido. Chamar onde não
   *  há nada a fazer paga leitura de contexto por nada. */
  const projetosParaExecutar: string[] = [];
  /** Projetos que podem ter entrega esperando virar calendário. */
  const projetosParaAgendar: string[] = [];
  let pecasNovasPrevistas = 0;

  for (const p of projetos) {
    const portao = portaoQueBarraAProducao(p);
    const ciclo = await prisma.cycle
      .findFirst({
        where: { projectId: p.id, status: { in: ["aberto", "entregue"] } },
        orderBy: { reference: "desc" },
        select: { id: true, reference: true },
      })
      .catch(() => null);

    const entregasDoCiclo = await prisma.deliverable.findMany({
      where: { projectId: p.id, cycleId: ciclo?.id ?? null },
      select: { ownerAgentId: true },
    }).catch(() => []);
    const jaProduziram = new Set(entregasDoCiclo.map((d) => d.ownerAgentId).filter((v): v is string => !!v));
    const escalados = (() => {
      try { const v = JSON.parse(p.agents ?? "[]"); return Array.isArray(v) ? (v as string[]) : []; }
      catch { return [] as string[]; }
    })();
    const faltam = escalados.filter((id) => !jaProduziram.has(id)).length;

    // ── AS ENTREGAS QUE AINDA NÃO VIRARAM PEÇA ──────────────────────────────
    // Só entrega de tipo publicável, e a régua de quem pode virar calendário é
    // a MESMA função que o agendador usa. Entrega já agendada não conta: a
    // idempotência do agendador é pelo `deliverableId`.
    const publicaveis = await prisma.deliverable.findMany({
      where: { projectId: p.id, type: { in: ["social", "video"] } },
      select: { id: true, name: true, content: true, type: true, visibility: true, revisionStatus: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => []);
    const jaAgendadas = new Set(
      (await prisma.socialPost
        .findMany({ where: { deliverableId: { in: publicaveis.map((d) => d.id) } }, select: { deliverableId: true } })
        .catch(() => []))
        .map((s) => s.deliverableId)
        .filter((v): v is string => !!v),
    );

    const entregas: EntregaQueViraPeca[] = [];
    for (const d of publicaveis) {
      if (jaAgendadas.has(d.id)) continue;
      const retidaPor = motivoParaNaoVirarCalendario(d);
      // O agendador só roda depois de o cliente ter visto o pacote. Sem
      // `presentedAt`, ele devolve zero e é correto — não é falha desta passada.
      const semApresentacao = p.presentedAt ? null : "o pacote ainda não foi apresentado ao cliente — o calendário só nasce depois disso";
      const pecas = extrairPecas(d.content ?? "", d.type)
        .filter((peca) => !conferirPilar(peca.pilar).bloqueado).length;
      entregas.push({ nome: d.name, pecas, retidaPor: retidaPor ?? semApresentacao });
      if (!retidaPor && !semApresentacao && pecas > 0) {
        pecasNovasPrevistas += pecas;
        if (!projetosParaAgendar.includes(p.id)) projetosParaAgendar.push(p.id);
      }
    }

    retratoDosProjetos.push({
      projeto: p.name,
      portao,
      executionStatus: p.executionStatus,
      executionAttempts: p.executionAttempts ?? 0,
      cicloAberto: ciclo?.reference ?? null,
      especialistasQueFaltam: faltam,
      entregas,
    });

    const pediuProducao = p.executionStatus === "pending" || p.executionStatus === "failed";
    if (!portao && (faltam > 0 || pediuProducao)) projetosParaExecutar.push(p.id);
  }

  // ── AS PEÇAS QUE JÁ EXISTEM E NÃO TÊM ARTE ────────────────────────────────
  const semArte = await prisma.socialPost.findMany({
    where: { clientId, mediaUrl: null, status: { in: ["draft", "scheduled", "approved"] } },
    select: { caption: true, format: true, pillar: true, lastError: true, scenesJson: true },
    orderBy: { scheduledFor: "asc" },
  }).catch(() => []);

  const pecasSemArte: PecaSemArte[] = [];
  const pecasParadas: PecaQueNaoRecebeArte[] = [];
  for (const post of semArte) {
    const motivo = motivoParaNaoReceberArte(post);
    if (motivo) { pecasParadas.push({ titulo: tituloCurto(post.caption), motivo }); continue; }
    const imagens = imagensDoPost(post);
    const proporcao = proporcaoDe(post.format);
    pecasSemArte.push({
      titulo: tituloCurto(post.caption),
      formato: post.format ?? "feed",
      imagens,
      proporcao,
      custoUsd: arredondar(imagens * PRECO_DE_TABELA_USD[proporcao]),
    });
  }
  const imagensPedidas = pecasSemArte.reduce((s, p) => s + p.imagens, 0);

  // ── O TETO DO DIA ─────────────────────────────────────────────────────────
  const gastasHoje = await imagensGastasHoje(clientId);
  // Fail-closed: contador ilegível vira teto ZERO, nunca teto cheio. Um teto de
  // gasto que se abre quando o banco tosse não é teto.
  const restamHoje = gastasHoje === null ? 0 : Math.max(0, MAX_IMAGENS_POR_CLIENTE_POR_DIA - gastasHoje);
  const efetivo = Math.min(tetoDaPassada, restamHoje);

  // O que a passada tentaria: o que as peças de hoje pedem MAIS o que as peças
  // novas vão pedir. Peça nova custa pelo menos uma imagem cada — o carrossel
  // que nasce dela custa mais, e por isso o número é rotulado "pelo menos".
  const totalPedido = imagensPedidas + pecasNovasPrevistas;
  const vaoSair = Math.min(totalPedido, efetivo);

  const renderizador = await renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null }));

  const relatorio: RelatorioDaProducao = {
    situacao: "so_medi",
    cliente,
    projetos: retratoDosProjetos,
    pecasSemArte,
    pecasParadas,
    imagensPedidas,
    pecasNovasPrevistas,
    teto: {
      daPassada: tetoDaPassada,
      doDiaPorCliente: MAX_IMAGENS_POR_CLIENTE_POR_DIA,
      porRodada: MAX_ARTES_POR_RODADA,
      gastasHoje: gastasHoje ?? 0,
      restamHoje,
      efetivo,
    },
    custo: {
      // O preço quadrado é o piso e o retrato é o teto; a estimativa usa o preço
      // REAL de cada peça medida e o quadrado para as peças que ainda não
      // existem (o formato delas só se sabe depois de o texto virar peça).
      estimadoUsd: arredondar(
        custoDasPrimeiras(pecasSemArte, efetivo)
        + Math.max(0, Math.min(pecasNovasPrevistas, efetivo - Math.min(imagensPedidas, efetivo))) * PRECO_DE_TABELA_USD.quadrada,
      ),
      seTudoSaisseUsd: arredondar(
        pecasSemArte.reduce((s, p) => s + p.custoUsd, 0) + pecasNovasPrevistas * PRECO_DE_TABELA_USD.quadrada,
      ),
      fonte: FONTE_DO_PRECO,
    },
    renderizador: {
      disponivel: renderizador.disponivel,
      motivo: renderizador.disponivel ? null : SEM_NAVEGADOR,
    },
    veredito: "",
  };

  if (!aplicar) {
    relatorio.veredito =
      `Leitura pura: NADA foi gravado e nenhuma imagem foi paga. ` +
      `${cliente} tem ${pecasSemArte.length} peça(s) esperando arte (${imagensPedidas} imagem(ns)) e ` +
      `${pecasNovasPrevistas} peça(s) nova(s) sairiam das entregas já escritas. ` +
      `Teto efetivo desta passada: ${efetivo} imagem(ns) — sairiam ${vaoSair}, ` +
      `custo estimado US$ ${relatorio.custo.estimadoUsd.toFixed(2)} (${FONTE_DO_PRECO}). ` +
      (renderizador.disponivel ? "" : "⚠️ SEM NAVEGADOR: com aplicar=1 a passada pararia antes de pagar a primeira imagem. ") +
      `Confira a lista e rode de novo com aplicar=1.`;
    return relatorio;
  }

  // ── DAQUI PARA BAIXO GRAVA ────────────────────────────────────────────────

  if (!renderizador.disponivel) {
    relatorio.situacao = "sem_renderizador";
    relatorio.veredito =
      "A casa não consegue aplicar o molde neste ambiente, então a passada parou ANTES de pagar a primeira imagem. " +
      "Nenhuma peça foi criada e nada foi gravado. " + SEM_NAVEGADOR;
    return relatorio;
  }

  const feito: NonNullable<RelatorioDaProducao["feito"]> = {
    execucoes: [], pecasCriadas: 0, pecasRetidas: [], imagensProduzidas: 0, rodadas: 0, falhas: [], semOrcamento: 0,
  };
  relatorio.feito = feito;

  // 1) O TEXTO. `runProjectExecution` é idempotente e traz os próprios portões
  //    — inclusive o de direção, que ele mesmo recusa. Não há atalho aqui.
  for (const projectId of projetosParaExecutar) {
    const nome = projetos.find((p) => p.id === projectId)?.name ?? projectId;
    try {
      const r = await runProjectExecution(projectId);
      feito.execucoes.push({ projeto: nome, status: r.status, entregas: r.produced.length, ...(r.error ? { erro: r.error } : {}) });
    } catch (err) {
      feito.execucoes.push({ projeto: nome, status: "failed", entregas: 0, erro: err instanceof Error ? err.message.slice(0, 160) : "erro" });
    }
  }

  // 2) A ENTREGA VIRA PEÇA. Idempotente por entrega; cria `draft`, que é "data
  //    proposta, sem aval do cliente". Nada publica.
  //    Todo projeto entra: a execução acima pode ter acabado de criar entrega
  //    nova, e a lista medida antes dela não a conhece.
  for (const p of projetos) {
    try {
      const r = await agendarPostsDaEntrega(p.id);
      feito.pecasCriadas += r.criados;
      for (const x of r.retidas) feito.pecasRetidas.push({ nome: x.nome, motivo: x.motivo });
      for (const x of r.bloqueadasPorPilar) feito.pecasRetidas.push({ nome: `pilar ${x.pilar}`, motivo: x.motivo });
      for (const nome of r.naoInterpretadas) feito.pecasRetidas.push({ nome, motivo: "o leitor não conseguiu quebrar o texto em peças" });
    } catch (err) {
      feito.falhas.push(`calendário de ${p.name}: ${err instanceof Error ? err.message.slice(0, 160) : "erro"}`);
    }
  }

  // 3) A IMAGEM — a parte paga. Recortada NESTE cliente, em rodadas de
  //    `MAX_ARTES_POR_RODADA`, até o teto efetivo ou até a primeira rodada sem
  //    progresso. Rodada que não produz nada não melhora na seguinte: a fila é
  //    ordenada igual e as peças que desistiram continuam desistindo.
  //
  //    O teto DIÁRIO por cliente segue valendo por dentro (`artes.ts`) e é
  //    fail-closed: ele é quem tem a última palavra sobre gasto.
  while (feito.imagensProduzidas < efetivo && feito.rodadas < MAX_RODADAS_DE_ARTE) {
    feito.rodadas += 1;
    const r: ArtesFeitas = await produzirArtesPendentes({ clientId }).catch((err) => ({
      produzidas: 0,
      falhas: [{ postId: "", erro: err instanceof Error ? err.message.slice(0, 160) : "erro" }],
      desistiram: [], semOrcamento: [], semPagamento: [],
    }));
    feito.imagensProduzidas += r.produzidas;
    feito.semOrcamento += r.semOrcamento.length;
    for (const f of r.falhas) feito.falhas.push(f.erro.slice(0, 200));
    if (r.semRenderizador) { feito.falhas.push(r.semRenderizador); break; }
    if (r.produzidas === 0) break;
    // ── O RESPIRO ENTRE RODADAS ───────────────────────────────────────────
    // Volume alto não pode virar rajada. Cada imagem já leva dezenas de
    // segundos, então esta pausa não muda o tempo total de forma sensível — ela
    // existe para que uma fila grande NUNCA vire lote em ritmo de máquina, que
    // é o formato exato do incidente de 03/08. Custa segundos; evita a conta.
    if (feito.imagensProduzidas < efetivo) await respirar(PAUSA_ENTRE_RODADAS_MS);
  }

  relatorio.situacao =
    feito.pecasCriadas === 0 && feito.imagensProduzidas === 0 && feito.execucoes.every((e) => e.entregas === 0)
      ? "nada_a_produzir"
      : "produzido";

  await prisma.activityEvent.create({
    data: {
      workspaceId: projetos[0]?.workspaceId ?? "",
      clientId,
      type: "producao_pedida_a_mao",
      message:
        `${pedido.autor} mandou produzir as peças de ${cliente}: ${feito.pecasCriadas} peça(s) criada(s), ` +
        `${feito.imagensProduzidas} imagem(ns) paga(s) em ${feito.rodadas} rodada(s), teto efetivo ${efetivo}. ` +
        `Motivo: ${pedido.motivo}. Nada foi publicado.`.slice(0, 900),
    },
  }).catch(() => { /* best-effort: o rastro não pode desfazer o trabalho */ });

  relatorio.veredito =
    `${feito.pecasCriadas} peça(s) criada(s) e ${feito.imagensProduzidas} imagem(ns) produzida(s) ` +
    `(custo estimado US$ ${arredondar(feito.imagensProduzidas * PRECO_DE_TABELA_USD.quadrada).toFixed(2)} a US$ ` +
    `${arredondar(feito.imagensProduzidas * PRECO_DE_TABELA_USD.retrato).toFixed(2)}, ${FONTE_DO_PRECO}). ` +
    `Peça nasce em RASCUNHO, com data proposta e sem aval do cliente — NADA foi publicado. ` +
    (feito.semOrcamento > 0 ? `${feito.semOrcamento} peça(s) ficaram para amanhã pelo teto diário do cliente. ` : "") +
    (feito.pecasRetidas.length > 0 ? `${feito.pecasRetidas.length} entrega(s) NÃO viraram peça — a lista diz por quê. ` : "");

  return relatorio;
}

// ── auxiliares ───────────────────────────────────────────────────────────────

const FONTE_DO_PRECO =
  "estimativa pela tabela pública do gpt-image-1 em qualidade alta — NÃO é fatura medida";

const SEM_NAVEGADOR =
  "não há Chromium para rasterizar o molde neste ambiente. Diagnóstico ao vivo em GET /api/capacidades → `montar-molde`.";

/** O respiro entre rodadas de imagem. Ver o comentário no laço. */
export const PAUSA_ENTRE_RODADAS_MS = 2_000;

function respirar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

/** O custo das primeiras N imagens da fila, na ordem em que a produção as pega.
 *  Somar tudo e cortar pelo teto daria um número que a passada não vai gastar. */
function custoDasPrimeiras(pecas: PecaSemArte[], teto: number): number {
  let restam = teto;
  let total = 0;
  for (const p of pecas) {
    if (restam <= 0) break;
    const quantas = Math.min(p.imagens, restam);
    total += quantas * PRECO_DE_TABELA_USD[p.proporcao];
    restam -= quantas;
  }
  return total;
}

/**
 * O portão que barra a produção de texto deste projeto — ou `null`.
 *
 * Espelha, em leitura, as recusas que `runProjectExecution` faz por escrito. Ele
 * continua sendo quem decide; isto existe para o operador saber ANTES de apertar
 * por que um projeto não vai andar.
 */
export function portaoQueBarraAProducao(p: {
  clientRequestId: string | null;
  directionApprovedAt: Date | null;
  executionAttempts: number | null;
}): string | null {
  if (!p.clientRequestId) return "projeto sem solicitação vinculada — o motor recusa";
  if (!p.directionApprovedAt) {
    return "o cliente ainda não aprovou a DIREÇÃO — a produção não começa antes disso, e este botão não pula esse portão";
  }
  return null;
}

// ─── A SETA QUE FALTAVA: A ENTREGA VIRA PEÇA NA RODADA AUTOMÁTICA ────────────
//
// ── O DEFEITO, MEDIDO EM PRODUÇÃO (24/08/2026, case Farol 27) ───────────────
//
// A cadeia andou inteira e produziu 14 entregas de texto. **Artes: zero.** E a
// causa NÃO era o gerador de imagem: `renderizadorDisponivel()` respondeu
// "pronto", a chave estava no cofre, e o despertador chamou
// `produzirArtesPendentes()` a cada 5 minutos, como sempre chamou.
//
// A causa é que ele chamou **sobre uma tabela vazia**. `produzirArtesPendentes`
// lê `SocialPost`; quem CRIA `SocialPost` é `agendarPostsDaEntrega`; e essa
// função tem três chamadores — `marcos.apresentar`, `mes.apresentarCiclo` e a
// repescagem da escada — e os três são EVENTOS QUE JÁ PASSARAM. Entrega que
// fica elegível depois do último desses eventos (a Qualidade reavaliou, a
// escada liberou, a refação terminou) nunca mais é colhida por ninguém.
//
// A prova, lida da produção com a rota de leitura pura, sem gastar um centavo:
// o Farol 27 tinha **0 peça(s) esperando arte** e **2 peça(s) novas previstas**
// — duas entregas prontas para virar peça paradas desde as 22:33, enquanto a
// perna de arte do despertador rodava por cima de nada.
//
// ── POR QUE AQUI, E POR QUE NÃO UM SEGUNDO CAMINHO ──────────────────────────
//
// Esta função NÃO produz nada e não gasta: ela chama a MESMA
// `agendarPostsDaEntrega` que a porta manual chama, com os MESMOS portões por
// dentro (escada de exposição, parecer da Qualidade, pilar bloqueado). Uma
// cópia da colheita começaria idêntica e divergiria no primeiro ajuste — e um
// calendário que discorda do outro é pior que nenhum, porque é acreditado.
//
// ── NADA AQUI AFROUXA TRAVA ─────────────────────────────────────────────────
//
//   • **Pagamento (D-0A7):** a peça criada aqui é `draft` e não custa nada. Quem
//     gasta é a arte, e o portão dela está onde o dinheiro sai
//     (`artes.ts` → `conferirPagamentoDaAncora`). Peça sem pagamento nasce,
//     espera, e não vira imagem.
//   • **Teto diário por cliente:** intocado, e fail-closed em `artes.ts`.
//   • **Portão de direção de arte:** intocado. Ele reprova direção genérica
//     ANTES de gastar, e continua reprovando — isto não muda uma linha dele.
//   • **Nada publica.** `draft` é "data proposta, sem aval do cliente".
//
// ── SÓ PROJETO JÁ APRESENTADO ───────────────────────────────────────────────
//
// `presentedAt: { not: null }` é a mesma condição que `agendarPostsDaEntrega`
// exige por dentro. Filtrar aqui não é uma segunda régua: é não bater no banco
// uma vez por projeto para ouvir "não" — a régua continua sendo dela.

/** Quantos projetos uma colheita automática visita. Teto de laço, não de
 *  volume: a consulta é barata, mas uma rodada a cada 5 minutos não pode
 *  varrer uma casa inteira sem limite declarado. */
export const MAX_PROJETOS_POR_COLHEITA = 50;

export interface ColheitaFeita {
  /** Peças `draft` criadas nesta passada. */
  criadas: number;
  /** Projetos visitados. */
  projetos: number;
  /** Entregas que EXISTEM e não viraram peça, com o motivo. Nunca silêncio:
   *  o que é barrado aqui é trabalho já pago. */
  retidas: Array<{ nome: string; motivo: string }>;
  /** Falhas de leitura/escrita — não derrubam a rodada. */
  falhas: string[];
}

/**
 * Colhe, na casa inteira, as entregas já apresentadas que ainda não viraram
 * peça de calendário. Não gasta, não publica, não aprova.
 */
export async function colherPecasDasEntregas(): Promise<ColheitaFeita> {
  const saida: ColheitaFeita = { criadas: 0, projetos: 0, retidas: [], falhas: [] };

  const projetos = await prisma.project.findMany({
    where: { presentedAt: { not: null } },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJETOS_POR_COLHEITA,
  }).catch((err) => {
    saida.falhas.push(`não consegui ler os projetos: ${err instanceof Error ? err.message.slice(0, 160) : "erro"}`);
    return [] as Array<{ id: string; name: string }>;
  });

  saida.projetos = projetos.length;
  for (const p of projetos) {
    try {
      const r = await agendarPostsDaEntrega(p.id);
      saida.criadas += r.criados;
      for (const x of r.retidas) saida.retidas.push({ nome: x.nome, motivo: x.motivo });
      for (const x of r.bloqueadasPorPilar) saida.retidas.push({ nome: `pilar ${x.pilar}`, motivo: x.motivo });
      for (const nome of r.naoInterpretadas) saida.retidas.push({ nome, motivo: "o leitor não conseguiu quebrar o texto em peças" });
    } catch (err) {
      saida.falhas.push(`calendário de ${p.name}: ${err instanceof Error ? err.message.slice(0, 160) : "erro"}`);
    }
  }
  return saida;
}
