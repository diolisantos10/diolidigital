// A FILA DE ESCORREGAMENTO DA IMAGEM — a arte parou de depender de UM provedor.
//
// ═══ A ORDEM E O QUE A PRODUZIU (26/08/2026) ═════════════════════════════════
//
// Só a OpenAI gerava arte. Ela cair ou ficar sem saldo parava a produção da
// casa INTEIRA — foi o que derrubou Design para 3 e deixou oito departamentos
// sem nota. O TEXTO, na mesma volta, não parou: a fila de `generate.ts`
// escorregou para o Gemini e o cliente foi atendido.
//
// A prova que o CEO pediu é literal: **desligue a OpenAI e a casa continua
// produzindo.** É o que o primeiro bloco faz — sem mock do provedor: o `fetch`
// é interceptado, e o caminho percorrido é o mesmo do cliente de verdade.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const chaves = vi.hoisted(() => ({ openai: "sk-openai", gemini: "key-gemini" } as Record<string, string | null>));
vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: async (p: string) =>
    chaves[p] ? { apiKey: chaves[p]!, source: "env", model: null } : null,
}));
// O livro-caixa fala com o banco. Aqui interessa QUE ele foi chamado e com que
// provedor — a linha de verdade é exercitada em `__tests__/ai/`.
const livro = vi.hoisted(() => ({ registrarChamadaDeIa: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/registro-de-custo", () => livro);

import {
  generateDesign, ordemDosProdutoresDeImagem, escorregaParaOProximo,
  motivoDaFilaEsgotada,
} from "@/lib/ai/design-engine";
import { produtorDaPeca } from "@/lib/ai/produtor-da-peca";

/** A frase EXATA que a conta zerada da OpenAI devolveu em produção, lida no
 *  livro-caixa em 25–26/08/2026. */
const SEM_SALDO = "You have no credits remaining. Add credits to continue using the API.";

/** Uma imagem PNG mínima em base64 — o que o Gemini devolve em `inlineData`. */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUg==";

type Resposta = { status: number; body: unknown };
let respostas: Record<"openai" | "gemini", Resposta>;

beforeEach(() => {
  chaves.openai = "sk-openai";
  chaves.gemini = "key-gemini";
  livro.registrarChamadaDeIa.mockClear();
  respostas = {
    openai: { status: 429, body: { error: { message: SEM_SALDO } } },
    gemini: { status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_B64 } }] } }] } },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const quem = String(url).includes("googleapis.com") ? "gemini" : "openai";
    const r = respostas[quem];
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as unknown as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

const PEDIDO = { prompt: "uma foto do pão saindo do forno", workspaceId: "w1" };

// ─────────────────────────────────────────────────────────────────────────────
describe("desligue a OpenAI e a casa CONTINUA produzindo", () => {
  it("conta sem saldo na OpenAI → a peça nasce do Gemini", async () => {
    const r = await generateDesign(PEDIDO);

    // MUTAÇÃO QUE PROVA: apague o laço `for (const produtor of
    // ordemDosProdutoresDeImagem())` de `generateDesign` (volte à chamada única
    // da OpenAI) e as três linhas abaixo caem juntas. É o estado que parou a
    // casa inteira.
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("gemini");
    expect(r.url).toContain("data:image/png;base64,");
  });

  it("a OpenAI SUMIR de vez (sem chave) não para a arte — ela só sai da fila", async () => {
    // A mutação literal da ordem: desligar a OpenAI.
    chaves.openai = null;
    const r = await generateDesign(PEDIDO);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("gemini");
    // E nenhuma chamada foi feita à OpenAI: produtor sem chave não é tentado.
    const urls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("api.openai.com"))).toBe(false);
  });

  it("429, 5xx, timeout e resposta vazia também escorregam — a lista da ordem", async () => {
    for (const falha of [
      { status: 429, body: { error: { message: "Rate limit reached" } } },
      { status: 503, body: { error: { message: "service unavailable" } } },
      { status: 200, body: { data: [] } },                                  // resposta sem imagem
      { status: 500, body: { error: { message: "internal server error" } } },
    ]) {
      respostas.openai = falha;
      const r = await generateDesign(PEDIDO);
      expect(r.ok, `status ${falha.status}`).toBe(true);
      expect(r.provider).toBe("gemini");
    }
  });

  it("a OpenAI voltando, ela volta a ser a primeira — a fila não vira preferência nova", async () => {
    respostas.openai = { status: 200, body: { data: [{ b64_json: PNG_B64 }] } };
    const r = await generateDesign(PEDIDO);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-image-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("falta de chave NÃO escorrega — é motivo de parar", () => {
  it("chave recusada pela OpenAI para a fila, mesmo com o Gemini de pé", async () => {
    respostas.openai = { status: 401, body: { error: { message: "Incorrect API key provided" } } };
    const r = await generateDesign(PEDIDO);

    // MUTAÇÃO QUE PROVA: faça `escorregaParaOProximo` devolver `true` sempre e
    // esta linha cai — a casa passaria a trocar de produtor em silêncio por um
    // problema que uma pessoa resolve em um minuto, e ninguém saberia que a
    // chave está errada porque nada nunca falharia.
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_configured");
    expect(r.error).toContain("sem chave");
    // E o Gemini não foi tentado.
    const urls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("googleapis.com"))).toBe(false);
  });

  it("a régua, direta: só `sem_chave` para", () => {
    expect(escorregaParaOProximo("sem_saldo")).toBe(true);
    expect(escorregaParaOProximo("teto_de_ritmo")).toBe(true);
    expect(escorregaParaOProximo("indisponivel")).toBe(true);
    expect(escorregaParaOProximo(null)).toBe(true);
    expect(escorregaParaOProximo("sem_chave")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("fila esgotada para com o MOTIVO CERTO — status de erro não é motivo", () => {
  it("os dois sem saldo → a frase diz SEM SALDO, com dono e próxima ação", async () => {
    respostas.gemini = { status: 429, body: { error: { message: "You exceeded your current quota" } } };
    const r = await generateDesign(PEDIDO);

    expect(r.ok).toBe(false);
    // MUTAÇÃO QUE PROVA: devolva `r.error = "não consegui gerar"` no fim de
    // `generateDesign` e as três linhas abaixo caem. Era a frase que a produção
    // leu — indistinguível entre código quebrado e conta zerada.
    expect(r.error).toContain("SEM SALDO na conta do provedor");
    expect(r.error).toMatch(/Dono: CEO/);
    expect(r.error).toMatch(/Próxima ação: pôr crédito/);
    // E a prova por trás da frase: quem caiu, na ordem.
    expect(r.quedas?.map((q) => q.produtor)).toEqual(["openai", "gemini"]);
  });

  it("a pior falha vence a última — sem saldo não fica escondido atrás de um 503", () => {
    const frase = motivoDaFilaEsgotada([
      { produtor: "openai", motivo: "sem_saldo", erro: SEM_SALDO },
      { produtor: "gemini", motivo: "indisponivel", erro: "Gemini HTTP 503" },
    ]);
    expect(frase).toContain("SEM SALDO");
    expect(frase).toContain("openai → gemini");
  });

  it("nenhum produtor conectado é dito como tal, não como falha de provedor", async () => {
    chaves.openai = null;
    chaves.gemini = null;
    const r = await generateDesign(PEDIDO);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_configured");
    expect(r.error).toContain("nenhum produtor de imagem está conectado");
    expect(r.error).toMatch(/Próxima ação: conectar uma chave/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o arquivo diz de quem nasceu — freio 3", () => {
  it("o carimbo nomeia produtor E modelo", () => {
    expect(produtorDaPeca({ provider: "gemini", model: "gemini-2.5-flash-image" }))
      .toBe("design (gemini/gemini-2.5-flash-image)");
    expect(produtorDaPeca({ provider: "openai", model: "dall-e-3" })).toBe("design (openai/dall-e-3)");
    // Peça que não passou pelo gerador (foto real do cliente, re-render local)
    // continua sendo "design" — ausência de produtor não vira produtor.
    expect(produtorDaPeca({})).toBe("design");
  });

  it("o livro-caixa registra o produtor de VERDADE, não `openai` fixo", async () => {
    await generateDesign(PEDIDO);
    const provedores = (livro.registrarChamadaDeIa.mock.calls as unknown as Array<[{ provider: string }]>)
      .map((c) => c[0].provider);
    // MUTAÇÃO QUE PROVA: volte `provider: "openai"` fixo em
    // `registrarNoLivroCaixa` e esta linha cai — o gasto do Gemini entraria na
    // conta da OpenAI, e o alarme de SEM SALDO acusaria a conta errada.
    expect(provedores).toContain("gemini");
  });

  it("e as duas peças do post carregam o carimbo — não o literal \"design\"", async () => {
    const { readFileSync } = await import("node:fs");
    const s = readFileSync("lib/agency/execution/artes.ts", "utf8");
    expect(s).toContain("carimboDoProdutor = produtorDaPeca(r)");
    expect(s).toContain("uploadedBy: carimboDoProdutor,");
    expect(s).toContain("uploadedBy: carimboDaTela,");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("freio 1 — fundo diferente é peça diferente, para TODOS os produtores", () => {
  it("nenhuma régua de peça pergunta quem produziu", async () => {
    const { readFileSync } = await import("node:fs");
    for (const arquivo of [
      "lib/agency/design/trava-de-fundo.ts",
      "lib/agency/produtos/conferencia-do-arquivo.ts",
    ]) {
      const s = readFileSync(arquivo, "utf8");
      // MUTAÇÃO QUE PROVA: acrescente um `if (provider === "gemini") return
      // { ok: true }` em qualquer uma delas e esta linha cai. Afrouxar régua
      // porque "veio de outro provedor" é entregar peça pior fingindo
      // normalidade — o que a ordem proíbe com todas as letras.
      expect(/provider|produtor|gemini|openai|gpt-image|dall-e/i.test(s), arquivo).toBe(false);
    }
  });

  it("a ordem dos produtores é ranking, e o preferido não desliga a reserva", () => {
    expect(ordemDosProdutoresDeImagem()).toEqual(["openai", "gemini"]);
    vi.stubEnv("BRAIN_IMAGE_PROVIDER", "gemini");
    expect(ordemDosProdutoresDeImagem()).toEqual(["gemini", "openai"]);
    vi.unstubAllEnvs();
  });
});
