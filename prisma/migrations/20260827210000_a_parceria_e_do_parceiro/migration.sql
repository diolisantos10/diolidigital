-- A PARCERIA É DO PARCEIRO — NÃO DO PEDIDO. Quebra do nó circular.
--
-- Medido em quatro pontos: `IsencaoDeParceria` exige `clientRequestId`
-- ("isenção sem pedido não isenta nada"), o portão de pagamento a lê por
-- pedido, o convite exigia isenção viva, e o pedido nasce do briefing:
--
--     convite → isenção → pedido → briefing → (convite)
--
-- A porta existia e não podia ser aberta a primeira vez — não havia como cunhar
-- o link do PRIMEIRO parceiro. É a família "trava sem fechadura", em círculo.
--
-- A autorização passa a viver no nível do PARCEIRO, existindo antes de qualquer
-- pedido, e vira a ÚNICA fonte da verdade: a isenção por pedido passa a ser
-- DERIVADA dela. Verdade escrita em dois lugares já está errada em um deles.
--
-- Tabela NOVA e aditiva: nada existente é tocado, e as isenções já concedidas
-- continuam valendo exatamente como valiam.
CREATE TABLE "ParceriaDoCliente" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    -- Um cliente, UMA parceria: duas linhas vivas seriam duas verdades.
    "clientId"            TEXT NOT NULL,
    -- A FONTE da autorização (o CEO, citando D-0B9). Nominal e obrigatório.
    "autorizadaPor"       TEXT NOT NULL,
    -- Quem apertou o botão, da sessão. Nulo = veio por script.
    "registradaPor"       TEXT,
    -- Obrigatória: parceria eterna vira esquecimento.
    "validaAte"           DATETIME NOT NULL,
    -- Sem escopo, a parceria cobre tudo.
    "escopo"              TEXT NOT NULL,
    -- Zero é ZERO, nunca "sem limite".
    "pecasContratadas"    INTEGER NOT NULL,
    -- Sem teto, o parceiro come o crédito do cliente pagante.
    "tetoDeIaCentavosUsd" INTEGER NOT NULL,
    -- Revogar aqui mata os convites do parceiro na hora.
    "revogadaEm"          DATETIME,
    "observacao"          TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ParceriaDoCliente_clientId_key" ON "ParceriaDoCliente"("clientId");
