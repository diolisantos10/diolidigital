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
  entregaveis: { total: number; emRevisao: number; comRessalva: number; aprovados: number };
  /** Pedidos de material abertos e ainda sem resposta do cliente. */
  pedidosAbertos: number;
  /** Existe ciclo mensal em andamento? */
  cicloAberto?: boolean;
  /** O cliente já conectou o Instagram? Sem isso a agência não publica nada — e
   *  dizer que está publicando seria mentira na cara do cliente. */
  redesConectadas?: boolean;
  /** Quantos posts já foram efetivamente ao ar neste projeto. */
  postsPublicados?: number;
  /** Posts aprovados esperando a data chegar. */
  postsAgendados?: number;
}

export interface LeituraDaFase {
  fase: FaseId;
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
  const montar = (
    fase: FaseId,
    semaforo: Semaforo,
    responsavel: Responsavel,
    equipe: LeituraDaFase["paraEquipe"],
    cliente: LeituraDaFase["paraCliente"],
  ): LeituraDaFase => ({
    fase, semaforo, responsavel,
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
  if (r.pedidosAbertos > 0 || r.tarefas.bloqueadas > 0) {
    const quantos = Math.max(r.pedidosAbertos, r.tarefas.bloqueadas);
    return montar("aguardando_cliente", "travado", "cliente",
      { titulo: "Parado esperando o cliente",
        agora: `${quantos} pedido(s) de material sem resposta. A produção não anda sem isso.`,
        proximoPasso: "O gerente de projeto cobra o material numa mensagem só." },
      { titulo: "Precisamos de uma coisa sua",
        agora: "A criação está em andamento, mas faltou material para continuar.",
        oQueEsperamosDeVoce: `Responder ${quantos === 1 ? "o pedido" : `os ${quantos} pedidos`} que te mandamos na conversa.` });
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
