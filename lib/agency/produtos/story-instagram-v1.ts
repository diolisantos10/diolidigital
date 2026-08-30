// story-instagram-v1.ts — A ÚNICA PORTA DA CORRENTE VISUAL. SERVER-ONLY.
//
// ⚠️ O NOME DO ARQUIVO É HISTÓRICO, E O QUE ELE ATENDE JÁ NÃO É (25/08/2026).
//
// Este módulo nunca soube o que é um story: ele recebe um `ProdutoCanonico` e
// lê `formatoDoPost`, `formatoDaPeca` e `quantidadeDePecas` do REGISTRO. Foi
// escrito assim de propósito, e a prova é que ligar o post de feed custou uma
// entrada em `produtos/registro.ts` e um `produtoId` na carta de atendimentos —
// nenhuma linha de motor nova. Renomear arquivo e função é trabalho de
// renomeação pura, e ele fica registrado como pendência em vez de ser
// misturado a um conserto de defeito medido.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO CONSERTA (Operação Salvaguarda, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// `producao-de-pedido.ts` terminava assim, e terminava para TODO produto:
//
//     cria Deliverable (texto) → cria ApprovalRequest → status "entregue"
//
// Sem `SocialPost`. Sem chamar o gerador de arte. Sem exigir `mediaUrl`. O
// cliente pedia um story, recebia um card com a DESCRIÇÃO de um story, e o
// pedido era carimbado como entregue. `done` sem arquivo.
//
// A capacidade visual já existia por inteiro, em outro trilho:
//   • `design/molde.ts` conhece `story` e 1080×1920, com margem protegida;
//   • `execution/artes.ts` gera a imagem, aplica a marca e rasteriza o molde;
//   • `esteira/pacote.ts` já monta o card do portal COM a imagem;
//   • o portal já sabe aprovar, pedir ajuste e recusar.
//
// **Este arquivo não reescreve nenhum deles.** Ele liga a ponta solta.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE UMA PORTA SÓ
// ═══════════════════════════════════════════════════════════════════════════
//
// Pedido avulso (portal), balcão e futuro pacote mensal chegam TODOS aqui, por
// `producao-de-pedido.produzirPedido`. Um segundo caminho para a mesma corrente
// começaria idêntico e divergiria no primeiro ajuste — e a segunda porta é
// sempre a que fica aberta. É a mesma lição que `producao-de-pedido.ts` já
// carrega no cabeçalho sobre os freios ("copiar as travas seria criar uma
// segunda porta com fechadura diferente").
//
// ═══════════════════════════════════════════════════════════════════════════
// A ORDEM DOS PORTÕES, E POR QUE ESTA ORDEM
// ═══════════════════════════════════════════════════════════════════════════
//
//   1. RENDERIZADOR, antes de tudo. Chromium ausente já quebrou nesta casa
//      (08/08/2026, `/api/capacidades` respondendo `montar-molde: pronta:false`
//      288 vezes por dia contra um balde furado). Sem ele NADA é criado: nem
//      post, nem imagem paga. Falha de ferramenta é problema da agência, e tem
//      de aparecer como problema da agência — não como entrega pior.
//   2. QUANTIDADE. O item de tabela cobre 4 peças; menos que isso é entrega a
//      menos por um preço cheio, e não pode passar em silêncio.
//   3. AS PEÇAS NASCEM. `SocialPost` com `format: "story"` — o formato que o
//      cliente pediu, agora com onde morar.
//   4. A ARTE. `produzirArtesPendentes`, o MESMO laço da casa, com os MESMOS
//      portões (pilar, teto diário, pagamento, portão do fundo, trava de texto).
//   5. O ARQUIVO É CONFERIDO NOS BYTES. `conferencia-do-arquivo.ts`: existe,
//      é JPEG de verdade, e mede exatamente 1080×1920. Estado não vale.
//   6. SÓ ENTÃO o card do portal e o carimbo de entregue.
//
// **Nenhuma falha termina em `done`.** Cada parada acima devolve `ok: false`
// com motivo em português, e quem chama põe o pedido em `precisa_decisao` —
// visível para o cliente e para a agência, com dono e próxima ação.

import { prisma } from "@/lib/db/client";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { produzirArtesPendentes, pecaSaiuSemTitulo, type ArtesFeitas } from "@/lib/agency/execution/artes";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { moldeDoCliente } from "@/lib/agency/design/molde";
import { limparDirecaoInterna } from "@/lib/agency/esteira/direcao-interna";
import { tituloDaFonte } from "@/lib/agency/design/trava-de-texto";
import { conferirContraste, motivoDoContraste } from "@/lib/agency/design/contraste";
import { conferirMarcaNaPecaFinal, type VereditoDaMarcaNaPeca } from "./regua-da-marca-na-peca";
import { lerArquivo } from "@/lib/agency/media/armazenamento";
import {
  conferirArquivoDoProduto, medidaEmUmaLinha, type MedidaDoArquivo,
} from "./conferencia-do-arquivo";
import {
  dimensaoExigida, margemSeguraExigida, type ProdutoCanonico,
} from "./registro";

/** A peça, como o especialista a descreveu. É o recorte do JSON dele que vira
 *  `SocialPost` — e nada além dele vira pixel. */
export interface PecaDoEspecialista {
  /** O título que vai na arte. Trecho literal do conteúdo já auditado pelos
   *  três freios — a trava de texto (`design/trava-de-texto.ts`) confere isso
   *  de novo, no momento de rasterizar, contra `SocialPost.caption`. */
  titulo: string;
  /** A legenda / o texto da peça. Vira `SocialPost.caption`, que é a FONTE
   *  AUDITADA da trava de texto. */
  legenda: string;
  /** O que a IMAGEM tem de mostrar. Vira `SocialPost.artDirection`, e **nunca
   *  vira letra na peça** (ver o schema de `SocialPost.artDirection`). */
  direcaoDeArte: string | null;
  /** O pilar de conteúdo, quando o especialista declarou um. */
  pilar: string | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TEXTO QUE A PEÇA CARREGA — uma redação só, para o nascimento E para o ajuste
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O DEFEITO (cliente oculto, 26/08/2026) ────────────────────────────────
 *
 * O cliente pediu "troca o título para X". A refação rodou, o especialista
 * devolveu `headline: "X"` — e **nada mudou na tela dele**: a arte continuou
 * com o título antigo rasterizado e a legenda do post no calendário continuou
 * idêntica.
 *
 * A causa é de fiação, não de IA. `SocialPost` **não tem coluna de título**:
 * o que vira pixel é `tituloDaFonte(post.caption)` — a primeira frase da
 * LEGENDA (`execution/artes.ts`, `fonteAuditada: post.caption`). E tanto o
 * nascimento quanto o ajuste gravavam `caption = peca.legenda`, jogando o
 * `headline` fora. Ou seja: **o campo que o prompt chama de "o TÍTULO QUE VAI
 * APARECER NA IMAGEM" nunca chegava a imagem nenhuma.** Mudar só o título
 * mudava só o markdown do entregável.
 *
 * ── POR QUE A EMENDA É NA LEGENDA, E NÃO UMA COLUNA NOVA ──────────────────
 *
 * A trava de texto desta casa é literal: o que vira pixel tem de ser trecho
 * literal de `caption` (`travaDeTextoNaArte`, com `fonteAuditada =
 * post.caption`). Uma coluna `titulo` separada criaria um segundo texto que
 * vira pixel sem passar pela mesma fonte auditada — a segunda porta, que é
 * sempre a que fica aberta.
 *
 * Então o título entra ONDE ele já é lido: como PRIMEIRA LINHA da legenda.
 * Com isso, numa escrita só:
 *   • `tituloDaFonte(caption)` devolve o título novo → o PIXEL muda;
 *   • `SocialPost.caption` muda → a legenda do post no calendário muda;
 *   • o piso de verdade e o contrato continuam julgando o mesmo texto (o
 *     `headline` já entra no corpo do entregável por `corpoLegivel`).
 *
 * ── E ELA NÃO DUPLICA ─────────────────────────────────────────────────────
 *
 * Quando a legenda JÁ começa pelo título (o caso comum do especialista que
 * repete a chamada na primeira frase), nada é prefixado: o texto sai byte por
 * byte o que sempre foi. Sem título utilizável, idem.
 */
export function captionDaPeca(peca: PecaDoEspecialista): string {
  // ── A TRAVA DA DIREÇÃO INTERNA (27/08/2026, medida em produção) ──────────
  //
  // Este é o FUNIL: toda legenda que vira `SocialPost.caption` — no nascimento
  // e no ajuste — passa por aqui, e é `caption` que vira pixel
  // (`tituloDaFonte`) e que vai para o Instagram do cliente. A peneira mora no
  // funil de propósito: uma segunda porta seria a que fica aberta.
  //
  // Na rodada paga, a legenda voltou como "Sexta é dia de estar aqui\nPost
  // destacando a atmosfera acolhedora da trattoria." — a segunda linha é o
  // BRIEFING dentro do post. Ver `esteira/direcao-interna.ts`.
  //
  // ⚠️ A limpeza NUNCA esvazia o que existia: se sobrar nada, o texto original
  // fica de pé e quem barra é o portão de publicação (`prontidao-de-publicacao`),
  // com gente no meio. Apagar a legenda do cliente para tirar uma frase é
  // trocar um estrago por outro maior.
  const legendaCrua = peca.legenda.trim();
  const tituloCru = (peca.titulo ?? "").trim();
  const legendaLimpa = limparDirecaoInterna(legendaCrua);
  const tituloLimpo = limparDirecaoInterna(tituloCru);
  // Sobrou ALGUM texto limpo? Então é ele que vai ao ar — inclusive quando o
  // que sobrou é só o título e a legenda inteira era briefing (o caso medido).
  // A volta ao texto cru só acontece quando a limpeza levaria a peça a ficar
  // MUDA, e aí quem barra é o portão de publicação, com gente no meio.
  const sobrouAlgo = legendaLimpa.length > 0 || tituloLimpo.length > 0;
  const legenda = sobrouAlgo ? legendaLimpa : legendaCrua;
  const titulo = sobrouAlgo ? tituloLimpo : tituloCru;
  if (!titulo) return legenda.slice(0, 2000);
  if (!legenda) return titulo.slice(0, 2000);

  // A comparação é feita pela MESMA função que escolhe o que vira pixel. Uma
  // comparação própria aqui ("a legenda começa com o título?") divergiria do
  // rasterizador no primeiro emoji, na primeira reticência, no primeiro
  // homóglifo — e a peça sairia com o título duplicado sem ninguém entender.
  const jaEhOTitulo = tituloDaFonte(legenda);
  if (jaEhOTitulo && jaEhOTitulo === tituloDaFonte(titulo)) return legenda.slice(0, 2000);

  return `${titulo}\n${legenda}`.slice(0, 2000);
}

export interface PedidoDeStory {
  pedidoId: string;
  produto: ProdutoCanonico;
  workspaceId: string;
  clientId: string;
  clientRequestId: string | null;
  projectId: string;
  /** O id do `Deliverable` com o texto já auditado. O card fica ligado às
   *  PEÇAS; o entregável continua sendo o documento da copy. */
  deliverableId: string;
  /** O título do entregável — vira o título do card. */
  titulo: string;
  pecas: PecaDoEspecialista[];
  /** Quem produziu, para o card dizer de quem é o trabalho. */
  assinadoPor: string;
  /** O agente dono das peças. */
  ownerAgentId: string;
  /**
   * NINGUÉM JULGOU ESTA PEÇA?
   *
   * ── O buraco, medido pelo Auditor (25/08/2026) ──────────────────────────
   *
   * A casa decidiu, e a decisão está certa, que a operação NÃO para porque um
   * provedor caiu: `ficouSemArbitro` registra e deixa passar. O problema é o
   * que acontecia depois — o pedido virava `entregue`, o cartão abria, quatro
   * peças iam para a mesa do cliente, e o terceiro estado existia **só numa
   * coluna interna** (`revisionStatus = nao_auditado`) e num evento.
   *
   * O critério D tem duas metades: "falta de árbitro aparece como estado
   * próprio **E NÃO COMO APROVAÇÃO**". A segunda não estava de pé. O cliente
   * era convidado a aprovar uma peça que ninguém tinha julgado, e **nada na
   * tela dele dizia isso**.
   *
   * Coluna gravada não é cliente informado. Havia duas saídas honestas — a
   * peça não chega, ou ela chega DIZENDO O QUE É. Esta corrente escolhe a
   * segunda, porque bloquear inverteria uma decisão que a casa tomou para
   * todos os produtos; o que ela não pode é a peça chegar calada.
   */
  semArbitro?: { motivo: string | null } | null;
}

/** ONDE a corrente parou. Código, e não frase: cada etapa leva a um conserto
 *  diferente, e uma contagem de falhas não diz qual (guardrail 6 da casa). */
export type EtapaDaCorrente =
  | "renderizador"
  | "contraste-da-marca"
  | "quantidade"
  | "criacao-das-pecas"
  | "producao-da-arte"
  | "arquivo-ausente"
  | "arquivo-invalido"
  | "card-do-portal";

/** A prova de UMA peça: o que foi medido, não o veredito. */
export interface ProvaDaPeca {
  postId: string;
  format: string;
  mediaUrl: string;
  mediaAssetId: string;
  medida: MedidaDoArquivo;
  /**
   * A MARCA, MEDIDA NO ARQUIVO QUE SAIU. `null` só quando o molde é neutro —
   * o cliente não declarou cor, e não há marca contra a qual medir.
   *
   * Critério D do contrato: "a régua da marca analisa a peça final". Até
   * 25/08/2026 nenhuma régua desta casa abria o JPEG e perguntava isso.
   */
  marca: VereditoDaMarcaNaPeca | null;
  /** A medida em uma linha, pronta para o relatório de evidência. */
  resumo: string;
}

export type ResultadoDoStory =
  | {
      ok: true;
      approvalRequestId: string;
      /** Uma prova por peça. Vazio é impossível: a corrente não chega aqui
       *  sem `quantidadeDePecas` arquivos conferidos. */
      provas: ProvaDaPeca[];
      /** As margens seguras que o molde aplicou, para a evidência citar
       *  números em vez de afirmar "margens respeitadas". */
      margemSegura: { topo: number; base: number; lateral: number };
    }
  | { ok: false; etapa: EtapaDaCorrente; motivo: string };

/**
 * A CORRENTE DO STORY, do texto auditado ao arquivo aprovável.
 *
 * Recebe o conteúdo que JÁ passou pelos três freios da casa (contrato de saída,
 * piso de verdade, juiz da qualidade) — este arquivo não os refaz e não os
 * afrouxa. O que ele acrescenta é o quarto freio, o que ninguém tinha: **o
 * arquivo final é conferido nos bytes antes de o cliente ser chamado a
 * decidir.**
 *
 * Nunca lança por conteúdo. Toda saída de erro nomeia a etapa e o motivo.
 */
export async function entregarStoryInstagramV1(p: PedidoDeStory): Promise<ResultadoDoStory> {
  const { produto } = p;
  const exigida = dimensaoExigida(produto);

  // ── PORTÃO 1 · O RENDERIZADOR, ANTES DE QUALQUER GASTO ────────────────────
  //
  // `produzirArtesPendentes` já tem esta guarda, e ela é a que impede a imagem
  // paga de ser jogada fora. A daqui é OUTRA coisa, e as duas precisam existir:
  // sem ela, a rodada devolveria `semRenderizador` DEPOIS de já haver quatro
  // `SocialPost` órfãos no banco e um pedido pendurado em "em_producao". A
  // parada tem de ter dono e próxima ação, e tem de acontecer antes de a
  // corrente escrever qualquer linha.
  const renderizador = await renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null }));
  if (!renderizador.disponivel) {
    return {
      ok: false,
      etapa: "renderizador",
      motivo:
        "não há Chromium para rasterizar o molde neste ambiente — NENHUMA peça foi criada e NENHUMA imagem foi paga. " +
        "Dono: a agência (infraestrutura). Próxima ação: conferir `playwright` em `dependencies` e o pacote " +
        "`chromium` em `railpack.json → deploy.aptPackages`. Diagnóstico ao vivo em GET /api/capacidades → `montar-molde`.",
    };
  }

  // ── PORTÃO 1-B · O CONTRASTE DA MARCA, CONFERIDO ──────────────────────────
  //
  // `tintaSobre()` ESCOLHE a tinta por luminância. Ninguém CONFERIA o
  // resultado — e existe uma faixa de cores de marca (o cinza médio é o caso de
  // livro) em que as duas opções ficam ruins e a heurística devolve a menos
  // ruim em silêncio. A peça sai legível na tela de quem a produziu e ilegível
  // na de quem a lê.
  //
  // Confere ANTES de gastar: cor de marca é dado de cadastro, e descobrir isso
  // depois de quatro imagens pagas é pagar para aprender o que uma conta
  // responde de graça.
  //
  // ⚠️ Mede as SUPERFÍCIES CHAPADAS (assinatura, blocos), que é onde a escolha
  // de `tintaSobre` é aplicada. Texto sobre FOTO é outro problema, com outro
  // par de travas (`portao-do-fundo.ts` e o degradê do molde) — dizer que este
  // portão cobre aquele caso seria a régua mirada no irmão de novo.
  const marcaDoCliente = await prisma.brandBrain.findFirst({
    where: { clientId: p.clientId },
    select: { primaryColor: true, secondaryColor: true, typography: true },
  }).catch(() => null);
  const moldeDaPeca = moldeDoCliente(marcaDoCliente);
  // Molde NEUTRO não passa por aqui: o cinza padrão da casa é degradação
  // declarada, com conserto próprio (cadastrar a marca), e barrá-la aqui
  // trocaria uma declaração honesta por uma parada que confunde.
  if (moldeDaPeca.origem === "marca") {
    const contraste = conferirContraste(moldeDaPeca.primaria, moldeDaPeca.tinta);
    if (!contraste) {
      return {
        ok: false,
        etapa: "contraste-da-marca",
        motivo:
          `não consegui MEDIR o contraste entre a cor da marca (${moldeDaPeca.primaria}) e a tinta ` +
          `(${moldeDaPeca.tinta}). Sem medida não há aprovação. Dono: o Brand Hub do cliente.`,
      };
    }
    if (!contraste.suficiente) {
      return { ok: false, etapa: "contraste-da-marca", motivo: motivoDoContraste(contraste) };
    }
  }

  // ── PORTÃO 2 · A QUANTIDADE QUE O PREÇO COBRE ─────────────────────────────
  //
  // O item de tabela promete `quantidadeDePecas`. Entregar menos por um preço
  // cheio é erro de dinheiro, e é exatamente a classe de erro que a triagem
  // desta casa já barra no outro sentido ("orçar um item de unidade quando ele
  // pediu vários"). O prompt PEDE o número certo; esta linha é a trava — prompt
  // é aviso, código é trava.
  const utilizaveis = p.pecas.filter((x) => x.legenda.trim().length > 0 && x.titulo.trim().length > 0);
  if (utilizaveis.length < produto.quantidadeDePecas) {
    return {
      ok: false,
      etapa: "quantidade",
      motivo:
        `a produção descreveu ${utilizaveis.length} peça(s) utilizável(is) e este produto cobra por ` +
        `${produto.quantidadeDePecas}. NÃO entreguei a menos por um preço cheio. ` +
        "Dono: a equipe. Próxima ação: revisar a saída do especialista e reprocessar o pedido.",
    };
  }
  const escolhidas = utilizaveis.slice(0, produto.quantidadeDePecas);

  // ── AS PEÇAS NASCEM COM O FORMATO QUE O CLIENTE PEDIU ─────────────────────
  //
  // `format: produto.formatoDoPost` — derivado do registro, nunca a string
  // "story" digitada aqui. É este campo que o critério A confere em cada
  // transição, e é ele que `formatoDoPost` (molde) lê para escolher 1080×1920.
  //
  // `visibility: "compartilhado"` já no nascimento, e é correto por natureza
  // aqui pela mesma razão que vale para o entregável do pedido avulso: **o
  // cliente PEDIU esta peça específica.** Sem isso `pacote.montarPecas` filtra
  // a peça fora e o card do portal nasce sem corpo visual — que é uma das
  // reprovações imediatas do contrato de aceite.
  //
  // `status: "draft"` — a peça NÃO está agendada e NÃO pode ir ao ar. Quem a
  // promove a "scheduled" é a decisão do cliente no portal
  // (`agendarPecasAprovadas`, chamada por `/api/portal/approvals`). Nascer em
  // "scheduled" seria pôr no caminho do relógio uma peça que ninguém aprovou.
  // ── REENTRADA NÃO CRIA SEGUNDA PEÇA ──────────────────────────────────────
  //
  // Critério A do contrato de aceite: "reentrada e clique duplicado não criam
  // segunda peça". A chave de idempotência é o `deliverableId` — o entregável
  // já foi gravado no pedido ANTES desta chamada (`producao-de-pedido.ts`),
  // justamente para que a retentativa encontre o mesmo trabalho em vez de
  // começar outro. Sem isto, uma falha no meio da corrente (renderizador que
  // voltou, provedor que caiu) produziria quatro peças novas a cada rodada do
  // despertador — e imagem paga a cada uma.
  const jaExistem = await prisma.socialPost.findMany({
    where: { deliverableId: p.deliverableId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>);

  let postIds: string[];
  try {
    postIds = jaExistem.slice(0, produto.quantidadeDePecas).map((x) => x.id);
    // Só o DÉFICIT é criado. Uma rodada que morreu depois de gravar duas peças
    // retoma nas duas que faltam, em vez de recomeçar do zero.
    for (const peca of escolhidas.slice(postIds.length)) {
      const criado = await prisma.socialPost.create({
        data: {
          workspaceId: p.workspaceId,
          clientId: p.clientId,
          clientRequestId: p.clientRequestId,
          deliverableId: p.deliverableId,
          // O TÍTULO VAI JUNTO — é dele que sai o pixel. Ver `captionDaPeca`.
          caption: captionDaPeca(peca),
          networks: JSON.stringify([produto.rede]),
          format: produto.formatoDoPost,
          pillar: peca.pilar,
          artDirection: peca.direcaoDeArte,
          visibility: "compartilhado",
          status: "draft",
        },
        select: { id: true },
      });
      postIds.push(criado.id);
    }
  } catch (e) {
    return {
      ok: false,
      etapa: "criacao-das-pecas",
      motivo:
        `não consegui criar as peças no banco (${e instanceof Error ? e.message : "erro desconhecido"}). ` +
        "Dono: a agência. Próxima ação: o pedido volta para a fila e é reprocessado.",
    };
  }

  // ── A ARTE, PELO MOTOR DA CASA ────────────────────────────────────────────
  //
  // `refazer: postIds` é o recorte NOMEADO do laço de sempre — mesmos portões,
  // mesma gravação, mesmo orçamento diário, mesmo portão de pagamento. O nome
  // do campo diz "refazer" porque nasceu para reprocessar estoque antigo; o que
  // ele realmente faz é "trabalhe EXATAMENTE nestas peças, e em nenhuma outra",
  // que é o que esta corrente precisa. A alternativa (chamar a rodada global)
  // gastaria imagem paga de outros clientes que ninguém autorizou — o defeito
  // que `RecorteDaRodadaDeArte` foi escrito para impedir.
  const artes: ArtesFeitas = await produzirArtesPendentes({ clientId: p.clientId, refazer: postIds })
    .catch((e: unknown): ArtesFeitas => ({
      produzidas: 0,
      falhas: postIds.map((id) => ({ postId: id, erro: e instanceof Error ? e.message : "erro desconhecido" })),
      desistiram: [], semOrcamento: [], semPagamento: [],
    }));

  if (artes.semRenderizador) {
    return { ok: false, etapa: "producao-da-arte", motivo: artes.semRenderizador };
  }
  if (artes.semPagamento.length > 0) {
    return {
      ok: false,
      etapa: "producao-da-arte",
      motivo:
        `${artes.semPagamento.length} peça(s) não foram produzidas porque o pagamento deste pedido não está ` +
        "confirmado. Nenhuma imagem foi paga e nenhuma tentativa foi gasta. " +
        "Dono: o cliente (pagamento) ou o financeiro. Próxima ação: confirmar o pagamento; a peça retoma sozinha.",
    };
  }
  if (artes.semOrcamento.length > 0) {
    return {
      ok: false,
      etapa: "producao-da-arte",
      motivo:
        `${artes.semOrcamento.length} peça(s) bateram no teto diário de imagens deste cliente. ` +
        "Não é falha da peça e não gastou tentativa. Dono: a agência. Próxima ação: as peças voltam amanhã.",
    };
  }

  // ── O ARQUIVO, CONFERIDO NOS BYTES ────────────────────────────────────────
  //
  // A partir daqui nada é acreditado: nem o `produzidas` que a rodada devolveu,
  // nem o `mediaUrl` que ela gravou. A pergunta é sempre a mesma — **o cliente
  // consegue ver a imagem certa?** — e ela só se responde abrindo o arquivo.
  const posts = await prisma.socialPost.findMany({
    where: { id: { in: postIds } },
    select: { id: true, format: true, mediaUrl: true, lastError: true },
  });
  const porId = new Map(posts.map((x) => [x.id, x]));

  const semArquivo = postIds.filter((id) => !porId.get(id)?.mediaUrl);
  if (semArquivo.length > 0) {
    const motivos = semArquivo
      .map((id) => {
        const erroDaRodada = artes.falhas.find((f) => f.postId === id)?.erro;
        return `${id}: ${erroDaRodada ?? porId.get(id)?.lastError ?? "sem arquivo e sem motivo registrado"}`;
      })
      .join(" · ");
    return {
      ok: false,
      etapa: "arquivo-ausente",
      motivo:
        `${semArquivo.length} de ${postIds.length} peça(s) NÃO têm arquivo. O pedido NÃO foi entregue: ` +
        `${motivos}. Dono: a agência (produção). Próxima ação: a rodada de arte retenta, e o pedido ` +
        "fica visível até um arquivo real existir.",
    };
  }

  const provas: ProvaDaPeca[] = [];
  const reprovados: string[] = [];

  for (const id of postIds) {
    const post = porId.get(id)!;
    // `mediaUrl` desta casa é sempre `/api/media/<id>` (`artes.ts`). O id do
    // `MediaAsset` sai do fim do caminho — e é ele que abre os BYTES. Ler pelo
    // caminho, e não por um campo paralelo, é o que garante que os bytes
    // conferidos são os MESMOS que a rota pública vai servir ao cliente.
    const assetId = (post.mediaUrl ?? "").split("/").filter(Boolean).pop() ?? "";
    const asset = assetId
      ? await prisma.mediaAsset.findUnique({
          where: { id: assetId },
          select: { id: true, storagePath: true, mimeType: true },
        }).catch(() => null)
      : null;

    if (!asset) {
      reprovados.push(`${id}: \`mediaUrl\` aponta para "${post.mediaUrl}", e não há mídia com esse id no banco.`);
      continue;
    }

    const bytes = await lerArquivo(asset.storagePath).catch(() => null);
    if (!bytes) {
      reprovados.push(`${id}: a mídia ${asset.id} está registrada e o arquivo não abre no armazenamento.`);
      continue;
    }

    const veredito = await conferirArquivoDoProduto({
      bytes,
      produto,
      mimeDeclarado: asset.mimeType,
      ondeEsta: `peça ${id}, mídia ${asset.id}`,
    });

    // ── PEÇA SEM TÍTULO NÃO É PEÇA, É ARQUIVO ─────────────────────────────
    //
    // `comporComMolde` degrada de propósito quando a chamada não sai (conteúdo
    // sem frase utilizável, letra reprovada pelo rasterizador, trava de texto
    // barrando o título): a peça vai embora só com a foto e a assinatura, e a
    // degradação fica DECLARADA na nota.
    //
    // Declarar basta para o calendário — uma peça a menos no mês é pior que uma
    // peça sem headline. Não basta aqui: este produto o cliente PEDIU e PAGOU,
    // e o estado do banco não o denuncia — `mediaUrl` fica preenchido, o cartão
    // mostra uma imagem, e ele aprova sem ver o buraco. Aí a culpa é nossa.
    //
    // Decisão do CEO (25/08/2026): a corrente PARA. Entregar o que sabemos
    // estar incompleto é pior que não entregar.
    if (pecaSaiuSemTitulo(post.lastError)) {
      reprovados.push(
        `${id}: a peça saiu SEM TÍTULO — a chamada não virou pixel. ${post.lastError ?? ""}`.trim(),
      );
      continue;
    }

    // O FORMATO, conferido no fim da corrente. É o critério A ("o formato
    // permanece `story` em todas as transições") deixando de ser afirmação.
    if (post.format !== produto.formatoDoPost) {
      reprovados.push(
        `${id}: a peça chegou ao fim da corrente com format="${post.format}" e este produto exige ` +
        `"${produto.formatoDoPost}". O formato do cliente não sobreviveu.`,
      );
      continue;
    }

    if (!veredito.ok) {
      reprovados.push(`${id}: ${veredito.motivo}`);
      continue;
    }

    // ── A RÉGUA DA MARCA, SOBRE O ARQUIVO ────────────────────────────────
    //
    // Critério D: "a régua da marca analisa a peça final". As outras três
    // réguas de marca desta casa olham para outra coisa — o contrato vai ao
    // PRODUTOR antes de produzir, o juiz audita o TEXTO, e o portão de
    // contraste mede cores DECLARADAS antes da imagem existir. Nenhuma abria o
    // JPEG. Esta abre, e mede a tinta da marca no rodapé da peça — que é onde
    // `montarHtmlDaPeca` pinta a primária do cliente.
    //
    // Molde NEUTRO não é medido, pela mesma razão do portão de contraste: sem
    // cor declarada não há marca contra a qual medir, e reprovar aqui cobraria
    // do cliente uma cor que ele nunca deu. A ausência já é declarada.
    let marca: VereditoDaMarcaNaPeca | null = null;
    if (moldeDaPeca.origem === "marca") {
      marca = await conferirMarcaNaPecaFinal({
        bytes,
        corDaMarca: moldeDaPeca.primaria,
        ondeEsta: `peça ${id}, mídia ${asset.id}`,
      });
      if (!marca.ok) {
        reprovados.push(`${id}: ${marca.motivo}`);
        continue;
      }
    }

    provas.push({
      postId: id,
      format: post.format,
      mediaUrl: post.mediaUrl!,
      mediaAssetId: asset.id,
      medida: veredito.medida,
      marca,
      resumo: medidaEmUmaLinha(veredito.medida),
    });
  }

  if (reprovados.length > 0) {
    return {
      ok: false,
      etapa: "arquivo-invalido",
      motivo:
        `${reprovados.length} de ${postIds.length} arquivo(s) NÃO servem para "${produto.label}" ` +
        `(exigido: ${exigida.largura}×${exigida.altura}, ${produto.mimeExigido}). O cliente NÃO foi chamado ` +
        `a decidir e o pedido NÃO foi entregue: ${reprovados.join(" · ")}. ` +
        "Dono: a agência (produção). Próxima ação: refazer as peças reprovadas.",
    };
  }

  // ── O CARD DO PORTAL, LIGADO ÀS PEÇAS ─────────────────────────────────────
  //
  // `sourcePostIds` é o que faz a diferença entre um card de TEXTO e um card
  // com a peça dentro: `pacote.montarPecas` lê exatamente este campo para
  // montar `pecas[]`, e é `pecas[]` que o portal renderiza como imagem
  // (`components/portal/AprovacoesDoCliente.tsx`). Era isto que faltava — o
  // card do pedido avulso nascia sem ele, e por isso nascia sem corpo visual.
  //
  // E é o MESMO campo que `/api/portal/approvals` lê para propagar a decisão do
  // cliente às peças: aprovar agenda, pedir ajuste devolve à revisão. Ligar o
  // card às peças liga, de uma vez, a imagem no cartão E a decisão à peça certa.
  //
  // `department: "pedido:<id>"` mantém a grafia que o pedido avulso já usa —
  // é o caminho de volta do card para o pedido, sem adivinhação por ordem.
  let card: { id: string };
  try {
    card = await createApprovalRequest({
      clientId: p.clientId,
      clientRequestId: p.clientRequestId ?? undefined,
      department: `pedido:${p.pedidoId}`,
      requestedBy: p.assinadoPor,
      clientVisible: true,
      reviewNote: corpoDoCardDeStory(p.titulo, produto, escolhidas, provas, p.semArbitro ?? null),
      sourcePostIds: postIds,
    });
  } catch (e) {
    return {
      ok: false,
      etapa: "card-do-portal",
      motivo:
        `as ${provas.length} peça(s) ficaram prontas e conferidas, mas o card do portal não foi aberto ` +
        `(${e instanceof Error ? e.message : "erro desconhecido"}). O pedido NÃO está entregue: sem card, ` +
        "o cliente não tem onde decidir. Dono: a agência. Próxima ação: reprocessar o pedido.",
    };
  }

  return {
    ok: true,
    approvalRequestId: card.id,
    provas,
    margemSegura: margemSeguraExigida(produto),
  };
}

/**
 * O corpo do card, no formato que o portal já renderiza (primeira linha =
 * título). É RESUMO, não é a peça: o que o cliente decide é a IMAGEM que
 * `pecas[]` mostra logo acima deste texto.
 *
 * Nenhum número aqui é inventado — dimensão e MIME saem da medida real de cada
 * arquivo, e não da expectativa.
 */
function corpoDoCardDeStory(
  titulo: string,
  produto: ProdutoCanonico,
  pecas: PecaDoEspecialista[],
  provas: ProvaDaPeca[],
  semArbitro: { motivo: string | null } | null,
): string {
  const linhas = pecas.map((peca, i) => {
    const prova = provas[i];
    return [
      `**${i + 1}. ${peca.titulo}**`,
      `- Formato: ${produto.label} (${produto.rede})`,
      peca.pilar ? `- Pilar: ${peca.pilar}` : "",
      `- Texto da peça: ${peca.legenda.trim()}`,
      prova ? `- Arquivo: ${prova.resumo}` : "",
    ].filter(Boolean).join("\n");
  });

  // ── A DECLARAÇÃO VEM ANTES DE TUDO ────────────────────────────────────
  //
  // Conclusão primeiro, e aqui a conclusão é um AVISO: o cliente precisa ler
  // isto ANTES de decidir, não depois de rolar quatro blocos de peça. É o que
  // separa "aprovação informada" de "aprovação às cegas" — e aprovação às
  // cegas num piloto 100% IA é a assinatura do cliente num trabalho que
  // ninguém conferiu.
  const avisoSemArbitro = semArbitro
    ? [
        "⚠️ ATENÇÃO — ESTA PEÇA NÃO PASSOU PELA NOSSA REVISÃO DE QUALIDADE.",
        `A revisão automática da casa não rodou desta vez${semArbitro.motivo ? ` (${semArbitro.motivo})` : ""}. ` +
        "Isso NÃO quer dizer que a peça está aprovada por nós — quer dizer que ninguém da nossa revisão " +
        "olhou para ela. Confira com atenção antes de aprovar, ou peça para a equipe revisar primeiro.",
        "",
      ]
    : [];

  return [
    titulo,
    "",
    ...avisoSemArbitro,
    // ── O QUE ESTA FRASE PODE AFIRMAR, E POR QUÊ ──────────────────────────
    //
    // A versão anterior dizia "margem protegida do Instagram respeitada" e não
    // media nada: copiava a constante do molde e escrevia a conclusão na tela
    // do CLIENTE. Régua verde sobre o componente errado — e desta vez a
    // afirmação sem lastro ia para fora de casa.
    //
    // O que se pode afirmar é o que o MECANISMO garante, e ele garante isto:
    // `renderizarHtml` mede no DOM se algum texto invadiu a zona morta e, se
    // invadiu, REPROVA a rasterização (`texto_na_zona_morta`). A peça então sai
    // sem camada de texto — e `pecaSaiuSemTitulo` PARA esta corrente antes do
    // cartão existir. Logo: se este cartão existe, o texto passou pela medição.
    //
    // A frase diz o mecanismo, não a conclusão nua. Quem lê pode conferir.
    // O NOME DA PEÇA SAI DO PRODUTO (25/08/2026). Esta linha dizia
    // "story(ies) vertical(is)" para qualquer produto — inofensivo enquanto só
    // havia story no registro, e uma mentira na tela do cliente no dia
    // seguinte: quem comprou carrossel leria "5 story(ies) vertical(is)".
    `${provas.length} peça(s) — ${produto.label} — de ` +
    `${provas[0]?.medida.largura ?? "?"}×${provas[0]?.medida.altura ?? "?"}, ` +
    "com a marca do cliente aplicada. O texto de cada peça foi conferido contra a área segura do Instagram " +
    "na hora de virar imagem: peça com texto invadindo a zona morta da interface é reprovada " +
    "pelo rasterizador e não chega até aqui.",
    // "acima" virou "abaixo" em 25/08/2026: o corpo do cartão passou a ser
    // renderizado ANTES das peças (o aviso de "sem árbitro" mora nele e aviso
    // depois de quatro imagens é aviso que ninguém lê). Texto que aponta para o
    // lado errado manda o cliente procurar a peça onde ela não está.
    "Veja cada peça abaixo e me diga: aprova, quer ajustar (conte o que mudar) ou recusa.",
    "",
    ...linhas,
  ].join("\n");
}
