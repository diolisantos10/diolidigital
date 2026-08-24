-- A TESTEMUNHA DE PAGAMENTO (24/08/2026)
--
-- Regra do CEO: nenhuma produção começa antes do pagamento confirmado. Até
-- aqui a casa não tinha ONDE guardar essa confirmação — o que existia era
-- `ClientRequestDb.status = "in_progress"`, escrito também por dois caminhos
-- que não cobram nada. Estado compartilhado não é prova de dinheiro.
--
-- ADITIVA: tabela nova, nenhuma tabela existente é tocada. O banco é SQLite num
-- volume do Railway com dados de piloto VIVOS.
--
-- A EXISTÊNCIA da linha é a prova. Ausência de linha é ausência de prova.
--
-- Rollback: DROP TABLE "PagamentoConfirmado". Sem a tabela, a leitura falha e o
-- portão RECUSA tudo que nasceu depois do corte — degrada para parado, nunca
-- para produzindo de graça.

CREATE TABLE "PagamentoConfirmado" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
    "origem"          TEXT NOT NULL,
    "provedorId"      TEXT,
    -- CENTAVOS, NOT NULL. Zero é zero, nunca "não informado" e nunca "liberado".
    "valorCentavos"   INTEGER NOT NULL,
    "moeda"           TEXT NOT NULL DEFAULT 'BRL',
    "confirmadoEm"    DATETIME NOT NULL,
    "registradoPor"   TEXT,
    "observacao"      TEXT,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Um pedido, um pagamento. O reenvio do webhook cai no mesmo registro.
CREATE UNIQUE INDEX "PagamentoConfirmado_clientRequestId_key" ON "PagamentoConfirmado"("clientRequestId");
CREATE INDEX "PagamentoConfirmado_confirmadoEm_idx" ON "PagamentoConfirmado"("confirmadoEm");
