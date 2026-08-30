-- O PEDIDO RETIDO PELA ESCADA VOLTA SOZINHO.
--
-- Aditiva e nula por padrão: nenhum pedido existente muda de comportamento.
-- Pedido antigo parado em `precisa_decisao` continua parado, porque não há
-- fato gravado dizendo que foi a escada que o parou — e inventar esse fato
-- para trás seria rearmar pedidos que a Qualidade reprovou.
ALTER TABLE "ContentRequest" ADD COLUMN "escadaRetidaEm" DATETIME;
ALTER TABLE "ContentRequest" ADD COLUMN "escadaRepescagens" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ContentRequest_escadaRetidaEm_idx" ON "ContentRequest"("escadaRetidaEm");
