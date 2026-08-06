// ENSAIO DA NORMALIZAÇÃO DE "SEM CLIENTE" — 06/08/2026
//
// Conta, tabela por tabela, quantas linhas usam a SEGUNDA grafia de "sem
// cliente" (`clientId = ''`) em vez da canônica (`NULL`). NÃO escreve nada.
//
// Existe porque o protocolo desta casa é ensaio → lista → conferência → aplicar,
// e porque migration que roda sem ninguém saber quantas linhas ela toca é
// migration que ninguém pode conferir depois.
//
//   npx tsx scripts/grafia-do-sem-cliente.mts
//
// Contra PRODUÇÃO: exportar o `DATABASE_URL` de produção na chamada. Sem isso
// ele roda contra o banco local e não diz nada sobre o incidente.
//
// Quem CONSERTA é a migration `20260806180000_uma_grafia_so_para_sem_cliente`,
// que roda sozinha no deploy (`prisma migrate deploy`, em scripts/start.sh).
// Este script serve para saber o número ANTES e conferir o ZERO DEPOIS.

import { prisma } from "@/lib/db/client";

/** Toda coluna `clientId` OPCIONAL do schema — a mesma lista da migration. Se
 *  as duas divergirem, alguém normalizou metade do banco. */
const TABELAS = [
  "MetaConnection",
  "MetaAtivoAutorizado",
  "User",
  "AdCampaign",
  "GoogleConnection",
  "GoogleReview",
  "StrategyRoom",
  "ActivityEvent",
  "ClientRequestDb",
  "PortalMessage",
  "SocialPost",
  "BrainArtifact",
  "ApprovalRequest",
  "PortalAccess",
  "MediaAsset",
  // `DepartmentLadderRecord` fica de fora: nasceu DEPOIS da migration do
  // reparo, quando a segunda grafia já estava proibida por gatilho. Tabela
  // ausente aqui não é esquecimento — é a ordem da história.
];

async function main(): Promise<void> {
  let total = 0;
  const linhas: string[] = [];

  for (const tabela of TABELAS) {
    try {
      const r = (await prisma.$queryRawUnsafe(
        `SELECT
           SUM(CASE WHEN "clientId" = '' THEN 1 ELSE 0 END) AS vazias,
           SUM(CASE WHEN "clientId" IS NULL THEN 1 ELSE 0 END) AS nulas,
           COUNT(*) AS todas
         FROM "${tabela}"`,
      )) as Array<{ vazias: number | bigint; nulas: number | bigint; todas: number | bigint }>;
      const vazias = Number(r[0]?.vazias ?? 0);
      const nulas = Number(r[0]?.nulas ?? 0);
      const todas = Number(r[0]?.todas ?? 0);
      total += vazias;
      if (vazias > 0 || todas > 0) {
        linhas.push(
          `${vazias > 0 ? "⚠️ " : "   "}${tabela.padEnd(24)} '' = ${String(vazias).padStart(4)}` +
            `   NULL = ${String(nulas).padStart(4)}   total = ${String(todas).padStart(5)}`,
        );
      }
    } catch (e) {
      linhas.push(`   ${tabela.padEnd(24)} (não consultada: ${e instanceof Error ? e.message : e})`);
    }
  }

  console.log("\n── A grafia de \"sem cliente\", tabela por tabela ──\n");
  for (const l of linhas) console.log(l);
  console.log(
    `\nTOTAL de linhas na segunda grafia: ${total}\n` +
      (total === 0
        ? "Nada a normalizar — ou a migration já rodou.\n"
        : "Estas são as linhas que a migration 20260806180000 vai transformar em NULL.\n"),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
