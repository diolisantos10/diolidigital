// A PORTA DOS FUNDOS: O FLUXO DA AGÊNCIA — 06/08/2026 (noite).
//
// A perícia contra o banco de PRODUÇÃO provou que as 19 conexões de terceiros
// (Sushi Cazza, Dilee, Kero Shop, Acesso Beleza, santioh_, dilix.br, queise,
// Santioh Europe, Spa da Mente, City Jobs SP) entraram em 03/08 às 14:05 pelo
// fluxo de TOKEN COLADO — `clientId` nulo, o ramo que `saveConnection` deixava
// passar sem consultar lista nenhuma. Fechar o lado do cliente e deixar este
// aberto é fechar a porta da frente com a dos fundos escancarada: quem colar um
// token hoje regrava as 19.
//
// Estes testes medem as DUAS metades, do jeito que a casa exige:
//   A. o não autorizado é BARRADO — e nada dele encosta no banco;
//   B. o autorizado passa sem atrito — a agência continua trabalhando.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Dublês ────────────────────────────────────────────────────────────────

const findMany = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const connUpsert = vi.hoisted(() => vi.fn());
const connFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  prisma: {
    metaAtivoAutorizado: {
      findMany: (...a: unknown[]) => findMany(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      delete: vi.fn(),
    },
    metaConnection: {
      upsert: (...a: unknown[]) => connUpsert(...a),
      findUnique: (...a: unknown[]) => connFindUnique(...a),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));
vi.mock("@/lib/security/crypto", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
  keyHint: () => "hint",
}));

import { saveConnection, AtivoNaoAutorizadoError } from "@/lib/integrations/meta/connections";
import { gravarSomenteAutorizados } from "@/lib/integrations/meta/escolha-de-ativos";

const W = "ws1";

/** O que `me/accounts` devolveu de verdade com o token colado em 03/08, em
 *  miniatura: uma Página da própria agência e três de terceiros. */
const PAGINAS = [
  { id: "111685217945334", name: "Dioli - Marketing Digital", accessToken: "tk-dioli",
    instagram: { id: "17841400000001", username: "dioli.digital" } },
  { id: "900001", name: "Sushi Cazza", accessToken: "tk-sushi" },
  { id: "900002", name: "Kero Shop", accessToken: "tk-kero",
    instagram: { id: "17841400000002", username: "keroshop" } },
  { id: "900003", name: "Spa da Mente", accessToken: "tk-spa" },
];

/** A lista de autorizados, respondida pelo dublê do banco. `clientId` é o dono
 *  já canônico — `null` é a agência. */
function listaContendo(pares: Array<{ tipo: string; externalId: string }>) {
  findMany.mockImplementation(async (args: { where: { tipo: string; clientId: string | null } }) =>
    pares
      .filter((p) => p.tipo === args.where.tipo)
      .map((p) => ({ externalId: p.externalId })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  connUpsert.mockResolvedValue({
    id: "conn1", platform: "facebook", name: "n", externalId: "x", clientId: null,
    status: "connected", tokenHint: "hint", tokenExpiresAt: null, scopes: "[]",
    connectedAt: new Date(), lastSyncedAt: null,
  });
  upsert.mockResolvedValue({});
  listaContendo([]);
});

// ─── A. A porta dos fundos está fechada ────────────────────────────────────

describe("saveConnection — a conta da AGÊNCIA não é mais exceção", () => {
  const entrada = (over: Record<string, unknown> = {}) => ({
    workspaceId: W, clientId: null, platform: "facebook" as const,
    name: "Sushi Cazza", externalId: "900001", accessToken: "tk-sushi", ...over,
  });

  it("A. sem marcação, LANÇA — e nenhuma linha é escrita", async () => {
    await expect(saveConnection(entrada())).rejects.toBeInstanceOf(AtivoNaoAutorizadoError);
    expect(connUpsert).not.toHaveBeenCalled();
  });

  it("A. o token de Página não chega nem a ser cifrado", async () => {
    await expect(saveConnection(entrada())).rejects.toThrow();
    expect(JSON.stringify(connUpsert.mock.calls)).not.toMatch(/tk-sushi/);
  });

  it("A. `\"\"` é a mesma agência: a grafia antiga também é barrada", async () => {
    // As 24 conexões de nível agência em produção nasceram com `""`. Se a trava
    // só entendesse `null`, o fluxo de token colado continuaria passando.
    await expect(saveConnection(entrada({ clientId: "" }))).rejects.toBeInstanceOf(AtivoNaoAutorizadoError);
    await expect(saveConnection(entrada({ clientId: "   " }))).rejects.toBeInstanceOf(AtivoNaoAutorizadoError);
    expect(connUpsert).not.toHaveBeenCalled();
  });

  it("B. marcada pelo operador, grava normalmente — sem atrito", async () => {
    listaContendo([{ tipo: "page", externalId: "111685217945334" }]);
    await saveConnection(entrada({ externalId: "111685217945334", name: "Dioli - Marketing Digital", accessToken: "tk-dioli" }));
    expect(connUpsert).toHaveBeenCalledTimes(1);
    expect(connUpsert.mock.calls[0][0].create.clientId).toBeNull();
  });

  it("B. o token de USUÁRIO passa sempre — é a credencial, não um ativo", async () => {
    await saveConnection(entrada({ platform: "user", externalId: `user:${W}` }));
    expect(connUpsert).toHaveBeenCalledTimes(1);
    // E nem consultou a lista: "user" não é ativo escolhível.
    expect(findMany).not.toHaveBeenCalled();
  });
});

// ─── B. O laço que produziu o dano, agora com a trava dentro ───────────────

describe("gravarSomenteAutorizados — o laço do token colado", () => {
  it("A. lista VAZIA (a primeira colagem) ⇒ ZERO gravado, e as 4 Páginas viram 'falta escolher'", async () => {
    const r = await gravarSomenteAutorizados({ workspaceId: W, clientId: null, paginas: PAGINAS });

    expect(r.gravadas).toBe(0);
    expect(connUpsert).not.toHaveBeenCalled();
    // 4 Páginas + 2 Instagram = 6 ativos alcançados, nenhum autorizado.
    expect(r.faltamEscolher).toBe(6);
    // A prova que importa: nenhum nome de terceiro atravessa como conexão.
    const escrito = JSON.stringify(connUpsert.mock.calls);
    for (const nome of ["Sushi Cazza", "Kero Shop", "Spa da Mente", "keroshop"]) {
      expect(escrito).not.toMatch(nome);
    }
  });

  it("A. marcar UMA não abre as outras — o terceiro continua fora", async () => {
    listaContendo([{ tipo: "page", externalId: "111685217945334" }]);
    const r = await gravarSomenteAutorizados({ workspaceId: W, clientId: null, paginas: PAGINAS });

    expect(r.gravadas).toBe(1);
    expect(r.faltamEscolher).toBe(5);
    expect(r.nomes).toEqual(["FB: Dioli - Marketing Digital"]);
    const escrito = JSON.stringify(connUpsert.mock.calls);
    expect(escrito).toMatch(/Dioli - Marketing Digital/);
    expect(escrito).not.toMatch(/Sushi Cazza|Kero Shop|Spa da Mente/);
    // O Instagram da PRÓPRIA Página só entra se ele também estiver marcado:
    // marcar a Página não é marcar o perfil que publica.
    expect(escrito).not.toMatch(/17841400000001/);
  });

  it("B. Página + Instagram marcados ⇒ os dois gravados, e o IG leva o token da Página", async () => {
    listaContendo([
      { tipo: "page", externalId: "111685217945334" },
      { tipo: "instagram", externalId: "17841400000001" },
    ]);
    const r = await gravarSomenteAutorizados({ workspaceId: W, clientId: null, paginas: PAGINAS });

    expect(r.gravadas).toBe(2);
    expect(r.faltamEscolher).toBe(4);
    expect(r.nomes).toEqual(["FB: Dioli - Marketing Digital", "IG: dioli.digital"]);
    const ig = connUpsert.mock.calls.find((c) => c[0].create.platform === "instagram");
    expect(ig![0].create.accessTokenEncrypted).toBe("enc:tk-dioli");
  });

  it("A. a MESMA função protege o cliente: dono preenchido, lista vazia ⇒ zero", async () => {
    // Um mecanismo só para os dois donos. Se algum dia divergirem, este teste cai.
    const r = await gravarSomenteAutorizados({ workspaceId: W, clientId: "cli_foocci", paginas: PAGINAS });
    expect(r.gravadas).toBe(0);
    expect(connUpsert).not.toHaveBeenCalled();
  });

  it("o dono consultado é o CANÔNICO: `\"\"` pergunta pela agência, não pelo cliente", async () => {
    await gravarSomenteAutorizados({ workspaceId: W, clientId: "", paginas: PAGINAS });
    const donos = findMany.mock.calls.map((c) => c[0].where.clientId);
    expect(donos.every((d: unknown) => d === null)).toBe(true);
  });
});

// ─── C. Fail-closed de verdade: banco indisponível não libera ──────────────

describe("indisponibilidade não vira permissão", () => {
  it("A. se a consulta da lista explode, nada é gravado", async () => {
    findMany.mockRejectedValue(new Error("db fora do ar"));
    const r = await gravarSomenteAutorizados({ workspaceId: W, clientId: null, paginas: PAGINAS });
    expect(r.gravadas).toBe(0);
    expect(r.faltamEscolher).toBe(6);
    expect(connUpsert).not.toHaveBeenCalled();
  });
});
