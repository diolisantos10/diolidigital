-- CreateTable
CREATE TABLE "ConexaoGasta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "custo" INTEGER NOT NULL,
    "oportunidadeId" TEXT,
    "registradoPor" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ConexaoGasta_workspaceId_plataforma_competencia_idx" ON "ConexaoGasta"("workspaceId", "plataforma", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "ConexaoGasta_workspaceId_plataforma_motivo_oportunidadeId_key" ON "ConexaoGasta"("workspaceId", "plataforma", "motivo", "oportunidadeId");
