-- O AVISO — a ponte entre "a esteira precisa de algo" e "o cliente ficou sabendo".
--
-- Aditiva: cria uma tabela nova, não toca em nenhuma existente.
--
-- Sem isto, a esteira escrevia no portal e torcia para o cliente abrir. Um
-- pedido de material podia ficar semanas parado porque ninguém avisou que ele
-- existia — o projeto travado e a agência achando que a bola estava com o
-- cliente.
--
-- A regra: o aviso nunca se perde. Havendo canal automático, sai sozinho e o
-- registro fica de comprovante; não havendo, vira fila para o time disparar à
-- mão, com texto e link já prontos.

CREATE TABLE IF NOT EXISTS "ClientNotice" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "projectId"   TEXT,
    "kind"        TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "link"        TEXT,
    "status"      TEXT NOT NULL DEFAULT 'pendente',
    "channel"     TEXT NOT NULL DEFAULT 'nenhum',
    "failReason"  TEXT,
    "sentAt"      DATETIME,
    "sentBy"      TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "ClientNotice_clientId_fkey" FOREIGN KEY ("clientId")
      REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClientNotice_workspaceId_status_idx" ON "ClientNotice"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "ClientNotice_clientId_status_idx"    ON "ClientNotice"("clientId", "status");
