// A tradução do plano do backfill para uma tela que o CEO entende — e as duas
// travas que a tela precisa ter.
//
// Por que existe separado do `route.ts`: um `route.ts` só pode exportar
// handlers HTTP. O julgamento "isto pode ser aplicado pelo botão?" precisa ser
// função pura e testável, não um `if` escondido no meio do handler.
//
// ⚠️ A trava que dá nome ao arquivo: `--por-ordem` (casamento POSICIONAL) NÃO
// existe nesta superfície. A rota nunca liga a flag, e ainda assim `avaliar()`
// reprova qualquer plano que traga uma tela `via: "ordem"`. Cinto e suspensório
// de propósito: casamento posicional monta carrossel com logo e material bruto,
// e a auditoria de 04/08/2026 exigiu decisão humana com dry-run próprio. Quem
// realmente precisar roda `scripts/backfill-carrossel-foocci.mjs --por-ordem`
// na mão, lendo o log linha a linha.

import type { Plano, PostPlanejado } from "@/lib/agency/media/backfill-carrossel.mjs";

/** O que vai acontecer com ESTE post quando o botão for apertado. */
export type AcaoDoPost =
  /** Vai receber as telas: 2+ casadas e `mediaUrlsJson` ainda vazio. */
  | "atualizar"
  /** Já tem telas ligadas — a tela nunca sobrescreve (o `--force` não é exposto). */
  | "ja-tem-telas"
  /** Casou 0 ou 1 tela — carrossel de uma imagem só não é carrossel. */
  | "sem-telas-suficientes";

export interface TelaNaTela {
  pos: number;
  fileName: string;
  via: "esteira" | "nome-CnTm" | "ordem";
  url: string;
}

export interface PostNaTela {
  id: string;
  /** O "C<n>": posição do post na ordem do calendário. */
  idx: number;
  caption: string;
  telasAtuais: number;
  telas: TelaNaTela[];
  acao: AcaoDoPost;
}

export interface Avaliacao {
  postsNaTela: PostNaTela[];
  /** Quantos posts o POST realmente alteraria. É o número que vai no botão. */
  postsQueSeraoAtualizados: number;
  postsJaComTelas: number;
  postsSemTelasSuficientes: number;
  /** Todas as telas reconhecidas, inclusive as de posts que não serão tocados. */
  telasCasadas: number;
  /**
   * Só as telas dos posts que serão de fato atualizados. É ESTE o número que a
   * tela promete ao CEO — `telasCasadas` inclui posts que já têm telas e que a
   * aplicação não toca, e prometer o total maior seria mentir no botão.
   */
  telasQueSeraoLigadas: number;
  /** Qualquer tela casada por posição — a tela pinta vermelho e trava. */
  temCasamentoPorOrdem: boolean;
  aplicavel: boolean;
  /** Em português, para a tela mostrar sem traduzir código de erro. */
  motivoNaoAplicavel: string | null;
}

/** A ação de cada post, na mesma regra de `postsParaGravar` (sem `force`). */
export function acaoDoPost(post: PostPlanejado): AcaoDoPost {
  if (post.telasAtuais.length > 0) return "ja-tem-telas";
  return post.telas.length >= 2 ? "atualizar" : "sem-telas-suficientes";
}

/**
 * Traduz o plano puro em algo exibível — e decide se o botão de aplicar pode
 * sequer existir. Nunca lança: um plano com erro vira avaliação vazia e não
 * aplicável.
 */
export function avaliarPlano(plano: Pick<Plano, "posts">): Avaliacao {
  const postsNaTela: PostNaTela[] = plano.posts.map((p) => ({
    id: p.id,
    idx: p.idx,
    caption: p.caption,
    telasAtuais: p.telasAtuais.length,
    telas: p.telas.map((t) => ({
      pos: t.pos,
      fileName: t.fileName,
      via: t.via,
      url: `/api/media/${t.assetId}`,
    })),
    acao: acaoDoPost(p),
  }));

  const conta = (a: AcaoDoPost) => postsNaTela.filter((p) => p.acao === a).length;
  const postsQueSeraoAtualizados = conta("atualizar");
  const temCasamentoPorOrdem = postsNaTela.some((p) => p.telas.some((t) => t.via === "ordem"));

  let motivoNaoAplicavel: string | null = null;
  if (temCasamentoPorOrdem) {
    motivoNaoAplicavel =
      "O ensaio casou telas por ORDEM DE UPLOAD — isso é chute posicional, não " +
      "reconhecimento de nome. Esta tela não aplica esse tipo de casamento.";
  } else if (postsQueSeraoAtualizados === 0) {
    motivoNaoAplicavel = "Nenhum post seria alterado — não há o que aplicar.";
  }

  return {
    postsNaTela,
    postsQueSeraoAtualizados,
    postsJaComTelas: conta("ja-tem-telas"),
    postsSemTelasSuficientes: conta("sem-telas-suficientes"),
    telasCasadas: postsNaTela.reduce((s, p) => s + p.telas.length, 0),
    telasQueSeraoLigadas: postsNaTela
      .filter((p) => p.acao === "atualizar")
      .reduce((s, p) => s + p.telas.length, 0),
    temCasamentoPorOrdem,
    aplicavel: !temCasamentoPorOrdem && postsQueSeraoAtualizados > 0,
    motivoNaoAplicavel,
  };
}

/** Frase da casa para cada motivo de aborto do plano puro. */
export function explicarErro(erro: NonNullable<Plano["erro"]>): {
  titulo: string;
  detalhe: string;
  oQueFazer: string;
} {
  if (erro.codigo === "sem-data") {
    const quantos = erro.semData?.length ?? 0;
    return {
      titulo: "Falta data no calendário",
      detalhe:
        (quantos === 1
          ? "1 carrossel deste cliente está sem data agendada. "
          : `${quantos} carrosséis deste cliente estão sem data agendada. `) +
        "A reconciliação usa a ordem do calendário para saber qual tela é de qual post — " +
        "sem data, essa ordem mentiria e as telas iriam para o carrossel errado.",
      oQueFazer:
        quantos === 1
          ? "Preencha a data desse post no calendário e rode o ensaio de novo. Nada foi alterado."
          : "Preencha a data desses posts no calendário e rode o ensaio de novo. Nada foi alterado.",
    };
  }
  return {
    titulo: "Nenhum carrossel para reconciliar",
    detalhe: "Este cliente não tem nenhum post no formato carrossel.",
    oQueFazer: "Se era para ter, confira o calendário de conteúdo do cliente.",
  };
}
