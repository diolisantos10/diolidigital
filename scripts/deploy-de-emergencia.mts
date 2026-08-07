/**
 * PORTA DE EMERGÊNCIA DO DEPLOY — subir com a CI fora do ar, deixando rastro.
 *
 *     npm run deploy:emergencia -- \
 *       --quem="Dioli" \
 *       --motivo="GitHub Actions em major outage; portal do cliente fora" \
 *       --confirmo
 *
 *     # ensaio, não sobe nada:
 *     npm run deploy:emergencia -- --quem=… --motivo=… --confirmo --ensaio
 *
 * ── O QUE ELE FAZ, NESTA ORDEM ──────────────────────────────────────────────
 *   1. Descobre qual commit iria para produção (topo da branch, no GitHub).
 *   2. Pergunta ao GitHub em que estado a CI daquele commit está — usando a
 *      MESMA régua do sentinela (`julgarProva`), para "sem CI" nunca contar
 *      como verde nem aqui.
 *   3. Aplica a regra da porta (`podeForcar`): sem quem, sem motivo, sem
 *      confirmação — não abre. Com o portão já liberando — não abre.
 *   4. ESCREVE O REGISTRO ANTES DE SUBIR. Se não deu para registrar, não sobe.
 *   5. Abre o portão pelo tempo do disparo, dispara, e FECHA de novo no
 *      `finally` — com releitura, porque "mandei fechar" não é "está fechado".
 *
 * Precisa de RAILWAY_TOKEN no ambiente. O token nunca aparece em log.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { julgarProva } from "../lib/plataforma/sentinela-do-deploy.ts";
import { cabecalhosDoGitHub, comTempoLimite, olharCI, olharPlataforma, REPO_PADRAO } from "../lib/plataforma/consulta-de-ci.ts";
import { montarRegistro, podeForcar } from "../lib/plataforma/porta-de-emergencia.ts";
import {
  // `ajustarPortao` saiu de propósito: a porta de emergência não mexe mais no
  // portão do CI. Ver o bloco do disparo, mais abaixo.
  BRANCH_DE_PRODUCAO,
  dispararDeploy,
  lerPortao,
  ultimasImplantacoes,
} from "../lib/plataforma/railway-portao.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO_DE_REGISTRO = resolve(RAIZ, "docs/deploys/emergencias.md");

const CABECALHO_DO_REGISTRO = `# Subidas forçadas — o registro da porta de emergência

> Cada entrada aqui é uma vez em que a produção recebeu código **sem prova de
> CI**, de propósito, porque alguém decidiu que o risco de não subir era maior.
> Escrito por \`scripts/deploy-de-emergencia.mts\`, antes da subida acontecer.
>
> **Se esta lista começar a crescer, o problema não é a lista.** Porta de
> emergência usada com frequência é o caminho normal com outro nome, e aí o
> portão do deploy virou decoração.
`;

function argumento(nome: string): string {
  const p = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(p));
  return achado ? achado.slice(p.length) : "";
}

/** O commit que o Railway vai pegar: o topo da branch de produção, no remoto. */
function topoDaBranchDeProducao(): string {
  const saida = execFileSync("git", ["ls-remote", "origin", BRANCH_DE_PRODUCAO], { encoding: "utf8" });
  const sha = saida.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) {
    throw new Error(`Não consegui descobrir o topo de ${BRANCH_DE_PRODUCAO} no remoto. Sem saber o commit, não se força nada.`);
  }
  return sha.toLowerCase();
}

async function assuntoDoCommit(sha: string): Promise<string> {
  try {
    return execFileSync("git", ["log", "-1", "--format=%s", sha], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    /* commit pode não existir localmente */
  }
  try {
    const r = await comTempoLimite(`https://api.github.com/repos/${REPO_PADRAO}/commits/${sha}`, {
      headers: cabecalhosDoGitHub(),
    });
    if (!r.ok) return "(assunto não disponível)";
    const j = (await r.json()) as { commit?: { message?: string } };
    return (j.commit?.message ?? "").split("\n")[0] || "(assunto não disponível)";
  } catch {
    return "(assunto não disponível)";
  }
}

/** Rastro nº 2: uma issue no repositório. Melhor esforço — o arquivo é o obrigatório. */
async function abrirIssueDoRastro(titulo: string, corpo: string): Promise<string | null> {
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const r = await comTempoLimite(`https://api.github.com/repos/${REPO_PADRAO}/issues`, {
      method: "POST",
      headers: { ...cabecalhosDoGitHub(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: titulo, body: corpo }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { html_url?: string };
    return j.html_url ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const ensaio = process.argv.includes("--ensaio");

  // 1. Qual commit vai subir.
  const commit = topoDaBranchDeProducao();
  const assunto = await assuntoDoCommit(commit);

  // 2. Em que estado está a prova desse commit — mesma régua do sentinela.
  const [ci, plataforma] = await Promise.all([olharCI(commit), olharPlataforma()]);
  const prova = julgarProva({ ci, plataforma });

  console.log("");
  console.log(`   commit ...... ${commit.slice(0, 7)} — ${assunto}`);
  console.log(`   CI .......... ${prova.codigo} · ${prova.resumo}`);
  if (ci.url) console.log(`   run ......... ${ci.url}`);
  console.log("");

  // 3. A regra da porta.
  const decisao = podeForcar(
    {
      quem: argumento("quem") || process.env.DEPLOY_QUEM || "",
      motivo: argumento("motivo"),
      confirmado: process.argv.includes("--confirmo"),
      insistiuComAprovado: process.argv.includes("--mesmo-aprovado"),
    },
    prova.codigo,
  );
  if (!decisao.liberado) {
    console.error(`🚫 Não vou forçar: ${decisao.erro}`);
    process.exit(1);
  }

  const quem = argumento("quem") || process.env.DEPLOY_QUEM || "";
  const motivo = argumento("motivo");

  // 4. O REGISTRO VEM ANTES DA SUBIDA. Sem registro, não sobe.
  const entrada = montarRegistro({
    quando: new Date(),
    quem,
    motivo,
    commit,
    assunto,
    prova: prova.codigo,
    resumoDaProva: prova.resumo,
    urlDaCI: ci.url,
    incidente: plataforma.incidente,
  });

  if (ensaio) {
    console.log("── ENSAIO (--ensaio): nada foi escrito, nada foi disparado ──");
    console.log(entrada);
    const p = await lerPortao();
    console.log(`   portão agora: ${p.esperaPelaCI ? "LIGADO" : "DESLIGADO"} · workflows reconhecidos: ${p.workflowsReconhecidos}`);
    console.log("");
    process.exit(0);
  }

  try {
    mkdirSync(dirname(ARQUIVO_DE_REGISTRO), { recursive: true });
    if (!existsSync(ARQUIVO_DE_REGISTRO)) writeFileSync(ARQUIVO_DE_REGISTRO, CABECALHO_DO_REGISTRO, "utf8");
    appendFileSync(ARQUIVO_DE_REGISTRO, entrada, "utf8");
    // Reler é o que prova que ficou gravado.
    if (!readFileSync(ARQUIVO_DE_REGISTRO, "utf8").includes(commit)) {
      throw new Error("o registro não voltou do disco com o commit dentro");
    }
  } catch (e) {
    console.error(`🚫 Não consegui gravar o registro (${e instanceof Error ? e.message : String(e)}).`);
    console.error("   Porta de emergência sem rastro não abre. Nada foi disparado.");
    process.exit(1);
  }
  console.log(`📝 Registro gravado em docs/deploys/emergencias.md`);

  const urlDaIssue = await abrirIssueDoRastro(`🚨 Subida forçada sem prova de CI: ${commit.slice(0, 7)}`, entrada);
  if (urlDaIssue) console.log(`📣 Issue de rastro: ${urlDaIssue}`);
  else console.log("⚠️  Não consegui abrir a issue de rastro (GitHub fora ou sem token). O arquivo é o rastro.");

  // 5. O DISPARO — com o portão INTACTO.
  //
  // Aqui o script desligava o "Wait for CI", disparava e religava no `finally`.
  // Duas coisas erradas com isso, as duas custaram uma emergência de verdade:
  //
  //   • O token de projeto RECUSA `deploymentTriggerUpdate` — então em 06 e
  //     07/08/2026 nem chegava a disparar: a porta de emergência simplesmente
  //     não abria, e o conserto de produção subiu à mão.
  //   • Mesmo que funcionasse, existia uma JANELA com a produção sem portão. Se
  //     o processo morresse entre o desligar e o religar, ela ficava aberta para
  //     sempre — e o próprio script já previa esse desastre num `console.error`.
  //
  // `serviceInstanceDeployV2` dispara o commit nomeado sem passar pelo portão.
  // Não há o que desligar, então não há janela, nem religamento que possa
  // falhar. A trava da casa fica de pé durante a própria emergência.
  try {
    const implantacao = await dispararDeploy(commit);
    console.log(`🚀 Deploy disparado no Railway (implantação ${implantacao}).`);
    console.log("🔒 O portão do deploy NÃO foi tocado — continua como estava.");
    appendFileSync(
      ARQUIVO_DE_REGISTRO,
      `- **Resultado:** deploy disparado no Railway — implantação \`${implantacao}\`, commit \`${commit.slice(0, 7)}\`, portão do CI intacto.\n`,
      "utf8",
    );
  } catch (e) {
    // O registro é escrito ANTES do disparo (de propósito: sem rastro não
    // sobe). O preço é que uma tentativa que falha deixa no arquivo uma linha
    // que parece uma subida. Descoberto testando de verdade em 06/08/2026,
    // quando o token do Railway recusou o disparo DEPOIS do registro gravado.
    // Registro que mente sobre o que aconteceu é pior do que registro nenhum.
    const porque = e instanceof Error ? e.message : String(e);
    appendFileSync(ARQUIVO_DE_REGISTRO, `- **Resultado: O DISPARO FALHOU** — ${porque} (nada subiu).\n`, "utf8");
    throw e;
  }

  const impl = await ultimasImplantacoes(3).catch(() => []);
  if (impl.length) {
    console.log("");
    for (const d of impl) console.log(`   ${d.criadaEm}  ${d.status}`);
  }
  console.log("");
  console.log("Falta uma coisa, e ela é sua: commitar o registro.");
  console.log('   git commit docs/deploys/emergencias.md -m "registro: subida forçada"');
  console.log("");
}

void main().catch((e: unknown) => {
  console.error(`Falhou: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
