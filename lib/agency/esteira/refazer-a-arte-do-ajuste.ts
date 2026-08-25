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
import { pecaApontadaPeloCliente, type MiraDoCliente } from "@/lib/agency/esteira/mira-da-peca";
import type { PecaDoEspecialista } from "@/lib/agency/produtos/story-instagram-v1";

export interface ArteDoAjuste {
  /** As peças cujo ARQUIVO mudou — `mediaUrl` diferente do que estava lá. */
  refeitas: Array<{ postId: string; de: string | null; para: string }>;
  /** As peças que a mira deixou de fora, de propósito. Ficam intactas. */
  preservadas: string[];
  /** A mira do cliente, quando ele apontou uma peça. */
  mira: MiraDoCliente | null;
  /** Não deu para refazer, e por quê — em português, com dono e próxima ação. */
  motivo?: string;
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
  const vazio: ArteDoAjuste = { refeitas: [], preservadas: [], mira: null };
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
  const alvos = mira ? [postIds[mira.indice - 1]!] : postIds;
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
  for (const postId of alvos) {
    const nova = pecasNovas[postIds.indexOf(postId)];
    if (!nova) continue;
    // Os MESMOS campos que `story-instagram-v1.ts` grava ao criar a peça — nem
    // um a mais, nem um a menos. Divergir aqui faria a peça refeita ser um
    // outro tipo de peça.
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        caption: nova.legenda.slice(0, 2000),
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
  if (refeitas.length > 0) {
    await prisma.socialPost.updateMany({
      where: { id: { in: refeitas.map((r) => r.postId) }, status: "revision_requested" },
      data: { status: "draft" },
    }).catch(() => { /* best-effort: o arquivo novo já existe e é o que importa */ });
  }

  const saida: ArteDoAjuste = { refeitas, preservadas, mira };

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
  }

  return saida;
}
