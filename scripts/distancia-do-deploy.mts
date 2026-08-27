/**
 * Distância do deploy — "a produção está atrás da branch, e de quantos commits?"
 *
 * Rode a qualquer momento:
 *     npm run distancia
 *
 * O `sentinela-do-deploy.ts` responde "o que está no ar tem CI verde?". Ele
 * não responde DISTÂNCIA — um commit com CI verde ainda pode estar 48 commits
 * atrás do topo da branch. Este script pergunta à produção qual commit está
 * servindo, pergunta ao git o histórico da branch, pergunta ao Railway se há
 * um deploy em voo, e cruza as três respostas.
 *
 * "Atrasada" sozinha não basta: em 16/08/2026 "produção 47 commits atrás" foi
 * lido como "ninguém disparou deploy" quando havia um BUILDING e três WAITING
 * no Railway — a produção estava ALCANÇANDO, não parada. Por isso o exit code
 * não é mais função só do código do veredito: ATRASADA_PUBLICANDO sai 0
 * (a esteira está se resolvendo sozinha) e só ATRASADA_PARADA pede gente.
 * "Não consegui olhar" (fila ou histórico) continua sendo pior que "atrasada
 * mas publicando" — silêncio nunca pode virar sinal verde.
 */

import { historicoDaBranch, olharFilaDeDeploy } from "../lib/plataforma/leitura-da-distancia.ts";
import { olharProducao } from "../lib/plataforma/consulta-da-producao.ts";
import { julgarDistancia, type VereditoDaDistancia } from "../lib/plataforma/distancia-do-deploy.ts";
import path from "node:path";
import { trabalhoSoNoDisco } from "../lib/plataforma/trabalho-so-no-disco.ts";

const PRODUCAO = process.env.SENTINELA_URL ?? "https://dioli-agency-os-1-production.up.railway.app";
const BRANCH = process.env.DISTANCIA_BRANCH ?? "claude/dioli-agency-os-architecture-kk7kp";

export async function medirDistancia(): Promise<VereditoDaDistancia> {
  const [producao, historico, fila] = await Promise.all([
    olharProducao(PRODUCAO),
    Promise.resolve(historicoDaBranch(BRANCH)),
    olharFilaDeDeploy(),
  ]);

  // Qualquer uma das duas falhando já é "não consegui olhar" — o veredito não
  // distingue QUAL lado falhou, só que a medição não é confiável. A fila NÃO
  // entra nesta soma: "não consegui olhar a fila" é um fato mais específico
  // (ATRASADA_SEM_SABER), não o mesmo "não consegui medir nada" que produção
  // ou histórico falhos produzem.
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
    historicoBateuNoLimite: historico.bateuNoLimite,
    fila,
  });
}

/**
 * O mapeamento não é 1:1 com o código do veredito — ATRASADA_PUBLICANDO é
 * tratado à parte em `codigoDeSaida`. Aqui ele aparece com 0 só para deixar
 * claro, olhando a tabela, que ele NÃO é o mesmo alarme que ATRASADA_PARADA:
 * um deploy em voo é a esteira se resolvendo sozinha, e sair diferente de 0
 * para isso seria alarmar quem já está fazendo a coisa certa — o erro do dia.
 */
const CODIGO_DE_SAIDA: Record<VereditoDaDistancia["codigo"], number> = {
  EM_DIA: 0,
  ATRASADA_PUBLICANDO: 0,
  ATRASADA_PARADA: 1,
  ATRASADA_SEM_SABER: 2,
  PRODUCAO_FORA: 2,
  PRODUCAO_SEM_VERSAO: 2,
  COMMIT_ALEM_DO_LIMITE: 2,
  COMMIT_FORA_DA_BRANCH: 2,
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

  // ── A CATRACA DO DISCO, ANTES DA DISTÂNCIA (27/08/2026) ───────────────────
  //
  // Este script mede a produção contra `origin/<branch>` — e por isso, no dia em
  // que 14 commits ficaram presos num disco (entre eles a porta da isenção de
  // parceria, testada e 404 na internet), ele disse EM_DIA com exit 0. Produção
  // == origin era verdade; "está pronto" não era.
  //
  // O disco é conferido PRIMEIRO porque a resposta dele muda o significado da
  // outra: "produção em dia" com trabalho preso no disco não é em dia, é uma
  // medição da metade visível. Sair 0 aqui seria repetir o dia inteiro.
  const disco = trabalhoSoNoDisco();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ...v, disco }));
  } else {
    imprimir(v);
    imprimirDisco(disco);
  }

  // O pior dos dois manda. Um disco com trabalho preso sai 1 mesmo com a
  // produção em dia — e "não consegui olhar o git" sai 2, porque silêncio nunca
  // vira sinal verde.
  const doDisco = disco.codigo === "SO_NO_DISCO" ? 1 : disco.codigo === "NAO_CONSEGUI_OLHAR" ? 2 : 0;
  process.exit(Math.max(codigoDeSaida(v), doDisco));
}

function imprimirDisco(d: ReturnType<typeof trabalhoSoNoDisco>): void {
  if (d.codigo === "TUDO_EMPURRADO") {
    console.log("✅ Nada preso no disco.");
    console.log("");
    return;
  }
  console.log(`${d.codigo === "SO_NO_DISCO" ? "🚨" : "⚠️ "} ${d.resumo}`);
  console.log(`   → ${d.acao}`);
  for (const c of d.commits.slice(0, 10)) console.log(`  ${c.commitCurto}  ${c.assunto}`);
  const resto = d.commits.length - 10;
  if (resto > 0) console.log(`  ... e mais ${resto}`);
  console.log("");
}

const executadoDireto = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (executadoDireto) void main();
