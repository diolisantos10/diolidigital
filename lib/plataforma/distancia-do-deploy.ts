// A produção está atrás da branch? Quanto, e QUAIS commits estão faltando? — o veredito, sem I/O.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
// Em 16/08/2026 o Diretor auditou código o dia inteiro e nunca conferiu o
// deploy. A produção ficou 48 COMMITS ATRÁS da branch, servindo código de uma
// hora antes. Um funil quebrado e uma cotação 7x abaixo do que o cliente pediu
// continuaram vivos para qualquer visitante durante horas, enquanto quatro PMs
// entregavam conserto e o Diretor relatava vitória ao CEO. `npx tsc --noEmit`
// e `npm test` estavam VERDES o tempo todo: peça verde, junta rompida. Com
// quatro PMs empurrando, cada envio atropelava o anterior e os deploys iam
// para SKIPPED em cadeia — ninguém percebeu porque ninguém olhava.
//
// O `sentinela-do-deploy.ts` já responde "o commit no ar tem PROVA DE CI?".
// Ele não responde DISTÂNCIA — um commit pode ter passado na CI e ainda assim
// ser um commit de uma hora atrás, com 48 outros empilhados atrás dele. Essa é
// a lacuna que este módulo preenche.
//
// A LEI DA CASA se aplica aqui do mesmo jeito que no sentinela: "não consegui
// olhar" e "está em dia" são FATOS OPOSTOS. Ausência de informação não é
// informação. Uma falha de rede ou de git NUNCA pode sair como "tudo certo" —
// e é exatamente esse desvio, silencioso e repetido, que deixou 48 commits
// se acumularem sem ninguém notar.

/** O que /api/health devolve sobre o que está no ar agora. */
export type EstadoDaProducao = {
  /** A produção respondeu 200? */
  noAr: boolean;
  /** Commit que a produção declara estar servindo (null = não declarou). */
  commit: string | null;
};

/** Um commit da branch, do mais recente para o mais antigo. */
export type CommitDaBranch = {
  commitCurto: string;
  assunto: string;
};

export type Gravidade = "ok" | "atencao" | "grave";

export type VereditoDaDistancia = {
  codigo:
    | "EM_DIA"
    | "ATRASADA"
    | "PRODUCAO_FORA"
    | "PRODUCAO_SEM_VERSAO"
    | "COMMIT_DESCONHECIDO"
    | "NAO_CONSEGUI_OLHAR";
  /** true só quando a distância foi de fato medida contra o histórico. */
  medido: boolean;
  commitsAtras: number | null;
  /** Os commits que faltam subir, do mais recente para o mais antigo. */
  faltando: CommitDaBranch[];
  gravidade: Gravidade;
  /** Uma linha, em português de negócio, para quem não lê log. */
  resumo: string;
  /** O que fazer agora. Vazio só quando está tudo certo. */
  acao: string;
  /**
   * Preenchida quando a medição saiu, mas com reserva — ex.: `git fetch`
   * falhou e o veredito usou histórico local, possivelmente velho. `null`
   * quando não há ressalva. Existe porque, antes dela, esse aviso só ia para
   * `console.error` no script: não estava em `VereditoDaDistancia`, não
   * entrava no `--json` e não afetava o exit code — um veredito `EM_DIA`
   * podia sair medido, exit 0, baseado em git desatualizado, e quem
   * consumisse só o exit code ou o JSON nunca saberia. É a mesma classe de
   * silêncio que este módulo existe para matar: medição parcial lida como
   * sinal verde.
   */
  ressalva: string | null;
};

/** Quantos commits, a contar do topo, até achar `alvo` (por prefixo, sem diferenciar maiúsculas). Null se não achar. */
function posicaoNoHistorico(alvo: string, historico: CommitDaBranch[]): number | null {
  const alvoNormalizado = alvo.toLowerCase();
  for (let i = 0; i < historico.length; i++) {
    const commit = historico[i];
    if (commit === undefined) continue;
    if (commit.commitCurto.toLowerCase().startsWith(alvoNormalizado)) return i;
  }
  return null;
}

function resumoDeAtraso(commitsAtras: number, faltando: CommitDaBranch[]): string {
  const LIMITE_CITADO = 5;
  const citados = faltando.slice(0, LIMITE_CITADO).map((c) => `"${c.assunto}"`);
  const resto = faltando.length - citados.length;
  const lista = resto > 0 ? `${citados.join(", ")}, ... e mais ${resto}` : citados.join(", ");
  return `A produção está ${commitsAtras} commit${commitsAtras === 1 ? "" : "s"} atrás da branch. Falta subir: ${lista}.`;
}

/**
 * Julga a distância entre o que está no ar e o topo da branch.
 *
 * `historico` vem do mais NOVO (topo da branch) para o mais ANTIGO — a mesma
 * ordem que `git log` devolve por padrão. Isso importa: inverter a ordem
 * inverte silenciosamente a contagem de "quantos atrás".
 */
export function julgarDistancia(input: {
  producao: EstadoDaProducao;
  historico: CommitDaBranch[];
  falhaAoOlhar?: string | null;
  ressalva?: string | null;
}): VereditoDaDistancia {
  const { producao, historico, falhaAoOlhar } = input;
  const ressalva = input.ressalva ?? null;

  // 1. Não deu para olhar (rede caiu, git falhou) não é a mesma coisa que "em
  //    dia" — são fatos opostos. Foi essa confusão, em outra forma, que deixou
  //    48 commits se acumularem sem barulho nenhum: silêncio lido como sinal
  //    verde.
  if (falhaAoOlhar) {
    return {
      codigo: "NAO_CONSEGUI_OLHAR",
      medido: false,
      commitsAtras: null,
      faltando: [],
      gravidade: "atencao",
      resumo: `Não foi possível medir a distância do deploy: ${falhaAoOlhar}`,
      acao: "Repetir a checagem. Até ela responder, tratar a distância como desconhecida — nunca como em dia.",
      ressalva,
    };
  }

  // 2. Produção fora vem antes de qualquer pergunta sobre distância: não há
  //    "quantos commits atrás" de uma tela que não abre.
  if (!producao.noAr) {
    return {
      codigo: "PRODUCAO_FORA",
      medido: false,
      commitsAtras: null,
      faltando: [],
      gravidade: "grave",
      resumo: "A produção não está respondendo — não há como medir distância.",
      acao: "Abrir o painel do Railway e olhar o log do último deploy agora.",
      ressalva,
    };
  }

  // 3. Sem saber qual versão está no ar, medir distância é inventar um número.
  //    Falha do próprio medidor: é grave, não é "não deu para verificar".
  if (!producao.commit) {
    return {
      codigo: "PRODUCAO_SEM_VERSAO",
      medido: false,
      commitsAtras: null,
      faltando: [],
      gravidade: "grave",
      resumo: "A produção está no ar, mas não diz qual versão está servindo.",
      acao: "Conferir se RAILWAY_GIT_COMMIT_SHA chega ao build (app/api/health/route.ts).",
      ressalva,
    };
  }

  const posicao = posicaoNoHistorico(producao.commit, historico);

  // 4. O commit da produção não aparece no histórico: pode ser um fetch velho
  //    (a branch já andou e a cópia local está desatualizada) ou a produção
  //    servindo o commit de OUTRA branch. Nos dois casos não sabemos a
  //    distância de verdade — fingir que sabemos é o defeito, não o alívio.
  if (posicao === null) {
    return {
      codigo: "COMMIT_DESCONHECIDO",
      medido: false,
      commitsAtras: null,
      faltando: [],
      gravidade: "atencao",
      resumo: `O commit em produção (${producao.commit}) não aparece no histórico consultado.`,
      acao: "Atualizar o histórico local (git fetch) e checar se a produção está numa branch diferente da esperada.",
      ressalva,
    };
  }

  // 5. No topo: em dia.
  if (posicao === 0) {
    return {
      codigo: "EM_DIA",
      medido: true,
      commitsAtras: 0,
      faltando: [],
      gravidade: "ok",
      resumo: "A produção está em dia com a branch.",
      acao: "",
      ressalva,
    };
  }

  // 6. Atrás: a distância é a posição, e o que falta é tudo que veio depois
  //    (os `posicao` primeiros do histórico, do mais novo para o mais antigo).
  //    3 commits atrás já é uma tarde de trabalho fora do ar — daí o corte de
  //    gravidade em 3, não em algum número maior que soaria mais confortável.
  const commitsAtras = posicao;
  const faltando = historico.slice(0, posicao);
  return {
    codigo: "ATRASADA",
    medido: true,
    commitsAtras,
    faltando,
    gravidade: commitsAtras >= 3 ? "grave" : "atencao",
    resumo: resumoDeAtraso(commitsAtras, faltando),
    acao: "Disparar (ou destravar) o deploy da branch em produção agora — não esperar o próximo push.",
    ressalva,
  };
}
