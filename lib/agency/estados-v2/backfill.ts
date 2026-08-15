// BACKFILL IDEMPOTENTE — deriva, compara, grava só a diferença, conta tudo.
//
// Marco 3. Regras do plano: "backfill idempotente e verificável". Idempotente
// por natureza: derivar duas vezes dá o mesmo valor, e a escrita só acontece
// quando o valor gravado difere do derivado — a segunda rodada é zero
// escrita, e ISSO é verificável no resultado.
//
// `null` do derivador NUNCA vira escrita: entidade sem derivação conhecida é
// contada em `semDerivacao` e aparece no relatório — ausência de mapa é
// achado, não chute.
//
// A persistência entra por interface: o mesmo motor roda no teste (memória),
// no ambiente controlado (SQLite sintético) e, no rollout do M7, em produção
// por lotes.

export interface EntidadeParaBackfill {
  id: string;
  estadoCanonico: string | null;
  /** O material bruto que o derivador precisa (status legado etc.). */
  legado: Record<string, unknown>;
}

export interface ArmazemDeBackfill {
  listar(entidadeTipo: string, lote: number, cursor?: string): Promise<EntidadeParaBackfill[]>;
  gravarEstado(entidadeTipo: string, id: string, estado: string): Promise<void>;
}

export interface ResultadoDoBackfill {
  entidadeTipo: string;
  total: number;
  jaCorretos: number;
  atualizados: number;
  semDerivacao: number;
  idsSemDerivacao: string[];
}

export async function backfillDeEntidade(
  entidadeTipo: string,
  derivar: (legado: Record<string, unknown>) => string | null,
  armazem: ArmazemDeBackfill,
  tamanhoDoLote = 200,
): Promise<ResultadoDoBackfill> {
  const resultado: ResultadoDoBackfill = {
    entidadeTipo, total: 0, jaCorretos: 0, atualizados: 0, semDerivacao: 0, idsSemDerivacao: [],
  };
  let cursor: string | undefined;
  for (;;) {
    const lote = await armazem.listar(entidadeTipo, tamanhoDoLote, cursor);
    if (lote.length === 0) break;
    for (const entidade of lote) {
      resultado.total += 1;
      const derivado = derivar(entidade.legado);
      if (derivado === null) {
        resultado.semDerivacao += 1;
        if (resultado.idsSemDerivacao.length < 50) resultado.idsSemDerivacao.push(entidade.id);
        continue;
      }
      if (entidade.estadoCanonico === derivado) {
        resultado.jaCorretos += 1;
        continue;
      }
      await armazem.gravarEstado(entidadeTipo, entidade.id, derivado);
      resultado.atualizados += 1;
    }
    cursor = lote[lote.length - 1]!.id;
    if (lote.length < tamanhoDoLote) break;
  }
  return resultado;
}
