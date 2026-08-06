-- ── O ÚLTIMO CONTADOR DE RITMO DA META SAI DA MEMÓRIA ─────────────────────
--
-- Migration ADITIVA: cria três tabelas novas. Nenhuma tabela existente é
-- tocada, nenhuma coluna muda, nenhum dado se move.
--
-- POR QUE:
--   • `lib/integrations/meta/ritmo.ts` guardava o teto por hora e o freio num
--     Map de processo; `lib/integrations/meta/leitura.ts` tinha um segundo
--     contador, também em memória, por conexão. Todo deploy zerava os dois — e
--     esta casa publica várias vezes por dia. Com N réplicas, o teto efetivo na
--     MESMA conta da Meta virava N × teto.
--   • O que a Meta restringiu em 03/08/2026 foi uma CONTA ("automação que não
--     segue nossas regras"), que é exatamente o eixo em que memória de processo
--     não soma.
--   • Os caches de `leitura.ts` e `ads.ts` não eram enfeite de performance: são
--     o que impede o dashboard e a varredura da esteira de virarem rajada. Em
--     memória, cada deploy devolvia a primeira rajada de graça.
--
-- A forma é a mesma já provada em `MetaAdCota` e em `RateLimitBucket`:
-- incremento ATÔMICO com o teste dentro do WHERE do UPDATE.

CREATE TABLE IF NOT EXISTS "MetaRitmoJanela" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "janela" INTEGER NOT NULL,
    "gastas" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaRitmoJanela_chave_janela_key" ON "MetaRitmoJanela"("chave", "janela");
CREATE INDEX IF NOT EXISTS "MetaRitmoJanela_janela_idx" ON "MetaRitmoJanela"("janela");

CREATE TABLE IF NOT EXISTS "MetaRitmoFreio" (
    "chave" TEXT NOT NULL PRIMARY KEY,
    "ate" DATETIME NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MetaRitmoFreio_ate_idx" ON "MetaRitmoFreio"("ate");

CREATE TABLE IF NOT EXISTS "MetaLeituraCache" (
    "chave" TEXT NOT NULL PRIMARY KEY,
    "valorJson" TEXT NOT NULL,
    "validoAte" DATETIME NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MetaLeituraCache_validoAte_idx" ON "MetaLeituraCache"("validoAte");
