-- A SÉRIE DA MEDIÇÃO (24/08/2026)
--
-- O detector de "o evento PAROU de chegar" existia e não tinha o que comparar:
-- a casa lia o desempenho de um período e esquecia. Sem passado, um evento de
-- conversão que some produz um número menor e mais nada — que é exatamente o
-- achado do case Farol 27.
--
-- ADITIVA: tabela nova, nenhuma tabela existente é tocada. O banco é SQLite num
-- volume do Railway com dados de piloto VIVOS.
--
-- O QUE ELA GUARDA: os NOMES dos eventos que chegaram, por campanha e por
-- período. Nada além disso — sem quantidade, sem gasto, sem público. A pergunta
-- é binária ("o evento X chegou neste período?") e nome basta; quantidade não
-- acrescenta nada à pergunta e acrescenta tudo ao estrago de um vazamento.
--
-- Rollback: DROP TABLE "MedicaoDeEventos". Sem a tabela, a conciliação não
-- encontra período anterior e devolve "não medido" — nunca "íntegro". Perder
-- esta tabela degrada a casa para honesta, jamais para verde.

CREATE TABLE "MedicaoDeEventos" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "campanhaId" TEXT NOT NULL,
  "contaId"    TEXT NOT NULL,
  "desde"      TEXT NOT NULL,
  "ate"        TEXT NOT NULL,
  "eventos"    TEXT NOT NULL DEFAULT '',
  "lidoEm"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MedicaoDeEventos_campanhaId_desde_ate_key"
  ON "MedicaoDeEventos"("campanhaId", "desde", "ate");

-- A busca do período anterior é "desta campanha, o mais recente que termina
-- antes de hoje" — exatamente o par abaixo.
CREATE INDEX "MedicaoDeEventos_campanhaId_ate_idx"
  ON "MedicaoDeEventos"("campanhaId", "ate");

-- Para apagar a série inteira de uma conta de uma vez quando o cliente sai.
CREATE INDEX "MedicaoDeEventos_contaId_idx" ON "MedicaoDeEventos"("contaId");
