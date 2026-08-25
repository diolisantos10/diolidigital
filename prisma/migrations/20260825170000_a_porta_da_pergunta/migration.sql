-- A PORTA DA PERGUNTA (25/08/2026)
--
-- A casa perguntava ao cliente e não tinha onde ele responder.
--
-- Medido em produção: a cliente pediu 1 story, a TRAVA 2-B parou (certo — a
-- tabela só tem o pacote de 4) e o texto dizia "a equipe confirma com você".
-- Ela respondeu no chat do portal "pode ser o pacote de 4" e o pedido NÃO
-- ANDOU: `precisa_decisao` não tem saída pelo lado do cliente, e o único
-- leitor do chat (`pm-responde`) é proibido de decidir escopo.
--
-- `pendingQuestionJson` guarda a pergunta ESTRUTURADA (opções + efeito de cada
-- uma) — o COMO responder, que `declineReason` (o POR QUÊ, em prosa) nunca teve.
-- `confirmedQuantity` guarda o número que o cliente confirmou: sem ele a
-- releitura léxica do texto original ("1 story") reproduziria a mesma parada
-- para sempre.
--
-- ADITIVA e NULA por padrão: nenhum pedido existente muda de comportamento.
-- Nulo em `confirmedQuantity` NÃO vira 1 — quantidade inventada é erro de dinheiro.
ALTER TABLE "ContentRequest" ADD COLUMN "pendingQuestionJson" TEXT;
ALTER TABLE "ContentRequest" ADD COLUMN "confirmedQuantity" INTEGER;
