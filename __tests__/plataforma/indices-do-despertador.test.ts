// OS ÍNDICES QUE FALTAVAM — provados pelo PLANO DE CONSULTA, não pela intenção.
//
// Um teste que só verifica "existe um CREATE INDEX no arquivo" não prova nada:
// índice com a coluna líder errada existe e não é usado. Dois casos desta casa
// eram exatamente isso — `AdCampaign` tinha `[workspaceId, status]` e o
// guardião de verba busca só por `status`; `MetaConnection` tinha
// `@@unique([workspaceId, platform, externalId])` e o webhook busca por
// `{platform, externalId}` sem workspace, porque é o workspace que ele está
// tentando descobrir.
//
// Por isso este arquivo aplica as migrations num banco temporário e lê o
// `EXPLAIN QUERY PLAN` de verdade. AS DUAS METADES: com os índices, SEARCH;
// derrubando-os, SCAN — a varredura completa que, numa SQLite em volume, SEGURA
// O LOCK DE ESCRITA e vira "database is locked" no deploy.
//
// A consulta mais importante daqui é a do despertador: ela roda A CADA 5 MIN,
// para sempre (lib/agency/despertador.ts:62).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MIGRATION = "prisma/migrations/20260805200000_indices_do_despertador_e_do_webhook/migration.sql";

/** As consultas quentes, escritas como o Prisma as emite. */
const CONSULTAS: Record<string, string> = {
  "despertador — projetos a retomar (a cada 5 min)":
    `SELECT id FROM "Project"
       WHERE "clientRequestId" IS NOT NULL AND "directionApprovedAt" IS NOT NULL
         AND "executionAttempts" < 5
         AND (("executionStatus" = 'running' AND "executionStartedAt" < '2026-01-01')
              OR "executionStatus" = 'failed' OR "executionStatus" = 'pending')
       ORDER BY "executionRequestedAt" ASC LIMIT 5`,
  "webhook de WhatsApp — descobrir o workspace pelo número":
    `SELECT * FROM "MetaConnection" WHERE "platform" = 'whatsapp' AND "externalId" = '123' LIMIT 1`,
  "guardião de verba — campanhas ativas de todos os inquilinos":
    `SELECT * FROM "AdCampaign" WHERE "status" = 'active'`,
  "disparo de WhatsApp — eventos pendentes":
    `SELECT * FROM "ActivityEvent" WHERE "type" = 'whatsapp_notify' ORDER BY "timestamp" DESC LIMIT 50`,
  "linha do tempo do inquilino":
    `SELECT * FROM "ActivityEvent" WHERE "workspaceId" = 'ws1' ORDER BY "timestamp" DESC LIMIT 50`,
  "clientes do workspace": `SELECT * FROM "Client" WHERE "workspaceId" = 'ws1'`,
  "tarefas do projeto": `SELECT * FROM "Task" WHERE "projectId" = 'p1'`,
  "link vivo do portal":
    `SELECT * FROM "PortalAccess" WHERE "clientRequestId" = 'cr1' AND "revokedAt" IS NULL LIMIT 1`,
  "log de IA do workspace":
    `SELECT * FROM "AIRunLog" WHERE "workspaceId" = 'ws1' ORDER BY "createdAt" DESC LIMIT 20`,
};

let raiz = "";
let comIndices: Client;
let semIndices: Client;
let nomesDosIndices: string[] = [];

async function plano(db: Client, sql: string): Promise<string> {
  const r = await db.execute("EXPLAIN QUERY PLAN " + sql);
  return r.rows.map((x) => String(x.detail)).join(" | ");
}

beforeAll(async () => {
  raiz = await mkdtemp(path.join(tmpdir(), "dioli-indices-"));
  const arquivo = path.join(raiz, "teste.db");

  // O banco de verdade, construído pelas migrations versionadas — não por
  // `db push`. É assim que a produção o constrói (scripts/start.sh).
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${arquivo}` },
    stdio: "ignore",
  });

  nomesDosIndices = [...(await readFile(MIGRATION, "utf8")).matchAll(/CREATE INDEX IF NOT EXISTS "([^"]+)"/g)].map(
    (m) => m[1],
  );

  const semArquivo = path.join(raiz, "sem-indices.db");
  await (await import("node:fs/promises")).copyFile(arquivo, semArquivo);

  comIndices = createClient({ url: `file:${arquivo}` });
  semIndices = createClient({ url: `file:${semArquivo}` });
  for (const i of nomesDosIndices) await semIndices.execute(`DROP INDEX IF EXISTS "${i}"`);
}, 120_000);

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true });
});

describe("a migration é aditiva e cria os índices esperados", () => {
  it("cria índice e NADA mais — nenhuma tabela reconstruída, nenhum dado movido", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    const comandos = sql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"));
    for (const c of comandos) {
      expect(c.startsWith("CREATE INDEX IF NOT EXISTS"), `comando não-aditivo: ${c}`).toBe(true);
    }
    expect(comandos.length).toBeGreaterThanOrEqual(14);
  });

  it("todos os índices EXISTEM no banco construído pelas migrations", async () => {
    const r = await comIndices.execute("SELECT name FROM sqlite_master WHERE type = 'index'");
    const existentes = new Set(r.rows.map((x) => String(x.name)));
    for (const i of nomesDosIndices) expect(existentes.has(i), `índice ausente: ${i}`).toBe(true);
  });
});

describe("o plano de consulta ANTES e DEPOIS", () => {
  it.each(Object.entries(CONSULTAS))("%s: era SCAN, virou SEARCH", async (_nome, sql) => {
    const antes = await plano(semIndices, sql);
    const depois = await plano(comIndices, sql);

    // A metade que documenta o problema: sem o índice, varredura completa.
    expect(antes).toContain("SCAN");
    // A metade que prova o conserto.
    expect(depois).toContain("SEARCH");
    expect(depois).not.toContain("SCAN");
  });

  it("o índice do despertador cobre o OR de três estados de uma vez", async () => {
    const p = await plano(comIndices, CONSULTAS["despertador — projetos a retomar (a cada 5 min)"]);
    expect(p).toContain("MULTI-INDEX OR");
    expect(p).toContain("Project_executionStatus_executionRequestedAt_idx");
  });

  it("o webhook usa o índice NOVO, não o unique — a coluna líder do unique é a errada", async () => {
    const p = await plano(comIndices, CONSULTAS["webhook de WhatsApp — descobrir o workspace pelo número"]);
    expect(p).toContain("MetaConnection_platform_externalId_idx");
  });
});

describe("o que o relatório apontou e NÃO era problema", () => {
  it("Deliverable.projectId já estava coberto pelo prefixo de [projectId, cycleId]", async () => {
    // Índice composto serve a partir do prefixo da ESQUERDA. Acrescentar um
    // índice só de `projectId` seria custo de escrita sem ganho de leitura —
    // e este teste é o registro de por que ele não foi criado.
    const p = await plano(semIndices, `SELECT * FROM "Deliverable" WHERE "projectId" = 'p1'`);
    expect(p).toContain("SEARCH");
    expect(p).toContain("Deliverable_projectId_cycleId_idx");
  });
});
