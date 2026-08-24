// O que está no ar passou pelo portão? — o veredito, sem I/O.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
// Em 06/08/2026 a produção passou a servir o commit `7724050` sem que a CI
// tivesse rodado UMA VEZ nesse commit. Não houve reprovação: houve AUSÊNCIA.
// O GitHub Actions estava em pane (incidente iniciado 15:22Z, webhooks
// estrangulados a ~15%), o push não gerou run nenhum, e o Railway — que faz
// deploy por push, não por CI — subiu assim mesmo.
//
// Ninguém foi avisado porque, para todo mundo rio abaixo, "a CI não rodou" e
// "a CI passou" têm exatamente a mesma aparência: nenhum e-mail vermelho.
// Silêncio foi lido como aprovação.
//
// É a Lei da casa aplicada à esteira de deploy: **ausência de informação não é
// informação**. Um commit sem prova NÃO é um commit aprovado — é um commit sem
// prova, e isso tem que ter nome, cor e barulho próprios.
//
// Por isso o veredito distingue TRÊS coisas que o e-mail do GitHub confunde:
//   • REPROVADO   — a CI rodou e disse não;
//   • SEM_PROVA   — a CI não rodou, ou foi cancelada no meio (nada foi provado);
//   • APROVADO    — a CI rodou inteira e disse sim.
//
// E, dentro de SEM_PROVA, registra SE a plataforma estava em pane. Isso não
// perdoa o risco (a produção segue sem prova nos dois casos) — muda só a AÇÃO:
// com a plataforma fora, a saída é reprovar o commit quando ela voltar; com a
// plataforma de pé, é um webhook perdido e o run precisa ser disparado à mão.
//
// ── O MOTIVO TEM QUE SER VERDADEIRO (24/08/2026) ────────────────────────────
// Havia um QUARTO estado escondido dentro de SEM_PROVA, e ele mentia.
//
// `olharCI` devolvia `houveRun: false` tanto quando PERGUNTOU e o GitHub disse
// "não há run" quanto quando NÃO CONSEGUIU PERGUNTAR (rede fora, proxy no
// meio, limite de requisições). A frase que saía era a mesma nos dois:
// "nenhum run foi criado". Numa auditoria os quatro commits do dia apareceram
// como "sem CI" — todos com CI VERDE, conferida à mão na API.
//
// O veredito estava certo: nos dois casos não há prova, e nos dois casos não
// sobe. Falha fechada é o desenho, e ele fica. O que estava errado era o
// MOTIVO — e motivo errado custa mais caro que motivo nenhum, porque manda a
// próxima pessoa caçar um CI que existe. Quem não acha, conclui que o
// sentinela está quebrado. E sentinela que ninguém acredita, alguém desliga.
//
// É a mesma doutrina que já mordeu esta casa duas vezes hoje em outro lugar:
// **status de erro não é motivo — o motivo está na mensagem.** Um HTTP 400
// que parecia corpo malformado era falta de saldo; um 404 que parecia rota
// errada era URL apontando para host morto. Quem leu o rótulo foi para o
// lugar errado nas duas.
//
// Por isso os dois estados são SEPARADOS na estrutura, não só no texto:
//   • SEM_PROVA            — perguntei ao GitHub, e a resposta foi não.
//   • SEM_RESPOSTA_DO_GITHUB — não consegui perguntar. Não sei a resposta, e
//                              dizer que ela é "não" seria inventar.
// Separar no tipo, e não só na frase, é o que impede a distinção de ser
// desfeita por descuido: juntar os dois de novo não compila calado — quebra
// em `__tests__/plataforma/sentinela-do-deploy.test.ts`.

/** Só para montar o link que a mensagem oferece. A régua de I/O mora em
 *  `consulta-de-ci.ts`; importar de lá para cá fecharia um ciclo. */
const REPO_DE_EXIBICAO = "diolisantos10/diolidigital";

/** Conclusão de um run de CI, como o GitHub a reporta. */
export type ConclusaoDeCI =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "startup_failure"
  | "skipped"
  | "neutral"
  | "action_required"
  | "stale";

export type EstadoDaProducao = {
  /** A produção respondeu 200 em /api/health? */
  noAr: boolean;
  /** Commit curto que a produção declara estar servindo (null = não declarou). */
  commit: string | null;
};

export type ProvaDeCI = {
  /** Existe ALGUM run de CI para este commit? Só tem sentido quando a pergunta
   *  CHEGOU a ser feita — veja `perguntaFalhou`. */
  houveRun: boolean;
  /** Conclusão do run mais recente. null quando não houve run. */
  conclusao: ConclusaoDeCI | null;
  /** Link do run, para quem for conferir. */
  url?: string | null;
  /**
   * true quando NÃO foi possível perguntar ao GitHub (rede, proxy, limite de
   * requisições, resposta não-2xx). É diferente de `houveRun: false`, que é uma
   * RESPOSTA. Aqui não há resposta nenhuma, e afirmar que não existe run seria
   * inventar. Fecha o portão do mesmo jeito — só não mente sobre o porquê.
   */
  perguntaFalhou?: boolean;
  /** O detalhe técnico de POR QUE a pergunta falhou, para quem for investigar.
   *  Nunca carrega segredo: só status HTTP e nome do erro. */
  motivoDaFalha?: string | null;
};

export type EstadoDaPlataforma = {
  /** O GitHub Actions está operacional agora? */
  actionsOperacional: boolean;
  /** Descrição curta do incidente, quando houver. */
  incidente?: string | null;
};

export type Gravidade = "ok" | "atencao" | "grave";

export type Veredito = {
  codigo:
    | "PRODUCAO_FORA"
    | "PRODUCAO_SEM_VERSAO"
    | "CI_REPROVOU"
    | "SEM_PROVA_PLATAFORMA_FORA"
    | "SEM_RESPOSTA_DO_GITHUB"
    | "SEM_PROVA"
    | "APROVADO";
  gravidade: Gravidade;
  /** Uma linha, em português de negócio, para quem não lê log. */
  resumo: string;
  /** O que fazer agora. Vazio só quando está tudo certo. */
  acao: string;
  /** true quando a produção está servindo código que NINGUÉM provou. */
  producaoSemProva: boolean;
};

/**
 * As conclusões que provam alguma coisa. Qualquer outra — `cancelled`,
 * `timed_out`, `startup_failure`, `stale`, `skipped` — é run que MORREU no
 * meio: não reprovou, mas também não aprovou. Tratar isso como "não é failure,
 * então está tudo bem" é o defeito que este módulo existe para impedir.
 */
const APROVA: ReadonlySet<string> = new Set<ConclusaoDeCI>(["success"]);
const REPROVA: ReadonlySet<string> = new Set<ConclusaoDeCI>([
  "failure",
  "timed_out",
  "startup_failure",
  "action_required",
]);

/**
 * O veredito sobre A PROVA de um commit, sem falar de produção.
 *
 * Existe porque DUAS coisas precisam da mesma regra e não podem divergir:
 *   • o sentinela, que julga o que JÁ está no ar (depois do fato);
 *   • a porta de emergência, que precisa registrar em que estado a CI estava
 *     no momento em que alguém forçou uma subida (antes do fato).
 *
 * Duas cópias da regra é como "sem prova" volta a contar como verde num dos
 * lados. Por isso a classificação mora aqui, uma vez só, e `julgarDeploy`
 * apenas a veste de produção.
 */
export type CodigoDaProva =
  | "APROVADO"
  | "CI_REPROVOU"
  | "SEM_PROVA_PLATAFORMA_FORA"
  | "SEM_RESPOSTA_DO_GITHUB"
  | "SEM_PROVA";

export type VereditoDaProva = {
  codigo: CodigoDaProva;
  /** true SÓ quando a CI rodou inteira e disse sim. Nunca por ausência. */
  temProva: boolean;
  /** Uma linha, em português de negócio. */
  resumo: string;
};

export function julgarProva(input: { ci: ProvaDeCI; plataforma: EstadoDaPlataforma }): VereditoDaProva {
  const { ci, plataforma } = input;

  // ⛔ ESTE RAMO É O PRIMEIRO, E A ORDEM É A TRAVA.
  //
  // Sem resposta não há resposta para ler: o que `houveRun` e `conclusao`
  // trazem aqui é preenchimento, não fato. Se este teste viesse depois do de
  // APROVA, um caminho que devolvesse `conclusao: "success"` junto com
  // `perguntaFalhou` viraria VERDE — falha ABERTA, no módulo cuja razão de
  // existir é fechar. Há teste fixando exatamente isso.
  //
  // Vem antes também do diagnóstico de plataforma: `olharPlataforma` assume
  // "operacional" quando NÃO consegue falar com o status page, então, quando a
  // rede local cai, os dois sinais chegam corrompidos — e culpar o Actions
  // seria trocar uma mentira por outra.
  if (ci.perguntaFalhou) {
    return {
      codigo: "SEM_RESPOSTA_DO_GITHUB",
      temProva: false,
      resumo:
        "NÃO consegui perguntar ao GitHub se este commit tem CI" +
        (ci.motivoDaFalha ? ` (${ci.motivoDaFalha})` : "") +
        " — não sei se há prova, e não estou dizendo que não há.",
    };
  }

  if (ci.houveRun && ci.conclusao && REPROVA.has(ci.conclusao)) {
    return {
      codigo: "CI_REPROVOU",
      temProva: false,
      resumo: `A CI rodou e REPROVOU este commit (${ci.conclusao}).`,
    };
  }

  if (ci.houveRun && ci.conclusao && APROVA.has(ci.conclusao)) {
    return { codigo: "APROVADO", temProva: true, resumo: "Este commit passou na CI." };
  }

  // Tudo o mais é AUSÊNCIA DE PROVA — e ausência de prova não é aprovação.
  // Cai aqui tanto "não houve run nenhum" quanto "houve run que morreu no
  // meio" (cancelled/stale/skipped/neutral). Nos dois casos ninguém provou nada.

  if (!plataforma.actionsOperacional) {
    return {
      codigo: "SEM_PROVA_PLATAFORMA_FORA",
      temProva: false,
      resumo:
        "Este commit NÃO tem prova de CI — o GitHub Actions está fora" +
        (plataforma.incidente ? ` (${plataforma.incidente})` : "") +
        ".",
    };
  }

  return {
    codigo: "SEM_PROVA",
    temProva: false,
    resumo:
      "Este commit NÃO tem CI verde" +
      (ci.houveRun
        ? ` — o run terminou em "${ci.conclusao}", sem provar nada.`
        : " — perguntei ao GitHub, e ele respondeu que nenhum run foi criado."),
  };
}

export function julgarDeploy(input: {
  producao: EstadoDaProducao;
  ci: ProvaDeCI;
  plataforma: EstadoDaPlataforma;
}): Veredito {
  const { producao, ci, plataforma } = input;

  // 1. Produção fora é a única coisa que vem antes de qualquer pergunta sobre
  //    prova: não adianta discutir se o commit passou na CI se o cliente está
  //    olhando para uma tela que não abre.
  if (!producao.noAr) {
    return {
      codigo: "PRODUCAO_FORA",
      gravidade: "grave",
      resumo: "A produção não está respondendo.",
      acao: "Abrir o painel do Railway e olhar o log do último deploy agora.",
      producaoSemProva: true,
    };
  }

  // 2. Sem saber QUAL versão está no ar, não há como conferir prova nenhuma.
  //    Isso é falha do próprio sentinela — e falha de sentinela é grave, não
  //    é "não deu para verificar".
  if (!producao.commit) {
    return {
      codigo: "PRODUCAO_SEM_VERSAO",
      gravidade: "grave",
      resumo: "A produção está no ar, mas não diz qual versão está servindo.",
      acao: "Conferir se RAILWAY_GIT_COMMIT_SHA chega ao build (app/api/health/route.ts).",
      producaoSemProva: true,
    };
  }

  const commit = producao.commit;

  // 3 a 5. A classificação da PROVA é uma regra só, e ela mora em `julgarProva`.
  //        Aqui ela só é vestida de produção: mesma conclusão, texto de quem
  //        está olhando o que já está no ar.
  const prova = julgarProva({ ci, plataforma });

  switch (prova.codigo) {
    case "CI_REPROVOU":
      return {
        codigo: "CI_REPROVOU",
        gravidade: "grave",
        resumo: `A produção está servindo ${commit}, e a CI REPROVOU esse commit (${ci.conclusao}).`,
        acao: "Voltar a produção para o último commit aprovado, ou consertar e subir por cima — agora.",
        producaoSemProva: true,
      };

    case "APROVADO":
      return {
        codigo: "APROVADO",
        gravidade: "ok",
        resumo: `A produção está servindo ${commit}, e esse commit passou na CI.`,
        acao: "",
        producaoSemProva: false,
      };

    case "SEM_PROVA_PLATAFORMA_FORA":
      return {
        codigo: "SEM_PROVA_PLATAFORMA_FORA",
        gravidade: "atencao",
        resumo:
          `A produção está servindo ${commit} SEM prova de CI — o GitHub Actions está fora` +
          (plataforma.incidente ? ` (${plataforma.incidente})` : "") +
          ".",
        acao:
          "Rodar o portão à mão (npx tsc --noEmit, npx vitest run, npm run build) e, " +
          "quando o Actions voltar, disparar a CI neste commit para deixar a prova registrada.",
        producaoSemProva: true,
      };

    case "SEM_RESPOSTA_DO_GITHUB":
      return {
        codigo: "SEM_RESPOSTA_DO_GITHUB",
        gravidade: "grave",
        resumo:
          `A produção está servindo ${commit} e NÃO consegui perguntar ao GitHub se esse commit tem CI` +
          (ci.motivoDaFalha ? ` (${ci.motivoDaFalha})` : "") +
          ". Não sei se há prova — não estou dizendo que não há.",
        acao:
          `Conferir à mão em https://github.com/${REPO_DE_EXIBICAO}/actions?query=${commit} — ` +
          "o resultado que vale é o de DENTRO do CI, não o desta máquina, que pode " +
          "estar sem rota até o GitHub (proxy, rede ou limite de requisições). " +
          "Até alguém confirmar lá, tratar a produção como não verificada.",
        producaoSemProva: true,
      };

    case "SEM_PROVA":
      return {
        codigo: "SEM_PROVA",
        gravidade: "grave",
        // Aqui a pergunta FOI feita e o GitHub respondeu. Só por isso "nenhum
        // run foi criado" pode ser dito como fato — o caminho em que ninguém
        // perguntou saiu deste galho e virou SEM_RESPOSTA_DO_GITHUB.
        resumo:
          `A produção está servindo ${commit} e NÃO existe CI verde para esse commit` +
          (ci.houveRun
            ? ` (o run terminou em "${ci.conclusao}", sem provar nada).`
            : " (perguntei ao GitHub, e ele respondeu que nenhum run foi criado)."),
        acao: "Disparar a CI neste commit. Até ela fechar verde, tratar a produção como não verificada.",
        producaoSemProva: true,
      };
  }
}
