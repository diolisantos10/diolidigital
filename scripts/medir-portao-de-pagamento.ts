// QUANTOS PROJETOS A RÉGUA DO PAGAMENTO PARA — a medida ANTES de confiar nela.
//
// "Não bloqueie cliente que já pagou." A casa nunca registrou pagamento, então
// no dia em que o portão sobe NENHUM pedido existente tem prova — inclusive os
// de quem pagou por Pix meses atrás. Por isso o portão tem um corte de vigência
// (a anistia declarada em `lib/agency/financeiro/portao-de-pagamento.ts`).
//
// Este script responde, contra o banco de VERDADE, as duas perguntas:
//
//   1. Quantos projetos vivos seriam parados SE a anistia não existisse.
//      (Esperado no dia da subida: todos. É a razão de a anistia existir.)
//   2. Quantos são parados COM a anistia ligada, como está no ar.
//      (Esperado no dia da subida: zero.)
//
// A pergunta 2 é a que precisa continuar sendo zero. Quando ela começar a
// crescer, é sinal de que há pedido NOVO esperando pagamento — o que é o
// comportamento certo, e é aí que o time usa POST /api/admin/pagamentos.
//
// Uso (com DATABASE_URL apontando para o volume):
//   npx tsx scripts/medir-portao-de-pagamento.ts

import { prisma } from "@/lib/db/client";
import { CORTE_DO_PORTAO_DE_PAGAMENTO } from "@/lib/agency/financeiro/portao-de-pagamento";

async function main(): Promise<void> {
  // "Vivo" = o que a esteira ainda pode pegar. Projeto `done` não é parado por
  // portão nenhum, e contá-lo inflaria o número que o CEO lê.
  const vivos = await prisma.project.findMany({
    where: { executionStatus: { in: ["idle", "pending", "running", "failed"] } },
    select: { id: true, name: true, clientRequestId: true },
  });

  const comPagamento = new Set(
    (await prisma.pagamentoConfirmado.findMany({ select: { clientRequestId: true } }))
      .map((p) => p.clientRequestId),
  );

  const pedidos = new Map(
    (await prisma.clientRequestDb.findMany({ select: { id: true, createdAt: true } }))
      .map((r) => [r.id, r.createdAt] as const),
  );

  let semProva = 0;      // seriam parados sem a anistia
  let paradosAgora = 0;  // são parados com a régua como está no ar
  const nomes: string[] = [];

  for (const p of vivos) {
    const pago = p.clientRequestId ? comPagamento.has(p.clientRequestId) : false;
    if (pago) continue;
    semProva++;
    const nascimento = p.clientRequestId ? pedidos.get(p.clientRequestId) : undefined;
    const anistiado = nascimento !== undefined && nascimento < CORTE_DO_PORTAO_DE_PAGAMENTO;
    if (!anistiado) {
      paradosAgora++;
      if (nomes.length < 20) nomes.push(`${p.name} (${p.id})`);
    }
  }

  console.log(`corte da anistia: ${CORTE_DO_PORTAO_DE_PAGAMENTO.toISOString()}`);
  console.log(`projetos vivos: ${vivos.length}`);
  console.log(`sem prova de pagamento (seriam parados SEM a anistia): ${semProva}`);
  console.log(`PARADOS AGORA, com a régua como está no ar: ${paradosAgora}`);
  if (nomes.length) {
    console.log("os parados:");
    for (const n of nomes) console.log(`  - ${n}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
