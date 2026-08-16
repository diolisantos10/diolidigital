// ── O BACKFILL CURADO DO PORTAL — pré-requisito de deploy ──────────────────
//
// Ele é o CONSERTO, não uma limpeza: sem ele não existe regra de leitura que
// funcione (exigir carimbo apaga a tela do dono; não exigir deixa o estranho
// entrar). Ver o cabeçalho de `lib/agency/portal/backfill-de-carimbo.ts`.
//
// SOMENTE LEITURA por padrão. Grava só com `--aplicar`.
//
//   DATABASE_URL=... npx tsx scripts/backfill-carimbo-do-portal.mts
//   DATABASE_URL=... npx tsx scripts/backfill-carimbo-do-portal.mts --aplicar

import { backfillDeCarimbo } from "../lib/agency/portal/backfill-de-carimbo";

const aplicar = process.argv.includes("--aplicar");

const r = await backfillDeCarimbo(aplicar);
console.log(JSON.stringify(r, null, 2));
console.log(
  `\n${aplicar ? "APLICADO" : "ENSAIO (nada gravado)"}`
  + `\n  solicitações: ${r.solicitacoes}`
  + `\n  carimbadas:   ${r.carimbadas}  (${r.totalDeLinhasCarimbadas} linhas)`
  + `\n  fora:         ${r.deixadasDeFora}  ← precisam de decisão humana`
  + (aplicar ? "" : "\n\nRode de novo com --aplicar depois de ler a lista acima."),
);
