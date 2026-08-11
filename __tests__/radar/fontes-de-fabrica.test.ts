// As fontes do Radar que vêm de fábrica.
//
// ── O DEFEITO QUE ISTO FECHA (11/08/2026) ───────────────────────────────────
//
// A lista nascia vazia e só ligava se alguém colasse um JSON em `RADAR_SOURCES`.
// Ninguém colou. A tela de mercado da casa mostrava **o que um modelo lembrava**
// em vez do que as plataformas publicaram — e ninguém percebeu, porque a tela
// não fica vazia quando isso acontece: ela fica plausível.
//
// **Mecanismo que depende de um humano colar configuração é mecanismo
// desligado.** Este arquivo existe para ele não voltar a nascer desligado.

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getConfiguredSources } from "@/lib/agency/radar/sources";

const ORIGINAL = process.env.RADAR_SOURCES;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.RADAR_SOURCES;
  else process.env.RADAR_SOURCES = ORIGINAL;
});

describe("o Radar não nasce mudo", () => {
  it("sem variável de ambiente, ainda existem fontes", () => {
    delete process.env.RADAR_SOURCES;
    const fontes = getConfiguredSources();
    expect(fontes.length, "o Radar voltou a nascer sem fonte nenhuma — a tela de mercado volta a mostrar memória de modelo").toBeGreaterThan(0);
  });

  it("cobre os domínios que a agência vende", () => {
    delete process.env.RADAR_SOURCES;
    const dominios = new Set(getConfiguredSources().map((f) => f.domain));
    expect(dominios).toContain("social");
    expect(dominios).toContain("paid-traffic");
  });

  it("toda fonte de fábrica tem forma válida", () => {
    delete process.env.RADAR_SOURCES;
    for (const f of getConfiguredSources()) {
      expect(f.name.length, "fonte sem nome").toBeGreaterThan(2);
      expect(f.url.startsWith("https://"), `${f.name} não é https`).toBe(true);
      expect(typeof f.official).toBe("boolean");
    }
  });
});

describe("quem não é plataforma não entra como oficial", () => {
  it("imprensa especializada é marcada NÃO oficial — o que sai dela vai para validação", () => {
    // `official: true` faz o insight entrar ATIVO, sem humano no meio. Carimbar
    // um blog de terceiro como oficial transformaria opinião em diretriz da casa.
    delete process.env.RADAR_SOURCES;
    const sej = getConfiguredSources().find((f) => /search engine journal/i.test(f.name));
    expect(sej).toBeTruthy();
    expect(sej!.official).toBe(false);
  });

  it("as oficiais são domínios de plataforma, não agregadores", () => {
    delete process.env.RADAR_SOURCES;
    for (const f of getConfiguredSources().filter((f) => f.official)) {
      expect(
        /(^|\.)(fb\.com|facebook\.com|blog\.google|blog\.youtube|instagram\.com|tiktok\.com)/.test(new URL(f.url).hostname),
        `${f.name} está marcada oficial mas o domínio não é de plataforma: ${f.url}`,
      ).toBe(true);
    }
  });
});

describe("a variável de ambiente continua mandando", () => {
  it("RADAR_SOURCES substitui a lista de fábrica por inteiro", () => {
    process.env.RADAR_SOURCES = JSON.stringify([
      { name: "Só essa", domain: "social", url: "https://exemplo.com/rss", official: false },
    ]);
    const fontes = getConfiguredSources();
    expect(fontes).toHaveLength(1);
    expect(fontes[0]!.name).toBe("Só essa");
  });

  it("lista vazia EXPLÍCITA desliga — desligar é dizer, não omitir", () => {
    process.env.RADAR_SOURCES = "[]";
    expect(getConfiguredSources()).toHaveLength(0);
  });

  it("JSON quebrado NÃO derruba o Radar", () => {
    process.env.RADAR_SOURCES = "{isso não é json";
    expect(() => getConfiguredSources()).not.toThrow();
  });
});

// ── AS DUAS REPROVADAS ──────────────────────────────────────────────────────
//
// TikTok e Instagram devolvem **HTTP 200 com HTML** nos endereços de feed mais
// óbvios. É a pior resposta possível: parece viva e rende zero item. Quem for
// "consertar o Radar" adicionando as duas vai esbarrar neste teste primeiro.

describe("as fontes reprovadas na conferência de 11/08 não voltam por distração", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "lib/agency/radar/sources.ts"), "utf8");

  it("nenhuma delas está na lista de fábrica", () => {
    delete process.env.RADAR_SOURCES;
    for (const morta of ["newsroom.tiktok.com", "about.instagram.com"]) {
      expect(
        getConfiguredSources().some((f) => f.url.includes(morta)),
        `${morta} voltou para a lista. Ela responde 200 com HTML — abra o CORPO da resposta antes de adicionar`,
      ).toBe(false);
    }
  });

  it("e o motivo da reprovação continua escrito no arquivo", () => {
    // Apagar o registro faria a próxima pessoa repetir a conferência do zero —
    // ou, pior, confiar no código de resposta.
    expect(SRC).toContain("newsroom.tiktok.com");
    expect(SRC).toContain("HTML");
  });
});
