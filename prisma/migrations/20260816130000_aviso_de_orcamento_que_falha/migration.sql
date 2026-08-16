-- O AVISO DE ORÇAMENTO QUE FALHA NUNCA MAIS SOME (16/08/2026)
--
-- Medido em produção: `RESEND_FROM` não existe no Railway. Sem ela,
-- `lib/email/send.ts` cai no remetente compartilhado `onboarding@resend.dev`,
-- que o Resend só entrega para o dono da própria conta — todo prospect real
-- é recusado. Até aqui a falha virava `console.warn` e mais nada: nenhuma
-- fila, nenhum reenvio, e a evidência morria no rodízio do log do container.
-- No dia em que o CEO setar `RESEND_FROM`, ninguém seria reavisado — é o
-- silêncio de 51 dias (Sushi Cazza) recriado, agora invisível porque parece
-- que o sistema fez a parte dele.
--
-- ADITIVA, escrita à mão — nada de recriar tabela. O banco é SQLite num volume
-- do Railway com dados de piloto VIVOS.
--
-- Rollback: ignorar as quatro colunas. Nascem NULA (ou 0, para a contagem) em
-- toda linha existente, e nulo aqui significa exatamente o que significa no
-- código: "nunca tentamos avisar este pedido" — nunca um zero disfarçado de
-- falha.

ALTER TABLE "ClientRequestDb" ADD COLUMN "avisoOrcamentoStatus" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "avisoOrcamentoDetalhe" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "avisoOrcamentoEm" DATETIME;
ALTER TABLE "ClientRequestDb" ADD COLUMN "avisoOrcamentoTentativas" INTEGER NOT NULL DEFAULT 0;

-- A fila de reenvio filtra por status e ordena pelo mais antigo primeiro —
-- exatamente o par que este índice cobre.
CREATE INDEX "ClientRequestDb_avisoOrcamentoStatus_avisoOrcamentoEm_idx"
  ON "ClientRequestDb"("avisoOrcamentoStatus", "avisoOrcamentoEm");
