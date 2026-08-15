// FEATURE FLAGS DA V2 — desligado por padrão, e desligar é o rollback.
//
// Marco 3. Regra do plano de migração: "ativar escrita nova por feature flag"
// e "manter rollback testado". A flag vive no banco (`FlagV2`), com escopo:
// uma linha `global` e, quando preciso, uma linha por workspace/cliente — a
// mais específica vence. Sem linha nenhuma = DESLIGADA (fail-closed, como
// tudo nesta migração).
//
// Toda mudança de flag carrega motivo e quem decidiu — flag virada sem
// procedência é o mesmo defeito da escada sem fala literal.

export const FLAGS_V2 = {
  /** Liga a comparação legado × derivado nas leituras (não muda comportamento visível). */
  leituraDupla: "v2_leitura_dupla",
  /** Liga a ESCRITA do estadoCanonico (backfill e transições passam a gravar). */
  escrita: "v2_escrita",
  /** Liga as superfícies novas do M4+ (Central, PM Command Center…). */
  superficies: "v2_superficies",
} as const;

export interface LinhaDeFlag {
  chave: string;
  escopo: string; // "global" | workspaceId | clientId
  ligada: boolean;
}

export interface ArmazemDeFlags {
  buscar(chave: string, escopos: string[]): Promise<LinhaDeFlag[]>;
}

/**
 * A mais específica vence; ausência = desligada. `escoposDoContexto` vem do
 * chamador em ordem de especificidade (ex.: [clientId, workspaceId]).
 */
export async function flagLigada(
  chave: string,
  escoposDoContexto: string[],
  armazem: ArmazemDeFlags,
): Promise<boolean> {
  const linhas = await armazem.buscar(chave, [...escoposDoContexto, "global"]);
  for (const escopo of [...escoposDoContexto, "global"]) {
    const linha = linhas.find((l) => l.escopo === escopo);
    if (linha) return linha.ligada;
  }
  return false;
}
