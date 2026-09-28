-- MODO DE APROVAÇÃO + PACOTE DA MARCA + AMARRAÇÃO DE CUSTO POR PEÇA (27/09/2026)
--
-- Decisão do CEO: cada marca escolhe COMO aprova o conteúdo (peça por peça
-- pelo CEO, piloto automático, silêncio publica em janela semanal, ou
-- aprovação mensal em bloco) e o QUE se produz (o pacote). A trava de
-- publicação (`lib/integrations/meta/trava-de-publicacao.ts`) passa a aceitar
-- aprovação por REGRA quando o carimbo bate com o modo em vigor da marca —
-- ver `lib/agency/esteira/modo-de-aprovacao.ts`.
--
-- Aditiva, do começo ao fim: nenhuma coluna troca tipo, nenhuma linha
-- existente perde dado. `modoAprovacao` nasce com DEFAULT para que toda marca
-- já cadastrada continue em `APROVACAO_CEO` — o modo mais conservador — sem
-- migração de dado nenhuma.

ALTER TABLE "Client" ADD COLUMN "modoAprovacao" TEXT NOT NULL DEFAULT 'APROVACAO_CEO';
ALTER TABLE "Client" ADD COLUMN "modoPendente" TEXT;
ALTER TABLE "Client" ADD COLUMN "modoPendenteVigenteEm" DATETIME;
ALTER TABLE "Client" ADD COLUMN "primeiraSemanaAprovadaEm" DATETIME;
ALTER TABLE "Client" ADD COLUMN "pacoteJson" TEXT;

-- A amarração do custo de IA à peça (e, por ela, ao cliente). Nula em toda
-- linha existente: log antigo não sabe de que peça era, e nulo é a resposta
-- honesta — nunca "peça desconhecida" fingida de zero.
ALTER TABLE "AIRunLog" ADD COLUMN "postId" TEXT;
CREATE INDEX "AIRunLog_clientId_postId_idx" ON "AIRunLog"("clientId", "postId");
