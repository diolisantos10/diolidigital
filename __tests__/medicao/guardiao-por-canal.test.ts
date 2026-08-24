// TODO CANAL TEM GUARDIÃO — e canal sem teto não gasta.
//
// O case Farol 27 mediu: a Meta tinha guardião e ele funcionava (recusou R$ 900
// contra um teto de R$ 150 antes de qualquer chamada de rede); o TikTok não
// tinha nenhum, e o motor de tráfego já alocava verba para ele.
//
// A metade mais importante deste arquivo é a do ZERO. Em outro produto desta
// casa, "teto padrão 0" foi lido como "sem limite" — o oposto. Aqui zero é
// zero, e há teste para cada porta por onde o oposto poderia entrar.

import { describe, it, expect } from "vitest";
import {
  GUARDIOES, CANAIS_COM_GUARDIAO, conferirVerbaDoCanal, guardiaoDoCanal,
  tetoDoAmbiente, PISO_DIARIO_BRL, type CanalDeMidia,
} from "@/lib/integrations/midia/guardioes";
import { conferirOrcamento } from "@/lib/integrations/meta/ads";

describe("o guardião da Meta continua fazendo o que fazia", () => {
  it("O CASO DO CASE: R$ 900 contra teto de R$ 150 é recusado, sem tocar em rede", () => {
    const r = conferirVerbaDoCanal({ canal: "meta_ads", orcamentoDiarioBRL: 900, tetoAprovadoBRL: 150 });
    expect(r.liberado).toBe(false);
    expect(r.motivo).toBe("passa_do_teto_do_cliente");
    expect(r.escalaPara).toMatch(/CEO/);
  });

  it("`conferirOrcamento` da Meta agora É o guardião do canal — mesma resposta", () => {
    expect(conferirOrcamento({ orcamentoDiarioBRL: 900, tetoAprovadoBRL: 150 }).ok).toBe(false);
    expect(conferirOrcamento({ orcamentoDiarioBRL: 30, tetoAprovadoBRL: 50 }).ok).toBe(true);
  });
});

describe("canal sem guardião não recebe verba", () => {
  it("canal fora do registro é recusado, e a frase diz onde declarar", () => {
    const r = conferirVerbaDoCanal({ canal: "pinterest_ads", orcamentoDiarioBRL: 10, tetoAprovadoBRL: 100 });
    expect(r.liberado).toBe(false);
    expect(r.motivo).toBe("canal_sem_guardiao");
    expect(r.erro).toContain("guardioes.ts");
  });

  it("nome vazio, nulo ou objeto não vira canal genérico", () => {
    for (const nome of ["", "   ", "META_ADS", "meta", "__proto__", "toString"]) {
      expect(conferirVerbaDoCanal({ canal: nome, orcamentoDiarioBRL: 10, tetoAprovadoBRL: 100 }).liberado).toBe(false);
    }
    expect(guardiaoDoCanal(undefined)).toBeNull();
  });
});

describe("ZERO SIGNIFICA ZERO — a regra que outro produto leu ao contrário", () => {
  it("o TikTok, sem teto configurado, não gasta um centavo", () => {
    expect(GUARDIOES.tiktok_ads.tetoDiarioBRL).toBe(0);
    const r = conferirVerbaDoCanal({ canal: "tiktok_ads", orcamentoDiarioBRL: 10, tetoAprovadoBRL: 1000 });
    expect(r.liberado).toBe(false);
    expect(r.motivo).toBe("canal_sem_teto");
    expect(r.erro).toContain("ZERO significa ZERO");
  });

  it("nem um orçamento minúsculo passa por um teto zero", () => {
    for (const v of [0.01, 1, PISO_DIARIO_BRL, 1_000_000]) {
      expect(conferirVerbaDoCanal({ canal: "google_ads", orcamentoDiarioBRL: v, tetoAprovadoBRL: 10_000 }).motivo)
        .toBe("canal_sem_teto");
    }
  });

  it("o teto zero é decidido ANTES de qualquer comparação numérica", () => {
    // Se o zero fosse comparado como número, um orçamento negativo "caberia"
    // nele (-5 <= 0) e a recusa sairia como `orcamento_invalido`. A ordem é
    // parte da trava: o motivo tem de ser `canal_sem_teto`.
    expect(conferirVerbaDoCanal({ canal: "tiktok_ads", orcamentoDiarioBRL: -5, tetoAprovadoBRL: 100 }).motivo)
      .toBe("canal_sem_teto");
  });

  it("variável de ambiente ilegível vira ZERO, nunca permissão", () => {
    for (const bruto of [undefined, "", "   ", "abc", "NaN", "-100", "0", "Infinity", "sem limite"]) {
      expect(tetoDoAmbiente(bruto)).toBe(0);
    }
    expect(tetoDoAmbiente("150")).toBe(150);
  });
});

describe("integração de escrita: teto configurado não inventa caminho", () => {
  it("canal com teto mas sem escrita implementada é recusado quando se exige escrita", () => {
    const r = conferirVerbaDoCanal({
      canal: "linkedin_ads", orcamentoDiarioBRL: 50, tetoAprovadoBRL: 100,
      exigirIntegracaoDeEscrita: true,
    });
    expect(r.liberado).toBe(false);
  });
});

describe("TESTE DE CLASSE — o próximo canal sem guardião quebra o build", () => {
  it("todo canal de `TrafficChannel` tem guardião declarado, com teto próprio", () => {
    // O `Record<CanalDeMidia, Guardiao>` já barra no compilador; esta metade
    // cobre a fuga de tipo (`as`, `@ts-expect-error`) e afirma sobre o conteúdo.
    for (const canal of CANAIS_COM_GUARDIAO) {
      const g = GUARDIOES[canal];
      expect(g.canal).toBe(canal);
      expect(g.rotulo.length).toBeGreaterThan(0);
      expect(g.variavelDeAmbiente).toMatch(/^ADS_TETO_DIARIO/);
      expect(Number.isFinite(g.tetoDiarioBRL)).toBe(true);
      expect(g.tetoDiarioBRL).toBeGreaterThanOrEqual(0);
      expect(g.escalaPara.length).toBeGreaterThan(0);
    }
  });

  it("nenhum canal `*_ads` citado no código-fonte fica fora do registro", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const RAIZ = process.cwd();

    function arquivos(dir: string, saida: string[] = []): string[] {
      for (const nome of readdirSync(dir)) {
        if (nome === "node_modules" || nome === "generated" || nome.startsWith(".")) continue;
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
        else if (/\.tsx?$/.test(nome)) saida.push(caminho);
      }
      return saida;
    }

    const orfaos = new Map<string, string>();
    for (const pasta of ["lib", "app", "components"]) {
      for (const arq of arquivos(join(RAIZ, pasta))) {
        if (arq.includes("integrations/midia/guardioes.ts")) continue;
        const texto = readFileSync(arq, "utf8");
        // Um canal é UMA palavra antes de `_ads` ("tiktok_ads"). Escopos de
        // permissão da Meta ("pages_manage_ads") e ids de cenário de
        // treinamento ("…_social_ads") têm mais de um trecho e não são canais —
        // varrer sem essa borda transforma o teste em ruído, e teste ruidoso é
        // teste que alguém desliga.
        for (const m of texto.matchAll(/["'`]([a-z0-9]+_ads)["'`]/g)) {
          const canal = m[1]!;
          if (CANAIS_COM_GUARDIAO.includes(canal as CanalDeMidia)) continue;
          orfaos.set(canal, arq.slice(RAIZ.length + 1));
        }
      }
    }

    expect(
      [...orfaos].map(([c, a]) => `${c} (${a})`),
      "canal de mídia citado no código sem guardião de verba declarado em lib/integrations/midia/guardioes.ts",
    ).toEqual([]);
  });
});
