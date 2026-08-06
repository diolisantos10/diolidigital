// DESTRAVAR OS PEDIDOS PRESOS — a passagem rodada à mão, uma vez.
//
// Existe porque a esteira automática nasceu em 06/08/2026 e os pedidos que já
// estavam presos ANTES dela não passam por porta nenhuma: eles não vão ser
// gravados de novo, e o gatilho mora na gravação. O despertador os pega na
// próxima batida, mas quando um cliente está esperando há dois dias, "na próxima
// batida" é resposta de quem não entendeu o problema.
//
// Não reimplementa nada: chama `triarPedido` e `produzirPedido`, os mesmos que a
// rota chama. Um script que faz o trabalho por outro caminho é o segundo caminho
// que ninguém testa.
//
// Uso:
//   npx tsx scripts/destravar-pedidos.mts                 # todos os presos
//   npx tsx scripts/destravar-pedidos.mts <id> [<id> ...] # os que você mandar

import { prisma } from "@/lib/db/client";
import { triarPedido } from "@/lib/agency/esteira/triagem";
import { produzirPedido } from "@/lib/agency/esteira/producao-de-pedido";

/** Os estados que prendem trabalho. `precisa_decisao` NÃO entra: ali a máquina
 *  já decidiu que precisa de gente, e reprocessar por fora seria contornar o
 *  próprio freio. */
const PRESOS = ["novo", "em_triagem", "triado", "em_producao"];

const pedidos = process.argv.slice(2);
const alvos = pedidos.length > 0
  ? await prisma.contentRequest.findMany({ where: { id: { in: pedidos } } })
  : await prisma.contentRequest.findMany({ where: { status: { in: PRESOS } }, orderBy: { createdAt: "asc" } });

if (alvos.length === 0) {
  console.log("Nenhum pedido preso. Nada a fazer.");
  process.exit(0);
}

console.log(`${alvos.length} pedido(s) para destravar.\n`);

for (const p of alvos) {
  console.log(`── ${p.id} · "${p.title}" · estava em "${p.status}" desde ${p.createdAt.toISOString()}`);

  if (p.status === "novo" || p.status === "em_triagem") {
    const t = await triarPedido(p.id);
    if (t.ok) {
      console.log(`   triado → ${t.triado.atendimento.label} · ${t.triado.escopo}${t.triado.preco ? ` · R$ ${t.triado.preco}` : ""} · até ${t.triado.prazo.toISOString().slice(0, 10)}`);
    } else {
      console.log(`   ${t.parou ? "PAROU" : "sem ação"}: ${t.motivo}`);
    }
  }

  const depoisDaTriagem = await prisma.contentRequest.findUnique({ where: { id: p.id } });
  if (depoisDaTriagem?.status === "triado" || depoisDaTriagem?.status === "em_producao") {
    const r = await produzirPedido(p.id);
    if (r.ok) console.log(`   ENTREGUE → deliverable ${r.deliverableId}, card ${r.approvalRequestId}`);
    else console.log(`   ${r.parou ? "PAROU" : "aguardando"}: ${r.motivo}`);
  }

  const fim = await prisma.contentRequest.findUnique({ where: { id: p.id } });
  console.log(`   estado final: "${fim?.status}"${fim?.declineReason ? ` — ${fim.declineReason}` : ""}\n`);
}

await prisma.$disconnect();
