// "SEM CLIENTE" TEM UMA GRAFIA SÓ — e o banco recusa a segunda.
//
// ─── O que este arquivo protege ─────────────────────────────────────────────
// Em produção, "sem cliente" existia como `null` E como `""`. Toda guarda desta
// casa pergunta `clientId IS NULL`; com `""`, a guarda caía no ramo do CLIENTE.
// O custo medido em 06/08/2026: a perícia marcou 25 de 25 conexões de ativo
// para exclusão — incluindo as 2 legítimas da Foocci e as 4 da própria Dioli.
//
// O teste roda a MIGRATION DE VERDADE contra um SQLite de verdade, sobre o
// histórico de verdade. Um `CREATE TABLE` copiado aqui deixaria de falhar
// exatamente no dia em que o schema mudasse.
//
// AS DUAS METADES:
//   • barra o problema plantado — as linhas `""` viram NULL, e uma escrita nova
//     com `""` é RECUSADA pelo banco;
//   • não inventa problema no caso limpo — `NULL` e um `clientId` de verdade
//     atravessam a migration intactos e continuam podendo ser escritos.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

const DIR = path.join(process.cwd(), "prisma", "migrations");
const ALVO = "20260806180000_uma_grafia_so_para_sem_cliente";

/**
 * Separador de comandos que respeita o corpo de um TRIGGER.
 *
 * Um `split(";")` ingênuo quebra `CREATE TRIGGER ... BEGIN ...; END;` no meio —
 * e o teste passaria a medir o separador, não a migration.
 */
function comandosDe(sql: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let dentroDeBloco = false;
  for (const linha of sql.split("\n")) {
    if (linha.trim().startsWith("--")) continue;
    buffer += linha + "\n";
    if (/^\s*BEGIN\b/i.test(linha)) dentroDeBloco = true;
    if (/^\s*END\s*;/i.test(linha)) {
      dentroDeBloco = false;
      out.push(buffer);
      buffer = "";
      continue;
    }
    if (!dentroDeBloco && linha.trim().endsWith(";")) {
      out.push(buffer);
      buffer = "";
    }
  }
  return out;
}

async function aplicar(c: Client, nome: string): Promise<void> {
  const sql = readFileSync(path.join(DIR, nome, "migration.sql"), "utf8");
  for (const cmd of comandosDe(sql)) {
    const limpo = cmd.trim().replace(/;\s*$/, "");
    if (limpo) await c.execute(limpo);
  }
}

const AGORA = new Date().toISOString();

async function conexao(
  c: Client,
  id: string,
  clientId: string | null,
): Promise<void> {
  await c.execute({
    sql: `INSERT INTO "MetaConnection"
            (id, workspaceId, clientId, platform, externalId, name, status,
             accessTokenEncrypted, connectedAt, createdAt, updatedAt)
          VALUES (?, 'w1', ?, 'user', ?, 'x', 'connected', 'cifrado', ?, ?, ?)`,
    args: [id, clientId, `user:w1:${id}`, AGORA, AGORA, AGORA],
  });
}

async function contar(c: Client, where: string): Promise<number> {
  const r = await c.execute(`SELECT COUNT(*) AS n FROM "MetaConnection" WHERE ${where}`);
  return Number((r.rows[0] as unknown as { n: number | bigint }).n);
}

let banco: Client;

beforeAll(async () => {
  banco = createClient({ url: ":memory:" });

  // Todo o histórico ATÉ (sem incluir) a migration em teste.
  const migrations = readdirSync(DIR).filter((d) => !d.includes(".")).sort();
  for (const m of migrations) {
    if (m === ALVO) break;
    await aplicar(banco, m);
  }

  await banco.execute({
    sql: `INSERT INTO "AgencyWorkspace" (id, name, slug, createdAt) VALUES ('w1','W','w',?)`,
    args: [AGORA],
  });

  // O estado de produção: 24 conexões de nível agência com a SEGUNDA grafia,
  // uma com a canônica, e uma de cliente de verdade.
  for (let i = 0; i < 24; i++) await conexao(banco, `vazia${i}`, "");
  await conexao(banco, "nula", null);
  await conexao(banco, "cliente", "cliente-real");
  await banco.execute({
    sql: `INSERT INTO "MetaAtivoAutorizado" (id, workspaceId, clientId, tipo, externalId, nome, autorizadoEm)
          VALUES ('a1','w1','', 'page','p1','P',?)`,
    args: [AGORA],
  });

  await aplicar(banco, ALVO);
});

describe("a metade que conserta", () => {
  it("as 24 linhas da segunda grafia viram NULL", async () => {
    expect(await contar(banco, `"clientId" = ''`)).toBe(0);
    expect(await contar(banco, `"clientId" IS NULL`)).toBe(25); // 24 + a que já era
  });

  it("a normalização alcança MetaAtivoAutorizado, não só MetaConnection", async () => {
    const r = await banco.execute(`SELECT COUNT(*) AS n FROM "MetaAtivoAutorizado" WHERE "clientId" = ''`);
    expect(Number((r.rows[0] as unknown as { n: number }).n)).toBe(0);
  });

  it("a consulta que a tela faz volta a achar a conexão da agência", async () => {
    // Era exatamente isto que estava quebrado: `where clientId: null` não
    // enxergava as conexões gravadas com `""`, e a tela dizia "conecte
    // primeiro" para uma agência conectada há três dias.
    const r = await banco.execute(
      `SELECT COUNT(*) AS n FROM "MetaConnection"
        WHERE workspaceId='w1' AND platform='user' AND status='connected' AND "clientId" IS NULL`,
    );
    expect(Number((r.rows[0] as unknown as { n: number }).n)).toBeGreaterThan(0);
  });
});

describe("a metade que não estraga o caso limpo", () => {
  it("o cliente de verdade continua sendo dele — a migration não junta donos", async () => {
    expect(await contar(banco, `"clientId" = 'cliente-real'`)).toBe(1);
  });

  it("escrever NULL e escrever um clientId de verdade continua permitido", async () => {
    await expect(conexao(banco, "ok-null", null)).resolves.toBeUndefined();
    await expect(conexao(banco, "ok-cli", "outro-cliente")).resolves.toBeUndefined();
    await expect(
      banco.execute(`UPDATE "MetaConnection" SET "clientId" = NULL WHERE id = 'ok-cli'`),
    ).resolves.toBeTruthy();
  });
});

describe("a TRAVA: o banco recusa a segunda grafia", () => {
  it("INSERT com clientId = '' é abortado, e o erro diz o conserto", async () => {
    await expect(conexao(banco, "nova-vazia", "")).rejects.toThrow(/NULL, nunca/);
  });

  it("UPDATE para clientId = '' também é abortado", async () => {
    await expect(
      banco.execute(`UPDATE "MetaConnection" SET "clientId" = '' WHERE id = 'nula'`),
    ).rejects.toThrow(/NULL, nunca/);
  });

  it("vale para MetaAtivoAutorizado também — a trava não é de uma tabela só", async () => {
    await expect(
      banco.execute({
        sql: `INSERT INTO "MetaAtivoAutorizado" (id, workspaceId, clientId, tipo, externalId, nome, autorizadoEm)
              VALUES ('a2','w1','', 'page','p2','P',?)`,
        args: [AGORA],
      }),
    ).rejects.toThrow(/NULL, nunca/);
  });
});

describe("o reparo não pode ter deixado tabela para trás", () => {
  it("NENHUMA tabela do banco ficou com a segunda grafia depois da migration", async () => {
    // A pergunta é feita ao BANCO, não ao schema: o que importa é o estado real
    // que a migration encontra em produção. Se um modelo com `clientId`
    // opcional tiver ficado fora da lista, ele aparece aqui — e a lista da
    // migration é a única coisa que precisa mudar.
    const tabelas = await banco.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                                        AND name NOT LIKE '_prisma%'`,
    );

    const comClientId: string[] = [];
    for (const linha of tabelas.rows as unknown as Array<{ name: string }>) {
      const cols = await banco.execute(`PRAGMA table_info("${linha.name}")`);
      const tem = (cols.rows as unknown as Array<{ name: string; notnull: number }>).some(
        (c) => c.name === "clientId" && Number(c.notnull) === 0,
      );
      if (tem) comClientId.push(linha.name);
    }

    expect(comClientId.length).toBeGreaterThan(10); // sanidade: achou as tabelas

    const sobrando: string[] = [];
    for (const t of comClientId) {
      const r = await banco.execute(`SELECT COUNT(*) AS n FROM "${t}" WHERE "clientId" = ''`);
      if (Number((r.rows[0] as unknown as { n: number }).n) > 0) sobrando.push(t);
    }
    expect(sobrando).toEqual([]);

    // E a lista escrita na migration precisa cobrir todas elas — senão o teste
    // acima passa só porque a tabela está vazia neste banco de teste.
    const migration = readFileSync(path.join(DIR, ALVO, "migration.sql"), "utf8");
    const faltando = comClientId.filter((t) => !migration.includes(`UPDATE "${t}"`));
    expect(faltando).toEqual([]);
  });
});
