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
//
// EM 16/08/2026, DE NOVO: o PM leu "produção 47 commits atrás" e relatou ao
// Diretor "ninguém disparou deploy". Errado — havia um deploy BUILDING e três
// WAITING no Railway naquele instante; com quatro PMs empurrando peça, a
// produção fica PERPETUAMENTE atrás não por estar parada, mas porque a
// esteira publica mais devagar do que a casa entrega. "Atrasada e publicando"
// (esperar) e "atrasada e parada" (agir) são fatos opostos, com ações
// opostas, e o número de commits sozinho não distingue os dois. É por isso
// que `ATRASADA` virou três códigos, e a fila do Railway (`EstadoDaFila`)
// entrou no julgamento.

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

/**
 * O que se sabe sobre a fila de implantações do Railway no instante da
 * medição, ou por que não se sabe.
 *
 * Existe porque, em 16/08/2026, "produção 47 commits atrás" foi lido como
 * "produção parada" quando na verdade havia um deploy BUILDING e três
 * WAITING — a esteira estava funcionando, só mais devagar que o ritmo de
 * quatro PMs empurrando peça. O número de commits sozinho não distingue
 * "atrasada e publicando" (esperar) de "atrasada e parada" (agir) — são
 * fatos opostos, e só a fila responde qual dos dois é.
 */
export type EstadoDaFila = {
  /** true = a consulta ao Railway respondeu (mesmo que emVoo seja 0). */
  consultei: boolean;
  /** Quantas implantações estão em andamento agora (BUILDING, WAITING, ...). */
  emVoo: number;
  /** Status bruto da implantação mais recente, tal como o Railway devolveu. */
  statusMaisRecente: string | null;
  /**
   * Preenchido quando alguma implantação tem status que este medidor não
   * reconhece (nem EM_VOO, nem PARADO). Um status novo NUNCA pode ser
   * classificado como "parado" por omissão — isso produziria de volta o
   * alarme falso que este módulo existe para matar.
   */
  statusDesconhecido: string | null;
  /** Motivo pelo qual não foi possível consultar (sem token, API fora, timeout). */
  falha: string | null;
};

export type Gravidade = "ok" | "atencao" | "grave";

export type VereditoDaDistancia = {
  codigo:
    | "EM_DIA"
    | "ATRASADA_PUBLICANDO"
    | "ATRASADA_PARADA"
    | "ATRASADA_SEM_SABER"
    | "PRODUCAO_FORA"
    | "PRODUCAO_SEM_VERSAO"
    | "COMMIT_ALEM_DO_LIMITE"
    | "COMMIT_FORA_DA_BRANCH"
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
  /** O que foi apurado sobre a fila de deploy — quem consome `--json` precisa disto. */
  fila: EstadoDaFila | null;
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
  /**
   * true = `historico` veio com exatamente o limite pedido, então pode haver
   * mais commits além dele. Distingue "não achei o commit dentro da janela
   * que consultei" (COMMIT_ALEM_DO_LIMITE) de "vi a branch inteira e ele não
   * está nela" (COMMIT_FORA_DA_BRANCH) — dois fatos com ações diferentes que
   * hoje se achatam num "COMMIT_DESCONHECIDO" só.
   */
  historicoBateuNoLimite?: boolean;
  /** O que se sabe sobre a fila de deploy do Railway — ver `EstadoDaFila`. */
  fila?: EstadoDaFila | null;
}): VereditoDaDistancia {
  const { producao, historico, falhaAoOlhar } = input;
  const ressalva = input.ressalva ?? null;
  const historicoBateuNoLimite = input.historicoBateuNoLimite ?? false;
  const fila = input.fila ?? null;

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
      fila,
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
      fila,
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
      fila,
    };
  }

  const posicao = posicaoNoHistorico(producao.commit, historico);

  // 4. O commit da produção não aparece no histórico consultado. Isso cobria,
  //    achatado num "COMMIT_DESCONHECIDO" só, dois fatos com ação diferente:
  //      • o histórico veio CHEIO (bateu no limite de leitura) — o commit pode
  //        estar mais atrás do que fomos olhar. Ação: aumentar o limite.
  //      • o histórico veio PARCIAL (vimos a branch inteira) e mesmo assim o
  //        commit não está nela — não é questão de limite, é produção servindo
  //        outra branch, ou fetch local desatualizado. Ação: conferir a branch.
  //    Achatar os dois numa resposta só é a mesma doença do dia: o `null` que
  //    engolia três motivos, o selo "Falhou" para quatro causas.
  if (posicao === null) {
    if (historicoBateuNoLimite) {
      return {
        codigo: "COMMIT_ALEM_DO_LIMITE",
        medido: false,
        commitsAtras: null,
        faltando: [],
        gravidade: "atencao",
        resumo: `O commit em produção (${producao.commit}) não aparece nos ${historico.length} commits mais recentes consultados — pode estar mais atrás do que o limite de leitura.`,
        acao: "Refazer a checagem com um limite maior de histórico.",
        ressalva,
        fila,
      };
    }
    return {
      codigo: "COMMIT_FORA_DA_BRANCH",
      medido: false,
      commitsAtras: null,
      faltando: [],
      gravidade: "atencao",
      resumo: `O commit em produção (${producao.commit}) não aparece no histórico — e já vimos a branch inteira (${historico.length} commits), não é questão de limite.`,
      acao: "Conferir se a produção está apontando para a branch esperada, e rodar git fetch para descartar histórico local velho.",
      ressalva,
      fila,
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
      fila,
    };
  }

  // 6. Atrás: a distância é a posição, e o que falta é tudo que veio depois
  //    (os `posicao` primeiros do histórico, do mais novo para o mais antigo).
  //    A PARTIR DAQUI o número sozinho não decide mais nada — foi achatar
  //    "atrasada e publicando" e "atrasada e parada" num alarme só que
  //    produziu o susto de 16/08/2026 sobre um deploy que estava, na
  //    verdade, em andamento. Quem decide é a fila.
  const commitsAtras = posicao;
  const faltando = historico.slice(0, posicao);
  const distancia = resumoDeAtraso(commitsAtras, faltando);

  // 6a. Não sei se há deploy em voo — nem porque a consulta falhou, nem
  //     porque um status que este medidor não reconhece apareceu na fila.
  //     Nos dois casos, "não sei" continua sendo pior que "atrasada mas
  //     publicando" e melhor que alarmar "parada" sem prova.
  if (!fila || !fila.consultei) {
    const motivo = fila?.falha ?? "a fila de implantações não foi consultada";
    return {
      codigo: "ATRASADA_SEM_SABER",
      medido: true,
      commitsAtras,
      faltando,
      gravidade: "atencao",
      resumo: `${distancia} A distância foi medida, mas não foi possível checar se um deploy já está subindo (${motivo}).`,
      acao: "Conferir o painel do Railway a mão para saber se há deploy em andamento.",
      ressalva,
      fila,
    };
  }

  if (fila.statusDesconhecido) {
    return {
      codigo: "ATRASADA_SEM_SABER",
      medido: true,
      commitsAtras,
      faltando,
      gravidade: "atencao",
      resumo: `${distancia} A fila do Railway tem um status que este medidor não reconhece ("${fila.statusDesconhecido}") — não dá para confirmar se há deploy em andamento.`,
      acao: "Conferir o painel do Railway a mão: o status é novo e ainda não está classificado aqui.",
      ressalva,
      fila,
    };
  }

  // 6b. Atrasada, mas publicando: a esteira está funcionando, só mais devagar
  //     que o ritmo de quem empurra peça. Isto pede ESPERAR, não alarmar.
  if (fila.emVoo > 0) {
    return {
      codigo: "ATRASADA_PUBLICANDO",
      medido: true,
      commitsAtras,
      faltando,
      gravidade: "atencao",
      resumo: `${distancia} Mas há ${fila.emVoo} implantação${fila.emVoo === 1 ? "" : "ões"} em andamento no Railway (status mais recente: ${fila.statusMaisRecente ?? "?"}) — a produção deve alcançar sozinha.`,
      acao: "Esperar a fila de deploy processar; conferir de novo em alguns minutos.",
      ressalva,
      fila,
    };
  }

  // 6c. Atrasada e parada: a fila foi consultada, nada está em voo. Este é o
  //     único caso que merece o alarme vermelho — pede agir agora.
  return {
    codigo: "ATRASADA_PARADA",
    medido: true,
    commitsAtras,
    faltando,
    gravidade: "grave",
    resumo: `${distancia} E nenhum deploy está em andamento no Railway agora.`,
    acao: "Disparar (ou destravar) o deploy da branch em produção agora — não esperar o próximo push.",
    ressalva,
    fila,
  };
}
