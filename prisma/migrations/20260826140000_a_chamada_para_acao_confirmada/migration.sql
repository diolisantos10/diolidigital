-- A CHAMADA PARA AÇÃO QUE O CLIENTE CONFIRMOU.
--
-- Aditiva e anulável: toda linha existente continua com NULL, e NULL é o
-- comportamento de sempre (vale a leitura léxica do texto do pedido). Nenhum
-- default preenche uma ação que ninguém pediu.
ALTER TABLE "ContentRequest" ADD COLUMN "confirmedCta" TEXT;
