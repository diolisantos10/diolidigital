-- O CONTADOR DE REENVIO DA FILA DE EXCEÇÃO.
--
-- Em 09/08/2026 um aviso estava parado há 7 dias com o texto pronto e o motivo
-- registrado, esperando alguém abrir o painel. A fila passou a se cobrar: o que
-- falhou por motivo temporário é reenviado sozinho.
--
-- Reenvio sem contador é rajada. Sem esta coluna, um canal que nunca volta
-- receberia tentativa a cada rodada, para sempre — que é exatamente o padrão
-- que restringiu a conta de anúncios em 03/08.
ALTER TABLE "ClientNotice" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
