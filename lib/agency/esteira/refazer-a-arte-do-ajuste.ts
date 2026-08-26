// refazer-a-arte-do-ajuste.ts — O PEDIDO DE AJUSTE VIRA PIXEL NOVO.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (Auditor, 4ª rodada, 25/08/2026) — e ele é do tamanho do produto
// ═══════════════════════════════════════════════════════════════════════════
//
// Sonda na corrente rodando: o cliente escreve *"A TERCEIRA peça está escura
// demais, quero ela mais clara"*. A rota devolve **200**. E **0 de 4 arquivos
// mudam** — `mediaUrl` idêntica, bytes idênticos (923.426 → 923.426). Três
// batidas do relógio depois: continua 0 de 4.
//
// A causa: `refacao.ts` refaz o TEXTO da entrega e cria uma `DeliverableVersion`.
// **Nada ali chamava o rasterizador.** O card reabria em `pending` — ou seja, o
// cliente era chamado a decidir de novo sobre exatamente as imagens que ele
// acabara de recusar.
//
// A régua do concluído exige "ajustável". Sem isto a corrente não é, e o
// produto não existe: pedir ajuste é metade do que um cliente faz.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO **NÃO** É
// ═══════════════════════════════════════════════════════════════════════════
//
// Não é um segundo caminho de produção de arte. Ele não compõe, não chama o
// gerador de imagem, não conhece molde nem margem. Ele faz três coisas e
// delega o resto:
//
//   1. **MIRA** — qual peça o cliente apontou (`mira-da-peca.ts`).
//   2. **FIAÇÃO** — leva o texto NOVO (que a refação acabou de gravar no
//      `Deliverable`) para o `SocialPost` correspondente, com o MESMO leitor
//      que a esteira usa (`extrairPecas`), nunca um segundo.
//   3. **CHAMA O LAÇO DE SEMPRE** — `produzirArtesPendentes({ refazer })`, com
//      os mesmos portões: pilar, teto diário de imagens, portão de pagamento,
//      portão do fundo, trava de texto, gravação. É a mesma linha que
//      `story-instagram-v1.ts` usa para produzir a primeira vez.
//
// Uma cópia do laço aqui começaria idêntica e divergiria no primeiro ajuste —
// e a segunda porta é sempre a que fica aberta.
//
// ═══════════════════════════════════════════════════════════════════════════
// FAIL-CLOSED, EM DOIS PONTOS
// ═══════════════════════════════════════════════════════════════════════════
//
//   • **A contagem tem de bater.** Se o texto novo traz um número de peças
//     diferente do número de posts, a correspondência por posição deixa de ser
//     conhecida — e escrever a legenda da peça 2 no post 3 é pior que não
//     refazer: o cliente recebe uma peça que ninguém pediu. Não refaz, e diz
//     por quê. (`conferirContrato`, na refação, já barra encolhimento; esta é a
//     segunda tranca, aqui onde a posição é usada.)
//   • **Arte velha fica até a nova ficar pronta.** `mediaUrl` só é reescrito
//     na última linha do laço de arte, depois de a imagem ter sido paga, ter
//     passado no portão do fundo, ter sido composta e guardada. Falha em
//     qualquer ponto deixa a peça exatamente como estava — e o `MediaAsset`
//     anterior **não é apagado**, que é o que "versão anterior é preservada"
//     quer dizer do lado do arquivo.

import { prisma } from "@/lib/db/client";
import { produzirArtesPendentes, type ArtesFeitas } from "@/lib/agency/execution/artes";
import {
  pecaApontadaPeloCliente, pecasApontadasPeloAjuste, type MiraDoCliente,
} from "@/lib/agency/esteira/mira-da-peca";
import { captionDaPeca, type PecaDoEspecialista } from "@/lib/agency/produtos/story-instagram-v1";
import { medirLuz } from "@/lib/agency/design/medir-luz";
import { conferirDataDaPeca, type DiaDaSemana } from "@/lib/agency/esteira/calendario-do-cliente";
import { lerArquivo } from "@/lib/agency/media/armazenamento";
import {
  lerPedidoDeArte, compararPeca, type ComparacaoDaPeca,
} from "@/lib/agency/esteira/regua-da-refacao";

export interface ArteDoAjuste {
  /** As peças cujo ARQUIVO mudou — `mediaUrl` diferente do que estava lá. */
  refeitas: Array<{ postId: string; de: string | null; para: string }>;
  /** As peças que a mira deixou de fora, de propósito. Ficam intactas. */
  preservadas: string[];
  /** A mira do cliente, quando ele apontou uma peça. */
  mira: MiraDoCliente | null;
  /** Não deu para refazer, e por quê — em português, com dono e próxima ação. */
  motivo?: string;
  /**
   * A RÉGUA QUE FALTAVA: a peça nova medida contra a anterior (27/08/2026).
   *
   * Uma entrada por peça apontada que ganhou arquivo novo. `entrega: false`
   * significa que o arquivo novo foi DESCARTADO e a arte anterior continua de
   * pé — a casa não entrega peça pior fingindo normalidade.
   */
  regua: Array<{ postId: string; comparacao: ComparacaoDaPeca }>;
  /** As peças cujo arquivo novo foi reprovado pela régua e não foi entregue. */
  reprovadasPelaRegua: string[];
}

/**
 * O TEXTO NOVO VIRA IMAGEM NOVA — só nas peças que o cliente apontou.
 *
 * Chamada pela refação DEPOIS de o `Deliverable` já ter o conteúdo novo
 * gravado. Best-effort do ponto de vista da rota (o clique do cliente nunca
 * depende de uma imagem paga sair), mas nunca silenciosa: tudo que não
 * aconteceu volta em `motivo`, e quem chama escala.
 */
export async function refazerArteDoAjuste(entrada: {
  /** As peças que o card estava mostrando, NA ORDEM em que ele as mostrou. */
  postIds: string[];
  /**
   * AS PEÇAS REFEITAS, lidas do JSON do especialista pelo MESMO leitor que a
   * produção usa (`pecasDoEspecialista`, em `producao-de-pedido.ts`).
   *
   * ⚠️ Por que o JSON e não o markdown do `Deliverable`: reler o texto seria
   * uma volta com perda. `extrairPecas` procura "- Legenda:" e o especialista
   * de criativo escreve `note` — a peça voltava VAZIA, e o ajuste parava
   * achando que o texto tinha sumido. Um segundo leitor do mesmo dado é como
   * nasce a peça refeita com o texto da vizinha.
   */
  pecasNovas: PecaDoEspecialista[];
  clientId: string | null;
  /** As palavras do cliente — é delas que sai a mira. */
  comentario: string;
}): Promise<ArteDoAjuste> {
  const vazio: ArteDoAjuste = { refeitas: [], preservadas: [], mira: null, regua: [], reprovadasPelaRegua: [] };
  const postIds = entrada.postIds.filter(Boolean);
  if (postIds.length === 0) {
    // Entrega sem peça visual (relatório, pauta, roteiro): a refação de TEXTO
    // já fez todo o trabalho que existe. Não é falha, e não vira motivo.
    return vazio;
  }

  const pecasNovas = entrada.pecasNovas.filter((p) => p.legenda.trim().length > 0);

  if (pecasNovas.length !== postIds.length) {
    return {
      ...vazio,
      motivo:
        `o texto refeito trouxe ${pecasNovas.length} peça(s) utilizável(is) e o cliente está vendo ${postIds.length} — ` +
        "sem a contagem batendo eu não sei qual texto pertence a qual imagem, e escrever o texto de uma peça " +
        "na imagem de outra é pior do que não refazer. As imagens NÃO foram tocadas. " +
        "Dono: a equipe. Próxima ação: conferir a saída do especialista e refazer as peças.",
    };
  }

  const mira = pecaApontadaPeloCliente(entrada.comentario, postIds.length);
  // A MESMA função que a rota do portal usa para mirar o ESTADO. Duas contas
  // parecidas em dois arquivos foi exatamente como a 5ª auditoria encontrou a
  // arte certa na peça certa e três peças presas em `revision_requested`.
  const alvos = pecasApontadasPeloAjuste(postIds, entrada.comentario);
  const preservadas = postIds.filter((id) => !alvos.includes(id));

  // O ARQUIVO DE ANTES, guardado para poder afirmar que ele MUDOU. Sem isto o
  // relatório diria "refiz" com a mesma imagem de sempre — que é exatamente o
  // defeito que este arquivo existe para fechar.
  const antes = await prisma.socialPost.findMany({
    where: { id: { in: alvos } },
    select: { id: true, mediaUrl: true },
  });
  const urlAntes = new Map(antes.map((p) => [p.id, p.mediaUrl]));

  // ── A FIAÇÃO: O TEXTO NOVO CHEGA À PEÇA ─────────────────────────────────
  // Sem isto, o laço de arte redesenharia a peça com a legenda VELHA — imagem
  // nova, texto que o cliente já recusou. Pior que não refazer.
  // O calendário DESTE cliente, lido das peças que ele já tem: é com ele que
  // um dia da semana citado no texto novo é confrontado quando a peça ainda
  // não tem hora marcada. Calendário vazio não acusa ninguém.
  const agenda = await prisma.socialPost.findMany({
    where: { id: { in: postIds } },
    select: { id: true, scheduledFor: true, caption: true },
  }).catch(() => [] as Array<{ id: string; scheduledFor: Date | null; caption: string }>);
  const porPost = new Map(agenda.map((a) => [a.id, a]));
  const diasDoCalendario = [...new Set(
    agenda.map((a) => a.scheduledFor).filter((d): d is Date => d instanceof Date).map((d) => d.getDay() as DiaDaSemana),
  )];

  const datasIncoerentes: string[] = [];

  for (const postId of alvos) {
    const nova = pecasNovas[postIds.indexOf(postId)];
    if (!nova) continue;

    // ── A DATA COERENTE (27/08/2026) ─────────────────────────────────────
    //
    // "Sexta é dia de estar aqui" num calendário terça-a-quinta. A legenda
    // nova que briga com a data da peça NÃO é gravada: a anterior fica de pé
    // (o cliente não pediu para mudar o texto, e o texto que ele tinha
    // dizia a verdade) e o caso vira escalada, com dono e próxima ação.
    const doBanco = porPost.get(postId);
    const captionNova = captionDaPeca(nova);
    const dataNova = conferirDataDaPeca({
      texto: captionNova,
      agendadaPara: doBanco?.scheduledFor ?? null,
      diasDoCalendario,
    });
    const textoRecusado = !dataNova.passa;
    if (textoRecusado) datasIncoerentes.push(`${postId}: ${dataNova.motivo}`);
    // Os MESMOS campos que `story-instagram-v1.ts` grava ao criar a peça — nem
    // um a mais, nem um a menos. Divergir aqui faria a peça refeita ser um
    // outro tipo de peça.
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        // ── O TÍTULO NOVO TAMBÉM (cliente oculto, 26/08/2026) ────────────
        //
        // Aqui era `nova.legenda.slice(0, 2000)`, e o `headline` refeito ia
        // para o lixo. Como o pixel sai de `tituloDaFonte(post.caption)`
        // (`execution/artes.ts`), o cliente que pedia "troca o título" recebia
        // 200, arquivo NOVO — e o MESMO título rasterizado, porque a fonte do
        // título não tinha mudado. E a legenda do post no calendário também
        // não mudava. A MESMA função do nascimento, para os dois não
        // divergirem no primeiro ajuste.
        // Legenda com dia incoerente não entra: fica a que estava lá.
        ...(textoRecusado ? {} : { caption: captionNova }),
        // Direção ausente no texto novo NÃO apaga a que existia: apagar
        // mandaria a peça para o fallback (a legenda como cena), que é o
        // defeito que `refazer-com-direcao.ts` foi escrito para consertar.
        ...(nova.direcaoDeArte ? { artDirection: nova.direcaoDeArte } : {}),
        ...(nova.pilar ? { pillar: nova.pilar } : {}),
        // O laço de arte só refaz o que ele recebe em `refazer`; zerar o erro
        // anterior evita que a peça carregue para sempre a queixa de ontem.
        lastError: null,
      },
    }).catch(() => { /* best-effort: a peça seguinte não paga pelo erro desta */ });
  }

  // ── O LAÇO DE SEMPRE ────────────────────────────────────────────────────
  const artes: ArtesFeitas = await produzirArtesPendentes({
    ...(entrada.clientId ? { clientId: entrada.clientId } : {}),
    refazer: alvos,
  }).catch((e: unknown): ArtesFeitas => ({
    produzidas: 0,
    falhas: alvos.map((id) => ({ postId: id, erro: e instanceof Error ? e.message : "erro desconhecido" })),
    desistiram: [], semOrcamento: [], semPagamento: [],
  }));

  // ── O ARQUIVO MUDOU? A PERGUNTA NÃO É "A RODADA DISSE QUE SIM" ──────────
  //
  // `produzidas` é o relato do laço. O que interessa ao cliente é se a imagem
  // que ele vai abrir é OUTRA — e isso só se responde comparando o `mediaUrl`
  // gravado com o que estava lá antes. Foi confiando no relato que a casa
  // devolveu 200 com 0 de 4 arquivos trocados.
  const depois = await prisma.socialPost.findMany({
    where: { id: { in: alvos } },
    select: { id: true, mediaUrl: true, lastError: true },
  });

  const refeitas: ArteDoAjuste["refeitas"] = [];
  const naoMudaram: string[] = [];
  for (const p of depois) {
    const de = urlAntes.get(p.id) ?? null;
    if (p.mediaUrl && p.mediaUrl !== de) refeitas.push({ postId: p.id, de, para: p.mediaUrl });
    else naoMudaram.push(p.id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // A RÉGUA QUE FALTAVA: A PEÇA NOVA CONTRA A ANTERIOR (27/08/2026)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Aqui, e não depois: a peça só volta a ser DECIDÍVEL pelo cliente se ela
  // atender o que ele pediu. Medir depois de reabrir o card seria medir uma
  // peça que já está na mão dele.
  //
  // O que a régua reprova NÃO é entregue: o `mediaUrl` volta para o arquivo
  // anterior, a peça segue em `revision_requested` (inagendável), o cliente lê
  // uma frase honesta e a equipe é escalada. **A tentativa paga dele não é
  // queimada** — quem refaz a partir daqui é gente, com direção explícita.
  //
  // ⚠️ A régua NÃO inventa medida: "o prato em primeiro plano" sai declarado
  // como não-medido, com dono e próxima ação, mesmo quando a luz melhorou.
  const pedidoDeArte = lerPedidoDeArte(entrada.comentario);
  const regua: ArteDoAjuste["regua"] = [];
  const reprovadasPelaRegua: string[] = [];

  if (refeitas.length > 0) {
    for (const r of refeitas) {
      const comparacao = compararPeca({
        antes: await medirArquivoDaPeca(r.de),
        depois: await medirArquivoDaPeca(r.para),
        pedido: pedidoDeArte,
      });
      regua.push({ postId: r.postId, comparacao });
      if (!comparacao.entrega) reprovadasPelaRegua.push(r.postId);
    }

    // ── O QUE REPROVOU VOLTA ATRÁS, no banco ────────────────────────────────
    // O `MediaAsset` novo NÃO é apagado (ele é a prova do que a máquina
    // produziu, e apagar arquivo pago é decisão de gente); o que volta é o
    // ponteiro da peça.
    for (const postId of reprovadasPelaRegua) {
      const alvo = refeitas.find((r) => r.postId === postId)!;
      const comparacao = regua.find((x) => x.postId === postId)!.comparacao;
      await prisma.socialPost.update({
        where: { id: postId },
        data: {
          mediaUrl: alvo.de,
          lastError: `régua da refação: ${comparacao.motivo}`.slice(0, 500),
          avisoAoCliente: AVISO_DA_PECA_QUE_PIOROU,
        },
      }).catch(() => { /* best-effort: a escalada abaixo continua de pé */ });
    }
  }

  // A partir daqui, "refeitas" é só o que a régua deixou passar: é este o
  // conjunto que reabre o card e que o cliente vê.
  const entregues = refeitas.filter((r) => !reprovadasPelaRegua.includes(r.postId));

  // ── A PEÇA QUE GANHOU ARTE NOVA VOLTA A SER DECIDÍVEL ───────────────────
  //
  // `revision_requested` é uma trava real: `ESTADOS_PROMOVIVEIS`
  // (`esteira/publicacao.ts`) não a inclui, porque agendar uma peça em revisão
  // seria publicar o que o cliente recusou. Certíssimo — enquanto a arte é a
  // recusada.
  //
  // Depois de o arquivo mudar, o estado deixa de ser verdade: existe uma peça
  // NOVA, que ele ainda não decidiu. Mantê-la em `revision_requested` criaria
  // o beco do outro lado — ele aprova a versão nova no portal e a peça nunca
  // é agendada, sem ninguém ficar vermelho.
  //
  // E a trava fica de pé onde ela protege: peça cujo arquivo NÃO mudou
  // continua em `revision_requested`, inagendável, com a arte anterior.
  if (entregues.length > 0) {
    await prisma.socialPost.updateMany({
      where: { id: { in: entregues.map((r) => r.postId) }, status: "revision_requested" },
      data: {
        status: "draft",
        // A PARADA ACABOU: o aviso da tentativa anterior SAI. Aviso que
        // sobrevive ao conserto vira ruído, e ruído ninguém lê — e pior:
        // ensina o cliente a ignorar o aviso da próxima vez, que é quando
        // ele vai importar.
        avisoAoCliente: null,
      },
    }).catch(() => { /* best-effort: o arquivo novo já existe e é o que importa */ });
  }

  const saida: ArteDoAjuste = { refeitas: entregues, preservadas, mira, regua, reprovadasPelaRegua };

  // A régua reprovou? Isso é escalada, sempre — mesmo quando outras peças
  // saíram bem. Peça pior nunca sai de mansinho.
  if (reprovadasPelaRegua.length > 0) {
    const detalhe = regua
      .filter((x) => reprovadasPelaRegua.includes(x.postId))
      .map((x) => `${x.postId}: ${x.comparacao.motivo} [${x.comparacao.linhas.join(" | ")}]`)
      .join(" · ");
    saida.motivo = `${reprovadasPelaRegua.length} de ${refeitas.length} peça(s) refeitas foram REPROVADAS pela régua da refação e NÃO foram entregues. ${detalhe}`;
  } else if (datasIncoerentes.length > 0) {
    saida.motivo =
      `${datasIncoerentes.length} peça(s) voltaram com um DIA DA SEMANA que não bate com a data delas — o texto novo ` +
      `NÃO foi gravado e a legenda anterior continua de pé (${datasIncoerentes.join(" · ")})`;
  } else if (regua.some((x) => x.comparacao.naoMedidos.length > 0)) {
    // Entregou, mas há pedido do cliente que a casa não sabe medir. Não é
    // falha — é ponto fraco declarado, que é dívida; calado seria armadilha.
    const naoMedidos = [...new Set(regua.flatMap((x) => x.comparacao.naoMedidos))];
    console.warn(
      `[regua-da-refacao] a peça foi entregue, mas o cliente pediu o que esta casa NÃO mede: ${naoMedidos.join("; ")}. ` +
      "Dono: a equipe (produção). Próxima ação: olho humano na peça.",
    );
  }

  if (naoMudaram.length > 0) {
    const porQue = (id: string): string => {
      if (artes.semRenderizador) return artes.semRenderizador;
      if (artes.semPagamento.includes(id)) return "o pagamento deste pedido não está confirmado";
      if (artes.semOrcamento.includes(id)) return "bateu no teto diário de imagens deste cliente";
      return artes.falhas.find((f) => f.postId === id)?.erro
        ?? depois.find((p) => p.id === id)?.lastError
        ?? "sem motivo registrado";
    };
    saida.motivo =
      `${naoMudaram.length} de ${alvos.length} peça(s) apontadas NÃO ganharam arquivo novo ` +
      `(${naoMudaram.map((id) => `${id}: ${porQue(id)}`).join(" · ")}). ` +
      "A arte anterior continua de pé — nenhuma peça foi apagada. " +
      "Dono: a agência (produção). Próxima ação: a rodada de arte retenta; o cliente NÃO deve ser chamado " +
      "a decidir de novo sobre a mesma imagem.";

    // ═══════════════════════════════════════════════════════════════════════
    // E A FRASE HONESTA VAI PARA A TELA DELE (Auditor, 5ª rodada, 25/08/2026)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // O achado: o Auditor derrubou o gerador durante o ajuste. A casa se portou
    // bem por dentro — o card não reabriu, a equipe foi escalada com dono e
    // próxima ação, a mensagem honesta foi escrita. Só que na TELA do cliente
    // a peça apareceu com o TEXTO REFEITO sobre a IMAGEM QUE ELE ACABARA DE
    // RECUSAR, e ele varreu o HTML inteiro: **zero** ocorrências de "não
    // consegui", "não foi possível", "equipe", "erro", "problema".
    //
    // A mensagem existia — na aba de conversa e no log. É a MESMA classe do
    // aviso "sem árbitro" que ficava na coluna e nunca virava pixel: régua
    // verde sobre o componente errado.
    //
    // Por que o texto novo FICA (e não volta atrás): é a correção que ele
    // pediu, e ela está certa. O que estava errado era a tela deixá-lo
    // acreditar que a IMAGEM também mudou. A peça agora diz, no lugar em que
    // ele decide: a imagem ainda é a anterior, quem está com isso, e o que
    // acontece a seguir.
    await prisma.socialPost.updateMany({
      where: { id: { in: naoMudaram } },
      data: { avisoAoCliente: AVISO_DA_ARTE_QUE_NAO_SAIU },
    }).catch(() => { /* best-effort: a escalada e a mensagem no portal continuam de pé */ });
  }

  return saida;
}

/**
 * O QUE O CLIENTE LÊ NA PEÇA quando o ajuste refez o texto e a arte não saiu.
 *
 * Exportado porque é o que o teste afirma: a régua tem de medir a FRASE que
 * chega ao HTML, não a coluna que a guarda. Motivo, dono e próxima ação, nesta
 * ordem — critério F ("toda parada mostra motivo, dono e próxima ação").
 *
 * ⚠️ Não diz "erro" nem nome de componente: quem lê é o cliente, e o que ele
 * precisa saber é o que mudou, o que NÃO mudou e quem está com a bola.
 */
/**
 * O QUE O CLIENTE LÊ quando a peça nova foi reprovada pela régua.
 *
 * Diz a verdade inteira: a imagem que ele está vendo continua sendo a anterior,
 * a máquina tentou e o resultado ficou pior do que o que ele já tinha, ninguém
 * vai pedir que ele decida de novo sobre isso, e a tentativa dele NÃO foi
 * gasta. Motivo, dono e próxima ação — e nenhum nome de componente.
 */
export const AVISO_DA_PECA_QUE_PIOROU =
  "⚠️ A IMAGEM DESTA PEÇA AINDA É A ANTERIOR. Eu refiz a arte com o que você escreveu, medi a peça nova contra a " +
  "que você já tinha — e ela ficou PIOR justamente no que você pediu. Não vou te entregar isso. " +
  "Quem está com isso: a nossa equipe de produção, que vai refazer com direção explícita. " +
  "Sua solicitação continua valendo: você não gastou uma rodada com esta tentativa.";

/**
 * Os bytes de uma peça, a partir do `mediaUrl` que ela carrega.
 *
 * Só entende o caminho da casa (`/api/media/<id>` → `MediaAsset.storagePath`).
 * URL externa, `data:` ou ausente devolvem `null`, e `null` é "não medi" —
 * nunca "está bom".
 */
async function medirArquivoDaPeca(mediaUrl: string | null) {
  if (!mediaUrl || !mediaUrl.startsWith("/api/media/")) return null;
  const id = mediaUrl.split("/api/media/")[1]?.split("?")[0] ?? "";
  if (!id) return null;
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { storagePath: true } }).catch(() => null);
  if (!asset?.storagePath) return null;
  const bytes = await lerArquivo(asset.storagePath).catch(() => null);
  if (!bytes || bytes.length === 0) return null;
  return medirLuz(bytes).catch(() => null);
}

export const AVISO_DA_ARTE_QUE_NAO_SAIU =
  "⚠️ A IMAGEM DESTA PEÇA AINDA É A ANTERIOR — a que você pediu para mudar. " +
  "Eu já ajustei o TEXTO com base no que você escreveu, mas não consegui gerar a imagem nova agora. " +
  "Não vou te pedir para aprovar de novo a mesma arte que você acabou de recusar. " +
  "Quem está com isso: a nossa equipe de produção. " +
  "Próxima ação: assim que a imagem nova ficar pronta, esta peça volta para a sua aba de aprovações e eu te aviso.";
