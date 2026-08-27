-- A TERCEIRA TESTEMUNHA: a parceria isenta de pagamento.
--
-- Aditiva: cria tabela nova, não toca em nenhuma existente. Nenhum pedido que
-- já existe ganha isenção — a tabela nasce vazia, e vazia significa "ninguém é
-- parceiro", que é o comportamento de sempre.
--
-- NÃO é um pagamento de R$ 0,00: `PagamentoConfirmado` recusa valor ≤ 0 de
-- propósito, para que toda linha de lá seja dinheiro de verdade. A isenção
-- libera a esteira sem nunca afirmar que entrou dinheiro.
CREATE TABLE "IsencaoDeParceria" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "clientRequestId"     TEXT NOT NULL,
    "clientId"            TEXT,
    "autorizadaPor"       TEXT NOT NULL,
    "validaAte"           DATETIME NOT NULL,
    "escopo"              TEXT NOT NULL,
    "pecasContratadas"    INTEGER NOT NULL,
    "tetoDeIaCentavosUsd" INTEGER NOT NULL,
    "observacao"          TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IsencaoDeParceria_clientRequestId_key" ON "IsencaoDeParceria"("clientRequestId");
CREATE INDEX "IsencaoDeParceria_validaAte_idx" ON "IsencaoDeParceria"("validaAte");
