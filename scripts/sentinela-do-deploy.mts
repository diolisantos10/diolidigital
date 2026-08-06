/**
 * Sentinela do deploy — "o que está no ar passou pelo portão?"
 *
 * Rode a qualquer momento:
 *     npm run sentinela
 *
 * Ele pergunta três coisas e cruza as respostas:
 *   1. À PRODUÇÃO: você está de pé, e qual commit está servindo? (/api/health)
 *   2. AO GITHUB:  esse commit exato tem CI, e ela fechou verde?
 *   3. AO GITHUB STATUS: o Actions está de pé? (senão, "não tem run" tem outra
 *      leitura — mas continua sendo produção sem prova)
 *
 * Sai 0 só quando a produção está no ar servindo um commit com CI verde.
 * Qualquer outra combinação sai != 0 com o motivo escrito em uma linha.
 *
 * Não precisa de segredo: o repositório é público. Se GITHUB_TOKEN existir,
 * ele é usado só para não esbarrar no limite de requisições.
 */

import { julgarDeploy, type ConclusaoDeCI } from "../lib/plataforma/sentinela-do-deploy.ts";

const PRODUCAO = process.env.SENTINELA_URL ?? "https://dioli-agency-os-1-production.up.railway.app";
const REPO = process.env.SENTINELA_REPO ?? "diolisantos10/diolidigital";
const NOME_DO_WORKFLOW_DE_PORTAO = "CI";

function cabecalhos(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  const tok = process.env.GITHUB_TOKEN;
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

async function comTempoLimite(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** 1. A produção: está de pé, e qual versão? */
async function olharProducao(): Promise<{ noAr: boolean; commit: string | null }> {
  try {
    const r = await comTempoLimite(`${PRODUCAO}/api/health`);
    if (!r.ok) return { noAr: false, commit: null };
    const j = (await r.json()) as { status?: string; commit?: string | null };
    return { noAr: j.status === "ok", commit: j.commit ?? null };
  } catch {
    return { noAr: false, commit: null };
  }
}

/**
 * 2. A CI daquele commit.
 *
 * ATENÇÃO ao detalhe que já enganou: `?head_sha=` exige o SHA COMPLETO. Com o
 * SHA curto (que é o que /api/health devolve) a API responde `total_count: 0` —
 * ou seja, "não existe CI" — para um commit que pode ter CI verde. Um sentinela
 * que caísse nessa gritaria falso todo dia e seria desligado na primeira semana.
 * Por isso resolvemos o SHA completo antes de perguntar.
 */
async function olharCI(commitCurto: string): Promise<{
  houveRun: boolean;
  conclusao: ConclusaoDeCI | null;
  url: string | null;
  shaCompleto: string | null;
}> {
  const vazio = { houveRun: false, conclusao: null, url: null, shaCompleto: null };
  let shaCompleto: string;
  try {
    const rc = await comTempoLimite(`https://api.github.com/repos/${REPO}/commits/${commitCurto}`, {
      headers: cabecalhos(),
    });
    if (!rc.ok) return vazio;
    shaCompleto = ((await rc.json()) as { sha: string }).sha;
  } catch {
    return vazio;
  }

  try {
    const rr = await comTempoLimite(
      `https://api.github.com/repos/${REPO}/actions/runs?head_sha=${shaCompleto}&per_page=50`,
      { headers: cabecalhos() },
    );
    if (!rr.ok) return { ...vazio, shaCompleto };
    const j = (await rr.json()) as {
      workflow_runs: { name: string; conclusion: string | null; status: string; html_url: string }[];
    };
    // Só o workflow de portão conta. Um cron verde não prova nada sobre o código.
    const runs = j.workflow_runs.filter((r) => r.name === NOME_DO_WORKFLOW_DE_PORTAO);
    if (runs.length === 0) return { ...vazio, shaCompleto };
    // Se QUALQUER tentativa fechou verde, o commit tem prova.
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

/** 3. O GitHub Actions em si está de pé? */
async function olharPlataforma(): Promise<{ actionsOperacional: boolean; incidente: string | null }> {
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

async function main(): Promise<void> {
  const [producao, plataforma] = await Promise.all([olharProducao(), olharPlataforma()]);
  const ci = producao.commit
    ? await olharCI(producao.commit)
    : { houveRun: false, conclusao: null, url: null, shaCompleto: null };

  const v = julgarDeploy({ producao, ci, plataforma });

  const icone = v.gravidade === "ok" ? "✅" : v.gravidade === "atencao" ? "⚠️ " : "🚨";
  console.log("");
  console.log(`${icone} ${v.resumo}`);
  if (v.acao) console.log(`   → ${v.acao}`);
  console.log("");
  console.log(`   produção .... ${producao.noAr ? "no ar" : "FORA"}${producao.commit ? ` · ${producao.commit}` : ""}`);
  console.log(
    `   CI .......... ${ci.houveRun ? `${ci.conclusao}${ci.url ? ` · ${ci.url}` : ""}` : "nenhum run para este commit"}`,
  );
  console.log(
    `   GitHub ...... ${plataforma.actionsOperacional ? "Actions operacional" : `Actions FORA${plataforma.incidente ? ` · ${plataforma.incidente}` : ""}`}`,
  );
  console.log("");

  // Para o workflow: dá o veredito mastigado a quem for abrir issue.
  // `GITHUB_OUTPUT` é um arquivo `chave=valor` por linha: um \n no meio do
  // valor quebra o parse e o passo seguinte recebe string vazia — o sentinela
  // ficaria mudo exatamente quando tem algo a dizer. Achatamos antes.
  const saidaDoRunner = process.env.GITHUB_OUTPUT;
  if (saidaDoRunner) {
    const umaLinha = (s: string) => s.replace(/\r?\n/g, " ").trim();
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      saidaDoRunner,
      `codigo=${v.codigo}\n` +
        `gravidade=${v.gravidade}\n` +
        `resumo=${umaLinha(v.resumo)}\n` +
        `acao=${umaLinha(v.acao)}\n`,
    );
  }

  process.exit(v.gravidade === "ok" ? 0 : 1);
}

void main();
