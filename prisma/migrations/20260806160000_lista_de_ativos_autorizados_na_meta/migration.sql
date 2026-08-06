-- ── O QUE O TOKEN ALCANÇA NÃO É O QUE A AGÊNCIA PODE LER ───────────────────
--
-- Migration ADITIVA: cria UMA tabela nova. Nenhuma tabela existente é tocada,
-- nenhuma coluna muda, nenhum dado se move.
--
-- POR QUE (incidente de 06/08/2026): o CEO clicou "Conectar Facebook/Instagram"
-- no portal do cliente Foocci. A Meta devolveu um token do USUÁRIO dele, e o
-- sistema tratou "tudo o que o token alcança" como "tudo o que a agência pode
-- ler": 14 contas de anúncio (Santioh, Dilix, Queise, DileeBags e pessoais) e
-- todas as Páginas/Instagram da conta dele — gravadas como conexões da Foocci,
-- com o token de Página junto, que publica.
--
-- Esta tabela é o segundo conjunto, e ele é EXPLÍCITO: uma linha por ativo que
-- o cliente marcou na tela dele. Ausência de linha é NEGAÇÃO.
--
-- ⚠️ EFEITO NO DEPLOY, DECLARADO: a tabela nasce VAZIA de propósito. Isso
-- significa que, no primeiro boot, NENHUMA conexão de cliente está autorizada —
-- inclusive as legítimas. É fail-closed funcionando: preencher esta tabela por
-- inferência a partir das conexões que já existem seria inventar o
-- consentimento que o incidente provou não existir. Cada cliente marca na tela
-- dele (portal → Conexões).

CREATE TABLE IF NOT EXISTS "MetaAtivoAutorizado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "tipo" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "autorizadoPor" TEXT NOT NULL DEFAULT '',
    "autorizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MetaAtivoAutorizado_workspaceId_clientId_tipo_idx" ON "MetaAtivoAutorizado"("workspaceId", "clientId", "tipo");
CREATE INDEX IF NOT EXISTS "MetaAtivoAutorizado_workspaceId_tipo_externalId_idx" ON "MetaAtivoAutorizado"("workspaceId", "tipo", "externalId");
