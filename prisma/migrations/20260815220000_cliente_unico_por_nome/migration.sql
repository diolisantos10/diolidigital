-- CLIENTE ÚNICO POR NOME (aditiva, escrita à mão — nada de recriar tabela).
--
-- Em 15/08/2026 o City Jobs virou dois clientes: a rota do piloto assistido
-- buscava por nome EXATO e criava em silêncio quando não achava. `Client.name`
-- não tinha unicidade nenhuma, então nada no banco impedia.
--
-- Esta migration:
--   1. cria `nameKey` (nome normalizado: lower + trim + espaço colapsado);
--   2. faz o backfill das linhas que já existem;
--   3. DESEMPATA as duplicatas que já estão no banco sem apagar nada — a linha
--      mais antiga de cada grupo fica com a chave limpa, as demais recebem
--      `chave#<id>`. Isso é o que permite criar o índice único sem derrubar a
--      migration e sem destruir trabalho pendurado (projeto, aprovação,
--      conversa). A FUSÃO das duplicatas é decisão do dono do negócio, não
--      efeito colateral de deploy — `scripts/clientes-duplicados.mts` lista o
--      que existe e o que está pendurado em cada linha.
--   4. cria a restrição de unicidade.
--
-- Rollback: `DROP INDEX "Client_workspaceId_nameKey_key"` e ignorar a coluna.

ALTER TABLE "Client" ADD COLUMN "nameKey" TEXT;

-- lower + trim + colapso de espaço. Os três `replace` aninhados cobrem até 8
-- espaços seguidos; SQLite não tem regex, e nome de cliente com mais que isso
-- não é dado, é acidente de digitação — e continua sendo tratado como nome
-- distinto, o que é o comportamento seguro (falha aparece, não some).
UPDATE "Client"
SET "nameKey" = lower(
  replace(replace(replace(trim("name"), '  ', ' '), '  ', ' '), '  ', ' ')
);

-- Desempate das duplicatas JÁ existentes: a mais antiga do grupo mantém a chave
-- limpa (é a que os caminhos novos vão reencontrar), as outras ficam com uma
-- chave própria e continuam intactas, com tudo que têm pendurado.
UPDATE "Client"
SET "nameKey" = "nameKey" || '#' || "id"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "workspaceId", "nameKey"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS rn
    FROM "Client"
  )
  WHERE rn = 1
);

CREATE UNIQUE INDEX "Client_workspaceId_nameKey_key" ON "Client"("workspaceId", "nameKey");
