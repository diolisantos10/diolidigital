// A VITRINE NÃO PROMETE ACIMA DO QUE A CASA ENTREGA — a catraca.
//
// ═══ O ACHADO (25/08/2026) ══════════════════════════════════════════════════
//
// Fechando o case Farol 27 ficou à vista um buraco maior que o conserto: a
// tabela de planos anuncia de 2,8× a 13,3× o que a produção entrega num mês.
//
// A casa faz UMA passada por mês (`mes.ts::virarOsMesesVencidos` marca o
// projeto `pending`; `despertador.ts::retomarProducao` roda UM
// `runProjectExecution`; não há segunda passada agendada em lugar nenhum), e
// a passada tem teto de `TETO_DE_PECAS_POR_ENTREGA` peças.
//
// É a mesma família de um defeito que esta casa já registrou como decisão —
// **vitrine é promessa; promessa sem produtor é dívida.** Lá era vender o que
// não se produz; aqui é vender MAIS do que se produz. O dano é o mesmo: o
// cliente assina uma coisa e recebe outra, e a casa descobre na entrega.
//
// ═══ POR QUE ESTE TESTE NÃO EXIGE ZERO HOJE ═════════════════════════════════
//
// Exigir zero agora obrigaria a baixar o Premium — "operação de marca
// completa" — para 12 peças/mês, o que não conserta nada: destrói o produto.
// O conserto certo é quase certamente a PRODUÇÃO entregar mais, e isso mexe em
// custo e capacidade: é decisão do CEO, não de quem escreve o código. Está
// escalado.
//
// Então a catraca segura o tamanho da dívida no lugar. Ela gira para um lado
// só: piorar quebra, criar plano novo acima do teto quebra, e melhorar também
// quebra — pedindo para baixar o número declarado, porque dívida paga tem de
// sair do registro. O que ela impede é a única coisa que não se pode admitir
// duas vezes: a dívida crescer em silêncio, que é exatamente como esta nasceu.

import { describe, it, expect } from "vitest";
import { SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";
import {
  LIMITES_POR_FORMATO, DIVIDA_DA_VITRINE, ENTREGAS_POR_MES,
} from "@/lib/agency/contrato-de-quantidade";
import { TETO_DE_PECAS_POR_ENTREGA } from "@/lib/agency/execution/escopo-do-cliente";

/** O que a casa entrega num mês, pelo que o código faz. */
const TETO_MENSAL = TETO_DE_PECAS_POR_ENTREGA * ENTREGAS_POR_MES;

/** O que o plano anuncia por mês. A mesma conta que a descrição dele mostra. */
const prometidoPorMes = (p: (typeof SOCIAL_PACKAGES)[number]) =>
  p.postsPerWeek * 4 + p.storiesPerWeek * 4 + p.reelsPerMonth;

describe("a medição, para ninguém ter de refazê-la de cabeça", () => {
  it("a casa faz UMA passada por mês, e a passada tem teto de 12 peças", () => {
    expect(ENTREGAS_POR_MES).toBe(1);
    expect(TETO_MENSAL).toBe(12);
  });
});

describe("a catraca: nenhum plano promete MAIS do que já está declarado", () => {
  for (const p of SOCIAL_PACKAGES) {
    it(`${p.id}: a dívida declarada é a dívida real`, () => {
      const declarada = DIVIDA_DA_VITRINE[p.id];
      expect(
        declarada,
        `O plano "${p.id}" não está no registro DIVIDA_DA_VITRINE. Plano novo ` +
        `precisa caber em ${TETO_MENSAL} peças/mês — ou entrar no registro com ` +
        "o número medido, e aí a dívida da casa cresceu e alguém tem de saber.",
      ).toBeDefined();

      const real = prometidoPorMes(p);
      expect(
        real,
        `"${p.id}" promete ${real} peças/mês e o registro diz ${declarada}. ` +
        (real > (declarada ?? 0)
          ? "A dívida CRESCEU — a vitrine passou a prometer mais do que já prometia, e a casa continua entregando 12."
          : "A dívida DIMINUIU — ótimo, e o número declarado tem de descer junto: catraca só gira para um lado."),
      ).toBe(declarada);
    });
  }

  it("plano NOVO acima do teto quebra o build — a dívida não cresce em silêncio", () => {
    const planoNovo = { id: "hipotetico", postsPerWeek: 4, storiesPerWeek: 4, reelsPerMonth: 4 };
    const cabe = prometidoPorMes(planoNovo as never) <= TETO_MENSAL;
    const registrado = DIVIDA_DA_VITRINE[planoNovo.id] !== undefined;
    // É esta conjunção que o teste acima aplica a cada plano de verdade.
    expect(cabe || registrado).toBe(false);
  });
});

describe("por formato é pior que no total, e o registro não pode esconder isso", () => {
  it("nenhum plano cabe na mistura por formato — medido, para o CEO decidir com número", () => {
    const estouros = SOCIAL_PACKAGES.map((p) => ({
      plano: p.id,
      feed: p.postsPerWeek * 4 / LIMITES_POR_FORMATO.feed[1],
      story: p.storiesPerWeek * 4 / LIMITES_POR_FORMATO.story[1],
    }));
    // Todos estouram. Se um dia algum couber, este teste quebra e manda
    // atualizar o registro — inclusive para melhor.
    expect(estouros.every((e) => e.feed > 1 && e.story > 1)).toBe(true);
    // O pior deles, nomeado: o Premium promete 20× o teto de feed por passada.
    expect(Math.max(...estouros.map((e) => e.feed))).toBe(20);
  });
});
