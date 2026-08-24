// recuperacao.ts — A TENTATIVA DE RELER A FONTE, E O REGISTRO DELA.
//
// Regra 4 da missão de 24/08/2026: se o caminho permitir reler a fonte, tente,
// e registre a tentativa e o resultado. Se não permitir, registre a falha e não
// finja.
//
// O "não finja" é o que este arquivo protege. Uma recuperação que não aconteceu
// e sai como `{ recuperado: false }` genérico é indistinguível de uma que
// aconteceu e falhou — e as duas pedem gestos diferentes: a primeira é código
// faltando, a segunda é a fonte fora do ar. Por isso `tentou` é um campo, e não
// uma dedução.

import { conciliar, type Conciliacao } from "./conciliacao";
import type { PlanoDeMensuracao } from "./plano-de-mensuracao";

export interface TentativaDeRecuperacao {
  /** A releitura chegou a ser executada? `false` = não havia caminho. */
  tentou: boolean;
  /** A releitura resolveu a falta? Só pode ser `true` se `tentou` for `true`. */
  recuperou: boolean;
  /** O que aconteceu, em português, para o log e para quem lê o relatório. */
  relato: string;
  /** A conciliação DEPOIS da tentativa. Sem tentativa, é a de antes. */
  conciliacao: Conciliacao;
}

/**
 * Tenta reler a fonte e refazer a comparação.
 *
 * `reler` é opcional de propósito: nem todo caminho de dado desta casa permite
 * releitura (um insight já agregado, um CSV que o cliente mandou uma vez). Sem
 * `reler`, a função NÃO tenta e diz que não tentou — em vez de devolver um
 * fracasso que parece uma tentativa.
 */
export async function tentarRecuperar(entrada: {
  conciliacao: Conciliacao;
  plano: PlanoDeMensuracao | null;
  recebidosAntes?: string[] | null;
  /** Relê a fonte e devolve os nomes de evento. `null` = a fonte não respondeu. */
  reler?: () => Promise<string[] | null>;
}): Promise<TentativaDeRecuperacao> {
  const antes = entrada.conciliacao;

  if (antes.estado === "integro") {
    return { tentou: false, recuperou: false, relato: "medição íntegra — não havia o que recuperar.", conciliacao: antes };
  }

  if (!entrada.reler) {
    return {
      tentou: false,
      recuperou: false,
      relato:
        "NÃO HOUVE TENTATIVA DE RECUPERAÇÃO: este caminho de dado não permite reler a fonte. "
        + "Isto é falta de caminho, não fonte fora do ar — o gesto é implementar a releitura, não esperar.",
      conciliacao: antes,
    };
  }

  let recebidos: string[] | null;
  try {
    recebidos = await entrada.reler();
  } catch (e) {
    return {
      tentou: true,
      recuperou: false,
      relato: `releitura da fonte TENTADA e FALHOU: ${e instanceof Error ? e.message : String(e)}. Os números seguem marcados.`,
      conciliacao: antes,
    };
  }

  if (recebidos === null) {
    return {
      tentou: true,
      recuperou: false,
      relato: "releitura da fonte TENTADA: a fonte respondeu sem a lista de eventos. Os números seguem marcados.",
      conciliacao: antes,
    };
  }

  const depois = conciliar({ plano: entrada.plano, recebidos, recebidosAntes: entrada.recebidosAntes });
  return {
    tentou: true,
    recuperou: depois.estado === "integro",
    relato: depois.estado === "integro"
      ? "releitura da fonte TENTADA e BEM-SUCEDIDA: os eventos que faltavam chegaram na segunda leitura."
      : `releitura da fonte TENTADA e os eventos seguem faltando (${depois.faltando.map((f) => f.nome).join(", ") || antes.motivo}).`,
    conciliacao: depois,
  };
}
