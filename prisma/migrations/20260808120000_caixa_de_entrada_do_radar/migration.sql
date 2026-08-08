-- CreateTable
CREATE TABLE "EmailDoRadar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "uid" INTEGER,
    "remetente" TEXT NOT NULL,
    "assunto" TEXT,
    "recebidoEm" DATETIME,
    "processadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT NOT NULL,
    "motivo" TEXT,
    "oportunidadeId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDoRadar_workspaceId_mensagemId_key" ON "EmailDoRadar"("workspaceId", "mensagemId");

-- CreateIndex
CREATE INDEX "EmailDoRadar_workspaceId_processadoEm_idx" ON "EmailDoRadar"("workspaceId", "processadoEm");
