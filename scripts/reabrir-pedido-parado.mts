// REABRIR UM PEDIDO QUE A MÁQUINA PAROU — só quando a máquina APRENDEU.
//
// ── Por que isto existe ─────────────────────────────────────────────────────
// `precisa_decisao` é o fail-closed da esteira: a máquina não soube resolver e
// declarou. `scripts/destravar-pedidos.mts` recusa esse estado de propósito
// ("reprocessar por fora seria contornar o próprio freio"), e está certo.
//
// Só que existe um caso em que o freio vira armadilha: **a casa aprendeu a
// resolver aquilo depois**. O pedido `cmshiesdq00000pp2adk7zxe4` (Foocci,
// 06/08/2026 09:46 — "adiantem o calendário um dia") parou com o motivo "não se
// encaixa em nenhum dos serviços que a máquina produz sozinha". O motivo estava
// certo NAQUELE minuto. Depois de `lib/agency/esteira/operacoes.ts`, deixou de
// estar — e o pedido continuaria parado para sempre, porque nada devolve um
// `precisa_decisao` para a esteira.
//
// ── A TRAVA, e ela é o ponto ────────────────────────────────────────────────
// Este script NÃO reabre qualquer pedido parado. Ele só reabre o que a máquina
// AGORA reconhece como operação executável (`lerOperacao`). Sem essa condição,
// isto seria um botão de "ignore o freio" — e um botão desses acaba sendo
// apertado no pedido errado, num dia corrido.
//
// Pedido que a leitura não reconhece continua onde está, e o script diz por quê.
//
// Uso:
//   npx tsx scripts/reabrir-pedido-parado.mts <id> [<id> ...]

import { prisma } from "@/lib/db/client";
import { triarPedido } from "@/lib/agency/esteira/triagem";
import { lerOperacao } from "@/lib/agency/esteira/operacoes";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Informe pelo menos um id de pedido. Este script NUNCA roda em lote cego.");
  process.exit(1);
}

const alvos = await prisma.contentRequest.findMany({ where: { id: { in: ids } } });
if (alvos.length === 0) {
  console.log("Nenhum pedido encontrado com esses ids.");
  process.exit(0);
}

for (const p of alvos) {
  console.log(`\n── ${p.id} · "${p.title}" · estado "${p.status}"`);

  if (p.status !== "precisa_decisao") {
    console.log(`   ⛔ não reaberto: este script só toca pedido em "precisa_decisao" (este está em "${p.status}").`);
    continue;
  }

  const leitura = lerOperacao(p.description);
  if (!leitura.operacao) {
    console.log("   ⛔ não reaberto: a máquina CONTINUA não sabendo resolver este pedido sozinha.");
    console.log(`      motivo gravado: ${p.declineReason ?? "(sem motivo)"}`);
    continue;
  }

  console.log(`   ✔ a casa aprendeu: agora isto é a operação "${leitura.operacao}" (${leitura.dias ?? "-"} dia(s), horário ${leitura.hora ?? "-"}).`);

  // Volta para "novo" — o único estado de onde a triagem pega. A trava atômica
  // dela continua valendo: se outro processo pegar antes, este perde e não roda.
  await prisma.contentRequest.update({
    where: { id: p.id },
    data: { status: "novo", declineReason: null, triagedBy: null, triagedAt: null },
  });

  const r = await triarPedido(p.id);
  if (r.ok && r.executado) {
    console.log(`   ✅ operação executada: ${r.executado.movidas} peça(s) remarcada(s), ${r.executado.intocadas} intocada(s)${r.executado.empurradoPeloPiso ? " (o bloco foi empurrado: a data pedida já tinha passado)" : ""}.`);
  } else if (r.ok) {
    console.log("   ✅ pedido triado (virou trabalho novo, não operação).");
  } else {
    console.log(`   ⚠️  voltou a parar: ${r.motivo}`);
  }
}

const posteriores = await prisma.socialPost.findMany({
  where: { clientId: { in: [...new Set(alvos.map((a) => a.clientId))] }, scheduledFor: { not: null } },
  orderBy: { scheduledFor: "asc" },
  select: { id: true, status: true, scheduledFor: true, caption: true },
});
console.log("\n── O calendário depois ──");
for (const p of posteriores) {
  console.log(`   ${p.scheduledFor?.toISOString()} · ${p.status} · ${p.caption.slice(0, 50)}`);
}

await prisma.$disconnect();
