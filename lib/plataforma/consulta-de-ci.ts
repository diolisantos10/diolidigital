// Perguntar ao GitHub: este commit tem prova? E o Actions está de pé?
//
// ── POR QUE ISTO É UM MÓDULO, E NÃO CÓDIGO SOLTO NO SCRIPT ──────────────────
// Duas coisas precisam da MESMA resposta e não podem divergir:
//   • o sentinela (`scripts/sentinela-do-deploy.mts`), que denuncia depois;
//   • a porta de emergência (`scripts/deploy-de-emergencia.mts`), que precisa
//     registrar em que estado a CI estava no instante em que alguém forçou.
//
// Se cada um perguntasse do seu jeito, bastaria um deles esquecer um detalhe
// para "sem prova" virar verde de um lado só. O detalhe, aliás, já mordeu uma
// vez: `?head_sha=` exige o SHA COMPLETO — com o SHA curto (que é o que
// /api/health devolve) a API responde `total_count: 0`, ou seja "não existe
// CI", para um commit que pode ter CI verde. Está resolvido aqui, uma vez.

import type { ConclusaoDeCI, EstadoDaPlataforma, ProvaDeCI } from "./sentinela-do-deploy.ts";

/** O único workflow que conta como portão. Um cron verde não prova nada sobre o código. */
export const NOME_DO_WORKFLOW_DE_PORTAO = "CI";

export const REPO_PADRAO = "diolisantos10/diolidigital";

export function cabecalhosDoGitHub(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  const tok = process.env.GITHUB_TOKEN;
  // O token entra no cabeçalho e NUNCA em log — nem em mensagem de erro, que é
  // por onde segredo costuma vazar sem ninguém perceber.
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

export async function comTempoLimite(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export type ProvaEncontrada = ProvaDeCI & { shaCompleto: string | null };

/**
 * A CI daquele commit. Aceita SHA curto ou completo — resolve antes de perguntar.
 *
 * Falha de rede devolve "não houve run", que é o caminho MAIS severo do
 * veredito (SEM_PROVA). Não conseguir perguntar nunca pode virar aprovação.
 */
export async function olharCI(commit: string, repo = REPO_PADRAO): Promise<ProvaEncontrada> {
  const vazio: ProvaEncontrada = { houveRun: false, conclusao: null, url: null, shaCompleto: null };

  let shaCompleto: string;
  if (/^[0-9a-f]{40}$/i.test(commit)) {
    shaCompleto = commit.toLowerCase();
  } else {
    try {
      const rc = await comTempoLimite(`https://api.github.com/repos/${repo}/commits/${commit}`, {
        headers: cabecalhosDoGitHub(),
      });
      if (!rc.ok) return vazio;
      shaCompleto = ((await rc.json()) as { sha: string }).sha;
    } catch {
      return vazio;
    }
  }

  try {
    const rr = await comTempoLimite(
      `https://api.github.com/repos/${repo}/actions/runs?head_sha=${shaCompleto}&per_page=50`,
      { headers: cabecalhosDoGitHub() },
    );
    if (!rr.ok) return { ...vazio, shaCompleto };
    const j = (await rr.json()) as {
      workflow_runs: { name: string; conclusion: string | null; status: string; html_url: string }[];
    };
    const runs = j.workflow_runs.filter((r) => r.name === NOME_DO_WORKFLOW_DE_PORTAO);
    if (runs.length === 0) return { ...vazio, shaCompleto };

    // Run ainda em andamento NÃO é prova: `conclusion` vem null e o veredito
    // cai em SEM_PROVA, que é o certo — a CI ainda não disse nada.
    const verde = runs.find((r) => r.conclusion === "success");
    const escolhido = verde ?? runs[0];
    return {
      houveRun: true,
      conclusao: (escolhido.conclusion ?? null) as ConclusaoDeCI | null,
      url: escolhido.html_url,
      shaCompleto,
    };
  } catch {
    return { ...vazio, shaCompleto };
  }
}

/** O GitHub Actions em si está de pé? */
export async function olharPlataforma(): Promise<EstadoDaPlataforma & { incidente: string | null }> {
  try {
    const r = await comTempoLimite("https://www.githubstatus.com/api/v2/summary.json");
    if (!r.ok) return { actionsOperacional: true, incidente: null };
    const j = (await r.json()) as {
      components: { name: string; status: string }[];
      incidents: { name: string; status: string }[];
    };
    const actions = j.components.find((c) => c.name === "Actions");
    const ok = !actions || actions.status === "operational";
    const inc = j.incidents.find((i) => /actions/i.test(i.name));
    return { actionsOperacional: ok, incidente: inc ? inc.name : null };
  } catch {
    // Não conseguir falar com o status page NÃO pode virar "está tudo bem" nem
    // "está tudo mal": assumimos operacional, que é o caminho MAIS severo do
    // veredito (SEM_PROVA grave em vez de atenção).
    return { actionsOperacional: true, incidente: null };
  }
}
