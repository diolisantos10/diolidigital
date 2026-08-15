-- ARQUITETURA OPERACIONAL V2 — MARCO 2: o núcleo canônico. TUDO ADITIVO.
--
-- 15/08/2026, autorização contínua do CEO (Marcos 1 a 7). Sete tabelas novas,
-- nenhuma tabela legada tocada. O que cada uma é:
--
--   ExecucaoV2         — determinação do CEO: toda execução registra humano/IA,
--                        ator, modelo, versão, custo, data e ferramentas.
--   TransicaoDeEstado  — rastro de toda transição da máquina canônica; chave
--                        de idempotência ÚNICA (a mesma transição nunca 2x).
--   BloqueioV2         — bloqueio tipado (9 motivos) com dono, SLA e evidência.
--   OutboxV2           — efeito externo em fila com retentativa; generaliza o
--                        padrão do WhatsAppOutbox, que fica.
--   FlagV2             — feature flags da migração; desligar = rollback de
--                        comportamento sem tocar dado.
--   ReconciliacaoV2    — relatórios da leitura dupla (M3).
--   HeartbeatDoRelogio — prova de vida dos relógios (M6).
--
-- Rollback: nenhum uso destas tabelas sem flag ligada; reverter = desligar a
-- flag. A remoção de estruturas legadas é etapa tardia, fora deste marco,
-- e só com aprovação do CEO.

CREATE TABLE "ExecucaoV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ator" TEXT NOT NULL,
    "usuarioId" TEXT,
    "modelo" TEXT,
    "versaoModelo" TEXT,
    "custoUsd" REAL,
    "funcaoId" TEXT NOT NULL,
    "departamentoId" TEXT NOT NULL,
    "ferramentas" TEXT NOT NULL DEFAULT '[]',
    "correlationId" TEXT NOT NULL,
    "inicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" DATETIME,
    "resultado" TEXT
);

CREATE TABLE "TransicaoDeEstado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "atorTipo" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "versaoLida" INTEGER NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BloqueioV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "donoFuncaoId" TEXT NOT NULL,
    "abertoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaAte" DATETIME,
    "evidencia" TEXT,
    "acaoRecomendada" TEXT NOT NULL,
    "escalonadoPara" TEXT,
    "resolvidoEm" DATETIME,
    "correlationId" TEXT NOT NULL
);

CREATE TABLE "OutboxV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chaveIdempotencia" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEm" DATETIME,
    "ultimoErro" TEXT
);

CREATE TABLE "FlagV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "escopo" TEXT NOT NULL DEFAULT 'global',
    "ligada" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT NOT NULL,
    "decididoPor" TEXT NOT NULL,
    "em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ReconciliacaoV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidadeTipo" TEXT NOT NULL,
    "execucaoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL,
    "divergentes" INTEGER NOT NULL,
    "amostra" TEXT NOT NULL DEFAULT '[]',
    "veredito" TEXT NOT NULL
);

CREATE TABLE "HeartbeatDoRelogio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "relogio" TEXT NOT NULL,
    "ultimaBatida" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertadoEm" DATETIME
);

CREATE INDEX "ExecucaoV2_correlationId_idx" ON "ExecucaoV2"("correlationId");
CREATE INDEX "ExecucaoV2_departamentoId_funcaoId_idx" ON "ExecucaoV2"("departamentoId", "funcaoId");
CREATE INDEX "ExecucaoV2_ator_inicio_idx" ON "ExecucaoV2"("ator", "inicio");
CREATE UNIQUE INDEX "TransicaoDeEstado_chaveIdempotencia_key" ON "TransicaoDeEstado"("chaveIdempotencia");
CREATE INDEX "TransicaoDeEstado_entidadeTipo_entidadeId_criadoEm_idx" ON "TransicaoDeEstado"("entidadeTipo", "entidadeId", "criadoEm");
CREATE INDEX "TransicaoDeEstado_correlationId_idx" ON "TransicaoDeEstado"("correlationId");
CREATE INDEX "BloqueioV2_entidadeTipo_entidadeId_resolvidoEm_idx" ON "BloqueioV2"("entidadeTipo", "entidadeId", "resolvidoEm");
CREATE INDEX "BloqueioV2_tipo_resolvidoEm_idx" ON "BloqueioV2"("tipo", "resolvidoEm");
CREATE UNIQUE INDEX "OutboxV2_chaveIdempotencia_key" ON "OutboxV2"("chaveIdempotencia");
CREATE INDEX "OutboxV2_status_proximaTentativaEm_idx" ON "OutboxV2"("status", "proximaTentativaEm");
CREATE INDEX "OutboxV2_correlationId_idx" ON "OutboxV2"("correlationId");
CREATE UNIQUE INDEX "FlagV2_chave_escopo_key" ON "FlagV2"("chave", "escopo");
CREATE INDEX "ReconciliacaoV2_entidadeTipo_execucaoEm_idx" ON "ReconciliacaoV2"("entidadeTipo", "execucaoEm");
CREATE UNIQUE INDEX "HeartbeatDoRelogio_relogio_key" ON "HeartbeatDoRelogio"("relogio");
