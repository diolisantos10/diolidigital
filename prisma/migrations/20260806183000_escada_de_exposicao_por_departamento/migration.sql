-- A escada de exposição: sombra → allowlist → wide.
-- O degrau mora aqui, e não numa constante de código, porque é ele que decide
-- se a saída de um departamento CHEGA ao cliente — e porque só uma linha de
-- banco consegue registrar quem subiu, quando e com qual número.
CREATE TABLE "DepartmentLadder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    -- Fail-closed no próprio default: linha sem degrau declarado é SOMBRA.
    "degrau" TEXT NOT NULL DEFAULT 'sombra',
    "clientesLiberados" TEXT NOT NULL DEFAULT '[]',
    "motivo" TEXT,
    "decididoPor" TEXT,
    "provaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DepartmentLadder_workspaceId_departmentId_key" ON "DepartmentLadder"("workspaceId", "departmentId");

-- Um registro por peça produzida, INCLUSIVE as barradas. É o denominador da
-- evidência: contar só `Deliverable` daria histórico limpo ao departamento que
-- inventa dado, porque peça barrada no piso nunca vira entrega.
CREATE TABLE "DepartmentLadderRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "clientId" TEXT,
    "deliverableId" TEXT,
    "degrauNaEpoca" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "detalhe" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DepartmentLadderRecord_workspaceId_departmentId_criadoEm_idx" ON "DepartmentLadderRecord"("workspaceId", "departmentId", "criadoEm");
