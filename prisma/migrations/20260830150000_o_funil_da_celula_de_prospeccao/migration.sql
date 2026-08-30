-- O FUNIL DA CÉLULA DE PROSPECÇÃO (Onda 1) — duas tabelas novas, aditivas.
--
-- `LinhaDoFunil`: o estado ATUAL, uma linha por oportunidade (`oportunidadeId`
-- é UNIQUE). `TransicaoDoFunil`: a trilha APPEND-ONLY — nunca UPDATE, nunca
-- DELETE, só INSERT. As duas são escritas juntas, na mesma `$transaction`, por
-- `avancarFunil` em `lib/agency/celula/trilha.ts`: trilha sem linha, ou linha
-- sem trilha, é o defeito que este desenho torna impossível.
--
-- Sem relação Prisma de mão dupla com `Oportunidade` (ligação só por
-- `oportunidadeId String`, sem FK declarada) — de propósito, para não tocar
-- no model dela. Ver o comentário completo em `prisma/schema.prisma`, no
-- bloco que antecede `model LinhaDoFunil`.

CREATE TABLE "LinhaDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'encontrada',
    "entrouNoEstadoEm" DATETIME NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

CREATE TABLE "TransicaoDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estadoAnterior" TEXT NOT NULL,
    "estadoNovo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LinhaDoFunil_oportunidadeId_key" ON "LinhaDoFunil"("oportunidadeId");
CREATE INDEX "LinhaDoFunil_workspaceId_estado_idx" ON "LinhaDoFunil"("workspaceId", "estado");

CREATE INDEX "TransicaoDoFunil_oportunidadeId_criadoEm_idx" ON "TransicaoDoFunil"("oportunidadeId", "criadoEm");
CREATE INDEX "TransicaoDoFunil_workspaceId_criadoEm_idx" ON "TransicaoDoFunil"("workspaceId", "criadoEm");
