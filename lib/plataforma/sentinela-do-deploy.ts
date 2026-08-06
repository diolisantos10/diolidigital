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
  /** Existe ALGUM run de CI para este commit? */
  houveRun: boolean;
  /** Conclusão do run mais recente. null quando não houve run. */
  conclusao: ConclusaoDeCI | null;
  /** Link do run, para quem for conferir. */
  url?: string | null;
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

  // 3. A CI rodou e disse NÃO — e mesmo assim isso está no ar.
  if (ci.houveRun && ci.conclusao && REPROVA.has(ci.conclusao)) {
    return {
      codigo: "CI_REPROVOU",
      gravidade: "grave",
      resumo: `A produção está servindo ${commit}, e a CI REPROVOU esse commit (${ci.conclusao}).`,
      acao: "Voltar a produção para o último commit aprovado, ou consertar e subir por cima — agora.",
      producaoSemProva: true,
    };
  }

  // 4. A CI aprovou. Único caminho verde.
  if (ci.houveRun && ci.conclusao && APROVA.has(ci.conclusao)) {
    return {
      codigo: "APROVADO",
      gravidade: "ok",
      resumo: `A produção está servindo ${commit}, e esse commit passou na CI.`,
      acao: "",
      producaoSemProva: false,
    };
  }

  // 5. Tudo o mais é AUSÊNCIA DE PROVA — e ausência de prova não é aprovação.
  //    Cai aqui tanto "não houve run nenhum" quanto "houve run que morreu no
  //    meio" (cancelled/stale/skipped). Nos dois casos ninguém provou nada.
  if (!plataforma.actionsOperacional) {
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
  }

  return {
    codigo: "SEM_PROVA",
    gravidade: "grave",
    resumo:
      `A produção está servindo ${commit} e NÃO existe CI verde para esse commit` +
      (ci.houveRun ? ` (o run terminou em "${ci.conclusao}", sem provar nada).` : " (nenhum run foi criado)."),
    acao: "Disparar a CI neste commit. Até ela fechar verde, tratar a produção como não verificada.",
    producaoSemProva: true,
  };
}
