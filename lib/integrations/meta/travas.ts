// AS TRAVAS DA VERBA — o que um agente NUNCA faz sozinho.
//
// Decidido em 05/08/2026, depois do parecer do especialista da Meta e da
// arquitetura que o CEO trouxe. A regra em uma frase:
//
//   **O agente nunca tem uma função "faça qualquer chamada à Meta".**
//
// Ele tem um catálogo fechado de operações, e as que mexem em dinheiro passam
// por aqui antes. A diferença é concreta: com chamada genérica, uma instrução
// mal interpretada vira verba multiplicada por dez; com catálogo fechado, ela
// vira erro de função inexistente.
//
// ── A LINHA QUE SEPARA OS DOIS AGENTES ─────────────────────────────────────
//
//   LEITURA  (`ads_read`)       — analisa, compara, acha desperdício, recomenda.
//                                 Não consegue gastar um centavo, por construção.
//   OPERAÇÃO (`ads_management`) — cria pausado, edita texto, pausa. Ativar e
//                                 aumentar verba passam pelo portão abaixo.
//
// Pausar NUNCA pede autorização. Parar de gastar é sempre permitido — exigir
// cerimônia para frear é o mesmo que não ter freio.

/** As operações que existem. O que não está aqui não pode ser feito. */
export type OperacaoDeAnuncio =
  | "ler_desempenho"
  | "ler_conta"
  | "listar_contas"
  | "ler_campanha"
  | "ler_conjunto"
  | "ler_anuncio"
  | "buscar_cidade"
  | "buscar_interesse"
  | "criar_campanha_pausada"
  | "criar_conjunto_pausado"
  | "criar_criativo"
  | "criar_anuncio_pausado"
  | "editar_texto"
  | "pausar"
  | "ativar"
  | "mudar_orcamento"
  | "arquivar"
  | "trocar_pixel_ou_evento";

// ─── O PESO DE CADA OPERAÇÃO NA COTA DA META ────────────────────────────────
//
// O catálogo não serve só para dizer o que PODE: ele diz também quanto CUSTA.
// A Marketing API não é limitada por "chamadas por hora" — é limitada por
// PONTUAÇÃO, por conta de anúncios, com decaimento de 300 segundos:
//
//   "Cada chamada da API de Marketing recebe uma pontuação. […] uma chamada da
//    API de leitura é igual a 1 ponto, e uma chamada da API de gravação é igual
//    a 3 pontos […] Se o app estiver no nível de desenvolvimento da API de
//    Marketing: a pontuação máxima é 60. A taxa de decaimento é de 300
//    segundos. Se atingir a pontuação máxima, você passará por 300 segundos de
//    bloqueio."
//   (fonte: docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md,
//    capturado em 06/08/2026 de
//    https://developers.facebook.com/docs/marketing-api/overview/rate-limiting)
//
// Ou seja: no nível em que o nosso app está, **20 escritas travam a conta por 5
// minutos**. O número que esta casa usava até 06/08/2026 ("300 + 40 × anúncios
// ativos por hora", da página geral da Graph API) é de outra camada e deixava
// passar folgada uma rajada que a Meta bloqueia em segundos.
//
// O peso mora JUNTO da permissão de propósito: quem declara que uma operação
// pode acontecer declara, no mesmo lugar, quanto ela custa. Quem cobra é
// `cota-de-anuncios.ts`.

/** Pontos de uma chamada de LEITURA na Marketing API (fonte acima). */
export const PONTOS_DE_LEITURA = 1;
/** Pontos de uma chamada de ESCRITA na Marketing API (fonte acima). */
export const PONTOS_DE_ESCRITA = 3;

export interface FichaDaOperacao {
  /** true = a chamada MUDA algo na conta da Meta (vale 3 pontos). */
  escreve: boolean;
  /** Peso em pontos na cota da conta de anúncios. */
  pontos: number;
  /** Para o log e para o parecer: o que a operação faz, em português. */
  descricao: string;
}

/** O catálogo com peso. Mesma lista de `OperacaoDeAnuncio` — uma vocabulário
 *  só para a casa inteira, não dois. */
export const CATALOGO: Record<OperacaoDeAnuncio, FichaDaOperacao> = {
  ler_desempenho: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "ler desempenho (insights) de campanha" },
  ler_conta: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "ler dados da conta de anúncios" },
  listar_contas: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "listar as contas de anúncio do token" },
  ler_campanha: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "ler uma campanha" },
  ler_conjunto: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "ler um conjunto de anúncios" },
  ler_anuncio: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "ler um anúncio" },
  buscar_cidade: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "resolver cidade em id de geolocalização" },
  buscar_interesse: { escreve: false, pontos: PONTOS_DE_LEITURA, descricao: "resolver interesse em id da Meta" },
  criar_campanha_pausada: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "criar campanha PAUSADA" },
  criar_conjunto_pausado: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "criar conjunto de anúncios PAUSADO" },
  criar_criativo: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "criar criativo de anúncio" },
  criar_anuncio_pausado: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "criar anúncio PAUSADO" },
  editar_texto: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "editar texto do criativo (reinicia a análise do anúncio)" },
  pausar: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "pausar (parar de gastar é sempre permitido)" },
  ativar: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "ATIVAR — o único ato que faz dinheiro sair" },
  mudar_orcamento: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "mudar orçamento (4 alterações/hora por conjunto, teto da Meta)" },
  arquivar: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "arquivar objeto" },
  trocar_pixel_ou_evento: { escreve: true, pontos: PONTOS_DE_ESCRITA, descricao: "trocar pixel ou evento de conversão" },
};

/** A operação existe no catálogo? Fora dele, escrita não acontece. */
export function operacaoConhecida(nome: string | undefined): boolean {
  return !!nome && Object.prototype.hasOwnProperty.call(CATALOGO, nome);
}

/**
 * O peso em pontos de uma operação — FAIL-CLOSED.
 *
 * Operação que o código não conhece paga `PONTOS_DE_ESCRITA`, o peso mais caro
 * da tabela da Meta, nunca zero. Cobrar zero pelo desconhecido é a forma mais
 * barata de estourar uma cota sem nunca ver o contador subir — e contador que
 * não vê o gasto é decoração, que foi exatamente o problema de 03/08/2026.
 */
export function pesoDaOperacao(nome: string | undefined, metodo?: string): number {
  if (operacaoConhecida(nome)) return CATALOGO[nome as OperacaoDeAnuncio].pontos;
  if (metodo && metodo.toUpperCase() === "GET") return PONTOS_DE_LEITURA;
  return PONTOS_DE_ESCRITA;
}

/** A operação é de escrita? Desconhecida = tratada como escrita (fail-closed). */
export function ehEscrita(nome: string | undefined, metodo?: string): boolean {
  if (operacaoConhecida(nome)) return CATALOGO[nome as OperacaoDeAnuncio].escreve;
  return !metodo || metodo.toUpperCase() !== "GET";
}

/** A frase que a casa devolve quando barra uma escrita fora do catálogo. */
export function fraseDeOperacaoNaoCatalogada(nome: string | undefined): string {
  return (
    "esta escrita na Marketing API não está no catálogo de operações permitidas" +
    (nome ? ` ("${nome}")` : "") +
    " — o agente não tem chamada genérica à Meta: declare a operação em lib/integrations/meta/travas.ts antes"
  );
}

export interface Veredicto {
  /** Pode seguir sem gente? */
  liberado: boolean;
  /** Precisa de clique humano antes? */
  exigeAutorizacao: boolean;
  /** A frase que a tela mostra a quem vai decidir. */
  motivo: string;
}

/**
 * Quanto a verba pode subir sem alguém olhar. Zero: nenhuma.
 *
 * O CEO e o parecer sugeriram 10% a 20%. Ficou em ZERO no lançamento, e a razão
 * é a data: a conta de anúncios da agência foi restrita em 03/08 por operação em
 * ritmo de máquina. Um teto percentual "seguro" é uma porta que se abre sozinha
 * várias vezes ao dia — e verba que sobe 15% seis vezes dobrou.
 *
 * Quando houver histórico medido, este número sobe com dado, não com vontade.
 */
export const AUMENTO_SEM_AUTORIZACAO = 0;

/** Operações que gastam dinheiro do cliente ou mudam a medição. */
const MEXE_EM_DINHEIRO: OperacaoDeAnuncio[] = ["ativar", "mudar_orcamento"];
const MEXE_NA_MEDICAO: OperacaoDeAnuncio[] = ["trocar_pixel_ou_evento", "arquivar"];

/**
 * O portão. Fail-closed: operação desconhecida NÃO passa.
 *
 * Recebe o valor antigo e o novo quando a operação é de verba — sem os dois,
 * não dá para saber se subiu, e "não dá para saber" nunca vira "pode".
 */
export function conferirOperacao(entrada: {
  operacao: string;
  orcamentoAtualBRL?: number | null;
  orcamentoNovoBRL?: number | null;
  /** Categoria especial (crédito, emprego, moradia, política) exige gente. */
  categoriaEspecial?: boolean;
}): Veredicto {
  const op = entrada.operacao as OperacaoDeAnuncio;
  // A lista de operações conhecidas é UMA só: o `CATALOGO` acima. Duas listas
  // divergem no dia em que alguém acrescenta operação em uma e esquece a outra.
  if (!operacaoConhecida(op)) {
    return {
      liberado: false,
      exigeAutorizacao: true,
      motivo: `Operação "${entrada.operacao}" não existe no catálogo. O agente não tem chamada genérica à Meta.`,
    };
  }

  // Frear é sempre permitido.
  if (op === "pausar") {
    return { liberado: true, exigeAutorizacao: false, motivo: "Pausar não precisa de autorização." };
  }

  // Ler nunca gasta — vale para TODA leitura do catálogo, não só a de
  // desempenho (ler conta, campanha, conjunto, anúncio, buscar cidade/interesse).
  if (!CATALOGO[op].escreve) {
    return { liberado: true, exigeAutorizacao: false, motivo: "Leitura não gasta." };
  }

  // Nascer pausado é seguro: nada entrega, nada cobra, e alguém confere depois.
  if (op.startsWith("criar_") || op === "editar_texto") {
    return {
      liberado: true,
      exigeAutorizacao: false,
      motivo: "Nasce pausado — nada entrega e nada cobra até alguém ativar.",
    };
  }

  // Categoria especial é regulada pela Meta e por lei: sempre gente.
  if (entrada.categoriaEspecial) {
    return {
      liberado: false,
      exigeAutorizacao: true,
      motivo: "Categoria especial (crédito, emprego, moradia ou política) exige decisão humana.",
    };
  }

  if (MEXE_NA_MEDICAO.includes(op)) {
    return {
      liberado: false,
      exigeAutorizacao: true,
      motivo: "Mexer em pixel, evento ou arquivar apaga a base de comparação do cliente — só com autorização.",
    };
  }

  if (op === "ativar") {
    return {
      liberado: false,
      exigeAutorizacao: true,
      motivo: "Ativar é o único ato que faz dinheiro sair. Precisa de quem autorize, com nome.",
    };
  }

  // mudar_orcamento
  const atual = entrada.orcamentoAtualBRL;
  const novo = entrada.orcamentoNovoBRL;
  if (typeof atual !== "number" || typeof novo !== "number" || atual <= 0 || novo <= 0) {
    return {
      liberado: false,
      exigeAutorizacao: true,
      motivo: "Sem saber a verba de antes e a de depois, não dá para dizer se subiu — e não saber nunca vira permissão.",
    };
  }
  if (novo <= atual) {
    return {
      liberado: true,
      exigeAutorizacao: false,
      motivo: `Verba de R$ ${atual} para R$ ${novo}: baixar ou manter não precisa de autorização.`,
    };
  }
  const alta = ((novo - atual) / atual) * 100;
  if (alta <= AUMENTO_SEM_AUTORIZACAO) {
    return { liberado: true, exigeAutorizacao: false, motivo: `Aumento de ${alta.toFixed(1)}% dentro do teto.` };
  }
  return {
    liberado: false,
    exigeAutorizacao: true,
    motivo: `Aumento de ${alta.toFixed(1)}% (R$ ${atual} → R$ ${novo}) precisa de autorização.`,
  };
}
