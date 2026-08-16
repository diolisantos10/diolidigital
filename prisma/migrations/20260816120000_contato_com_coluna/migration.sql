-- O CONTATO DO LEAD GANHA COLUNA — e o aviso do orçamento passa a ter o que
-- perguntar ao banco.
--
-- 16/08/2026. A cicatriz de 08/08 está medida: três interessados entraram pelo
-- briefing público (Sushi Cazza 51 dias, e mais dois) com a conversa inteira
-- gravada e nenhum lugar para onde ligar. O gate de contato fechou a porta da
-- frente naquele dia, mas o dado ficou onde estava: **dentro de `briefingJson`**,
-- um blob de texto.
--
-- Foi escolha declarada e o preço dela foi escrito junto (`docs/pendencias.md`):
-- "enquanto não for coluna, não dá para filtrar nem indexar por contato no
-- banco". O aviso do orçamento precisa exatamente disso — perguntar "quais
-- pedidos parados têm canal?" sem carregar e desserializar a fila inteira.
--
-- ── ADITIVA, E DE PROPÓSITO ────────────────────────────────────────────────
-- Quatro colunas novas, todas anuláveis, nenhum default. Nenhum registro muda
-- de comportamento por existir esta migration: o leitor único (`lerContato`)
-- continua achando o contato dos registros antigos dentro do `briefingJson`, e
-- há teste que reprova quem quebrar esse caminho.
--
-- ── O BACKFILL É CONSERVADOR PORQUE ERRAR PARA CIMA É CARO ─────────────────
-- Só sobe para a coluna o que já é válido POR CONSTRUÇÃO ou o que passa por uma
-- conferência de forma aqui mesmo:
--
--   • `$.contato.*` — o formato canônico, escrito pelo gate de 08/08, que já
--     passou por `montarContato` (e-mail validado, WhatsApp normalizado). Sobe
--     inteiro.
--   • `$.scope.prospect*` — o formato legado, que NUNCA foi validado por nada.
--     Sobe só com conferência: e-mail precisa ter a forma de e-mail; telefone
--     precisa ter de 10 a 13 dígitos depois de tirar máscara. O piso de 10 não é
--     capricho: aceitar 8 faria "R$ 1.500" e "12 posts" — que aparecem em TODO
--     briefing — virarem telefone, e telefone inventado é PIOR que nenhum,
--     porque desliga o alarme sem dar para onde ligar.
--
-- O que não passar na conferência simplesmente NÃO sobe, e isso é seguro: o
-- leitor único continua lendo o `briefingJson` como segunda origem. Deixar de
-- subir custa um índice; subir lixo custa uma ligação para um número que não
-- existe.
--
-- `contatoEm` fica NULO no backfill: a data em que a pessoa declarou o canal não
-- está gravada em lugar nenhum para estes registros, e carimbar a data da
-- migration afirmaria que ela declarou hoje. Ausência de informação não é
-- informação.
ALTER TABLE "ClientRequestDb" ADD COLUMN "contatoNome" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "contatoEmail" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "contatoWhatsapp" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "contatoEm" DATETIME;

-- ── Backfill 1: o formato canônico (válido por construção) ─────────────────
UPDATE "ClientRequestDb"
SET "contatoNome" = json_extract("briefingJson", '$.contato.nome')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.contato.nome') IS NOT NULL;

UPDATE "ClientRequestDb"
SET "contatoEmail" = json_extract("briefingJson", '$.contato.email')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.contato.email') IS NOT NULL;

UPDATE "ClientRequestDb"
SET "contatoWhatsapp" = json_extract("briefingJson", '$.contato.whatsapp')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.contato.whatsapp') IS NOT NULL;

UPDATE "ClientRequestDb"
SET "contatoEm" = json_extract("briefingJson", '$.contato.informadoEm')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.contato.informadoEm') IS NOT NULL
  AND ("contatoEmail" IS NOT NULL OR "contatoWhatsapp" IS NOT NULL);

-- ── Backfill 2: o formato legado, com conferência de forma ─────────────────
UPDATE "ClientRequestDb"
SET "contatoNome" = json_extract("briefingJson", '$.scope.prospectName')
WHERE "contatoNome" IS NULL
  AND "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND trim(coalesce(json_extract("briefingJson", '$.scope.prospectName'), '')) <> '';

-- E-mail: forma de e-mail, não "qualquer texto". `a@b.cc` é o menor que passa.
UPDATE "ClientRequestDb"
SET "contatoEmail" = trim(json_extract("briefingJson", '$.scope.prospectEmail'))
WHERE "contatoEmail" IS NULL
  AND "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND trim(coalesce(json_extract("briefingJson", '$.scope.prospectEmail'), '')) LIKE '_%@_%._%'
  AND trim(json_extract("briefingJson", '$.scope.prospectEmail')) NOT LIKE '% %';

-- Telefone: 10 a 13 DÍGITOS depois de tirar a máscara. As sete substituições
-- cobrem a máscara brasileira ("+55 (11) 98940-0692"); qualquer caractere
-- exótico que sobre engorda a contagem e faz o registro ser PULADO — que é o
-- lado seguro de errar, porque o leitor único continua lendo o briefingJson.
UPDATE "ClientRequestDb"
SET "contatoWhatsapp" = replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.scope.prospectPhone'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')
WHERE "contatoWhatsapp" IS NULL
  AND "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.scope.prospectPhone') IS NOT NULL
  AND length(replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.scope.prospectPhone'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')) BETWEEN 10 AND 13
  AND replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.scope.prospectPhone'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')
      GLOB '[0-9]*'
  AND NOT replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.scope.prospectPhone'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')
      GLOB '*[^0-9]*';

-- Nome SOZINHO não é contato: se nenhum canal subiu, o nome na coluna seria um
-- índice que promete o que não cumpre. Ele volta a ser nulo — "nome sozinho" era
-- exatamente como se chamava o desperdício de 51 dias.
UPDATE "ClientRequestDb"
SET "contatoNome" = NULL
WHERE "contatoEmail" IS NULL AND "contatoWhatsapp" IS NULL;

CREATE INDEX "ClientRequestDb_workspaceId_contatoEmail_idx" ON "ClientRequestDb"("workspaceId", "contatoEmail");
CREATE INDEX "ClientRequestDb_workspaceId_contatoWhatsapp_idx" ON "ClientRequestDb"("workspaceId", "contatoWhatsapp");
