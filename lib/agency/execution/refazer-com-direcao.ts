// refazer-com-direcao.ts — AS PEÇAS QUE JÁ EXISTEM NASCEM DE NOVO COM A DIREÇÃO
// DE ARTE QUE SEMPRE FOI ESCRITA PARA ELAS.
//
// ─── O PROBLEMA, EM UMA FRASE (15/08/2026) ──────────────────────────────────
//
// A esteira foi consertada e **não tem o que mostrar**: a direção de arte chega
// ao gerador (`artes.ts`, `Cena a retratar`), a composição sai do cérebro da
// marca (`composicaoDoPostSimples`) e o portão de pixel mede o fundo cru
// (`portao-do-fundo.ts`) — mas todo o estoque do cliente foi produzido ANTES
// disso e já tem `mediaUrl`. A rodada de arte procura `mediaUrl: null`, então
// ela mede "0 peça(s) esperando arte" e está certa: não há peça esperando. Há
// peça PRONTA PELO CAMINHO ERRADO, que é outra coisa e ninguém estava
// perguntando.
//
// ─── O QUE ISTO NÃO É: GERAR CONTEÚDO ───────────────────────────────────────
//
// A direção de arte **nunca esteve perdida**. O especialista de copy sempre a
// escreveu (o campo `visual`, `especialistas.ts`), e `run-execution.ts`
// (`deliverableMarkdown`) sempre a gravou no markdown do entregável — a linha
// "- Visual: ..." está lá desde 24/07/2026. Quem não lia era `extrairPecas`
// (`publicacao.ts`), que capturava Legenda, Formato, Pilar e Cenas e passava
// por cima do resto.
//
// Ou seja: o texto da direção **está no banco**, dentro do `Deliverable.content`
// de origem de cada peça. Preencher `SocialPost.artDirection` a partir dele é
// **backfill de um campo que sempre existiu no texto e nunca foi lido** — com o
// MESMO leitor que a esteira usa hoje (`extrairPecas`), nunca com um segundo.
//
// ⚠️ **E é fail-closed.** Peça cujo entregável de origem NÃO traz a direção não
// é refeita. Ela cairia no fallback (a legenda como cena), que é exatamente o
// defeito que se está consertando — pagaria imagem para reproduzir o problema.
// Inventar direção de arte aqui seria a casa escrevendo conteúdo em nome do
// especialista, e isso não acontece.
//
// ─── POR QUE NÃO EXISTE UM TERCEIRO CAMINHO DE COMPOSIÇÃO ───────────────────
//
// Este módulo **não compõe nada**. Ele SELECIONA, BARRA, faz o backfill do
// campo e chama `produzirArtesPendentes` com a lista nomeada
// (`RecorteDaRodadaDeArte.refazer`). Todo o trabalho — portão de pilar, teto
// diário, foto real do cliente antes da gerada, portão do fundo, composição da
// marca, trava de texto, gravação — é o laço que já existia, byte por byte.
//
// A casa já tem dois caminhos de recomposição (`recomporPecas` para peça única,
// `recomporCarrosseis` para as telas) e um terceiro foi justamente o que
// produziu o defeito do carrossel recomposto pela função de peça única. Os dois
// existentes, porém, **não servem para este conserto**, e a razão é medida:
// eles reaproveitam o `fundo-<postId>.png` guardado, e esse fundo foi comprado
// com o prompt VELHO (a legenda como cena). Recompor deles trocaria o molde por
// cima do mesmo clipart genérico. **A direção só vira pixel na hora de gerar a
// imagem** — por isso esta passada CUSTA, e por isso ela é leitura pura por
// padrão.
//
// ─── O QUE NÃO SE TOCA ──────────────────────────────────────────────────────
//
//   • `scheduledFor`, `status` e `caption` — a peça é a mesma; muda o pixel.
//     A única escrita fora da arte é `artDirection` (o backfill).
//   • **Nada publica.** O interruptor global de publicação orgânica não é lido
//     aqui nem no laço que este módulo chama — há teste de fonte que o prova,
//     e é por isso que o nome dele não aparece escrito em lugar nenhum daqui.
//   • **Peça com aprovação registrada do cliente NÃO é refeita.** A aprovação
//     fica presa ao `SocialPost`, não ao arquivo (`aprovacao-da-peca.ts`):
//     trocar os pixels faria a aprovação dele valer para uma imagem que ele
//     nunca viu. Barrada com motivo, sempre — nunca em silêncio.

import { prisma } from "@/lib/db/client";
import { acharClienteUnico } from "@/lib/agency/esteira/cards-de-aprovacao";
import { extrairPecas } from "@/lib/agency/esteira/publicacao";
import { aprovacaoDaPeca } from "@/lib/agency/esteira/aprovacao-da-peca";
import {
  produzirArtesPendentes, nomeDoFundo,
  MAX_ARTES_POR_RODADA, MAX_IMAGENS_POR_CLIENTE_POR_DIA,
  type ArtesFeitas,
} from "@/lib/agency/execution/artes";
import {
  motivoParaNaoReceberArte, imagensDoPost, proporcaoDe, imagensGastasHoje,
  PRECO_DE_TABELA_USD,
} from "@/lib/agency/execution/produzir-agora";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";

/**
 * O MARCO: a partir daqui, fundo gerado nasceu com a direção de arte no prompt.
 *
 * ── Por que uma data, e não uma marca em `lastError` ────────────────────────
 *
 * Porque esta passada precisa ser **idempotente pelo DADO**, e não pela memória
 * de quem apertou. Cada geração paga vira exatamente um arquivo
 * `fundo-<postId>.png` no armazenamento (é assim que o teto diário conta o
 * gasto, `artes.ts`). Então a pergunta "esta peça já foi refeita?" tem resposta
 * medida: **o fundo mais novo dela é anterior ou posterior ao marco?**
 *
 * É a mesma ideia de `pecasComMarcaMaisNovaQueAArte` (`artes.ts`), que compara
 * a data do material de marca com a data da arte. Duas datas, nenhuma memória.
 *
 * A consequência que interessa: **uma chamada que estourou o tempo da
 * requisição não faz a próxima pagar de novo pelas peças que já saíram.** O
 * fundo delas já é novo, e elas simplesmente não são mais selecionadas. Foi
 * esse falso negativo — o Actions lendo timeout como falha depois de o trabalho
 * ter sido feito — que quase fez a casa pagar duas vezes em 15/08.
 *
 * O valor é o instante em que a direção passou a atravessar a porta da imagem
 * (`SocialPost.artDirection` + `artes.ts:371`, commits `dd286a2`/`afb198a`).
 *
 * ── CORRIGIDO DE MEIA-NOITE PARA A HORA DO DEPLOY (Diretor, 15/08/2026) ─────
 *
 * O valor era `T00:00:00Z`, com a justificativa de ser conservador para o lado
 * do dinheiro: peça feita no dia do deploy mas antes dele ficaria de fora, e
 * ficar de fora não gasta. O raciocínio está certo e o caso real o derrubou.
 *
 * **Medido na primeira passada, contra produção:** 7 peças do CityJobs foram
 * produzidas em 15/08 às 02:11 e ~04:50 UTC — depois da meia-noite e ANTES do
 * deploy das 05:08. Elas nasceram pelo caminho VELHO, com a legenda no lugar da
 * cena, e a régua as classificou como `ja_refeita_com_direcao`. O relatório
 * dizia "0 elegíveis" com a frase mais perigosa que existe aqui: *ou já foram
 * todas refeitas, ou estão todas barradas*.
 *
 * Ser conservador com dinheiro barato (US$ 0,167 por imagem) escondeu o
 * trabalho que era o objetivo da noite. A economia possível era de US$ 1,17; o
 * custo era o CEO abrir a tela de manhã e ver a peça velha.
 *
 * O marco passa a ser o instante do deploy **confirmado em `/api/health`**, não
 * o começo do dia. A conta continua sendo duas datas e nenhuma memória.
 */
export const MARCO_DA_DIRECAO_NA_IMAGEM = new Date("2026-08-15T05:20:00.000Z");

/**
 * TETO POR CHAMADA, e ele é sobre TEMPO — não sobre volume.
 *
 * Medido no caminho: o gerador de imagem aborta em 90s (`lib/ai/design-engine.ts`,
 * `TIMEOUT_MS`), e é uma imagem por peça simples (carrossel é uma por tela). No
 * pior caso, 3 peças = ~4,5 min de geração, mais download e rasterização.
 *
 * A passada anterior pediu 10 de uma vez, estourou o tempo da requisição e o
 * Actions leu como FALHA depois de o trabalho ter sido feito. Um lote que não
 * cabe no tempo não é ambição: é um relatório que mente sobre o que aconteceu.
 * O placar diz quantas faltam, e apertar de novo continua de onde parou.
 */
export const LOTE_PADRAO = 3;

/** Teto do teto. Acima disto o pior caso não cabe em requisição nenhuma, e
 *  `MAX_ARTES_POR_RODADA` (6) manda por baixo de qualquer forma. */
export const LOTE_MAXIMO = 6;

/** A fonte do preço, dita em todo lugar onde o número aparece. */
export const FONTE_DO_PRECO = "estimativa pela tabela pública do gpt-image-1 em qualidade alta — NÃO é fatura";

// ─── O QUE SE MEDE ──────────────────────────────────────────────────────────

/** Por que uma peça NÃO é refeita. Vocabulário fechado: motivo em texto livre
 *  vira seis frases para o mesmo fato e ninguém consegue agrupar o placar. */
export type MotivoDeBarrar =
  | "aprovada_pelo_cliente"
  | "sem_entregavel_de_origem"
  | "legenda_nao_casa_no_entregavel"
  | "sem_direcao_no_entregavel"
  | "ja_refeita_com_direcao"
  | "sem_fundo_para_datar"
  | "nao_recebe_arte";

/** A frase de cada motivo. Uma só, na casa inteira. */
export const FRASE_DE_BARRAR: Record<MotivoDeBarrar, string> = {
  aprovada_pelo_cliente:
    "o cliente JÁ aprovou esta peça — a aprovação fica presa ao post e não ao arquivo, " +
    "e refazer faria a aprovação dele valer para uma imagem que ele nunca viu",
  sem_entregavel_de_origem:
    "a peça não aponta para o entregável que a gerou (ou ele não tem texto) — " +
    "não há de onde ler a direção de arte, e inventá-la seria escrever conteúdo",
  legenda_nao_casa_no_entregavel:
    "não achei no entregável de origem UMA peça com esta legenda exata — casar por ordem ou por sobra " +
    "já montou carrossel com o logo dentro nesta casa (auditoria de 04/08), e sobra não é evidência de correspondência",
  sem_direcao_no_entregavel:
    "o entregável de origem NÃO traz Visual/Direção para esta peça — refazer a mandaria de novo " +
    "para o fallback (a legenda como cena), que é exatamente o defeito que se está consertando",
  ja_refeita_com_direcao:
    "o fundo desta peça é mais novo que o marco da direção — ela já nasceu (ou já foi refeita) pelo caminho novo",
  sem_fundo_para_datar:
    "esta peça não tem fundo gerado guardado, então não dá para saber se ela é velha — " +
    "e peça montada sobre a FOTO REAL do cliente é justamente uma dessas. Ausência de informação não é informação",
  nao_recebe_arte: "a produção não daria arte a esta peça de qualquer forma",
};

/** Uma peça que SERIA refeita, e o que ela custa. */
export interface PecaParaRefazer {
  /** O que aparece para o operador. Nunca o id: o corpo desta resposta pode ser
   *  lido por quem não é dono do banco, e id de peça não é assunto de relatório. */
  titulo: string;
  formato: string;
  /** Quantas imagens PAGAS ela pede. Carrossel = uma por tela. */
  imagens: number;
  custoUsd: number;
  /** A direção de arte já estava gravada no post, ou saiu do entregável agora? */
  direcao: "ja_estava_no_post" | "lida_do_entregavel";
  /** As primeiras palavras da direção — o que prova que ela EXISTE, sem
   *  despejar o conteúdo do cliente inteiro num relatório. */
  direcaoComeca: string;
}

/** Uma peça barrada, com o motivo. */
export interface PecaBarrada {
  titulo: string;
  motivo: MotivoDeBarrar;
  detalhe: string;
}

export interface RelatorioDeRefazimento {
  situacao:
    | "so_medi" | "refeito" | "nada_a_refazer" | "sem_renderizador"
    | "cliente_nao_existe" | "nome_ambiguo" | "sem_autor" | "sem_motivo";
  cliente: string | null;
  /** Quantas peças do cliente foram OLHADAS (o universo da medição). */
  olhadas: number;
  /** As elegíveis, na ordem em que a passada as pegaria. */
  elegiveis: PecaParaRefazer[];
  /** As barradas, agrupadas por motivo — um motivo repetido 6 vezes é uma linha. */
  barradas: Array<{ motivo: MotivoDeBarrar; quantas: number; detalhe: string }>;
  /**
   * A RESPOSTA DA PERGUNTA QUE DECIDE O CONSERTO: em quantas peças o entregável
   * de origem realmente trazia a direção de arte, e em quantas não trazia.
   */
  direcaoNoEntregavel: { achou: number; naoAchou: number };
  lote: { pedido: number; efetivo: number; maximo: number };
  /** Quantas elegíveis ficam para as próximas chamadas. É o "faltam N". */
  faltamDepoisDesteLote: number;
  custo: {
    /** Só o que cabe NESTE lote. */
    desteLoteUsd: number;
    /** Todas as elegíveis, se o botão for apertado até o fim. */
    deTodasAsElegiveisUsd: number;
    fonte: string;
  };
  teto: { doDiaPorCliente: number; gastasHoje: number | null; restamHoje: number | null };
  renderizador: { disponivel: boolean };
  /** Preenchido só quando `aplicar`. */
  feito?: {
    /** Peças cujo `artDirection` foi gravado a partir do entregável. */
    direcoesGravadas: number;
    /** Quantas peças a rodada de arte deu por produzidas. */
    refeitas: number;
    falhas: string[];
    desistiram: number;
    semOrcamento: number;
  };
  veredito: string;
}

// ─── A LEITURA DA DIREÇÃO, NO ENTREGÁVEL DE ORIGEM ──────────────────────────

/** Normaliza só o espaço em branco. NÃO baixa caixa nem tira acento: a legenda
 *  foi gravada como veio do markdown, e "quase a mesma legenda" não é a mesma. */
function mesmaLegenda(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const x = n(a);
  return x.length > 0 && x === n(b);
}

export type LeituraDaDirecao =
  | { ok: true; direcao: string }
  | { ok: false; motivo: Extract<MotivoDeBarrar, "legenda_nao_casa_no_entregavel" | "sem_direcao_no_entregavel"> };

/**
 * A direção de arte DESTA peça, dentro do texto do entregável que a gerou.
 *
 * A peça é reencontrada pela LEGENDA, e por igualdade exata: é a mesma string
 * que `publicacao.ts` gravou em `caption` a partir de `peca.legenda`. Casar por
 * ORDEM seria a armadilha que esta casa já pagou uma vez — "sobra não é
 * evidência de correspondência" (auditoria de 04/08/2026) —, e duas peças com a
 * mesma legenda no mesmo entregável não desempatam: RECUSA, nunca escolhe.
 */
export function direcaoNoEntregavel(
  caption: string | null,
  conteudo: string,
  tipo: string,
): LeituraDaDirecao {
  const casam = extrairPecas(conteudo, tipo).filter((p) => mesmaLegenda(p.legenda, caption));
  if (casam.length !== 1) return { ok: false, motivo: "legenda_nao_casa_no_entregavel" };
  const direcao = casam[0]!.direcaoDeArte;
  if (!direcao) return { ok: false, motivo: "sem_direcao_no_entregavel" };
  return { ok: true, direcao };
}

// ─── A PASSADA ──────────────────────────────────────────────────────────────

export interface PedidoDeRefazimento {
  cliente: string;
  /** Quem mandou. Obrigatório com `aplicar`: a passada gasta dinheiro. */
  autor?: string;
  /** Por quê. Vai para o `ActivityEvent`. */
  motivo?: string;
  /** Teto de PEÇAS nesta chamada. Aparado contra `LOTE_MAXIMO`. */
  lote?: number;
  /** `false` (padrão) = leitura pura: nada é gravado e nada é pago. */
  aplicar?: boolean;
}

const tituloCurto = (caption: string | null): string => {
  const t = (caption ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 72) : "(peça sem legenda)";
};

const arredondar = (n: number): number => Math.round(n * 100) / 100;

/**
 * Mede — e, se mandarem, refaz — as peças de UM cliente com a direção de arte
 * que já existe no entregável delas.
 *
 * Um cliente por chamada, de propósito: uma passada sem recorte gastaria imagem
 * paga de quem ninguém autorizou. Nunca lança.
 */
export async function refazerComDirecao(pedido: PedidoDeRefazimento): Promise<RelatorioDeRefazimento> {
  const aplicar = pedido.aplicar === true;
  const lotePedido = Number.isFinite(pedido.lote) ? Math.floor(pedido.lote as number) : LOTE_PADRAO;
  const lote = Math.max(0, Math.min(lotePedido, LOTE_MAXIMO, MAX_ARTES_POR_RODADA));

  const vazio = (
    situacao: RelatorioDeRefazimento["situacao"],
    veredito: string,
    cliente: string | null = null,
  ): RelatorioDeRefazimento => ({
    situacao, cliente, olhadas: 0, elegiveis: [], barradas: [],
    direcaoNoEntregavel: { achou: 0, naoAchou: 0 },
    lote: { pedido: lotePedido, efetivo: lote, maximo: LOTE_MAXIMO },
    faltamDepoisDesteLote: 0,
    custo: { desteLoteUsd: 0, deTodasAsElegiveisUsd: 0, fonte: FONTE_DO_PRECO },
    teto: { doDiaPorCliente: MAX_IMAGENS_POR_CLIENTE_POR_DIA, gastasHoje: null, restamHoje: null },
    renderizador: { disponivel: false },
    veredito,
  });

  // Autor e motivo ANTES de qualquer leitura, como na passada de produção: uma
  // passada que gasta dinheiro sem dizer quem mandou não deixa rastro que sirva.
  if (aplicar && !(pedido.autor ?? "").trim()) {
    return vazio("sem_autor", "Quem está mandando refazer? Passada que gasta imagem paga sem autor não deixa rastro. Nada foi lido nem gravado.");
  }
  if (aplicar && !(pedido.motivo ?? "").trim()) {
    return vazio("sem_motivo", "Por que refazer agora? O motivo vai para o registro. Nada foi lido nem gravado.");
  }

  const achado = await acharClienteUnico(pedido.cliente).catch(() => ({ tipo: "nenhum" as const }));
  if (achado.tipo === "nenhum") {
    return vazio("cliente_nao_existe", `Nenhum cliente com o nome "${pedido.cliente}". Confira a grafia — nada foi lido nem gravado.`);
  }
  if (achado.tipo === "ambiguo") {
    return vazio("nome_ambiguo", `"${pedido.cliente}" casa com ${achado.candidatos} clientes e esta passada não adivinha. Repita com o nome completo.`);
  }
  const clientId = achado.id;
  const cliente = achado.nome;

  // ── O UNIVERSO ────────────────────────────────────────────────────────────
  // Peça COM arte (`mediaUrl` preenchido) e ainda não publicada. Peça publicada
  // não entra: refazer o pixel de algo que já está no perfil do cliente não
  // conserta nada — o que está no ar continua no ar.
  const posts = await prisma.socialPost.findMany({
    where: {
      clientId,
      mediaUrl: { not: null },
      status: { in: ["draft", "scheduled", "approved"] },
    },
    orderBy: { scheduledFor: "asc" },
  }).catch(() => null);

  if (posts === null) {
    // Banco fora do ar NÃO vira "nada a refazer": isso leria como afirmação, e
    // ausência de informação não é informação (guardrail 1).
    return vazio("nada_a_refazer", "Não consegui ler as peças deste cliente (o banco não respondeu). Nada foi medido — e isto NÃO quer dizer que não há peça a refazer.", cliente);
  }

  const elegiveis: PecaParaRefazer[] = [];
  const idsElegiveis: string[] = [];
  const direcoesParaGravar = new Map<string, string>();
  const barradas: PecaBarrada[] = [];
  let achouDirecao = 0;
  let naoAchouDirecao = 0;

  const barrar = (post: { caption: string | null }, motivo: MotivoDeBarrar, detalhe?: string) => {
    barradas.push({ titulo: tituloCurto(post.caption), motivo, detalhe: detalhe ?? FRASE_DE_BARRAR[motivo] });
  };

  for (const post of posts) {
    // ── 1. A APROVAÇÃO DO CLIENTE VEM ANTES DE TUDO ─────────────────────────
    //
    // Primeira pergunta do laço, antes até de saber se há direção: se ele já
    // aprovou, a resposta é NÃO refazer, e o resto é irrelevante.
    //
    // A leitura é a da casa (`aprovacao-da-peca.ts`) — este módulo não
    // reimplementa aprovação nenhuma. `donoDaConexao: post.clientId` faz a
    // pergunta na forma em que ela existe lá ("esta peça iria ao perfil do
    // PRÓPRIO dono dela?"), de modo que o que sobra a conferir é exatamente o
    // que interessa aqui: existe card APROVADO, carimbado pelo CLIENTE, que
    // decide esta peça?
    const parecer = await aprovacaoDaPeca({ postId: post.id, donoDaConexao: post.clientId })
      .catch(() => null);
    if (parecer === null) {
      // Não consegui perguntar. Fail-closed: não refaço o que não sei se foi
      // aprovado — é mais barato deixar uma peça feia do que trocar o pixel
      // debaixo de uma aprovação.
      barrar(post, "aprovada_pelo_cliente", "não consegui conferir a aprovação desta peça (banco indisponível) — fail-closed: não refaço no escuro");
      continue;
    }
    if (parecer.aprovada) {
      barrar(post, "aprovada_pelo_cliente", `${FRASE_DE_BARRAR.aprovada_pelo_cliente} (aprovada por ${parecer.aprovadaPor} em ${parecer.aprovadaEm.toISOString().slice(0, 10)})`);
      continue;
    }

    // ── 2. A PRODUÇÃO DARIA ARTE A ELA? ─────────────────────────────────────
    // Mesma régua de `produzirArtesPendentes`, lida do MESMO objeto: pilar
    // bloqueado, vídeo, três tentativas gastas, carrossel sem telas. Prometer
    // uma peça que o laço vai recusar é um número que mente.
    const naoRecebe = motivoParaNaoReceberArte(post);
    if (naoRecebe) { barrar(post, "nao_recebe_arte", naoRecebe); continue; }

    // ── 3. ELA É VELHA? A DATA DO FUNDO RESPONDE ────────────────────────────
    const fundo = await prisma.mediaAsset.findFirst({
      where: { workspaceId: post.workspaceId, fileName: nomeDoFundo(post.id) },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch(() => null);
    if (!fundo) { barrar(post, "sem_fundo_para_datar"); continue; }
    if (fundo.createdAt >= MARCO_DA_DIRECAO_NA_IMAGEM) { barrar(post, "ja_refeita_com_direcao"); continue; }

    // ── 4. A DIREÇÃO DE ARTE — NO POST, OU NO ENTREGÁVEL DE ORIGEM ──────────
    let direcao = (post.artDirection ?? "").trim();
    let origem: PecaParaRefazer["direcao"] = "ja_estava_no_post";

    if (!direcao) {
      origem = "lida_do_entregavel";
      const entrega = post.deliverableId
        ? await prisma.deliverable.findUnique({
            where: { id: post.deliverableId },
            select: { content: true, type: true },
          }).catch(() => null)
        : null;
      if (!entrega?.content) { naoAchouDirecao++; barrar(post, "sem_entregavel_de_origem"); continue; }

      const leitura = direcaoNoEntregavel(post.caption, entrega.content, entrega.type);
      if (!leitura.ok) { naoAchouDirecao++; barrar(post, leitura.motivo); continue; }
      direcao = leitura.direcao;
      direcoesParaGravar.set(post.id, direcao);
    }
    achouDirecao++;

    const imagens = imagensDoPost(post);
    elegiveis.push({
      titulo: tituloCurto(post.caption),
      formato: post.format ?? "feed",
      imagens,
      custoUsd: arredondar(imagens * PRECO_DE_TABELA_USD[proporcaoDe(post.format)]),
      direcao: origem,
      direcaoComeca: direcao.replace(/\s+/g, " ").trim().slice(0, 120),
    });
    idsElegiveis.push(post.id);
  }

  const doLote = elegiveis.slice(0, lote);
  const idsDoLote = idsElegiveis.slice(0, lote);
  const gastasHoje = await imagensGastasHoje(clientId);
  const renderizador = await renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null }));

  const relatorio: RelatorioDeRefazimento = {
    situacao: "so_medi",
    cliente,
    olhadas: posts.length,
    elegiveis,
    barradas: agruparBarradas(barradas),
    direcaoNoEntregavel: { achou: achouDirecao, naoAchou: naoAchouDirecao },
    lote: { pedido: lotePedido, efetivo: lote, maximo: LOTE_MAXIMO },
    faltamDepoisDesteLote: Math.max(0, elegiveis.length - doLote.length),
    custo: {
      desteLoteUsd: arredondar(doLote.reduce((s, p) => s + p.custoUsd, 0)),
      deTodasAsElegiveisUsd: arredondar(elegiveis.reduce((s, p) => s + p.custoUsd, 0)),
      fonte: FONTE_DO_PRECO,
    },
    teto: {
      doDiaPorCliente: MAX_IMAGENS_POR_CLIENTE_POR_DIA,
      gastasHoje,
      restamHoje: gastasHoje === null ? null : Math.max(0, MAX_IMAGENS_POR_CLIENTE_POR_DIA - gastasHoje),
    },
    renderizador: { disponivel: renderizador.disponivel },
    veredito: "",
  };

  if (!aplicar) {
    relatorio.veredito =
      `${cliente}: ${posts.length} peça(s) com arte olhada(s). ${elegiveis.length} elegível(is) para refazer ` +
      `(${relatorio.direcaoNoEntregavel.achou} com direção de arte encontrada, ` +
      `${relatorio.direcaoNoEntregavel.naoAchou} sem direção no entregável e por isso BARRADA), ` +
      `${barradas.length} barrada(s) ao todo. Este lote pegaria ${doLote.length}, ` +
      `custo estimado US$ ${relatorio.custo.desteLoteUsd.toFixed(2)} (${FONTE_DO_PRECO}); ` +
      `faltariam ${relatorio.faltamDepoisDesteLote} para a próxima chamada. ` +
      "Leitura pura: nada foi gravado e nenhuma imagem foi paga.";
    return relatorio;
  }

  // ── DAQUI PARA BAIXO, ESCREVE ─────────────────────────────────────────────

  if (!renderizador.disponivel) {
    // Mesma guarda de `produzirArtesPendentes`, antecipada: sem Chromium a arte
    // não seria composta, e o backfill teria escrito num banco por nada.
    relatorio.situacao = "sem_renderizador";
    relatorio.veredito =
      "Não há Chromium para rasterizar o molde neste ambiente — NADA foi gravado e nenhuma imagem foi paga. " +
      "Diagnóstico ao vivo em GET /api/capacidades → `montar-molde`.";
    return relatorio;
  }

  if (idsDoLote.length === 0) {
    relatorio.situacao = "nada_a_refazer";
    relatorio.veredito =
      `${cliente}: nenhuma peça elegível neste lote. ${barradas.length} barrada(s) — leia os motivos. ` +
      "Nada foi gravado e nenhuma imagem foi paga.";
    return relatorio;
  }

  // ── O BACKFILL: SÓ `artDirection`, SÓ NAS PEÇAS DO LOTE ───────────────────
  // `scheduledFor`, `status` e `caption` não aparecem neste `update` e não
  // podem aparecer: a peça é a mesma, muda o pixel.
  let direcoesGravadas = 0;
  for (const id of idsDoLote) {
    const direcao = direcoesParaGravar.get(id);
    if (!direcao) continue; // já estava gravada no post
    const ok = await prisma.socialPost
      .update({ where: { id }, data: { artDirection: direcao.slice(0, 1200) } })
      .then(() => true)
      .catch(() => false);
    if (ok) direcoesGravadas++;
  }

  // ── A ARTE, PELO LAÇO QUE JÁ EXISTIA ──────────────────────────────────────
  // `clientId` vai junto com a lista nomeada de propósito: cinto e suspensório
  // contra o dia em que um id errado entrar na lista e a passada gastar imagem
  // paga de outro cliente.
  const feito: ArtesFeitas = await produzirArtesPendentes({ clientId, refazer: idsDoLote })
    .catch((e) => ({
      produzidas: 0,
      falhas: [{ postId: "", erro: e instanceof Error ? e.message : "erro na rodada de arte" }],
      desistiram: [], semOrcamento: [], semPagamento: [],
    }));

  relatorio.situacao = feito.produzidas > 0 ? "refeito" : "nada_a_refazer";
  relatorio.feito = {
    direcoesGravadas,
    refeitas: feito.produzidas,
    // Só o MOTIVO, sem os ids: motivo é texto de sistema e pode viver num log;
    // id de peça, não.
    falhas: [...new Set(feito.falhas.map((f) => f.erro))],
    desistiram: feito.desistiram.length,
    semOrcamento: feito.semOrcamento.length,
  };
  if (feito.semRenderizador) relatorio.feito.falhas.push(feito.semRenderizador);

  const faltam = Math.max(0, elegiveis.length - feito.produzidas);
  relatorio.faltamDepoisDesteLote = faltam;
  relatorio.veredito =
    `${cliente}: ${feito.produzidas} peça(s) refeita(s) com a direção de arte do entregável ` +
    `(${direcoesGravadas} direção(ões) gravada(s) no post), ` +
    `custo estimado US$ ${relatorio.custo.desteLoteUsd.toFixed(2)} (${FONTE_DO_PRECO}). ` +
    `Faltam ${faltam} elegível(is) — aperte de novo para continuar de onde parou; ` +
    "peça já refeita não é paga duas vezes, porque a seleção olha a data do fundo. " +
    "Nada foi publicado, nenhuma data foi mexida e nenhuma legenda foi alterada.";

  await prisma.activityEvent.create({
    data: {
      workspaceId: posts[0]?.workspaceId ?? "",
      clientId,
      type: "arte_refeita_com_direcao",
      message:
        `${(pedido.autor ?? "").trim()} mandou refazer a arte de ${cliente} com a direção do entregável. ` +
        `Motivo: ${(pedido.motivo ?? "").trim()}. Placar: ${feito.produzidas} refeita(s), ` +
        `${relatorio.feito.falhas.length} motivo(s) de falha, ${barradas.length} barrada(s), faltam ${faltam}.`.slice(0, 900),
    },
  }).catch(() => { /* best-effort: o registro não pode desfazer o trabalho */ });

  return relatorio;
}

/** O placar agrupado — mesma ideia de `agruparExclusoes` em
 *  `cards-de-aprovacao.ts`: um motivo repetido 6 vezes é UMA linha. */
function agruparBarradas(
  barradas: PecaBarrada[],
): Array<{ motivo: MotivoDeBarrar; quantas: number; detalhe: string }> {
  const porMotivo = new Map<MotivoDeBarrar, { quantas: number; detalhe: string }>();
  for (const b of barradas) {
    const atual = porMotivo.get(b.motivo);
    if (atual) atual.quantas += 1;
    else porMotivo.set(b.motivo, { quantas: 1, detalhe: b.detalhe });
  }
  return [...porMotivo.entries()].map(([motivo, v]) => ({ motivo, ...v }));
}
