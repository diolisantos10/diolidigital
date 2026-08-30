-- A CONVERSA DA CÉLULA E A TRAVA DE QUEM RESPONDE
--
-- O CEO nomeou isto como CRITÉRIO DE CONCLUSÃO: "não concluído se dois agentes
-- podem responder ao mesmo tempo" e "se o histórico não sobreviver ao
-- reinício". Até 30/08/2026 a PortaDaConversa era só interface — o motor da
-- próxima mensagem rodava apenas com substituto de teste.
--
-- `TravaDaConversaDaCelula.conversaId` é CHAVE PRIMÁRIA de propósito: é ela
-- que faz o segundo INSERT simultâneo FALHAR no banco, em vez de dois agentes
-- lerem "está livre" e gravarem os dois. Mesmo desenho de RateLimitBucket.
--
-- Esta migration foi RECORTADA: o `migrate diff` desta data devolve junto um
-- RedefineTables de quatro tabelas alheias (AssinaturaRecorrente,
-- ClientAiProvider, MetricaDePost, ParceriaDoCliente), que é desvio de outras
-- frentes e está registrado em docs/pendencias.md. Levá-lo aqui faria uma
-- migration de prospecção derrubar e recriar tabelas de assinatura em produção.

-- CreateTable
CREATE TABLE "ConversaDaCelula" (
    "conversaId" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "agenteResponsavel" TEXT,
    "etapa" TEXT NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TravaDaConversaDaCelula" (
    "conversaId" TEXT NOT NULL PRIMARY KEY,
    "agente" TEXT NOT NULL,
    "expiraEm" DATETIME NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
