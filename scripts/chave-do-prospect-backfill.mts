// MEDIR (e, só sob ordem do CEO, preencher) a coluna `ClientRequestDb.chaveDoProspect`
// nas linhas legadas que nasceram antes dela existir.
//
//   npx tsx scripts/chave-do-prospect-backfill.mts              → MEDE. Não escreve.
//   npx tsx scripts/chave-do-prospect-backfill.mts --aplicar    → escreve. Exige confirmação.
//
// ─── POR QUE ESTE SCRIPT EXISTE (16/08/2026) ─────────────────────────────────
//
// `chaveDoProspect` passou a ser gravada por `createClientRequest` a partir da
// migration `20260816120000_chave_do_prospect` — mas a própria migration
// declara que "a coluna nasce NULA em toda linha existente". Até este script
// rodar (por decisão do CEO), essas linhas legadas seguem sendo agrupadas pelo
// RECÁLCULO em memória (`lib/agency/comercial/chave-do-prospect.ts`), que é a
// rede declarada exatamente para este caso — ver `agruparPorProspect` e o
// campo `procedencia` que ele expõe. Preencher a coluna não muda quem agrupa
// com quem: só tira peso do recálculo a cada carregamento da fila, e é o que
// faz a rede encolher até virar inerte.
//
// ─── A MESMA POSTURA DE `nome-do-negocio.mts` — leia aquele como referência ──
// (este arquivo não o edita; só repete o padrão)
//
// Simulação é o padrão, não uma opção. `--aplicar` sozinho não escreve: exige
// também `EU_SEI_O_QUE_ESTOU_FAZENDO=sim`, porque uma flag sozinha é a
// distância de um histórico de shell.
//
// ⚠️ **A DECISÃO DE RODAR EM PRODUÇÃO É DO CEO.** Escrita em dado real de
// cliente não é de agente. Contra um `DATABASE_URL` que não aponta para um
// arquivo local, este script recusa rodar — ler ou escrever — a menos que
// `--permitir-producao` seja passado explicitamente, e nesse caso avisa em
// voz alta que está em produção ANTES de qualquer coisa.
//
// ─── O QUE ELE NUNCA FAZ ──────────────────────────────────────────────────────
//
//   • NUNCA sobrescreve uma chave já gravada — só preenche linhas com a coluna
//     NULA. A chave que uma linha já tem é o que ela declarou ao nascer (ou o
//     que uma rodada anterior deste próprio script já resolveu); sobrescrever
//     apagaria isso sem necessidade nenhuma.
//   • NUNCA inventa chave para lead sem canal. "Ausência de informação não é
//     informação": se `chaveDaSolicitacao` devolve `null` (nenhum e-mail nem
//     WhatsApp declarado), a linha CONTINUA nula, e é medida à parte
//     ("continuariam sem chave") — nunca escondida ou forçada.
//   • É IDEMPOTENTE: rodar duas vezes em sequência não muda nada na segunda —
//     a segunda passada só encontra linhas que já foram preenchidas na
//     primeira, e portanto não têm mais nada a recuperar.

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { chaveDaSolicitacao } from "../lib/agency/comercial/chave-do-prospect";

const APLICAR = process.argv.includes("--aplicar");
const PERMITIR_PRODUCAO = process.argv.includes("--permitir-producao");
const CONFIRMADO = process.env.EU_SEI_O_QUE_ESTOU_FAZENDO === "sim";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/dev.db`;
const url = dbUrl.startsWith("file:./") ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}` : dbUrl;
const ehLocal = url.startsWith("file:");

// A recusa contra banco remoto vem ANTES de qualquer leitura — não só da
// escrita. "Só medir" contra produção sem avisar também é o tipo de acidente
// que este script existe para evitar.
if (!ehLocal && !PERMITIR_PRODUCAO) {
  console.error("\n❌ `DATABASE_URL` não aponta para um arquivo local, e `--permitir-producao` não foi passado.");
  console.error("   Este script recusa rodar contra banco remoto por padrão. Nada foi lido, nada foi escrito.\n");
  process.exit(1);
}

const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter } as never);

// Qual banco está sendo lido, dito em voz alta ANTES de qualquer coisa —
// metade dos acidentes de saneamento é alguém achando que está no local.
const onde = ehLocal ? `arquivo local (${url.split("/").pop()})` : "banco REMOTO — PRODUÇÃO";
console.log(`\n📍 Lendo: ${onde}`);
if (!ehLocal) {
  console.log("⚠️  ESTE É UM BANCO DE PRODUÇÃO. A decisão de rodar aqui é do CEO, não deste script.");
}
console.log(`   Modo:  ${APLICAR ? "⚠️  APLICAR (escreve)" : "simulação (não escreve nada)"}\n`);

type LinhaLida = {
  id: string;
  chaveDoProspect: string | null;
  briefingJson: string | null;
  sdrHandoffJson: string | null;
};

const linhas: LinhaLida[] = await prisma.clientRequestDb.findMany({
  select: { id: true, chaveDoProspect: true, briefingJson: true, sdrHandoffJson: true },
  orderBy: { createdAt: "asc" },
});

let comChave = 0;
let permanecemSemChave = 0;
const recuperaveis: { id: string; chave: string }[] = [];

for (const linha of linhas) {
  // Coluna já preenchida: não é candidata a nada. Nunca sobrescreve.
  const atual = typeof linha.chaveDoProspect === "string" ? linha.chaveDoProspect.trim() : "";
  if (atual) {
    comChave++;
    continue;
  }

  // Nula: o mesmo cálculo que `createClientRequest` faria hoje, sobre o
  // contato DECLARADO — nenhuma inferência nova, só a lei de sempre.
  const recalculada = chaveDaSolicitacao({
    briefingJson: linha.briefingJson,
    sdrHandoffJson: linha.sdrHandoffJson,
  });

  if (recalculada) {
    recuperaveis.push({ id: linha.id, chave: recalculada });
  } else {
    // Lead sem canal: continua sem chave. Não é erro do script, é o fato da
    // linha — "ausência de informação não é informação".
    permanecemSemChave++;
  }
}

const nulas = recuperaveis.length + permanecemSemChave;

console.log(`Solicitações lidas: ${linhas.length}`);
console.log(`  ✔ já com chave gravada: ${comChave}`);
console.log(`  ␀ com a coluna nula: ${nulas}`);
console.log(`     ↻ teriam chave se recalculadas: ${recuperaveis.length}`);
console.log(`     ⊘ continuariam sem chave (sem canal declarado): ${permanecemSemChave}\n`);

if (recuperaveis.length === 0) {
  console.log("Nada a preencher. Zero medido não é zero desconhecido: as linhas foram lidas.\n");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("O que seria preenchido, linha por linha:");
for (const r of recuperaveis) {
  console.log(`  ${r.id}  →  "${r.chave}"`);
}
console.log("");

if (!APLICAR) {
  console.log("Simulação. NADA foi escrito.");
  console.log("Para aplicar (decisão do CEO):");
  console.log(
    `  EU_SEI_O_QUE_ESTOU_FAZENDO=sim npx tsx scripts/chave-do-prospect-backfill.mts --aplicar${ehLocal ? "" : " --permitir-producao"}\n`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

if (!CONFIRMADO) {
  console.error("❌ `--aplicar` sem `EU_SEI_O_QUE_ESTOU_FAZENDO=sim`. Nada foi escrito.");
  console.error("   As duas travas existem para que um comando repetido do histórico não escreva sozinho.\n");
  await prisma.$disconnect();
  process.exit(1);
}

let escritas = 0;
for (const r of recuperaveis) {
  // Uma linha por vez, alcançada pelo id, e só quando a coluna ainda está
  // nula (`where` reforça o "nunca sobrescreve" mesmo sob corrida). Nenhum
  // `updateMany` com filtro amplo: filtro errado num updateMany atinge a
  // tabela inteira, e é assim que se perde um banco.
  const resultado = await prisma.clientRequestDb.updateMany({
    where: { id: r.id, chaveDoProspect: null },
    data: { chaveDoProspect: r.chave },
  });
  escritas += resultado.count;
}

console.log(`✅ ${escritas} linha(s) preenchida(s).`);
console.log("   Rodar de novo é seguro: a segunda passada não encontra mais linhas nulas recuperáveis (idempotente).\n");
await prisma.$disconnect();
