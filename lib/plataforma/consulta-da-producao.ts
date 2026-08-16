// UMA pergunta só: o que `{url}/api/health` diz sobre o que está no ar?
//
// ── POR QUE ISTO É UM MÓDULO, E NÃO CÓDIGO SOLTO EM CADA SCRIPT ─────────────
// Existiam DUAS cópias desta mesma pergunta — uma dentro de
// `scripts/sentinela-do-deploy.mts`, outra em `lib/plataforma/leitura-da-distancia.ts`
// — e já tinham divergido: só a segunda capturava o MOTIVO da falha (`falha`).
// Duas fontes da mesma verdade divergem no dia em que alguém mexe numa só, e
// foi exatamente esse tipo de achatamento silencioso — o mesmo `null` que
// engolia três motivos, o mesmo selo "Falhou" para quatro causas — que este
// bloco existe para consertar. Agora há uma chamada de rede e um parse de
// JSON só, aqui, e os dois scripts consomem o mesmo resultado.

import { comTempoLimite } from "./consulta-de-ci";

/** O que a produção respondeu sobre si mesma, ou por que não respondeu. */
export type LeituraDaProducao = {
  noAr: boolean;
  commit: string | null;
  falha: string | null;
};

/**
 * Pergunta a `{url}/api/health` qual commit está no ar.
 *
 * Resposta não-ok, timeout ou erro de rede viram `falha` preenchida — nunca
 * `noAr: true` por otimismo. É essa distinção que separa "não consegui olhar"
 * de "está em dia" em quem consome este resultado.
 */
export async function olharProducao(url: string): Promise<LeituraDaProducao> {
  try {
    const r = await comTempoLimite(`${url}/api/health`);
    if (!r.ok) return { noAr: false, commit: null, falha: `produção respondeu ${r.status}` };
    const j = (await r.json()) as { status?: string; commit?: string | null };
    return { noAr: j.status === "ok", commit: j.commit ?? null, falha: null };
  } catch {
    return { noAr: false, commit: null, falha: "não foi possível falar com a produção" };
  }
}
