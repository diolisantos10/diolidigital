// A TRAVA NOS PONTOS ONDE O DADO NASCE — 06/08/2026.
//
// O teste anterior (`meta-ativos-autorizados.test.ts`) mede a lista. Este mede
// se ela está PLUGADA nos dois lugares que o incidente atravessou:
//
//   1. `saveConnection` — o callback do OAuth gravava como conexão da Foocci
//      todas as Páginas/Instagram que o token do CEO alcançava, com o token de
//      Página junto (que publica);
//   2. `ads-leitura.ts` — `me/adaccounts` devolveu 14 contas e as 14 subiram.
//
// Trava que mora na rota não é trava: a rota seguinte não passa por ela. Estes
// testes provam que a recusa acontece na camada, com as DUAS metades — o
// terceiro é barrado, o autorizado passa sem atrito.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Dublês ────────────────────────────────────────────────────────────────

const ativoAutorizado = vi.hoisted(() => vi.fn());
const filtrarAutorizados = vi.hoisted(() => vi.fn());
const graphGet = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());

const FakeGraphError = vi.hoisted(() => class extends Error {
  detail?: { message?: string; type?: string; code?: number };
});

vi.mock("@/lib/integrations/meta/ativos-autorizados", async (original) => {
  const real = await original<typeof import("@/lib/integrations/meta/ativos-autorizados")>();
  return { ...real, ativoAutorizado, filtrarAutorizados };
});
// `connections.ts` NÃO é dublê aqui de propósito: é justamente a derivação do
// dono a partir da LINHA de conexão que precisa ser exercitada de verdade.
vi.mock("@/lib/db/client", () => ({
  prisma: { metaConnection: { upsert, findUnique, findFirst: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("@/lib/security/crypto", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
  keyHint: () => "hint",
}));

import { saveConnection, AtivoNaoAutorizadoError } from "@/lib/integrations/meta/connections";

vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet, GraphApiError: FakeGraphError }));

const W = "ws1";
const FOOCCI = "cli_foocci";

/** O que `me/adaccounts` devolveu de verdade em 06/08/2026, em miniatura: uma
 *  conta da Foocci e quatro que não têm nada a ver com ela. */
const CONTAS_DA_META = [
  { id: "act_1000", name: "Foocci", currency: "BRL", account_status: 1 },
  { id: "act_2001", name: "Santioh", currency: "BRL", account_status: 1 },
  { id: "act_2002", name: "Dilix", currency: "BRL", account_status: 1 },
  { id: "act_2003", name: "Queise", currency: "BRL", account_status: 1 },
  { id: "act_2004", name: "DileeBags", currency: "USD", account_status: 1 },
];

/** A linha de conexão de USUÁRIO da Foocci — o token que o CEO concedeu. */
function linhaDeConexao(clientId: string | null = FOOCCI) {
  return {
    id: "cx", workspaceId: W, clientId, platform: "user", name: "Acesso da conta Meta",
    externalId: "u", accessTokenEncrypted: "enc:tk", tokenHint: "hint",
    tokenExpiresAt: null, scopes: "[]", metaJson: "{}", status: "connected",
    connectedAt: new Date(), lastSyncedAt: null,
  };
}

function linhaGravada() {
  return {
    id: "conn1", platform: "instagram", name: "n", externalId: "x", clientId: FOOCCI,
    status: "connected", tokenHint: "hint", tokenExpiresAt: null, scopes: "[]",
    connectedAt: new Date(), lastSyncedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue(linhaGravada());
  findUnique.mockResolvedValue(linhaDeConexao());
});

// ─── 1. saveConnection: o callback não grava o que não foi autorizado ───────

describe("saveConnection — a Página de terceiro NÃO vira conexão do cliente", () => {
  const entrada = (over: Record<string, unknown> = {}) => ({
    workspaceId: W, clientId: FOOCCI, platform: "facebook" as const,
    name: "Santioh", externalId: "9002", accessToken: "token-de-pagina",
    ...over,
  });

  it("A. sem autorização, LANÇA e não escreve uma linha sequer", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await expect(saveConnection(entrada())).rejects.toBeInstanceOf(AtivoNaoAutorizadoError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("A. o token de Página não chega nem a ser cifrado — nada dele entra no banco", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await expect(saveConnection(entrada())).rejects.toThrow();
    const tudo = JSON.stringify(upsert.mock.calls);
    expect(tudo).not.toMatch(/token-de-pagina/);
  });

  it("B. com autorização, grava normalmente — sem pedido extra", async () => {
    ativoAutorizado.mockResolvedValue(true);
    const r = await saveConnection(entrada({ externalId: "9001", name: "FB Foocci" }));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(r.clientId).toBe(FOOCCI);
  });

  it("B. o token de USUÁRIO passa sempre — é a credencial que a pessoa concedeu, não um ativo", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await saveConnection(entrada({ platform: "user", externalId: `user:${W}:${FOOCCI}` }));
    expect(upsert).toHaveBeenCalledTimes(1);
    // E a lista nem foi consultada: "user" não é ativo escolhível.
    expect(ativoAutorizado).not.toHaveBeenCalled();
  });

  it("B. conta da PRÓPRIA agência (clientId nulo) segue pelo fluxo master", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await saveConnection(entrada({ clientId: null }));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("a conferência é DERIVADA do que está sendo gravado, com o clientId da própria entrada", async () => {
    ativoAutorizado.mockResolvedValue(true);
    await saveConnection(entrada({ platform: "instagram", externalId: "17841" }));
    expect(ativoAutorizado).toHaveBeenCalledWith(W, FOOCCI, "instagram", "17841");
  });
});

// ─── 1b. "SEM CLIENTE" TINHA DUAS GRAFIAS ───────────────────────────────────
//
// Achado na perícia contra o banco de PRODUÇÃO em 06/08/2026. O callback grava
// `null`; `/api/meta/token` gravava `""`. As 24 conexões de nível agência que
// estavam em produção tinham TODAS `""` — e toda guarda desta casa perguntava
// `=== null`, então o fluxo da agência caía no ramo do CLIENTE.
//
// Os dois estragos medidos: `scripts/meta-pericia-alcance.mts` marcou 25 de 25
// conexões para exclusão (inclusive as 2 legítimas da Foocci e as 4 da própria
// Dioli), e `saveConnection` passaria a LANÇAR em todo `/api/meta/token` — cujo
// laço de Páginas engole a exceção, gravando ZERO Páginas em silêncio.
describe("saveConnection — `\"\"` e `null` são o MESMO dono: a agência", () => {
  const entrada = (over: Record<string, unknown> = {}) => ({
    workspaceId: W, platform: "facebook" as const,
    name: "Dioli - Marketing Digital", externalId: "111685217945334",
    accessToken: "token-de-pagina", ...over,
  });

  it("B. clientId `\"\"` (o que /api/meta/token gravava) segue pelo fluxo master, sem lançar", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await expect(saveConnection(entrada({ clientId: "" }))).resolves.toBeDefined();
    expect(upsert).toHaveBeenCalledTimes(1);
    // Nem consultou a lista: não é ativo de cliente.
    expect(ativoAutorizado).not.toHaveBeenCalled();
  });

  it("B. clientId só com espaços também é a agência — grafia não muda o dono", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await expect(saveConnection(entrada({ clientId: "   " }))).resolves.toBeDefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("`\"\"` NUNCA volta ao banco: o dono é gravado como null", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await saveConnection(entrada({ clientId: "" }));
    expect(upsert.mock.calls[0][0].create.clientId).toBeNull();
  });

  it("A. a metade que não pode afrouxar: cliente DE VERDADE sem autorização continua LANÇANDO", async () => {
    ativoAutorizado.mockResolvedValue(false);
    await expect(saveConnection(entrada({ clientId: FOOCCI, name: "Santioh" })))
      .rejects.toBeInstanceOf(AtivoNaoAutorizadoError);
    expect(upsert).not.toHaveBeenCalled();
  });
});

// ─── 2. ads-leitura: as 14 contas não sobem ─────────────────────────────────

describe("lerContasDeAnuncio — o que o token ALCANÇA não é o que a agência LÊ", () => {
  it("A. lista vazia ⇒ NENHUMA conta sai, e o nome das outras não aparece na resposta", async () => {
    const { lerContasDeAnuncio } = await import("@/lib/integrations/meta/ads-leitura");
    graphGet.mockResolvedValue({ data: CONTAS_DA_META });
    filtrarAutorizados.mockResolvedValue({ autorizados: [], recusados: CONTAS_DA_META.map((c) => c.id), listaVazia: true });

    const r = await lerContasDeAnuncio(W, "cx");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_autorizacao");
    expect(r.dados).toBeUndefined();
    // A prova que importa: nenhum nome de terceiro atravessa a fronteira.
    const saida = JSON.stringify(r);
    for (const nome of ["Santioh", "Dilix", "Queise", "DileeBags"]) {
      expect(saida).not.toMatch(nome);
    }
    // E a frase diz o que fazer, não "nenhuma conta encontrada".
    expect(r.erro).toMatch(/autorizar quais contas/i);
  });

  it("A. alcança 5, autorizada 0 (mas lista existe) ⇒ recusa dizendo quantas ficaram de fora", async () => {
    const { lerContasDeAnuncio } = await import("@/lib/integrations/meta/ads-leitura");
    graphGet.mockResolvedValue({ data: CONTAS_DA_META });
    filtrarAutorizados.mockResolvedValue({ autorizados: [], recusados: CONTAS_DA_META.map((c) => c.id), listaVazia: false });

    const r = await lerContasDeAnuncio(W, "cx");
    expect(r.motivo).toBe("sem_autorizacao");
    expect(r.erro).toMatch(/5 conta\(s\)/);
    expect(JSON.stringify(r)).not.toMatch(/Santioh/);
  });

  it("B. autorizada 1 de 5 ⇒ sai exatamente 1, e é a certa", async () => {
    const { lerContasDeAnuncio, normalizarConta } = await import("@/lib/integrations/meta/ads-leitura");
    graphGet.mockResolvedValue({ data: CONTAS_DA_META });
    filtrarAutorizados.mockImplementation(async (_w, _c, _t, itens) => ({
      autorizados: (itens as Array<{ id: string }>).filter((c) => c.id === "act_1000"),
      recusados: ["act_2001", "act_2002", "act_2003", "act_2004"], listaVazia: false,
    }));

    const r = await lerContasDeAnuncio(W, "cx");
    expect(r.ok).toBe(true);
    expect(r.dados).toHaveLength(1);
    expect(r.dados![0].id).toBe("act_1000");
    expect(normalizarConta(CONTAS_DA_META[0]).nome).toBe("Foocci");
  });

  it("o dono da trava vem da CONEXÃO, nunca de um parâmetro do chamador", async () => {
    const { lerContasDeAnuncio } = await import("@/lib/integrations/meta/ads-leitura");
    findUnique.mockResolvedValue(linhaDeConexao("cli_outro"));
    graphGet.mockResolvedValue({ data: CONTAS_DA_META });
    filtrarAutorizados.mockResolvedValue({ autorizados: [], recusados: [], listaVazia: true });

    await lerContasDeAnuncio(W, "cx");
    // `lerContasDeAnuncio` não recebe clientId. O que foi consultado é o dono
    // da linha de conexão — que é o ponto inteiro da regra "derivada, nunca
    // comparada".
    expect(filtrarAutorizados).toHaveBeenCalledWith(W, "cli_outro", "ad_account", expect.anything(), expect.any(Function));
  });
});

// ─── 3. Conta específica: a trava roda ANTES da rede ────────────────────────

describe("lerCampanhasAtivas / lerDesempenhoDaConta — conta fora da lista nem é perguntada", () => {
  it("A. conta não autorizada ⇒ recusa SEM chamar a Meta (nem gasta cota, nem deixa rastro)", async () => {
    const { lerCampanhasAtivas, lerDesempenhoDaConta } = await import("@/lib/integrations/meta/ads-leitura");
    ativoAutorizado.mockResolvedValue(false);

    const c = await lerCampanhasAtivas(W, "cx", "act_2001");
    expect(c.motivo).toBe("sem_autorizacao");
    expect(c.erro).toMatch(/act_2001/);

    const d = await lerDesempenhoDaConta(W, "cx", "act_2001", { desde: "2026-07-07", ate: "2026-08-05" });
    expect(d.motivo).toBe("sem_autorizacao");

    // A prova mais importante do arquivo: ZERO chamadas à Meta. Barrar depois de
    // ler já teria gravado a linha de cota daquela conta (MetaAdCota) — que foi
    // exatamente o rastro que as 14 contas do CEO deixaram.
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("B. conta autorizada ⇒ a chamada acontece, com a operação e a conta declaradas", async () => {
    const { lerCampanhasAtivas } = await import("@/lib/integrations/meta/ads-leitura");
    ativoAutorizado.mockResolvedValue(true);
    graphGet.mockResolvedValue({ data: [] });

    const r = await lerCampanhasAtivas(W, "cx", "act_1000");
    expect(r.ok).toBe(true);
    expect(graphGet).toHaveBeenCalledTimes(1);
    expect(graphGet.mock.calls[0][3]).toEqual({ operacao: "ler_campanha", conta: "act_1000" });
  });
});
