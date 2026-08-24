// QUANTOS PEDIDOS EXISTEM DE ITEM QUE A CASA NÃO PRODUZ — e quais foram PAGOS.
//
// Auditoria de 24/08/2026: a vitrine vendia itens sem caminho de produção e a
// rota de pedido gravava a linha (e, com o Mercado Pago ligado, COBRAVA). A
// trava já está no ar (`lib/agency/capacidade-de-producao.ts`), mas ela só
// impede pedido NOVO. Este script mede o passivo que ficou para trás.
//
// SOMENTE LEITURA. Nenhum UPDATE, nenhum DELETE, nenhum cancelamento. Pedido
// pago de item não produzível é dívida com cliente de verdade: quem decide o
// que fazer com ela é o CEO, não um script.
//
// COMO SE LÊ "PAGO": o webhook do Mercado Pago (`app/api/self-serve/webhook`)
// é a ÚNICA coisa que tira o pedido de `status: "new"`. Então:
//   • status "new"  → pedido registrado, pagamento NÃO confirmado;
//   • qualquer outro → o webhook aprovou o pagamento e o pedido andou.
// O projeto ligado ao pedido é a segunda testemunha: `produzirPedidoDeBalcao`
// só cria projeto depois do pagamento aprovado.
//
// COMO RODAR (precisa do DATABASE_URL de produção — quem o tem é o CEO):
//   DATABASE_URL="<url de produção>" npx tsx scripts/divida-da-vitrine.mts
//
// A lista de itens NÃO é escrita aqui: sai da mesma régua que a vitrine usa.
// Se amanhã outro item perder o produtor, este script já o inclui sozinho.

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { CATALOGO_SUSPENSO } from "../lib/agency/self-serve-catalog.js";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/prisma/dev.db`;
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) } as never);

const suspensos = CATALOGO_SUSPENSO.map((s) => s.item);
console.log(`Itens sem caminho de produção (${suspensos.length}):`);
for (const s of CATALOGO_SUSPENSO) {
  console.log(`  • ${s.item.id} — R$ ${s.item.price} — falta: ${s.faltando.join(", ") || "declaração"}`);
}
console.log("");

const pedidos = await prisma.clientRequestDb.findMany({
  where: { source: "self_serve" },
  select: {
    id: true, businessName: true, status: true, createdAt: true,
    briefingJson: true, clientId: true,
  },
  orderBy: { createdAt: "asc" },
});

function itemDoPedido(briefingJson: string | null): string {
  try {
    const b = JSON.parse(briefingJson ?? "{}") as Record<string, unknown>;
    return typeof b.serviceId === "string" ? b.serviceId : "";
  } catch { return ""; }
}
function contatoDoPedido(briefingJson: string | null): { nome: string; email: string } {
  try {
    const b = JSON.parse(briefingJson ?? "{}") as Record<string, unknown>;
    return {
      nome: typeof b.prospectName === "string" ? b.prospectName : "",
      email: typeof b.prospectEmail === "string" ? b.prospectEmail : "",
    };
  } catch { return { nome: "", email: "" }; }
}

const ids = new Set(suspensos.map((s) => s.id));
const atingidos = pedidos.filter((p) => ids.has(itemDoPedido(p.briefingJson)));

console.log(`Pedidos self-serve no banco: ${pedidos.length}`);
console.log(`Pedidos de item SEM caminho de produção: ${atingidos.length}`);
console.log("");

if (atingidos.length === 0) {
  console.log("ZERO. Nenhum pedido de item não produzível existe neste banco.");
} else {
  const projetos = await prisma.project.findMany({
    where: { clientRequestId: { in: atingidos.map((p) => p.id) } },
    select: { clientRequestId: true, id: true },
  });
  const temProjeto = new Set(projetos.map((p) => p.clientRequestId));

  let pagos = 0, valorPago = 0;
  for (const p of atingidos) {
    const item = itemDoPedido(p.briefingJson);
    const preco = suspensos.find((s) => s.id === item)?.price ?? 0;
    const pago = p.status !== "new";
    if (pago) { pagos++; valorPago += preco; }
    const { nome, email } = contatoDoPedido(p.briefingJson);
    console.log(
      [
        pago ? "PAGO    " : "não pago",
        p.createdAt.toISOString().slice(0, 10),
        item.padEnd(24),
        `R$ ${String(preco).padStart(4)}`,
        `status=${p.status.padEnd(12)}`,
        temProjeto.has(p.id) ? "projeto=sim" : "projeto=não",
        `${nome || p.businessName} <${email || "sem e-mail"}>`,
        `pedido=${p.id}`,
      ].join("  "),
    );
  }
  console.log("");
  console.log(`PAGOS sem caminho de produção: ${pagos} pedido(s) — R$ ${valorPago} em dívida com cliente.`);
  console.log(`Não pagos (só registrados): ${atingidos.length - pagos}`);
}

await prisma.$disconnect();
