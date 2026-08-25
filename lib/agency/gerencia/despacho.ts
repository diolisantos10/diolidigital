// O DESPACHO DO GERENTE GERAL — a única porta de entrada da demanda.
//
// ── O QUE MUDOU, E POR QUÊ ──────────────────────────────────────────────────
//
// Até 25/08/2026 a demanda ia do atendimento DIRETO ao especialista. Isso tem
// três consequências que só aparecem quando a agência cresce:
//
//   1. Ninguém sabe o total. Doze departamentos recebendo por doze portas
//      diferentes é doze filas — e capacidade que ninguém soma vira prazo que
//      ninguém cumpre.
//   2. Prioridade some. Dois clientes querendo o mesmo departamento na mesma
//      semana viram ordem de chegada, que é o contrário de gestão.
//   3. O gerente do departamento descobre o trabalho DEPOIS do agente dele.
//
// A ordem do CEO fecha as três com uma regra só: **toda demanda entra pelo
// Gerente Geral e é despachada ao GERENTE do departamento.** O GG não chama
// agente de linha. Nunca.
//
// ── A TRAVA, E ONDE ELA MORA ────────────────────────────────────────────────
//
// A ficha do `gerente-geral` já listava "despacho direto a agente, pulando o
// gerente do departamento" em `ferramentas_proibidas`. Isso era TEXTO — o
// motor de execução (`execucao-v2/executor.ts`) confere ferramentas contra a
// lista, mas ninguém expressava o destino como ferramenta. Aqui a proibição
// vira função: `despacharDoGerenteGeral` RECUSA destino que não seja gerente,
// e a recusa é o valor de retorno, não uma exceção que alguém possa engolir.
//
// Módulo PURO: sem banco, sem rede, sem sessão. O julgamento é o que precisa
// ser o mesmo toda vez, e é o que precisa de teste.

import {
  GERENTE_GERAL,
  ehGerente,
  ehAgenteDeLinha,
  gerenteDe,
  departamentoDoGerente,
  existeDepartamentoCanonico,
} from "./cadeia";

export interface Demanda {
  /** O que precisa ser feito, em português. Nunca id solto. */
  descricao: string;
  /** Departamento canônico a que a demanda pertence. */
  departamentoId: string;
  /** De que cliente é. Ausente = trabalho interno da casa. */
  clienteId?: string;
  /**
   * A demanda tem aceite comercial? A ficha do GG RECUSA demanda sem aceite —
   * e "não sei" não é "sim": o campo é obrigatório de propósito.
   */
  aceiteComercial: boolean;
  /** Prazo prometido, quando já houver um. */
  prazo?: Date | null;
  correlationId: string;
}

export type ResultadoDoDespacho =
  | {
      decisao: "despachado";
      /** Sempre um gerente. É o contrato deste módulo. */
      paraFuncaoId: string;
      departamentoId: string;
      demanda: Demanda;
    }
  | { decisao: "recusado"; motivo: string };

/**
 * A PORTA. Recebe a demanda e resolve sozinha o gerente do departamento —
 * quem chama não escolhe destinatário, e por isso não tem como escolher
 * errado. É a forma mais forte da trava: não é "proibido chamar o agente", é
 * "não existe parâmetro para isso".
 */
export function entrarPeloGerenteGeral(demanda: Demanda): ResultadoDoDespacho {
  if (!existeDepartamentoCanonico(demanda.departamentoId)) {
    return { decisao: "recusado", motivo: `Departamento desconhecido: "${demanda.departamentoId}".` };
  }
  if (!demanda.aceiteComercial) {
    return {
      decisao: "recusado",
      motivo:
        "Demanda sem aceite comercial não entra na casa. Volte ao Atendimento para fechar o aceite — produzir antes de aceitar é trabalho que ninguém contratou.",
    };
  }
  const gerente = gerenteDe(demanda.departamentoId)!;
  return despacharDoGerenteGeral(gerente, demanda);
}

/**
 * O despacho com destinatário explícito. Existe para o caso em que o
 * chamador já tem um alvo (retomada, reencaminhamento) — e é exatamente por
 * isso que a trava precisa estar AQUI, e não só na porta acima.
 */
export function despacharDoGerenteGeral(paraFuncaoId: string, demanda: Demanda): ResultadoDoDespacho {
  if (paraFuncaoId === GERENTE_GERAL) {
    return {
      decisao: "recusado",
      motivo: "O Gerente Geral não despacha para si mesmo — demanda que volta para o topo não anda.",
    };
  }
  if (ehAgenteDeLinha(paraFuncaoId)) {
    return {
      decisao: "recusado",
      motivo: `O Gerente Geral não chama agente de linha. "${paraFuncaoId}" executa; quem recebe demanda é o gerente do departamento dele.`,
    };
  }
  if (!ehGerente(paraFuncaoId)) {
    return { decisao: "recusado", motivo: `Destino desconhecido no catálogo: "${paraFuncaoId}".` };
  }
  const departamentoDoDestino = departamentoDoGerente(paraFuncaoId)!;
  if (departamentoDoDestino !== demanda.departamentoId) {
    // Porta errada é pior que porta ausente: a ausente deixa a dúvida viva.
    return {
      decisao: "recusado",
      motivo: `"${paraFuncaoId}" é gerente de ${departamentoDoDestino}, e esta demanda é de ${demanda.departamentoId}.`,
    };
  }
  if (!demanda.aceiteComercial) {
    return { decisao: "recusado", motivo: "Demanda sem aceite comercial não entra na casa." };
  }
  return {
    decisao: "despachado",
    paraFuncaoId,
    departamentoId: demanda.departamentoId,
    demanda,
  };
}

// ─── A SUBIDA: cada departamento é um mundo fechado ──────────────────────────

export type ResultadoDaSubida =
  | { decisao: "subiu"; porFuncaoId: string; departamentoId: string; paraFuncaoId: string }
  | { decisao: "recusado"; motivo: string };

/**
 * O caminho de VOLTA. Ordem do CEO: "cada departamento é um mundo fechado que
 * sobe pelo seu gerente". Agente de linha que fala para fora do próprio
 * departamento é o que produz o cliente ouvindo duas versões da mesma
 * promessa — e o que faz o Gerente Geral saber por último.
 */
export function subirDoDepartamento(porFuncaoId: string, departamentoId: string): ResultadoDaSubida {
  if (!existeDepartamentoCanonico(departamentoId)) {
    return { decisao: "recusado", motivo: `Departamento desconhecido: "${departamentoId}".` };
  }
  const gerente = gerenteDe(departamentoId)!;
  if (porFuncaoId !== gerente) {
    return {
      decisao: "recusado",
      motivo: `"${porFuncaoId}" não fala para fora de ${departamentoId}. Quem sobe é ${gerente} — o departamento tem uma voz só.`,
    };
  }
  // O gerente do PM É o Gerente Geral: a subida dele é ao Diretor.
  const destino = gerente === GERENTE_GERAL ? "diretor" : GERENTE_GERAL;
  return { decisao: "subiu", porFuncaoId, departamentoId, paraFuncaoId: destino };
}
