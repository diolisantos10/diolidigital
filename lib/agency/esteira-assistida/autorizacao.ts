// A AUTORIZAÇÃO DA ESTEIRA — por WORKSPACE, não pelo id do cliente.
//
// ─── POR QUE ISTO EXISTE (16/08/2026) ──────────────────────────────────────
//
// A allowlist do piloto assistido nasceu presa ao `clientId` (regra 3 da
// ativação, 15/08). Estava certa para um piloto de um cliente só, e quebrou
// no primeiro dia de operação de verdade:
//
//   1. O CEO zerou a agência (modo inauguração). `POST /api/admin/reset`
//      apaga `Client` e `ClientRequestDb` — e NÃO apaga `AgencyWorkspace`
//      nem `FlagV2`. A chave `v2_execucao` continuou virada, apontando para
//      um `clientId` que deixou de existir.
//   2. O CityJobs foi recadastrado e nasceu com id NOVO, fora da allowlist.
//   3. O briefing dele entrou, virou linha em `ClientRequestDb` e o motor
//      recusou — CALADO. A tela dizia "em breve você saberá o orçamento".
//
// O defeito não é a allowlist: é o ESCOPO dela morrer junto com o cliente.
// Autorização amarrada a uma entidade que o próprio produto apaga é
// autorização que se perde sem avisar, e ninguém repara porque o sintoma é
// silêncio.
//
// ─── A DECISÃO ─────────────────────────────────────────────────────────────
//
// A autorização passa a ser POR WORKSPACE, com registro de quem decidiu.
// O workspace é a AGÊNCIA: ele sobrevive ao reset, sobrevive a apagar cliente,
// sobrevive a fundir ficha duplicada. Ligar a esteira é decisão sobre a
// agência ("esta casa opera com o motor V2"), não sobre um cliente.
//
// O escopo por cliente NÃO morreu: continua valendo como camada MAIS
// ESPECÍFICA, e é por ela que se faz o oposto — DESLIGAR um cliente
// individual sem desligar a casa (`flagLigada` devolve a linha mais
// específica que achar, então `false` no cliente vence `true` no workspace).
//
// O que continua proibido, e continua em código: `global`. Ligar a esteira
// para todas as agências do mundo a partir de um clique é o que a regra 3
// barrou, e ela segue de pé em `virarChaveDoPiloto`.

import { FLAGS_V2, flagLigada, type ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";

/**
 * Os escopos que a esteira consulta, do mais específico ao mais geral.
 * A ORDEM é o mecanismo: cliente vence workspace, workspace vence ausência.
 * Nunca inclui `"global"` — quem acrescenta o global é `flagLigada`, e
 * `virarChaveDoPiloto` recusa gravá-lo.
 */
export function escoposDeAutorizacao(clienteId?: string | null, workspaceId?: string | null): string[] {
  const escopos: string[] = [];
  if (clienteId?.trim()) escopos.push(clienteId.trim());
  if (workspaceId?.trim()) escopos.push(workspaceId.trim());
  return escopos;
}

export type ResultadoDaAutorizacao =
  | { autorizada: true; escopos: string[] }
  | { autorizada: false; motivo: string; escopos: string[] };

/**
 * A pergunta única: esta esteira pode rodar para este cliente, nesta casa?
 *
 * Fail-closed: sem workspace conhecido não há autorização possível — e o
 * motivo sai ESCRITO, em português, para virar linha visível. Recusa que não
 * explica é a recusa que custou meia hora ao CEO.
 */
export async function esteiraAutorizada(
  entrada: { clienteId?: string | null; workspaceId?: string | null; nomeDoCliente?: string | null },
  armazem: ArmazemDeFlags,
): Promise<ResultadoDaAutorizacao> {
  const escopos = escoposDeAutorizacao(entrada.clienteId, entrada.workspaceId);
  const quem = entrada.nomeDoCliente?.trim() || entrada.clienteId?.trim() || "cliente sem nome";

  if (!entrada.workspaceId?.trim()) {
    return {
      autorizada: false,
      escopos,
      motivo:
        `A solicitação de "${quem}" não tem agência (workspace) definida, e a autorização da esteira é por agência. ` +
        `Sem dono, o motor não roda — adote a solicitação para uma agência antes.`,
    };
  }

  const ligada = await flagLigada(FLAGS_V2.execucao, escopos, armazem);
  if (ligada) return { autorizada: true, escopos };

  return {
    autorizada: false,
    escopos,
    motivo:
      `A esteira automática está DESLIGADA para "${quem}". A chave "${FLAGS_V2.execucao}" não está ligada ` +
      `nem para este cliente nem para esta agência. Ligue em Ajustes → Esteira (ou POST /api/v2/assistido ` +
      `com acao "ligar_agencia") — a decisão fica registrada com o nome de quem ligou.`,
  };
}
