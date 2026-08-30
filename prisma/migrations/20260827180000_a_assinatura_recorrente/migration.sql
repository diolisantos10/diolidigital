-- A AGÊNCIA APRENDE A COBRAR O SEGUNDO MÊS.
--
-- Aditiva: duas tabelas novas e duas colunas OPCIONAIS em `PagamentoConfirmado`.
-- Nenhuma linha existente muda de significado — sem assinatura, o portão de
-- pagamento se comporta exatamente como hoje.
--
-- ⚠️ As colunas de taxa nascem NULAS de propósito. Nulo é "não medido", nunca
-- "taxa zero": nenhum pagamento antigo teve a taxa do gateway lida, e escrever
-- 0 ali daria ao negociador uma margem que não existe.
ALTER TABLE "PagamentoConfirmado" ADD COLUMN "taxaCentavos" INTEGER;
ALTER TABLE "PagamentoConfirmado" ADD COLUMN "liquidoCentavos" INTEGER;

CREATE TABLE "AssinaturaRecorrente" (
    "id"                   TEXT NOT NULL PRIMARY KEY,
    "clientRequestId"      TEXT NOT NULL,
    "clientId"             TEXT,
    "planoId"              TEXT NOT NULL,
    "valorCentavos"        INTEGER NOT NULL,
    "moeda"                TEXT NOT NULL DEFAULT 'BRL',
    "provedor"             TEXT NOT NULL DEFAULT 'mercadopago',
    "provedorAssinaturaId" TEXT NOT NULL,
    "estado"               TEXT NOT NULL,
    "motivoDoEstado"       TEXT,
    "dono"                 TEXT NOT NULL,
    "proximaCobrancaEm"    DATETIME,
    "ultimaCobrancaEm"     DATETIME,
    "cobrancasFalhadas"    INTEGER NOT NULL DEFAULT 0,
    "canceladaEm"          DATETIME,
    "createdAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AssinaturaRecorrente_clientRequestId_key" ON "AssinaturaRecorrente"("clientRequestId");
CREATE UNIQUE INDEX "AssinaturaRecorrente_provedorAssinaturaId_key" ON "AssinaturaRecorrente"("provedorAssinaturaId");
CREATE INDEX "AssinaturaRecorrente_estado_idx" ON "AssinaturaRecorrente"("estado");
CREATE INDEX "AssinaturaRecorrente_proximaCobrancaEm_idx" ON "AssinaturaRecorrente"("proximaCobrancaEm");

CREATE TABLE "CobrancaRecorrente" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "assinaturaId"        TEXT NOT NULL,
    "provedorPagamentoId" TEXT NOT NULL,
    "competencia"         TEXT NOT NULL,
    "valorCentavos"       INTEGER NOT NULL,
    "moeda"               TEXT NOT NULL DEFAULT 'BRL',
    "taxaCentavos"        INTEGER,
    "liquidoCentavos"     INTEGER,
    "estado"              TEXT NOT NULL,
    "motivo"              TEXT,
    "confirmadoEm"        DATETIME NOT NULL,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CobrancaRecorrente_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "AssinaturaRecorrente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- TRAVA 1 — o webhook reenviado cai no mesmo registro, nunca cria um segundo.
CREATE UNIQUE INDEX "CobrancaRecorrente_provedorPagamentoId_key" ON "CobrancaRecorrente"("provedorPagamentoId");
-- TRAVA 2 — o MESMO MÊS não pode ser cobrado duas vezes, ainda que por dois
-- pagamentos diferentes (ids diferentes, que a trava 1 não pegaria).
CREATE UNIQUE INDEX "CobrancaRecorrente_assinaturaId_competencia_key" ON "CobrancaRecorrente"("assinaturaId", "competencia");
CREATE INDEX "CobrancaRecorrente_competencia_idx" ON "CobrancaRecorrente"("competencia");
