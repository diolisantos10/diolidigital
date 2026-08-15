// O REGISTRO ÚNICO DE EXECUTORES DE SAÍDA DA V2 — e por que ele saiu da rota.
//
// Cada tipo de efeito do `OutboxV2` só acontece se tiver executor aqui. Tipo
// sem executor é FALHA declarada (retry → fila morta), nunca sucesso silencioso
// — ver `processador-outbox.ts`.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
//
// O mapa morava dentro de `app/api/cron/v2/route.ts`, e a trava de CI que o
// vigia (`__tests__/v2/outbox-sem-dono-nao-ganha-executor.test.ts`) lia CHAVE
// LITERAL do código-fonte. Isso passava CALADO com três escritas normais:
//
//     { ...OUTROS_EXECUTORES }        // spread
//     { [TIPO_WHATSAPP]: enviar }     // chave computada
//     Object.assign(EXECUTORES, {…})  // mutação depois da declaração
//
// Nenhuma é má-fé — **spread é exatamente o que qualquer um faz ao modularizar
// executores**, e é aí que a trava soltava em silêncio: no dia em que passou a
// importar. Trava que depende da forma como o código foi escrito é trava que o
// próximo refactor desliga sem avisar ninguém.
//
// Com o registro exportado daqui, a trava lê o **mapa efetivo** (`Object.keys`
// em tempo de execução). Spread, chave computada e `Object.assign` aparecem
// todos, porque ela não lê mais o texto: lê o objeto.
//
// ⚠️ Registro é UM. A rota do relógio importa este mapa e não declara o próprio
// — há teste que reprova qualquer segundo registro, porque um segundo registro
// é um caminho de saída que a trava não vigia.

import type { Executor } from "./processador-outbox";

export const EXECUTORES_DE_SAIDA: Record<string, Executor> = {
  // O primeiro executor real: um registro de log estruturado — usado pelos
  // testes de ponta e pelo piloto sintético do M7. Efeitos com consequência
  // externa (mensagem, publicação) ganham executor quando o fluxo que os
  // enfileira for ligado por flag, nunca antes.
  registro_de_teste: async (payload, correlationId) => {
    console.log("[cron/v2] efeito de teste processado", { payload, correlationId });
  },
};

/** As chaves EFETIVAS do registro, em tempo de execução — o que a trava lê. */
export function tiposDeEfeitoRegistrados(): string[] {
  return Object.keys(EXECUTORES_DE_SAIDA);
}
