// REGISTRO DE EXECUÇÃO — quem fez: humano ou IA, com todas as letras.
//
// Marco 2 da V2. Determinação literal do CEO (15/08/2026): "o sistema deve
// registrar se cada execução foi humana ou por IA, incluindo ator, modelo,
// versão, custo, data e ferramentas."
//
// Este módulo valida o registro ANTES de persistir — registro inválido não
// entra, e o motivo é nomeado. O `AIRunLog` legado continua existindo; a
// tabela nova (`ExecucaoV2`) é aditiva e o backfill do M3 liga os dois pelo
// correlationId.

export interface RegistroDeExecucao {
  ator: "humano" | "ia";
  /** Obrigatório quando humano: quem. */
  usuarioId?: string;
  /** Obrigatórios quando IA: qual modelo e qual versão. */
  modelo?: string;
  versaoModelo?: string;
  /** Custo em USD quando IA (>= 0). Humano: não se aplica. */
  custoUsd?: number;
  funcaoId: string;
  departamentoId: string;
  ferramentas: string[];
  correlationId: string;
  inicio: Date;
  fim?: Date;
  resultado?: string;
  /** Piloto assistido (regra 6): de que cliente é o trabalho; ausente = interno. */
  clienteId?: string;
  /** As entradas efetivamente usadas — o rastro completo, não só o resultado. */
  entradas?: Record<string, string>;
}

export type ValidacaoDeRegistro = { valido: true } | { valido: false; motivo: string };

export function validarRegistro(r: RegistroDeExecucao): ValidacaoDeRegistro {
  if (r.ator === "humano") {
    if (!r.usuarioId) return { valido: false, motivo: "execução humana sem usuarioId — quem fez?" };
  } else if (r.ator === "ia") {
    if (!r.modelo) return { valido: false, motivo: "execução por IA sem modelo declarado" };
    if (!r.versaoModelo) return { valido: false, motivo: "execução por IA sem versão do modelo" };
    if (r.custoUsd === undefined || r.custoUsd < 0) {
      return { valido: false, motivo: "execução por IA sem custo declarado (use 0 quando o provedor não cobra)" };
    }
  } else {
    return { valido: false, motivo: `ator desconhecido — só existem "humano" e "ia"` };
  }
  if (!r.funcaoId) return { valido: false, motivo: "registro sem função executora" };
  if (!r.departamentoId) return { valido: false, motivo: "registro sem departamento" };
  if (!Array.isArray(r.ferramentas)) return { valido: false, motivo: "ferramentas deve ser lista (vazia quando nenhuma)" };
  if (!r.correlationId) return { valido: false, motivo: "registro sem correlationId — rastro é obrigatório" };
  if (r.fim && r.fim < r.inicio) return { valido: false, motivo: "fim antes do início" };
  return { valido: true };
}
