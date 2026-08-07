// O POPUP DO DRIVE NÃO DIZ "CONECTADO" SEM TER GRAVADO — as duas metades.
//
// ── O INCIDENTE (07/08/2026, CEO na tela) ──────────────────────────────────
//
// As tabelas do Drive nunca existiram em produção (foram para o schema sem
// migration; ver `__tests__/plataforma/schema-sem-migration.test.ts`). O
// callback fazia:
//
//     await prisma.googleDriveConnection.upsert({...}).catch(() => null);
//
// e logo abaixo devolvia, INCONDICIONALMENTE, a página de sucesso "Drive
// conectado". O cliente autorizava no Google, o popup comemorava, e o cartão do
// portal — que lê o banco — dizia "Drive não conectado." no mesmo instante.
// Depois do F5 não sobrava nada.
//
// A tabela que faltava é conserto de migration. ESTE arquivo prova a outra
// metade: falha de gravação, qualquer que seja a causa, NÃO pode virar
// "conectado". Porta fechada.
//
// As duas metades:
//   ⛔ METADE 1 — o banco recusa a gravação → a página é de ERRO, e não anuncia
//      conexão nenhuma.
//   ✅ METADE 2 — o banco aceita → a página é de sucesso. Sem esta metade,
//      "fechar a porta" poderia ser "falhar sempre", que passa na metade 1 e
//      nunca conecta ninguém.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: { googleDriveConnection: { upsert: (...a: unknown[]) => upsert(...a) } },
}));
vi.mock("@/lib/security/crypto", () => ({ encryptSecret: (s: string) => `cifrado(${s})` }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  resolvePortalClient: vi.fn(async () => ({ workspaceId: "ws-1", clientId: "cli-foocci" })),
}));

const { GET } = await import("@/app/api/google/drive/callback/route");

const ESTADO = "estado-xyz";

/** O Google respondendo tudo certo: token, refresh e o escopo que pedimos. */
function googleFelizmente() {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({
        access_token: "at-123", refresh_token: "rt-456", expires_in: 3600,
        scope: "https://www.googleapis.com/auth/drive.file",
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ email: "joao.silva@gmail.com" }), { status: 200 });
  }) as typeof fetch;
}

function chamarCallback() {
  return GET(new NextRequest(
    `https://dioli-agency-os-1-production.up.railway.app/api/google/drive/callback?code=abc&state=${ESTADO}`,
    { headers: { cookie: `_drive_state=${ESTADO}; _drive_portal=token-do-portal` } },
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  googleFelizmente();
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
});
afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe("⛔ METADE 1 — gravação falhou, então NÃO houve conexão", () => {
  it("tabela inexistente (o caso real) não vira 'Drive conectado'", async () => {
    // Exatamente o que a produção fazia: a tabela não existe no volume.
    upsert.mockRejectedValue(new Error("The table `main.GoogleDriveConnection` does not exist"));

    const html = await (await chamarCallback()).text();

    // O CORAÇÃO DA PROVA: nem o título de sucesso, nem o postMessage de sucesso.
    expect(html).not.toContain("drive_auth_success");
    expect(html).not.toMatch(/Drive conectado/);
    // E o cliente é informado de que o problema é NOSSO, não da conta dele.
    expect(html).toContain("drive_auth_error");
    expect(html).toMatch(/não ficou salva/i);
    expect(html).toMatch(/problema nosso, não da sua conta/i);
  });

  it("qualquer erro de banco fecha a porta do mesmo jeito", async () => {
    upsert.mockRejectedValue(new Error("database is locked"));
    const html = await (await chamarCallback()).text();
    expect(html).not.toContain("drive_auth_success");
    expect(html).toContain("drive_auth_error");
  });

  it("o detalhe técnico NÃO vaza para a tela do cliente", async () => {
    upsert.mockRejectedValue(new Error("The table `main.GoogleDriveConnection` does not exist"));
    const html = await (await chamarCallback()).text();
    // Nome de tabela e formato de banco não são assunto do cliente.
    expect(html).not.toContain("GoogleDriveConnection");
    expect(html).not.toContain("main.");
  });
});

describe("✅ METADE 2 — gravou, então conectou de verdade", () => {
  it("com a gravação aceita, a página é de sucesso", async () => {
    upsert.mockResolvedValue({ id: "conn-1", status: "connected" });

    const html = await (await chamarCallback()).text();

    expect(html).toContain("drive_auth_success");
    expect(html).toMatch(/Drive conectado/);
  });

  it("grava sob a MESMA chave que o portal usa para ler (workspaceId + clientId)", async () => {
    upsert.mockResolvedValue({ id: "conn-1" });
    await chamarCallback();

    const chamada = upsert.mock.calls[0]![0] as {
      where: { workspaceId_clientId: { workspaceId: string; clientId: string } };
      create: { status: string; refreshTokenEncrypted: string | null; clientId: string };
    };
    // Divergência de chave entre gravar e ler é o clássico deste bug. O dono vem
    // do token do portal (derivado), nunca da query.
    expect(chamada.where.workspaceId_clientId).toEqual({ workspaceId: "ws-1", clientId: "cli-foocci" });
    expect(chamada.create.clientId).toBe("cli-foocci");
    expect(chamada.create.status).toBe("connected");
    expect(chamada.create.refreshTokenEncrypted).toBe("cifrado(rt-456)");
  });

  it("sem refresh token continua sendo recusa — a conexão morreria em 1h", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "at-123", expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.file",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ email: "a@b.com" }), { status: 200 });
    }) as typeof fetch;
    upsert.mockResolvedValue({ id: "conn-1", status: "expired" });

    const html = await (await chamarCallback()).text();
    expect(html).not.toContain("drive_auth_success");
    expect(html).toContain("drive_auth_error");
  });
});
