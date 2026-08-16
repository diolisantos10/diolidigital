// MEDIR (e, só sob ordem do CEO, corrigir) o volume gravado abaixo do pedido.
//
//   npx tsx scripts/volume-subestimado.mts             → MEDE e simula. Não escreve.
//   npx tsx scripts/volume-subestimado.mts --aplicar   → escreve. Exige confirmação.
//
// Mesmo desenho de `scripts/nome-do-negocio.mts`, provado hoje: simula por
// padrão, duas confirmações independentes para escrever, idempotente, e não
// toca no que está certo. A regra de decisão mora em
// `lib/agency/comercial/volume-subestimado.ts`, testada sem banco.
//
// ⚠️ **AQUI É MAIS DELICADO QUE O NOME DO NEGÓCIO.** Volume é PREÇO e ESCOPO
// CONTRATADO: um pedido corrigido para cima muda o que a casa cobra e o que ela
// deve entregar. A decisão de rodar isto em produção é do CEO, e de mais
// ninguém.
//
// E o que NÃO é recuperável fica dito como não recuperável: sem a conversa
// gravada, a frase original não existe, e inventar o volume de um cliente é o
// pecado que esta casa proíbe. "Não dá para saber" é resposta legítima; palpite
// num campo que vira fatura, não.

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { retratoDoLote, type PedidoGravado } from "../lib/agency/comercial/volume-subestimado";

const APLICAR = process.argv.includes("--aplicar");
const CONFIRMADO = process.env.EU_SEI_O_QUE_ESTOU_FAZENDO === "sim";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/dev.db`;
const url = dbUrl.startsWith("file:./") ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}` : dbUrl;
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) } as never);

const onde = url.startsWith("file:") ? `arquivo local (${url.split("/").pop()})` : "banco REMOTO";
console.log(`\n📍 Lendo: ${onde}`);
console.log(`   Modo:  ${APLICAR ? "⚠️  APLICAR (escreve preço e escopo)" : "simulação (não escreve nada)"}\n`);

const linhas = await prisma.clientRequestDb.findMany({
  select: { id: true, briefingJson: true },
  orderBy: { createdAt: "asc" },
});

const r = retratoDoLote(linhas as unknown as PedidoGravado[]);

console.log(`Pedidos lidos: ${r.total}`);
console.log(`  ✔ o gravado bate com o que a pessoa escreveu: ${r.conferem}`);
console.log(`  🔴 volume SUBESTIMADO (a casa cotou menos):   ${r.subestimados}`);
console.log(`  ？ não recuperável do dado:                   ${r.naoRecuperaveis}`);
console.log(`     (sem conversa gravada. NÃO significa "está certo".)\n`);

if (r.mudancas.length === 0) {
  console.log("Nada a corrigir entre os recuperáveis.\n");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("O que mudaria — com a frase da pessoa como prova:");
for (const m of r.mudancas) {
  console.log(`  ${m.id}`);
  console.log(`     ${m.gravado}/semana  →  ${m.correto}/semana`);
  console.log(`     ela escreveu: "${(m.frase ?? "").trim().slice(0, 80)}"`);
}
console.log("");

if (!APLICAR) {
  console.log("Simulação. NADA foi escrito.");
  console.log("Para aplicar (decisão do CEO — isto muda preço e escopo contratado):");
  console.log("  EU_SEI_O_QUE_ESTOU_FAZENDO=sim npx tsx scripts/volume-subestimado.mts --aplicar\n");
  await prisma.$disconnect();
  process.exit(0);
}

if (!CONFIRMADO) {
  console.error("❌ `--aplicar` sem `EU_SEI_O_QUE_ESTOU_FAZENDO=sim`. Nada foi escrito.\n");
  await prisma.$disconnect();
  process.exit(1);
}

let n = 0;
for (const m of r.mudancas) {
  // Linha a linha, pelo id, e reescrevendo só o campo do volume dentro do JSON
  // — nunca `updateMany`, nunca substituindo o briefing inteiro: o resto do que
  // a pessoa contou não pode ser perdido num saneamento de um campo.
  const atual = linhas.find((l) => l.id === m.id);
  const b = JSON.parse(String(atual?.briefingJson ?? "{}"));
  b.scope = b.scope ?? {};
  b.scope.social = { ...(b.scope.social ?? {}), postsPerWeek: m.correto };
  await prisma.clientRequestDb.update({ where: { id: m.id }, data: { briefingJson: JSON.stringify(b) } });
  n++;
}
console.log(`✅ ${n} pedido(s) corrigido(s). Rodar de novo é seguro: a segunda passada não acha nada.\n`);
await prisma.$disconnect();
