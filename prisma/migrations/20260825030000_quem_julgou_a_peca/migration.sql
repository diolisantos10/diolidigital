-- QUEM JULGOU A PEÇA (25/08/2026)
--
-- Medido em produção, case Farol 27, rodada 5: as 8 chamadas ao juiz `gpt-4o`
-- voltaram HTTP 429, o julgamento caiu para o `claude-haiku-4-5` — o MESMO
-- modelo que escreveu as peças — e NENHUMA tela da casa mudou. 0 de 10 peças
-- com árbitro independente, exibidas como se tivessem tido um.
--
-- A causa de a tela não mudar é esta tabela: `revisionStatus` responde "qual foi
-- o veredito" e não responde "quem julgou". Duas perguntas, uma coluna só.
--
-- ADITIVA: duas colunas NULLABLE, nenhuma linha existente é tocada e nenhuma
-- leitura antiga quebra. O banco é SQLite num volume do Railway com dados de
-- piloto VIVOS.
--
-- ⚠️ NULO SIGNIFICA "NÃO MEDIDO", NUNCA "INDEPENDENTE". Toda leitura desta
-- coluna trata nulo como desconhecido — ausência de medição não é verde.
--
-- Rollback: as duas colunas podem ser ignoradas sem efeito; o código degrada
-- para "não medido", que é o lado seguro.

ALTER TABLE "Deliverable" ADD COLUMN "qualityArbiter" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "qualityArbitragem" TEXT;
