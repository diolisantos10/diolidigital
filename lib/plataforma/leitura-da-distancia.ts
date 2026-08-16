// A metade de I/O de `distancia-do-deploy.ts`: pergunta à produção e ao git,
// e devolve o fato OU a falha — nunca lança para quem chama.
//
// Separado do julgamento puro pelo mesmo motivo do sentinela: o julgamento é
// testável sem rede nem `git`; só este arquivo fala com o mundo de fora.

import { execFileSync } from "node:child_process";
import type { CommitDaBranch } from "./distancia-do-deploy";
import { comTempoLimite } from "./consulta-de-ci";

/** O que a produção respondeu sobre si mesma, ou por que não respondeu. */
export type LeituraDaProducao = {
  noAr: boolean;
  commit: string | null;
  falha: string | null;
};

/** O histórico da branch, ou por que não foi possível lê-lo. */
export type LeituraDoHistorico = {
  historico: CommitDaBranch[];
  falha: string | null;
  /** `git fetch` falhou mas o histórico local foi usado assim mesmo — pode estar velho. */
  avisoDeFetch: string | null;
};

/**
 * Pergunta a `{url}/api/health` qual commit está no ar.
 *
 * Resposta não-ok, timeout ou erro de rede viram `falha` preenchida — nunca
 * `noAr: true` por otimismo. É essa distinção que separa "não consegui olhar"
 * de "está em dia" lá no veredito.
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

/**
 * O histórico de `origin/<branch>`, do mais novo para o mais antigo.
 *
 * Tenta `git fetch` antes; se o fetch falhar, segue com o histórico local
 * (sem rede, um histórico velho ainda diz algo) mas registra o aviso à parte
 * — quem lê precisa saber que ele pode estar desatualizado.
 */
export function historicoDaBranch(branch: string, limite = 200): LeituraDoHistorico {
  let avisoDeFetch: string | null = null;
  try {
    execFileSync("git", ["fetch", "origin", branch], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    avisoDeFetch = `git fetch origin ${branch} falhou — histórico local pode estar desatualizado`;
  }

  try {
    const saida = execFileSync(
      "git",
      ["log", "--format=%h\t%s", "-n", String(limite), `origin/${branch}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const historico: CommitDaBranch[] = saida
      .split("\n")
      .filter((linha) => linha.length > 0)
      .map((linha) => {
        const [commitCurto, ...resto] = linha.split("\t");
        return { commitCurto: commitCurto ?? "", assunto: resto.join("\t") };
      });
    return { historico, falha: null, avisoDeFetch };
  } catch {
    return { historico: [], falha: `git log falhou para origin/${branch}`, avisoDeFetch };
  }
}
