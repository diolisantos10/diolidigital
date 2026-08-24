// O CENSO DO COFRE — as duas metades.
//
// O que este arquivo tranca é o instrumento que não existia: até 15/08/2026
// ninguém conseguia responder "quantos segredos ainda dependem da chave fraca",
// nem com acesso total à produção, porque `estadoDaChaveDeCredenciais()` e
// `cifradoComChaveLegada()` tinham ZERO chamadores.
//
// AS DUAS METADES, em cada caso:
//   ⛔ acha o problema plantado (segredo cifrado com a chave antiga · segredo
//      que nenhuma chave abre);
//   ✅ não inventa problema no caso limpo (tudo já na chave nova → zero).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  dbIntegrationConfig: { findMany: vi.fn() },
  metaConnection: { findMany: vi.fn() },
  googleConnection: { findMany: vi.fn() },
  googleDriveConnection: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { censoDoCofre } from "@/lib/security/censo-do-cofre";
import { encryptSecret } from "@/lib/security/crypto";

const CHAVE_NOVA = "uma-chave-forte-gerada-com-openssl-rand";
const ambienteOriginal = { ...process.env };

/** Cifra um segredo COM A CHAVE LEGADA — o mundo de antes, guardado no banco.
 *  `file:/data/dioli.db` é literalmente o que o `start.sh` monta em produção. */
function cifradoComALegada(texto: string): string {
  delete process.env.CREDENTIALS_SECRET;
  process.env.DATABASE_URL = "file:/data/dioli.db";
  const c = encryptSecret(texto);
  process.env.CREDENTIALS_SECRET = CHAVE_NOVA;
  return c;
}

/** Cifra com a chave nova — o que nasce depois de a variável existir. */
function cifradoComANova(texto: string): string {
  process.env.CREDENTIALS_SECRET = CHAVE_NOVA;
  process.env.DATABASE_URL = "file:/data/dioli.db";
  return encryptSecret(texto);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "file:/data/dioli.db";
  process.env.CREDENTIALS_SECRET = CHAVE_NOVA;
  db.dbIntegrationConfig.findMany.mockResolvedValue([]);
  db.metaConnection.findMany.mockResolvedValue([]);
  db.googleConnection.findMany.mockResolvedValue([]);
  db.googleDriveConnection.findMany.mockResolvedValue([]);
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
});

describe("o censo acha o segredo preso na chave fraca", () => {
  it("⛔ conta o segredo cifrado ANTES da variável, e diz de que tipo é", async () => {
    const antigo = cifradoComALegada("sk-ant-chave-antiga");
    db.dbIntegrationConfig.findMany.mockResolvedValue([
      { integrationId: "int-claude", apiKeyEncrypted: antigo },
    ]);

    const censo = await censoDoCofre();

    expect(censo.aplicavel).toBe(true);
    expect(censo.totalDeSegredos).toBe(1);
    expect(censo.totalPresosNaChaveLegada).toBe(1);
    expect(censo.totalIlegiveis).toBe(0);
    const balde = censo.baldes.find((b) => b.tipo === "chave_de_ia")!;
    expect(balde.total).toBe(1);
    expect(balde.presosNaChaveLegada).toBe(1);
  });

  it("⛔ separa os tipos: App Secret da Meta, token de cliente e token do Drive", async () => {
    db.dbIntegrationConfig.findMany.mockResolvedValue([
      { integrationId: "int-meta", apiKeyEncrypted: cifradoComALegada("app-secret") },
      { integrationId: "radar-gmail-imap", apiKeyEncrypted: cifradoComALegada("senha-de-app") },
    ]);
    db.metaConnection.findMany.mockResolvedValue([
      { accessTokenEncrypted: cifradoComALegada("token-do-cliente") },
    ]);
    db.googleDriveConnection.findMany.mockResolvedValue([
      { accessTokenEncrypted: cifradoComALegada("acc"), refreshTokenEncrypted: cifradoComALegada("ref") },
    ]);

    const censo = await censoDoCofre();

    const porTipo = Object.fromEntries(censo.baldes.map((b) => [b.tipo, b.presosNaChaveLegada]));
    expect(porTipo.app_secret_meta).toBe(1);
    expect(porTipo.senha_de_email).toBe(1);
    expect(porTipo.token_de_cliente_meta).toBe(1);
    expect(porTipo.token_drive).toBe(2); // access + refresh são dois segredos
    expect(censo.totalPresosNaChaveLegada).toBe(5);
  });

  it("⛔ o segredo que NENHUMA chave abre entra como ilegível, não como migrado", async () => {
    // Este é o caso que uma implementação ingênua conta como "já está na chave
    // nova": `cifradoComChaveLegada` devolve false tanto para "abre com a nova"
    // quanto para "não abre com nenhuma". Contar os dois juntos transformaria um
    // segredo PERDIDO na leitura mais tranquilizadora possível.
    const lixo = "aaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:ccccccccccc";
    db.metaConnection.findMany.mockResolvedValue([{ accessTokenEncrypted: lixo }]);

    const censo = await censoDoCofre();

    expect(censo.totalIlegiveis).toBe(1);
    expect(censo.totalPresosNaChaveLegada).toBe(0);
    expect(censo.proximoPasso).toMatch(/INCIDENTE/);
    // A urgência vem PRIMEIRO — má notícia não vai na entrelinha nem no rodapé.
    expect(censo.proximoPasso.indexOf("INCIDENTE"))
      .toBeLessThan(censo.proximoPasso.indexOf("Nenhum segredo depende"));
  });
});

describe("o censo NÃO inventa problema no caso limpo", () => {
  it("✅ tudo cifrado com a chave nova → zero presos e zero ilegíveis", async () => {
    db.dbIntegrationConfig.findMany.mockResolvedValue([
      { integrationId: "int-claude", apiKeyEncrypted: cifradoComANova("sk-ant-nova") },
      { integrationId: "int-meta", apiKeyEncrypted: cifradoComANova("app-secret") },
    ]);
    db.metaConnection.findMany.mockResolvedValue([
      { accessTokenEncrypted: cifradoComANova("token") },
    ]);

    const censo = await censoDoCofre();

    expect(censo.totalDeSegredos).toBe(3);
    expect(censo.totalPresosNaChaveLegada).toBe(0);
    expect(censo.totalIlegiveis).toBe(0);
    expect(censo.proximoPasso).toMatch(/Nenhum segredo depende mais da chave fraca/);
  });

  it("✅ coluna NULA não é segredo — é ausência, e não infla o total", async () => {
    db.dbIntegrationConfig.findMany.mockResolvedValue([
      { integrationId: "int-claude", apiKeyEncrypted: null },
    ]);
    db.googleConnection.findMany.mockResolvedValue([
      { accessTokenEncrypted: cifradoComANova("acc"), refreshTokenEncrypted: null },
    ]);

    const censo = await censoDoCofre();
    expect(censo.totalDeSegredos).toBe(1);
  });

  it("✅ todo tipo aparece com zero em vez de sumir da lista", async () => {
    // Balde ausente é lido como "não existe esse tipo de segredo nesta casa",
    // que não é a mesma afirmação que "existem zero".
    const censo = await censoDoCofre();
    expect(censo.baldes.map((b) => b.tipo).sort()).toEqual(
      ["app_secret_meta", "chave_de_ia", "outra_integracao", "senha_de_email",
       "token_de_cliente_meta", "token_drive", "token_google"],
    );
    expect(censo.totalDeSegredos).toBe(0);
  });
});

describe("as recusas do censo", () => {
  it("SEM CREDENTIALS_SECRET o censo se declara INAPLICÁVEL — não responde 'zero presos'", async () => {
    delete process.env.CREDENTIALS_SECRET;
    db.dbIntegrationConfig.findMany.mockResolvedValue([
      { integrationId: "int-claude", apiKeyEncrypted: cifradoComALegada("x") },
    ]);
    process.env.CREDENTIALS_SECRET = undefined as unknown as string;
    delete process.env.CREDENTIALS_SECRET;

    const censo = await censoDoCofre();

    // Neste mundo TUDO está na chave fraca. Responder "0 presos" seria a pior
    // mentira possível: a que tranquiliza.
    expect(censo.aplicavel).toBe(false);
    expect(censo.chave.forte).toBe(false);
    expect(censo.proximoPasso).toMatch(/TODOS os segredos estão na chave fraca/);
  });

  it("banco fora do ar volta CEGO com motivo — nunca zero", async () => {
    db.dbIntegrationConfig.findMany.mockRejectedValue(new Error("SQLITE_BUSY"));

    const censo = await censoDoCofre();

    expect(censo.cego).toMatch(/SQLITE_BUSY/);
    expect(censo.proximoPasso).toMatch(/NÃO é 'zero presos'/);
  });
});

describe("o censo é somente leitura — trava, não aviso", () => {
  const ARQUIVO = join(process.cwd(), "lib", "security", "censo-do-cofre.ts");
  const ROTA = join(process.cwd(), "app", "api", "admin", "censo-do-cofre", "route.ts");

  it("não tem nenhum verbo de escrita do Prisma", () => {
    const texto = readFileSync(ARQUIVO, "utf8");
    expect(texto).not.toMatch(
      /prisma\.\w+\.(create|createMany|update|updateMany|delete|deleteMany|upsert|executeRaw)/,
    );
  });

  it("a rota só tem GET — re-cifragem é decisão do CEO e não existe", () => {
    const texto = readFileSync(ROTA, "utf8");
    expect(texto).toMatch(/export async function GET/);
    expect(texto).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });

  it("a rota fecha a porta quando CRON_SECRET não existe, e confere em tempo constante", () => {
    const texto = readFileSync(ROTA, "utf8");
    expect(texto).toMatch(/if \(!cronSecret\)/);
    expect(texto).toMatch(/status: 503/);
    expect(texto).toMatch(/segredoConfere\(/);
    // Comparação com `!==` num segredo de cabeçalho vaza byte a byte.
    expect(texto).not.toMatch(/token !== cronSecret/);
  });

  it("nem o censo nem a rota devolvem valor de segredo, cifrado ou em dica", () => {
    for (const caminho of [ARQUIVO, ROTA]) {
      const texto = readFileSync(caminho, "utf8");
      // `keyHint` mostraria pedaço do segredo numa tela que vaza por screenshot.
      expect(texto).not.toMatch(/keyHint/);
      // Nenhum campo de saída pode carregar o texto cifrado.
      expect(texto).not.toMatch(/apiKeyEncrypted:\s*(linha|row)\./);
    }
  });
});
