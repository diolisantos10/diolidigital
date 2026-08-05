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

import { decidirGravacao } from "@/lib/agency/media/backfill-carrossel.mjs";
import type { Plano, PostPlanejado, ViaDaTela } from "@/lib/agency/media/backfill-carrossel.mjs";

/** O que vai acontecer com ESTE post quando o botão for apertado. */
export type AcaoDoPost =
  /** Vai receber as telas: 2+ casadas e `mediaUrlsJson` ainda vazio. */
  | "atualizar"
  /**
   * Já tem telas, mas está INCOMPLETO: o plano contém todas as que estão
   * gravadas e mais alguma (tipicamente a capa, que é a tela 1). Reparo é
   * aditivo — nada do que já está lá se perde.
   */
  | "reparar"
  /** Já tem telas ligadas — a tela nunca sobrescreve (o `--force` não é exposto). */
  | "ja-tem-telas"
  /** Casou 0 ou 1 tela — carrossel de uma imagem só não é carrossel. */
  | "sem-telas-suficientes";

export interface TelaNaTela {
  pos: number;
  fileName: string;
  via: ViaDaTela;
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
  /** Quantas telas do plano ainda não estão gravadas — o "5 → 6" do reparo. */
  faltando: number;
}

export interface Avaliacao {
  postsNaTela: PostNaTela[];
  /** Quantos posts o POST realmente alteraria — novos MAIS reparos. É o número
   *  que vai no botão, e ele tem que bater com `postsParaGravar`. */
  postsQueSeraoAtualizados: number;
  /** Dos acima, quantos são reparo de carrossel incompleto. */
  postsQueSeraoReparados: number;
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

/**
 * A ação de cada post — DELEGADA a `decidirGravacao`, a mesma função que o
 * gravador usa. Reimplementar a regra aqui foi o que quase fez a tela e a
 * tarefa de boot divergirem; agora a tela não tem regra própria, tem tradução.
 */
export function acaoDoPost(post: PostPlanejado): AcaoDoPost {
  const d = decidirGravacao(post, { force: false });
  if (d.acao === "ligar") return "atualizar";
  if (d.acao === "reparar") return "reparar";
  if (d.acao === "sem-telas-suficientes") return "sem-telas-suficientes";
  return "ja-tem-telas"; // `sobrescrever` não existe nesta porta: sem `--force`.
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
    faltando: decidirGravacao(p, { force: false }).faltando,
  }));

  const conta = (a: AcaoDoPost) => postsNaTela.filter((p) => p.acao === a).length;
  const postsQueSeraoReparados = conta("reparar");
  const postsQueSeraoAtualizados = conta("atualizar") + postsQueSeraoReparados;
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
    postsQueSeraoReparados,
    postsJaComTelas: conta("ja-tem-telas"),
    postsSemTelasSuficientes: conta("sem-telas-suficientes"),
    telasCasadas: postsNaTela.reduce((s, p) => s + p.telas.length, 0),
    telasQueSeraoLigadas: postsNaTela
      .filter((p) => p.acao === "atualizar" || p.acao === "reparar")
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
