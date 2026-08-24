// O QUE ESTÁ CUSTANDO REFAÇÃO — a leitura, em números, dos registros da casa.
//
// A produção só começa depois do pagamento: toda refação é prejuízo da casa.
// Este script é o consumidor do catálogo de `lib/agency/esteira/causas-de-refacao.ts`
// — ele existe para que o catálogo não seja decoração: campo que ninguém lê não
// é régua, e uma causa que parou de aparecer é uma pergunta que pode SAIR do
// briefing.
//
//   npm run causas            → últimos 90 dias
//   npm run causas -- 30      → últimos 30 dias
//
// Só lê. Não escreve nada, não toca em cliente, projeto nem peça.

import { contarCausasDeRefacao } from "../lib/agency/esteira/causas-de-refacao-contagem";
import { causasSemPergunta } from "../lib/agency/esteira/causas-de-refacao";

const dias = Number(process.argv[2] ?? "90");

const r = await contarCausasDeRefacao({ janelaDias: Number.isFinite(dias) ? dias : 90 });

if (!r.lidas) {
  // Falha de leitura NUNCA vira "não houve refação". Ausência de informação
  // não é informação.
  console.error("não consegui ler os registros — nada a concluir sobre refação");
  process.exit(1);
}

console.log(`\nCAUSAS DE REFAÇÃO — últimos ${r.janelaDias} dias\n`);
if (r.ranking.length === 0) {
  console.log("nenhum registro classificado na janela.");
} else {
  for (const linha of r.ranking) {
    const pergunta = linha.causa.perguntaQueEvita ?? "— ainda sem pergunta no briefing";
    console.log(`${String(linha.ocorrencias).padStart(4)}  ${linha.causa.rotulo}`);
    console.log(`      evita em: ${pergunta}`);
    for (const ex of linha.exemplos) console.log(`      · ${ex.replace(/\s+/g, " ").slice(0, 120)}`);
  }
}
console.log(`\n${r.naoClassificados} registro(s) não casaram com causa conhecida — é aqui que a próxima causa aparece.`);

const semPergunta = causasSemPergunta();
if (semPergunta.length > 0) {
  console.log("\nMEDIDAS E AINDA SEM PERGUNTA (fila de trabalho, não esquecimento):");
  for (const c of semPergunta) console.log(`  · ${c.rotulo}`);
}
