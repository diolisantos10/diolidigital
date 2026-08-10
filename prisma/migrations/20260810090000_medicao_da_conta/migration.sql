-- A MEDIÇÃO DA CONTA DO CLIENTE.
--
-- Pedido do CEO em 09/08/2026: a agência produzia cega para o que já tinha
-- funcionado na conta que o cliente já tem. Três marcas com histórico, e
-- nenhuma leitura dele.
--
-- Uma linha por post POR LEITURA, de propósito: desempenho é curva, não
-- fotografia. Sobrescrever apagaria a diferença entre a primeira hora e a
-- primeira semana, que é onde mora a informação.
--
-- Toda métrica é OPCIONAL. Nulo quer dizer NÃO MEDIDO — nunca zero. Zero é um
-- número que a plataforma devolveu; nulo é a ausência dela. Confundir os dois
-- faz a agência declarar fracasso onde houve silêncio.
CREATE TABLE "MetricaDePost" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "clientId"       TEXT NOT NULL,
  "externalPostId" TEXT NOT NULL,
  "plataforma"     TEXT NOT NULL DEFAULT 'instagram',
  "alcance"        INTEGER,
  "impressoes"     INTEGER,
  "curtidas"       INTEGER,
  "comentarios"    INTEGER,
  "salvamentos"    INTEGER,
  "compartilham"   INTEGER,
  "cliques"        INTEGER,
  "lidoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "origem"         TEXT NOT NULL DEFAULT 'api'
);
CREATE INDEX "MetricaDePost_clientId_externalPostId_idx" ON "MetricaDePost"("clientId", "externalPostId");
CREATE INDEX "MetricaDePost_clientId_lidoEm_idx" ON "MetricaDePost"("clientId", "lidoEm");
