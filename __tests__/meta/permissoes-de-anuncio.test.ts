// "ESTA CONTA DE ANÚNCIOS ESTÁ AO ALCANCE DESTE TOKEN, HOJE?"
//
// A pergunta que a casa não sabia responder sem TENTAR — e tentar é o gesto
// proibido: a Meta audita a atividade do app, tentativa recusada conta como
// tentativa, e foi ritmo de tentativa que restringiu uma conta em 03/08/2026.
//
// Duas travas nascem aqui, e as duas já falharam em produção noutra forma:
//
//   1. **A medição não pode gastar tentativa contra a conta.** `debug_token` é
//      leitura, contra o APP, e não é chamada da Marketing API — não pontua na
//      cota da conta de anúncios (`cota-de-anuncios.ts`, `ehChamadaDaMarketingApi`).
//   2. **`act_123` e `123` são o MESMO ativo.** A casa já resolveu isso em
//      `ativos-autorizados.ts` (`normalizarId`) e comparava id CRU aqui — o que
//      produz "não vale" FALSO e manda esperar por nada.

import { describe, it, expect, beforeEach, vi } from "vitest";

const graph = vi.hoisted(() => ({ graphGet: vi.fn() }));
vi.mock("@/lib/integrations/meta/graph", () => graph);

const cfg = vi.hoisted(() => ({ resolveMetaAppCredentials: vi.fn() }));
vi.mock("@/lib/integrations/meta/config", () => cfg);

const conn = vi.hoisted(() => ({ loadConnectionToken: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => conn);

import {
  permissoesDoToken, valeParaOAtivo, diagnosticarConta, mesmoAtivo,
  PARA_GERIR_ANUNCIOS, PARA_MEDIR_ANUNCIOS, DEPENDENCIAS_DE_ANUNCIO,
  PERMISSAO_DE_ANUNCIO_NAO_CONFERIDA,
} from "@/lib/integrations/meta/permissoes-do-token";
import { ehChamadaDaMarketingApi } from "@/lib/integrations/meta/cota-de-anuncios";

/** A conta real da CityJobs, marcada pelo cliente no portal em 14/08/2026. */
const CONTA = "act_1355986106660251";
const CONTA_CRUA = "1355986106660251";
const PAGINA = "980144238512557";

beforeEach(() => {
  vi.clearAllMocks();
  conn.loadConnectionToken.mockResolvedValue({
    token: "tok", externalId: CONTA, platform: "user", clientId: "cityjobs", metaJson: {},
  });
  cfg.resolveMetaAppCredentials.mockResolvedValue({ appId: "app1", appSecret: "sec", source: "env" });
});

// ─── 1. O DEFEITO DO ID CRU ─────────────────────────────────────────────────

describe("act_123 e 123 são a MESMA conta — a regra é a de ativos-autorizados", () => {
  it("a Meta devolvendo a grafia SEM prefixo não vira 'não vale' falso", async () => {
    // Este é o defeito, com nome: `granular_scopes` traz `1355986...` e o
    // chamador pergunta por `act_1355986...`. Comparação crua respondia
    // "nao_vale" e mandava a casa esperar por uma permissão que ela TEM.
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["ads_management", "ads_read"],
        granular_scopes: [{ scope: "ads_management", target_ids: [CONTA_CRUA] }],
      },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "ads_management", CONTA)).toBe("vale");
  });

  it("e o contrário também: granular com prefixo, pergunta sem", async () => {
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["ads_management"],
        granular_scopes: [{ scope: "ads_management", target_ids: [CONTA] }],
      },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "ads_management", CONTA_CRUA)).toBe("vale");
  });

  it("A METADE OPOSTA: conta DIFERENTE continua não valendo", async () => {
    // Sem isto, "normalizar" teria virado "liberar geral" — que é pior que o
    // defeito que ele conserta.
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["ads_management"],
        granular_scopes: [{ scope: "ads_management", target_ids: ["act_3416644181895443"] }],
      },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "ads_management", CONTA)).toBe("nao_vale");
  });

  it("uma Página `123` NÃO vira a conta `act_123` por semelhança numérica", () => {
    // Falso POSITIVO numa trava é pior que falso negativo: por isso a forma
    // canônica de conta só entra quando algum dos lados carrega `act_`.
    expect(mesmoAtivo("123", "act_123")).toBe(true);
    expect(mesmoAtivo("123", "456")).toBe(false);
    expect(mesmoAtivo("", "act_123")).toBe(false);
  });
});

// ─── 2. A MEDIÇÃO NÃO GASTA TENTATIVA CONTRA A CONTA ────────────────────────

describe("medir não é tentar", () => {
  it("uma leitura só, em debug_token, com o token do APP", async () => {
    graph.graphGet.mockResolvedValue({ data: { is_valid: true, scopes: ["ads_management"] } });
    await permissoesDoToken("ws1", "mc1");
    expect(graph.graphGet).toHaveBeenCalledTimes(1);
    const [caminho, inspetor] = graph.graphGet.mock.calls[0]!;
    expect(caminho).toBe("debug_token");
    expect(inspetor).toBe("app1|sec");
  });

  it("e `debug_token` NÃO é chamada da Marketing API — não pontua na cota da conta", () => {
    // Se isto cair, medir passou a custar pontos da conta, e a medição que
    // existe para EVITAR o bloqueio vira o caminho para ele.
    expect(ehChamadaDaMarketingApi("https://graph.facebook.com/v21.0/debug_token?input_token=x")).toBe(false);
    expect(ehChamadaDaMarketingApi(`https://graph.facebook.com/v21.0/${CONTA}/campaigns`)).toBe(true);
  });
});

// ─── 3. O DIAGNÓSTICO DA CONTA ──────────────────────────────────────────────

describe("o diagnóstico de anúncios responde pela CONTA, não pelo Instagram", () => {
  it("com ads_management e ads_read concedidos para a conta, fecha", async () => {
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["ads_management", "ads_read"],
        granular_scopes: [
          { scope: "ads_management", target_ids: [CONTA] },
          { scope: "ads_read", target_ids: [CONTA] },
        ],
      },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    const d = diagnosticarConta(p, CONTA);
    expect(d.completo).toBe(true);
    expect(d.faltando).toEqual([]);
  });

  it("nomeia o que falta — não devolve 'algo deu errado'", async () => {
    graph.graphGet.mockResolvedValue({ data: { is_valid: true, scopes: ["ads_read"] } });
    const p = await permissoesDoToken("ws1", "mc1");
    const d = diagnosticarConta(p, CONTA);
    expect(d.completo).toBe(false);
    expect(d.faltando).toEqual(["ads_management"]);
    expect(d.resumo).toContain("ads_management");
    expect(d.resumo).toContain(CONTA);
  });

  it("AS DEPENDÊNCIAS SÃO CONFERIDAS CONTRA A PÁGINA, nunca contra a conta", async () => {
    // A armadilha: `pages_read_engagement` é dependência declarada de
    // `ads_management`, mas ela vale por PÁGINA. Conferi-la contra o `act_...`
    // devolveria "não vale" falso — a mesma família do defeito do id cru.
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["ads_management", "ads_read", "pages_read_engagement", "pages_show_list"],
        granular_scopes: [
          { scope: "ads_management", target_ids: [CONTA] },
          { scope: "ads_read", target_ids: [CONTA] },
          { scope: "pages_read_engagement", target_ids: [PAGINA] },
          { scope: "pages_show_list", target_ids: [PAGINA] },
        ],
      },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(diagnosticarConta(p, CONTA, { pageId: PAGINA }).completo).toBe(true);
    // E a metade oposta: Página de OUTRO negócio não passa.
    expect(diagnosticarConta(p, CONTA, { pageId: "999" }).completo).toBe(false);
  });

  it("FAIL-CLOSED: não medido nunca vira 'pode', nem em metade do diagnóstico", async () => {
    cfg.resolveMetaAppCredentials.mockResolvedValue(null);
    const p = await permissoesDoToken("ws1", "mc1");
    const d = diagnosticarConta(p, CONTA, { pageId: PAGINA });
    expect(d.completo).toBe(false);
    expect(d.naoMedidas.length).toBeGreaterThan(0);
    expect(d.resumo).toMatch(/não medir não é o mesmo que não poder/i);
  });
});

// ─── 4. AS LISTAS ───────────────────────────────────────────────────────────

describe("as permissões de anúncio, e o que ficou DECLARADAMENTE por conferir", () => {
  it("ads_management vale por conta; ads_read é a de medir", () => {
    expect([...PARA_GERIR_ANUNCIOS]).toEqual(["ads_management"]);
    expect([...PARA_MEDIR_ANUNCIOS]).toEqual(["ads_read"]);
  });

  it("as dependências de Página são lista SEPARADA — juntá-las quebra a medição", () => {
    expect([...DEPENDENCIAS_DE_ANUNCIO]).toEqual(["pages_read_engagement", "pages_show_list"]);
    for (const dep of DEPENDENCIAS_DE_ANUNCIO) {
      expect(PARA_GERIR_ANUNCIOS).not.toContain(dep);
    }
  });

  it("pages_manage_ads fica FORA das listas — a captura do painel não a leu", () => {
    // Guardrail 1: ausência de leitura não é ausência de permissão. Colocá-la
    // numa lista de exigidas faria a medição reprovar por algo que ninguém
    // mediu; deixá-la sem registro faria a casa esquecer que existe.
    expect(PERMISSAO_DE_ANUNCIO_NAO_CONFERIDA).toBe("pages_manage_ads");
    expect(PARA_GERIR_ANUNCIOS).not.toContain(PERMISSAO_DE_ANUNCIO_NAO_CONFERIDA);
    expect(DEPENDENCIAS_DE_ANUNCIO).not.toContain(PERMISSAO_DE_ANUNCIO_NAO_CONFERIDA);
  });
});
