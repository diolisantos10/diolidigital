-- A PONTE DE ARQUIVOS E A FILA DE EXCEÇÕES DA CÉLULA DE PROSPECÇÃO
--
-- Quatro tabelas que existiam em prisma/schema.prisma e que NENHUMA migration
-- criava. Em desenvolvimento ninguém percebe: a casa usa `prisma db push`, que
-- aplica o schema direto. Em produção, `scripts/start.sh` recusa `db push` de
-- propósito e só aplica esquema por `migrate deploy` — as tabelas simplesmente
-- não existiriam, e toda leitura do Prisma aqui está embrulhada em
-- `.catch(() => null)`, então a falha chegaria ao cliente EM SILÊNCIO.
-- É exatamente o incidente do Google Drive de 07/08/2026 se repetindo.
--
-- ── O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ ──────────────────────────
-- O `prisma migrate diff` desta data devolveu, junto, um `RedefineTables` de
-- QUATRO tabelas alheias — AssinaturaRecorrente, ClientAiProvider,
-- MetricaDePost e ParceriaDoCliente — e um DROP INDEX de ClientRequestDb.
-- Isso é desvio schema-vs-migration de OUTRAS frentes, não desta.
-- Levá-lo aqui faria esta migration DERRUBAR E RECRIAR tabelas de produção
-- que este PR não tem nada a ver, escondendo a dívida de outro dentro do
-- commit de quem só queria criar as suas quatro.
-- O desvio está registrado em docs/pendencias.md com dono a definir.
-- CreateTable
CREATE TABLE "ArquivoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "clienteId" TEXT,
    "projetoId" TEXT,
    "direcao" TEXT NOT NULL,
    "linhagemId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "extensao" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caminhoInterno" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'recebido',
    "destinatarioDeclarado" TEXT NOT NULL,
    "motivoDaQuarentena" TEXT,
    "retencaoAteEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EventoDoArquivoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExcecaoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT,
    "arquivoId" TEXT,
    "caso" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "prazoEm" DATETIME NOT NULL,
    "contexto" TEXT NOT NULL,
    "acaoRecomendada" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'aberta',
    "interrompeAutomacao" BOOLEAN NOT NULL DEFAULT false,
    "abertaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" DATETIME,
    "resolucao" TEXT
);

-- CreateTable
CREATE TABLE "EventoDaExcecaoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "excecaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

