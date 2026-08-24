// A PORTA QUE NÃO PODE REABRIR — o SDR na camada multi-IA sem virar rota que
// gasta a chave de um inquilino escolhido por acaso.
//
// ─── O FURO, dito por inteiro ───────────────────────────────────────────────
//
// `resolveProviderKey(provider)` SEM `workspaceId` cai num `findFirst` global:
// "a primeira chave que existir no banco". `/api/sdr/chat` é PÚBLICA — sem
// sessão, sem token, sem workspace. Numa base com duas agências, qualquer
// visitante com um laço de requisições gasta a chave de uma delas, escolhida
// por ordem de inserção. `lib/ai/chave-publica.ts` existe para fechar isso.
//
// Em 24/08/2026 o SDR foi ligado na camada multi-IA. A porta comum da camada
// resolve chave por `resolveProviderKey` — ou seja, ligar o SDR ali pelo
// caminho óbvio REABRIRIA exatamente este buraco, e ninguém veria: a conversa
// funcionaria perfeitamente, só que paga por outro.
//
// Este arquivo é a trava. Ele reproduz o furo antigo e exige que esteja fechado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const resolveProviderKey = vi.hoisted(() => vi.fn());
const chaveDoAmbiente = vi.hoisted(() => vi.fn<() => { apiKey: string; source: "ui" | "env"; model: string | null } | null>(() => null));
const resolverWorkspacePublico = vi.hoisted(() => vi.fn());
const workspaceUnico = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/resolve-key", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, resolveProviderKey, chaveDoAmbiente };
});
vi.mock("@/lib/agency/persistence/client-request-service", () => ({ resolverWorkspacePublico }));
vi.mock("@/lib/auth/posse-de-workspace", () => ({ workspaceUnico }));

import { chaveDeRotaPublica, primeiraChaveDeRotaPublica } from "@/lib/ai/chave-publica";
import { ALL_PROVIDERS } from "@/lib/ai/resolve-key";

const chave = (k: string) => ({ apiKey: k, source: "ui" as const, model: null });

beforeEach(() => {
  vi.clearAllMocks();
  chaveDoAmbiente.mockReturnValue(null);
});

describe("a rota pública nunca resolve chave pelo findFirst global", () => {
  it("COM DOIS WORKSPACES na base, nenhum provedor é liberado — nem o primeiro da ordem", async () => {
    // Este é o furo original, reproduzido: base ambígua, rota sem sessão.
    resolverWorkspacePublico.mockResolvedValue(undefined);
    workspaceUnico.mockResolvedValue({ id: null, ambiguo: true });

    const escolha = await primeiraChaveDeRotaPublica(ALL_PROVIDERS);

    expect(escolha, "a rota pública escolheu um provedor numa base ambígua — é a chave do vizinho").toBeNull();
    // E a prova mecânica: o cofre não foi consultado UMA vez sem workspace.
    for (const [p, ws] of resolveProviderKey.mock.calls) {
      expect(ws, `resolveProviderKey("${p}") foi chamado SEM workspace — é o findFirst global`).toBeTruthy();
    }
  });

  it("COM UM workspace, a chave é a DAQUELE workspace — sempre com o id no argumento", async () => {
    resolverWorkspacePublico.mockResolvedValue("ws-unico");
    resolveProviderKey.mockImplementation(async (p: string, ws?: string) =>
      p === "claude" && ws === "ws-unico" ? chave("k-do-ws") : null,
    );

    const escolha = await primeiraChaveDeRotaPublica(ALL_PROVIDERS);

    expect(escolha?.provider).toBe("claude");
    expect(escolha?.chave.apiKey).toBe("k-do-ws");
    expect(resolveProviderKey).toHaveBeenCalledWith("claude", "ws-unico");
  });

  it("SEM workspace nenhum na base, só a env do deploy — nunca o cofre", async () => {
    resolverWorkspacePublico.mockResolvedValue(undefined);
    workspaceUnico.mockResolvedValue({ id: null, ambiguo: false });
    chaveDoAmbiente.mockReturnValue(chave("k-do-deploy"));

    const escolha = await primeiraChaveDeRotaPublica(ALL_PROVIDERS);

    expect(escolha?.chave.apiKey).toBe("k-do-deploy");
    expect(resolveProviderKey, "o cofre foi consultado numa base sem workspace").not.toHaveBeenCalled();
  });
});

describe("multi-IA de verdade: a rota pública anda na ordem, não num provedor fixo", () => {
  it("cai para o PRÓXIMO provedor quando o primeiro não tem chave", async () => {
    resolverWorkspacePublico.mockResolvedValue("ws-unico");
    resolveProviderKey.mockImplementation(async (p: string, ws?: string) =>
      p === "openai" && ws === "ws-unico" ? chave("k-openai") : null,
    );

    const escolha = await primeiraChaveDeRotaPublica(["claude", "openai", "gemini"]);

    // O ponto do dia: nada aqui é "claude" no código. Quem tiver chave, atende.
    expect(escolha?.provider).toBe("openai");
  });

  it("respeita a ORDEM recebida — quem vem antes e tem chave, atende", async () => {
    resolverWorkspacePublico.mockResolvedValue("ws-unico");
    resolveProviderKey.mockImplementation(async () => chave("qualquer"));

    expect((await primeiraChaveDeRotaPublica(["gemini", "claude"]))?.provider).toBe("gemini");
    expect((await primeiraChaveDeRotaPublica(["claude", "gemini"]))?.provider).toBe("claude");
  });

  it("nenhum provedor com chave = não gasta nada, e diz isso", async () => {
    resolverWorkspacePublico.mockResolvedValue("ws-unico");
    resolveProviderKey.mockResolvedValue(null);
    expect(await primeiraChaveDeRotaPublica(ALL_PROVIDERS)).toBeNull();
  });

  it("a função de um provedor só continua valendo — a antiga não foi trocada por baixo", async () => {
    resolverWorkspacePublico.mockResolvedValue("ws-unico");
    resolveProviderKey.mockImplementation(async (p: string) => (p === "gemini" ? chave("k-g") : null));
    expect((await chaveDeRotaPublica("gemini"))?.apiKey).toBe("k-g");
    expect(await chaveDeRotaPublica("claude")).toBeNull();
  });
});
