-- A COBRANÇA DO PM (aditiva): marca quando a varredura já cobrou este handoff.
-- Sem ela, o relógio cobraria o mesmo ponto a cada 5 minutos — e alarme que
-- repete é alarme que ensina a ignorar. Rollback: ignorar a coluna.

ALTER TABLE "HandoffV2" ADD COLUMN "cobradoEm" DATETIME;
