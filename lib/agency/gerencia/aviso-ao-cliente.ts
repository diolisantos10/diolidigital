// A ENTREGA DA FALA DO GERENTE GERAL — o único efeito externo desta frente.
//
// Vive fora da rota de propósito: efeito que toca o cliente precisa de teste
// próprio, e o que só existe dentro de um `Record` dentro de um `route.ts` não
// tem como ser provado sem subir servidor.
//
// ── A TRAVA, E POR QUE ELA É DUPLA ──────────────────────────────────────────
//
// 1. `voz-unica.ts` já garante QUEM fala (só o Gerente Geral).
// 2. Aqui se decide SE sai. `v2_execucao` tem de estar ligada no escopo
//    DAQUELE cliente — allowlist por clienteId, jamais global, que é a regra 3
//    da ativação. Sem linha de flag = desligada (fail-closed).
//
// Desligada, o efeito FALHA declarado: o processador do outbox retenta e, no
// limite, manda para a fila morta. Nada é enviado e nada é perdido. É o
// contrário do silêncio: o aviso fica visível, esperando a decisão de ligar.

import { flagLigada, FLAGS_V2, type ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";
import { VOZ_DO_CLIENTE } from "./voz-unica";

export interface CargaDoAviso {
  clienteId?: string;
  autorNome?: string;
  corpo?: string;
}

export interface DepsDoAviso {
  armazemDeFlags: ArmazemDeFlags;
  gravarMensagem(dados: { clienteId: string; autorNome: string; corpo: string }): Promise<void>;
}

export async function entregarAvisoAoCliente(
  payload: unknown,
  correlationId: string,
  deps: DepsDoAviso,
): Promise<void> {
  const dados = (payload ?? {}) as CargaDoAviso;
  if (!dados.clienteId || !dados.corpo?.trim()) {
    throw new Error(
      `mensagem_ao_cliente (${correlationId}) sem cliente ou sem corpo — efeito incompleto não vira mensagem.`,
    );
  }
  const ligada = await flagLigada(FLAGS_V2.execucao, [dados.clienteId], deps.armazemDeFlags);
  if (!ligada) {
    throw new Error(
      `v2_execucao desligada no escopo ${dados.clienteId}: o aviso de atraso fica na fila. Ligar é decisão registrada, com motivo e dono — nunca efeito de deploy.`,
    );
  }
  await deps.gravarMensagem({
    clienteId: dados.clienteId,
    autorNome: dados.autorNome ?? VOZ_DO_CLIENTE,
    corpo: dados.corpo,
  });
}
