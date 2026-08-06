// O CONTADOR DE RITMO DA META NO VOLUME — as duas metades.
//
// A frente de 06/08/2026: o teto por hora e o freio da Graph saíram da memória
// de processo. O que precisa ficar provado aqui é o que a memória NÃO fazia:
//   • o contador atravessa o reinício do processo (o deploy não devolve a cota);
//   • duas chamadas simultâneas na fronteira do teto não passam as duas;
//   • banco fora do ar NEGA (fail-closed);
// e a outra metade, sem a qual a trava seria só um "não" caro:
//   • o uso normal passa inteiro;
//   • a janela vira e a chave volta a falar com a Meta;
//   • o cache é FAIL-OPEN — cache quebrado vira miss, não recusa.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import {
  reservarNaJanelaDoBanco, frearChaveNoBanco, limparFreioNoBanco,
  retratoNoBanco, configurarRitmoNoBanco, type BancoDoRitmo,
} from "@/lib/integrations/meta/ritmo-no-banco";
import {
  lerDoCacheNoBanco, guardarNoCacheNoBanco, limparCacheNoBanco, configurarCacheNoBanco,
} from "@/lib/integrations/meta/cache-no-banco";

const MIGRATION = path.join(
  process.cwd(), "prisma", "migrations",
  "20260806170000_ritmo_e_cache_da_meta_no_banco", "migration.sql",
);

let relogio = 1_700_000_000_000;
let cliente: Client;

function bancoDeTeste(c: Client): BancoDoRitmo {
  return {
    executar: async (sql, params) => (await c.execute({ sql, args: params as never[] })).rowsAffected,
    consultar: async <T>(sql: string, params: unknown[]) =>
      (await c.execute({ sql, args: params as never[] })).rows as unknown as T[],
  };
}

/** O banco sobe pelo ARQUIVO DE MIGRATION REAL: um CREATE TABLE copiado aqui
 *  deixaria de falhar no dia em que o schema mudasse. */
beforeEach(async () => {
  relogio = 1_700_000_000_000;
  cliente = createClient({ url: ":memory:" });
  const sql = readFileSync(MIGRATION, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const comando of sql.split(";")) {
    const limpo = comando.trim();
    if (limpo) await cliente.execute(limpo);
  }
  configurarRitmoNoBanco({ agora: () => relogio, banco: bancoDeTeste(cliente) });
  configurarCacheNoBanco({ agora: () => relogio });
});

afterEach(() => {
  configurarRitmoNoBanco();
  configurarCacheNoBanco();
});

const CHAVE = "tk:deadbeef";

describe("a metade que deixa passar", () => {
  it("o uso normal passa inteiro e o contador diz quanto foi", async () => {
    for (let i = 0; i < 28; i++) {
      expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(true);
    }
    expect((await retratoNoBanco(CHAVE)).gastas).toBe(28);
  });

  it("cada chave tem a sua conta — um cliente ruidoso não derruba o outro", async () => {
    for (let i = 0; i < 200; i++) await reservarNaJanelaDoBanco("tk:a", 1, 200);
    expect((await reservarNaJanelaDoBanco("tk:a", 1, 200)).ok).toBe(false);
    expect((await reservarNaJanelaDoBanco("tk:b", 1, 200)).ok).toBe(true);
  });

  it("passadas duas janelas, a chave volta a falar com a Meta", async () => {
    for (let i = 0; i < 200; i++) await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(false);
    relogio += 2 * 3_600_001;
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(true);
  });

  it("um custo em lote (um dashboard inteiro) é reservado de uma vez", async () => {
    expect((await reservarNaJanelaDoBanco(CHAVE, 28, 200)).ok).toBe(true);
    expect((await retratoNoBanco(CHAVE)).gastas).toBe(28);
  });
});

describe("a metade que barra", () => {
  it("estourado o teto, recusa com frase em português e tempo de espera", async () => {
    for (let i = 0; i < 200; i++) await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    const r = await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("teto");
      expect(r.frase).toMatch(/ritmo/i);
      expect(r.esperarSegundos).toBeGreaterThan(0);
    }
  });

  // ─── A PROVA DA FRENTE: o contador não mora no processo ───────────────────
  // Não há como "reiniciar" um módulo dentro do teste, mas há como provar a
  // propriedade que importa: o estado está no BANCO, e um processo novo que
  // aponte para o mesmo banco vê a mesma contagem. Era exatamente isto que a
  // memória não dava — e é por isso que o deploy devolvia a rajada.
  it("um processo NOVO, apontando para o mesmo banco, vê a cota já gasta", async () => {
    for (let i = 0; i < 200; i++) await reservarNaJanelaDoBanco(CHAVE, 1, 200);

    // O "deploy": tudo o que estava em memória some, e o módulo é reconfigurado
    // do zero — só o volume sobrevive.
    configurarRitmoNoBanco({ agora: () => relogio, banco: bancoDeTeste(cliente) });

    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(false);
  });

  it("a virada da hora NÃO é porta: a janela anterior ainda conta", async () => {
    for (let i = 0; i < 200; i++) await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    relogio += 3_600_001;
    // Janela fixa pura deixaria passar 2× o teto aqui (200 às 10h59 + 200 às
    // 11h01). Somar a janela anterior é o que fecha essa porta.
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(false);
  });

  it("duas reservas SIMULTÂNEAS na fronteira não passam as duas", async () => {
    for (let i = 0; i < 199; i++) await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    const [a, b] = await Promise.all([
      reservarNaJanelaDoBanco(CHAVE, 1, 200),
      reservarNaJanelaDoBanco(CHAVE, 1, 200),
    ]);
    // Uma sim, uma não. O teste vai dentro do WHERE do UPDATE: o banco decide.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await retratoNoBanco(CHAVE)).gastas).toBe(200);
  });

  it("FAIL-CLOSED: contador fora do ar NEGA, não libera", async () => {
    configurarRitmoNoBanco({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("banco fora"); },
        consultar: async () => { throw new Error("banco fora"); },
      },
    });
    const r = await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("banco");
      expect(r.frase).toMatch(/NÃO falei com a Meta|não consegui contabilizar/i);
    }
  });
});

describe("o freio — o castigo que sobrevive ao deploy", () => {
  it("freada, a chave para de falar com a Meta e o motivo chega em português", async () => {
    await frearChaveNoBanco(CHAVE, 300, "a Meta recusou por limite de volume (código 4)");
    const r = await reservarNaJanelaDoBanco(CHAVE, 1, 200);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("freio");
      expect(r.frase).toMatch(/limite de volume/);
    }
  });

  it("o freio só ESTENDE — um castigo curto não encurta um longo já gravado", async () => {
    await frearChaveNoBanco(CHAVE, 3_600, "longo");
    await frearChaveNoBanco(CHAVE, 60, "curto");
    expect((await retratoNoBanco(CHAVE)).freadaPorSegundos).toBeGreaterThan(3_000);
  });

  it("passado o tempo, o freio solta sozinho — castigo não é banimento", async () => {
    await frearChaveNoBanco(CHAVE, 300, "limite");
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(false);
    relogio += 301_000;
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(true);
  });

  it("a reconexão pode soltar o freio — token novo não herda castigo do velho", async () => {
    await frearChaveNoBanco(CHAVE, 3_600, "limite");
    await limparFreioNoBanco(CHAVE);
    expect((await reservarNaJanelaDoBanco(CHAVE, 1, 200)).ok).toBe(true);
  });

  it("gravar o freio NUNCA lança, nem com o banco fora do ar", async () => {
    configurarRitmoNoBanco({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("banco fora"); },
        consultar: async () => { throw new Error("banco fora"); },
      },
    });
    // Falhar ao gravar o castigo não pode derrubar a chamada que já falhou.
    await expect(frearChaveNoBanco(CHAVE, 300, "limite")).resolves.toBeUndefined();
  });
});

describe("o cache no volume — FAIL-OPEN de propósito", () => {
  it("guarda e devolve; e some quando a validade passa", async () => {
    await guardarNoCacheNoBanco("leitura:x", { posts: [1, 2] }, 600_000);
    expect(await lerDoCacheNoBanco<{ posts: number[] }>("leitura:x")).toEqual({ posts: [1, 2] });
    relogio += 600_001;
    expect(await lerDoCacheNoBanco("leitura:x")).toBeNull();
  });

  it("um processo novo aproveita o que o anterior já pagou", async () => {
    await guardarNoCacheNoBanco("leitura:y", { alcance: 42 }, 600_000);
    configurarRitmoNoBanco({ agora: () => relogio, banco: bancoDeTeste(cliente) });
    expect(await lerDoCacheNoBanco<{ alcance: number }>("leitura:y")).toEqual({ alcance: 42 });
  });

  it("limpar por prefixo não leva o cache do vizinho junto", async () => {
    await guardarNoCacheNoBanco("leitura:a", 1, 600_000);
    await guardarNoCacheNoBanco("desempenho:a", 2, 600_000);
    await limparCacheNoBanco("leitura:");
    expect(await lerDoCacheNoBanco("leitura:a")).toBeNull();
    expect(await lerDoCacheNoBanco("desempenho:a")).toBe(2);
  });

  it("banco fora do ar vira MISS, não erro — quem trava é o contador", async () => {
    configurarRitmoNoBanco({
      agora: () => relogio,
      banco: {
        executar: async () => { throw new Error("banco fora"); },
        consultar: async () => { throw new Error("banco fora"); },
      },
    });
    expect(await lerDoCacheNoBanco("leitura:z")).toBeNull();
    await expect(guardarNoCacheNoBanco("leitura:z", 1, 600_000)).resolves.toBeUndefined();
  });
});
