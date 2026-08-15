"use client";

// O contrato que TODA aba do workspace cumpre.
//
// As doze abas recebem exatamente as mesmas três coisas: o cliente inteiro, a
// permissão de quem está olhando e o jeito de pular para outra aba. É de
// propósito — quando cada aba inventava a própria assinatura, duas delas
// recalculavam permissão a partir do papel e uma terceira nem recebia, o que
// dava três respostas para "pode escrever aqui?" na mesma tela.

import { SubNav } from "./primitives";
import type { AgencyClientView } from "@/lib/agency/clients/workspace/vista";
import type { PermissoesDoWorkspace } from "@/lib/agency/clients/workspace/permissoes";
import type { ClientWorkspaceTabId } from "./client-workspace-tabs";

export type PropsDaAba = {
  view: AgencyClientView;
  perms: PermissoesDoWorkspace;
  setTab: (t: ClientWorkspaceTabId) => void;
};

/**
 * A permissão de escrita DESTA aba, em duas formas prontas para a tela.
 *
 * A tela nunca pergunta "qual é o papel?" — ela pergunta "posso escrever
 * aqui?". Quem responde é o pacote montado no servidor.
 */
export function escritaDaAba(perms: PermissoesDoWorkspace, aba: ClientWorkspaceTabId) {
  const pode = perms.escrita[aba];
  return {
    pode,
    /** `undefined` quando pode — para espalhar direto no `<Acao>`. */
    motivo: pode ? undefined : (perms.motivo[aba] ?? "Sem permissão de escrita nesta área."),
  };
}

export { SubNav };
