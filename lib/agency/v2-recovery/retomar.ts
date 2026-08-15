// "RETOMAR PROCESSO" — idempotente, exclusivo de PM/Diretor, por correlação.
//
// Marco 6 da V2. O 05: "botão Retomar processo exclusivo de PM/Diretor,
// idempotente; reprocessamento por correlation_id, nunca por duplicação
// manual". Retomar NÃO cria efeito novo: devolve à fila os efeitos desta
// correlação que morreram ou falharam — as MESMAS linhas, as MESMAS chaves de
// idempotência. Rodar duas vezes seguidas: a segunda não encontra nada para
// devolver, e devolver nada é sucesso.

import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

export interface ArmazemDeRetomada {
  /** Efeitos failed/dead desta correlação. */
  efeitosParaRetomar(correlationId: string): Promise<string[]>;
  /** Volta os efeitos para pending com tentativa zerada e próxima tentativa = agora. */
  devolverParaFila(ids: string[], agora: Date): Promise<void>;
  /** O rastro da retomada — quem, quando, o quê. */
  registrarRetomada(correlationId: string, atorId: string, efeitos: number, agora: Date): Promise<void>;
}

export type ResultadoDaRetomada =
  | { ok: true; efeitosDevolvidos: number }
  | { ok: false; motivo: string };

/** PM/Diretor: autoridade de direção, ou perfil que escreve em project-management. */
export function podeRetomar(perfil: PerfilOrganizacional): boolean {
  if (perfil.autoridade === "master" || perfil.autoridade === "director") return true;
  return perfil.departamentos.includes("project-management" as never);
}

export async function retomarProcesso(
  correlationId: string,
  perfil: PerfilOrganizacional,
  atorId: string,
  armazem: ArmazemDeRetomada,
  agora: Date,
): Promise<ResultadoDaRetomada> {
  if (!podeRetomar(perfil)) {
    return { ok: false, motivo: "Retomar processo é ação de PM/Diretor." };
  }
  if (!correlationId.trim()) {
    return { ok: false, motivo: "correlationId é obrigatório — retomada sem correlação é chute." };
  }
  const ids = await armazem.efeitosParaRetomar(correlationId);
  if (ids.length > 0) {
    await armazem.devolverParaFila(ids, agora);
  }
  // Retomada registrada MESMO quando devolveu zero: "tentei retomar e não
  // havia nada" é informação de operação, não ruído.
  await armazem.registrarRetomada(correlationId, atorId, ids.length, agora);
  return { ok: true, efeitosDevolvidos: ids.length };
}
