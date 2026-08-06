// A TRAVA DE ALCANCE DA META — as duas metades.
//
// ─── O INCIDENTE (06/08/2026) ───────────────────────────────────────────────
// O CEO clicou "Conectar Facebook/Instagram" no portal do cliente Foocci. A
// Meta devolveu um token do USUÁRIO dele. Com esse token a agência leu 14
// contas de anúncio (Santioh, Dilix, Queise, DileeBags, pessoais) e gravou como
// conexões da Foocci todas as Páginas/Instagram que o token alcançava.
//
// ─── AS DUAS METADES QUE TODO TESTE DE TRAVA PRECISA TER ────────────────────
//   A. o problema plantado é BARRADO — conta/página de terceiro é recusada, e
//      lista vazia recusa TUDO (fail-closed);
//   B. o caso limpo PASSA SEM ATRITO — o que o cliente autorizou é lido e
//      gravado normalmente, sem pedido extra e sem aviso.
//
// Um teste que só prova (A) transforma a trava numa parede: ninguém trabalha.
// Um que só prova (B) não prova nada.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Banco de mentira: uma lista de autorizações em memória ─────────────────

interface LinhaAut { id: string; workspaceId: string; clientId: string | null; tipo: string; externalId: string; nome: string; autorizadoPor: string; autorizadoEm: Date }

const banco = vi.hoisted(() => ({ autorizacoes: [] as LinhaAut[], conexoesApagadas: [] as unknown[] }));

const prismaFake = vi.hoisted(() => ({
  metaAtivoAutorizado: {
    findMany: vi.fn(async ({ where }: { where: { workspaceId: string; clientId: string | null; tipo?: string } }) =>
      banco.autorizacoes.filter(
        (a) => a.workspaceId === where.workspaceId
          && a.clientId === (where.clientId ?? null)
          && (where.tipo === undefined || a.tipo === where.tipo),
      ),
    ),
    upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: LinhaAut }) => {
      const i = banco.autorizacoes.findIndex((a) => a.id === where.id);
      const linha = { ...create, autorizadoEm: new Date() };
      if (i >= 0) banco.autorizacoes[i] = linha; else banco.autorizacoes.push(linha);
      return linha;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const i = banco.autorizacoes.findIndex((a) => a.id === where.id);
      if (i < 0) throw new Error("not found");
      return banco.autorizacoes.splice(i, 1)[0];
    }),
  },
  metaConnection: {
    deleteMany: vi.fn(async (arg: unknown) => { banco.conexoesApagadas.push(arg); return { count: 1 }; }),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaFake }));

import {
  idsAutorizados, ativoAutorizado, filtrarAutorizados, autorizarAtivos,
  revogarAtivo, chaveDoAtivo, normalizarId, FRASE_SEM_AUTORIZACAO,
} from "@/lib/integrations/meta/ativos-autorizados";

const W = "ws1";
const FOOCCI = "cli_foocci";

/** As contas reais do incidente: uma é da Foocci, as outras não são dela. */
const CONTA_DA_FOOCCI = "act_1000";
const CONTAS_DE_TERCEIROS = ["act_2001", "act_2002", "act_2003", "act_2004"]; // Santioh, Dilix, Queise, DileeBags

beforeEach(() => {
  banco.autorizacoes = [];
  banco.conexoesApagadas = [];
  vi.clearAllMocks();
});

async function autorizarAContaDaFoocci() {
  await autorizarAtivos(W, FOOCCI, [{ tipo: "ad_account", externalId: CONTA_DA_FOOCCI, nome: "Foocci Ads" }], `portal:${FOOCCI}`);
}

// ─── METADE A — o problema plantado é barrado ───────────────────────────────

describe("A. FAIL-CLOSED — ausência de lista nunca vira permissão", () => {
  it("sem NENHUMA linha, nada é autorizado (nem a conta que seria a certa)", async () => {
    expect(await ativoAutorizado(W, FOOCCI, "ad_account", CONTA_DA_FOOCCI)).toBe(false);
    for (const c of CONTAS_DE_TERCEIROS) {
      expect(await ativoAutorizado(W, FOOCCI, "ad_account", c)).toBe(false);
    }
  });

  it("lista vazia sai marcada como `listaVazia` — a tela pede autorização, não diz 'sem dados'", async () => {
    const todas = [CONTA_DA_FOOCCI, ...CONTAS_DE_TERCEIROS].map((id) => ({ id }));
    const r = await filtrarAutorizados(W, FOOCCI, "ad_account", todas, (c) => c.id);
    expect(r.autorizados).toHaveLength(0);
    expect(r.listaVazia).toBe(true);
    expect(r.recusados).toHaveLength(5);
    expect(FRASE_SEM_AUTORIZACAO).toMatch(/autorizar quais contas/i);
  });

  it("o banco caindo FECHA a porta, não abre", async () => {
    prismaFake.metaAtivoAutorizado.findMany.mockRejectedValueOnce(new Error("banco fora do ar"));
    expect((await idsAutorizados(W, FOOCCI, "ad_account")).size).toBe(0);
  });

  it("as 4 contas de terceiros do incidente continuam barradas depois de a Foocci ser autorizada", async () => {
    await autorizarAContaDaFoocci();
    for (const c of CONTAS_DE_TERCEIROS) {
      expect(await ativoAutorizado(W, FOOCCI, "ad_account", c)).toBe(false);
    }
    const todas = [CONTA_DA_FOOCCI, ...CONTAS_DE_TERCEIROS].map((id) => ({ id }));
    const r = await filtrarAutorizados(W, FOOCCI, "ad_account", todas, (c) => c.id);
    expect(r.autorizados.map((c) => c.id)).toEqual([CONTA_DA_FOOCCI]);
    expect(r.recusados).toEqual(CONTAS_DE_TERCEIROS);
    expect(r.listaVazia).toBe(false);
  });

  it("autorização de um cliente NÃO vale para outro — nem para a agência", async () => {
    await autorizarAContaDaFoocci();
    expect(await ativoAutorizado(W, "cli_outro", "ad_account", CONTA_DA_FOOCCI)).toBe(false);
    expect(await ativoAutorizado(W, null, "ad_account", CONTA_DA_FOOCCI)).toBe(false);
    expect(await ativoAutorizado("ws_outro", FOOCCI, "ad_account", CONTA_DA_FOOCCI)).toBe(false);
  });

  it("autorizar uma Página não autoriza o Instagram dela — e vice-versa", async () => {
    await autorizarAtivos(W, FOOCCI, [{ tipo: "page", externalId: "9001", nome: "FB Foocci" }], "portal:x");
    expect(await ativoAutorizado(W, FOOCCI, "page", "9001")).toBe(true);
    expect(await ativoAutorizado(W, FOOCCI, "instagram", "9001")).toBe(false);
  });

  it("id vazio nunca é autorizado — e nunca vira linha na lista", async () => {
    expect(await ativoAutorizado(W, FOOCCI, "ad_account", "")).toBe(false);
    const n = await autorizarAtivos(W, FOOCCI, [{ tipo: "ad_account", externalId: "  " }], "portal:x");
    expect(n).toBe(0);
    expect(banco.autorizacoes).toHaveLength(0);
  });
});

// ─── METADE B — o caso limpo passa sem atrito ───────────────────────────────

describe("B. O AUTORIZADO PASSA — sem pedido extra, sem aviso, sem atrito", () => {
  it("a conta que o cliente marcou é lida na hora seguinte", async () => {
    await autorizarAContaDaFoocci();
    expect(await ativoAutorizado(W, FOOCCI, "ad_account", CONTA_DA_FOOCCI)).toBe(true);
  });

  it("`act_1000` e `1000` são a MESMA conta — a Meta devolve as duas grafias", async () => {
    await autorizarAtivos(W, FOOCCI, [{ tipo: "ad_account", externalId: "1000" }], "portal:x");
    // Gravada sem prefixo, consultada com prefixo: tem que casar. Se não casasse,
    // metade das consultas barraria a conta certa do cliente.
    expect(await ativoAutorizado(W, FOOCCI, "ad_account", "act_1000")).toBe(true);
    expect(await ativoAutorizado(W, FOOCCI, "ad_account", "1000")).toBe(true);
    expect(normalizarId("ad_account", "1000")).toBe("act_1000");
    expect(normalizarId("ad_account", "act_1000")).toBe("act_1000");
    // Página/IG NÃO ganham prefixo nenhum: o id delas é o que a Meta mandou.
    expect(normalizarId("page", "9001")).toBe("9001");
  });

  it("marcar duas vezes o mesmo ativo não duplica linha (chave determinística)", async () => {
    await autorizarAContaDaFoocci();
    await autorizarAContaDaFoocci();
    expect(banco.autorizacoes).toHaveLength(1);
    expect(banco.autorizacoes[0].id).toBe(chaveDoAtivo(W, FOOCCI, "ad_account", CONTA_DA_FOOCCI));
  });

  it("vários ativos de uma vez, e todos passam", async () => {
    const n = await autorizarAtivos(W, FOOCCI, [
      { tipo: "ad_account", externalId: CONTA_DA_FOOCCI },
      { tipo: "page", externalId: "9001", nome: "FB Foocci" },
      { tipo: "instagram", externalId: "17841", nome: "@foocci_" },
    ], `portal:${FOOCCI}`);
    expect(n).toBe(3);
    expect(await ativoAutorizado(W, FOOCCI, "page", "9001")).toBe(true);
    expect(await ativoAutorizado(W, FOOCCI, "instagram", "17841")).toBe(true);
  });

  it("a chave é reconstruível e não confunde cliente com agência", () => {
    expect(chaveDoAtivo(W, null, "page", "9001")).toBe(`${W}:agencia:page:9001`);
    expect(chaveDoAtivo(W, FOOCCI, "page", "9001")).toBe(`${W}:${FOOCCI}:page:9001`);
    expect(chaveDoAtivo(W, null, "page", "9001")).not.toBe(chaveDoAtivo(W, FOOCCI, "page", "9001"));
  });
});

// ─── REVOGAR APAGA — não basta desmarcar ────────────────────────────────────

describe("REVOGAR — desmarcar tem que APAGAR a conexão, não só o visto", () => {
  it("revogar remove a linha E manda apagar a MetaConnection do ativo", async () => {
    await autorizarAtivos(W, FOOCCI, [{ tipo: "instagram", externalId: "17841" }], "portal:x");
    const r = await revogarAtivo(W, FOOCCI, "instagram", "17841");
    expect(r.removidoDaLista).toBe(true);
    expect(r.conexoesApagadas).toBe(1);
    expect(prismaFake.metaConnection.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: W, clientId: FOOCCI, platform: { in: ["instagram"] }, externalId: "17841" },
    });
    // E o ativo volta a ser negado imediatamente.
    expect(await ativoAutorizado(W, FOOCCI, "instagram", "17841")).toBe(false);
  });

  it("revogar conta de anúncio não tenta apagar conexão (não existe MetaConnection de conta de anúncio)", async () => {
    await autorizarAContaDaFoocci();
    const r = await revogarAtivo(W, FOOCCI, "ad_account", CONTA_DA_FOOCCI);
    expect(r.removidoDaLista).toBe(true);
    expect(prismaFake.metaConnection.deleteMany).not.toHaveBeenCalled();
  });
});
