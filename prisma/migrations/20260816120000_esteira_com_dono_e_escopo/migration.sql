-- A ESTEIRA GANHA DONO DE AGÊNCIA (aditiva, escrita à mão — nada é recriado).
--
-- Achado do `seguranca` na PR #166 (G-5): a sala do PM lia `RecusaV2` e
-- `HandoffV2` SEM NENHUM filtro de agência, e o motivo de uma recusa carrega o
-- NOME DO NEGÓCIO do lead. Numa base com mais de uma agência, o PM de uma via
-- a fila comercial da outra.
--
-- As duas tabelas nasceram sem `workspaceId` porque nasceram para um piloto de
-- um cliente só. Agora elas são a fila de trabalho da casa.
--
-- Rollback: ignorar as colunas. Nada legado muda de comportamento.
--
-- ⚠️ As linhas ANTIGAS ficam com `workspaceId` NULO, e a leitura é ESTRITA
-- (`workspaceId = <o da sessão>`). Linha órfã deixa de aparecer na tela. É
-- escolha declarada: não mostrar nada é melhor do que mostrar o lead de outra
-- agência, e adivinhar o dono de uma linha órfã seria inventar.

ALTER TABLE "RecusaV2"  ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "HandoffV2" ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "RecusaV2_workspaceId_em_idx"        ON "RecusaV2"("workspaceId", "em");
CREATE INDEX "HandoffV2_workspaceId_status_idx"   ON "HandoffV2"("workspaceId", "status");
