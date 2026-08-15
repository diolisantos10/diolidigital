// O ERRO QUE ENSINA — a recusa da Meta traduzida no GESTO que a resolve.
//
// ─── O QUE ESTE ARQUIVO IMPEDE DE VOLTAR ────────────────────────────────────
//
// Até 15/08/2026, `ads.ts` carimbava QUALQUER recusa que contivesse a palavra
// "permission" com a frase:
//
//   "Isso depende do App Review — não é erro de configuração."
//
// Para conta de terceiro, correto. Para a conta do PRÓPRIO dono do app, é
// mentira cara: a Meta dispensa análise e verificação para quem tem função no
// app (`fontes/verificacao-de-negocio.md:21`, `fontes/app-review-processo.md:18`)
// e a casa já criou campanha por API com o token do CEO em 03/08/2026
// (`docs/pendencias.md:3283-3287`). A frase mandou a casa esperar semanas por
// algo que não era o problema — e mandou de verdade, não em tese.
//
// Três recusas que se parecem e pedem coisas OPOSTAS:
//
//   permissão ausente   → reconectar pedindo o escopo (minutos)
//   ativo não autorizado→ dar a função na conta, no Gerenciador (minutos)
//   conta restrita      → recorrer da restrição (~48 h, e nenhum código ajuda)
//
// E cada frase carrega a evidência que a produziu — código, subcódigo e o texto
// literal da Meta (guardrail 6: alerta sem o caso concreto é ruído que ninguém
// investiga, e aqui seria pior: seria ruído que ninguém consegue CONFERIR).

import { describe, it, expect, beforeEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const graphPost = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());

/** Um erro da Graph com `detail` completo — é o subcódigo que separa erros de
 *  mesmo código e gestos opostos, e a casa o jogava fora. */
const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string; code?: number; error_subcode?: number; type?: string };
  constructor(message: string, code?: number, error_subcode?: number) {
    super(message);
    this.detail = { message, ...(code !== undefined ? { code } : {}), ...(error_subcode !== undefined ? { error_subcode } : {}) };
  }
});
vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet, graphPost, GraphApiError: FakeGraphError }));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/integrations/meta/ativos-autorizados", async (original) => {
  const real = await original<typeof import("@/lib/integrations/meta/ativos-autorizados")>();
  return {
    ...real,
    ativoAutorizado: vi.fn(async () => true),
    filtrarAutorizados: vi.fn(async (_w: string, _c: unknown, _t: unknown, itens: unknown[]) => ({
      autorizados: itens, recusados: [], listaVazia: false,
    })),
  };
});

import {
  listarContasDeAnuncio,
  CODIGOS_DE_PERMISSAO_AUSENTE, CODIGOS_DE_ATIVO_NAO_AUTORIZADO,
  SUBCODIGOS_DE_ATIVO_NAO_AUTORIZADO, CODIGOS_DE_CONTA_RESTRITA,
  CODIGO_DE_TOKEN_INVALIDO,
} from "@/lib/integrations/meta/ads";

beforeEach(() => {
  vi.clearAllMocks();
  loadConnectionToken.mockResolvedValue({ token: "tk", platform: "user", externalId: "1", clientId: "cityjobs" });
});

async function recusa(e: Error) {
  graphGet.mockRejectedValue(e);
  return listarContasDeAnuncio("ws1", "mc1");
}

// ─── 1. A MENTIRA, NOMEADA ──────────────────────────────────────────────────

describe("nenhuma recusa de permissão diz mais 'depende do App Review'", () => {
  it("permissão ausente NÃO manda esperar App Review — manda MEDIR primeiro", async () => {
    // Se este teste cair, a casa voltou a mandar o CEO esperar semanas por um
    // portão que, para a conta dele, a Meta dispensa.
    const r = await recusa(new FakeGraphError("(#294) Managing advertisements requires ads_management permission", 294));
    expect(r.motivo).toBe("sem_permissao");
    expect(r.erro).not.toMatch(/depende do App Review/i);
    expect(r.erro).toMatch(/ME[ÇC]A/i);
    expect(r.erro).toMatch(/ads_management/);
  });

  it("e quando cita acesso avançado, diz para QUEM ele vale: conta de TERCEIRO", async () => {
    const r = await recusa(new FakeGraphError("(#200) Requires ads_read permission", 200));
    expect(r.motivo).toBe("sem_permissao");
    // As DUAS metades, sempre juntas: conta própria = acesso padrão, que é
    // automático; conta de terceiro = acesso avançado, que passa pela análise.
    expect(r.erro).toMatch(/pr[oó]prio dono do app/i);
    expect(r.erro).toMatch(/acesso padr[aã]o j[aá] basta/i);
    expect(r.erro).toMatch(/TERCEIRO/);
    expect(r.erro).toMatch(/acesso avan[cç]ado/i);
    // E cada metade cita a linha da fonte que a sustenta.
    expect(r.erro).toContain("marketing-api-autorizacao-e-niveis.md:73");
    expect(r.erro).toContain("app-review-publicacao.md:27");
  });

  it("nomeia o escopo que a Meta citou, não uma dupla genérica", async () => {
    const r = await recusa(new FakeGraphError("(#200) Requires ads_read permission", 200));
    expect(r.erro).toContain("ads_read");
    expect(r.erro).not.toContain("ads_management/ads_read");
  });
});

// ─── 2. AS TRÊS RECUSAS QUE SE PARECEM ──────────────────────────────────────

describe("permissão ausente × ativo não autorizado × conta restrita", () => {
  it("ATIVO NÃO AUTORIZADO: o token vale, quem o deu não administra a conta", async () => {
    // Código 100/33: "seu token de acesso não [foi] adicionado como um usuário
    // do sistema com permissões adequadas à conta de anúncios"
    // (fontes/marketing-api-erros.md:44). É gesto de minutos, não de semanas.
    const r = await recusa(new FakeGraphError("Incompatible POST request", 100, 33));
    expect(r.motivo).toBe("ativo_nao_autorizado");
    expect(r.erro).toMatch(/Gerenciador de Neg[oó]cios/);
    expect(r.erro).toMatch(/n[aã]o [eé] App Review nem escopo/i);
  });

  it("ATIVO NÃO AUTORIZADO: 'sem permissão de gravação para esta conta' não vira App Review", async () => {
    const r = await recusa(new FakeGraphError("Sem permissão de gravação para esta conta de anúncios", 2654, 1713092));
    expect(r.motivo).toBe("ativo_nao_autorizado");
  });

  it("CONTA RESTRITA: manda recorrer, com o caminho e o prazo da própria Meta", async () => {
    const r = await recusa(new FakeGraphError(
      "Você não tem mais permissão para usar os produtos do Facebook a fim de anunciar", 1404163,
    ));
    expect(r.motivo).toBe("conta_restrita");
    expect(r.erro).toMatch(/Pedir an[aá]lise/);
    expect(r.erro).toMatch(/48 h/);
    // A pegadinha: a mensagem TEM a palavra "permissão". Se a ordem dos testes
    // voltar a ler texto antes de código, isto vira "sem_permissao" e a casa
    // fica reconectando uma conta que a Meta bloqueou.
    expect(r.motivo).not.toBe("sem_permissao");
  });

  it("CONTA RESTRITA: 'deemed abusive' (368) também é bloqueio, não configuração", async () => {
    const r = await recusa(new FakeGraphError(
      "The action attempted has been deemed abusive or is otherwise disallowed", 368,
    ));
    expect(r.motivo).toBe("conta_restrita");
  });

  it("TOKEN MORTO (190) não é permissão faltando — só o dono reconecta", async () => {
    const r = await recusa(new FakeGraphError("Error validating access token: Session has expired", 190));
    expect(r.motivo).toBe("token_invalido");
    expect(r.erro).toMatch(/s[oó] o dono da conta reconecta/i);
    expect(r.erro).toMatch(/Refresh por API n[aã]o conserta/i);
  });
});

// ─── 3. A EVIDÊNCIA VIAJA JUNTO (guardrail 6) ───────────────────────────────

describe("toda frase carrega a evidência que a originou", () => {
  it("código, subcódigo e o texto literal da Meta aparecem na mensagem", async () => {
    const r = await recusa(new FakeGraphError("Incompatible POST request", 100, 33));
    expect(r.erro).toContain("código 100");
    expect(r.erro).toContain("subcódigo 33");
    expect(r.erro).toContain('"Incompatible POST request"');
  });

  it("o erro que a casa NÃO classificou sobe cru, com o código — nunca traduzido no chute", async () => {
    const r = await recusa(new FakeGraphError("O orçamento é muito baixo.", 1885272));
    expect(r.motivo).toBe("erro_da_meta");
    expect(r.erro).toContain("O orçamento é muito baixo.");
    expect(r.erro).toContain("código 1885272");
  });
});

// ─── 4. A TABELA DE CÓDIGOS É CONFERÍVEL ────────────────────────────────────
//
// Ela está exportada de propósito: uma tabela de códigos escondida dentro de um
// `if` é uma tabela que ninguém confere contra a fonte.

describe("os códigos vêm da referência da Meta, não de memória", () => {
  it("permissão ausente: 10 (app), 200 (permissão), 294 (ads_management)", () => {
    expect(CODIGOS_DE_PERMISSAO_AUSENTE).toEqual([10, 200, 294]);
  });

  it("ativo não autorizado: 1815694 e 2654 · subcódigos 33 e 1713092", () => {
    expect(CODIGOS_DE_ATIVO_NAO_AUTORIZADO).toEqual([1815694, 2654]);
    expect(SUBCODIGOS_DE_ATIVO_NAO_AUTORIZADO).toEqual([33, 1713092]);
  });

  it("conta restrita: 368, 1404078, 1404163", () => {
    expect(CODIGOS_DE_CONTA_RESTRITA).toEqual([368, 1404078, 1404163]);
  });

  it("token inválido: 190", () => {
    expect(CODIGO_DE_TOKEN_INVALIDO).toBe(190);
  });
});
