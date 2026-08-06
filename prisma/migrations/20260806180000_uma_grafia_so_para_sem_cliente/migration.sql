-- ── "SEM CLIENTE" PASSA A TER UMA GRAFIA SÓ: NULL ────────────────────────────
--
-- ─── O QUE ACONTECEU (perícia de 06/08/2026) ────────────────────────────────
-- No banco de produção, "sem cliente" existia em DUAS grafias. O callback do
-- OAuth grava `NULL`; `/api/meta/token` — o fluxo de token colado, que é como a
-- agência conectou tudo em 03/08 — gravava `''`. As conexões de nível agência
-- nasceram todas com `''`.
--
-- Toda guarda desta casa pergunta `clientId IS NULL`. Com `''`, a guarda não
-- reconhecia o fluxo da agência e caía no ramo do CLIENTE. O custo medido:
-- `scripts/meta-pericia-alcance.mts` marcou para exclusão 25 de 25 conexões de
-- ativo — incluindo as 2 legítimas da Foocci e as 4 da própria Dioli. Um
-- `--apply` teria zerado a casa.
--
-- ─── POR QUE NORMALIZAR EM VEZ DE CONVIVER ──────────────────────────────────
-- Conviver com as duas custa um `OR [NULL, '']` em cada consulta nova, para
-- sempre — e a consulta que ESQUECER o OR não falha: ela responde errado, em
-- silêncio, sobre DE QUEM É o dado. É a mesma família que `normalizarId` já
-- tinha resolvido para `act_123` vs `123`.
--
-- ─── AS DUAS METADES ────────────────────────────────────────────────────────
-- 1. REPARO: as linhas antigas viram NULL. `''` nunca foi id de cliente válido
--    (id é cuid), então esta troca não pode confundir dois donos diferentes —
--    ela só junta duas grafias do MESMO significado.
--    Nenhum índice único quebra: no SQLite, NULLs são distintos entre si, então
--    juntar linhas em NULL nunca colide.
-- 2. TRAVA: gatilhos que RECUSAM `''` nas duas tabelas em que o incidente
--    aconteceu. Sem eles, o próximo caminho de escrita ressuscita a segunda
--    grafia e o defeito volta calado. Gatilho é aditivo: não move dado, não
--    reconstrói tabela, e é reversível com DROP TRIGGER.

-- ── 1. REPARO ───────────────────────────────────────────────────────────────
-- Todas as colunas `clientId` OPCIONAIS do schema. Ser exaustivo aqui é de
-- propósito: a grafia vazada por um caminho não fica presa a uma tabela.

UPDATE "MetaConnection"        SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "MetaAtivoAutorizado"   SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "User"                  SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "AdCampaign"            SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "GoogleConnection"      SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "GoogleReview"          SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "StrategyRoom"          SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "ActivityEvent"         SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "ClientRequestDb"       SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "PortalMessage"         SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "SocialPost"            SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "BrainArtifact"         SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "ApprovalRequest"       SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "PortalAccess"          SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "MediaAsset"            SET "clientId" = NULL WHERE "clientId" = '';
UPDATE "DepartmentLadderRecord" SET "clientId" = NULL WHERE "clientId" = '';

-- ── 2. TRAVA ────────────────────────────────────────────────────────────────
-- O banco passa a RECUSAR a segunda grafia nas duas tabelas da Meta. A mensagem
-- diz o conserto, não só o erro: quem escrever `''` amanhã lê o que fazer.

DROP TRIGGER IF EXISTS "meta_connection_sem_cliente_e_null_ins";
CREATE TRIGGER "meta_connection_sem_cliente_e_null_ins"
BEFORE INSERT ON "MetaConnection"
WHEN NEW."clientId" = ''
BEGIN
  SELECT RAISE(ABORT, 'MetaConnection.clientId: "sem cliente" se escreve NULL, nunca "" — use donoDe()');
END;

DROP TRIGGER IF EXISTS "meta_connection_sem_cliente_e_null_upd";
CREATE TRIGGER "meta_connection_sem_cliente_e_null_upd"
BEFORE UPDATE ON "MetaConnection"
WHEN NEW."clientId" = ''
BEGIN
  SELECT RAISE(ABORT, 'MetaConnection.clientId: "sem cliente" se escreve NULL, nunca "" — use donoDe()');
END;

DROP TRIGGER IF EXISTS "meta_ativo_sem_cliente_e_null_ins";
CREATE TRIGGER "meta_ativo_sem_cliente_e_null_ins"
BEFORE INSERT ON "MetaAtivoAutorizado"
WHEN NEW."clientId" = ''
BEGIN
  SELECT RAISE(ABORT, 'MetaAtivoAutorizado.clientId: "sem cliente" se escreve NULL, nunca "" — use donoDe()');
END;

DROP TRIGGER IF EXISTS "meta_ativo_sem_cliente_e_null_upd";
CREATE TRIGGER "meta_ativo_sem_cliente_e_null_upd"
BEFORE UPDATE ON "MetaAtivoAutorizado"
WHEN NEW."clientId" = ''
BEGIN
  SELECT RAISE(ABORT, 'MetaAtivoAutorizado.clientId: "sem cliente" se escreve NULL, nunca "" — use donoDe()');
END;
