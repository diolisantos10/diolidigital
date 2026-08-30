// A IMAGEM ENTRA NO LIVRO-CAIXA — o item mais caro da casa era o único invisível.
//
// ── O DEFEITO, MEDIDO EM PRODUÇÃO (24/08/2026, case Farol 27) ───────────────
//
// A rodada contabilizou **47 chamadas de texto, US$ 0,53**. Chamadas de imagem:
// **zero linhas** — não por não terem acontecido, mas porque `generateDesign`
// era o único motor pago da casa que nunca escrevia no `AIRunLog`. Duas
// consequências, e a segunda é a grave:
//
//   1. o relatório de gasto contava uma história mais barata que a fatura;
//   2. o TETO por workspace (`lib/ai/teto-de-custo.ts`) soma exatamente aquela
//      tabela — então o teto não enxergava o item MAIS CARO (~US$ 0,17–0,25 por
//      imagem, contra frações de centavo por texto).
//
// ── POR QUE O ALVO É `generateDesign`, E NÃO A ROTA ────────────────────────
//
// Porque é ele que a ESTEIRA usa. A tela manual `/agency/design-agent` chama a
// rota `/api/generate-image`, e testar por ela seria pôr a régua no irmão pouco
// usado: o caminho que produz de verdade (`artes.ts`, o despertador) não passa
// por rota nenhuma. Os quatro chamadores pagos atravessam ESTA função, e é por
// isso que a gravação mora dentro dela.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ aIRunLog: { create: vi.fn(), findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const chave = vi.hoisted(() => ({ resolveProviderKey: vi.fn() }));
vi.mock("@/lib/ai/resolve-key", async (original) => {
  const real = await original<typeof import("@/lib/ai/resolve-key")>();
  return { ...real, resolveProviderKey: chave.resolveProviderKey };
});

import { generateDesign } from "@/lib/ai/design-engine";
import { PRECO_DE_TABELA_USD, TABELA_VERSAO, estimarCustoDeImagem } from "@/lib/ai/precos";
import { gastoNaJanelaUsd } from "@/lib/ai/teto-de-custo";

const PIXEL = "iVBORw0KGgoAAAANSUhEUg==";

function respostaOk(): Response {
  return new Response(JSON.stringify({ data: [{ b64_json: PIXEL }] }), { status: 200 });
}
function respostaSemAcesso(): Response {
  return new Response(
    JSON.stringify({ error: { message: "Your organization must be verified to use gpt-image-1" } }),
    { status: 403 },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chave.resolveProviderKey.mockResolvedValue({ apiKey: "sk-de-teste", origem: "db" });
  db.aIRunLog.create.mockResolvedValue({});
});

/** A linha gravada, sem repetir o caminho do mock em cada teste. */
function linhaGravada(indice = 0) {
  return db.aIRunLog.create.mock.calls[indice]![0].data as Record<string, unknown>;
}

describe("toda imagem paga vira uma linha do livro-caixa", () => {
  it("grava a chamada com provedor, modelo e o dono da conta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    const r = await generateDesign({
      prompt: "croissant no balcão de madeira, luz da manhã",
      workspaceId: "ws-1",
      conta: { departmentId: "design", clientId: "cli-farol", projectId: "proj-1" },
    });
    expect(r.ok).toBe(true);
    expect(db.aIRunLog.create).toHaveBeenCalledTimes(1);
    const linha = linhaGravada();
    expect(linha.provider).toBe("openai");
    expect(linha.model).toBe("gpt-image-1");
    expect(linha.workspaceId).toBe("ws-1");
    expect(linha.clientId).toBe("cli-farol");
    expect(linha.projectId).toBe("proj-1");
    expect(linha.departmentId).toBe("design");
    expect(linha.status).toBe("success");
  });

  it("⭐ o custo é o preço de tabela DA IMAGEM, não uma conta de token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    await generateDesign({ prompt: "vitrine de padaria", workspaceId: "ws-1" });
    const linha = linhaGravada();
    // Quadrada em qualidade alta — o recorte que `artes.ts` pede sem opção.
    expect(linha.custoEstimadoUsd).toBe(PRECO_DE_TABELA_USD.quadrada);
    expect(linha.custoTabela).toBe(TABELA_VERSAO);
    // Imagem não tem token: gravar zero aqui inventaria uma medição.
    expect(linha.tokensEntrada).toBeNull();
    expect(linha.tokensSaida).toBeNull();
  });

  it("⭐ story custa mais que feed — e a linha registra a diferença", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    await generateDesign({ prompt: "story vertical", size: "portrait", workspaceId: "ws-1" });
    expect(linhaGravada().custoEstimadoUsd).toBe(PRECO_DE_TABELA_USD.retrato);
    expect(PRECO_DE_TABELA_USD.retrato).toBeGreaterThan(PRECO_DE_TABELA_USD.quadrada);
  });

  it("⭐ o TETO por workspace passa a enxergar a imagem", async () => {
    // Esta é a metade que importa em dinheiro: `gastoNaJanelaUsd` soma
    // `custoEstimadoUsd` do `AIRunLog`. Enquanto a imagem não escrevia ali, o
    // teto ficava verde enquanto a casa gastava o item mais caro que tem.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    await generateDesign({ prompt: "peça de feed", workspaceId: "ws-1" });
    const custoDaImagem = linhaGravada().custoEstimadoUsd as number;

    db.aIRunLog.findMany.mockResolvedValue([{ custoEstimadoUsd: custoDaImagem }]);
    const gasto = await gastoNaJanelaUsd("ws-1");
    expect(gasto).toBe(PRECO_DE_TABELA_USD.quadrada);
    // E NÃO o valor de substituição de "não sei quanto custou" (US$ 0,05), que
    // é o que sairia se o custo tivesse sido gravado como `null`.
    expect(gasto).not.toBe(0.05);
  });

  it("a queda para o dall-e-3 vira DUAS linhas, e a segunda diz que é reserva", async () => {
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(respostaSemAcesso())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://exemplo/x.png" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    await generateDesign({ prompt: "vitrine", workspaceId: "ws-1" });
    expect(db.aIRunLog.create).toHaveBeenCalledTimes(2);
    expect(linhaGravada(0).model).toBe("gpt-image-1");
    expect(linhaGravada(0).status).toBe("error");
    expect(linhaGravada(1).model).toBe("dall-e-3");
    expect(linhaGravada(1).fallbackUsed).toBe(true);
  });

  it("chamada RECUSADA custa zero — e zero aqui é o fato, não uma ausência", async () => {
    // O `images/generations` cobra por imagem PRODUZIDA. Uma recusa não produz
    // nenhuma. Gravar `null` faria o teto cobrar US$ 0,05 de substituição por
    // recusa, e uma conta sem acesso ao modelo (que erra em rajada, de graça)
    // fecharia o teto de quem não gastou nada.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "content policy" } }), { status: 400 }),
    ));
    await generateDesign({ prompt: "algo recusado", workspaceId: "ws-1" });
    const linha = linhaGravada();
    expect(linha.status).toBe("error");
    expect(linha.custoEstimadoUsd).toBe(0);
  });

  it("sem workspace NÃO grava linha órfã — e não fica calado", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    await generateDesign({ prompt: "sem dono" });
    expect(db.aIRunLog.create).not.toHaveBeenCalled();
    expect(aviso.mock.calls.flat().join(" ")).toContain("[custo-de-ia]");
    aviso.mockRestore();
  });

  it("o livro-caixa caindo NÃO derruba a entrega da peça", async () => {
    // Fail-open declarado, herdado de `registro-de-custo.ts`: trocar uma peça
    // entregue por uma linha de contabilidade seria trocar um problema grande
    // por um pequeno, ao contrário.
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    db.aIRunLog.create.mockRejectedValue(new Error("banco fora do ar"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk()));
    const r = await generateDesign({ prompt: "peça", workspaceId: "ws-1" });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("data:image/png;base64,");
    erro.mockRestore();
  });
});

describe("a tabela de preço de imagem, e o que ela recusa a inventar", () => {
  it("modelo fora da tabela custa `null`, nunca zero", () => {
    expect(estimarCustoDeImagem("modelo-que-ninguem-conhece", "quadrada", "high").usd).toBeNull();
  });
  it("qualidade fora da tabela custa `null`, nunca o preço da vizinha", () => {
    expect(estimarCustoDeImagem("gpt-image-1", "quadrada", "ultra").usd).toBeNull();
  });
  it("carrossel de 6 telas custa 6 imagens, não uma", () => {
    const uma = estimarCustoDeImagem("gpt-image-1", "quadrada", "high", 1).usd!;
    const seis = estimarCustoDeImagem("gpt-image-1", "quadrada", "high", 6).usd!;
    expect(seis).toBeCloseTo(uma * 6, 6);
  });
});
