// A CHAVE DO PILOTO — allowlist por cliente, JAMAIS global. Em código.
//
// Regra 3 da ativação (CEO, 15/08/2026): "Ligar `v2_execucao` somente no
// escopo desse cliente; jamais globalmente." Prompt é aviso; código é trava:
// esta é a ÚNICA função da casa que liga a flag de execução, e ela recusa
// escopo global por construção. Toda virada carrega motivo e quem decidiu.

import { FLAGS_V2 } from "@/lib/agency/flags-v2/flags";

export interface PedidoDeChave {
  /** O clientId do cliente parceiro — escopo específico obrigatório. */
  escopo: string;
  motivo: string;
  decididoPor: string;
  ligar: boolean;
}

export interface ArmazemDeChave {
  gravar(chave: string, escopo: string, ligada: boolean, motivo: string, decididoPor: string): Promise<void>;
}

export type ResultadoDaChave = { ok: true } | { ok: false; motivo: string };

export async function virarChaveDoPiloto(
  pedido: PedidoDeChave,
  armazem: ArmazemDeChave,
): Promise<ResultadoDaChave> {
  const escopo = pedido.escopo?.trim();
  if (!escopo) return { ok: false, motivo: "escopo vazio — a chave do piloto é por cliente, sempre" };
  if (escopo.toLowerCase() === "global" || escopo === "*") {
    return { ok: false, motivo: "v2_execucao JAMAIS liga globalmente — regra 3 da ativação, em código" };
  }
  if (!pedido.motivo?.trim()) return { ok: false, motivo: "chave sem motivo não vira — flag sem procedência é defeito" };
  if (!pedido.decididoPor?.trim()) return { ok: false, motivo: "chave sem decisor não vira" };
  await armazem.gravar(FLAGS_V2.execucao, escopo, pedido.ligar, pedido.motivo, pedido.decididoPor);
  return { ok: true };
}
