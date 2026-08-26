// fases.ts — A ESTEIRA: a única verdade sobre em que etapa um projeto está.
//
// Por que este arquivo existe:
//
// O sistema tinha departamentos, agentes, tarefas e entregáveis — mas ninguém
// sabia responder "e aí, como está o projeto?". Cada tela contava um pedaço
// diferente, e o cliente abria o portal sem entender nada. Aqui a resposta é
// UMA SÓ, calculada do dado real, e servida em duas linguagens:
//
//   • paraEquipe — o que quem trabalha aqui precisa saber para agir
//   • paraCliente — a mesma verdade, sem jargão, para quem nunca viu o sistema
//
// A regra que sustenta tudo: a fase é DERIVADA, nunca digitada. Ninguém "marca"
// que o projeto está em produção — ele está em produção porque os agentes estão
// produzindo. Campo de status escrito à mão mente em duas semanas; dado derivado
// não tem como mentir.
//
// Determinístico e puro: sem IA, sem banco, sem rede. Recebe o retrato, devolve
// a leitura. É isso que permite a mesma função alimentar a tela da agência e o
// portal do cliente sem risco de divergirem.

export type FaseId =
  | "sondagem"
  | "orcamento"
  | "negociacao"
  | "desenho"
  | "aguardando_pagamento"
  | "direcao"
  | "producao"
  | "aguardando_cliente"
  | "revisao_interna"
  | "aprovacao_cliente"
  | "implementacao"
  | "ciclo"
  | "encerrado";

/** Quem tem a bola agora. Sem dono, a etapa não anda. */
export type Responsavel = "sdr" | "pm" | "agentes" | "cliente" | "qualidade";

export type Semaforo = "andando" | "esperando" | "travado" | "concluido";

export interface RetratoDoProjeto {
  /** Status da solicitação de origem (new, qualified, accepted…). */
  statusDaSolicitacao?: string | null;
  /** O cliente já aceitou a proposta? */
  propostaAceita: boolean;
  /**
   * O PAGAMENTO deste pedido está confirmado?
   *
   * Lido da MESMA testemunha que LIBERA a produção (`PagamentoConfirmado`, a
   * tabela que `conferirPagamento` consulta). Ler outra fonte aqui faria a
   * etapa do cliente divergir da trava — que é exatamente o defeito que este
   * campo veio fechar.
   *
   * `undefined` = ninguém mediu, e isso NÃO é `false`. Ver o ramo em `lerFase`.
   */
  pagamentoConfirmado?: boolean;
  /** A direção (estratégia/conceito) já foi aprovada pelo cliente? */
  direcaoAprovadaEm?: Date | string | null;
  /** As entregas já foram apresentadas ao cliente de uma vez? */
  apresentadoEm?: Date | string | null;
  /** O cliente aprovou o pacote apresentado? */
  aprovadoPeloClienteEm?: Date | string | null;
  /** idle | pending | running | done | failed */
  execucao?: string | null;
  /**
   * ── O CARIMBO DA PRODUÇÃO CONCLUÍDA (Fase 1, 26/08/2026) ─────────────────
   *
   * Quando uma passada de produção terminou com TUDO resolvido. Derivado de
   * `executionFinishedAt` com `executionError` vazio — o único par que a casa
   * grava e não apaga.
   *
   * ── POR QUE PRECISOU EXISTIR ─────────────────────────────────────────────
   *
   * A 10ª volta consertou a barra que caía de 50% para 25% pondo um PISO
   * derivado dos carimbos. A régua de propriedade escrita nesta fase
   * (`o-andamento-e-monotonico.test.ts`) achou o conserto INCOMPLETO: o degrau
   * `revisao_interna` (63%) não sai de carimbo nenhum — sai de CONTAGEM
   * (`tarefas.entregues === tarefas.total`, ou `execucao === "done"`). O mesmo
   * reinício de contêiner que produziu o defeito original leva a barra de
   * **63% para 50%**, pelo mesmo caminho e sem que nada fique vermelho.
   *
   * Contagem não pode virar piso — é ela que oscila. Carimbo pode. Este é o
   * carimbo que faltava, e ele já estava no banco: ninguém o estava lendo.
   *
   * ⚠️ Fail-open para baixo, como o resto do piso: leitura que falha vira
   * `undefined` e a barra fica exatamente como sempre foi. Ausência de carimbo
   * não promove ninguém.
   */
  producaoConcluidaEm?: Date | string | null;
  tarefas: { total: number; entregues: number; produzindo: number; bloqueadas: number };
  entregaveis: {
    total: number;
    emRevisao: number;
    comRessalva: number;
    aprovados: number;
    /** Quantas foram gravadas SEM que nenhum árbitro as olhasse
     *  (`quality_nao_auditado`). Estava no banco e não aparecia em lugar
     *  nenhum: não dava para responder "quantas foram ao cliente sem árbitro?"
     *  — que é a única pergunta que torna a indisponibilidade não-bloqueante
     *  aceitável. Opcional só para não quebrar retrato montado à mão em teste. */
    semAuditoria?: number;
    // ── AS TRÊS PALAVRAS, NA CONTA (25/08/2026) ────────────────────────────
    //
    // Farol 27, rodada 5: 8 chamadas ao juiz `gpt-4o` em HTTP 429, 10
    // julgamentos vindos do MESMO `claude-haiku-4-5` que escreveu as peças, e
    // esta conta não mudou uma linha. O placar dizia que houve auditoria.
    //
    // "Auditada" era uma palavra só para três coisas diferentes. Agora são
    // três, e a soma delas NUNCA é apresentada como um número só:
    /** Julgadas por OUTRO modelo, que não o autor. É a única que conta como
     *  auditoria de verdade. */
    julgadasPorArbitroIndependente?: number;
    /** Julgadas pelo PRÓPRIO autor. Vale como freio (reprovação bloqueia),
     *  nunca como aprovação — e nunca pode ser somada à conta de cima. */
    autojulgadas?: number;
    /** Decididas por uma PESSOA pela tela. Quarta coisa, quarta coluna: não é
     *  árbitro independente, não é auto-julgamento, não é ausência. */
    decididasPorPessoa?: number;
    /** Peças gravadas antes de 25/08/2026, quando a casa não media quem
     *  julgava. NÃO MEDIDO nunca é verde: fica na própria coluna em vez de
     *  engordar qualquer uma das outras. */
    arbitragemNaoMedida?: number;
  };
  /** Pedidos de material abertos e ainda sem resposta do cliente. */
  pedidosAbertos: number;
  /**
   * ── QUANTOS DESSES PEDIDOS O CLIENTE DE FATO RECEBEU ─────────────────────
   *
   * `pedidosAbertos` conta o que está PENDENTE no banco. Não é a mesma coisa
   * que o cliente ter sido perguntado: `MaterialRequest` nasce com
   * `askedClientAt` vazio, e quem o preenche é `cobrarCliente`.
   *
   * Medido na produção em 24/08/2026 (case Farol 27): CINCO pedidos abertos,
   * `askedClientAt: null` nos cinco, `pendencias: []` na visão do cliente — e a
   * etapa dizendo, na cara dele, *"Responder os 5 pedidos que te mandamos na
   * conversa"*. Nada tinha sido mandado. Cobrar o que nunca se pediu é pior do
   * que não pedir: manda o cliente procurar uma mensagem que não existe.
   *
   * OPCIONAL, e o `undefined` é deliberado — a mesma regra de
   * `decisoesDisponiveis`: retrato montado à mão que ainda não mede isto
   * continua lendo a fase antiga. O que NÃO se faz é escrever `0` sem medir.
   */
  pedidosCobrados?: number;
  /** Existe ciclo mensal em andamento? */
  cicloAberto?: boolean;
  /** O cliente já conectou o Instagram? Sem isso a agência não publica nada — e
   *  dizer que está publicando seria mentira na cara do cliente. */
  redesConectadas?: boolean;
  /** Quantos posts já foram efetivamente ao ar neste projeto. */
  postsPublicados?: number;
  /** Posts aprovados esperando a data chegar. */
  postsAgendados?: number;
  /**
   * ── QUANTAS ENTREGAS O CLIENTE PODE DE FATO DECIDIR AGORA ────────────────
   *
   * Aprovações pendentes, visíveis ao cliente, **com corpo** — a mesma conta
   * que o portal usa para decidir se um card ganha os botões de decisão
   * (`semConteudo`, invertido). Quem responde é `retratoDoPacote`
   * (`lib/agency/esteira/pacote.ts`).
   *
   * Por que precisou existir (CEO, 08/08/2026): a fase "Tudo pronto para você
   * ver" saía de `apresentadoEm` sozinho — um carimbo que só diz "o PM
   * apresentou", nunca "há o que ver". No portal do CityJobs isso virou "O
   * pacote inteiro está pronto para você" + "Aprovar tudo" no topo, com as
   * TRÊS entregas logo abaixo dizendo "material ainda não subiu".
   *
   * OPCIONAL, e o `undefined` é deliberado: retrato montado à mão em teste (e
   * qualquer chamador que ainda não meça isto) continua lendo a fase antiga.
   * Fosse obrigatório, todo teste existente teria de ser reescrito, e a
   * pressão seria escrever `0` sem medir — que faria "não sei" virar "não há",
   * exatamente o defeito que este campo existe para matar.
   */
  decisoesDisponiveis?: number;
}

export interface LeituraDaFase {
  fase: FaseId;
  /**
   * ── A PORTA DE APROVAR A DIREÇÃO, MEDIDA NO ESTADO ───────────────────────
   *
   * `true` quando a direção deste projeto ainda espera o aval do cliente — e é
   * ISTO que as telas usam para desenhar o botão.
   *
   * Por que precisou existir (24/08/2026, case Farol 27): as duas telas do
   * portal derivavam o botão do TEXTO da etapa
   * (`etapa.includes("confirme o caminho")`). O projeto tinha pedido de
   * material aberto, `lerFase` devolveu a etapa "Precisamos de uma coisa sua"
   * — que vem ANTES do portão de direção nesta mesma função — e o botão
   * simplesmente sumiu, com a conversa dizendo ao cliente *"é só aprovar"*. A
   * rota pública aceitava a aprovação o tempo todo: faltava a porta, não a
   * fechadura.
   *
   * Verdade escrita em dois lugares já está errada em um deles. A frase é
   * redação; o estado é fato. Mesmo molde de `pacote.pedeAprovacao`, que esta
   * casa já aplicou ao botão do pacote em 08/08/2026 pelo mesmo motivo.
   */
  precisaAprovarDirecao: boolean;
  semaforo: Semaforo;
  responsavel: Responsavel;
  /** 0–100. Quanto do caminho até a entrega ao cliente já andou. */
  progresso: number;
  paraEquipe: {
    titulo: string;
    /** O que está acontecendo agora, em uma frase. */
    agora: string;
    /** A próxima coisa que faz o projeto andar. */
    proximoPasso: string;
  };
  paraCliente: {
    titulo: string;
    agora: string;
    /** O que se espera do cliente, quando é a vez dele. Vazio quando não é. */
    oQueEsperamosDeVoce: string;
  };
}

const NOME_DO_RESPONSAVEL: Record<Responsavel, string> = {
  sdr: "Atendimento",
  pm: "Gerente de projeto",
  agentes: "Time de produção",
  cliente: "Você",
  qualidade: "Qualidade",
};

export function nomeDoResponsavel(r: Responsavel): string {
  return NOME_DO_RESPONSAVEL[r];
}

/** A ordem da esteira — usada pela barra de etapas nas duas telas. */
export const TRILHA: { fase: FaseId; curto: string; curtoCliente: string }[] = [
  { fase: "sondagem",          curto: "Briefing",     curtoCliente: "Conversa inicial" },
  { fase: "orcamento",         curto: "Orçamento",    curtoCliente: "Proposta" },
  { fase: "desenho",           curto: "Desenho",      curtoCliente: "Planejamento" },
  { fase: "direcao",           curto: "Direção",      curtoCliente: "Direção" },
  { fase: "producao",          curto: "Produção",     curtoCliente: "Criação" },
  { fase: "revisao_interna",   curto: "Revisão",      curtoCliente: "Revisão" },
  { fase: "aprovacao_cliente", curto: "Aprovação",    curtoCliente: "Sua aprovação" },
  { fase: "implementacao",     curto: "No ar",        curtoCliente: "No ar" },
  { fase: "ciclo",             curto: "Operação",     curtoCliente: "Acompanhamento" },
];

/** Índice na trilha. Fases fora da trilha (negociação, espera) herdam a anterior. */
const POSICAO: Partial<Record<FaseId, number>> = (() => {
  const m: Partial<Record<FaseId, number>> = {};
  TRILHA.forEach((t, i) => { m[t.fase] = i; });
  m.negociacao = m.orcamento;
  // ── ESPERAR MATERIAL NÃO É ESTAR PRODUZINDO (Fase 1, 26/08/2026) ─────────
  //
  // Herdava a posição da PRODUÇÃO (50%). Mas o ramo do material devolve ANTES
  // do portão de direção em `lerFase` — ou seja, um projeto que ainda nem tem
  // direção aprovada lia 50% só porque havia pedido de material aberto. E aí,
  // quando o cliente RESPONDIA, o pedido fechava e a leitura caía para o portão
  // de direção: **50% → 38%**. O cliente fazia a parte dele e a barra andava
  // para trás. Achado pela régua de propriedade (`o-andamento-e-monotonico`).
  //
  // Herdando o DESENHO, o número antes da direção é o honesto (25%) e o de
  // depois continua 50% — porque aí o piso do carimbo `direcaoAprovadaEm`
  // segura, que é exatamente o trabalho do piso.
  m.aguardando_cliente = m.desenho;
  // Fora da trilha visível de propósito: o cliente não precisa de um degrau
  // "pagamento" no caminho dele. Ele herda a posição do DESENHO — que é onde a
  // esteira de fato está parada enquanto o dinheiro não entra.
  m.aguardando_pagamento = m.desenho;
  m.encerrado = TRILHA.length - 1;
  return m;
})();

export function posicaoNaTrilha(fase: FaseId): number {
  return POSICAO[fase] ?? 0;
}

/**
 * O PISO DA TRILHA — o degrau mais avançado que os CARIMBOS já provam.
 *
 * Só entram fatos irreversíveis, e é isso que faz o piso ser monótono sem
 * guardar estado em lugar nenhum: um carimbo de data não volta atrás. Contagem
 * (`tarefas.produzindo`, `execucao`) NÃO entra — é justamente ela que oscila, e
 * foi a oscilação dela que fez a barra do cliente andar para trás.
 *
 * ⚠️ Fail-open para baixo: sem carimbo nenhum o piso é 0 e a leitura fica
 * exatamente como sempre foi. Ausência de carimbo não promove ninguém.
 */
export function pisoDaTrilha(r: RetratoDoProjeto): number {
  let piso = 0;
  const nao_abaixo_de = (fase: FaseId) => { piso = Math.max(piso, posicaoNaTrilha(fase)); };

  if (r.propostaAceita) nao_abaixo_de("desenho");
  // Direção aprovada é botão que o CLIENTE apertou: a etapa de desenho acabou.
  if (preenchido(r.direcaoAprovadaEm)) nao_abaixo_de("producao");
  // Produção concluída é passada que TERMINOU com tudo resolvido — o degrau da
  // revisão interna deixou de depender de contagem. Ver
  // `RetratoDoProjeto.producaoConcluidaEm`.
  if (preenchido(r.producaoConcluidaEm)) nao_abaixo_de("revisao_interna");
  // Apresentado é o pacote na mão dele.
  if (preenchido(r.apresentadoEm)) nao_abaixo_de("aprovacao_cliente");
  if (preenchido(r.aprovadoPeloClienteEm)) nao_abaixo_de("implementacao");
  if ((r.postsPublicados ?? 0) > 0) nao_abaixo_de("implementacao");
  if (r.cicloAberto) nao_abaixo_de("ciclo");
  return piso;
}

function preenchido(v: Date | string | null | undefined): boolean {
  return v !== null && v !== undefined && String(v).trim().length > 0;
}

/**
 * Lê a fase do projeto a partir do retrato.
 *
 * A ordem dos testes é do FIM para o COMEÇO de propósito: um projeto já
 * implementado não deve ser reclassificado como "em produção" só porque alguém
 * abriu uma tarefa nova. O estado mais avançado alcançado é o que vale.
 */
export function lerFase(r: RetratoDoProjeto): LeituraDaFase {
  // ── A PORTA DE DIREÇÃO É ESTADO, NÃO REDAÇÃO ──────────────────────────────
  // Calculada UMA vez, no topo, e carimbada em TODAS as saídas — inclusive nas
  // que falam de outra coisa. Era exatamente aí que o botão se perdia: a etapa
  // "Precisamos de uma coisa sua" (material) devolve antes do portão de
  // direção, e a direção continuava pendente sem que a tela tivesse como saber.
  // A mesma condição do portão, escrita uma vez só.
  const precisaAprovarDirecao =
    r.propostaAceita && r.tarefas.total > 0 && !preenchido(r.direcaoAprovadaEm);

  // ── ANDAMENTO NÃO ANDA PARA TRÁS NA FRENTE DO CLIENTE (8ª volta) ──────────
  //
  // MEDIDO EM PRODUÇÃO, 26/08/2026: às 08:49 o portal dizia "Criando o seu
  // material · 50%"; às 08:55, "Montando seu planejamento · 25%". O cliente viu
  // a barra andar PARA TRÁS.
  //
  // A causa não é este arquivo estar errado sobre o AGORA — é ele não ter
  // memória do ANTES. Um reinício de contêiner às 08:54 pôs `executionStatus`
  // em `pending` e zerou `tarefas.produzindo`; o ramo de produção deixou de
  // casar, e a leitura escorregou para o ramo do DESENHO, que vem depois na
  // ordem de testes mas ANTES na trilha. Tecnicamente coerente, e mentiroso.
  //
  // O piso não é memória guardada em lugar nenhum — seria uma segunda verdade a
  // divergir. Ele é DERIVADO dos carimbos, que são irreversíveis por natureza:
  // direção aprovada não desaprova, apresentação não desapresenta. Enquanto a
  // fase corrente estiver ATRÁS do que os carimbos provam, quem manda é o
  // carimbo.
  const piso = pisoDaTrilha(r);

  const montar = (
    fase: FaseId,
    semaforo: Semaforo,
    responsavel: Responsavel,
    equipe: LeituraDaFase["paraEquipe"],
    cliente: LeituraDaFase["paraCliente"],
  ): LeituraDaFase => ({
    fase, semaforo, responsavel,
    precisaAprovarDirecao,
    progresso: Math.round((Math.max(posicaoNaTrilha(fase), piso) / (TRILHA.length - 1)) * 100),
    paraEquipe: equipe, paraCliente: cliente,
  });

  // ── Operação contínua: o cliente aprovou e a relação virou rotina ──────────
  //
  // As frases daqui para baixo NÃO afirmam publicação sem que ela tenha
  // acontecido. Até 02/08/2026 o sistema dizia "publicando, medindo e
  // reportando" e "seu conteúdo está no ar" para todo cliente com ciclo aberto
  // — inclusive os que nunca tinham conectado uma rede. Era falso por
  // construção, e o cliente não tem como saber que é falso.
  const noAr = (r.postsPublicados ?? 0) > 0;
  const semRede = r.redesConectadas === false;

  if (r.cicloAberto) {
    if (semRede && !noAr) {
      return montar("ciclo", "esperando", "cliente",
        { titulo: "Operação parada na conexão",
          agora: "O ciclo está aberto, mas nenhuma rede do cliente está conectada — nada pode ir ao ar.",
          proximoPasso: "Cobrar a conexão do Instagram. Sem ela, o ciclo não produz resultado." },
        { titulo: "Falta conectar seu Instagram",
          agora: "Seu conteúdo está pronto e aprovado, mas ainda não conseguimos publicar.",
          oQueEsperamosDeVoce: "Conecte seu Instagram no portal para a gente começar a publicar." });
    }
    return montar("ciclo", "andando", "agentes",
      { titulo: "Operação em andamento",
        agora: noAr
          ? `Ciclo rodando: ${r.postsPublicados} post(s) no ar${(r.postsAgendados ?? 0) > 0 ? `, ${r.postsAgendados} agendado(s)` : ""}.`
          : "Ciclo aberto. Ainda nada publicado — o calendário está agendado e esperando a data.",
        proximoPasso: "Fechar o ciclo com o relatório e abrir o próximo." },
      { titulo: "Acompanhamento",
        agora: noAr
          ? "Seu conteúdo está no ar e a gente está medindo os resultados."
          : "Seu calendário está aprovado e agendado. Assim que a primeira data chegar, começamos a publicar.",
        oQueEsperamosDeVoce: "" });
  }

  if (preenchido(r.aprovadoPeloClienteEm)) {
    if (semRede) {
      return montar("implementacao", "esperando", "cliente",
        { titulo: "Aprovado, mas sem onde publicar",
          agora: "O cliente aprovou e nenhuma rede está conectada.",
          proximoPasso: "Cobrar a conexão do Instagram antes da primeira data do calendário." },
        { titulo: "Falta conectar seu Instagram",
          agora: "Tudo aprovado! Só falta uma coisa para colocarmos no ar.",
          oQueEsperamosDeVoce: "Conecte seu Instagram no portal — é o último passo." });
    }
    return montar("implementacao", "andando", "agentes",
      { titulo: "Implementação",
        agora: noAr ? "O cliente aprovou. As entregas já começaram a ir ao ar." : "O cliente aprovou. O calendário está agendado.",
        proximoPasso: "Publicar tudo e abrir o primeiro ciclo mensal." },
      { titulo: "Colocando no ar",
        agora: noAr ? "Tudo aprovado! Já começamos a publicar." : "Tudo aprovado! Seu calendário está montado e as publicações começam na primeira data.",
        oQueEsperamosDeVoce: "" });
  }

  // ── Apresentado e esperando a palavra do cliente ──────────────────────────
  if (preenchido(r.apresentadoEm)) {
    // ⚠️ 08/08/2026 — APRESENTADO NÃO É O MESMO QUE PRONTO.
    //
    // `apresentadoEm` diz que o PM apertou "apresentar". Não diz que existe uma
    // linha de conteúdo do outro lado. No portal do CityJobs os dois se
    // separaram na cara do CEO: o topo dizia "O pacote inteiro está pronto para
    // você" com o botão "Aprovar tudo", e as três entregas logo abaixo diziam
    // "material ainda não subiu". Clicar aprovaria NADA, às cegas.
    //
    // Quando a conta EXISTE e dá zero, a bola volta para a agência: o cliente
    // não é cobrado por uma decisão que ele não tem como tomar, e o botão some
    // junto — as duas telas derivam o botão desta etapa.
    //
    // `undefined` (ninguém mediu) mantém a leitura antiga de propósito: ausência
    // de informação não é informação, e inventar "zero" aqui esconderia o
    // pacote legítimo de todo chamador que ainda não passa o número.
    if (r.decisoesDisponiveis === 0) {
      return montar("revisao_interna", "andando", "agentes",
        { titulo: "Apresentado, mas sem nada para o cliente decidir",
          agora: "O pacote foi apresentado e NENHUMA aprovação pendente tem corpo — o cliente não tem o que assinar.",
          proximoPasso: "Terminar o material das entregas pendentes. Enquanto não houver corpo, o portal não pede aprovação." },
        { titulo: "Ainda estamos produzindo",
          agora: "Estas entregas ainda não têm material para você ver. Assim que a primeira ficar pronta, ela aparece aqui para a sua decisão.",
          oQueEsperamosDeVoce: "" });
    }
    return montar("aprovacao_cliente", "esperando", "cliente",
      { titulo: "Na mão do cliente",
        agora: "O pacote foi apresentado. Aguardando aprovação.",
        proximoPasso: "Se demorar, o gerente de projeto faz o follow-up." },
      { titulo: "Tudo pronto para você ver",
        agora: "Terminamos e organizamos tudo. Está tudo na aba de aprovações.",
        oQueEsperamosDeVoce: "Dê uma olhada e aprove, ou peça os ajustes que quiser." });
  }

  // ── Produção terminada, o PM está montando a apresentação ─────────────────
  const produziuTudo = r.tarefas.total > 0 && r.tarefas.entregues === r.tarefas.total;
  if (produziuTudo || (r.entregaveis.total > 0 && r.execucao === "done")) {
    const comRessalva = r.entregaveis.comRessalva > 0;
    return montar("revisao_interna", comRessalva ? "travado" : "andando", comRessalva ? "qualidade" : "pm",
      { titulo: "Revisão interna",
        agora: comRessalva
          ? `Todas as entregas ficaram prontas, mas ${r.entregaveis.comRessalva} tem ressalva da Qualidade.`
          : "Todas as entregas ficaram prontas e passaram pela Qualidade.",
        proximoPasso: comRessalva
          ? "Resolver as ressalvas antes de mostrar ao cliente."
          : "O gerente de projeto consolida e apresenta tudo de uma vez." },
      { titulo: "Conferindo tudo antes de te mostrar",
        agora: "Terminamos a produção e estamos na conferência final.",
        oQueEsperamosDeVoce: "" });
  }

  // ── O DINHEIRO VEM ANTES DO AVAL, E ISSO PASSOU A SER LIDO AQUI ──────────
  //
  // ═══════════════════════════════════════════════════════════════════════
  // A TERCEIRA CONTRADIÇÃO DO PORTAL (cliente oculto, 6ª rodada)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Medido: `/api/portal/esteira` dizia ao cliente *"Ainda estamos
  // produzindo"* enquanto `/api/portal/projetos` dizia *"Esperando a sua
  // aprovação"* — no MESMO projeto, no MESMO portal, na mesma tela.
  //
  // A causa não era um bug de leitura: eram **dois escritores da mesma
  // verdade**. `retrato.ts`/`lerFase` (aqui) alimentava a esteira; e
  // `/api/portal/projetos` tinha um `etapaLegivel()` local, uma segunda
  // gramática que ninguém tinha declarado ser uma segunda gramática. Cada uma
  // sabia algo que a outra não sabia: esta aqui via as decisões disponíveis e
  // os pedidos cobrados; a de lá via o PAGAMENTO — e nenhuma via as duas.
  //
  // Verdade escrita em dois lugares já está errada em um deles. O conserto é
  // matar o segundo escritor e trazer para cá o que só ele sabia: o pagamento.
  //
  // ── E ELE VEM ANTES DO MATERIAL, QUE É POSIÇÃO E NÃO GOSTO ──────────────
  //
  // Medido na mesma volta: com o projeto NÃO PAGO, a esteira dizia ao cliente
  // *"Precisamos de uma coisa sua — a criação está em andamento, mas faltou
  // material"* e pedia CINCO materiais. Nada estava em andamento: sem
  // pagamento não se produz uma linha. A casa cobrava do cliente o trabalho
  // dele antes de a esteira poder fazer o dela, e dizia que estava criando.
  //
  // Os ramos daqui para baixo TODOS descrevem produção. Produção não começa
  // antes do dinheiro — é a mesma ordem que a esteira cobra de verdade
  // (`conferirPagamento`, no portão da arte). A leitura tinha de dizer o que
  // de fato trava agora, e o que trava agora é o pagamento.
  //
  // ⚠️ FAIL-CLOSED: `undefined` (ninguém mediu o pagamento) NÃO entra neste
  // ramo. Ausência de informação não é informação — o chamador que ainda não
  // passa o número mantém a leitura antiga, e nunca ganha de graça um
  // "aguardando pagamento" que não foi medido.
  if (r.propostaAceita && r.pagamentoConfirmado === false) {
    return montar("aguardando_pagamento", "esperando", "cliente",
      { titulo: "Parado esperando o pagamento",
        agora: "A proposta foi aceita e nenhum pagamento foi confirmado — a produção não começa sem isso.",
        proximoPasso: "Confirmar o pagamento com o cliente. Enquanto não entrar, nada é produzido." },
      { titulo: "Aguardando o pagamento para começar",
        agora: "Está tudo combinado! Assim que o pagamento for confirmado, a produção começa.",
        oQueEsperamosDeVoce: "Concluir o pagamento para a gente começar." });
  }

  // ── Produção travada esperando material do cliente ────────────────────────
  //
  // ⚠️ FALHA FECHADA: SÓ SE COBRA O QUE FOI PEDIDO (24/08/2026).
  //
  // A bola só é do CLIENTE pelos pedidos que efetivamente chegaram até ele
  // (`pedidosCobrados`, derivado de `askedClientAt`). Pedido aberto no banco e
  // nunca enviado é bola da AGÊNCIA — e dizer "responda os 5 pedidos que te
  // mandamos" sobre mensagens que nunca saíram manda o cliente procurar o que
  // não existe. Ver `RetratoDoProjeto.pedidosCobrados`.
  //
  // `undefined` (ninguém mediu) mantém a leitura antiga de propósito: ausência
  // de informação não é informação, e assumir "zero cobrados" esconderia a
  // espera legítima de todo chamador que ainda não passa o número.
  const cobrados = r.pedidosCobrados ?? r.pedidosAbertos;
  if (cobrados > 0 || (r.pedidosCobrados === undefined && r.tarefas.bloqueadas > 0)) {
    const quantos = Math.max(cobrados, r.tarefas.bloqueadas);
    return montar("aguardando_cliente", "travado", "cliente",
      { titulo: "Parado esperando o cliente",
        agora: `${quantos} pedido(s) de material sem resposta. A produção não anda sem isso.`,
        proximoPasso: "O gerente de projeto cobra o material numa mensagem só." },
      { titulo: "Precisamos de uma coisa sua",
        agora: "A criação está em andamento, mas faltou material para continuar.",
        oQueEsperamosDeVoce: `Responder ${quantos === 1 ? "o pedido" : `os ${quantos} pedidos`} que te mandamos na conversa.` });
  }

  // Há material pendente, mas NENHUM pedido saiu daqui para o cliente. A
  // produção está parada e a bola é nossa: quem tem de agir é a agência, que
  // precisa MANDAR o pedido. O cliente não é cobrado por uma mensagem que não
  // recebeu — e a parada não vira silêncio, vira uma etapa com dono.
  if (r.pedidosAbertos > 0 || r.tarefas.bloqueadas > 0) {
    const quantos = Math.max(r.pedidosAbertos, r.tarefas.bloqueadas);
    return montar("aguardando_cliente", "travado", "pm",
      { titulo: "Material pendente que NUNCA foi pedido ao cliente",
        agora: `${quantos} pedido(s) de material abertos e nenhum deles chegou ao cliente (\`askedClientAt\` vazio).`,
        proximoPasso: "Mandar o pedido ao cliente numa mensagem só. Enquanto não sair, não se cobra resposta." },
      { titulo: "Estamos preparando o que falta",
        agora: "A criação está em andamento. Se precisarmos de algo seu, a gente te manda o pedido por aqui.",
        oQueEsperamosDeVoce: "" });
  }

  // ── Produção rodando ──────────────────────────────────────────────────────
  if (r.execucao === "running" || r.tarefas.produzindo > 0) {
    const feitas = r.tarefas.entregues;
    const total = r.tarefas.total;
    return montar("producao", "andando", "agentes",
      { titulo: "Produção rodando",
        agora: total > 0
          ? `${feitas} de ${total} entregas prontas. O time está produzindo o resto.`
          : "Os agentes estão produzindo as entregas do projeto.",
        proximoPasso: "Quando todas ficarem prontas, a Qualidade audita e o PM apresenta." },
      { titulo: "Criando o seu material",
        agora: total > 0
          ? `Já concluímos ${feitas} de ${total} entregas. O resto está sendo criado agora.`
          : "Nosso time está criando o material do seu projeto.",
        oQueEsperamosDeVoce: "" });
  }

  if (r.execucao === "failed") {
    return montar("producao", "travado", "pm",
      { titulo: "Produção travada",
        agora: "A produção falhou e não retomou sozinha.",
        proximoPasso: "Ver o erro na tela do projeto e mandar rodar de novo." },
      { titulo: "Criando o seu material",
        agora: "Estamos trabalhando no seu projeto.",
        oQueEsperamosDeVoce: "" });
  }

  // ── O portão de direção: aprovar barato antes de produzir caro ────────────
  // Só existe DEPOIS que o PM desenhou (há tarefas). Antes disso não há direção
  // para aprovar — o cliente receberia um pedido de aval sobre nada.
  if (r.propostaAceita && r.tarefas.total > 0 && !preenchido(r.direcaoAprovadaEm)) {
    return montar("direcao", "esperando", "cliente",
      { titulo: "Direção na mão do cliente",
        agora: "A estratégia foi enviada. A produção só começa depois do aval.",
        proximoPasso: "Assim que o cliente aprovar a direção, a produção dispara sozinha." },
      { titulo: "Confirme o caminho",
        agora: "Montamos a direção do seu projeto: para quem, com que tom e o que vamos criar.",
        oQueEsperamosDeVoce: "Aprovar a direção. Mudar agora é rápido; depois da produção, custa caro." });
  }

  // ── Direção JÁ APROVADA e a produção não está rodando ────────────────────
  //
  // O outro lado do piso, e o que de fato foi medido: com a direção aprovada, o
  // projeto não volta a ser "Montando seu planejamento" — aquela etapa já
  // passou, e o cliente já apertou o botão que a encerrou. Dizer "Fechamos
  // negócio! Agora estamos desenhando" a quem aprovou a direção meia hora antes
  // não é só um número menor: é uma frase falsa.
  //
  // O dono é o PM, não o cliente e não os agentes: produção liberada e parada é
  // trabalho da casa, e a próxima ação é retomar (o que o relógio faz sozinho —
  // `retomarProducao`). O semáforo é "esperando", nunca "andando": afirmar que
  // anda o que está parado é a mentira que a leitura toda existe para não contar.
  if (r.propostaAceita && preenchido(r.direcaoAprovadaEm)) {
    return montar("producao", "esperando", "pm",
      { titulo: "Produção liberada e parada",
        agora: `A direção foi aprovada pelo cliente e a produção não está rodando (execução: ${r.execucao ?? "não medida"}).`,
        proximoPasso: "O relógio retoma sozinho na próxima batida. Se não retomar, ver o erro na tela do projeto." },
      { titulo: "Criando o seu material",
        agora: "Você aprovou a direção e o seu material entrou na fila de criação.",
        oQueEsperamosDeVoce: "" });
  }

  // ── Aceitou, o PM está desenhando ────────────────────────────────────────
  if (r.propostaAceita) {
    return montar("desenho", "andando", "pm",
      { titulo: "Desenhando o projeto",
        agora: "O gerente de projeto está montando as entregas, a ordem e a equipe.",
        proximoPasso: "Fechar o desenho e mandar a direção para o cliente aprovar." },
      { titulo: "Montando seu planejamento",
        agora: "Fechamos negócio! Agora estamos desenhando o que será feito e quando.",
        oQueEsperamosDeVoce: "" });
  }

  // ── Comercial ────────────────────────────────────────────────────────────
  const status = (r.statusDaSolicitacao ?? "").toLowerCase();

  if (status === "negotiating" || status === "negociacao") {
    return montar("negociacao", "esperando", "sdr",
      { titulo: "Em negociação",
        agora: "O cliente pediu ajuste no escopo ou no preço.",
        proximoPasso: "O atendimento reajusta a proposta e reenvia." },
      { titulo: "Ajustando a proposta",
        agora: "Estamos revendo a proposta com o que você pediu.",
        oQueEsperamosDeVoce: "" });
  }

  // ── A PROPOSTA ESCRITA E O PORTAL DIZENDO "CONHECENDO O SEU NEGÓCIO" ──────
  //
  // MEDIDO EM PRODUÇÃO (8ª volta): a solicitação ficou **27 minutos** em
  // `proposal_pending` com a proposta escrita — 6 artefatos, o texto do
  // orçamento já no portal — e a tela do cliente marcando "Conhecendo o seu
  // negócio · 0%". A tela mentiu por 27 minutos.
  //
  // A causa é vocabulário: `proposal_pending` é o estado CANÔNICO desta casa
  // depois que `entregarOrcamentosPendentes` entrega a proposta
  // (`orcamento-do-briefing.ts`), está em `client-requests.ts` como "Aguardando
  // Proposta"... e não estava nesta lista. Não havia ramo: a leitura caía no
  // último `return`, que é a SONDAGEM — o começo de tudo.
  //
  // Verdade escrita em dois lugares já está errada em um deles: os estados
  // vivem em `client-requests.ts` e eram recopiados aqui como string literal.
  // Enquanto a lista for literal, ela vai divergir de novo — dívida declarada,
  // com dono. O que este ramo fecha é o buraco medido.
  if (
    status === "quoted" || status === "proposal_sent" ||
    status === "qualified" || status === "proposal_pending" || status === "proposal"
  ) {
    return montar("orcamento", "esperando", "cliente",
      { titulo: "Proposta enviada",
        agora: "O orçamento foi para o cliente. Aguardando resposta.",
        proximoPasso: "Sem resposta em alguns dias, o atendimento faz o follow-up." },
      { titulo: "Proposta na sua mão",
        agora: "Montamos o orçamento a partir do que você contou.",
        oQueEsperamosDeVoce: "Nos dizer se está de acordo — ou o que gostaria de mudar." });
  }

  return montar("sondagem", "andando", "sdr",
    { titulo: "Entendendo o cliente",
      agora: "O atendimento está levantando o que o cliente precisa.",
      proximoPasso: "Fechar a sondagem e orçar. Sem saber de onde vem o material, não se propõe." },
    { titulo: "Conhecendo o seu negócio",
      agora: "Estamos entendendo o que você precisa antes de propor qualquer coisa.",
      oQueEsperamosDeVoce: "Responder as perguntas que te fizermos — quanto mais completo, melhor a proposta." });
}

/**
 * A trilha marcada: onde o projeto está, o que já passou e o que falta.
 * É o que desenha a barra de etapas nas duas telas.
 */
export function trilhaMarcada(fase: FaseId): { fase: FaseId; curto: string; curtoCliente: string; estado: "feito" | "atual" | "futuro" }[] {
  const atual = posicaoNaTrilha(fase);
  return TRILHA.map((t, i) => ({
    ...t,
    estado: i < atual ? "feito" : i === atual ? "atual" : "futuro",
  }));
}
