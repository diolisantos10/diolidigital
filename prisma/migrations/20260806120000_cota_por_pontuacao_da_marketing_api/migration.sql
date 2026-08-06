-- ── A COTA DA MARKETING API SAI DA MEMÓRIA E ENTRA NO BANCO ────────────────
--
-- Migration ADITIVA: cria duas tabelas novas. Nenhuma tabela existente é
-- tocada, nenhuma coluna muda, nenhum dado se move.
--
-- POR QUE: a Marketing API não é limitada por "chamadas por hora". Ela é
-- limitada por PONTUAÇÃO, por CONTA DE ANÚNCIOS, com decaimento de 300s —
-- leitura = 1 ponto, escrita = 3 pontos, teto 60 no nível de desenvolvimento
-- (fonte capturada em 06/08/2026:
--  docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md).
-- Vinte escritas seguidas bloqueiam a conta por 5 minutos.
--
-- O contador antigo era um Map em memória de processo: com N réplicas o teto
-- efetivo virava N × teto e todo deploy zerava. O que a Meta restringiu em
-- 03/08/2026 foi uma CONTA, que é exatamente o eixo em que memória de processo
-- não soma.

CREATE TABLE IF NOT EXISTS "MetaAdCota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contaId" TEXT NOT NULL,
    "janela" INTEGER NOT NULL,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaAdCota_contaId_janela_key" ON "MetaAdCota"("contaId", "janela");
CREATE INDEX IF NOT EXISTS "MetaAdCota_janela_idx" ON "MetaAdCota"("janela");

CREATE TABLE IF NOT EXISTS "MetaAdFreio" (
    "contaId" TEXT NOT NULL PRIMARY KEY,
    "ate" DATETIME NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
