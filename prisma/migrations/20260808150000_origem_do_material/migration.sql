-- A ORIGEM DO MATERIAL — o meio da ponte que faltava.
--
-- ── O DEFEITO, MEDIDO NOS DOIS LADOS (08/08/2026) ──────────────────────────
--
-- O portal tem, desde 02/08, uma tela de arrastar e soltar
-- (`components/portal/EnvioDeMaterial.tsx` → `POST /api/media`). Ela funciona:
-- guarda o `MediaAsset`, fecha o `MaterialRequest`, destrava a esteira e avisa
-- a equipe.
--
-- E o arquivo NUNCA chegava na peça. `materiaisDeMarca()` é a única porta de
-- material para dentro de uma arte (consumidores: `execution/artes.ts` e
-- `execution/logo.ts`), lê EXCLUSIVAMENTE `DriveMaterial`, e `DriveMaterial`
-- nascia num único lugar do repositório inteiro: `app/api/portal/drive/route.ts`
-- — o caminho do Picker do Google.
--
-- Consequência prática: o CEO arrasta o logo no portal, o arquivo grava no
-- volume, o sistema diz "recebido" — e a peça continua saindo com o nome escrito
-- em fonte comum, com o arquivo real já no disco. Os bytes atravessavam; a
-- declaração de PAPEL, não.
--
-- ── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--
-- 1. `origem` — COLUNA, não prefixo dentro de `connectionId`. "drive" exige
--    conexão viva com o Google, como hoje; "envio_direto" não depende do Google
--    para nada, porque a casa já tem os bytes pelo ato do próprio dono. Esconder
--    o modelo dentro de uma string é o atalho que a casa paga em três meses.
--
-- 2. `connectionId` passa a ser NULO. É o ponto inteiro da mudança: material de
--    envio direto tem que continuar funcionando com o Google desconectado, e uma
--    coluna NOT NULL forçaria a inventar uma conexão que não existe.
--
-- 3. `@@unique([clientId, mediaAssetId])` — a idempotência do envio direto.
--    A chave antiga (`connectionId`, `fileId`) NÃO protege essa origem:
--    `connectionId` é NULO nela, e NULL não colide com NULL em índice único.
--    Sem esta chave, reenviar o mesmo logo duplicaria o material da peça.
--
-- ── POR QUE A RECONSTRUÇÃO DE TABELA, E POR QUE SÓ ESTA ────────────────────
--
-- SQLite não altera a nulidade de uma coluna existente: tornar `connectionId`
-- opcional exige CREATE new → INSERT SELECT → DROP → RENAME. Não há atalho.
--
-- ⚠️ `prisma migrate diff` propõe reconstruir TAMBÉM `ClientAiProvider`, por uma
-- divergência de chave estrangeira ANTERIOR a esta frente (já declarada no
-- cabeçalho de 20260807150000_google_drive_do_cliente). **Ela foi retirada deste
-- arquivo à mão.** Reconstruir uma tabela alheia de carona numa migration que
-- não é dela é como se perde dado em SQLite sobre volume; aquela divergência
-- continua sendo frente própria, com registro próprio.
--
-- Nenhum dado entregue a cliente é movido aqui: `DriveMaterial` guarda a ESCOLHA
-- de material, e todas as colunas antigas são copiadas uma a uma, pelo nome.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DriveMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'drive',
    "connectionId" TEXT,
    "fileId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "ehPasta" BOOLEAN NOT NULL DEFAULT false,
    "papel" TEXT,
    "papelSugerido" TEXT,
    "papelConfirmadoEm" DATETIME,
    "mediaAssetId" TEXT,
    "importadoEm" DATETIME,
    "erro" TEXT,
    "escolhidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Toda linha que já existe veio do Picker do Google. `origem` NÃO é lido da
-- tabela antiga (a coluna não existia lá): é carimbado 'drive' explicitamente,
-- que é o fato verdadeiro sobre cada uma delas.
INSERT INTO "new_DriveMaterial" ("id", "workspaceId", "clientId", "origem", "connectionId", "fileId", "nome", "mimeType", "tamanhoBytes", "ehPasta", "papel", "papelSugerido", "papelConfirmadoEm", "mediaAssetId", "importadoEm", "erro", "escolhidoEm", "updatedAt")
SELECT "id", "workspaceId", "clientId", 'drive', "connectionId", "fileId", "nome", "mimeType", "tamanhoBytes", "ehPasta", "papel", "papelSugerido", "papelConfirmadoEm", "mediaAssetId", "importadoEm", "erro", "escolhidoEm", "updatedAt" FROM "DriveMaterial";

DROP TABLE "DriveMaterial";
ALTER TABLE "new_DriveMaterial" RENAME TO "DriveMaterial";

CREATE INDEX "DriveMaterial_clientId_papel_idx" ON "DriveMaterial"("clientId", "papel");
CREATE INDEX "DriveMaterial_clientId_origem_idx" ON "DriveMaterial"("clientId", "origem");
CREATE INDEX "DriveMaterial_workspaceId_papelConfirmadoEm_idx" ON "DriveMaterial"("workspaceId", "papelConfirmadoEm");
CREATE UNIQUE INDEX "DriveMaterial_connectionId_fileId_key" ON "DriveMaterial"("connectionId", "fileId");
CREATE UNIQUE INDEX "DriveMaterial_clientId_mediaAssetId_key" ON "DriveMaterial"("clientId", "mediaAssetId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
