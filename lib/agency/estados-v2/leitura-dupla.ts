// LEITURA DUPLA — o legado e o derivado lado a lado, e a diferença vira dado.
//
// Marco 3. Regra do plano: "rodar leitura dupla para comparação; medir
// divergências antes de promover". Divergência NUNCA vira exceção para o
// usuário — vira linha de relatório (`ReconciliacaoV2`), porque o objetivo da
// leitura dupla é medir, não quebrar.
//
// O veredito é binário e honesto:
//   "promovivel"      — zero divergências num conjunto não-vazio
//   "nao_promovivel"  — qualquer divergência, ou conjunto vazio (não medir
//                       não é passar — é o guardrail 1 da casa)

export interface ComparacaoDeEntidade {
  id: string;
  gravado: string | null;
  derivado: string | null;
}

export interface Divergencia {
  id: string;
  gravado: string | null;
  derivado: string | null;
}

export interface RelatorioDeReconciliacao {
  entidadeTipo: string;
  total: number;
  divergentes: number;
  amostra: Divergencia[];
  veredito: "promovivel" | "nao_promovivel";
}

export function reconciliar(
  entidadeTipo: string,
  comparacoes: ComparacaoDeEntidade[],
  tamanhoDaAmostra = 20,
): RelatorioDeReconciliacao {
  const divergencias: Divergencia[] = [];
  for (const c of comparacoes) {
    // Divergência é QUALQUER diferença — inclusive derivado null (sem mapa) e
    // gravado null (backfill não passou). As duas ausências contam.
    if (c.gravado !== c.derivado) {
      divergencias.push({ id: c.id, gravado: c.gravado, derivado: c.derivado });
    }
  }
  return {
    entidadeTipo,
    total: comparacoes.length,
    divergentes: divergencias.length,
    amostra: divergencias.slice(0, tamanhoDaAmostra),
    veredito: comparacoes.length > 0 && divergencias.length === 0 ? "promovivel" : "nao_promovivel",
  };
}
