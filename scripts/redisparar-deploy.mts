/**
 * REDISPARO DO DEPLOY — o commit que JÁ PASSOU na CI e foi descartado mesmo assim.
 *
 *     npm run redisparar                 # topo da branch de produção
 *     npm run redisparar -- --commit=abc1234
 *     npm run redisparar -- --ensaio     # confere e NÃO dispara
 *
 * ─── O INCIDENTE QUE CRIOU ISTO (24/08/2026) ────────────────────────────────
 *
 * Sete commits ficaram fora do ar com a CI VERDE. O Railway criava a
 * implantação, esperava, e ~11 segundos depois de a CI fechar `success` marcava
 * `SKIPPED`. Aconteceu com todos, inclusive com um push único e isolado — e a
 * produção serviu código de sete commits atrás sem um único alarme: CI verde,
 * painel verde, entrega parada. Duas hipóteses foram levantadas e DERRUBADAS
 * com prova (colisão de pushes; check suites paradas). A causa segue aberta.
 *
 * ─── POR QUE ISTO NÃO É A PORTA DE EMERGÊNCIA ───────────────────────────────
 *
 * `deploy-de-emergencia.mts` existe para subir SEM prova de CI, quando a
 * própria CI está fora do ar. É porta de risco, e por isso cobra `--quem`,
 * `--motivo`, `--confirmo` e escreve num registro de subidas forçadas.
 *
 * Este script é o OPOSTO, e a diferença é a razão de ele existir separado:
 *
 *   ⛔ ELE SÓ DISPARA COM A CI VERDE. Sem prova, RECUSA — e recusa usando a
 *      MESMA régua do sentinela (`julgarProva`), para "sem CI" nunca contar
 *      como verde aqui, como não conta lá.
 *
 * Não há nada a forçar: o commit já ganhou o direito de subir e o portão o
 * descartou. Isto reafirma uma decisão que a CI já tomou, não a contorna.
 *
 * ─── E A TRAVA CONTINUA LIGADA ──────────────────────────────────────────────
 *
 * `serviceInstanceDeployV2` (dentro de `dispararDeploy`) **não passa pelo "Wait
 * for CI"** e por isso NÃO exige desligar o portão — o caminho antigo desligava
 * e religava, abrindo uma janela em que todo push ia direto para produção sem
 * CI, e que ficava aberta para sempre se o processo morresse no meio.
 *
 * `checkSuites` fica como está: `true`. Desligar resolveria o travamento e
 * abriria um buraco maior — seria calar o alarme.
 *
 * O token nunca aparece em log, nem aqui nem em erro.
 */

import { execFileSync } from "node:child_process";

import { julgarProva } from "../lib/plataforma/sentinela-do-deploy.ts";
import { olharCI, olharPlataforma } from "../lib/plataforma/consulta-de-ci.ts";
import { BRANCH_DE_PRODUCAO, dispararDeploy, lerPortao, ultimasImplantacoes } from "../lib/plataforma/railway-portao.ts";

function argumento(nome: string): string {
  const p = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(p));
  return achado ? achado.slice(p.length) : "";
}
const ENSAIO = process.argv.includes("--ensaio");

/** O commit que o Railway pegaria: o topo da branch de produção, no remoto. */
function topoDaBranchDeProducao(): string {
  const saida = execFileSync("git", ["ls-remote", "origin", BRANCH_DE_PRODUCAO], { encoding: "utf8" });
  const sha = saida.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) {
    throw new Error(`Não consegui descobrir o topo de ${BRANCH_DE_PRODUCAO} no remoto. Sem saber o commit, não se dispara nada.`);
  }
  return sha.toLowerCase();
}

async function main(): Promise<number> {
  const alvo = (argumento("commit") || topoDaBranchDeProducao()).toLowerCase();
  console.log(`Commit alvo: ${alvo.slice(0, 7)}  ·  branch: ${BRANCH_DE_PRODUCAO}`);

  // ── 1. A PROVA, com a régua do sentinela ────────────────────────────────
  const [ci, plataforma] = await Promise.all([olharCI(alvo), olharPlataforma()]);
  const veredito = julgarProva({ ci, plataforma });
  console.log(`CI: ${veredito.codigo} — ${veredito.resumo}`);

  if (!veredito.temProva) {
    console.error(
      `\n⛔ RECUSADO: este script só redispara commit com CI VERDE, e a prova não veio.\n` +
      `   "${veredito.resumo}"\n\n` +
      `   Se a CI está fora do ar e a produção precisa subir mesmo assim, o caminho\n` +
      `   é OUTRO, de propósito: npm run deploy:emergencia (que cobra quem, motivo e\n` +
      `   deixa registro). Aqui não se sobe sem prova.`,
    );
    return 2;
  }

  // ── 2. JÁ ESTÁ NO AR? ───────────────────────────────────────────────────
  // Redisparar o que já está rodando gasta build e confunde o histórico.
  const [ultima] = await ultimasImplantacoes(1);
  if (ultima && ultima.commit?.toLowerCase().startsWith(alvo.slice(0, 7)) && ultima.status === "SUCCESS") {
    console.log(`\n✅ Nada a fazer: ${alvo.slice(0, 7)} já está no ar (implantação ${ultima.id}).`);
    return 0;
  }

  // ── 3. O PORTÃO CONTINUA LIGADO, E ISSO É DITO ──────────────────────────
  const portao = await lerPortao();
  console.log(
    `Portão "Wait for CI": ${portao.esperaPelaCI ? "LIGADO" : "DESLIGADO"} ` +
    `(${portao.workflowsReconhecidos} workflow(s) reconhecido(s)) — este script NÃO o altera.`,
  );

  if (ENSAIO) {
    console.log("\n🧪 Ensaio: tudo conferido e NADA foi disparado.");
    return 0;
  }

  // ── 4. DISPARA, E DIZ O QUE CRIOU ───────────────────────────────────────
  const id = await dispararDeploy(alvo);
  console.log(`\n🚀 Implantação criada: ${id}`);
  console.log(`   Confira em seguida com: curl -s https://www.diolidigital.com.br/api/health`);
  console.log(`   O que vale é o campo "commit" bater com ${alvo.slice(0, 7)} — nunca o "status: ok".`);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    // Mensagem de erro é por onde segredo costuma vazar. Só a mensagem, nunca o
    // objeto inteiro (que em falha de fetch pode carregar cabeçalhos).
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
