CREATE TABLE "CofrePareamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segredoCifrado" TEXT NOT NULL,
    "hashDoSegredo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendente',
    "solicitadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadoEm" DATETIME,
    "ultimaResposta" TEXT,
    "updatedAt" DATETIME NOT NULL
);
