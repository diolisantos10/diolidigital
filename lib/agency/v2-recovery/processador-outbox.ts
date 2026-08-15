// O PROCESSADOR DO OUTBOX — retentativa exponencial, fila morta, nunca inline.
//
// Marco 6 da V2. O contrato do 05-ESTADOS-E-RECUPERACAO: "retentativa
// exponencial para falha transitória; dead-letter para falha repetida". O
// executor de cada tipo de efeito entra por registro — tipo sem executor é
// FALHA declarada (vai para retry e, insistindo, para a fila morta), nunca
// sucesso silencioso.
//
// Relógio injetado: backoff é testável sem esperar de verdade.

export interface EfeitoPendente {
  id: string;
  tipo: string;
  payload: string;
  tentativas: number;
  chaveIdempotencia: string;
  correlationId: string;
}

export type Executor = (payload: unknown, correlationId: string) => Promise<void>;

export interface ArmazemDeOutbox {
  pendentesProntos(agora: Date, limite: number): Promise<EfeitoPendente[]>;
  marcarEnviado(id: string, em: Date): Promise<void>;
  marcarFalha(id: string, tentativas: number, proximaTentativa: Date, erro: string): Promise<void>;
  marcarMorto(id: string, erro: string): Promise<void>;
}

export const MAX_TENTATIVAS = 5;

/** 1min, 2min, 4min, 8min… — dobra a cada falha, teto de 1h. */
export function proximaTentativaEm(tentativas: number, agora: Date): Date {
  const minutos = Math.min(Math.pow(2, tentativas), 60);
  return new Date(agora.getTime() + minutos * 60_000);
}

export interface ResultadoDoProcessamento {
  processados: number;
  enviados: number;
  reagendados: number;
  mortos: number;
}

export async function processarOutbox(
  executores: Record<string, Executor>,
  armazem: ArmazemDeOutbox,
  agora: Date,
  limite = 20,
): Promise<ResultadoDoProcessamento> {
  const prontos = await armazem.pendentesProntos(agora, limite);
  const resultado: ResultadoDoProcessamento = { processados: 0, enviados: 0, reagendados: 0, mortos: 0 };

  for (const efeito of prontos) {
    resultado.processados += 1;
    const executor = executores[efeito.tipo];
    try {
      if (!executor) {
        throw new Error(`sem executor registrado para o tipo "${efeito.tipo}"`);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(efeito.payload);
      } catch {
        throw new Error("payload não é JSON válido");
      }
      await executor(payload, efeito.correlationId);
      await armazem.marcarEnviado(efeito.id, agora);
      resultado.enviados += 1;
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      const tentativas = efeito.tentativas + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        // Fila morta: a falha PARA DE tentar mas NÃO desaparece — ela vira
        // item com nome no painel, esperando olho humano.
        await armazem.marcarMorto(efeito.id, erro);
        resultado.mortos += 1;
      } else {
        await armazem.marcarFalha(efeito.id, tentativas, proximaTentativaEm(tentativas, agora), erro);
        resultado.reagendados += 1;
      }
    }
  }
  return resultado;
}
