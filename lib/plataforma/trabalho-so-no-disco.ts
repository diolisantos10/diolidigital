// TRABALHO QUE SÓ EXISTE NUM DISCO — a catraca contra o defeito que custou o
// dia 27/08/2026.
//
// ─── O QUE ACONTECEU, E POR QUE NENHUM INSTRUMENTO PEGOU ────────────────────
//
// Catorze commits ficaram no disco de uma sessão e NUNCA foram empurrados. Entre
// eles a porta da isenção de parceria — escrita, testada, provada por mutação, e
// **404 na internet**. Três documentos desta casa afirmavam "a porta existe e
// está pronta"; a rota irmã respondia 401 e ela respondia 404. O cliente 001
// ficou inconcedível por um dia inteiro por causa disso.
//
// **E o instrumento que existia para isso disse que estava tudo bem.**
// `medirDistancia` (`npm run distancia`) compara a produção com
// `origin/<branch>` — e o `historicoDaBranch` lê `origin/`, nunca o HEAD local.
// Com produção == origin == `97f278b`, o veredito era EM_DIA, exit 0, ícone
// verde. Ele mediu com precisão a distância errada.
//
// É a mesma classe que esta casa já caçou seis vezes: **régua verde sobre o
// componente errado é pior que régua nenhuma** — a régua nenhuma deixa a dúvida
// viva; a verde no lugar errado mata a dúvida e deixa o defeito.
//
// ─── A REGRA QUE ESTE MÓDULO LIGA ───────────────────────────────────────────
//
// *Trabalho que não saiu do disco não está entregue, não está em revisão e não
// está no ar — e nenhum relatório pode dizer que está.*
//
// Commit local que nenhum remoto tem é invisível para o CI, para o deploy, para
// qualquer outra sessão e para o CEO. Ele não é "pronto"; é um rascunho com
// aparência de entrega, e a aparência é o dano.

import { execFileSync } from "node:child_process";

export type CommitNoDisco = { commitCurto: string; assunto: string };

export type VereditoDoDisco = {
  codigo: "TUDO_EMPURRADO" | "SO_NO_DISCO" | "NAO_CONSEGUI_OLHAR";
  /** Quantos commits o HEAD local tem que NENHUM remoto conhece. */
  quantos: number;
  /** Do mais recente para o mais antigo. */
  commits: CommitNoDisco[];
  resumo: string;
  acao: string;
};

/** Roda git e devolve a saída, ou `null` quando o comando falha. */
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

/**
 * Os commits do HEAD que NENHUM remoto alcança.
 *
 * ⚠️ A pergunta é "algum remoto tem?", não "o branch de deploy tem?" — e a
 * diferença é o conserto. Um commit empurrado para uma branch de PR ainda não
 * está em produção, mas está VISÍVEL: o CI o vê, o revisor o vê, outra sessão o
 * clona. Quem responde "está em produção?" é `medirDistancia`, e são perguntas
 * diferentes que exigem respostas diferentes. Confundir as duas foi como o
 * defeito passou: a resposta certa para a pergunta errada.
 *
 * `--remotes` cobre qualquer remoto e qualquer branch, então empurrar para
 * `claude/o-que-for` já apaga o alarme — que é exatamente o comportamento certo.
 */
export function trabalhoSoNoDisco(): VereditoDoDisco {
  // ⚠️ A ORDEM DOS ARGUMENTOS É O CONSERTO, e eu errei ela primeiro (27/08/2026).
  //
  // Escrevi `--not --remotes ... HEAD` e a catraca devolveu "nada preso" com um
  // commit meu preso no disco — falso negativo, o pior resultado possível para
  // uma catraca. `--not` inverte o sentido de TUDO o que vem depois dele: com o
  // `HEAD` à direita, ele estava sendo excluído junto com os remotos, e a
  // resposta era sempre vazia.
  //
  // `HEAD` vem ANTES de `--not`. E o teste que existia não pegou isso porque
  // conferia a PRESENÇA dos argumentos, não a ordem — régua verde sobre o
  // componente errado, dentro do próprio arquivo escrito contra esse defeito.
  // Quem pegou foi rodar contra o repositório de verdade.
  const saida = git(["log", "--format=%h\t%s", "-n", "200", "HEAD", "--not", "--remotes"]);

  if (saida === null) {
    // Silêncio nunca vira sinal verde: não conseguir olhar é pior que "atrasado
    // mas visível", porque some com a própria pergunta.
    return {
      codigo: "NAO_CONSEGUI_OLHAR",
      quantos: 0,
      commits: [],
      resumo: "Não consegui perguntar ao git o que ainda não foi empurrado.",
      acao: "Rodar `git log --not --remotes HEAD` à mão antes de declarar qualquer coisa entregue.",
    };
  }

  const commits: CommitNoDisco[] = saida
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => {
      const [commitCurto, ...resto] = l.split("\t");
      return { commitCurto: commitCurto ?? "", assunto: resto.join("\t") };
    });

  if (commits.length === 0) {
    return {
      codigo: "TUDO_EMPURRADO",
      quantos: 0,
      commits: [],
      resumo: "Nada preso no disco — todo commit local já está em algum remoto.",
      acao: "",
    };
  }

  return {
    codigo: "SO_NO_DISCO",
    quantos: commits.length,
    commits,
    resumo:
      `${commits.length} commit(s) existem SÓ NESTE DISCO — nenhum remoto os tem. ` +
      "Eles não estão entregues, não estão em revisão e não estão no ar.",
    acao:
      "Empurrar para uma branch e abrir PR antes de declarar este trabalho pronto. " +
      "Foi exatamente assim que a porta da isenção de parceria ficou 404 por um dia " +
      "enquanto três documentos diziam que ela existia.",
  };
}
