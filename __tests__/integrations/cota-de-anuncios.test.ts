// A COTA POR PONTUAÇÃO da Marketing API — o contador que agora mora no BANCO.
//
// O que precisa ficar provado, nas DUAS metades (um freio que só barra quebra o
// produto; um freio que só deixa passar é decoração):
//
//   • BARRA quando estoura — 20 escritas travam a conta por 300s no nível de
//     desenvolvimento (leitura 1 ponto, escrita 3, teto 60;
//     docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md);
//   • NÃO barra o uso legítimo — montar a campanha inteira (campanha, conjunto,
//     criativo, anúncio) cabe folgado na janela;
//   • o PESO é por tipo de operação, e o desconhecido paga o mais caro;
//   • a conta é por CONTA DE ANÚNCIOS: uma conta cheia não trava a outra;
//   • DEPLOY NO MEIO DA RAJADA não zera nada — é o defeito que motivou tudo;
//   • escrita fora do catálogo (`travas.ts`) NEM CHEGA na rede.
//
// O banco do teste é SQLite de verdade (libsql em memória), criado a partir do
// ARQUIVO DE MIGRATION. Se a migration e o SQL do código divergirem, o teste
// fica vermelho — que é o ponto.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken: vi.fn() }));
vi.mock("@/lib/integrations/meta/config", () => ({
  GRAPH_BASE: "https://graph.facebook.com/v21.0",
}));

import {
  reservarPontosDaConta, frearConta, retratoDaCota, configurarCota,
  tetoDePontos, contaDaUrl, ehChamadaDaMarketingApi,
  JANELA_SEGUNDOS, TETO_DESENVOLVIMENTO, MARGEM_DA_CASA,
  type BancoDaCota,
} from "@/lib/integrations/meta/cota-de-anuncios";
import { pesoDaOperacao, ehEscrita, operacaoConhecida, PONTOS_DE_ESCRITA } from "@/lib/integrations/meta/travas";
import { graphPost, GraphApiError } from "@/lib/integrations/meta/graph";
import { limparRitmo, configurarRitmo } from "@/lib/integrations/meta/ritmo";

// ─── Um SQLite de verdade, criado pela migration de verdade ─────────────────

const MIGRATION = path.join(
  process.cwd(), "prisma", "migrations",
  "20260806120000_cota_por_pontuacao_da_marketing_api", "migration.sql",
);

let cliente: Client;
let relogio = 1_700_000_000_000;

function bancoDeTeste(c: Client): BancoDaCota {
  return {
    executar: async (sql, params) => {
      const r = await c.execute({ sql, args: params as never[] });
      return r.rowsAffected;
    },
    consultar: async <T>(sql: string, params: unknown[]) => {
      const r = await c.execute({ sql, args: params as never[] });
      return r.rows as unknown as T[];
    },
  };
}

async function subirBanco(): Promise<Client> {
  const c = createClient({ url: ":memory:" });
  const sql = readFileSync(MIGRATION, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const comando of sql.split(";")) {
    const limpo = comando.trim();
    if (limpo) await c.execute(limpo);
  }
  return c;
}

beforeEach(async () => {
  relogio = 1_700_000_000_000;
  cliente = await subirBanco();
  configurarCota({ agora: () => relogio, banco: bancoDeTeste(cliente) });
  limparRitmo();
  configurarRitmo({ agora: () => relogio, dormir: async (ms) => { relogio += ms; } });
});

afterEach(() => {
  configurarCota();
  configurarRitmo();
  limparRitmo();
  vi.restoreAllMocks();
});

const CONTA = "act_1072627681961050";

// ─── 1. O número certo, e o número velho ────────────────────────────────────

describe("o teto que a Meta realmente aplica", () => {
  it("é pontuação por 300s, não chamadas por hora: 60 pontos no nível de desenvolvimento", () => {
    expect(TETO_DESENVOLVIMENTO).toBe(60);
    expect(JANELA_SEGUNDOS).toBe(300);
    // A casa gasta só a margem — parar antes custa minutos, estourar custa o
    // bloqueio da conta inteira.
    expect(tetoDePontos(null)).toBe(Math.floor(60 * MARGEM_DA_CASA));
    expect(tetoDePontos("standard_access")).toBe(Math.floor(9000 * MARGEM_DA_CASA));
  });

  it("cobra 3 pontos por escrita e 1 por leitura", () => {
    expect(pesoDaOperacao("criar_campanha_pausada")).toBe(3);
    expect(pesoDaOperacao("ler_desempenho")).toBe(1);
  });

  it("FAIL-CLOSED: operação que o código não conhece paga o peso mais caro, nunca zero", () => {
    expect(operacaoConhecida("campanha.duplicar_em_lote")).toBe(false);
    expect(pesoDaOperacao("campanha.duplicar_em_lote")).toBe(PONTOS_DE_ESCRITA);
    expect(pesoDaOperacao(undefined)).toBe(PONTOS_DE_ESCRITA);
    expect(ehEscrita(undefined, "POST")).toBe(true);
    expect(ehEscrita("nome.inventado")).toBe(true);
  });
});

// ─── 2. As duas metades do freio ────────────────────────────────────────────

describe("o contador no banco", () => {
  it("deixa passar a campanha inteira: campanha → conjunto → criativo → anúncio", async () => {
    const passos = [
      "ler_conta", "criar_campanha_pausada", "buscar_cidade", "buscar_interesse",
      "criar_conjunto_pausado", "criar_criativo", "criar_anuncio_pausado", "ler_campanha",
    ];
    for (const operacao of passos) {
      const r = await reservarPontosDaConta(CONTA, { operacao });
      expect(r.ok, `${operacao} deveria passar`).toBe(true);
    }
    // 4 escritas (12) + 4 leituras (4) = 16 de 48.
    const retrato = await retratoDaCota(CONTA);
    expect(retrato.pontos).toBe(16);
    expect(retrato.teto).toBe(48);
  });

  it("BARRA a rajada antes dos 60 pontos da Meta — e diz quanto esperar", async () => {
    // 16 escritas × 3 = 48 pontos = o teto da casa.
    for (let i = 0; i < 16; i++) {
      const r = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
      expect(r.ok, `escrita ${i + 1}`).toBe(true);
    }
    const estourou = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(estourou.ok).toBe(false);
    if (estourou.ok) return;
    expect(estourou.motivo).toBe("teto");
    expect(estourou.esperarSegundos).toBeGreaterThan(0);
    expect(estourou.esperarSegundos).toBeLessThanOrEqual(JANELA_SEGUNDOS);
    expect(estourou.frase).toContain(CONTA);

    // Uma LEITURA de 1 ponto também não passa — a cota é compartilhada por
    // todos os endpoints da mesma conta (BUC).
    const leitura = await reservarPontosDaConta(CONTA, { operacao: "ler_campanha" });
    expect(leitura.ok).toBe(false);
  });

  it("a conta cheia não trava a conta do vizinho — a cota é POR CONTA", async () => {
    for (let i = 0; i < 16; i++) await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect((await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" })).ok).toBe(false);
    const outra = await reservarPontosDaConta("act_999", { operacao: "criar_campanha_pausada" });
    expect(outra.ok).toBe(true);
  });

  it("não libera 2× o teto na virada da janela (soma a janela anterior)", async () => {
    for (let i = 0; i < 16; i++) await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    // Um segundo depois da virada: janela nova, mas a anterior ainda conta.
    relogio += (JANELA_SEGUNDOS + 1) * 1000;
    const logoDepois = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(logoDepois.ok).toBe(false);

    // Duas janelas depois, a cota está livre de novo.
    relogio += JANELA_SEGUNDOS * 1000;
    const depois = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(depois.ok).toBe(true);
  });
});

// ─── 3. O defeito que motivou a mudança: deploy no meio da rajada ───────────

describe("deploy no meio da rajada", () => {
  it("NÃO zera o contador — ele está no banco, não na memória do processo", async () => {
    for (let i = 0; i < 15; i++) await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });

    // O "deploy": todo estado em memória desta casa some (balde de ritmo,
    // caches, contadores de processo). O banco continua sendo o mesmo.
    limparRitmo();
    configurarCota({ agora: () => relogio, banco: bancoDeTeste(cliente) });

    const retrato = await retratoDaCota(CONTA);
    expect(retrato.pontos).toBe(45); // sobrevive ao reinício
    const ultima = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(ultima.ok).toBe(true); // 48
    const estourou = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(estourou.ok).toBe(false);
  });

  it("o castigo da conta também atravessa o deploy", async () => {
    await frearConta(CONTA, 300, "a Meta recusou por limite de volume (código 613)");
    configurarCota({ agora: () => relogio, banco: bancoDeTeste(cliente) });
    const r = await reservarPontosDaConta(CONTA, { operacao: "ler_campanha" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("freio");
    expect(r.esperarSegundos).toBeGreaterThan(0);

    // Passado o castigo, a casa volta a falar — sem ninguém precisar reiniciar.
    relogio += 301_000;
    expect((await reservarPontosDaConta(CONTA, { operacao: "ler_campanha" })).ok).toBe(true);
  });
});

// ─── 4. Banco fora do ar: fail-closed ───────────────────────────────────────

describe("fail-closed", () => {
  it("banco indisponível NEGA a chamada em vez de deixar passar sem contar", async () => {
    configurarCota({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("database is locked"); },
        consultar: async () => { throw new Error("database is locked"); },
      },
    });
    const r = await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("banco");
    expect(r.frase).toContain("NÃO falei com a Meta");
  });
});

// ─── 5. O catálogo fechado, provado no caminho real (graph.ts → rede) ───────

describe("o catálogo fechado de travas.ts", () => {
  it("escrita NÃO catalogada não chega na rede", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);

    await expect(
      graphPost(`${CONTA}/campaigns`, "tok", { name: "x" }),
    ).rejects.toBeInstanceOf(GraphApiError);
    expect(fetchFalso).not.toHaveBeenCalled();

    // E nada foi cobrado da cota: a chamada nem começou.
    expect((await retratoDaCota(CONTA)).pontos).toBe(0);
  });

  it("escrita catalogada passa, cobra 3 pontos e barra quando a cota acaba", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ id: "120" }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchFalso);

    await graphPost(`${CONTA}/campaigns`, "tok", { name: "x" }, { operacao: "criar_campanha_pausada" });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect((await retratoDaCota(CONTA)).pontos).toBe(3);

    // Enche a cota por fora e prova que a próxima escrita PARA — com frase em
    // português e sem tentar de novo em laço.
    for (let i = 0; i < 15; i++) await reservarPontosDaConta(CONTA, { operacao: "criar_campanha_pausada" });
    const antes = fetchFalso.mock.calls.length;
    await expect(
      graphPost(`${CONTA}/campaigns`, "tok", { name: "y" }, { operacao: "criar_campanha_pausada" }),
    ).rejects.toThrow(/cota de 48 pontos/);
    expect(fetchFalso.mock.calls.length).toBe(antes); // não chamou, não retentou
  });
});

// ─── 6. Quem é conta de anúncios ────────────────────────────────────────────

describe("reconhecimento da Marketing API", () => {
  it("acha a conta na URL e reconhece as arestas de anúncio", () => {
    expect(contaDaUrl("https://graph.facebook.com/v21.0/act_123/campaigns?x=1")).toBe("act_123");
    expect(contaDaUrl("https://graph.facebook.com/v21.0/17841400000/media")).toBeNull();
    expect(ehChamadaDaMarketingApi("https://graph.facebook.com/v21.0/act_123/adsets")).toBe(true);
    expect(ehChamadaDaMarketingApi("https://graph.facebook.com/v21.0/me/adaccounts")).toBe(true);
    // O insights do Instagram NÃO pode cair na cota da conta de anúncios: o
    // dashboard do cliente ficaria bloqueado por um limite que não é o dele.
    expect(ehChamadaDaMarketingApi("https://graph.facebook.com/v21.0/17841400000/insights")).toBe(false);
  });
});
