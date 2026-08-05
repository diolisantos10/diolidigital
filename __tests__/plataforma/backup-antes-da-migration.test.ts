// A CÓPIA ANTES DA CIRURGIA.
//
// Cinco migrations desta casa RECONSTROEM TABELA — o padrão obrigatório do
// SQLite: `PRAGMA foreign_keys=OFF` → CREATE nova → INSERT SELECT → DROP →
// RENAME. Uma delas reconstrói QUATRO tabelas de uma vez, incluindo
// `SocialPost` e `Deliverable`, que é o trabalho entregue ao cliente.
//
// Interrompa no meio — e ele JÁ é interrompido, porque dois deploys simultâneos
// disputam o lock do volume e o `migrate deploy` deste repositório tem retry
// exatamente por isso — e o que fica é uma tabela órfã com a real derrubada.
// Sem rollback. Sem undo.
//
// A função de backup existia e já era CONFERIDA. Só nunca rodava no único
// momento em que ela é obrigatória.
//
// AS DUAS METADES: a cópia boa é feita e CONFERIDA; a cópia ruim é recusada e
// APAGADA (nunca fica no disco fingindo ser backup).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtemp, readdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { backupPreMigration, pastaPreMigration, conferir, caminhoDoBanco } from "@/scripts/backup-antes-da-migration.mjs";

const ambienteOriginal = { ...process.env };
let raiz = "";

/** Um banco com as tabelas que a conferência exige — e com CONTEÚDO, porque um
 *  banco vazio passa no integrity_check e não serve para restaurar nada. */
async function bancoDeMentira(arquivo: string, linhasDeCliente = 3) {
  const db = createClient({ url: `file:${arquivo}` });
  for (const t of ["Client", "Project", "Deliverable", "ClientRequestDb", "User"]) {
    await db.execute(`CREATE TABLE "${t}" (id TEXT PRIMARY KEY, nome TEXT)`);
  }
  for (let i = 0; i < linhasDeCliente; i++) {
    await db.execute(`INSERT INTO "Client" (id, nome) VALUES ('c${i}', 'Cliente ${i}')`);
  }
  return db;
}

beforeEach(async () => {
  raiz = await mkdtemp(path.join(tmpdir(), "dioli-backup-"));
  process.env.RAILWAY_VOLUME_MOUNT_PATH = raiz;
  process.env.DATABASE_URL = `file:${path.join(raiz, "dioli.db")}`;
});

afterEach(async () => {
  process.env = { ...ambienteOriginal };
  await rm(raiz, { recursive: true, force: true });
});

describe("onde a cópia vai parar", () => {
  it("vive numa pasta SEPARADA da rotina diária", () => {
    // A rotina (lib/agency/backup.ts) lista `backups/*.db` e assume que ordem
    // alfabética é ordem cronológica. Misturar outro prefixo lá quebraria a
    // leitura de "qual foi a última cópia" — por isso a subpasta.
    expect(pastaPreMigration()).toBe(path.join(raiz, "backups", "pre-migration"));
  });

  it("banco remoto (libsql) é PULADO sem derrubar o boot — lá o backup é do provedor", async () => {
    process.env.DATABASE_URL = "libsql://algo.turso.io?authToken=xxx";
    expect(caminhoDoBanco()).toBeNull();

    const r = await backupPreMigration();
    expect(r.ok).toBe(true);
    expect(r.pulado).toBe(true);
  });
});

describe("a cópia boa", () => {
  it("é feita, é CONFERIDA, e a conferência conta o que existe DENTRO dela", async () => {
    await bancoDeMentira(path.join(raiz, "dioli.db"), 3);

    const r = await backupPreMigration();

    expect(r.ok).toBe(true);
    expect(r.arquivo).toContain(path.join("backups", "pre-migration"));
    expect((await stat(r.arquivo!)).size).toBeGreaterThan(0);
    // A prova de que ela tem CONTEÚDO, não só estrutura.
    expect(r.conferencia).toMatchObject({ Client: 3, Project: 0, User: 0 });
  });

  it("a cópia é um banco de verdade — abre e tem os mesmos dados", async () => {
    await bancoDeMentira(path.join(raiz, "dioli.db"), 5);
    const r = await backupPreMigration();

    const copia = createClient({ url: `file:${r.arquivo}` });
    const linhas = await copia.execute("SELECT count(*) as n FROM Client");
    expect(Number(linhas.rows[0]!.n)).toBe(5);
  });

  it("guarda no máximo 5 cópias — cada uma é um deploy que mexeu no schema", async () => {
    await bancoDeMentira(path.join(raiz, "dioli.db"));

    for (let i = 0; i < 7; i++) {
      // Carimbo por segundo: sem avançar o relógio, duas cópias colidiriam.
      await backupPreMigration(new Date(Date.UTC(2026, 7, 5, 3, 0, i)));
    }

    const arquivos = (await readdir(pastaPreMigration())).filter((f) => f.endsWith(".db"));
    expect(arquivos.length).toBe(5);
    // As que sobraram são as MAIS NOVAS.
    expect(arquivos.sort().at(-1)).toContain("03-00-06");
  });
});

describe("a cópia ruim nunca fica no disco", () => {
  it("banco sem as tabelas essenciais → RECUSADO, e o arquivo é apagado", async () => {
    // Um banco que abre e passa no integrity_check, mas não tem nada dentro.
    const db = createClient({ url: `file:${path.join(raiz, "dioli.db")}` });
    await db.execute("CREATE TABLE Qualquer (id TEXT)");

    const r = await backupPreMigration();

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não tem a tabela/);
    // Deixar a cópia ali faria alguém restaurar dela um dia, achando que era boa.
    const arquivos = (await readdir(pastaPreMigration()).catch(() => [])).filter((f) => f.endsWith(".db"));
    expect(arquivos).toEqual([]);
  });

  it("origem que não é banco → RECUSADO, sem estourar", async () => {
    await writeFile(path.join(raiz, "dioli.db"), "isto não é um SQLite");

    const r = await backupPreMigration();

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("conferir() reprova arquivo que nem abre", async () => {
    const ruim = path.join(raiz, "ruim.db");
    await writeFile(ruim, "lixo");
    const c = await conferir(ruim);
    expect(c.ok).toBe(false);
  });
});
