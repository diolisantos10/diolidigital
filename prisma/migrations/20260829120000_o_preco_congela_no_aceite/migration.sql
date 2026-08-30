-- O PREÇO CONGELA NO INSTANTE DO ACEITE (ordem C1 do CEO, 29/08/2026).
--
-- `briefingJson.estimate` é o preço AGORA — corrente, muda a cada negociação.
-- Estas duas colunas são o preço NAQUELE DIA: o que o cliente leu quando disse
-- sim, gravado uma vez, no mesmo instante em que `status` vira "accepted", e
-- que uma renegociação posterior não pode reescrever. Ver `caminho-automatico.ts`
-- (`marcarAceite` / `precoCongeladoNoAceite`).
--
-- Aditiva: colunas novas e nulas em tudo que já existe. Nulo aqui significa
-- "este pedido ainda não foi aceito com número entregue" — nunca se infere um
-- valor para linha antiga.
ALTER TABLE "ClientRequestDb" ADD COLUMN "precoAceitoJson" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "precoAceitoEm" DATETIME;
