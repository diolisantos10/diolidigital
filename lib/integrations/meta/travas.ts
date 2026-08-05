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
  | "criar_campanha_pausada"
  | "criar_conjunto_pausado"
  | "criar_anuncio_pausado"
  | "editar_texto"
  | "pausar"
  | "ativar"
  | "mudar_orcamento"
  | "arquivar"
  | "trocar_pixel_ou_evento";

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
  const conhecida: OperacaoDeAnuncio[] = [
    "ler_desempenho", "criar_campanha_pausada", "criar_conjunto_pausado",
    "criar_anuncio_pausado", "editar_texto", "pausar", "ativar",
    "mudar_orcamento", "arquivar", "trocar_pixel_ou_evento",
  ];
  if (!conhecida.includes(op)) {
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

  // Ler nunca gasta.
  if (op === "ler_desempenho") {
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
