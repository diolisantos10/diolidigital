// QUEM MEXE (E QUEM VÊ) AS CHAVES DE IA.
//
// `POST /api/ai-keys` e `DELETE` já exigiam master. `POST /api/ai-keys/test`
// exigia SÓ sessão — qualquer staff disparava chamada PAGA ao provedor e
// escrevia na configuração da integração. E `GET /api/ai-keys` devolvia o
// `lastTestMessage`, que guarda a resposta CRUA do provedor, para qualquer
// sessão.
//
// AS DUAS METADES: staff não testa e não vê o texto do provedor; master faz as
// duas coisas. E o `configured` continua visível para todo mundo, porque a tela
// de Operações depende dele para dizer "IA conectada" — fechar a rota inteira
// quebraria uma tela sem necessidade.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  dbIntegrationConfig: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
}));
const getSession = vi.hoisted(() => vi.fn());
const resolveProviderKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, getSession };
});
vi.mock("@/lib/ai/resolve-key", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, resolveProviderKey };
});

import { GET as listarChaves } from "@/app/api/ai-keys/route";
import { POST as testarChave } from "@/app/api/ai-keys/test/route";

const SESSAO = { userId: "u1", email: "a@b.c", name: "A", role: "master", workspaceId: "ws1" };

const LINHA = {
  integrationId: "int-openai",
  apiKeyEncrypted: "iv:tag:dados",
  apiKeyHint: "sk-…ab12",
  selectedModel: "gpt-5",
  lastTestStatus: "fail",
  lastTestMessage: "Incorrect API key provided: «credencial removida»",
  lastTestAt: new Date(),
};

function pedidoDeTeste(): NextRequest {
  // "sec-fetch-site: same-origin" — a FAIXA 1 do CSRF (navegacao-cross-site.ts)
  // bloqueia por padrão sem este sinal; aqui simulamos o navegador legítimo.
  return new NextRequest("http://localhost/api/ai-keys/test", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ provider: "openai" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.dbIntegrationConfig.findMany.mockResolvedValue([LINHA]);
  db.dbIntegrationConfig.updateMany.mockResolvedValue({ count: 1 });
  resolveProviderKey.mockResolvedValue(null);
});

describe("GET /api/ai-keys", () => {
  it("staff vê se está configurado, mas NÃO o texto que o provedor devolveu", async () => {
    getSession.mockResolvedValue({ ...SESSAO, role: "design_staff" });

    const dados = (await (await listarChaves()).json()) as {
      providers: { provider: string; configured: boolean; lastTestStatus: string; lastTestMessage: string | null }[];
    };
    const openai = dados.providers.find((p) => p.provider === "openai")!;

    expect(openai.configured).toBe(true);      // a tela de Operações precisa disto
    expect(openai.lastTestStatus).toBe("fail"); // o status é inofensivo
    expect(openai.lastTestMessage).toBeNull();  // o texto do provedor, não
  });

  it("master vê o texto do provedor", async () => {
    getSession.mockResolvedValue(SESSAO);

    const dados = (await (await listarChaves()).json()) as {
      providers: { provider: string; lastTestMessage: string | null }[];
    };
    expect(dados.providers.find((p) => p.provider === "openai")!.lastTestMessage).toContain("Incorrect API key");
  });

  it("sem sessão → 401", async () => {
    getSession.mockResolvedValue(null);
    expect((await listarChaves()).status).toBe(401);
  });
});

describe("POST /api/ai-keys/test", () => {
  it.each(["design_staff", "project_manager", "executivo_comercial"])(
    "%s → 403: não dispara chamada paga nem escreve na integração",
    async (papel) => {
      getSession.mockResolvedValue({ ...SESSAO, role: papel });

      const res = await testarChave(pedidoDeTeste());

      expect(res.status).toBe(403);
      expect(resolveProviderKey).not.toHaveBeenCalled();
      expect(db.dbIntegrationConfig.updateMany).not.toHaveBeenCalled();
    },
  );

  it("sem sessão → 401", async () => {
    getSession.mockResolvedValue(null);
    expect((await testarChave(pedidoDeTeste())).status).toBe(401);
  });

  it("master passa (e sem chave configurada a resposta é honesta, não um erro)", async () => {
    getSession.mockResolvedValue(SESSAO);

    const res = await testarChave(pedidoDeTeste());

    expect(res.status).toBe(200);
    expect(resolveProviderKey).toHaveBeenCalledWith("openai", "ws1");
    expect((await res.json()).message).toMatch(/Nenhuma chave configurada/);
  });

  it("corpo inválido não estoura a rota", async () => {
    getSession.mockResolvedValue(SESSAO);
    const res = await testarChave(
      new NextRequest("http://localhost/api/ai-keys/test", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: "isto não é json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
