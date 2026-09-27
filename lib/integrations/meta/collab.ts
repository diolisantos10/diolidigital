// collab.ts — a conferência dos convites de COLABORAÇÃO (1C-C1, 27/09/2026).
//
// ─── O QUE ISTO É, E O QUE NÃO É ─────────────────────────────────────────────
//
// `collaborators` (client.ts) manda o PEDIDO de colaboração junto do post —
// cada username marcado vira COAUTOR e o post aparece no feed dele também,
// mas só DEPOIS que a pessoa aceita. A Meta não tem endpoint para ACEITAR:
// só o painel do Instagram faz isso. O que esta casa PODE fazer, e é o que
// este arquivo faz, é CONFERIR — GET /{media-id}/collaborators — e deixar o
// `invite_status` de cada conta visível para quem opera, para que a agência
// saiba quando precisa cutucar o colaborador fora da API.
//
// ─── FALHA AQUI NUNCA DESFAZ A PUBLICAÇÃO ────────────────────────────────────
//
// O post já está no ar quando esta função é chamada (ver
// `esteira/publicacao.ts`, depois do sucesso de `publishPost`). Não saber o
// `invite_status` é pior "não sei ainda" do que "a peça não saiu" — os dois
// nunca podem virar a mesma coisa. Por isso ela nunca lança: toda falha vira
// `{ ok: false, error }`, e quem chama grava o motivo (`collabJson.erroDaConferencia`)
// em vez de reverter o que já foi ao ar.

import { graphGet } from "./graph";

/** Uma conta convidada e o estado do convite dela, como a Meta devolve. */
export interface ConviteDeColaborador {
  username: string;
  invite_status: string;
}

export type ConferenciaDeCollaborators =
  | { ok: true; convites: ConviteDeColaborador[] }
  | { ok: false; error: string };

/**
 * GET /{media-id}/collaborators — reconsulta o estado dos convites de
 * colaboração de uma peça JÁ PUBLICADA. Chamada logo depois do sucesso de
 * `publishPost` (best-effort) e de novo, sob demanda, pela rota
 * `/api/social-posts/[id]/collab/conferir`.
 */
export async function conferirCollaborators(
  mediaId: string,
  token: string,
): Promise<ConferenciaDeCollaborators> {
  try {
    const resposta = await graphGet<{ data?: unknown }>(`${mediaId}/collaborators`, token);
    const bruto = Array.isArray(resposta?.data) ? resposta.data : [];
    const convites = bruto.filter(
      (c): c is ConviteDeColaborador =>
        !!c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).username === "string" &&
        typeof (c as Record<string, unknown>).invite_status === "string",
    );
    return { ok: true, convites };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "erro desconhecido ao conferir collaborators",
    };
  }
}

/** O valor de `invite_status` que significa "ainda esperando a pessoa aceitar
 *  pelo painel do Instagram" — é o que a rota de pendentes filtra. A Meta não
 *  documenta o enum completo; comparação em minúsculas por segurança contra
 *  variação de caixa entre versões da API. */
export const INVITE_STATUS_PENDENTE = "pending";

export function convitePendente(c: ConviteDeColaborador): boolean {
  return c.invite_status?.toLowerCase() === INVITE_STATUS_PENDENTE;
}
