-- O ORÇAMENTO NA DEVOLUTIVA DO PEDIDO — quatro colunas que faltavam migrar.
--
-- As colunas entraram no schema em 05/08/2026 (commit 8f79b0a, "a devolutiva já
-- tem que vir com o preço") e ficaram SEM migration. Produção aplica schema só
-- por `migrate deploy` (scripts/start.sh): sem este arquivo, a coluna não existe
-- no volume do Railway e a primeira consulta que a tocasse estouraria em runtime
-- — com o build verde e o deploy declarado no ar.
--
-- Aditivo e nulo: nada existente é reescrito, nenhuma linha é perdida.
-- Sem `IF NOT EXISTS` porque o SQLite não aceita isso em `ADD COLUMN`. O banco
-- de desenvolvimento já recebeu as colunas por `db push`, e por isso esta
-- migration foi marcada como aplicada lá (`prisma migrate resolve --applied`).
-- Em produção ela roda de verdade, que é onde as colunas faltam.

ALTER TABLE "ContentRequest" ADD COLUMN "quotedPrice" INTEGER;
ALTER TABLE "ContentRequest" ADD COLUMN "quoteNote" TEXT;
ALTER TABLE "ContentRequest" ADD COLUMN "quoteStatus" TEXT;
ALTER TABLE "ContentRequest" ADD COLUMN "quoteDecidedAt" DATETIME;
