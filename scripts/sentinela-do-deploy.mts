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

import { julgarDeploy } from "../lib/plataforma/sentinela-do-deploy.ts";
import { olharCI, olharPlataforma, REPO_PADRAO } from "../lib/plataforma/consulta-de-ci.ts";
import { olharProducao } from "../lib/plataforma/consulta-da-producao.ts";

const PRODUCAO = process.env.SENTINELA_URL ?? "https://dioli-agency-os-1-production.up.railway.app";
const REPO = process.env.SENTINELA_REPO ?? REPO_PADRAO;

// 1. A produção (está de pé, e qual versão?) saiu daqui e virou
//    `lib/plataforma/consulta-da-producao.ts` — a distância do deploy
//    precisa da MESMA pergunta, e as duas cópias já tinham divergido: só a
//    outra capturava o MOTIVO da falha. `.falha` não é usado aqui, mas a
//    chamada de rede e o parse do JSON são um código só.
//
// 2. A CI daquele commit e 3. o estado do Actions saíram daqui e viraram
//    `lib/plataforma/consulta-de-ci.ts` — a porta de emergência precisa das
//    MESMAS perguntas, e duas cópias é como um dos lados volta a ler ausência
//    como aprovação.

async function main(): Promise<void> {
  const [producao, plataforma] = await Promise.all([olharProducao(PRODUCAO), olharPlataforma()]);
  const ci = producao.commit
    ? await olharCI(producao.commit, REPO)
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
