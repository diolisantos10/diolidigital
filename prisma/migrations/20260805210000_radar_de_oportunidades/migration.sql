-- ── O RADAR DE OPORTUNIDADES ────────────────────────────────────────────────
--
-- Migration ADITIVA e de risco zero: cria UMA tabela nova e três índices.
-- Nenhuma tabela existente é reconstruída, nenhuma coluna muda, nenhum byte de
-- dado de cliente se move. É o tipo que pode rodar no volume do Railway sem
-- susto.
--
-- POR QUE ELA EXISTE COMO ARQUIVO, e não só como `db push`: produção aplica
-- schema EXCLUSIVAMENTE por `prisma migrate deploy` (`scripts/start.sh`).
-- Schema editado sem migration versionada faz o build passar e a produção
-- quebrar em runtime — coluna que não existe, com o erro aparecendo longe da
-- causa. Já está na vitrine da plataforma.
--
-- `IF NOT EXISTS` em tudo: uma base que já tenha recebido a tabela por `db push`
-- (o caso das bases de desenvolvimento) não derruba o deploy.

CREATE TABLE IF NOT EXISTS "Oportunidade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "urlExterna" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "orcamentoInformado" INTEGER,
    "prazoInformado" TEXT,
    "textoBruto" TEXT NOT NULL,
    "impressaoDigital" TEXT NOT NULL,
    "nota" INTEGER,
    "servicoSugerido" TEXT,
    "raciocinio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "propostaTexto" TEXT,
    "valorSugerido" INTEGER,
    "decididoPor" TEXT,
    "decididoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- A fila de triagem: "as novas deste workspace".
CREATE INDEX IF NOT EXISTS "Oportunidade_workspaceId_status_idx" ON "Oportunidade"("workspaceId", "status");

-- A listagem ordena por nota desc e depois por data. Sem índice, o SQLite varre
-- a tabela e ordena em memória — e varredura aqui segura o ÚNICO lock de escrita
-- do banco inteiro, que é como "database is locked" vira erro de deploy.
CREATE INDEX IF NOT EXISTS "Oportunidade_workspaceId_nota_createdAt_idx" ON "Oportunidade"("workspaceId", "nota", "createdAt");

-- A segunda trava de dedup roda em TODA ingestão: o mesmo projeto chegando
-- pelas duas portas com textos diferentes (e-mail em HTML × texto colado do
-- site) só é reconhecido pelo LINK. Sem índice, é varredura de tabela a cada
-- oportunidade que entra.
CREATE INDEX IF NOT EXISTS "Oportunidade_workspaceId_urlExterna_idx" ON "Oportunidade"("workspaceId", "urlExterna");

-- A TRAVA DA DEDUP — o mecanismo, não o aviso.
-- As duas portas de entrada (colar no painel · e-mail de alerta encaminhado)
-- podem trazer o MESMO projeto ao mesmo tempo. A checagem em código resolve o
-- caso comum; esta constraint resolve a CORRIDA, que é o caso que a checagem em
-- código não pega. Por workspace, nunca global: dois inquilinos podem
-- legitimamente estar olhando o mesmo projeto público.
CREATE UNIQUE INDEX IF NOT EXISTS "Oportunidade_workspaceId_impressaoDigital_key" ON "Oportunidade"("workspaceId", "impressaoDigital");
