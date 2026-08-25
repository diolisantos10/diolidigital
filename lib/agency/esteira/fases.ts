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
  /** A direção (estratégia/conceito) já foi aprovada pelo cliente? */
  direcaoAprovadaEm?: Date | string | null;
  /** As entregas já foram apresentadas ao cliente de uma vez? */
  apresentadoEm?: Date | string | null;
  /** O cliente aprovou o pacote apresentado? */
  aprovadoPeloClienteEm?: Date | string | null;
  /** idle | pending | running | done | failed */
  execucao?: string | null;
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
  m.aguardando_cliente = m.producao;
  m.encerrado = TRILHA.length - 1;
  return m;
})();

export function posicaoNaTrilha(fase: FaseId): number {
  return POSICAO[fase] ?? 0;
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

  const montar = (
    fase: FaseId,
    semaforo: Semaforo,
    responsavel: Responsavel,
    equipe: LeituraDaFase["paraEquipe"],
    cliente: LeituraDaFase["paraCliente"],
  ): LeituraDaFase => ({
    fase, semaforo, responsavel,
    precisaAprovarDirecao,
    progresso: Math.round((posicaoNaTrilha(fase) / (TRILHA.length - 1)) * 100),
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

  if (status === "quoted" || status === "proposal_sent" || status === "qualified") {
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
