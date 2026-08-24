// O PREÇO QUE O SDR FALA VEM DA FONTE — não de uma cópia digitada à mão.
//
// ─── O QUE FOI MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// `TABELA_DE_PISO` (`lib/agency/comercial/negociacao.ts`) guardava uma CÓPIA dos
// preços: Ritmo 297, Presença 790, Conteúdo 1390, Crescimento 2590, mais os
// cinco itens do balcão. Os números batiam com a fonte — mas batiam por SORTE.
// Nada os obrigava a bater.
//
// E a cópia não era decorativa. É `TABELA_DE_PISO[k].cheio` que
// `comercial/qualificar.ts` injeta no prompt do agente comercial: era a CÓPIA
// que dizia o preço ao prospect, não a fonte.
//
// A medida, feita por mutação e desfeita em seguida: trocar `cheio: 297` por
// `cheio: 349` deixava a casa INTEIRA verde —
//   • `preco-uma-fonte-so.test.ts`  → 7/7 passa
//   • `__tests__/comercial` inteiro → 120/120 passa
//   • `esteira/negociacao` + `marketplaces/a-junta-do-caminho-vivo` → 64/64 passa
// ou seja, 184 testes verdes com o plano valendo R$ 297 e o SDR cotando R$ 349.
// Nenhum teste da casa importava `planos` e `negociacao` ao mesmo tempo.
//
// O conserto NÃO foi sincronizar as duas cópias — foi ELIMINAR uma: `cheio`
// passou a ser lido de `PLANOS` e de `SELF_SERVE_CATALOG`. Este arquivo é a
// trava que impede alguém de redigitar de novo.
//
// ─── O QUE ESTE PORTÃO **NÃO** COBRE, E É DE PROPÓSITO ───────────────────────
//
// Existe no código uma SEGUNDA família de cinco planos — `SOCIAL_PACKAGES`
// (`lib/agency/live-calculator.ts`): Essencial / Starter / Growth / Pro /
// Premium, de R$ 600 a R$ 6.500, com reels inclusos na mensalidade. Nenhum dos
// cinco nomes ou preços existe em `docs/precos.md`, e é ELA que alimenta o
// briefing público, a estimativa na tela do prospect e a proposta.
//
// Isso NÃO ganhou trava aqui, e a razão é honesta: reprovar a build hoje não
// daria a ninguém como consertar. Escolher qual das duas famílias vale é
// escolher um preço, e preço é decisão do CEO. O levantamento lado a lado está
// em `docs/comercial/preco-lado-a-lado-15-08.md`. Portão que só pode ficar
// vermelho não é portão, é refém.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PLANOS } from "@/lib/agency/planos";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { TABELA_DE_PISO, FAIXAS, type ItemNegociavel } from "@/lib/agency/comercial/negociacao";

const DOC = path.join(process.cwd(), "docs/precos.md");

/** Os itens do balcão que a régua de negociação espelha, e de qual id. */
const BALCAO: Array<[ItemNegociavel, string]> = [
  ["post", "balcao-post-feed"],
  ["carrossel", "balcao-carrossel-5"],
  ["stories", "balcao-4-stories"],
  ["copy", "balcao-legenda"],
  ["auditoria", "balcao-auditoria-perfil"],
];

/** Os planos que a régua de negociação espelha. Pulso não entra: não se negocia. */
const PLANOS_NEGOCIAVEIS: Array<[ItemNegociavel, string]> = [
  ["ritmo", "ritmo"],
  ["presenca", "presenca"],
  ["conteudo", "conteudo"],
  ["crescimento", "crescimento"],
];

/**
 * O COMPARADOR. Recebe a tabela em vez de ler a global, para que a metade que
 * PROVA a proteção possa alimentá-lo com uma tabela adulterada.
 *
 * Devolve a lista de divergências. Vazia = as duas fontes dizem o mesmo.
 */
function divergencias(tabela: Record<string, { cheio: number; piso: number }>): string[] {
  const problemas: string[] = [];

  for (const [item, planoId] of PLANOS_NEGOCIAVEIS) {
    const plano = PLANOS.find((p) => p.id === planoId)!;
    const linha = tabela[item];
    if (linha.cheio !== plano.preco) {
      problemas.push(`"${item}": PLANOS diz R$ ${plano.preco}, a régua do SDR diz R$ ${linha.cheio}`);
    }
  }

  for (const [item, catalogoId] of BALCAO) {
    const doCatalogo = SELF_SERVE_CATALOG.find((s) => s.id === catalogoId)!;
    const linha = tabela[item];
    if (linha.cheio !== doCatalogo.price) {
      problemas.push(`"${item}": o balcão diz R$ ${doCatalogo.price}, a régua do SDR diz R$ ${linha.cheio}`);
    }
    if (linha.piso !== doCatalogo.precoMinimo) {
      problemas.push(`"${item}": piso do balcão é R$ ${doCatalogo.precoMinimo}, a régua diz R$ ${linha.piso}`);
    }
  }

  return problemas;
}

describe("o preço que o SDR fala vem da fonte", () => {
  // ── METADE 1: BARRA O PROBLEMA PLANTADO ──────────────────────────────────
  // Esta metade é o que faltava no portão de 08/08: lá, a "prova" de que a
  // divergência seria pega comparava dois literais escritos no próprio teste
  // (397 !== 297) e não tocava no comparador de verdade. Aqui o comparador
  // REAL recebe uma tabela adulterada.
  describe("BARRA a divergência", () => {
    it("pega o preço de PLANO redigitado — o caso medido em 15/08 (297 → 349)", () => {
      const adulterada = {
        ...TABELA_DE_PISO,
        ritmo: { ...TABELA_DE_PISO.ritmo, cheio: 349 },
      };
      const achados = divergencias(adulterada);
      expect(achados.length).toBeGreaterThan(0);
      expect(achados.join(" | ")).toContain("ritmo");
      expect(achados.join(" | ")).toContain("349");
    });

    it("pega o preço de BALCÃO redigitado", () => {
      const adulterada = {
        ...TABELA_DE_PISO,
        carrossel: { ...TABELA_DE_PISO.carrossel, cheio: 199 },
      };
      expect(divergencias(adulterada).join(" | ")).toContain("carrossel");
    });

    it("pega o PISO do balcão redigitado — piso frouxo é desconto sem chão", () => {
      const adulterada = {
        ...TABELA_DE_PISO,
        post: { ...TABELA_DE_PISO.post, piso: 5 },
      };
      expect(divergencias(adulterada).join(" | ")).toContain("piso");
    });
  });

  // ── METADE 2: NÃO INVENTA PROBLEMA NO CASO LIMPO ─────────────────────────
  describe("NÃO acusa divergência onde não há", () => {
    it("a régua de negociação, como está, não diverge de nenhuma fonte", () => {
      expect(divergencias(TABELA_DE_PISO)).toEqual([]);
    });

    it("os ids que a régua espelha EXISTEM nas fontes — id errado não vira preço 0", () => {
      for (const [, planoId] of PLANOS_NEGOCIAVEIS) {
        expect(PLANOS.some((p) => p.id === planoId), `plano "${planoId}" sumiu de PLANOS`).toBe(true);
      }
      for (const [, catalogoId] of BALCAO) {
        expect(
          SELF_SERVE_CATALOG.some((s) => s.id === catalogoId),
          `item "${catalogoId}" sumiu de SELF_SERVE_CATALOG`,
        ).toBe(true);
      }
    });
  });

  // ── A PROSA TAMBÉM CARREGA PREÇO, E ELA VAI PARA O PROMPT ────────────────
  // `principal`, `alternativa` e `versaoMenor` são o que o SDR FALA. Um preço
  // velho aí é tão caro quanto um preço velho no campo numérico — e mais
  // difícil de ver, porque está no meio de uma frase.
  describe("nenhum preço de plano na PROSA está desatualizado", () => {
    const precosValidos = new Set(PLANOS.map((p) => p.preco));

    /** "R$ 1.390" → 1390 */
    function numeros(texto: string): number[] {
      return [...texto.matchAll(/R\$\s*([\d.]+)/g)].map((m) => Number(m[1].replace(/\./g, "")));
    }

    it("as frases da tabela de piso citam só preços que existem em PLANOS", () => {
      for (const [id, linha] of Object.entries(TABELA_DE_PISO)) {
        for (const n of numeros(linha.versaoMenor)) {
          expect(
            precosValidos.has(n),
            `"${id}".versaoMenor cita R$ ${n}, que não é preço de nenhum plano atual`,
          ).toBe(true);
        }
      }
    });

    it("as ofertas por faixa citam só preços que existem em PLANOS", () => {
      for (const faixa of FAIXAS) {
        for (const campo of ["principal", "alternativa"] as const) {
          for (const n of numeros(faixa[campo])) {
            expect(
              precosValidos.has(n),
              `faixa "${faixa.faixa}".${campo} cita R$ ${n}, que não é preço de nenhum plano atual`,
            ).toBe(true);
          }
        }
      }
    });
  });

  // ── O PISO DOS PLANOS SÓ EXISTE AQUI — e o documento tem que concordar ────
  // O piso não está em `PLANOS` (tabela pública) nem em nenhum outro módulo.
  // `TABELA_DE_PISO` é a única declaração executável dele; `docs/precos.md` o
  // explica em prosa. Prosa que descreve um número não muda quando o número
  // muda — por isso os dois são comparados.
  describe("o piso dos planos: código e documento dizem o mesmo", () => {
    /** A frase do documento: "…descer até ele — Ritmo R$ 229, Presença R$ 690, …" */
    function pisosDoDocumento(): Record<string, number> {
      const texto = readFileSync(DOC, "utf8");
      const marco = texto.indexOf("mensalidade pode descer até ele");
      expect(marco, "a frase que declara os pisos sumiu de docs/precos.md").toBeGreaterThan(-1);
      const trecho = texto.slice(marco, marco + 400);
      const saida: Record<string, number> = {};
      for (const [, nome, valor] of trecho.matchAll(/(Ritmo|Presença|Conteúdo|Crescimento)\s+R\$\s*([\d.]+)/g)) {
        saida[nome] = Number(valor.replace(/\./g, ""));
      }
      return saida;
    }

    it("o documento declara os quatro pisos e o portão consegue lê-los", () => {
      // Portão que devolve {} quando não entende o documento passaria a aprovar
      // tudo em silêncio. Melhor quebrar alto.
      expect(Object.keys(pisosDoDocumento()).sort()).toEqual(
        ["Conteúdo", "Crescimento", "Presença", "Ritmo"],
      );
    });

    it("cada piso do documento é o piso do código", () => {
      const doDoc = pisosDoDocumento();
      const porNome: Record<string, ItemNegociavel> = {
        Ritmo: "ritmo",
        Presença: "presenca",
        Conteúdo: "conteudo",
        Crescimento: "crescimento",
      };
      for (const [nome, valor] of Object.entries(doDoc)) {
        expect(
          TABELA_DE_PISO[porNome[nome]].piso,
          `piso de "${nome}": docs/precos.md diz R$ ${valor}, negociacao.ts diz R$ ${TABELA_DE_PISO[porNome[nome]].piso}`,
        ).toBe(valor);
      }
    });

    it("nenhum piso é maior ou igual ao preço cheio — piso assim desliga a régua", () => {
      for (const [, planoId] of PLANOS_NEGOCIAVEIS) {
        const linha = TABELA_DE_PISO[planoId as ItemNegociavel];
        expect(linha.piso, `"${planoId}": piso R$ ${linha.piso} não é menor que o cheio R$ ${linha.cheio}`)
          .toBeLessThan(linha.cheio);
      }
    });
  });
});
