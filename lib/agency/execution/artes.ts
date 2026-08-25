// artes.ts — O DESIGN PASSA A PRODUZIR IMAGEM, NÃO DESCRIÇÃO DE IMAGEM.
//
// O buraco: `design-engine.ts` — gerador de imagem, pronto, funcionando, com
// fallback de modelo e tudo — não tinha um único chamador na esteira de
// produção. O departamento de Design entregava TEXTO descrevendo o que uma
// peça deveria ser ("fundo escuro, tipografia serifada, o pão em close").
// Bonito de ler e impossível de postar: o Instagram exige mídia em todo
// formato, então cada post ficava parado esperando uma imagem que ninguém
// produzia. A agência vendia arte e entregava briefing de arte.
//
// ── A VIRADA DE 05/08/2026: O MODELO FAZ FOTO, O CÓDIGO FAZ LAYOUT ──────────
//
// Diagnóstico do CEO, fechado e aprovado: pedir a PEÇA INTEIRA ao `gpt-image-1`
// entrega foto, não design — e modelo de imagem erra letra. Foi por isso que
// os 36 criativos do lançamento da Foocci foram montados à mão em HTML e
// rasterizados. Agora aquele trabalho manual é o motor: `lib/agency/design/`.
//
// A produção passou a ter DUAS CAMADAS:
//   • FOTO  → `generateDesign` (cenário, luz, textura). Continua igual, e o
//     prompt continua PROIBINDO letra: a tipografia não é dela.
//   • TEXTO, COR, MARGEM e ASSINATURA → HTML rasterizado pelo Chromium que a
//     casa já usa. A letra sai do rasterizador de fonte, e é conferida contra o
//     DOM antes de virar arquivo (`lib/agency/design/renderizar.ts`).
//
// ── O QUE CONTINUA VALENDO DO CABEÇALHO ANTIGO ──────────────────────────────
//
// A proibição antiga tinha DUAS razões. A primeira ("modelo erra letra") o
// molde fecha por construção. A segunda NÃO se resolve sozinha e continua de pé
// palavra por palavra: "preço, telefone e prazo dentro de um pixel escapam do
// piso de verdade, que lê texto e não enxerga imagem". Por isso todo texto que
// vira pixel passa pela trava de `lib/agency/design/trava-de-texto.ts`, que
// exige (a) trecho LITERAL do conteúdo já auditado e (b) nenhuma classe de fato
// perigosa. Reprovou? A peça sai só com a foto — nunca com texto que ninguém
// consegue conferir.

import { prisma } from "@/lib/db/client";
import { generateDesign } from "@/lib/ai/design-engine";
import { guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";
import { estiloVisualPersistido, estiloVistoPersistido } from "@/lib/agency/execution/leitura-do-cliente";
import { moldeDoCliente, moldeComLogo, formatoDoPost, MIMES_DE_LOGO, type Molde } from "@/lib/agency/design/molde";
import { logoDoCliente, fotosReaisDoCliente } from "@/lib/agency/esteira/material-do-drive";
import { logoDaCasa } from "@/lib/agency/design/logo-da-casa";
import {
  escolherFotoReal, escolherFotoParaPostAvulso, type FotoCandidata,
} from "@/lib/agency/design/escolha-de-foto";
import type { MaterialReal } from "@/lib/agency/design/storyboard";
import { montarPeca } from "@/lib/agency/design/peca";
import { motivoDaLegibilidade, type MedidaDaLegibilidade } from "@/lib/agency/design/legibilidade-do-titulo";
import {
  renderizadorDisponivel, MIME_DA_PECA_RENDERIZADA, type MotivoDeFalhaDeRender,
} from "@/lib/agency/design/renderizar";
import { tituloDaFonte, chamadaDaMarca } from "@/lib/agency/design/trava-de-texto";
// O PORTÃO DE PIXEL. Ficou sete dias em `lib/` sem um único chamador — este é
// o chamador. Ver `portao-do-fundo.ts` para por que ele mede o fundo CRU.
import { conferirFundoDaPeca, motivoDoFundoEmUmaLinha } from "@/lib/agency/design/portao-do-fundo";
// O PRÉ-PORTÃO, de custo zero. Roda ANTES de `generateDesign` e nunca depois:
// ver o bloco no ponto de chamada e o cabeçalho do arquivo.
import { conferirDirecaoFotografavel } from "@/lib/agency/design/direcao-fotografavel";
import {
  reescreverDirecao, contarReescritasDaDirecao, MAX_REESCRITAS_DA_DIRECAO,
} from "@/lib/agency/design/reescrever-direcao";
import { generate } from "@/lib/ai/generate";
import { cerebroDaMarca } from "@/lib/agency/design/repertorio-registrado";
import {
  composicaoParaFuncao, composicaoDoPostSimples, direcaoDeAmplitude,
  type CerebroCriativo, type Composicao,
} from "@/lib/agency/design/repertorio";
import {
  conferirStoryboard, direcaoDaImagem, laudoDoStoryboard, lerStoryboard,
  REGUA_CARROSSEL_DE_VENDA, type ReguaDeStoryboard, type TelaDoStoryboard,
} from "@/lib/agency/design/storyboard";
import { createHash } from "node:crypto";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { conferirPagamentoDaAncora } from "@/lib/agency/financeiro/portao-de-pagamento";
// A MESMA régua que a publicação usa. Uma segunda cópia começaria idêntica e
// divergiria no primeiro ajuste — e um conserto que discorda do publicador é
// pior que nenhum, porque ele é acreditado.
import { conferirFormatoDeMidia } from "@/lib/integrations/meta/formato-de-midia";
import { postsComFormatoRecusado } from "@/lib/agency/execution/reconversao-de-formato";
import { PRECO_DE_TABELA_USD } from "@/lib/ai/precos";

/** Quantas artes por rodada. Cada uma é uma chamada cara de modelo de imagem —
 *  um calendário de 12 posts custaria 12 de uma vez se não houvesse teto. */
export const MAX_ARTES_POR_RODADA = 6;

/** Depois disto, a peça para de tentar sozinha. Modelo de imagem falha por
 *  motivos que não melhoram com insistência (conteúdo recusado, conta sem
 *  acesso), e cada tentativa custa. */
export const MAX_TENTATIVAS_POR_PECA = 3;

/**
 * ── O TETO DIÁRIO DE IMAGENS POR CLIENTE ────────────────────────────────────
 *
 * O teto por rodada (6) não é teto de gasto: esta rodada dispara a cada 5
 * minutos, e 6 × 288 rodadas = **1.728 gerações pagas por dia** se as peças
 * continuarem voltando. O teto por PEÇA (3 tentativas) fecha o caso de uma peça
 * teimosa; este fecha o caso de MUITAS peças teimosas, de um bug novo que
 * ninguém previu e do carrossel que multiplica por tela.
 *
 * Por que 40, e não 12 nem 500: um mês inteiro de conteúdo desta casa são 6 a 8
 * posts, com 1 a 2 carrosséis de até 6 telas — na conta mais cara, ~25 imagens.
 * 40 cabe o mês inteiro produzido num único dia (é o que acontece quando o
 * pacote é aprovado) mais folga para refação, e ainda assim corta o desastre em
 * ~43×. Acima de 40 num dia não é produção: é laço.
 *
 * É teto de SEGURANÇA, não orçamento comercial — orçamento por cliente e por
 * contrato ainda não existe nesta casa, e este número não o substitui.
 */
export const MAX_IMAGENS_POR_CLIENTE_POR_DIA = 40;

/** Teto de telas de um carrossel. Cada tela é UMA geração paga — carrossel de
 *  12 telas custa 12 imagens. O contrato de saída do especialista (3 a 6) é
 *  conferido em `especialistas.ts`; aqui é o cinto, porque a peça pode ter
 *  nascido antes daquela trava existir. */
export const MAX_TELAS_POR_CARROSSEL = 6;

export interface ArtesFeitas {
  produzidas: number;
  falhas: Array<{ postId: string; erro: string }>;
  /** Peças que desistiram — precisam de gente ou de material do cliente. */
  desistiram: string[];
  /** Peças que NÃO foram tentadas porque o cliente bateu o teto diário de
   *  imagens. Não é falha da peça e não gasta tentativa — volta amanhã. */
  semOrcamento: string[];
  /**
   * Peças cujo PEDIDO não tem pagamento confirmado. Não é falha da peça, não
   * gasta tentativa e não vira erro na tela do cliente: a peça espera o
   * dinheiro. Ver `lib/agency/financeiro/portao-de-pagamento.ts`.
   */
  semPagamento: string[];
  /**
   * A rodada inteira parou antes de gastar um centavo porque a casa não tem
   * como aplicar o molde. Sai preenchido com o motivo, e vazio quando tudo
   * estava montado. Ver o bloco "O DINHEIRO SAI ANTES DA PORTA FECHAR".
   */
  semRenderizador?: string;
}

/**
 * O recorte OPCIONAL de uma rodada de arte.
 *
 * Existe por uma razão de DINHEIRO, não de comodidade: a rodada é global (pega
 * as 6 peças mais antigas da casa inteira), e um botão que diz "produz as peças
 * da CityJobs" chamando-a sem recorte gastaria imagem paga de Foocci, Camila e
 * de quem mais tivesse peça na fila. O operador autorizaria um cliente e pagaria
 * por quatro.
 *
 * Ausente = a rodada de sempre, byte por byte. É isso que o despertador chama.
 */
export interface RecorteDaRodadaDeArte {
  /** Só as peças DESTE cliente. `undefined` = todos, como sempre foi. */
  clientId?: string;
  /**
   * REFAZER estas peças NOMEADAS — mesmo que elas já tenham `mediaUrl`.
   *
   * ── POR QUE ISTO EXISTE (15/08/2026) ──────────────────────────────────────
   *
   * A direção de arte passou a chegar ao gerador neste dia, e o portão de pixel
   * do fundo passou a valer. Só que o estoque do cliente foi produzido ANTES —
   * com `mediaUrl` preenchido. `mediaUrl: null` (a seleção de sempre) não
   * alcança nenhuma dessas peças: a esteira consertada não tem o que mostrar,
   * porque o estoque foi feito pela esteira velha.
   *
   * ⚠️ Isto NÃO é um segundo caminho de produção. É o MESMO laço, com a mesma
   * ordem de portões (pilar → tentativas → teto diário → foto do cliente →
   * portão do fundo → composição da marca → trava de texto), a mesma gravação e
   * o mesmo orçamento. O que muda é uma linha de `where` — e tinha de ser
   * assim: uma cópia deste laço para "refazer" começaria idêntica e divergiria
   * no primeiro ajuste, que foi exatamente como nasceu o defeito do carrossel
   * recomposto pela função de peça única.
   *
   * ── NÃO É DESTRUTIVO ──────────────────────────────────────────────────────
   *
   * A peça continua com a arte velha até a nova ficar pronta: `mediaUrl` só é
   * reescrito na linha final do laço, depois de a imagem ter sido paga, ter
   * passado no portão do fundo, ter sido composta e ter sido guardada. Falha em
   * qualquer ponto deixa a peça exatamente como estava.
   *
   * QUEM decide a lista não é esta função — é `refazer-com-direcao.ts`, que
   * barra peça aprovada pelo cliente e peça sem direção no entregável de origem.
   */
  refazer?: string[];
}

/**
 * Produz a arte que falta nos posts já agendados.
 *
 * Só toca em post SEM mídia. Post com foto do cliente não é sobrescrito: a foto
 * real da padaria dele vale mais que qualquer imagem gerada, e trocá-la seria a
 * agência decidindo que sabe melhor.
 */
export async function produzirArtesPendentes(recorte: RecorteDaRodadaDeArte = {}): Promise<ArtesFeitas> {
  const saida: ArtesFeitas = { produzidas: 0, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [] };

  // ── O DINHEIRO SAI ANTES DA PORTA FECHAR (08/08/2026) ─────────────────────
  //
  // `comporComMolde` é FAIL CLOSED desde 07/08: sem Chromium a peça não é
  // gravada, e isso está certo — ferramenta faltando é problema da agência, não
  // um entregável pior para o cliente pagante.
  //
  // Só que a porta fecha DEPOIS da foto. A ordem real era: gerar a imagem de IA
  // (que custa, por peça), guardar, e só então descobrir que não há navegador
  // para pôr a camada de texto — e jogar tudo fora. Medido em produção em
  // 08/08: `/api/capacidades` respondeu `montar-molde: pronta:false` com
  // `onde_achei_o_navegador: null`, e o despertador bate a cada 5 minutos. É
  // uma torneira de dinheiro aberta contra um balde furado, 288 vezes por dia.
  //
  // `renderizadorDisponivel()` foi escrito exatamente para isto — o docstring
  // dele diz "para o chamador decidir ANTES de gastar uma imagem de IA que ele
  // não conseguiria compor" — e não tinha um único chamador no caminho vivo.
  // Agora tem.
  //
  // Isto NÃO afrouxa nada e NÃO é um caminho alternativo: nenhuma peça sai crua
  // por causa desta guarda. Ela só antecipa uma recusa que ia acontecer de
  // qualquer jeito, para que a recusa não custe.
  const renderizador = await renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null }));
  if (!renderizador.disponivel) {
    saida.semRenderizador =
      "não há Chromium para rasterizar o molde neste ambiente — NENHUMA arte foi tentada, e nenhuma imagem de IA foi paga. " +
      "Confira `playwright` em `dependencies` e o pacote `chromium` em `railpack.json → deploy.aptPackages`. " +
      "Diagnóstico ao vivo em GET /api/capacidades → `montar-molde`.";
    return saida;
  }

  // A lista NOMEADA vence a seleção por ausência de arte — e só ela. Lista
  // vazia NÃO vira "pega tudo": `refazer: []` é um pedido de refazer nada, e
  // transformá-lo na rodada global gastaria imagem paga de quem ninguém
  // autorizou. Por isso o teste é `!== undefined`, não `.length > 0`.
  const refazendo = recorte.refazer !== undefined;

  const pendentes = await prisma.socialPost.findMany({
    where: {
      // `mediaUrl: null` cobre o carrossel também: ele só recebe a capa quando
      // TODAS as telas ficam prontas, então um carrossel pela metade continua
      // aparecendo como pendente na rodada seguinte.
      ...(refazendo ? { id: { in: recorte.refazer! } } : { mediaUrl: null }),
      // ── POR QUE "revision_requested" SÓ ENTRA REFAZENDO (25/08/2026) ──────
      //
      // O Auditor mediu: o cliente pediu "a terceira peça mais clara", a rota
      // devolveu 200 e **0 de 4 arquivos mudaram**. Uma das duas causas estava
      // aqui — a rota do portal marca a peça apontada como `revision_requested`
      // (`app/api/portal/approvals/route.ts`), e este `where` não a selecionava.
      // A peça que o cliente pediu para mudar era exatamente a única que não
      // podia ser produzida de novo.
      //
      // Ela entra SÓ no caminho nomeado (`refazer`), e a distinção não é
      // estilo: na rodada de sempre a seleção é `mediaUrl: null`, e peça em
      // revisão TEM arquivo — ela nunca seria alcançada de qualquer forma.
      // Manter o estado fora do laço global deixa explícito que ninguém
      // redesenha uma peça em revisão por conta do relógio: só quem a NOMEIA.
      status: { in: refazendo ? ["draft", "scheduled", "approved", "revision_requested"] : ["draft", "scheduled", "approved"] },
      // O recorte por cliente é OPCIONAL e some quando ninguém o pede — sem ele
      // o `where` é idêntico ao de sempre. `clientId: undefined` seria ignorado
      // pelo Prisma de qualquer forma; a condicional está aqui para que a
      // ausência seja legível para quem lê, não só para o driver.
      ...(recorte.clientId ? { clientId: recorte.clientId } : {}),
    },
    orderBy: { scheduledFor: "asc" },
    // Refazendo, o teto é o TAMANHO DO LOTE que o chamador nomeou — ele já foi
    // aparado lá, contra o tempo da requisição. `MAX_ARTES_POR_RODADA` continua
    // mandando na rodada de sempre.
    take: refazendo ? Math.min(recorte.refazer!.length, MAX_ARTES_POR_RODADA) : MAX_ARTES_POR_RODADA,
  }).catch(() => []);
  if (pendentes.length === 0) return saida;

  // O estilo visual observado no feed REAL do cliente. SÓ da síntese
  // persistida (leitura-do-cliente.ts) — esta rodada dispara a cada 5 minutos
  // pelo despertador, e bater na Graph aqui seria rajada no rate limit da
  // Meta. Sem síntese fresca, vazio — e vazio é vazio: o prompt não menciona
  // o feed. Memoizado por CLIENTE para não repetir a consulta a cada peça.
  //
  // A chave é `clientId`, não `clientRequestId`: o post de cliente DIRETO nasce
  // com clientRequestId nulo (publicacao.ts), e chavear pela solicitação
  // devolvia "" para sempre — em silêncio, sem erro e sem teste vermelho —
  // justamente no cliente-piloto, que é o único criado direto.
  const estilosDoFeed = new Map<string, string>();
  const estiloDoFeedDe = async (clientId: string | null): Promise<string> => {
    if (!clientId) return "";
    if (!estilosDoFeed.has(clientId)) {
      estilosDoFeed.set(clientId, await estiloVisualPersistido(clientId).catch(() => ""));
    }
    return estilosDoFeed.get(clientId) ?? "";
  };

  // O que a VISÃO viu nas imagens do feed — vocabulário fechado, gravado pela
  // leitura do cliente. Mesmo caminho do de cima: só o persistido, nunca uma
  // chamada de visão aqui. Visão custa por imagem, e esta rodada dispara a cada
  // 5 minutos — uma chamada aqui multiplicaria a fatura pelo relógio.
  const estilosVistos = new Map<string, string>();
  const estiloVistoDe = async (clientId: string | null): Promise<string> => {
    if (!clientId) return "";
    if (!estilosVistos.has(clientId)) {
      estilosVistos.set(clientId, await estiloVistoPersistido(clientId).catch(() => ""));
    }
    return estilosVistos.get(clientId) ?? "";
  };

  const orcamento = abrirOrcamentoDoDia();

  // ── O PORTÃO DE PAGAMENTO, memoizado por PEDIDO ──────────────────────────
  //
  // Este laço é a torneira mais cara da casa: ~US$0,17–0,25 por imagem, e o
  // despertador o abre a cada 5 minutos. Ele NÃO passa por `run-execution`, que
  // é onde mora o outro portão — então um portão só lá deixaria justamente o
  // caminho caro aberto. É aqui que o dinheiro sai; é aqui que a trava fica.
  //
  // Memoizado porque uma rodada traz até 6 peças e elas costumam ser do mesmo
  // pedido: sem memo seriam 6 idas ao banco para responder a mesma pergunta.
  const pagamentoDoPedido = new Map<string, boolean>();

  for (const post of pendentes) {
    // PRIMEIRA COISA DO LAÇO, antes até do pilar: nenhuma verificação que possa
    // escrever no banco ou custar deve rodar antes de sabermos se este pedido
    // pode gastar. Peça sem pagamento não gasta tentativa e não recebe
    // `marcarErro` — ela simplesmente espera o dinheiro e volta na próxima
    // rodada, sem sujar a tela do cliente com um erro que não é dele.
    // A âncora: o pedido do post ou, quando ele é de cliente DIRETO (nasce com
    // `clientRequestId` nulo em `publicacao.ts`), o pedido derivado do cliente.
    // Quem deriva é o próprio portão — derivação, nunca invenção, e não achando
    // nada o veredito é recusa.
    const chave = post.clientRequestId ?? `cli:${post.clientId ?? "<sem-dono>"}`;
    if (!pagamentoDoPedido.has(chave)) {
      const v = await conferirPagamentoDaAncora({
        clientRequestId: post.clientRequestId,
        clientId: post.clientId,
      });
      pagamentoDoPedido.set(chave, v.liberado);
    }
    if (!pagamentoDoPedido.get(chave)) {
      saida.semPagamento.push(post.id);
      continue;
    }

    // ── PILAR BLOQUEADO: NEM PEDE A IMAGEM ──────────────────────────────────
    // Primeira coisa do laço, antes do teto de gasto e antes de qualquer
    // chamada paga. Foi exatamente aqui que a casa queimou geração de imagem
    // três vezes em 07/08 para jogar as três peças fora — e a segunda tentativa
    // do pilar de salário inventou um número NOVO ("R$6.000" depois de
    // "$3,500"), o que prova que regerar não é conserto.
    //
    // `desistiram`, e não `falhas`: não foi a máquina que falhou, e a peça não
    // pode voltar na próxima rodada gastando tentativa. Quem a destrava é a
    // conferência de pixel, não o relógio.
    const vereditoDoPilar = conferirPilar(post.pillar);
    if (vereditoDoPilar.bloqueado) {
      saida.desistiram.push(post.id);
      await marcarErro(post.id, motivoCurto(vereditoDoPilar), null);
      continue;
    }

    const tentativas = contarTentativas(post.lastError);

    // ── REEL: o vídeo do CLIENTE, editado ────────────────────────────────────
    // Gerar imagem estática e publicá-la como reel entregaria algo que ele não
    // comprou. O que a casa faz é EDITAR o material bruto que ele mandou — que
    // até 02/08/2026 ficava parado no armazenamento, sem ninguém tocar.
    if (post.format === "reel" || post.format === "video") {
      if (tentativas >= MAX_TENTATIVAS_POR_PECA) { saida.desistiram.push(post.id); continue; }
      const r = await montarReel(post);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      if (r.semMaterial) {
        // Não é falha da máquina: falta material do cliente. Gastar tentativa
        // aqui esgotaria o teto esperando algo que só ele pode resolver.
        saida.desistiram.push(post.id);
        await marcarErro(post.id, `aguardando vídeo do cliente — ${r.erro}`, null);
      } else {
        await marcarErro(post.id, r.erro, tentativas + 1);
      }
      continue;
    }

    if (tentativas >= MAX_TENTATIVAS_POR_PECA) {
      saida.desistiram.push(post.id);
      continue;
    }

    // ── O TETO DIÁRIO, ANTES DE QUALQUER CHAMADA PAGA ───────────────────────
    // Conferido aqui e não dentro do gerador porque o que custa é a CHAMADA:
    // depois dela o dinheiro já saiu, independentemente do que aconteça com os
    // bytes.
    const disponivel = await orcamento.restam(post.clientId);
    if (disponivel.erro) {
      // Não deu para ler o contador. Fail-CLOSED de propósito: um teto de gasto
      // que se desliga sozinho quando o banco tosse não é teto. A peça volta na
      // rodada seguinte e NÃO gasta tentativa — não foi ela que falhou.
      saida.falhas.push({ postId: post.id, erro: `não consegui conferir o teto diário de imagens (${disponivel.erro}) — a peça fica para a próxima rodada` });
      continue;
    }

    const marca = await lerMarca(post.clientId);
    const estiloDoFeed = await estiloDoFeedDe(post.clientId);
    const estiloVisto = await estiloVistoDe(post.clientId);

    // ── A FOTO REAL DO CLIENTE, ANTES DA GERADA ──────────────────────────────
    //
    // Decidida em `escolha-de-foto.ts`, por razão de ASSUNTO — e não por um
    // interruptor global. Post avulso não declara papel de imagem, então a
    // régua é a mais estrita: exatamente um arquivo com lastro no texto.
    //
    // Fica ANTES do teto diário de propósito: foto real não custa chamada de
    // modelo nenhuma. Barrar por orçamento uma peça que não vai gastar seria o
    // teto de gasto impedindo a versão mais barata E melhor da peça.
    const escolhaDaFoto =
      post.format === "carousel" || post.format === "carrossel"
        ? null
        : escolherFotoParaPostAvulso({ legenda: post.caption, disponiveis: marca.fotosReais });

    let fotoDoCliente: { bytes: Buffer; mime: string; razao: string } | null = null;
    if (escolhaDaFoto?.usar) {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: escolhaDaFoto.foto.mediaAssetId }, select: { storagePath: true, workspaceId: true },
      }).catch(() => null);
      // Posse conferida no servidor, como em `montarArteComFotoDoCliente`:
      // arquivo de outro workspace não vira peça deste.
      const bytesDaFoto = asset && asset.workspaceId === post.workspaceId
        ? await lerArquivo(asset.storagePath).catch(() => null)
        : null;
      if (bytesDaFoto && bytesDaFoto.length > 0) {
        fotoDoCliente = { bytes: Buffer.from(bytesDaFoto), mime: escolhaDaFoto.foto.mimeType, razao: escolhaDaFoto.razao };
      }
      // Arquivo escolhido que sumiu do disco NÃO derruba a peça: cai na imagem
      // gerada, que é o comportamento de sempre. O que ele não pode é sair
      // como se a foto do cliente tivesse entrado.
    }

    // O teto só vale para quem vai GERAR. Quem já tem a foto do cliente passa.
    if (!fotoDoCliente && disponivel.restam <= 0) {
      saida.semOrcamento.push(post.id);
      continue;
    }

    // ── CARROSSEL: uma arte POR TELA ─────────────────────────────────────────
    // Gerar uma imagem só e repetir seria entregar cinco vezes a mesma coisa.
    // Cada tela é uma ideia, e a arte tem que acompanhar a ideia dela.
    if (post.format === "carousel" || post.format === "carrossel") {
      const r = await montarCarrossel(post, marca, estiloDoFeed, estiloVisto, disponivel.restam);
      // O gasto conta ANTES do veredito: imagem gerada é imagem paga, mesmo que
      // o carrossel inteiro tenha sido descartado depois.
      orcamento.gastar(post.clientId, r.gerou);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      if (r.semOrcamento) {
        // O carrossel não cabe no que sobrou hoje. Não é falha da peça: gastar
        // tentativa aqui esgotaria o teto por causa do relógio.
        saida.semOrcamento.push(post.id);
        continue;
      }
      await marcarErro(post.id, r.erro, tentativas + 1);
      continue;
    }

    // Story é VERTICAL. Gerar quadrado e publicar como story corta a peça no
    // meio — e o cliente vê o próprio conteúdo mutilado no perfil dele.
    const proporcao = post.format === "story" ? "portrait" : "square";

    let bytes: Buffer | null = null;
    let mimeDaFoto = "image/png";

    if (fotoDoCliente) {
      // A foto REAL do cliente. Nenhuma chamada paga, nenhum download: os bytes
      // já estão no armazenamento da casa desde que ele os mandou.
      bytes = fotoDoCliente.bytes;
      mimeDaFoto = fotoDoCliente.mime;
    } else {
      // ── O PRÉ-PORTÃO DA DIREÇÃO, ANTES DE PAGAR (15/08/2026) ──────────────
      //
      // Última porta antes do dinheiro sair. O portão do pixel
      // (`conferirFundoDaPeca`, mais abaixo) é a trava certa e continua onde
      // está — mas ele só pode falar depois de a imagem existir, e imagem que
      // existe já custou US$ 0,167. Em 15/08 a casa pagou seis vezes para
      // receber quatro reprovações de "paleta de ilustração".
      //
      // Este aqui não olha pixel: olha a FRASE que vira o pedido. Direção que
      // não nomeia sujeito, lugar e luz não descreve uma foto — descreve um
      // conceito, e conceito o gerador resolve com símbolo e cor chapada.
      //
      // `desistiram`, e não `falhas`, pelo mesmo motivo do pilar bloqueado
      // (topo deste laço): nenhuma tentativa a mais conserta uma direção
      // abstrata. Quem conserta é quem a escreveu. Sem tentativa gasta, sem
      // orçamento consumido, sem imagem gerada.
      //
      // ⚠️ SÓ DISPARA COM DIREÇÃO ESCRITA. Peça sem `artDirection` continua
      // caindo na legenda — é o fallback de reversibilidade decidido no mesmo
      // dia (`__tests__/execution/direcao-de-arte-chega-ao-gerador.test.ts`,
      // "post sem direção (peça anterior a 15/08) continua saindo pela
      // legenda"), e revogá-lo aqui congelaria o acervo inteiro anterior a
      // 15/08. O buraco está declarado em `docs/pendencias.md`.
      //
      // ── E O CAMINHO DE VOLTA, QUE FALTAVA (25/08/2026) ────────────────────
      //
      // Até hoje este portão reprovava e gravava "reescreva a direção" — e
      // NINGUÉM reescrevia. Medido em produção: 4 peças, 4 rodadas do
      // despertador, `mediaUrl: null` nas quatro, US$ 0,00 gastos e nenhum
      // arquivo. `marcarErro(..., null)` nem gastava tentativa, então a peça
      // voltava a cada 5 minutos para sempre, reprovando igual, em silêncio.
      // Fila morta com aviso bonito.
      //
      // Agora a direção reprovada VOLTA a quem a escreveu, com o motivo da
      // recusa na mão, e passa pela MESMA régua antes de qualquer imagem ser
      // pedida (`design/reescrever-direcao.ts`). O portão não afrouxou: a régua
      // é a mesma função, sem tolerância. O que mudou é que a proibição passou a
      // dizer o que fazer no lugar.
      let direcaoEscrita = (post.artDirection ?? "").trim();
      if (direcaoEscrita) {
        const veredito = conferirDirecaoFotografavel(direcaoEscrita);
        if (!veredito.fotografavel) {
          // O contador mora no `lastError` e ATRAVESSA RODADAS: sem isto, cada
          // rodada do despertador recomeçaria do zero e a peça gastaria duas
          // chamadas de texto a cada 5 minutos, para sempre — trocaria uma fila
          // morta de graça por uma fila morta que custa.
          const jaGastas = contarReescritasDaDirecao(post.lastError);
          const r = await reescreverDirecao(
            {
              direcaoOriginal: direcaoEscrita,
              legenda: post.caption,
              pilar: post.pillar,
              negocio: marca.nome,
              segmento: marca.segmento,
              formato: post.format,
            },
            veredito,
            async (pedido) => {
              const g = await generate({
                system: pedido.system,
                user: pedido.user,
                maxTokens: 400,
                workspaceId: post.workspaceId,
                // O dono da linha de custo tem NOME PRÓPRIO, e não é
                // `design-engine`: aquele é o dono da IMAGEM. Um gasto de TEXTO
                // somado ao de imagem faria "quanto custou a arte deste cliente"
                // misturar US$ 0,003 com US$ 0,167 na mesma linha.
                agentId: "design-reescrever-direcao",
                clientId: post.clientId ?? null,
              });
              if (!g.ok) return { ok: false as const, error: g.error };
              const direcao = (g.data as { direction?: unknown })?.direction;
              const texto = typeof direcao === "string" ? direcao : (g.textoCru ?? "");
              return { ok: true as const, texto };
            },
            jaGastas,
          );

          if (!r.ok) {
            // PARADA DECLARADA: motivo, dono e próxima ação já vêm escritos.
            // `desistiram` e `marcarErro(..., null)` continuam certos — não foi
            // a máquina de arte que falhou, e nenhuma tentativa de ARTE foi
            // gasta. O que impede o laço eterno agora é o contador da reescrita.
            saida.desistiram.push(post.id);
            await marcarErro(post.id, r.motivo, null);
            continue;
          }

          // A direção reescrita é GRAVADA. Se ela ficasse só na memória desta
          // rodada, a rodada seguinte releria a direção velha do banco e pagaria
          // a reescrita de novo — e o entregável continuaria mentindo sobre o
          // que foi pedido à câmera.
          // ── A REESCRITA APARECE NO LOG DA RODADA ────────────────────────
          // Um mecanismo que ninguém consegue ver rodando é um mecanismo que
          // ninguém consegue auditar — e foi assim que sete auditorias
          // homologaram uma corrente que não entregava nada. O despertador já
          // conta arte produzida e arte falhada; a direção reescrita é o terceiro
          // desfecho, e até aqui ele era mudo.
          console.log(
            `[arte] direção reescrita (${r.reescritas}/${MAX_REESCRITAS_DA_DIRECAO}) na peça ${post.id}: ` +
            `faltava ${veredito.faltou.join(", ")} — agora "${r.direcao.slice(0, 120)}"`,
          );
          direcaoEscrita = r.direcao;
          await prisma.socialPost.update({
            where: { id: post.id },
            data: { artDirection: r.direcao, lastError: null },
          }).catch(() => { /* best-effort: a imagem desta rodada não depende disto */ });
        }
      }

      const r = await generateDesign({
        prompt: montarPrompt({
          legenda: post.caption,
          // ── O QUE O GERADOR PASSA A RECEBER (15/08/2026) ──────────────────
          // A direção de arte que o especialista escreveu, e que até hoje era
          // gravada no entregável e descartada na leitura. `null` cai na
          // legenda — o comportamento de antes, mantido de propósito.
          // A direção REESCRITA quando houve reescrita; a do banco quando não
          // houve. Ler `post.artDirection` aqui mandaria ao gerador exatamente a
          // direção que a régua acabou de recusar.
          direcaoDeArte: direcaoEscrita || post.artDirection,
          pilar: post.pillar,
          negocio: marca.nome,
          segmento: marca.segmento,
          cores: marca.cores,
          tom: marca.tom,
          formato: post.format,
          estiloDoFeed,
          estiloVisto,
          // ── A MARCA CHEGA À IMAGEM, E NÃO SÓ AO TEXTO (13/08/2026) ─────────
          //
          // Até aqui a amplitude declarada da marca — os extremos permitidos e,
          // sobretudo, a lista `NUNCA` de cada eixo — só entrava no prompt do
          // CARROSSEL (`montarCarrossel`, mais abaixo). O post simples e o
          // STORY, que são o volume da casa (60 posts/mês só no CityJobs),
          // recebiam seis constantes do CLIENTE (nome, segmento, cores, tom,
          // estilo do feed, estilo visto) e dois campos da peça (legenda e
          // pilar). Nada do contrato criativo daquela marca.
          //
          // O efeito medido, com a peça na mão: o cérebro do CityJobs diz
          // `NUNCA: banco de imagem genérico sem relação com a região` e
          // `NUNCA: estética de escritório de tecnologia — coworking, tablet,
          // mármore, café` (`repertorio-registrado.ts`), e essa frase nunca
          // chegou ao gerador de uma peça avulsa. Regra escrita que não
          // atravessa a porta é a doença que esta casa já nomeou duas vezes:
          // `contratoDeMarca` chega a quem escreve a LEGENDA
          // (`run-execution.ts:347`) e não a quem desenha a IMAGEM.
          //
          // Cérebro sem amplitude devolve string vazia e o prompt não fala de
          // amplitude nenhuma — vazio continua sendo vazio.
          amplitude: direcaoDeAmplitude(marca.cerebro),
        }),
        size: proporcao,
        quality: "high",
        workspaceId: post.workspaceId,
        // A QUEM ESTA IMAGEM É COBRADA. Sem isto a linha do livro-caixa sai sem
        // cliente, e "quanto custou este cliente este mês" volta a não ter
        // resposta — que é o defeito que o registro de custo existe para matar.
        conta: { departmentId: "design", clientId: post.clientId, agentId: "design-engine" },
      }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));
      // A chamada saiu: o dinheiro saiu junto, deu certo ou não.
      orcamento.gastar(post.clientId, 1);

      if (!r.ok || !r.url) {
        const erro = r.error ?? "o gerador de imagem não devolveu nada";
        saida.falhas.push({ postId: post.id, erro });
        await marcarErro(post.id, erro, tentativas + 1);
        continue;
      }

      // ── DAQUI PARA BAIXO A IMAGEM JÁ FOI PAGA ─────────────────────────────
      // Todo caminho de saída GASTA TENTATIVA. Não é zelo: o `continue` sem
      // `marcarErro` era um vazamento de dinheiro puro — `contarTentativas`
      // nunca subia, `MAX_TENTATIVAS_POR_PECA` nunca era atingido, e a peça
      // voltava na rodada seguinte (a cada 5 minutos, para sempre) gerando uma
      // imagem paga por rodada sem NUNCA entregar nada.
      bytes = await baixarImagem(r.url).catch(() => null);
      if (!bytes) {
        const erro = "não consegui baixar a imagem gerada";
        saida.falhas.push({ postId: post.id, erro });
        await marcarErro(post.id, erro, tentativas + 1);
        continue;
      }

      // ── O PORTÃO DE PIXEL, NO FUNDO CRU (15/08/2026) ──────────────────────
      //
      // `trava-de-fundo.ts` existe desde 08/08 — escrito depois de o CEO
      // reprovar duas peças do CityJobs com prédio-retângulo e sol-círculo — e
      // ficou SETE DIAS sem um único chamador em `lib/`. Teste verde protegendo
      // uma entrega, não a casa.
      //
      // O lugar é aqui e é medido: no fundo CRU a separação entre foto real e
      // clipart vetorial é de 29×; na peça já composta (com painel sólido,
      // tipografia e assinatura por cima) cai para 1,2×, e o portão vira
      // roleta. Por isso ele roda ANTES de guardar e ANTES de compor.
      //
      // A imagem JÁ FOI PAGA quando chegamos aqui — o portão não economiza
      // dinheiro, ele impede que peça amadora saia em nome de um cliente
      // pagante. Gasta tentativa: regerar É o remédio certo para este caso
      // (diferente do pilar bloqueado, onde regerar só inventa número novo).
      // ── ⚠️ DÍVIDA DECLARADA: A RÉGUA NÃO ALCANÇA A PEÇA COMPOSTA ─────────
      //
      // O raciocínio acima está certo e é medido (29× no fundo cru contra 1,2×
      // na peça composta). A consequência, porém, é um vão — e o cliente
      // oculto de 25/08/2026 caiu nele, em PRODUÇÃO:
      //
      //   SocialPost cmt8xk6ks00790xqofkbfqpab (TRATTORIA DA ANA TESTE)
      //   /api/media/med_35f7fcb6_mt8xpfoj — HTTP 200, 1080x1350, 19.207 bytes
      //   sha256 394850e7fdc09af5c2cd4ac633b368866f68d0cdb594d2d3d0ca1921238fa7aa
      //
      //   A peça saiu com a FOTO AUSENTE (retângulo cinza chapado no lugar
      //   dela), o TÍTULO CORTADO no meio da frase ("O ambiente cheio", quando
      //   a legenda é "O ambiente cheio que faz você querer estar aqui
      //   também.") e SEM assinatura de marca. Comparada: a peça irmã do mesmo
      //   cliente (med_1f79e9f3_mt8xj2gu, 150.203 bytes) saiu correta. O
      //   tamanho do arquivo já denunciava — 19 KB para 1080x1350.
      //
      //   E ela está `status: "draft"`, `visibility: "compartilhado"` — ou
      //   seja, VISÍVEL NO PORTAL DO CLIENTE (`app/api/portal/vista/route.ts`
      //   filtra exatamente por esse carimbo).
      //
      // O `lastError` da peça declara honestamente a falta de MARCA (molde
      // neutro, monograma no lugar do logo). Não declara a foto ausente nem o
      // título cortado: essas duas ninguém mediu.
      //
      // A pergunta obrigatória desta casa é *"o teste alcança o código que
      // responde ao cliente?"*. Aqui, não: o portão protege o FUNDO, e o
      // cliente recebe a COMPOSIÇÃO. Régua verde sobre o componente errado.
      //
      // O conserto NÃO é mover este portão (o número de 1,2× diz que ali ele
      // vira roleta). É uma régua NOVA sobre o arquivo final, antes de
      // `visibility: "compartilhado"`, capaz de responder três coisas que esta
      // não responde: a foto entrou? o texto coube? a assinatura está lá?
      // Fica com dono e sem contorno inventado.
      const portao = await conferirFundoDaPeca({ bytes, mime: "image/png" });
      if (!portao.ok) {
        const erro = motivoDoFundoEmUmaLinha(portao);
        saida.falhas.push({ postId: post.id, erro });
        await marcarErro(post.id, erro, tentativas + 1);
        continue;
      }

      // ── A FOTO GERADA É GUARDADA À PARTE ──────────────────────────────────
      // Custa um arquivo a mais por peça, e paga isso na primeira correção de
      // texto: com o fundo em disco, trocar a chamada da arte é rasterização
      // local (≈1s), não uma chamada nova e paga ao modelo de imagem.
      //
      // A foto REAL do cliente não passa por aqui: ela já está guardada (é o
      // arquivo que ele mandou), e copiá-la com nome `fundo-*` a faria contar
      // como geração paga no orçamento do dia, que conta exatamente esses
      // arquivos. O re-render de texto encontra o fundo pelo mesmo caminho.
      const fundo = await guardarArquivo({
        bytes,
        fileName: nomeDoFundo(post.id),
        mimeType: "image/png",
        workspaceId: post.workspaceId,
        clientId: post.clientId,
        clientRequestId: post.clientRequestId,
        kind: "generated",
        uploadedBy: "design",
      });
      if (!fundo.ok) {
        saida.falhas.push({ postId: post.id, erro: fundo.motivo });
        await marcarErro(post.id, fundo.motivo, tentativas + 1);
        continue;
      }
    }

    // ── A COMPOSIÇÃO DO POST SIMPLES, PELO CÉREBRO DA MARCA (15/08/2026) ────
    //
    // `composicaoParaFuncao` existia desde 09/08 e era chamada em TRÊS lugares
    // — `artes.ts` (duas vezes) e `recompor-carrossel.ts` —, e os três são
    // CARROSSEL. O post simples, que é o volume da casa (60/mês só no
    // CityJobs), nunca passava por ela: caía no `peca.composicao ?? "foto-cheia"`
    // de `molde.ts`. Para o CityJobs isso é a composição que o próprio formato
    // PROÍBE, com o motivo escrito no registro ("viraria a mesma peça 60 vezes
    // por mês").
    //
    // O papel da peça vem do PILAR, resolvido contra as funções que a marca
    // declarou — nunca inventado. Marca sem formato registrado continua em
    // foto-cheia, que é o comportamento de antes.
    const escolhaDaComposicao = composicaoDoPostSimples(marca.cerebro, post.pillar);

    // ── A CAMADA DE TEXTO, POR CÓDIGO ───────────────────────────────────────
    const composta = await comporComMolde({
      formato: formatoDoPost(post.format),
      molde: marca.molde,
      fotoBytes: bytes,
      fotoMime: mimeDaFoto,
      // ⚠️ `fonteAuditada` é a LEGENDA, e continua sendo só ela. A direção de
      // arte (`post.artDirection`) alimenta o PROMPT DA IMAGEM e NUNCA esta
      // linha: ela não passa pelo piso de verdade, e o que vira pixel tem de
      // ser trecho literal de conteúdo auditado. Há teste de fonte que reprova
      // quem passar `artDirection` aqui.
      fonteAuditada: post.caption,
      selo: post.pillar,
      assinatura: marca.nome,
      indice: null,
      composicao: escolhaDaComposicao.composicao,
      // ── OS CHIPS E A FAIXA (15/08/2026) ───────────────────────────────────
      //
      // A peça que o CEO produziu à mão tem três chips e uma faixa de chamada;
      // a fábrica não tinha onde encaixar nenhum dos dois. Agora tem — e com a
      // trava junto, na mesma passada, porque slot sem trava faria o portão
      // barrar exatamente a peça que se quer produzir.
      //
      // A FAIXA só sai para quem DECLAROU rótulos. Não é economia de código: é
      // a regra de que nenhuma peça muda de cara sem alguém pedir. Preencher
      // `BrandBrain.artLabelsJson` é o pedido.
      chips: marca.rotulos,
      fichaDaMarca: marca.ficha,
      chamada: marca.rotulos.length > 0 ? chamadaDaMarca(marca.nome) : null,
      // O que aconteceu com o material do cliente — a foto que ENTROU e por
      // quê, ou o que havia e por que nada entrou. Sem isto, "a peça saiu
      // igual" continua sendo invisível de fora.
      notaDoMaterial: [
        fotoDoCliente
          ? `[foto do cliente] ${fotoDoCliente.razao}`
          : escolhaDaFoto && !escolhaDaFoto.usar && escolhaDaFoto.explicacao
            ? `[material do cliente] ${escolhaDaFoto.explicacao}`
            : null,
        // Layout sem procedência é layout que ninguém audita depois. Só sobe
        // quando NÃO foi o repertório que decidiu — o caminho bom é silencioso.
        escolhaDaComposicao.origem === "repertorio"
          ? null
          : `[composição ${escolhaDaComposicao.composicao}] ${escolhaDaComposicao.porque}`,
      ].filter(Boolean).join(" ") || null,
    });
    // Molde impossível por falta de ferramenta = a peça não existe. Falha
    // contada como falha, com tentativa gasta, e NADA gravado no post.
    if (!composta.ok) {
      saida.falhas.push({ postId: post.id, erro: composta.erro });
      await marcarErro(post.id, composta.erro, tentativas + 1);
      continue;
    }

    // Guardada no MESMO lugar que o material do cliente: um só armazenamento,
    // uma só cota, um só link assinado que a Meta consegue buscar.
    const guardado = await guardarArquivo({
      bytes: composta.bytes,
      // PEÇA FINAL — é ela que vira `mediaUrl` e que a Meta vai buscar. Nome e
      // MIME saem do que a composição REALMENTE produziu, nunca de um literal.
      fileName: nomeDaArte(post.id, composta.mime),
      mimeType: composta.mime,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!guardado.ok) {
      saida.falhas.push({ postId: post.id, erro: guardado.motivo });
      await marcarErro(post.id, guardado.motivo, tentativas + 1);
      continue;
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      // A nota do molde NÃO gasta tentativa (não casa com o padrão "[arte n/"):
      // peça sem camada de texto é peça entregue, não peça falhada. O que ela
      // não pode é sair sem alguém saber que saiu assim.
      data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: composta.nota },
    });
    saida.produzidas++;
    // A ARTE SAIU: o arquivo, a peça e o preço de tabela, numa linha só.
    // Sem isto o único rastro de uma imagem paga era `mediaUrl` no banco — e
    // "quanto a casa produziu hoje" só se respondia abrindo o banco. O custo
    // é ESTIMATIVA DE TABELA (a linha do livro-caixa é escrita pelo motor, em
    // `design-engine.ts`); esta casa não lê o faturamento do provedor.
    console.log(
      `[arte] peça ${post.id} recebeu arte — /api/media/${guardado.arquivo.id}` +
      ` · cliente=${post.clientId ?? "(sem dono)"} · formato=${post.format}` +
      ` · custo estimado de tabela US$ ${PRECO_DA_IMAGEM_NA_TABELA(post.format).toFixed(3)} (estimativa, não fatura)`,
    );
  }

  contarOSilencio(saida);
  return saida;
}

/** O preço de tabela de UMA imagem no recorte que esta rodada pede. Lido da
 *  tabela única da casa — nunca digitado aqui. */
function PRECO_DA_IMAGEM_NA_TABELA(formato: string | null | undefined): number {
  return normalizarFormatoDaArte(formato) === "story" ? PRECO_DE_TABELA_USD.retrato : PRECO_DE_TABELA_USD.quadrada;
}

function normalizarFormatoDaArte(f: string | null | undefined): string {
  return (f ?? "").trim().toLowerCase();
}

/**
 * O QUE A RODADA NÃO FEZ, DITO EM VOZ ALTA.
 *
 * `desistiram`, `semOrcamento` e `semPagamento` eram três silêncios: o
 * despertador só repassa `falhas` e `semRenderizador`, então uma casa inteira
 * podendo estar parada por falta de pagamento, por teto do dia ou por pilar
 * bloqueado registrava exatamente a mesma coisa que uma casa sem trabalho —
 * "0 arte(s) produzida(s)". Fila parada conta como entrega não feita, e é a
 * mesma regra que fez `semRenderizador` existir.
 *
 * Só fala quando há o que dizer: rodada limpa continua silenciosa.
 */
function contarOSilencio(saida: ArtesFeitas): void {
  const partes: string[] = [];
  if (saida.semPagamento.length > 0) partes.push(`${saida.semPagamento.length} esperando pagamento confirmado`);
  if (saida.semOrcamento.length > 0) partes.push(`${saida.semOrcamento.length} adiada(s) pelo teto do dia`);
  if (saida.desistiram.length > 0) partes.push(`${saida.desistiram.length} desistiram (precisam de gente ou de material)`);
  if (partes.length === 0) return;
  console.log(`[arte] rodada produziu ${saida.produzidas} — e NÃO produziu: ${partes.join(" · ")}`);
}

// ─── Internos ───────────────────────────────────────────────────────────────

/**
 * O orçamento de imagens do dia, por cliente.
 *
 * O contador NÃO mora na memória do processo — essa é a lição do teto de ritmo
 * da Meta, que vale N× com N instâncias no ar e zera a cada deploy. Ele é
 * DERIVADO do banco: cada geração paga vira exatamente um arquivo `fundo-*`
 * guardado, então contar esses arquivos de hoje é contar as gerações de hoje.
 *
 * O gasto da rodada corrente é somado localmente porque os arquivos só
 * aparecem depois — a rodada não pode furar o próprio teto enquanto grava.
 *
 * Resíduo declarado: a geração que falha ANTES de salvar o fundo (download
 * caído) sai do bolso e não entra na contagem do banco. É limitada pelas 3
 * tentativas por peça, e por isso não vira laço.
 */
interface OrcamentoDeImagens {
  restam(clientId: string | null): Promise<{ restam: number; erro?: string }>;
  gastar(clientId: string | null, quantas: number): void;
}

const SEM_CLIENTE = "__sem_cliente__";

function abrirOrcamentoDoDia(): OrcamentoDeImagens {
  const lidoDoBanco = new Map<string, number | "erro">();
  const gastoNestaRodada = new Map<string, number>();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  return {
    async restam(clientId) {
      const chave = clientId ?? SEM_CLIENTE;
      if (!lidoDoBanco.has(chave)) {
        const n = clientId
          ? await prisma.mediaAsset.count({
              where: {
                clientId,
                kind: "generated",
                fileName: { startsWith: "fundo-" },
                createdAt: { gte: inicioDoDia },
              },
            }).catch(() => "erro" as const)
          : 0;
        lidoDoBanco.set(chave, n);
      }
      const jaHoje = lidoDoBanco.get(chave)!;
      if (jaHoje === "erro") return { restam: 0, erro: "o contador do dia não pôde ser lido" };
      return { restam: MAX_IMAGENS_POR_CLIENTE_POR_DIA - jaHoje - (gastoNestaRodada.get(chave) ?? 0) };
    },
    gastar(clientId, quantas) {
      if (quantas <= 0) return;
      const chave = clientId ?? SEM_CLIENTE;
      gastoNestaRodada.set(chave, (gastoNestaRodada.get(chave) ?? 0) + quantas);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// `SocialPost.lastError` — O CAMPO COMPARTILHADO, DECLARADO (6ª auditoria)
// ═══════════════════════════════════════════════════════════════════════════
//
// O achado: `[titulo ilegivel]` passou a ser gravado no MESMO campo que
// `contarTentativas` interpreta. É inofensivo HOJE — o contador exige o
// prefixo `^[arte N/` e a marca de legibilidade nunca abre a linha — mas o
// campo já acumulou significados sem ninguém declarar quais são, e "inofensivo
// hoje" é exatamente o estado em que o terceiro escritor entra sem saber que
// existe um leitor.
//
// Então fica dito, aqui, ao lado de quem lê:
//
//   ESCREVEM em `lastError`
//     1. o laço de arte, com o contador de tentativas no INÍCIO da linha:
//        `[arte N/MAX] <motivo>` — ver `marcarErro`;
//     2. `comporComMolde`, com notas de degradação da peça, entre elas
//        `MARCA_DE_TITULO_ILEGIVEL` e `[molde] …` — NUNCA no início da linha
//        quando há contador, e nunca com o formato `[arte …`.
//
//   LEEM `lastError`
//     a. `contarTentativas` (aqui) — só o PREFIXO `^[arte N/`. Qualquer outra
//        coisa no campo vale zero, de propósito;
//     b. `tituloSaiuIlegivel` — procura a marca em QUALQUER posição;
//     c. `pecaSaiuSemTitulo` — as notas `[molde] …` da degradação;
//     d. o time, com os olhos.
//
// A REGRA QUE MANTÉM ISSO DE PÉ: **o contador é um PREFIXO exclusivo.** Quem
// acrescentar um significado novo a este campo escreve DEPOIS do início da
// linha e com marcador próprio — nunca com o formato `[arte …`. A régua que
// prende esta regra é `__tests__/execution/o-campo-de-um-significado-so.test.ts`.

/** Quantas vezes esta peça já falhou. O contador mora no próprio `lastError`
 *  para não inventar mais uma coluna que um dia diverge do que aconteceu —
 *  ver a declaração do campo compartilhado logo acima. */
export function contarTentativas(lastError: string | null): number {
  const m = lastError?.match(/^\[arte (\d+)\//);
  return m ? Number(m[1]) : 0;
}

interface MarcaDaPeca {
  nome: string;
  segmento: string;
  cores: string[];
  tom: string;
  /** O molde DESTE cliente — a mesma cara em toda peça, de todo formato.
   *  Sem marca definida, vem o molde NEUTRO, declarado como tal. */
  molde: Molde;
  /** O CÉREBRO CRIATIVO desta marca: repertório (peça + razão), amplitude
   *  declarada e formatos com régua própria. Marca sem cérebro registrado
   *  recebe o cérebro VAZIO com as lacunas ditas — nunca o de outra marca. */
  cerebro: CerebroCriativo;
  /** AS FOTOS REAIS que o cliente deu, já autorizadas pela trava do Drive.
   *  Vazio = ele não deu nenhuma, e vazio NUNCA vira "invente". */
  fotosReais: FotoCandidata[];
  /**
   * OS RÓTULOS DE BENEFÍCIO que esta marca declarou para a ARTE — os chips.
   *
   * Lidos de `BrandBrain.artLabelsJson`, que o dono da marca preenche uma vez.
   * Vazio é o estado normal e honesto: a peça sai como saía antes de 15/08.
   * Nenhum chip é inventado pela agência — e cada um ainda passa por
   * `travaDeRotuloDeBeneficio` antes de virar pixel.
   */
  rotulos: string[];
  /**
   * A FICHA DE MARCA em texto, montada NO SERVIDOR — o lastro dos chips.
   *
   * É a metade que faltava para o chip existir sem mentir: `travaDeTextoNaArte`
   * exige trecho literal da LEGENDA, e chip não é trecho de legenda. Ele afirma
   * o que a marca É, e quem declarou isso foi o cliente, na ficha (promessa,
   * tagline, posicionamento, valores e léxico).
   *
   * ⚠️ Montada aqui, a partir do banco. Nunca recebida de quem chama — é a
   * mesma regra da verdade do cliente: leitura de servidor, não parâmetro.
   */
  ficha: string;
}

/**
 * O MATERIAL REAL DO CLIENTE, pronto para a produção da peça.
 *
 * Existe porque, até 07/08/2026, `fotosReaisDoCliente` e `logoDoCliente` não
 * tinham UM chamador no app: o cliente conectava o Drive, o material entrava na
 * casa e a peça saía idêntica. A ponte existia dos dois lados e faltava o meio.
 *
 * Nunca lança e nunca derruba a peça: material do cliente é o que MELHORA a
 * arte, e o Drive fora do ar não pode virar peça não produzida. Falha aqui cai
 * no comportamento de sempre (imagem gerada, monograma), que é exatamente o que
 * a casa fazia antes.
 */
async function lerMaterialReal(clientId: string | null): Promise<{
  logo: { dataUrl: string; nome: string; mimeType: string } | null;
  fotos: FotoCandidata[];
}> {
  if (!clientId) return { logo: null, fotos: [] };

  const [logoAsset, fotos] = await Promise.all([
    logoDoCliente(clientId).catch(() => null),
    fotosReaisDoCliente(clientId).catch(() => []),
  ]);

  let logo: { dataUrl: string; nome: string; mimeType: string } | null = null;
  if (logoAsset && MIMES_DE_LOGO.has(logoAsset.mimeType)) {
    // Os bytes viajam DENTRO do documento (data URL). Um `src` de rede num
    // render offline falha em silêncio e a peça sai sem o logo — a mesma
    // armadilha da webfont que o cabeçalho de `molde.ts` proíbe.
    const bytes = await lerArquivo(
      // `materiaisDeMarca` devolve a URL interna; o caminho no disco sai do
      // próprio MediaAsset, que é quem sabe onde o arquivo mora.
      (await prisma.mediaAsset.findUnique({
        where: { id: logoAsset.mediaAssetId }, select: { storagePath: true },
      }).catch(() => null))?.storagePath ?? "",
    ).catch(() => null);
    if (bytes && bytes.length > 0) {
      logo = {
        dataUrl: `data:${logoAsset.mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
        nome: logoAsset.nome,
        mimeType: logoAsset.mimeType,
      };
    }
  }

  return {
    logo,
    fotos: fotos.map((f) => ({
      mediaAssetId: f.mediaAssetId,
      // O papel foi declarado PELO CLIENTE no portal; `fotosReaisDoCliente` já
      // filtrou para as quatro classes fotográficas.
      papel: f.papel as MaterialReal,
      nome: f.nome,
      mimeType: f.mimeType,
    })),
  };
}

export async function lerMarca(clientId: string | null): Promise<MarcaDaPeca> {
  const vazio: MarcaDaPeca = {
    nome: "", segmento: "", cores: [], tom: "", rotulos: [], ficha: "",
    // Sem cliente não há logo e não há foto — e o molde declara a falta do logo
    // do mesmo jeito, porque a peça REALMENTE sai sem ele.
    molde: moldeComLogo(moldeDoCliente(null), null),
    cerebro: cerebroDaMarca(null),
    fotosReais: [],
  };
  if (!clientId) return vazio;
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, industry: true, brandBrain: true },
  }).catch(() => null);
  if (!c) return vazio;
  const b = c.brandBrain;
  const material = await lerMaterialReal(clientId);
  const base = moldeDoCliente(b ?? null);

  // ── A ORDEM DAS DUAS FONTES DE LOGO IMPORTA (08/08/2026) ──────────────────
  //
  //   1º  o arquivo que o CLIENTE mandou pelo Drive — sempre vence;
  //   2º  o logo da CASA, e só quando o cliente É a casa (`logoDaCasa` devolve
  //       `null` para todos os outros, e é isso que a mantém uma exceção de um
  //       nome só, não uma porta aberta).
  //
  // Para todo o resto continua valendo o de sempre: sem arquivo, monograma das
  // iniciais e a falta DECLARADA em `Molde.lacunas`. Ausência de logo nunca
  // virou licença para desenhar um.
  const logo = material.logo ?? logoDaCasa(c.name, base.primaria);

  return {
    nome: c.name ?? "",
    segmento: c.industry ?? "",
    cores: [b?.primaryColor, b?.secondaryColor].filter((v): v is string => !!v),
    tom: b?.tone ?? "",
    fotosReais: material.fotos,
    // O molde nasce do BrandBrain e SÓ dele (cor, tipografia). O LOGO não vem
    // do BrandBrain: vem de um ARQUIVO — o do cliente, ou o da casa.
    molde: moldeComLogo(base, logo),
    // O cérebro é achado pelo NOME da marca. Marca desconhecida recebe o vazio
    // declarado; emprestar o repertório de um cliente a outro seria dar a
    // identidade de um a outro.
    cerebro: cerebroDaMarca(c.name),
    rotulos: rotulosDeclarados(b?.artLabelsJson),
    ficha: fichaParaRotulo(b ?? null),
  };
}

/** Os rótulos que a marca autorizou na arte. JSON quebrado devolve lista vazia:
 *  campo ilegível é campo ausente, e ausente NUNCA vira "pinte o que achar". */
function rotulosDeclarados(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4) : [];
  } catch {
    return [];
  }
}

/**
 * A FICHA DE MARCA em texto — o lastro do chip de benefício.
 *
 * Junta o que o cliente DECLAROU sobre a própria marca. Não é resumo nem
 * interpretação: é concatenação, porque `temLastroLiteral` compara substring da
 * forma normalizada, e qualquer reescrita quebraria o lastro que ela procura.
 *
 * Os `artLabelsJson` entram na ficha de propósito — declarar o rótulo É
 * declará-lo. O que a declaração NÃO faz é liberar as classes proibidas: a
 * trava as confere ANTES do lastro, então "100% gratuito" continua fora do
 * pixel mesmo escrito aqui pelo dono da marca.
 */
function fichaParaRotulo(b: {
  purposeAndPromise?: string | null; tagline?: string | null;
  positioning?: string | null; values?: string | null;
  lexiconJson?: string | null; artLabelsJson?: string | null;
} | null): string {
  if (!b) return "";
  const legivel = (s: string | null | undefined): string => {
    const t = (s ?? "").trim();
    if (!t) return "";
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : "")).join(" · ");
      if (v && typeof v === "object") return Object.values(v).map((x) => (typeof x === "string" ? x : "")).join(" · ");
    } catch { /* não era JSON: é texto puro */ }
    return t;
  };
  return [
    b.purposeAndPromise ?? "", b.tagline ?? "", b.positioning ?? "",
    legivel(b.values), legivel(b.lexiconJson), legivel(b.artLabelsJson),
  ].filter((s) => s.trim()).join(" · ");
}

/** O nome do arquivo da FOTO de uma peça. Fixo por post (e por tela, no
 *  carrossel) porque é a chave do re-render barato.
 *
 *  Continua PNG, e de propósito: este arquivo NUNCA é publicado — ele é o fundo
 *  intermediário que a peça final recompõe. Recomprimir em JPEG uma foto que
 *  ainda vai ser recomposta seria perder qualidade duas vezes de graça. */
export function nomeDoFundo(postId: string, tela?: number): string {
  return tela ? `fundo-${postId}-${tela}.png` : `fundo-${postId}.png`;
}

// ── O NOME DO ARQUIVO SEGUE O MIME, SEMPRE ──────────────────────────────────
//
// `guardarArquivo` já deriva a extensão do arquivo em disco do MIME
// (`MIMES_ACEITOS`, em `media/armazenamento.ts`). O `fileName` é a outra
// metade — é o que o operador lê na lista de Arquivos e no relatório. Um
// `arte-sp1.png` gravado sobre bytes de JPEG manda quem investiga procurar o
// defeito no lugar errado, que é exatamente como se perdeu o dia 08/08.
const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensaoDe(mime: string): string {
  // Sem palpite: MIME que a casa não conhece vira `bin`, e o nome fica
  // estranho o bastante para alguém perguntar — melhor que uma extensão
  // bonita e errada.
  return EXTENSAO_POR_MIME[mime] ?? "bin";
}

/** O nome da PEÇA FINAL de um post. A extensão é a do MIME REAL dos bytes. */
export function nomeDaArte(postId: string, mime: string): string {
  return `arte-${postId}.${extensaoDe(mime)}`;
}

/** O nome de UMA TELA da peça final de um carrossel. */
export function nomeDaTelaDoCarrossel(postId: string, tela: number, mime: string): string {
  return `carrossel-${postId}-${tela}.${extensaoDe(mime)}`;
}

interface PedidoDeComposicao {
  formato: ReturnType<typeof formatoDoPost>;
  molde: Molde;
  fotoBytes: Buffer;
  /** O MIME real da foto. Declarar errado faz o navegador desenhar nada — e a
   *  peça sairia com o fundo chapado sem ninguém entender por quê. */
  fotoMime?: string;
  /** O conteúdo já auditado de onde o texto tem de ser trecho literal. */
  fonteAuditada: string;
  selo: string | null;
  assinatura: string;
  indice: { atual: number; total: number } | null;
  /** A composição escolhida pelo cérebro criativo a partir do papel da tela.
   *  Ausente = `foto-cheia`, o layout histórico. */
  composicao?: Composicao | null;
  /** Os CHIPS de benefício que a marca declarou (`BrandBrain.artLabelsJson`).
   *  Vazio = peça sem chip, que é a peça de antes de 15/08/2026. */
  chips?: string[] | null;
  /** A FICHA DE MARCA em texto — o lastro dos chips, montada no servidor.
   *  Vazia = nenhum chip é pintado. */
  fichaDaMarca?: string | null;
  /** A FAIXA DE CHAMADA do pé. Montada (`chamadaDaMarca`), nunca escrita. */
  chamada?: string | null;
  /**
   * O QUE ACONTECEU COM O MATERIAL DO CLIENTE nesta peça.
   *
   * Ou a foto real que entrou e a razão dela, ou o que havia na pasta e por que
   * nada entrou. Sobe junto com a peça porque, até 07/08/2026, o cliente
   * conectava o Drive e a peça saía idêntica **sem que nada dissesse isso** —
   * e uma promessa quebrada em silêncio é pior que uma recusa.
   */
  notaDoMaterial?: string | null;
}

/** Falha de INFRAESTRUTURA do rasterizador: não há navegador, ou ele quebrou.
 *  Não é característica do conteúdo — é a casa sem a ferramenta montada. */
const MOTIVOS_DE_INFRA: ReadonlySet<MotivoDeFalhaDeRender> = new Set([
  "sem_navegador",
  "erro_do_navegador",
  "timeout",
]);

/**
 * Põe a camada de texto sobre a foto.
 *
 * ── POR QUE ISTO NÃO DEGRADA MAIS QUANDO FALTA NAVEGADOR ────────────────────
 *
 * Esta função devolvia SEMPRE bytes publicáveis: sem Chromium, saía a foto pura
 * com uma `nota`. Parecia degradação declarada e era FAIL-OPEN — porque a nota
 * ia para `lastError`, que ninguém lê antes de publicar, enquanto a peça seguia
 * para o portal e para o perfil do cliente sem o molde da marca.
 *
 * E a falta de navegador não é um caso raro: até 07/08/2026 o `playwright`
 * morava em `devDependencies`, então em produção ele NUNCA existiu. O resultado
 * é que TODA peça de TODO cliente saiu como foto crua de IA, e o sistema
 * relatou isso como sucesso, peça por peça.
 *
 * Por isso a separação abaixo, que é a regra da casa "configuração faltando =
 * porta FECHADA":
 *
 *   • INFRA (sem navegador, navegador quebrado, timeout) → `ok: false`. A peça
 *     NÃO é gravada e NÃO é publicada. A causa sobe nomeada, e quem chamou
 *     trata como falha de verdade — do mesmo jeito que já trata "não consegui
 *     gerar a foto". Ferramenta faltando é problema da agência, não um
 *     entregável de qualidade menor para o cliente pagante.
 *
 *   • CONTEÚDO (não há frase utilizável, o texto não cabe, a trava reprovou a
 *     letra) → segue a degradação declarada: foto + `nota`. Aqui o molde falhou
 *     por causa do MATERIAL, o texto errado nunca chega à arte, e a peça sem
 *     chamada continua sendo uma peça. Mudar isto é decisão de produto, com
 *     alcance maior — está anotado em `docs/pendencias.md` para o CEO decidir.
 */
/**
 * ── POR QUE O RESULTADO CARREGA O `mime` (08/08/2026) ───────────────────────
 *
 * Esta função tem DOIS tipos de saída, e eles não têm o mesmo formato:
 *
 *   • a PEÇA COMPOSTA, que sai do rasterizador → sempre `image/jpeg`;
 *   • a FOTO CRUA, quando o molde degrada por conteúdo (não há frase
 *     utilizável, ou o texto não coube) → o formato é o da foto que ENTROU:
 *     PNG quando veio do gerador de imagem, e o que o cliente mandou quando é
 *     material dele.
 *
 * Antes, quem gravava escrevia `"image/png"` fixo nos dois casos. Isso era
 * mentira nos dois sentidos ao mesmo tempo: a peça composta era JPEG rotulada
 * de PNG (e a trava da publicação recusava, corretamente, 100% das peças), e a
 * foto JPEG do cliente era rotulada de PNG (e ninguém percebia porque o
 * navegador farejava o conteúdo).
 *
 * Trocar aquele literal por `"image/jpeg"` fixo teria criado o defeito PIOR:
 * a foto crua PNG sairia rotulada como JPEG, passaria pela trava da casa e
 * morreria na Meta — a rajada de tentativas recusadas que a trava veio impedir.
 * Por isso o resultado DIZ o que ele é, e quem grava obedece.
 */
type ResultadoDaComposicao =
  | { ok: true; bytes: Buffer; mime: string; nota: string | null;
      /** A legibilidade do título medida NO ARQUIVO (`legibilidade-do-titulo.ts`).
       *  Ausente na peça sem camada de texto — que é ausência de título, não
       *  título ilegível, e as duas não podem virar a mesma coisa. */
      legibilidadeDoTitulo?: MedidaDaLegibilidade | null }
  | { ok: false; motivo: MotivoDeFalhaDeRender; erro: string };

export async function comporComMolde(p: PedidoDeComposicao): Promise<ResultadoDaComposicao> {
  // ── O MOLDE NEUTRO PRECISA SER DECLARADO PARA FORA ────────────────────────
  // Até a 7ª auditoria, `origem: "neutro"` e `lacunas` não tinham um único
  // consumidor fora de teste: o cliente sem marca recebia a peça cinza e nada —
  // nem `lastError`, nem portal, nem log — dizia que aquele cinza era AUSÊNCIA
  // de marca. Vazio declarado só é declarado se alguém lê a declaração.
  const avisoDeNeutro =
    p.molde.origem === "neutro"
      ? `[molde neutro] esta peça saiu SEM a identidade do cliente (cinza padrão, não a marca dele). Falta no cadastro: ${p.molde.lacunas.join(", ") || "cor primária da marca"}.`
      : null;
  // ── O LOGO QUE NÃO ASSINOU A PEÇA ─────────────────────────────────────────
  // Mesma doença do molde neutro, achada em 07/08/2026: a peça saía assinada
  // com o monograma das iniciais — um símbolo que a AGÊNCIA derivou — e nada
  // dizia ao cliente que o logo dele não estava ali. Declarar é o que separa
  // "degradação declarada" de "entrega silenciosamente pior".
  const avisoDeLogo = !p.molde.logo
    ? "[sem logo] assinada com o monograma das iniciais, não com o logo real — o cliente não mandou o arquivo do logo. Nenhum logo foi desenhado."
    : null;

  // ── A ORDEM DAS NOTAS É CONCLUSÃO PRIMEIRO, E ISSO É MECANISMO ────────────
  //
  // `lastError` é cortado em 480 caracteres. Com as declarações permanentes na
  // frente (molde neutro, logo ausente), a NOTÍCIA daquela peça — o motivo real
  // pelo qual ela degradou — era empurrada para fora do corte e sumia. Foi o
  // que aconteceu na primeira versão desta mudança, e um teste pegou: o campo
  // dizia "falta a cor da marca" onde devia dizer "o texto não coube".
  //
  // Então: o que é NOVO nesta peça vem primeiro (a falha, depois o que
  // aconteceu com o material do cliente); o que vale para todas as peças deste
  // cliente vem por último, e é ele que o corte come. É a mesma regra do relato
  // ao CEO — conclusão primeiro — aplicada a um campo de 480 caracteres.
  const comAviso = (nota: string | null): string | null =>
    [nota, p.notaDoMaterial ?? null, avisoDeNeutro, avisoDeLogo].filter(Boolean).join(" ").slice(0, 480) || null;

  /** O formato da FOTO que entrou. É o que a peça tem quando o molde degrada e
   *  ela sai como foto crua — e é o que precisa ser dito a quem grava. */
  const mimeDaFotoCrua = p.fotoMime ?? "image/png";

  const titulo = tituloDaFonte(p.fonteAuditada);
  if (!titulo) {
    return {
      ok: true,
      bytes: p.fotoBytes,
      mime: mimeDaFotoCrua,
      nota: comAviso("[molde] peça entregue só com a foto: o conteúdo não tem uma frase utilizável como chamada."),
    };
  }

  const r = await montarPeca({
    formato: p.formato,
    molde: p.molde,
    fundoBytes: p.fotoBytes,
    fundoMime: p.fotoMime ?? "image/png",
    titulo,
    selo: p.selo,
    assinatura: p.assinatura,
    indice: p.indice,
    fonteAuditada: p.fonteAuditada,
    composicao: p.composicao ?? null,
    // A outra metade do slot. `montarPeca` passa cada chip por
    // `travaDeRotuloDeBeneficio` (lastro na FICHA, não na legenda) e a faixa por
    // `travaDeChamadaNaArte` (verbo da casa + nome da marca). Chip reprovado não
    // derruba a peça: ela sai sem aquele chip, com o motivo em `textoRecusado`.
    chips: p.chips ?? null,
    fichaDaMarca: p.fichaDaMarca ?? null,
    chamada: p.chamada ?? null,
  }).catch((e) => ({ ok: false as const, motivo: "erro_do_navegador" as const, erro: e instanceof Error ? e.message : "erro" }));

  if (!r.ok) {
    // PORTA FECHADA. Sem a ferramenta, não sai peça — nem "peça pior".
    if (MOTIVOS_DE_INFRA.has(r.motivo)) {
      return {
        ok: false,
        motivo: r.motivo,
        erro:
          r.motivo === "sem_navegador"
            ? "não há Chromium para rasterizar o molde neste ambiente — a peça NÃO foi gravada. " +
              "Confira `playwright` em `dependencies` e o pacote `chromium` em `railpack.json → deploy.aptPackages`."
            : `o rasterizador do molde falhou (${r.motivo}) — a peça NÃO foi gravada: ${r.erro}`,
      };
    }
    // Falha de CONTEÚDO: o molde não coube nesta letra. A peça sai como foto,
    // declarando o motivo — o texto reprovado nunca chega à arte.
    return {
      ok: true,
      bytes: p.fotoBytes,
      mime: mimeDaFotoCrua,
      // `comAviso` e não string crua: a declaração do molde neutro, a do logo
      // ausente e a do material do cliente não podem sumir só porque o texto
      // não coube. Nota que some é declaração que nunca existiu.
      nota: comAviso(`[molde] peça entregue só com a foto (sem camada de texto): ${r.motivo} — ${r.erro}`),
    };
  }
  if (r.textoRecusado.length > 0) {
    // Aconteceu o caminho bom: a peça SAIU, e o que a trava barrou está dito.
    const barrado = r.textoRecusado.map((t) => `${t.papel}: ${t.detalhe}`).join(" · ");
    return {
      ok: true,
      bytes: r.bytes,
      mime: MIME_DA_PECA_RENDERIZADA,
      nota: comAviso(`[molde] texto barrado pela trava — ${barrado}`),
      legibilidadeDoTitulo: r.legibilidadeDoTitulo,
    };
  }
  // ── O TÍTULO ILEGÍVEL É DECLARADO, NÃO SUPOSTO ──────────────────────────
  //
  // Fecha a dívida nº 3 do `O_QUE_NAO_FOI_MEDIDO` do lado da PRODUÇÃO: o
  // degradê do molde agora protege a faixa do título (`molde.ts`), e aqui se
  // confere o RESULTADO no arquivo. Escolher sem conferir é o padrão que esta
  // operação já pagou três vezes — foi a lição de `contraste.ts`, e ela vale
  // igual para o par que ele não mede.
  //
  // Declara e NÃO derruba a peça, de propósito. A medida erra para o lado
  // seguro (a média da faixa inclui os pixels da própria letra, o que BAIXA a
  // razão), então uma peça no limite pode ser marcada sem estar perdida —
  // e jogar fora uma peça paga por uma medida conservadora seria trocar um
  // prejuízo por outro. O que não pode é sair calada: com a marca no
  // `lastError`, o time vê, a régua do e2e reprova a regressão, e a peça não
  // atravessa a casa fingindo que ninguém olhou.
  const ilegivel = r.legibilidadeDoTitulo && !r.legibilidadeDoTitulo.suficiente
    ? `${MARCA_DE_TITULO_ILEGIVEL} ${motivoDaLegibilidade(r.legibilidadeDoTitulo)}`
    : null;

  return {
    ok: true, bytes: r.bytes, mime: MIME_DA_PECA_RENDERIZADA, nota: comAviso(ilegivel),
    legibilidadeDoTitulo: r.legibilidadeDoTitulo,
  };
}

/**
 * A ASSINATURA, no `lastError`, de uma peça cujo TÍTULO não alcançou o piso de
 * legibilidade sobre a foto.
 *
 * Constante exportada e não literal solta: quem escreve a marca e quem a
 * procura têm de ser a MESMA palavra. Duas grafias parecidas em dois arquivos é
 * como uma régua fica verde para sempre.
 */
export const MARCA_DE_TITULO_ILEGIVEL = "[titulo ilegivel]";

/** A peça saiu com o título abaixo do piso de legibilidade sobre a foto? */
export function tituloSaiuIlegivel(lastError: string | null | undefined): boolean {
  return (lastError ?? "").includes(MARCA_DE_TITULO_ILEGIVEL);
}

/**
 * A PEÇA FICOU SEM TÍTULO?
 *
 * Lê a nota que `comporComMolde` acabou de escrever em `SocialPost.lastError`.
 * Mora AQUI, coladinha em quem escreve a nota, porque conhecimento de marcador
 * separado de quem o emite envelhece calado: a frase muda de um lado e o leitor
 * do outro passa a responder "não" para sempre, sem ninguém ficar vermelho.
 *
 * ── POR QUE ALGUÉM PRECISA PERGUNTAR ISSO (25/08/2026) ─────────────────────
 *
 * `comporComMolde` DEGRADA de propósito em três casos: o conteúdo não tem uma
 * frase utilizável como chamada, o rasterizador reprovou a letra por conteúdo,
 * ou a trava de texto barrou o título. Nos três a peça SAI — só com a foto e a
 * assinatura — e a degradação fica declarada na nota.
 *
 * Degradar é certo para o CALENDÁRIO: uma peça a menos no mês é pior que uma
 * peça sem headline. Não é certo para um produto que o cliente PEDIU e PAGOU:
 * ali, "peça sem título" não é peça, é arquivo — e ele aprova sem ver o buraco,
 * porque o cartão mostra uma imagem bonita e o banco diz que está tudo pronto.
 *
 * Decisão do CEO: **o produto canônico PARA.** Falha visível, com motivo e
 * próxima ação, nunca peça capenga no portal. Quem age sobre esta resposta é
 * `produtos/story-instagram-v1.ts`; nada muda para o calendário, que continua
 * degradando e declarando como sempre fez.
 */
export function pecaSaiuSemTitulo(lastError: string | null | undefined): boolean {
  const nota = lastError ?? "";
  // Saiu SÓ com a foto: não houve camada de texto nenhuma.
  if (nota.includes("[molde] peça entregue só com a foto")) return true;
  // A trava barrou especificamente o TÍTULO. Chip ou faixa barrados não
  // derrubam a peça — ela continua tendo headline, que é a pergunta daqui.
  if (/\[molde\] texto barrado pela trava[^]*?\btitulo:/.test(nota)) return true;
  return false;
}

// ─── AS PEÇAS QUE FICARAM SEM A CAMADA DE TEXTO ──────────────────────────────

/** A assinatura, no `lastError`, de uma peça que saiu como foto crua porque não
 *  havia navegador. Casa com a nota que `comporComMolde` escreveu ANTES do
 *  fail-closed de 07/08/2026 — e SÓ com ela: peça que degradou por texto que não
 *  coube, ou por trava de letra, não é caso desta função. */
const MARCA_DE_PECA_SEM_MOLDE = "sem camada de texto): sem_navegador";

export interface Recomposicao {
  /** Peças que ganharam a camada de marca nesta passada. */
  recompostas: string[];
  /** Peças cuja foto original não está mais guardada — recompor exigiria GERAR
   *  de novo, e essa decisão custa e não é desta função. */
  semFundo: string[];
  /** Peças de pilar bloqueado. Não se recompõe o que não pode sair. */
  bloqueadas: string[];
  falhas: Array<{ postId: string; erro: string }>;
  /** A passada nem começou: sem navegador, recompor é impossível. */
  semRenderizador?: string;
}

/**
 * DÁ A CAMADA DE MARCA ÀS PEÇAS QUE NASCERAM SEM ELA — E NÃO PAGA DUAS VEZES.
 *
 * ── Por que esta função existe (08/08/2026) ─────────────────────────────────
 *
 * Enquanto o `playwright` chegava quebrado ao contêiner, as peças saíram como a
 * FOTO CRUA da IA: sem título, sem a cor da marca, sem selo e sem assinatura.
 * Elas ficaram gravadas com `mediaUrl` preenchido — e é isso que as torna
 * invisíveis para o conserto: `produzirArtesPendentes` só olha
 * `mediaUrl: null`, então essas peças NUNCA voltariam à fila. Ficariam para
 * sempre no banco, com aparência de entregue e conteúdo de rascunho, e a única
 * testemunha seria o `lastError` de cada uma.
 *
 * ── O que ela NÃO faz, e é o ponto ──────────────────────────────────────────
 *
 * **Não gera imagem nenhuma.** A foto paga está no armazenamento como
 * `fundo-<postId>.png` desde o dia em que foi comprada — exatamente para isto.
 * Recompor é rasterização local (≈1s) e custa zero. Regerar custaria a fatura
 * inteira de novo E mudaria a foto que o calendário já tinha, o que não é
 * conserto: é outra peça.
 *
 * **Não afrouxa uma trava.** Pilar bloqueado continua bloqueado; a trava de
 * letra continua valendo (o título tem de ser trecho LITERAL da legenda já
 * auditada); e sem navegador a passada para antes de tocar em qualquer peça.
 *
 * **Não inventa conteúdo.** A legenda é a que já estava lá.
 *
 * Nunca lança.
 */
/** Quais peças a passada procura.
 *
 *  `sem-molde` — o estrago datado de 08/08: a peça foi gravada como foto crua
 *  porque não havia Chromium. Marcada em `lastError`.
 *
 *  `marca-nova` — 09/08: a peça foi composta CERTA, mas antes de o material de
 *  marca do cliente existir. Ela não tem defeito registrado em lugar nenhum —
 *  simplesmente nasceu antes do logo. Nasceu de o upload de SVG estar fechado:
 *  os logos do CityJobs chegaram só depois que a porta abriu, e tudo o que
 *  saiu antes está sem marca. Nenhuma marca em `lastError` alcança essas.
 *
 *  `formato-recusado` — 14/08: a peça foi composta pelo rasterizador ANTIGO,
 *  que gravava PNG. O rasterizador de hoje já sai JPEG
 *  (`MIME_DA_PECA_RENDERIZADA`), então o defeito não está no código: está no
 *  ARQUIVO que continua pendurado no post agendado. Ela não tem marca em
 *  `lastError`, o logo do cliente já existia quando ela nasceu, e por isso
 *  nenhum dos dois modos acima a encontra. O que a denuncia é o `mimeType` do
 *  `MediaAsset` que o `mediaUrl` aponta, medido pela régua da publicação. */
export type SelecaoDeRecomposicao = "sem-molde" | "marca-nova" | "formato-recusado";

/** Compatibilidade: o nome antigo continua valendo e continua fazendo o que
 *  fazia. A rota e os testes que já existiam não precisam saber do modo novo. */
export async function recomporPecasSemMolde(limite = 20): Promise<Recomposicao> {
  return recomporPecas(limite, "sem-molde");
}

/**
 * As peças cujo material de marca chegou DEPOIS da arte.
 *
 * Compara duas datas: quando o material daquele cliente foi confirmado, e
 * quando a arte daquela peça foi gravada. Arte mais velha que o material =
 * peça que nunca viu o logo.
 *
 * **Peça sem arte gravada é PULADA, não recomposta.** Sem o arquivo não há como
 * saber se ela é velha, e recompor no escuro reescreveria peça boa. Ausência de
 * informação não é informação — guardrail 1.
 */
async function pecasComMarcaMaisNovaQueAArte(limite: number): Promise<SocialPostDaBase[]> {
  const materiais = await prisma.driveMaterial.findMany({
    where: { papelConfirmadoEm: { not: null }, mediaAssetId: { not: null } },
    select: { clientId: true, papelConfirmadoEm: true },
    orderBy: { papelConfirmadoEm: "desc" },
  }).catch(() => []);

  // O material mais RECENTE de cada cliente. Vem ordenado por data desc, então
  // o primeiro de cada cliente já é o mais novo.
  const marcaChegouEm = new Map<string, Date>();
  for (const m of materiais) {
    if (!m.clientId || !m.papelConfirmadoEm) continue;
    if (!marcaChegouEm.has(m.clientId)) marcaChegouEm.set(m.clientId, m.papelConfirmadoEm);
  }
  if (marcaChegouEm.size === 0) return [];

  const candidatas = await prisma.socialPost.findMany({
    where: {
      mediaUrl: { not: null },
      clientId: { in: [...marcaChegouEm.keys()] },
      status: { in: ["draft", "scheduled", "approved"] },
    },
    orderBy: { scheduledFor: "asc" },
    // Folga sobre o teto: a data da arte só dá para conferir peça a peça, e
    // sem folga uma leva de peças já novas consumiria a passada inteira.
    take: Math.min(limite * 10, 200),
  }).catch(() => []);

  const velhas: SocialPostDaBase[] = [];
  for (const post of candidatas) {
    if (velhas.length >= limite) break;
    const marca = post.clientId ? marcaChegouEm.get(post.clientId) : null;
    if (!marca) continue;

    const arte = await prisma.mediaAsset.findFirst({
      where: { workspaceId: post.workspaceId, fileName: { startsWith: `arte-${post.id}.` } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch(() => null);
    if (!arte) continue;
    if (arte.createdAt >= marca) continue;

    velhas.push(post);
  }
  return velhas;
}

type SocialPostDaBase = NonNullable<Awaited<ReturnType<typeof prisma.socialPost.findFirst>>>;

/**
 * AS PEÇAS CUJO ARQUIVO A PLATAFORMA RECUSA — medidas, não deduzidas.
 *
 * A medição inteira mora em `reconversao-de-formato.ts`, que é somente leitura,
 * e é a MESMA que o script de operação usa para relatar antes de mexer. Uma
 * cópia da seleção aqui começaria idêntica e divergiria no primeiro ajuste — e
 * aí o relatório e o conserto passariam a discordar em silêncio.
 */
async function pecasEmFormatoQueAPlataformaRecusa(limite: number): Promise<SocialPostDaBase[]> {
  const achadas = await postsComFormatoRecusado(limite);
  return achadas.map((a) => a.post);
}

export async function recomporPecas(
  limite = 20,
  selecao: SelecaoDeRecomposicao = "sem-molde",
): Promise<Recomposicao> {
  const saida: Recomposicao = { recompostas: [], semFundo: [], bloqueadas: [], falhas: [] };

  // Mesma guarda de `produzirArtesPendentes`, e pelo mesmo motivo: sem
  // ferramenta a passada não começa, para não escrever nada e não mentir sobre
  // o resultado.
  const renderizador = await renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null }));
  if (!renderizador.disponivel) {
    saida.semRenderizador =
      "não há Chromium para rasterizar o molde neste ambiente — NENHUMA peça foi recomposta. " +
      "Diagnóstico ao vivo em GET /api/capacidades → `montar-molde`.";
    return saida;
  }

  const orfas =
    selecao === "marca-nova"
      ? await pecasComMarcaMaisNovaQueAArte(limite)
      : selecao === "formato-recusado"
      ? await pecasEmFormatoQueAPlataformaRecusa(limite)
      : await prisma.socialPost.findMany({
          where: {
            mediaUrl: { not: null },
            lastError: { contains: MARCA_DE_PECA_SEM_MOLDE },
            status: { in: ["draft", "scheduled", "approved"] },
          },
          orderBy: { scheduledFor: "asc" },
          take: limite,
        }).catch(() => []);

  for (const post of orfas) {
    const veredito = conferirPilar(post.pillar);
    if (veredito.bloqueado) {
      saida.bloqueadas.push(post.id);
      continue;
    }

    const fundo = await prisma.mediaAsset.findFirst({
      where: { fileName: nomeDoFundo(post.id), workspaceId: post.workspaceId },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);
    if (!fundo) { saida.semFundo.push(post.id); continue; }

    const bytes = await lerArquivo(fundo.storagePath).catch(() => null);
    if (!bytes || bytes.length === 0) { saida.semFundo.push(post.id); continue; }

    const marca = await lerMarca(post.clientId);
    const composta = await comporComMolde({
      formato: formatoDoPost(post.format),
      molde: marca.molde,
      fotoBytes: Buffer.from(bytes),
      fotoMime: fundo.mimeType || "image/png",
      fonteAuditada: post.caption,
      selo: post.pillar,
      assinatura: marca.nome,
      indice: null,
      notaDoMaterial: null,
    });
    if (!composta.ok) {
      // Infra caiu no meio da passada. A peça fica exatamente como estava —
      // ruim e declarada ruim, que é melhor do que ruim e calada.
      saida.falhas.push({ postId: post.id, erro: composta.erro });
      continue;
    }

    // ── A METADE QUE FALTAVA: A PEÇA SÓ CONTA SE MUDOU ────────────────────
    // `comporComMolde` devolve `ok: true` com a FOTO CRUA quando o texto não
    // coube ou a trava reprovou a letra. Gravar isso como recomposição seria
    // trocar um arquivo idêntico por outro e declarar vitória — a peça
    // continuaria sem marca, agora sem nem o aviso de que continua.
    const mudou = composta.bytes.length !== bytes.length || !composta.bytes.equals(Buffer.from(bytes));
    if (!mudou) {
      saida.falhas.push({
        postId: post.id,
        erro: composta.nota ?? "a camada de texto não pôde ser aplicada e a peça continua sendo a foto crua",
      });
      // A nota nova é gravada mesmo assim: o motivo mudou de "sem navegador"
      // (que já não é verdade) para o motivo real, e um motivo desatualizado
      // manda a próxima passada procurar no lugar errado.
      await prisma.socialPost.update({
        where: { id: post.id }, data: { lastError: composta.nota },
      }).catch(() => null);
      continue;
    }

    // ── O CONSERTO PASSA NA MESMA RÉGUA QUE REPROVOU O DEFEITO ────────────
    // Hoje isto é impossível de falhar: bytes diferentes do fundo só saem do
    // rasterizador, e o rasterizador só produz JPEG. É por isso mesmo que o
    // portão fica aqui — ele custa nada e transforma "sai JPEG porque eu li o
    // código" em "sai JPEG porque a peça foi medida antes de ser gravada".
    // Sem ele, o dia em que o rasterizador mudar de formato repete 08/08, e o
    // primeiro a saber seria a Meta, contra a conta de um cliente.
    const formatoDaPecaNova = conferirFormatoDeMidia(
      [{ id: nomeDaArte(post.id, composta.mime), mime: composta.mime }],
      false,
    );
    if (!formatoDaPecaNova.aceita) {
      saida.falhas.push({
        postId: post.id,
        erro: `a peça recomposta continua em formato que a plataforma recusa — NADA foi gravado. ${formatoDaPecaNova.motivo}`,
      });
      continue;
    }

    const guardado = await guardarArquivo({
      bytes: composta.bytes,
      // PEÇA FINAL da recomposição — mesma regra: o nome e o MIME seguem os bytes.
      fileName: nomeDaArte(post.id, composta.mime),
      mimeType: composta.mime,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!guardado.ok) { saida.falhas.push({ postId: post.id, erro: guardado.motivo }); continue; }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: composta.nota },
    });
    saida.recompostas.push(post.id);
  }

  return saida;
}

/**
 * Re-render de TEXTO, sem tocar no gerador de imagem.
 *
 * A foto já está no armazenamento (`fundo-<postId>.png`), então trocar a
 * chamada da peça é rasterização local — a diferença entre corrigir uma arte e
 * comprar outra. É o caminho para o "muda essa frase" do cliente.
 *
 * Nunca lança. Só funciona se o fundo daquela peça existir: sem ele, a peça
 * teria de ser gerada de novo, e essa decisão (que custa) não é desta função.
 */
export async function reRenderizarTexto(
  postId: string,
  novoTitulo: string,
): Promise<{ ok: boolean; erro?: string; mediaUrl?: string }> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } }).catch(() => null);
  if (!post) return { ok: false, erro: "peça não encontrada" };

  const fundo = await prisma.mediaAsset.findFirst({
    where: { fileName: nomeDoFundo(postId), workspaceId: post.workspaceId },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!fundo) return { ok: false, erro: "a foto original desta peça não está guardada — o re-render exigiria gerar a imagem de novo" };

  const bytes = await lerArquivo(fundo.storagePath);
  if (!bytes) return { ok: false, erro: "a foto original não está mais no armazenamento" };

  const marca = await lerMarca(post.clientId);
  const r = await montarPeca({
    formato: formatoDoPost(post.format),
    molde: marca.molde,
    fundoBytes: Buffer.from(bytes),
    fundoMime: "image/png",
    titulo: novoTitulo,
    selo: post.pillar,
    assinatura: marca.nome,
    // O texto novo continua tendo de ser trecho literal da legenda auditada.
    // Sem isso, o re-render vira a porta dos fundos por onde qualquer frase
    // entraria na arte sem passar por auditoria nenhuma.
    fonteAuditada: post.caption,
  }).catch((e) => ({ ok: false as const, motivo: "erro_do_navegador" as const, erro: e instanceof Error ? e.message : "erro" }));
  if (!r.ok) return { ok: false, erro: `${r.motivo} — ${r.erro}` };
  if (r.textoRecusado.length > 0) {
    return { ok: false, erro: `texto recusado pela trava — ${r.textoRecusado.map((t) => t.detalhe).join(" · ")}` };
  }

  const guardado = await guardarArquivo({
    bytes: r.bytes,
    // PEÇA FINAL — estes bytes vieram do rasterizador (`montarPeca` devolveu
    // `ok`), então o formato é o da peça renderizada, não o do fundo.
    fileName: nomeDaArte(postId, MIME_DA_PECA_RENDERIZADA),
    mimeType: MIME_DA_PECA_RENDERIZADA,
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  const mediaUrl = `/api/media/${guardado.arquivo.id}`;
  // O re-render também declara o molde neutro: a peça saiu com o cinza padrão,
  // não com a marca do cliente, e limpar o `lastError` apagaria essa notícia.
  const nota =
    marca.molde.origem === "neutro"
      ? `[molde neutro] esta peça saiu SEM a identidade do cliente. Falta no cadastro: ${marca.molde.lacunas.join(", ") || "cor primária da marca"}.`.slice(0, 480)
      : null;
  await prisma.socialPost.update({ where: { id: postId }, data: { mediaUrl, lastError: nota } });
  return { ok: true, mediaUrl };
}

/**
 * A peça montada sobre a FOTO DO PRÓPRIO CLIENTE.
 *
 * A foto real dele ganha de qualquer imagem gerada — é a mesma regra que já
 * vale para vídeo em `montarReel`. O que esta função NÃO faz é adivinhar qual
 * foto vai em qual post: quem passa o `mediaAssetId` é quem decidiu.
 *
 * Isso é deliberado e vem de uma lição cara desta casa (auditoria de
 * 04/08/2026, `scripts/backfill-carrossel-foocci.mjs`): "sobra não é evidência
 * de correspondência". Casar arquivo com peça por ordem ou por sobra montou
 * carrossel com o logo e com material bruto dentro. Enquanto não existir um
 * vínculo explícito entre `SocialPost` e `MediaAsset` no banco, a escolha é de
 * gente — e o automático continua gerando a foto.
 */
export async function montarArteComFotoDoCliente(
  postId: string,
  mediaAssetId: string,
): Promise<{ ok: boolean; erro?: string; mediaUrl?: string }> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } }).catch(() => null);
  if (!post) return { ok: false, erro: "peça não encontrada" };

  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } }).catch(() => null);
  if (!asset) return { ok: false, erro: "arquivo não encontrado" };
  // Posse conferida no servidor: arquivo de outro workspace não vira peça deste.
  if (asset.workspaceId !== post.workspaceId) return { ok: false, erro: "esse arquivo não é deste workspace" };
  if (!asset.mimeType.startsWith("image/")) return { ok: false, erro: "esse arquivo não é uma imagem" };

  const bytes = await lerArquivo(asset.storagePath);
  if (!bytes) return { ok: false, erro: "o arquivo não está mais no armazenamento" };

  const marca = await lerMarca(post.clientId);
  const composta = await comporComMolde({
    formato: formatoDoPost(post.format),
    molde: marca.molde,
    fotoBytes: Buffer.from(bytes),
    fotoMime: asset.mimeType,
    fonteAuditada: post.caption,
    selo: post.pillar,
    assinatura: marca.nome,
    indice: null,
  });
  if (!composta.ok) return { ok: false, erro: composta.erro };

  const guardado = await guardarArquivo({
    bytes: composta.bytes,
    // PEÇA FINAL montada sobre a foto do cliente. O MIME é o da composição:
    // JPEG quando o molde entrou, e o da própria foto quando ela saiu crua.
    fileName: nomeDaArte(postId, composta.mime),
    mimeType: composta.mime,
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  const mediaUrl = `/api/media/${guardado.arquivo.id}`;
  await prisma.socialPost.update({ where: { id: postId }, data: { mediaUrl, lastError: composta.nota } });
  return { ok: true, mediaUrl };
}

/**
 * O prompt da arte.
 *
 * A legenda entra como ASSUNTO — o que a cena mostra — nunca como texto a ser
 * desenhado. E a proibição de tipografia é repetida de propósito: modelos de
 * imagem inserem letra por conta própria mesmo sem pedir.
 */
export function montarPrompt(input: {
  legenda: string;
  /**
   * A DIREÇÃO DE ARTE da peça — o que a IMAGEM tem de mostrar.
   *
   * ── POR QUE ESTE CAMPO NASCEU (15/08/2026) ────────────────────────────────
   *
   * Até aqui a "cena a retratar" era `post.caption`: a LEGENDA DO INSTAGRAM,
   * inteira, com CTA e hashtag. Junto iam quinze proibições e um "sem nenhum
   * texto, letra, número ou logotipo". O gerador recebia um texto escrito para
   * ser LIDO e a ordem de não desenhar nada do que ele diz — e devolvia desenho
   * vetorial genérico. **Não foi desobediência: foi a saída coerente com o
   * pedido.**
   *
   * A direção existia o tempo todo. O especialista de copy a escreve no campo
   * `visual` ("o que aparece na imagem", `especialistas.ts`), o motor a grava
   * no markdown ("- Visual: ...", `run-execution.ts`) — e ela morria ali,
   * porque `extrairPecas` não a lia e `SocialPost` não tinha coluna.
   *
   * Vazio cai na legenda, que é o comportamento de sempre. O fallback fica no
   * código de propósito: é ele que torna esta mudança reversível sem migration
   * de volta, e é ele que atende as peças anteriores a 15/08 (`artDirection`
   * nulo).
   */
  direcaoDeArte?: string | null;
  pilar: string | null;
  negocio: string;
  segmento: string;
  cores: string[];
  tom: string;
  formato?: string;
  /** O estilo visual OBSERVADO no feed real do cliente (síntese persistida de
   *  leitura-do-cliente.ts). Vazio quando o feed não foi lido — e aí o prompt
   *  simplesmente não menciona feed nenhum: estilo não se inventa. */
  estiloDoFeed?: string;
  /** O que a IA de VISÃO viu NAS IMAGENS do feed — vocabulário fechado
   *  (paleta, enquadramento, luz), nunca frase livre. Entra rotulado como
   *  "visto nas imagens" para não se confundir com o que foi lido em legenda:
   *  são duas evidências diferentes, e o gerador precisa saber qual é qual. */
  estiloVisto?: string;
  /**
   * O que a IMAGEM DESTA TELA precisa mostrar, derivado do PAPEL que ela cumpre
   * na história (`direcaoDaImagem`).
   *
   * É a virada de 07/08/2026: até aqui todas as telas de um carrossel recebiam
   * a mesma direção fotográfica e mudavam só o assunto — por isso a imagem era
   * fundo, e não argumento. Vazio quando o papel não é conhecido; vazio é
   * vazio, e o prompt não menciona papel nenhum.
   */
  papelDaTela?: string;
  /** Os extremos DECLARADOS da marca (`direcaoDeAmplitude`). Vazio quando a
   *  marca não tem amplitude registrada — a agência não inventa os extremos
   *  permitidos da marca de um cliente. */
  amplitude?: string;
}): string {
  const vertical = input.formato === "story";
  // A DIREÇÃO manda; a legenda é o FALLBACK. Nesta ordem, e a ordem é a
  // correção inteira: a legenda é texto para ser lido, a direção é descrição do
  // que a câmera vê. Direção vazia ou só espaço = não há direção, e aí a peça
  // sai como saía antes.
  const cena = (input.direcaoDeArte ?? "").trim() || input.legenda;
  const partes = [
    // ── 1. O QUE É A PEÇA ────────────────────────────────────────────────────
    // "publicitária" saiu: em 15/08 o portão do pixel reprovou 4 de 6 peças do
    // CityJobs por "paleta de ilustração, não fotografia" (101, 178, 244 e 432
    // cores distintas; piso 600). Publicidade é justamente o gênero em que
    // ilustração vetorial é resposta legítima. O que a casa quer é FOTOGRAFIA,
    // e isso se pede com as palavras da fotografia.
    `Fotografia real, feita com câmera, para redes sociais, formato ${vertical ? "vertical 9:16 (story de celular)" : "quadrado"}.`,

    // ── 2. A CENA, LOGO NA ABERTURA — a virada de posição ────────────────────
    // Antes, esta linha era a 4ª: a única instrução POSITIVA sobre o que
    // fotografar, na posição 188 de um pedido de 3.158 caracteres, seguida por
    // 2.295 de amplitude e 3 blocos "NUNCA:". Tudo depois dela era restrição, e
    // o gerador otimiza para a saída que viola menos regras — que é o desenho.
    // A direção de arte é o que a casa QUER; ela vem antes do que ela proíbe.
    `Cena a retratar: ${cena.slice(0, 500)}`,

    // ── 3. COMO SE FOTOGRAFA ISSO ────────────────────────────────────────────
    // Vem colada na cena de propósito: qualifica O QUE acabou de ser pedido, em
    // vez de abrir o prompt com um gênero ("publicitária") no qual ilustração
    // vetorial é resposta legítima.
    "Luz natural, profundidade de campo real, textura e imperfeição de fotografia — alta qualidade. NÃO é ilustração, NÃO é render 3D, NÃO é arte vetorial, NÃO é flat design.",

    // ── 4. O CONTEXTO CURTO ──────────────────────────────────────────────────
    input.segmento ? `Negócio: ${input.segmento}${input.negocio ? ` (${input.negocio})` : ""}.` : "",
    input.pilar ? `Tema da peça: ${input.pilar}.` : "",
    input.tom ? `Clima: ${input.tom}.` : "",

    // ── 5. A PALETA DA MARCA NÃO É PEDIDA À CÂMERA ───────────────────────────
    //
    // Aqui ficava `Paleta da marca, para a ambientação e os objetos: <hex>`.
    // Reforçava, com dois hex, a mesma ordem de `repertorio-registrado.ts:305`
    // — e prender o croma de uma foto a duas ou quatro cores é a receita medida
    // da reprovação: o mesmo sinal fotográfico cai de 2.844 para 462 cores
    // distintas quando o croma é preso, e o piso do portão é 600.
    //
    // A paleta continua valendo: ela é aplicada DEPOIS, no molde HTML, onde a
    // cor vem de `corValida(marca.primaryColor)` (`molde.ts:298`) e é exata.
    // Dizer isso ao gerador é melhor que calar: sem a frase ele inventa uma
    // paleta de campanha por conta própria.
    input.cores.length > 0
      ? "A paleta da marca NÃO é aplicada na foto: ela entra depois, na tipografia e nos campos de cor do layout. A fotografia é de luz natural, com as cores próprias do lugar e dos objetos."
      : "",

    // ── 6. AS REFERÊNCIAS REAIS, QUE SÃO DIREÇÃO POSITIVA ────────────────────
    // A peça nova precisa parecer do MESMO perfil que as que já estão lá —
    // é o pedido literal do CEO ("os nossos carrosséis têm a ver com os que
    // eles fizeram lá?").
    input.estiloDoFeed ? `Estilo visual observado no feed real deste cliente — a peça deve pertencer à mesma família visual, sem copiar nenhum post: ${input.estiloDoFeed}` : "",
    input.estiloVisto ? `Leitura das IMAGENS do feed real deste cliente (enquadramento e luz efetivamente vistos): ${input.estiloVisto}. Siga esta direção fotográfica.` : "",
    // O papel vem antes da amplitude de propósito: ele diz O QUE a imagem tem
    // de provar, e a amplitude só diz em que registro provar.
    input.papelDaTela ? `FUNÇÃO DESTA TELA NA HISTÓRIA — a imagem precisa MOSTRAR isto, e não servir de fundo bonito: ${input.papelDaTela}` : "",
    // Já chega filtrado: só os eixos de CENA, sem o `porque` e sem as regras de
    // tipografia, cor e copy, que valem na camada HTML. Ver `direcaoDeAmplitude`.
    input.amplitude ? input.amplitude : "",

    // ── 7. O ESPAÇO DO TÍTULO, SEM PEDIR UMA CHAPA LISA ──────────────────────
    //
    // Aqui se lia "deixe o terço INFERIOR visualmente calmo — fundo, sombra ou
    // SUPERFÍCIE LISA". Um terço de superfície lisa é 33% da imagem numa cor
    // quase única: sozinho consome 0,330 dos 0,45 de teto de cor dominante do
    // portão (73%) antes de a cena existir. O espaço continua reservado — o
    // molde escreve por cima e elemento fixo obriga espaço reservado
    // (DESIGN.md) —, mas se pede com o vocabulário da câmera: desfoque e
    // profundidade, não chapa de cor.
    "COMPOSIÇÃO: nada de importante no terço INFERIOR — chão, calçada, bancada ou fundo em desfoque ocupam esse espaço, reservado para a tipografia que entra depois. Textura e variação de luz ali são bem-vindas; assunto, não.",
    vertical
      // Story é lido de celular na mão, em segundos, e o topo e a base ficam
      // sob os elementos da interface do Instagram.
      ? "Assunto centralizado no terço do meio, com margem generosa em cima e embaixo."
      : "Composição limpa, com espaço negativo para respiro.",

    // ── 8. A LETRA: A PROIBIÇÃO MUDA DE FORMA, NÃO SOME ──────────────────────
    //
    // A frase antiga era "nenhum texto, letra, número, palavra, logotipo, placa
    // ou etiqueta escrita" — e era a ÚLTIMA do prompt, a posição de maior peso.
    // Rua de comércio sem placa não existe no mundo; cozinha sem rótulo não
    // existe; galpão sem sinalização não existe. Pedir isso a uma câmera é
    // pedir um lugar que não é fotografável — e a saída que viola menos regras
    // volta a ser a ilustração.
    //
    // A RAZÃO da proibição é outra e continua de pé, palavra por palavra (ver o
    // cabeçalho deste arquivo): preço, telefone e prazo dentro de um pixel
    // escapam do piso de verdade, que lê texto e não enxerga imagem. O que
    // importa não é a ausência de letra no mundo: é a ausência de letra
    // LEGÍVEL, porque letra ilegível não afirma fato nenhum.
    //
    // E ela não fica sozinha: `lib/agency/design/trava-de-texto.ts` fecha por
    // baixo — todo texto que vira pixel na camada HTML é trecho literal de
    // conteúdo já auditado. Esta frase é o aviso; aquela é a trava.
    "SEM TEXTO LEGÍVEL: nada que dê para LER na imagem — palavra, número, preço, telefone, data ou logotipo. Placa, letreiro e embalagem só ao longe e desfocados, como o cenário real tem. A tipografia da peça entra depois, por cima.",
  ];
  return partes.filter(Boolean).join(" ");
}

async function baixarImagem(url: string): Promise<Buffer | null> {
  // O gpt-image-1 devolve base64 embutido; o dall-e-3 devolve URL hospedada.
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1];
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Monta o reel a partir do vídeo que o CLIENTE mandou.
 *
 * `semMaterial: true` distingue as duas naturezas de falha, e a distinção
 * importa: sem vídeo, nenhuma tentativa a mais resolve — quem resolve é ele.
 * Contar isso como tentativa esgotaria o teto esperando algo que a máquina não
 * pode produzir.
 */
async function montarReel(post: {
  id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null;
}): Promise<{ ok: boolean; erro: string; semMaterial?: boolean }> {
  // O material bruto do cliente: vídeo que ELE enviou e que ainda não virou peça.
  const bruto = await prisma.mediaAsset.findFirst({
    where: {
      kind: "inbound",
      mimeType: { startsWith: "video/" },
      OR: [
        ...(post.clientId ? [{ clientId: post.clientId }] : []),
        ...(post.clientRequestId ? [{ clientRequestId: post.clientRequestId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (!bruto) {
    return { ok: false, semMaterial: true, erro: "o cliente ainda não enviou nenhum vídeo para editarmos" };
  }

  const bytes = await lerArquivo(bruto.storagePath);
  if (!bytes) return { ok: false, erro: "o vídeo do cliente não está mais no armazenamento" };

  const { editarParaReel } = await import("@/lib/agency/media/video");
  const editado = await editarParaReel(bytes);
  if (!editado.ok || !editado.bytes) {
    return { ok: false, erro: editado.erro ?? "não consegui editar o vídeo" };
  }

  const guardado = await guardarArquivo({
    bytes: editado.bytes,
    fileName: `reel-${post.id}.mp4`,
    mimeType: "video/mp4",
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: null },
  });
  return { ok: true, erro: "" };
}

/** Grava a falha de forma legível. `tentativa` nulo = não gasta o teto — a
 *  causa está fora do alcance da máquina. */
async function marcarErro(postId: string, erro: string, tentativa: number | null): Promise<void> {
  const texto = tentativa === null
    ? erro
    : `[arte ${tentativa}/${MAX_TENTATIVAS_POR_PECA}] ${erro}`;
  await prisma.socialPost.update({
    where: { id: postId },
    data: { lastError: texto.slice(0, 500) },
  }).catch(() => { /* best-effort */ });
}

/**
 * Monta as artes de um carrossel — uma por tela.
 *
 * Tudo ou nada: se uma tela falhar, NADA é gravado. Um carrossel com buracos
 * publica uma sequência que perde o sentido no meio, e é pior do que não
 * publicar. Por isso as artes só são amarradas ao post quando todas existem.
 */
async function montarCarrossel(
  post: { id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null; caption: string; pillar: string | null; scenesJson?: string },
  marca: MarcaDaPeca,
  estiloDoFeed = "",
  estiloVisto = "",
  orcamentoRestante = Number.POSITIVE_INFINITY,
): Promise<{ ok: boolean; erro: string; gerou: number; semOrcamento?: boolean }> {
  let cenas: string[] = [];
  try {
    const v = JSON.parse(post.scenesJson ?? "[]");
    if (Array.isArray(v)) cenas = v.filter((x): x is string => typeof x === "string");
  } catch { /* corrompido = sem cenas */ }

  if (cenas.length < 2) return { ok: false, erro: "o carrossel não tem telas descritas para desenhar", gerou: 0 };

  // Uma tela = uma imagem paga. Carrossel fora do formato é conta de multiplicar
  // errada, e a hora de descobrir é ANTES da primeira chamada.
  if (cenas.length > MAX_TELAS_POR_CARROSSEL) {
    return { ok: false, gerou: 0, erro: `o carrossel veio com ${cenas.length} telas e o teto é ${MAX_TELAS_POR_CARROSSEL} — cada tela é uma imagem paga` };
  }
  if (cenas.length > orcamentoRestante) {
    return {
      ok: false, gerou: 0, semOrcamento: true,
      erro: `este carrossel precisa de ${cenas.length} imagens e o cliente só tem ${Math.max(0, orcamentoRestante)} no teto de hoje`,
    };
  }

  // ── O STORYBOARD, ANTES DE QUALQUER CHAMADA PAGA ──────────────────────────
  //
  // "Tem carrosséis que têm duas imagens e as imagens ficam sendo repetidas.
  // Não contam história de acordo com o texto, só são imagens." (CEO,
  // 07/08/2026). A conferência mora AQUI, e não depois da produção, por dois
  // motivos que puxam para o mesmo lado: (a) uma tela é uma imagem paga, então
  // reprovar antes economiza o carrossel inteiro; (b) o defeito é de ROTEIRO,
  // e roteiro não melhora depois que a foto já existe.
  //
  // Vem DEPOIS das contagens acima de propósito: contar telas é mais barato que
  // conferir história, e um carrossel de 12 telas precisa ouvir "o teto é 6",
  // que é o conserto real, e não uma reclamação de roteiro.
  //
  // A régua vem do CÉREBRO DA MARCA, não deste arquivo. Marca sem formato
  // registrado cai na régua do carrossel de venda, que é a que a casa conhece.
  const regua: ReguaDeStoryboard =
    marca.cerebro.formatos.find((f) => f.regua.funcoesPermitidas.includes("gancho"))?.regua
    ?? REGUA_CARROSSEL_DE_VENDA;
  const formatoId = marca.cerebro.formatos.find((f) => f.regua.id === regua.id)?.id ?? null;
  const roteiro = conferirStoryboard(lerStoryboard(cenas), regua);
  if (!roteiro.ok) {
    // NÃO gasta imagem (`gerou: 0`): insistir não conserta um roteiro que
    // repete tela. Quem conserta é o especialista de conteúdo, reescrevendo as
    // cenas — e o laudo diz exatamente qual tela e por quê.
    return { ok: false, gerou: 0, erro: laudoDoStoryboard(roteiro).slice(0, 460) };
  }

  const urls: string[] = [];
  /** O que o molde não conseguiu fazer, tela a tela. Vira `lastError` legível —
   *  sem gastar tentativa: o carrossel SAIU, e o que faltou está dito. */
  const notas: string[] = [];
  /** Imagens efetivamente PAGAS. Sai junto do veredito porque o carrossel é
   *  tudo-ou-nada: pode falhar na tela 5 tendo pago 5. */
  let gerou = 0;
  /** As telas COM a identidade da imagem que saiu. É a segunda metade da trava:
   *  a primeira confere o roteiro, esta confere o que virou pixel. */
  const telasProduzidas: TelaDoStoryboard[] = [];
  /** As fotos reais que já entraram numa tela DESTA peça. Uma foto não se
   *  repete: imagem repetida é o defeito que a segunda conferência reprova. */
  const fotosJaUsadas = new Set<string>();

  for (const [i, tela] of roteiro.telas.entries()) {
    const cena = tela.descricao;

    // ── A FOTO REAL DO CLIENTE, POR RAZÃO DE PAPEL ──────────────────────────
    //
    // Aqui existem as duas razões que `escolha-de-foto.ts` exige: o PAPEL desta
    // tela (que declara, em `FUNCOES[papel].materiaisReais`, que classes de
    // material servem a ele) e o ASSUNTO desta cena (o desempate).
    //
    // O papel é o mesmo campo que já dita a direção da foto gerada
    // (`direcaoDaImagem`). Não é coincidência: se o papel sabe dizer o que a
    // imagem precisa MOSTRAR, ele sabe dizer que material do cliente serviria.
    const escolhaDaFoto = escolherFotoReal({
      funcao: tela.funcao,
      cena,
      disponiveis: marca.fotosReais,
      jaUsadas: fotosJaUsadas,
    });

    let bytesReais: Buffer | null = null;
    let mimeDaTela = "image/png";
    let notaDoMaterial: string | null = null;

    if (escolhaDaFoto.usar) {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: escolhaDaFoto.foto.mediaAssetId }, select: { storagePath: true, workspaceId: true },
      }).catch(() => null);
      const b = asset && asset.workspaceId === post.workspaceId
        ? await lerArquivo(asset.storagePath).catch(() => null)
        : null;
      if (b && b.length > 0) {
        bytesReais = Buffer.from(b);
        mimeDaTela = escolhaDaFoto.foto.mimeType;
        fotosJaUsadas.add(escolhaDaFoto.foto.mediaAssetId);
        notaDoMaterial = `[foto do cliente] tela ${i + 1}: ${escolhaDaFoto.razao}`;
      }
      // Arquivo escolhido que sumiu do disco cai na imagem gerada abaixo — mas
      // NUNCA sai dizendo que a foto do cliente entrou.
    } else if (escolhaDaFoto.explicacao) {
      notaDoMaterial = `[material do cliente] ${escolhaDaFoto.explicacao}`;
    }

    if (bytesReais) {
      // Foto real: nenhuma chamada paga, nenhuma linha no orçamento do dia.
      const impressaoReal = createHash("sha256").update(bytesReais).digest("hex");
      telasProduzidas.push({ ...tela, imagem: impressaoReal });
      const escolhaComp = composicaoParaFuncao(marca.cerebro, tela.funcao, formatoId);
      if (!escolhaComp) {
        notas.push(
          `tela ${i + 1}: sem entrada de repertório para o papel "${tela.funcao ?? "(não declarado)"}" — saiu na composição base (foto cheia).`,
        );
      }
      const compostaReal = await comporComMolde({
        formato: "carrossel",
        molde: marca.molde,
        fotoBytes: bytesReais,
        fotoMime: mimeDaTela,
        fonteAuditada: cena,
        selo: i === 0 ? post.pillar : null,
        assinatura: marca.nome,
        indice: { atual: i + 1, total: cenas.length },
        composicao: escolhaComp?.composicao ?? "foto-cheia",
        notaDoMaterial,
      });
      if (!compostaReal.ok) return { ok: false, gerou, erro: compostaReal.erro };
      if (compostaReal.nota) notas.push(`tela ${i + 1}: ${compostaReal.nota}`);

      const gReal = await guardarArquivo({
        bytes: compostaReal.bytes,
        // PEÇA FINAL desta tela — entra em `mediaUrlsJson` e vai ao Instagram.
        fileName: nomeDaTelaDoCarrossel(post.id, i + 1, compostaReal.mime),
        mimeType: compostaReal.mime,
        workspaceId: post.workspaceId,
        clientId: post.clientId,
        clientRequestId: post.clientRequestId,
        kind: "generated",
        uploadedBy: "design",
      });
      if (!gReal.ok) return { ok: false, gerou, erro: gReal.motivo };
      urls.push(`/api/media/${gReal.arquivo.id}`);
      continue;
    }

    const r = await generateDesign({
      prompt: montarPrompt({
        // A CENA é o assunto, não a legenda: a legenda é a mesma para o
        // carrossel inteiro, e usá-la geraria N variações da mesma imagem.
        legenda: cena,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
        // O carrossel também é 4:5 no molde — o quadrado é o que o gerador
        // devolve, e o corte acontece no `background-size: cover` do molde.
        estiloDoFeed,
        estiloVisto,
        // ── O QUE FAZ A IMAGEM SER O ARGUMENTO ────────────────────────────
        // A direção da foto vem do PAPEL que esta tela cumpre, não da legenda
        // do post. É o que separa "imagem de fundo" de "imagem argumento": a
        // tela de tensão pede o custo visível, a de mecanismo pede a
        // engrenagem em operação. Papel desconhecido devolve string vazia, e
        // aí o prompt simplesmente não fala disso.
        papelDaTela: direcaoDaImagem(tela.funcao),
        amplitude: direcaoDeAmplitude(marca.cerebro),
      }),
      size: "square",
      quality: "high",
      workspaceId: post.workspaceId,
      // Cada TELA é uma imagem paga e uma linha do livro-caixa — um carrossel
      // de 6 telas custa 6 imagens, e contá-lo como uma esconderia o item que
      // mais multiplica gasto nesta casa.
      conta: { departmentId: "design", clientId: post.clientId, agentId: "design-engine" },
    }).catch(() => ({ ok: false as const, url: undefined }));
    gerou++;

    if (!r.ok || !r.url) return { ok: false, gerou, erro: `não consegui gerar a tela ${i + 1} de ${cenas.length}` };

    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) return { ok: false, gerou, erro: `não consegui baixar a tela ${i + 1}` };

    // O MESMO portão de pixel do post simples, na mesma posição (fundo cru,
    // antes de compor). Uma tela de clipart contamina o carrossel inteiro: o
    // cliente receberia cinco fotografias e um desenho no meio.
    const portaoDaTela = await conferirFundoDaPeca({ bytes, mime: "image/png" });
    if (!portaoDaTela.ok) {
      return { ok: false, gerou, erro: `tela ${i + 1}: ${motivoDoFundoEmUmaLinha(portaoDaTela)}` };
    }

    // A IDENTIDADE DA IMAGEM. Hash dos bytes: duas telas com o mesmo hash são,
    // literalmente, a mesma imagem publicada duas vezes — o defeito que o CEO
    // apontou. Conferido AQUI, dentro do laço, para não pagar as telas
    // restantes de um carrossel que já está reprovado.
    const impressao = createHash("sha256").update(bytes).digest("hex");
    const jaUsada = telasProduzidas.find((t) => t.imagem === impressao);
    if (jaUsada) {
      return {
        ok: false, gerou,
        erro: `[storyboard] REPROVADO — as telas ${jaUsada.ordem} e ${i + 1} saíram com A MESMA IMAGEM. Imagem repetida é a prova de que aquela tela não tinha função própria; o carrossel não foi gravado.`.slice(0, 460),
      };
    }
    telasProduzidas.push({ ...tela, imagem: impressao });

    // A foto de CADA tela fica guardada — é o que faz o re-render de texto de
    // uma tela isolada custar rasterização em vez de uma imagem nova.
    await guardarArquivo({
      bytes,
      fileName: nomeDoFundo(post.id, i + 1),
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    }).catch(() => null);

    // ── A MESMA MARCA DA TELA 1 À TELA 6, SEM SEREM A MESMA TELA ───────────
    //
    // Todas as telas nascem do MESMO `molde` (marca.molde): cor, tipografia e
    // assinatura são as mesmas, e é isso que faz a peça pertencer ao conjunto.
    // O que MUDA agora é a COMPOSIÇÃO, escolhida pelo cérebro criativo a partir
    // do papel desta tela — porque uma composição só, repetida seis vezes, foi
    // exatamente o que produziu as 36 telas iguais da Foocci.
    //
    // Sem repertório para aquele papel, `escolha` é `null` e a tela cai no
    // `foto-cheia` histórico — DECLARANDO que caiu, em vez de a agência
    // escolher um layout "que combina" pelo cliente.
    const escolha = composicaoParaFuncao(marca.cerebro, tela.funcao, formatoId);
    if (!escolha) {
      notas.push(
        `tela ${i + 1}: sem entrada de repertório para o papel "${tela.funcao ?? "(não declarado)"}" — saiu na composição base (foto cheia).`,
      );
    }
    const composicao: Composicao = escolha?.composicao ?? "foto-cheia";
    const composta = await comporComMolde({
      formato: "carrossel",
      molde: marca.molde,
      fotoBytes: bytes,
      // A CENA é o conteúdo auditado desta tela — a legenda é do post inteiro.
      fonteAuditada: cena,
      selo: i === 0 ? post.pillar : null,
      assinatura: marca.nome,
      indice: { atual: i + 1, total: cenas.length },
      composicao,
      // Por que esta tela saiu com imagem GERADA tendo o cliente mandado
      // material. Vazio quando o papel simplesmente não usa foto real — aí não
      // falta nada e não há o que declarar.
      notaDoMaterial,
    });
    // Uma tela sem molde contamina o carrossel inteiro: o cliente receberia um
    // carrossel meio com marca, meio foto crua. Falta de ferramenta derruba a
    // peça toda, não gera meia peça.
    if (!composta.ok) return { ok: false, gerou, erro: composta.erro };
    if (composta.nota) notas.push(`tela ${i + 1}: ${composta.nota}`);

    const g = await guardarArquivo({
      bytes: composta.bytes,
      // PEÇA FINAL desta tela — entra em `mediaUrlsJson` e vai ao Instagram.
      fileName: nomeDaTelaDoCarrossel(post.id, i + 1, composta.mime),
      mimeType: composta.mime,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!g.ok) return { ok: false, gerou, erro: g.motivo };
    urls.push(`/api/media/${g.arquivo.id}`);
  }

  // ── A SEGUNDA CONFERÊNCIA: O ROTEIRO CONTRA O QUE VIROU PIXEL ─────────────
  //
  // A primeira rodou sobre a intenção; esta roda sobre o resultado, com a
  // identidade real de cada imagem preenchida. Parece redundante e não é: entre
  // as duas existe o gerador de imagem, que é justamente a peça que pode
  // devolver a mesma foto para duas cenas diferentes. Reprovar aqui custa as
  // imagens já pagas e evita o carrossel repetido no perfil do cliente — que é
  // o dano que não volta atrás.
  const conferenciaFinal = conferirStoryboard(telasProduzidas, regua);
  if (!conferenciaFinal.ok) {
    return { ok: false, gerou, erro: laudoDoStoryboard(conferenciaFinal).slice(0, 460) };
  }

  // O cérebro da marca declara o que NÃO sabe, e a declaração sobe junto com a
  // peça. Lacuna que ninguém lê não é lacuna declarada.
  if (marca.cerebro.lacunas.length > 0) {
    notas.push(`[cérebro criativo] o que falta para esta marca: ${marca.cerebro.lacunas.join("; ")}`);
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      mediaUrlsJson: JSON.stringify(urls),
      // A capa também vai em `mediaUrl`: é o que o portal mostra como miniatura.
      mediaUrl: urls[0],
      lastError: notas.length > 0 ? notas.join(" | ").slice(0, 480) : null,
    },
  });
  return { ok: true, erro: "", gerou };
}
