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
-- **NENHUMA origem é confiada sem conferência de forma.** As duas passam pelo
-- mesmo crivo: e-mail precisa ter forma de e-mail e não ter espaço; telefone
-- precisa ter de 10 a 13 dígitos depois de tirar máscara, e mais nada além de
-- dígitos. O piso de 10 não é capricho: aceitar 8 faria "R$ 1.500" e "12 posts"
-- — que aparecem em TODO briefing — virarem telefone, e telefone inventado é
-- PIOR que nenhum, porque desliga o alarme sem dar para onde ligar.
--
-- 🔴 A PRIMEIRA VERSÃO DISTO CONFIAVA NO `$.contato` COMO "VÁLIDO POR
-- CONSTRUÇÃO", E A PREMISSA ERA FALSA — achado pelo `seguranca` em 16/08 com
-- POST observado. `POST /api/brain/client-requests` é **rota pública** e
-- espalhava o `briefingJson` do corpo inteiro; quando `montarContato` devolvia
-- `null` (contato inválido), o `contato` CRU do atacante sobrevivia dentro do
-- blob. Um e-mail com `<script>` entrava por ali.
--
-- O estrago não era o script — `lerContato` valida e o gate continuava dizendo
-- `lead_incompleto`. Era a COLUNA: `filtroDeContato` usa `contatoEmail IS NOT
-- NULL` e **não revalida**, então o registro forjado apareceria em
-- `?contato=sim` enquanto o dossiê diz "não há para onde responder". É
-- exatamente a "duas verdades adjacentes" que esta frente existe para matar.
--
-- Consertado nas DUAS pontas: a rota parou de preservar `contato` não validado
-- (a premissa passou a ser verdadeira daqui para a frente) **e** o backfill
-- confere a forma (para o que já foi gravado antes do conserto). Uma ponta só
-- deixaria a outra metade do problema de pé.
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

-- ⚠️ TUDO NUMA TRANSAÇÃO. Medido pelo `seguranca`: em SQLite, sem isto, o
-- primeiro UPDATE PERSISTE mesmo com o segundo falhando. Uma quebra no meio
-- deixaria colunas preenchidas e os dois `CREATE INDEX` do fim de fora — e aí
-- `?contato=nao` passaria a devolver lead que TEM canal. Falha virando
-- afirmação é pior que falha: ninguém vai atrás do que parece ter dado certo.
BEGIN;

-- ── Backfill 1: o formato canônico — CONFERIDO, não confiado ───────────────
UPDATE "ClientRequestDb"
SET "contatoEmail" = trim(json_extract("briefingJson", '$.contato.email'))
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND trim(coalesce(json_extract("briefingJson", '$.contato.email'), '')) LIKE '_%@_%._%'
  AND trim(json_extract("briefingJson", '$.contato.email')) NOT LIKE '% %';

UPDATE "ClientRequestDb"
SET "contatoWhatsapp" = replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.contato.whatsapp'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND json_extract("briefingJson", '$.contato.whatsapp') IS NOT NULL
  AND length(replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.contato.whatsapp'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')) BETWEEN 10 AND 13
  AND NOT replace(replace(replace(replace(replace(replace(replace(
      json_extract("briefingJson", '$.contato.whatsapp'),
      '+',''),'-',''),' ',''),'(',''),')',''),'.',''),'/','')
      GLOB '*[^0-9]*';

-- O nome só entra DEPOIS dos canais, e só onde um canal entrou. Nome é o único
-- campo que não tem forma para conferir — a defesa dele é não existir sozinho.
UPDATE "ClientRequestDb"
SET "contatoNome" = json_extract("briefingJson", '$.contato.nome')
WHERE "briefingJson" IS NOT NULL
  AND json_valid("briefingJson")
  AND trim(coalesce(json_extract("briefingJson", '$.contato.nome'), '')) <> ''
  AND ("contatoEmail" IS NOT NULL OR "contatoWhatsapp" IS NOT NULL);

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

-- Os índices entram DENTRO da mesma transação do backfill, e é o ponto da
-- transação: coluna preenchida sem índice é um recorte que ninguém consegue
-- responder, e índice sem a coluna conferida é um recorte que responde errado.
CREATE INDEX "ClientRequestDb_workspaceId_contatoEmail_idx" ON "ClientRequestDb"("workspaceId", "contatoEmail");
CREATE INDEX "ClientRequestDb_workspaceId_contatoWhatsapp_idx" ON "ClientRequestDb"("workspaceId", "contatoWhatsapp");

COMMIT;
