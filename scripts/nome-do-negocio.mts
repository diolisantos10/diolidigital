// MEDIR (e, só sob ordem, corrigir) o nome do negócio gravado errado.
//
//   npx tsx scripts/nome-do-negocio.mts              → MEDE e simula. Não escreve.
//   npx tsx scripts/nome-do-negocio.mts --aplicar    → escreve. Exige confirmação.
//
// ─── POR QUE A SIMULAÇÃO É O PADRÃO, E NÃO UMA OPÇÃO ─────────────────────────
//
// Script de saneamento que escreve por default é o modo clássico de destruir
// dado de cliente: alguém roda "só para ver" e descobre depois. Aqui o gatilho
// é explícito duas vezes — a flag `--aplicar` E a variável de ambiente
// `EU_SEI_O_QUE_ESTOU_FAZENDO=sim` —, porque uma flag sozinha é a distância de
// um histórico de shell.
//
// ⚠️ **A DECISÃO DE RODAR EM PRODUÇÃO É DO CEO.** Escrita em dado real de
// cliente é irreversível: se o nome estava certo e a ferramenta erra, ninguém
// sabe de onde ele veio para restaurar. Esta ferramenta foi entregue MEDIDA e
// ARMADA, e o gatilho não é do Diretor nem do PM.
//
// A regra de decisão NÃO mora aqui: mora em
// `lib/agency/comercial/diagnostico-do-negocio.ts`, testada sem banco. Este
// arquivo só lê linhas, chama a regra e imprime — para que "o que é sujeira"
// seja discutido no teste e não no meio de um script que fala com produção.

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { retratoDoLote, type LinhaDeNegocio } from "../lib/agency/comercial/diagnostico-do-negocio";

const APLICAR = process.argv.includes("--aplicar");
const CONFIRMADO = process.env.EU_SEI_O_QUE_ESTOU_FAZENDO === "sim";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/dev.db`;
const url = dbUrl.startsWith("file:./") ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}` : dbUrl;
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter } as never);

// Qual banco está sendo lido, dito em voz alta ANTES de qualquer coisa. Metade
// dos acidentes de saneamento é alguém achando que está no banco local.
const onde = url.startsWith("file:") ? `arquivo local (${url.split("/").pop()})` : "banco REMOTO";
console.log(`\n📍 Lendo: ${onde}`);
console.log(`   Modo:  ${APLICAR ? "⚠️  APLICAR (escreve)" : "simulação (não escreve nada)"}\n`);

const linhas = await prisma.clientRequestDb.findMany({
  select: { id: true, businessName: true, briefingJson: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});

const retrato = retratoDoLote(linhas as unknown as LinhaDeNegocio[]);

console.log(`Solicitações lidas: ${retrato.total}`);
console.log(`  ✔ intactas (certas ou sem prova de erro): ${retrato.naoTocar}`);
console.log(`  ↻ nome do negócio recuperável do briefing: ${retrato.recuperar}`);
console.log(`  ␀ vira ausência declarada (era pessoa/e-mail/telefone): ${retrato.declarar}\n`);

if (retrato.mudancas.length === 0) {
  console.log("Nada a corrigir. Zero medido não é zero desconhecido: as linhas foram lidas.\n");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("O que mudaria, linha por linha:");
for (const m of retrato.mudancas) {
  const destino = m.novo === "" ? "(ausência declarada)" : `"${m.novo}"`;
  console.log(`  ${m.id}`);
  console.log(`     "${m.atual}"  →  ${destino}`);
  console.log(`     motivo: ${m.motivo}`);
}
console.log("");

if (!APLICAR) {
  console.log("Simulação. NADA foi escrito.");
  console.log("Para aplicar (decisão do CEO):");
  console.log("  EU_SEI_O_QUE_ESTOU_FAZENDO=sim npx tsx scripts/nome-do-negocio.mts --aplicar\n");
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
for (const m of retrato.mudancas) {
  // Uma linha por vez, e cada uma alcançada pelo id. Nenhum `updateMany` com
  // filtro: filtro errado num updateMany atinge a tabela inteira, e é assim que
  // se perde um banco.
  await prisma.clientRequestDb.update({ where: { id: m.id }, data: { businessName: m.novo as string } });
  escritas++;
}

console.log(`✅ ${escritas} linha(s) corrigida(s).`);
console.log("   Rodar de novo é seguro: a segunda passada não encontra nada (idempotente).\n");
await prisma.$disconnect();
