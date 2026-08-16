/**
 * Distância do deploy — "a produção está atrás da branch, e de quantos commits?"
 *
 * Rode a qualquer momento:
 *     npm run distancia
 *
 * O `sentinela-do-deploy.ts` responde "o que está no ar tem CI verde?". Ele
 * não responde DISTÂNCIA — um commit com CI verde ainda pode estar 48 commits
 * atrás do topo da branch. Este script pergunta à produção qual commit está
 * servindo, pergunta ao git o histórico da branch, e cruza as duas respostas.
 *
 * Sai 0 só quando a produção está em dia com o topo da branch.
 * "Não consegui olhar" sai com código PIOR que "atrasada" (2, contra 1): é o
 * estado que hoje se confunde com "está tudo bem", e foi essa confusão —
 * silêncio lido como sinal verde — que deixou 48 commits se acumularem sem
 * ninguém notar em 16/08/2026.
 */

import { historicoDaBranch, olharProducao } from "../lib/plataforma/leitura-da-distancia.ts";
import { julgarDistancia, type VereditoDaDistancia } from "../lib/plataforma/distancia-do-deploy.ts";
import path from "node:path";

const PRODUCAO = process.env.SENTINELA_URL ?? "https://dioli-agency-os-1-production.up.railway.app";
const BRANCH = process.env.DISTANCIA_BRANCH ?? "claude/dioli-agency-os-architecture-kk7kp";

export async function medirDistancia(): Promise<VereditoDaDistancia> {
  const [producao, historico] = await Promise.all([
    olharProducao(PRODUCAO),
    Promise.resolve(historicoDaBranch(BRANCH)),
  ]);

  // Qualquer uma das duas falhando já é "não consegui olhar" — o veredito não
  // distingue QUAL lado falhou, só que a medição não é confiável.
  const falhaAoOlhar = producao.falha ?? historico.falha ?? null;

  // `avisoDeFetch` viaja DENTRO do veredito, não mais como `console.error` à
  // parte: antes disso, um veredito EM_DIA com fetch falho saía medido, exit
  // 0, --json sem menção nenhuma ao fetch — quem consumisse exit code ou JSON
  // não tinha como saber que a base podia estar desatualizada.
  return julgarDistancia({
    producao: { noAr: producao.noAr, commit: producao.commit },
    historico: historico.historico,
    falhaAoOlhar,
    ressalva: historico.avisoDeFetch,
  });
}

const CODIGO_DE_SAIDA: Record<VereditoDaDistancia["codigo"], number> = {
  EM_DIA: 0,
  ATRASADA: 1,
  PRODUCAO_FORA: 2,
  PRODUCAO_SEM_VERSAO: 2,
  COMMIT_DESCONHECIDO: 2,
  NAO_CONSEGUI_OLHAR: 2,
};

/**
 * Veredito com `ressalva` preenchida nunca sai 0, mesmo quando o código é
 * EM_DIA — "em dia segundo um git que pode estar desatualizado" não é "em
 * dia". 2 é o código de "não consegui olhar direito", o mesmo usado para
 * PRODUCAO_FORA e NAO_CONSEGUI_OLHAR: uma ressalva é exatamente esse caso,
 * disfarçado de sucesso.
 */
function codigoDeSaida(v: VereditoDaDistancia): number {
  if (v.ressalva && v.codigo === "EM_DIA") return 2;
  return CODIGO_DE_SAIDA[v.codigo];
}

function imprimir(v: VereditoDaDistancia): void {
  // Ressalva rebaixa o ícone de "ok" para "atenção" mesmo com gravidade "ok"
  // — o mesmo motivo pelo qual ela também rebaixa o exit code em `codigoDeSaida`.
  const gravidadeEfetiva = v.ressalva && v.gravidade === "ok" ? "atencao" : v.gravidade;
  const icone = gravidadeEfetiva === "ok" ? "✅" : gravidadeEfetiva === "atencao" ? "⚠️ " : "🚨";
  console.log("");
  console.log(`${icone} ${v.resumo}`);
  if (v.ressalva) console.log(`   ⚠️  RESSALVA: ${v.ressalva}`);
  if (v.acao) console.log(`   → ${v.acao}`);

  if (v.faltando.length > 0) {
    console.log("");
    const LIMITE_LISTADO = 10;
    for (const c of v.faltando.slice(0, LIMITE_LISTADO)) {
      console.log(`  ${c.commitCurto}  ${c.assunto}`);
    }
    const resto = v.faltando.length - LIMITE_LISTADO;
    if (resto > 0) console.log(`  ... e mais ${resto}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  const v = await medirDistancia();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(v));
  } else {
    imprimir(v);
  }

  process.exit(codigoDeSaida(v));
}

const executadoDireto = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (executadoDireto) void main();
