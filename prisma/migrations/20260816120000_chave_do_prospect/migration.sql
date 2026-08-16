-- QUEM JÁ BATEU NESTA PORTA ANTES (16/08/2026)
--
-- Pergunta do CEO: "se entrar um cliente com o mesmo e-mail e fizer cinco
-- briefings um atrás do outro, o que acontece com o sistema?"
--
-- ADITIVA, escrita à mão — nada de recriar tabela. O banco é SQLite num volume
-- do Railway com dados de piloto VIVOS; qualquer `DROP`/recreate perderia
-- briefing de cliente real, e briefing perdido é o pior desfecho possível desta
-- frente.
--
-- ⚠️ OS DOIS ÍNDICES SÃO NÃO-ÚNICOS, E ISSO É DECISÃO, NÃO DESCUIDO:
--
--   1. já existe dado duplicado no volume AGORA (a ficha da Camila Pereira,
--      duplicada em 08/08/2026, ainda esperando decisão de fusão do CEO). Um
--      `CREATE UNIQUE INDEX` sobre dado duplicado **falha** e derruba o deploy
--      inteiro — a migração não pode ser o mecanismo de limpeza;
--   2. um mesmo cliente PODE legitimamente mandar um segundo briefing e pedir um
--      segundo projeto. Uma restrição única faria o pedido legítimo dele falhar
--      na gravação. Não duplicar CADASTRO é o objetivo; recusar PEDIDO seria uma
--      prisão, e o Diretor vetou explicitamente.
--
-- A dedup mora na aplicação (`lib/agency/comercial/chave-do-prospect.ts` e
-- `lib/agency/execution/cliente-do-briefing.ts`), onde dá para distinguir
-- "reenviou o mesmo pedido" de "contratou outra coisa" — que é pergunta de
-- negócio, não de restrição de coluna.
--
-- Rollback: ignorar a coluna e os índices. Nada legado muda de comportamento; a
-- coluna nasce NULA em toda linha existente, e nulo significa exatamente o que
-- significa no código — "esta linha não se junta a ninguém".

ALTER TABLE "ClientRequestDb" ADD COLUMN "chaveDoProspect" TEXT;

CREATE INDEX "ClientRequestDb_workspaceId_chaveDoProspect_idx"
  ON "ClientRequestDb"("workspaceId", "chaveDoProspect");

CREATE INDEX "Client_workspaceId_email_idx"
  ON "Client"("workspaceId", "email");
