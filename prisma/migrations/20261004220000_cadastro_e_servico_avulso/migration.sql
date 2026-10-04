-- Raio-x de 03/10, aplicado em 04/10/2026: tipo de cliente, responsável e meta por conta; oportunidade ganha vira cliente; serviço avulso.
ALTER TABLE "Client" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'cliente';
ALTER TABLE "Client" ADD COLUMN "responsavelUserId" TEXT;
ALTER TABLE "Client" ADD COLUMN "meta" TEXT;
ALTER TABLE "Oportunidade" ADD COLUMN "clienteId" TEXT;

CREATE TABLE "ServicoAvulso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pedido',
    "entregaNota" TEXT,
    "entregueEm" DATETIME,
    "cobradoEm" DATETIME,
    "fechadoEm" DATETIME,
    "criadoPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServicoAvulso_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ServicoAvulso_workspaceId_estado_idx" ON "ServicoAvulso"("workspaceId", "estado");
CREATE INDEX "ServicoAvulso_clientId_idx" ON "ServicoAvulso"("clientId");
