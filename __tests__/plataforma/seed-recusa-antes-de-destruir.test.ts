import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";

/**
 * O SEED RECUSA ANTES DE DESTRUIR.
 *
 * ── O incidente (medido ao vivo em 29/08/2026) ───────────────────────────────
 * `scripts/seed-db.mjs` exigia SEED_MASTER_PASSWORD e SEED_STAFF_PASSWORD, mas
 * a exigência acontecia DEPOIS de seis DELETEs e de um INSERT. Rodando sem as
 * variáveis, ele apagava 8 linhas (Deliverable d1..d3, MaterialRequest mr1,
 * Project p7, BrandBrain bb_c4, User u_client01, Client c4), inseria o
 * workspace, e só então parava com exit 1.
 *
 * Quem seguia a receita de boot do CLAUDE.md — que também não citava as duas
 * variáveis — terminava PIOR do que começou: sem seed E sem o que tinha.
 *
 * ── Por que este teste existe, e não um comentário ────────────────────────────
 * A trava aqui é ORDEM DE EXECUÇÃO, e ordem é exatamente o que uma refatoração
 * inocente reordena. "Puxa a leitura da senha para perto do uso" é uma frase
 * que soa boa em revisão de código e reintroduz o incidente inteiro.
 *
 * Por isso o teste RODA O SCRIPT DE VERDADE, como processo, contra um banco
 * temporário, e mede o disco antes e depois. Ler o fonte pegaria a linha que
 * some; só rodar pega a linha que MUDOU DE LUGAR.
 */

const RAIZ = join(__dirname, "..", "..");
const SEED = join(RAIZ, "scripts", "seed-db.mjs");

const SENHAS = {
  SEED_MASTER_PASSWORD: "dev-teste-master-local-only",
  SEED_STAFF_PASSWORD: "dev-teste-staff-local-only",
};

/** IDs que os DELETEs do seed varrem. São a testemunha do dano. */
const DEMO = {
  deliverables: ["d1", "d2", "d3"],
  materialRequest: "mr1",
  project: "p7",
  brandBrain: "bb_c4",
  user: "u_client01",
  client: "c4",
};

let dir: string;
let caminhoDb: string;
let db: Client;

/**
 * Schema MÍNIMO, só as colunas que o seed toca.
 *
 * Deliberado: subir o schema real exigiria `prisma db push` dentro do teste —
 * lento e com engine externo. O que está sob teste é a ORDEM das operações do
 * seed, não a fidelidade do schema. Se o seed passar a mexer numa tabela nova,
 * ele falha aqui com "no such table", que é o aviso certo na hora certa.
 */
const SCHEMA = [
  `CREATE TABLE AgencyWorkspace (id TEXT PRIMARY KEY, name TEXT, slug TEXT, createdAt TEXT)`,
  `CREATE TABLE Client (id TEXT PRIMARY KEY, workspaceId TEXT, name TEXT)`,
  `CREATE TABLE Project (id TEXT PRIMARY KEY, clientId TEXT, name TEXT)`,
  `CREATE TABLE Deliverable (id TEXT PRIMARY KEY, projectId TEXT, name TEXT)`,
  `CREATE TABLE MaterialRequest (id TEXT PRIMARY KEY, projectId TEXT)`,
  `CREATE TABLE BrandBrain (id TEXT PRIMARY KEY, clientId TEXT)`,
  `CREATE TABLE User (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, passwordHash TEXT, role TEXT, workspaceId TEXT, createdAt TEXT, updatedAt TEXT)`,
];

async function plantarDadosDemo(): Promise<void> {
  for (const d of DEMO.deliverables) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO Deliverable (id, projectId, name) VALUES (?, ?, 'Peça demo')`,
      args: [d, DEMO.project],
    });
  }
  await db.execute({
    sql: `INSERT OR REPLACE INTO MaterialRequest (id, projectId) VALUES (?, ?)`,
    args: [DEMO.materialRequest, DEMO.project],
  });
  await db.execute({
    sql: `INSERT OR REPLACE INTO Project (id, clientId, name) VALUES (?, ?, 'Projeto demo')`,
    args: [DEMO.project, DEMO.client],
  });
  await db.execute({
    sql: `INSERT OR REPLACE INTO BrandBrain (id, clientId) VALUES (?, ?)`,
    args: [DEMO.brandBrain, DEMO.client],
  });
  await db.execute({
    sql: `INSERT OR REPLACE INTO User (id, email, name, passwordHash, role, workspaceId) VALUES (?, 'cliente@demo.test', 'Cliente Demo', 'hash-antigo', 'client_user', 'ws')`,
    args: [DEMO.user],
  });
  await db.execute({
    sql: `INSERT OR REPLACE INTO Client (id, workspaceId, name) VALUES (?, 'ws', 'Cliente Demo')`,
    args: [DEMO.client],
  });
}

/** Quantas das 8 linhas demo ainda estão de pé. */
async function linhasDemoVivas(): Promise<number> {
  const r = await db.execute({
    sql: `SELECT
      (SELECT COUNT(*) FROM Deliverable WHERE id IN ('d1','d2','d3'))
    + (SELECT COUNT(*) FROM MaterialRequest WHERE id = ?)
    + (SELECT COUNT(*) FROM Project WHERE id = ?)
    + (SELECT COUNT(*) FROM BrandBrain WHERE id = ?)
    + (SELECT COUNT(*) FROM User WHERE id = ?)
    + (SELECT COUNT(*) FROM Client WHERE id = ?) AS n`,
    args: [DEMO.materialRequest, DEMO.project, DEMO.brandBrain, DEMO.user, DEMO.client],
  });
  return Number(r.rows[0]!.n);
}

/**
 * Ambiente do processo filho: herda o do teste e **arranca** as duas senhas.
 *
 * ⚠️ Herdar é obrigatório — o `ProcessEnv` deste projeto exige `NODE_ENV`, e um
 * literal com duas chaves não compila (`tsc --noEmit` barra, o vitest não).
 * Mas herdar *tudo* reintroduziria as senhas na máquina de quem as tem
 * exportadas, e o teste da recusa passaria a provar nada.
 *
 * Por isso o `delete` explícito: as senhas só existem no filho quando ESTE
 * arquivo as põe lá, nunca por herança.
 */
function ambienteLimpo(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const chave of Object.keys(SENHAS)) delete env[chave];
  delete env.DATABASE_URL; // idem: o banco é sempre o temporário, nunca o da máquina.
  return env;
}

function rodarSeed(env: Record<string, string>): { code: number; saida: string } {
  const r = spawnSync(process.execPath, [SEED], {
    // cwd no diretório temporário DE PROPÓSITO: o seed carrega o `.env` do cwd,
    // e aqui não há nenhum. Sem isso o teste passaria a depender do `.env` da
    // máquina de quem roda — e ficaria verde por acidente numa máquina que tem
    // as senhas exportadas.
    cwd: dir,
    encoding: "utf8",
    env: { ...ambienteLimpo(), DATABASE_URL: `file:${caminhoDb}`, ...env },
  });
  return { code: r.status ?? -1, saida: `${r.stdout}${r.stderr}` };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "seed-recusa-"));
  caminhoDb = join(dir, "teste.db");
  db = createClient({ url: `file:${caminhoDb}` });
  for (const ddl of SCHEMA) await db.execute(ddl);
});

afterAll(() => {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("seed: recusa antes de destruir", () => {
  it("sem as credenciais: recusa, e o banco fica byte a byte como estava", async () => {
    await plantarDadosDemo();

    const antes = await linhasDemoVivas();
    expect(antes).toBe(8);

    const bytesAntes = readFileSync(caminhoDb);
    const mtimeAntes = statSync(caminhoDb).mtimeMs;

    const { code, saida } = rodarSeed({});

    // 1. Recusou.
    expect(code).not.toBe(0);

    // 2. Disse QUAL variável falta — as duas de uma vez, não uma por rodada.
    expect(saida).toContain("SEED_MASTER_PASSWORD");
    expect(saida).toContain("SEED_STAFF_PASSWORD");

    // 3. E disse COMO resolver. Mensagem sem instrução é recusa pela metade.
    expect(saida).toMatch(/\.env/);

    // 4. ⛔ A TRAVA. O disco não mudou.
    const bytesDepois = readFileSync(caminhoDb);
    expect(bytesDepois.equals(bytesAntes)).toBe(true);
    expect(statSync(caminhoDb).mtimeMs).toBe(mtimeAntes);
    expect(await linhasDemoVivas()).toBe(8);
  });

  it("sem as credenciais e sem banco: não chega a criar o arquivo", () => {
    const inexistente = join(dir, "nao-devia-nascer.db");
    const r = spawnSync(process.execPath, [SEED], {
      cwd: dir,
      encoding: "utf8",
      // Mesmo ambiente limpo do `rodarSeed` — as senhas são arrancadas, não
      // apenas omitidas. Ver `ambienteLimpo`.
      env: { ...ambienteLimpo(), DATABASE_URL: `file:${inexistente}` },
    });

    expect(r.status).not.toBe(0);
    // `createClient` com URL `file:` CRIA o arquivo. Abrir a conexão no topo do
    // módulo fazia uma recusa deixar um banco vazio para trás.
    expect(() => statSync(inexistente)).toThrow();
  });

  it("com as credenciais: o seed completa e cria o master", async () => {
    await plantarDadosDemo();
    expect(await linhasDemoVivas()).toBe(8);

    const { code, saida } = rodarSeed(SENHAS);

    expect(code).toBe(0);
    expect(saida).toContain("master@dioli.studio");

    // Aí sim os dados demo somem — é o trabalho do seed, quando ele PODE fazê-lo.
    expect(await linhasDemoVivas()).toBe(0);

    const master = await db.execute(
      `SELECT role, passwordHash FROM User WHERE email = 'master@dioli.studio'`,
    );
    expect(master.rows.length).toBe(1);
    expect(master.rows[0]!.role).toBe("master");
    // Hash bcrypt, nunca a senha em texto puro.
    expect(String(master.rows[0]!.passwordHash)).toMatch(/^\$2[aby]\$/);
    expect(String(master.rows[0]!.passwordHash)).not.toContain(SENHAS.SEED_MASTER_PASSWORD);
  });

  it("nenhuma senha de teste vaza para o log do seed", async () => {
    await plantarDadosDemo();
    const { saida } = rodarSeed(SENHAS);
    expect(saida).not.toContain(SENHAS.SEED_MASTER_PASSWORD);
    expect(saida).not.toContain(SENHAS.SEED_STAFF_PASSWORD);
  });

  it("a conferência de credencial vem ANTES do primeiro DELETE no fonte", () => {
    const fonte = readFileSync(SEED, "utf8");
    const conferencia = fonte.indexOf("conferirCredenciais()");
    // `q(\`DELETE FROM` e não só "DELETE FROM": o segundo casa com a MENÇÃO em
    // comentário, que fica acima da chamada e faria o teste falhar sozinho.
    const primeiroDelete = fonte.indexOf("q(`DELETE FROM");

    expect(conferencia).toBeGreaterThan(-1);
    expect(primeiroDelete).toBeGreaterThan(-1);
    // Redundante com os testes de comportamento acima, de propósito: quando
    // alguém reordenar isto, esta linha nomeia a causa direto, sem o dev ter de
    // deduzi-la de um diff de contagem de linhas.
    expect(conferencia).toBeLessThan(primeiroDelete);
  });
});

describe("a receita de boot do CLAUDE.md cita as credenciais do seed", () => {
  it("a seção 'Como rodar e ver o app localmente' define as duas variáveis", () => {
    const manual = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
    const inicio = manual.indexOf("## Como rodar e ver o app localmente");
    expect(inicio).toBeGreaterThan(-1);

    const secao = manual.slice(inicio, inicio + 2500);

    // Receita que não roda custa a tarde de quem confiou nela. Em 29/08/2026
    // esta receita mandava rodar o seed sem citar nenhuma das duas senhas.
    expect(secao).toContain("SEED_MASTER_PASSWORD");
    expect(secao).toContain("SEED_STAFF_PASSWORD");

    // E o valor de exemplo tem de ser obviamente local e descartável.
    expect(secao).toMatch(/SEED_MASTER_PASSWORD=dev-[\w-]*local-only/);
    expect(secao).toMatch(/SEED_STAFF_PASSWORD=dev-[\w-]*local-only/);
  });
});
