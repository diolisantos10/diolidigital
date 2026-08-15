// O POST SIMPLES PASSA A OBEDECER O CÉREBRO DA MARCA.
//
// ── O DEFEITO, MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// `repertorio-registrado.ts` declara, para o CityJobs:
//
//     { id: "post-simples-de-feed", composicoesPermitidas: ["dividido-reto"] }
//
// com o comentário escrito no registro: foto-cheia "viraria a mesma peça 60
// vezes por mês". A regra existia, estava escrita, e **não valia**:
// `composicaoParaFuncao` só era chamada em `artes.ts` (duas vezes) e
// `recompor-carrossel.ts` — os três são CARROSSEL. O post simples caía no
// `peca.composicao ?? "foto-cheia"` de `molde.ts:534`. Exatamente a proibida,
// 60 vezes por mês, no formato que o cliente comprou.
//
// É a doença que esta casa já nomeou: regra escrita que não atravessa a porta.

import { describe, it, expect } from "vitest";
import { cerebroDoCityJobs, cerebroDaFoocci } from "@/lib/agency/design/repertorio-registrado";
import {
  composicaoDoPostSimples,
  funcaoDeclaradaParaPilar,
  cerebroVazio,
  ID_DO_POST_SIMPLES,
} from "@/lib/agency/design/repertorio";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const CITYJOBS = cerebroDoCityJobs().cerebro;

describe("o pilar resolve o papel — contra o repertório da marca, nunca inventado", () => {
  it('"Bastidor da região" casa com a função "bastidor" que o CityJobs declarou', () => {
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "Bastidor da região")).toBe("bastidor");
  });

  it('"Institucional — vaga validada" casa com "institucional"', () => {
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "Institucional — vaga validada")).toBe("institucional");
  });

  it("acento e caixa não decidem nada", () => {
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "CHAMADA DE COMUNIDADE")).toBe("comunidade");
  });

  it("pilar que não casa com nada devolve null — a agência não inventa papel", () => {
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "vagas por setor")).toBeNull();
    expect(funcaoDeclaradaParaPilar(CITYJOBS, null)).toBeNull();
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "   ")).toBeNull();
  });

  it("não casa por pedaço de palavra — 'dicas' não é 'dica' partido ao meio", () => {
    // A régua é palavra inteira. Sem isso, "comunidade" casaria dentro de
    // "incomunidade" e o layout viria de um papel que ninguém declarou.
    expect(funcaoDeclaradaParaPilar(CITYJOBS, "pré-dicado")).toBeNull();
  });
});

describe("a composição do post simples respeita o que o formato permite", () => {
  it("pilar coberto pelo repertório: sai a composição da entrada registrada", () => {
    const e = composicaoDoPostSimples(CITYJOBS, "Bastidor da região");
    expect(e.composicao).toBe("dividido-reto");
    expect(e.origem).toBe("repertorio");
    expect(e.fonte).toBe("bastidor-da-regiao");
  });

  it("pilar NÃO coberto: cai na primeira PERMITIDA — nunca na proibida", () => {
    // Este é o caso que produzia o defeito. Antes: foto-cheia. Agora:
    // dividido-reto, com o motivo declarado.
    const e = composicaoDoPostSimples(CITYJOBS, "vagas por setor");
    expect(e.composicao).toBe("dividido-reto");
    expect(e.origem).toBe("formato");
    expect(e.porque).toContain("post-simples-de-feed");
  });

  it("SEM pilar nenhum: continua respeitando o formato", () => {
    // O caso mais perigoso, e o mais comum antes de 15/08 — o pilar era sempre
    // nulo na esteira automática (ver `pilar-obrigatorio.test.ts`).
    const e = composicaoDoPostSimples(CITYJOBS, null);
    expect(e.composicao).toBe("dividido-reto");
    expect(e.origem).toBe("formato");
  });

  it("foto-cheia NUNCA sai para o CityJobs — é a que o registro proíbe", () => {
    const pilares = [
      "Bastidor da região", "Institucional — vaga validada", "vagas por setor",
      "dica para candidato", "chamada de comunidade", "salário aberto", null, "",
    ];
    for (const p of pilares) {
      expect(composicaoDoPostSimples(CITYJOBS, p).composicao).not.toBe("foto-cheia");
    }
  });

  it("marca SEM formato registrado continua em foto-cheia — nada muda de cara sozinho", () => {
    const vazio = cerebroVazio("Padaria do João");
    const e = composicaoDoPostSimples(vazio, "Produto");
    expect(e.composicao).toBe("foto-cheia");
    expect(e.origem).toBe("padrao-da-casa");
  });

  it("a Foocci, que registra três composições permitidas, não é forçada à do CityJobs", () => {
    const foocci = cerebroDaFoocci().cerebro;
    const e = composicaoDoPostSimples(foocci, "um pilar que ela não declarou");
    // Ou o formato dela não existe (padrão da casa), ou sai uma das DELA.
    if (e.origem === "formato") {
      const formato = foocci.formatos.find((f) => f.id === ID_DO_POST_SIMPLES)!;
      expect(formato.composicoesPermitidas).toContain(e.composicao);
    } else {
      expect(e.origem).toBe("padrao-da-casa");
    }
  });
});

describe("a escolha está no caminho vivo do post simples — não basta a função existir", () => {
  const FONTE = readFileSync(join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");
  const corpo = FONTE.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

  it("`produzirArtesPendentes` chama `composicaoDoPostSimples` e passa o resultado ao molde", () => {
    expect(corpo).toMatch(/composicaoDoPostSimples\(marca\.cerebro,\s*post\.pillar\)/);
    expect(corpo).toMatch(/composicao:\s*escolhaDaComposicao\.composicao/);
  });
});
