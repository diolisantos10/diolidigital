-- A PASSAGEM DO PEDIDO DO CLIENTE — duas colunas que a esteira automática exige.
--
-- Contexto (06/08/2026): o pedido do cliente gravava com status "novo" e ficava
-- lá. "Novo" não aciona ninguém. A triagem automática fecha a passagem entre o
-- formulário e o departamento, e para isso precisa gravar duas coisas que hoje
-- não têm onde morar:
--
--   • promisedFor   — o prazo que a AGÊNCIA prometeu (≠ `desiredFor`, que é a
--                     data que o CLIENTE pediu). Sai da tabela do catálogo,
--                     nunca do modelo. Sem coluna própria, prazo prometido e
--                     prazo desejado viram o mesmo campo — e a agência passa a
--                     dever o que nunca combinou.
--   • deliverableId — a peça que o pedido virou. É o elo que faltava: sem ele,
--                     "entregue" é palavra sem lastro.
--
-- Aditivo e nulo: nada existente é reescrito, nenhuma linha é perdida.
-- Sem `IF NOT EXISTS` porque o SQLite não aceita isso em `ADD COLUMN`.

ALTER TABLE "ContentRequest" ADD COLUMN "promisedFor" DATETIME;
ALTER TABLE "ContentRequest" ADD COLUMN "deliverableId" TEXT;

-- E o contador de tentativas da produção. Separa "a IA estava fora naquele
-- minuto" (retenta sozinho) de "isto precisa de gente" (para e chama). Sem ele,
-- ou o despertador retenta para sempre, ou uma piscada de rede vira hora humana.
ALTER TABLE "ContentRequest" ADD COLUMN "productionAttempts" INTEGER NOT NULL DEFAULT 0;
