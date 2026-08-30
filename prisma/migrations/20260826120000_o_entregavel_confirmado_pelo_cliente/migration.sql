-- O ENTREGÁVEL QUE O CLIENTE CONFIRMOU.
--
-- Aditiva e anulável: toda linha existente continua com NULL, e NULL é o
-- comportamento de sempre (vale a leitura léxica do texto do pedido).
-- Nenhuma linha é reescrita, nenhum default preenche verdade que ninguém disse.
ALTER TABLE "ContentRequest" ADD COLUMN "confirmedDeliverable" TEXT;
