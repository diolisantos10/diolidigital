-- O CONVITE DO PARCEIRO — a única coisa que faz a casa SABER que a conversa é dele.
--
-- O parceiro não paga, então a pergunta obrigatória da verba não protege
-- ninguém e só trava o pedido dele (a conversa das 13:43 parou exatamente ali).
-- Dispensar a pergunta exige SABER que é parceria — e na sala de briefing o
-- visitante é anônimo: só `sessionId`. `clientRequestId` vem do corpo, e a casa
-- já o trata como não-confiável.
--
-- Então a verdade vem de um token que a CASA cunhou, no molde de `PortalAccess`:
-- em caminho público o `clientId` sai SEMPRE do token — derivação, nunca
-- comparação.
--
-- O convite não é a autorização: ele APONTA para a `IsencaoDeParceria`, que
-- continua sendo a fonte da verdade e é conferida VIVA a cada uso. Revogar ou
-- deixar vencer a isenção mata o convite no mesmo instante.
--
-- Tabela NOVA e aditiva: nada existente é tocado.
CREATE TABLE "ConviteDeParceria" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    -- 256 bits de aleatório, base64url. Credencial não pode ser adivinhável.
    "token"       TEXT NOT NULL,
    -- O dono da conversa, derivado do token e de mais nada.
    "clientId"    TEXT NOT NULL,
    -- Quem cunhou. Sai da sessão, nunca do corpo.
    "criadoPor"   TEXT NOT NULL,
    -- Prazo PRÓPRIO: convite não vira senha eterna.
    "expiraEm"    DATETIME NOT NULL,
    -- Revogação explícita, para o link que vazou.
    "revogadoEm"  DATETIME,
    -- Trilha: credencial sem trilha é a que ninguém percebe sendo usada.
    "usos"        INTEGER NOT NULL DEFAULT 0,
    "ultimoUsoEm" DATETIME,
    "observacao"  TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConviteDeParceria_token_key" ON "ConviteDeParceria"("token");
CREATE INDEX "ConviteDeParceria_clientId_idx" ON "ConviteDeParceria"("clientId");
