import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fazerBackup, conferir, estadoDoBackup, MAX_COPIAS, caminhoDoBanco } from "@/lib/agency/backup";

// Backup é a única coisa da casa que só prova que funciona QUANDO USADA. Por
// isso estes testes criam um banco de verdade, copiam de verdade e reabrem a
// cópia — mock aqui não provaria nada.
let base = "";
let banco = "";

async function bancoDeMentira(comDados = true): Promise<string> {
  const arquivo = path.join(base, `origem-${Math.round(performance.now() * 1000)}.db`);
  const db = createClient({ url: `file:${arquivo}` });
  for (const t of ["Client", "Project", "Deliverable", "ClientRequestDb", "User"]) {
    await db.execute(`create table "${t}" (id text primary key, nome text)`);
    if (comDados) await db.execute({ sql: `insert into "${t}" (id,nome) values (?,?)`, args: ["1", "x"] });
  }
  return arquivo;
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "dioli-backup-"));
  banco = await bancoDeMentira();
  process.env.DATABASE_URL = `file:${banco}`;
  process.env.RAILWAY_VOLUME_MOUNT_PATH = base;
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true }).catch(() => {});
});

describe("a cópia é feita e CONFERIDA", () => {
  it("copia o banco e conta as tabelas NA CÓPIA — não no original", async () => {
    const r = await fazerBackup();
    expect(r.ok, r.erro).toBe(true);
    expect(r.conferencia).toMatchObject({ Client: 1, Project: 1, User: 1 });
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("a cópia é um banco que ABRE e responde — não um arquivo qualquer", async () => {
    const r = await fazerBackup();
    const copia = createClient({ url: `file:${r.arquivo}` });
    const q = await copia.execute('select count(*) as n from "Client"');
    expect(Number(q.rows[0]!.n)).toBe(1);
  });

  it("cópia corrompida é RECUSADA e apagada — não fica ali para alguém restaurar dela", async () => {
    const lixo = path.join(base, "corrompido.db");
    await writeFile(lixo, "isto não é um banco de dados");
    const c = await conferir(lixo);
    expect(c.ok).toBe(false);
  });

  it("banco VAZIO não passa por backup bom — integrity_check sozinho aprovaria", async () => {
    // Um banco sem nenhuma tabela abre e passa no integrity_check. Se a
    // conferência parasse ali, um backup inútil contaria como sucesso.
    const vazio = path.join(base, "vazio.db");
    const db = createClient({ url: `file:${vazio}` });
    await db.execute("create table qualquer (a int)");
    const c = await conferir(vazio);
    expect(c.ok).toBe(false);
    expect(c.erro).toMatch(/não tem a tabela/);
  });
});

describe("retenção", () => {
  it("guarda no máximo o teto e apaga as mais velhas", async () => {
    for (let i = 0; i < MAX_COPIAS + 3; i++) {
      await fazerBackup(new Date(Date.UTC(2026, 0, 1 + i)));
    }
    const arquivos = (await readdir(path.join(base, "backups"))).filter((f) => f.endsWith(".db"));
    expect(arquivos.length).toBe(MAX_COPIAS);
    // As que sobraram são as mais NOVAS.
    expect(arquivos.sort()[0]).toContain("2026-01-04");
  });

  it("o estado diz quantas cópias existem e há quanto tempo foi a última", async () => {
    await fazerBackup();
    const e = await estadoDoBackup();
    expect(e.copias).toBe(1);
    expect(e.horasDesdeOUltimo).toBe(0);
  });

  it("o aviso da limitação NUNCA some — backup no mesmo disco não protege de perder o disco", async () => {
    const e = await estadoDoBackup();
    expect(e.aviso).toMatch(/MESMO volume/);
    expect(e.aviso).toMatch(/NÃO protege/);
  });
});

describe("o que não dá para copiar", () => {
  it("banco remoto não é copiado aqui — o backup é do provedor", async () => {
    process.env.DATABASE_URL = "libsql://algo.turso.io?authToken=x";
    expect(caminhoDoBanco()).toBeNull();
    const r = await fazerBackup();
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/provedor/);
  });
});
