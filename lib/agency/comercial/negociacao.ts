// A RÉGUA DE NEGOCIAÇÃO DO SDR — fonte única do piso, da faixa e da barganha.
//
// Decisão do CEO em 05/08/2026: o objetivo do SDR é FECHAR TODO CLIENTE, desde
// que não haja prejuízo. Isso muda o desenho do comercial em três pontos:
//
//   1. Ele descobre CEDO quanto o cliente pode gastar. Faixa perguntada no fim
//      da conversa é faixa descoberta depois de já ter ancorado o preço errado —
//      ou o cliente some antes de responder.
//   2. Dentro da faixa, ele monta o MAIOR valor possível. Vender abaixo do que a
//      pessoa podia pagar não é gentileza, é dinheiro deixado na mesa.
//   3. Ele desce o preço só até um PISO calculado. Abaixo do piso não existe
//      "fechar com prejuízo pequeno": existe carteira inteira ancorada no menor
//      preço que alguém já conseguiu.
//
// ─── POR QUE ESTE MÓDULO É FAIL-CLOSED ───────────────────────────────────────
// Esta casa roda 100% IA, sem revisor humano antes do cliente. Um item fora da
// tabela — nome novo, id digitado errado, serviço que alguém inventou na
// conversa — NÃO pode ser autorizado "por omissão". Ausência de piso não é piso
// zero: é ausência de autorização. Por isso `podeFechar` devolve `pode: false`
// para item desconhecido, e o piso vem como `Infinity` (nenhum valor passa).
//
// ─── O QUE NÃO MORA AQUI, DE PROPÓSITO ───────────────────────────────────────
// Os números de piso são INTERNOS. Eles nunca entram no prompt de uma rota
// pública: prompt é texto que o interlocutor pode tentar extrair. O que vai para
// o prompt é `blocoDeNegociacaoParaPrompt()`, que renderiza só a parte pública
// (as faixas e as regras de conduta). A trava do piso é executada no servidor,
// aqui — trava, não aviso.
//
// ─── CONFLITO CONHECIDO, DECLARADO E NÃO ESCONDIDO ───────────────────────────
// `docs/precos.md` (05/08/2026) diz: "Desconto sai do prazo ou da implantação,
// nunca da mensalidade". A decisão do CEO desta tarefa (05/08/2026) autoriza
// piso ABAIXO da mensalidade cheia dos planos (Ritmo 297→229 etc.). As duas
// regras não cabem juntas. Este módulo implementa a decisão mais recente E
// mantém a anterior viva como PREFERÊNCIA: em `moedasDeTroca`, o primeiro
// pedido é sempre o que não custa margem (pagamento à vista, prazo). Quem
// resolve a contradição no papel é o Diretor com o CEO — está em aberto.

import { precoEmReais } from "../planos";

// ─────────────────────────────────────────────────────────────────────────────
// 1. FAIXAS DE INVESTIMENTO — o que se oferece para cada bolso
// ─────────────────────────────────────────────────────────────────────────────

/** Id da faixa. `indefinida` existe porque não saber a faixa é um estado real da
 *  conversa — e tratar "não sei" como se fosse a faixa mais barata (ou a mais
 *  cara) é inventar dado do cliente. */
export type FaixaId = "balcao" | "pacote" | "presenca" | "gestao" | "projeto" | "indefinida";

export interface Oferta {
  faixa: FaixaId;
  /** Como a faixa é dita ao cliente. Vira opção de escolha na conversa. */
  rotulo: string;
  /** Limite inferior (exclusivo) e superior (inclusivo) em reais. */
  de: number;
  ate: number;
  /** A oferta que o SDR monta primeiro — o maior valor honesto da faixa. */
  principal: string;
  /** O plano B da MESMA faixa. Serve para o cliente escolher entre dois "sim",
   *  nunca entre "sim" e "não". */
  alternativa: string;
  /** A condição que faz essa faixa fechar sem prejuízo. */
  condicao: string;
  /** true quando a faixa foi deduzida em vez de informada: o SDR precisa
   *  confirmar antes de propor qualquer coisa. */
  confirmarAntes: boolean;
}

/** As cinco faixas, na ordem. Ordem importa: `ofertaParaFaixa` percorre de baixo
 *  para cima e devolve a primeira que couber. */
export const FAIXAS: Oferta[] = [
  {
    faixa: "balcao",
    rotulo: "até R$ 150",
    de: 0,
    ate: 150,
    principal: "Balcão: peça única (post, carrossel ou stories), produção por máquina, pagamento antes da entrega",
    alternativa: "Só a copy da peça, se o cliente já tem a arte",
    // Por que pagar antes: no balcão não há contrato nem permanência. Sem
    // pagamento antecipado, o custo de produção vira prejuízo na inadimplência.
    condicao: "Pagamento antes da produção. Sem hora humana — se entrar gente, o degrau quebra.",
    confirmarAntes: false,
  },
  {
    faixa: "pacote",
    rotulo: "entre R$ 150 e R$ 500",
    de: 150,
    ate: 500,
    principal: "Plano Ritmo (R$ 297/mês): pauta, 8 peças prontas por mês e aprovação no portal — quem publica é o cliente",
    alternativa: "Pacote de peças avulsas montado dentro do que ele tem para gastar",
    condicao: "No Ritmo a publicação é do cliente. Publicar por ele derruba a conta do degrau.",
    confirmarAntes: false,
  },
  {
    faixa: "presenca",
    rotulo: "entre R$ 500 e R$ 1.500",
    de: 500,
    ate: 1500,
    principal: "Plano Presença (R$ 790/mês): é aqui que entra gente da nossa equipe, publicação e Google gerenciado",
    alternativa: "Projeto de marca (identidade visual ou posicionamento), com começo e fim",
    condicao: "Projeto de marca não é mensalidade — é entrega com prazo próprio.",
    confirmarAntes: false,
  },
  {
    faixa: "gestao",
    rotulo: "entre R$ 1.500 e R$ 5.000",
    de: 1500,
    ate: 5000,
    principal: "Plano Crescimento (R$ 2.590/mês): conteúdo, criativos de anúncio e a campanha desenhada",
    alternativa: "Plano Conteúdo (R$ 1.390/mês), quando ele ainda não vai colocar verba em anúncio",
    // A verba de mídia fica FORA. Se ela entrar na conta da faixa, o cliente
    // acha que R$ 2.000 cobrem plano + anúncio, e a agência trabalha de graça.
    condicao: "A verba de mídia é sempre à parte, paga por ele direto à plataforma. Zero promessa de retorno.",
    confirmarAntes: false,
  },
  {
    faixa: "projeto",
    rotulo: "acima de R$ 5.000",
    de: 5000,
    ate: Number.POSITIVE_INFINITY,
    principal: "Projeto em fases: cada fase com escopo, prazo e preço fechados antes de começar",
    alternativa: "Plano Crescimento como base, com as fases entrando por cima mês a mês",
    condicao: "Fase seguinte só é vendida com a anterior entregue. Nada de escopo aberto.",
    confirmarAntes: false,
  },
];

/** A faixa que não é faixa: o cliente ainda não disse quanto pode gastar.
 *  Não devolve "nada para você" — devolve o menor compromisso possível E a
 *  ordem de confirmar antes de propor. Ausência de informação não é informação. */
const FAIXA_INDEFINIDA: Oferta = {
  faixa: "indefinida",
  rotulo: "ainda não informada",
  de: Number.NaN,
  ate: Number.NaN,
  principal: "Perguntar a faixa antes de propor. Se precisar de algo na mesa agora, use a peça única do balcão.",
  alternativa: "Nenhuma — propor plano sem saber a faixa é chutar o bolso do cliente.",
  condicao: "Não montar proposta com faixa deduzida. Perguntar.",
  confirmarAntes: true,
};

/**
 * Dado quanto o cliente pode gastar (em reais), devolve o que se oferece.
 *
 * Valor inválido (NaN, negativo, infinito) NÃO cai na faixa mais barata: cai em
 * `indefinida`. Deduzir a faixa a partir de lixo é preencher gap por inferência.
 */
export function ofertaParaFaixa(valorEmReais: number): Oferta {
  if (typeof valorEmReais !== "number" || !Number.isFinite(valorEmReais) || valorEmReais < 0) {
    return FAIXA_INDEFINIDA;
  }
  // R$ 0 informado é informação: o cliente disse que não tem verba agora.
  // Ainda assim tem produto — o balcão — só que ele precisa confirmar.
  if (valorEmReais === 0) return { ...FAIXAS[0], confirmarAntes: true };

  return FAIXAS.find((f) => valorEmReais > f.de && valorEmReais <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. A TABELA DE PISO — preço cheio → o mais baixo que pode ser vendido
// ─────────────────────────────────────────────────────────────────────────────

export type ItemNegociavel =
  | "post"
  | "carrossel"
  | "stories"
  | "copy"
  | "auditoria"
  | "ritmo"
  | "presenca"
  | "conteudo"
  | "crescimento";

export interface LinhaDaTabela {
  id: ItemNegociavel;
  nome: string;
  /** Preço cheio, o que o cliente vê primeiro. */
  cheio: number;
  /** O mais baixo autorizado. Abaixo disto ninguém fecha — nem o Diretor. */
  piso: number;
  /** É mensalidade ou compra única? Muda a conversa: em mensalidade, o desconto
   *  se repete todo mês. */
  recorrente: boolean;
  /** O que se oferece quando o preço bate no piso: escopo menor, nunca margem
   *  menor. Escrito por extenso porque é isto que o SDR fala. */
  versaoMenor: string;
}

export const TABELA_DE_PISO: Record<ItemNegociavel, LinhaDaTabela> = {
  post: {
    id: "post", nome: "Post único com arte e legenda", cheio: 79, piso: 49, recorrente: false,
    versaoMenor: "só a legenda pronta, com a arte por conta dele",
  },
  carrossel: {
    id: "carrossel", nome: "Carrossel", cheio: 129, piso: 79, recorrente: false,
    versaoMenor: "um post único no lugar do carrossel",
  },
  stories: {
    id: "stories", nome: "Sequência de stories", cheio: 99, piso: 59, recorrente: false,
    versaoMenor: "uma sequência mais curta, com menos telas",
  },
  copy: {
    id: "copy", nome: "Copy / legenda", cheio: 39, piso: 29, recorrente: false,
    // A copy é o item mais barato da casa: não existe degrau abaixo dela.
    // Aqui a saída é prazo, não escopo — e isso está dito com todas as letras.
    versaoMenor: "sem versão menor: a saída é prazo maior de entrega, não preço",
  },
  auditoria: {
    id: "auditoria", nome: "Auditoria de perfil", cheio: 149, piso: 99, recorrente: false,
    versaoMenor: "uma leitura mais curta, só com o diagnóstico, sem o plano de ação",
  },
  ritmo: {
    id: "ritmo", nome: "Plano Ritmo", cheio: 297, piso: 229, recorrente: true,
    versaoMenor: "menos peças por mês dentro do próprio Ritmo, ou o Pulso (R$ 49) para começar medindo",
  },
  presenca: {
    id: "presenca", nome: "Plano Presença", cheio: 790, piso: 690, recorrente: true,
    versaoMenor: "o Ritmo (R$ 297), em que ele mesmo publica",
  },
  conteudo: {
    id: "conteudo", nome: "Plano Conteúdo", cheio: 1390, piso: 1190, recorrente: true,
    versaoMenor: "o Presença (R$ 790), sem stories e sem roteiro de reels",
  },
  crescimento: {
    id: "crescimento", nome: "Plano Crescimento", cheio: 2590, piso: 2190, recorrente: true,
    versaoMenor: "o Conteúdo (R$ 1.390), sem os criativos de anúncio",
  },
};

export interface VeredictoDePreco {
  pode: boolean;
  /** `Infinity` quando não há piso conhecido: nenhum valor finito passa. */
  piso: number;
  motivo: string;
}

function linha(item: string): LinhaDaTabela | undefined {
  // `hasOwn` não é preciosismo: sem ele, `TABELA_DE_PISO["constructor"]` devolve
  // uma função herdada de Object — objeto truthy, `piso` undefined — e a
  // comparação `valor < undefined` é false, ou seja, o portão AUTORIZARIA um
  // item inexistente. Fail-closed de verdade começa aqui.
  if (typeof item !== "string" || !Object.hasOwn(TABELA_DE_PISO, item)) return undefined;
  return TABELA_DE_PISO[item as ItemNegociavel];
}

/**
 * O portão. Devolve se um valor pode ser fechado para um item.
 *
 * FAIL-CLOSED em três situações — todas devolvem `pode: false`:
 *   • item que não está na tabela (piso = Infinity, nenhum valor passa);
 *   • valor não-numérico, NaN, infinito ou negativo;
 *   • valor abaixo do piso.
 *
 * Nunca devolve `true` por omissão. Se você está lendo isto pensando em
 * adicionar um `default: return { pode: true }`, leia o cabeçalho do arquivo.
 */
export function podeFechar(item: string, valorProposto: number): VeredictoDePreco {
  const l = linha(item);

  if (!l) {
    return {
      pode: false,
      piso: Number.POSITIVE_INFINITY,
      motivo:
        `"${item}" não está na tabela de piso. Sem piso conhecido não existe autorização de venda — ` +
        `preciso confirmar antes de falar preço deste item.`,
    };
  }

  if (typeof valorProposto !== "number" || !Number.isFinite(valorProposto) || valorProposto <= 0) {
    return {
      pode: false,
      piso: l.piso,
      motivo: `Valor proposto inválido para ${l.nome}. O piso é ${precoEmReais(l.piso)}.`,
    };
  }

  if (valorProposto < l.piso) {
    return {
      pode: false,
      piso: l.piso,
      motivo:
        `${precoEmReais(valorProposto)} está abaixo do piso de ${l.nome} (${precoEmReais(l.piso)}). ` +
        `Não desço mais o preço — ofereço ${l.versaoMenor}.`,
    };
  }

  if (valorProposto === l.piso) {
    return {
      pode: true,
      piso: l.piso,
      motivo: `${precoEmReais(valorProposto)} é exatamente o piso de ${l.nome}. Fecha, e daqui não desce mais.`,
    };
  }

  const desconto = l.cheio - valorProposto;
  return {
    pode: true,
    piso: l.piso,
    motivo:
      desconto > 0
        ? `${precoEmReais(valorProposto)} fecha ${l.nome} (cheio ${precoEmReais(l.cheio)}, piso ${precoEmReais(l.piso)}). ` +
          `São ${precoEmReais(desconto)} de desconto — peça moeda de troca.`
        : `${precoEmReais(valorProposto)} fecha ${l.nome} sem desconto.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A REGRA DA BARGANHA — desconto nunca sai de graça
// ─────────────────────────────────────────────────────────────────────────────
//
// Desconto dado sem contrapartida ensina duas coisas erradas de uma vez: que o
// preço cheio era mentira, e que basta insistir. A moeda de troca conserta as
// duas — o cliente paga menos porque DEU alguma coisa, e o preço cheio continua
// de pé para o próximo.
//
// A ordem não é arbitrária: começa pelo que não custa margem nenhuma (dinheiro
// na frente, prazo folgado) e só depois vai para o que custa (rodadas de ajuste,
// permanência, uso do case). É a mesma preferência de `docs/precos.md`.

export type MoedaId = "a_vista" | "prazo" | "rodadas" | "contrato" | "case";

export interface MoedaDeTroca {
  id: MoedaId;
  nome: string;
  /** A frase que o SDR usa. Pedido, não aviso. */
  pedido: string;
  /** Por que essa moeda vale o desconto — o que ela devolve para a casa. */
  porQue: string;
}

/** Em ordem de preferência. Índice menor = pedido primeiro. */
export const MOEDAS: MoedaDeTroca[] = [
  {
    id: "a_vista",
    nome: "Pagamento à vista",
    pedido: "Consigo esse valor com pagamento à vista, na confirmação. Fecha assim?",
    porQue: "Não custa margem: só antecipa caixa e elimina risco de inadimplência.",
  },
  {
    id: "prazo",
    nome: "Prazo maior de entrega",
    pedido: "Se eu puder entregar com alguns dias a mais, encaixo esse valor.",
    porQue: "Prazo folgado deixa a produção entrar na janela ociosa. Custo cai sem cortar escopo.",
  },
  {
    id: "rodadas",
    nome: "Menos rodadas de ajuste",
    pedido: "Nesse valor a peça vai com uma rodada de ajuste em vez de duas. Serve?",
    porQue: "Rodada de ajuste é o custo variável que mais dispara. Reduzir é cortar escopo, não margem.",
  },
  {
    id: "contrato",
    nome: "Contrato mais longo",
    pedido: "Esse valor eu seguro com um compromisso mais longo — em vez do mínimo.",
    porQue: "Permanência maior dilui o custo de entrada e dá previsibilidade de caixa.",
  },
  {
    id: "case",
    nome: "Autorização de usar o case",
    pedido: "E, para fechar nesse valor, preciso da sua autorização para mostrar o resultado como case.",
    porQue: "Vale como aquisição. Nunca peça a quem já sinalizou sigilo.",
  },
];

export interface Barganha {
  /** Desconto considerado, em reais. */
  desconto: number;
  /** Quantas moedas pedir. Cresce com o desconto. */
  quantidade: number;
  moedas: MoedaDeTroca[];
  /** O que o SDR fala, já montado. */
  frase: string;
}

/** Degraus de exigência. Quanto maior o desconto, mais coisas ele pede.
 *  Os cortes são em reais porque é assim que o SDR raciocina na conversa. */
const DEGRAUS: { ate: number; quantidade: number }[] = [
  { ate: 30, quantidade: 1 },
  { ate: 80, quantidade: 2 },
  { ate: 200, quantidade: 3 },
  { ate: 400, quantidade: 4 },
  { ate: Number.POSITIVE_INFINITY, quantidade: 5 },
];

/**
 * O que pedir em troca de um desconto. Desconto zero ou inválido devolve lista
 * vazia — não há o que cobrar por um desconto que não foi dado.
 */
export function moedasDeTroca(descontoEmReais: number): Barganha {
  const desconto =
    typeof descontoEmReais === "number" && Number.isFinite(descontoEmReais) && descontoEmReais > 0
      ? descontoEmReais
      : 0;

  if (desconto === 0) {
    return {
      desconto: 0,
      quantidade: 0,
      moedas: [],
      frase: "Sem desconto na mesa — nada a pedir em troca. Feche no preço cheio.",
    };
  }

  const quantidade = DEGRAUS.find((d) => desconto <= d.ate)!.quantidade;
  const moedas = MOEDAS.slice(0, quantidade);

  return {
    desconto,
    quantidade,
    moedas,
    frase:
      `${precoEmReais(desconto)} de desconto custa ${quantidade} contrapartida${quantidade > 1 ? "s" : ""}: ` +
      moedas.map((m) => m.nome.toLowerCase()).join(", ") + ".",
  };
}

/** Atalho para o uso real: dado item e valor proposto, diz se fecha E o que
 *  pedir em troca. Existe para o chamador não ter que calcular o desconto na
 *  mão — cálculo repetido na mão é onde o piso costuma vazar. */
export function barganhaPara(item: string, valorProposto: number): {
  veredicto: VeredictoDePreco;
  barganha: Barganha;
} {
  const veredicto = podeFechar(item, valorProposto);
  const l = linha(item);
  const desconto = l && veredicto.pode ? l.cheio - valorProposto : 0;
  return { veredicto, barganha: moedasDeTroca(desconto) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHEGOU NO PISO — a hora de parar de baixar preço
// ─────────────────────────────────────────────────────────────────────────────

export interface SaidaDoPiso {
  /** true = pare de baixar preço. A conversa agora é sobre ESCOPO. */
  noPiso: boolean;
  piso: number;
  /** O escopo menor que entra no lugar do desconto. */
  versaoMenor: string;
  /** A frase de saída, pronta para ser dita. */
  frase: string;
  /** true quando o item é desconhecido: não é "chegou no piso", é "não sei o
   *  piso" — e a saída é escalar, não improvisar. */
  precisaConfirmar: boolean;
}

/**
 * Quando o valor bate (ou passa por baixo do) piso, devolve a frase de saída:
 * parar de baixar preço e oferecer uma VERSÃO MENOR. Corta escopo, nunca margem.
 *
 * Item desconhecido devolve `noPiso: true` + `precisaConfirmar: true`. Parar é
 * sempre a direção segura: quem não sabe o piso não tem o que oferecer.
 */
export function chegouNoPiso(item: string, valor: number): SaidaDoPiso {
  const l = linha(item);

  if (!l) {
    return {
      noPiso: true,
      piso: Number.POSITIVE_INFINITY,
      versaoMenor: "",
      precisaConfirmar: true,
      frase:
        `Não tenho "${item}" na minha tabela, então não falo preço dele por conta própria — ` +
        `preciso confirmar internamente e te trago o valor certo.`,
    };
  }

  const valorValido = typeof valor === "number" && Number.isFinite(valor);
  const noPiso = !valorValido || valor <= l.piso;

  if (!noPiso) {
    return {
      noPiso: false,
      piso: l.piso,
      versaoMenor: l.versaoMenor,
      precisaConfirmar: false,
      frase: `Ainda há espaço acima do piso (${precoEmReais(l.piso)}) — mas todo desconto pede contrapartida.`,
    };
  }

  return {
    noPiso: true,
    piso: l.piso,
    versaoMenor: l.versaoMenor,
    precisaConfirmar: false,
    frase:
      `${precoEmReais(l.piso)} é o menor valor que ${l.nome} tem. Daqui eu não desço mais — ` +
      `o que eu faço é ajustar o que entra: ${l.versaoMenor}. Assim cabe no seu bolso sem eu entregar menos do que prometi.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. O QUE VAI PARA O PROMPT — só a parte pública
// ─────────────────────────────────────────────────────────────────────────────
//
// A rota `/api/sdr/chat` é PÚBLICA e sem autenticação. Tudo que entra no system
// prompt é texto que alguém pode tentar extrair da conversa. Por isso este bloco
// renderiza as FAIXAS (informação que o próprio cliente escolhe) e as REGRAS DE
// CONDUTA, e nunca a tabela de piso. O piso é executado no servidor, por
// `podeFechar` — trava, não aviso.

/** As opções de faixa que o cliente escolhe na conversa. Geradas da mesma lista
 *  usada por `ofertaParaFaixa` para as duas não divergirem. */
export function opcoesDeFaixa(): string[] {
  return FAIXAS.map((f) => f.rotulo);
}

export function blocoDeNegociacaoParaPrompt(): string {
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "NEGOCIAÇÃO — a faixa de investimento (decisão do CEO, 05/08/2026)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "Seu objetivo é FECHAR TODO CLIENTE. Toda faixa tem produto nesta casa — você",
    "NUNCA diz, nem sugere, que não temos nada para a pessoa. Se o valor for baixo,",
    "existe peça única; se for alto, existe projeto em fases.",
    "",
    "A FAIXA É A TERCEIRA PERGUNTA. Depois de saber quem é a pessoa e o que o",
    "negócio faz, pergunte a faixa — nunca no fim da conversa. Faixa descoberta no",
    "fim é conversa inteira montada no escuro. Pergunte com naturalidade e OFEREÇA",
    "AS OPÇÕES para ela escolher (é mais fácil escolher do que declarar um número):",
    "",
    ...opcoesDeFaixa().map((r) => `  • ${r}`),
    "",
    'Ex.: "Pra eu já montar a proposta certa pro seu momento: quanto você pensa em',
    'investir por mês — até R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500,',
    'entre R$ 1.500 e R$ 5.000, ou acima disso?"',
    "",
    "Se a pessoa não quiser dizer, siga a conversa e volte ao assunto UMA vez mais",
    "adiante. Nunca deduza a faixa pelo segmento, pelo tamanho do negócio ou pela",
    "forma de falar — faixa deduzida é chute sobre o bolso do cliente.",
    "",
    "REGRAS DE PREÇO QUE VOCÊ NÃO QUEBRA:",
    "1. Esta pergunta é a ÚNICA hora em que você diz números nesta conversa, e são",
    "   só os números das faixas acima. Você não cota, não dá 'a partir de', não",
    "   estima e não fala de desconto aqui — o orçamento é montado pelo sistema.",
    "2. Você NUNCA oferece nada abaixo do piso. O piso é calculado pelo servidor;",
    "   você não o conhece e não o inventa.",
    "3. Todo desconto tem contrapartida: pagamento à vista, prazo maior de entrega,",
    "   menos rodadas de ajuste, contrato mais longo, ou autorização de usar o case.",
    "   Desconto sem pedido em troca não existe.",
    "4. Quando o preço chega no piso, você para de baixar e oferece uma VERSÃO",
    "   MENOR. Corta escopo, nunca margem.",
    "5. Você não promete resultado, alcance, faturamento nem retorno. Nunca.",
    "",
    "PREENCHIMENTO: registre a faixa escolhida em budgetRange, usando EXATAMENTE",
    "um destes valores: " + FAIXAS.map((f) => `"${f.faixa}"`).join(" · ") + ".",
    "Se a pessoa não disse, omita o campo — não escreva um palpite.",
  ].join("\n");
}

// ── A exceção da pergunta de faixa, para a trava de preço da rota ────────────
// A rota pública barra qualquer "R$ <número>" na fala do SDR. Isso era certo
// enquanto ele nunca falava de dinheiro — mas a faixa virou a TERCEIRA pergunta.
// Sem esta exceção, toda vez que o SDR fizesse a pergunta CERTA o turno seria
// descartado e o motor de regras assumiria: a regra nova nunca rodaria.
//
// A exceção é estreita de propósito. Só passa se as três valerem juntas:
//   1. a fala é sobre investimento/orçamento — é pergunta, não cotação;
//   2. TODO valor monetário citado é um limite de faixa (150, 500, 1.500, 5.000);
//   3. aparecem pelo menos TRÊS limites distintos — a régua inteira.
//
// O item 3 é o que separa "escolha entre estas faixas" de "o seu fica em R$ 500":
// cotação cita um valor, a pergunta da faixa cita a escada toda. O custo dessa
// escolha é conhecido: se o modelo abreviar as opções e citar só dois limites com
// R$, o turno é descartado e cai no motor de regras. Descartar de vez em quando a
// pergunta certa é barato; deixar passar uma cotação, não.
const LIMITES_DE_FAIXA = new Set(["150", "500", "1500", "5000"]);
const VALOR_MONETARIO = /r\$\s*([\d.,]+)|(\d[\d.,]*)\s*reais/gi;

export function ehPerguntaDeFaixa(reply: string): boolean {
  if (typeof reply !== "string") return false;
  if (/desconto/i.test(reply)) return false; // desconto não se negocia nesta conversa
  if (!/investir|investimento|or[çc]amento|verba|gastar|faixa/i.test(reply)) return false;

  const citados = new Set<string>();
  for (const m of reply.matchAll(VALOR_MONETARIO)) {
    // Normaliza "1.500" e "1.500,00" para "1500": em pt-BR o ponto é separador
    // de milhar, e centavos não mudam a faixa.
    const bruto = (m[1] ?? m[2] ?? "").replace(/,\d{1,2}$/, "").replace(/[.,]/g, "");
    if (!LIMITES_DE_FAIXA.has(bruto)) return false; // valor fora da régua = cotação
    citados.add(bruto);
  }
  return citados.size >= 3;
}

/** Ids de faixa aceitos vindos do modelo. Existe porque a rota faz allowlist:
 *  qualquer outra coisa que o modelo escreva em `budgetRange` é descartada. */
export const FAIXAS_VALIDAS: readonly string[] = FAIXAS.map((f) => f.faixa);

export function faixaValida(valor: unknown): valor is FaixaId {
  return typeof valor === "string" && FAIXAS_VALIDAS.includes(valor);
}

/**
 * O TETO da faixa que o cliente declarou, em reais — ou `null` quando não dá
 * para saber.
 *
 * Existe por causa do CityJobs (16/08/2026). O cliente disse, com todas as
 * letras, *"estamos pensando algo em torno de R$ 500 por mês"*. A faixa foi
 * capturada e guardada certinho em `budgetRange`. E aí ninguém mais olhou para
 * ela: a estimativa saiu em R$ 1.800–3.400 — 3,6× o que ele disse poder pagar —
 * sem uma linha reconhecendo a diferença.
 *
 * Faixa que só serve para aparecer no painel não é trava, é enfeite. Para o
 * número ser CONFRONTADO com a verba, alguém precisa conseguir transformar
 * "entre R$ 150 e R$ 500" de volta num número — e é isto aqui.
 *
 * Aceita o id e o rótulo pelo mesmo motivo que `normalizarFaixa`: o que fica
 * gravado no escopo é o rótulo, não o id.
 *
 * `null` para qualquer outra coisa, e `null` significa "não sei a verba" — que
 * é diferente de "a verba é zero" e de "a verba é infinita". Ausência de
 * informação não é informação.
 */
export function tetoDaFaixa(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().toLowerCase();
  if (!limpo) return null;
  const achou = FAIXAS.find((f) => f.faixa === limpo || f.rotulo.toLowerCase() === limpo);
  return achou ? achou.ate : null;
}

/**
 * Converte o que o modelo escreveu em `budgetRange` no RÓTULO que o cliente lê.
 * Devolve `null` para qualquer outra coisa — e `null` significa "some com o
 * campo", não "chuta uma faixa".
 *
 * Aceita o id ("gestao") E o próprio rótulo ("entre R$ 1.500 e R$ 5.000") de
 * propósito: o painel público mostra o rótulo, e nos turnos seguintes o modelo
 * recebe o scope acumulado e devolve o que viu. Se só o id fosse aceito, a faixa
 * apareceria no resumo do cliente e sumiria na mensagem seguinte.
 */
export function normalizarFaixa(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().toLowerCase();
  if (!limpo) return null;
  const achou = FAIXAS.find((f) => f.faixa === limpo || f.rotulo.toLowerCase() === limpo);
  return achou ? achou.rotulo : null;
}
