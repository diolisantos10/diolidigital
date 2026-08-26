// A CASA GRITA ENQUANTO AS DUAS TABELAS DE PREÇO ESTIVEREM VIVAS.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE TESTE É, E O QUE ELE NÃO É
// ═══════════════════════════════════════════════════════════════════════════
//
// Ele **não escolhe** qual tabela é a verdadeira. Isso é decisão de preço, e
// preço é do CEO — trocar os números de um lado pelos do outro mudaria,
// sozinho, quanto a casa cobra de todo mundo.
//
// Ele **trava**. Hoje a divergência está declarada num comentário
// (`live-calculator.ts`) e num registro (`docs/medicoes/duas-tabelas-vivas-26-08.md`),
// e comentário não impede ninguém de mexer. Este arquivo transforma a
// declaração em régua: enquanto a divergência for EXATAMENTE a que foi medida,
// ele passa; no instante em que alguém mexer em qualquer das duas tabelas sem
// resolver o conjunto, ele quebra e nomeia o preço que mudou.
//
// ── A MEDIÇÃO QUE ELE PRENDE (cliente oculto, 26/08/2026) ──────────────────
//
// Pedido cmt9exi95001f0xo74bhonn77, em produção:
//   • proposta emitida por `SOCIAL_PACKAGES` (`live-calculator.ts`):
//     "Plano Essencial — R$ 590/mês" (a tabela inteira: Essencial 590,
//     Crescimento 990, Completo 1790);
//   • `https://www.diolidigital.com.br/planos`, no mesmo minuto, servida por
//     `PLANOS` (`planos.ts`): Pulso 49, Ritmo 297, Presença 790, Conteúdo 1390,
//     Crescimento 2590.
//
// O cliente foi cotado num plano cujo NOME e cujo PREÇO não existem na página
// que ele acabou de ler. E "Crescimento" existe nos dois lados com preços 2,6×
// diferentes. Decisão do Diretor Geral, 24/08/2026: *"a tabela do site é a
// única viva (duas tabelas vivas cobram errado de alguém)"* — tomada, e as
// duas continuam vivas.
//
// ⛔ QUANDO ESTE ARQUIVO SAI: no dia em que houver UMA tabela. Aí
// `precosQueNaoExistemNaPaginaPublica` devolve lista vazia, a primeira
// asserção deixa de fazer sentido, e o teste vira a asserção de baixo sozinha
// — que é a régua definitiva: nenhum preço de proposta fora da página pública.

import { describe, it, expect } from "vitest";
import { SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";
import { PLANOS } from "@/lib/agency/planos";

/** Os preços que a esteira pode COTAR e que não existem na página pública. */
function precosQueNaoExistemNaPaginaPublica(): Array<{ plano: string; preco: number }> {
  const daPaginaPublica = new Set(PLANOS.map((p) => p.preco));
  const fora: Array<{ plano: string; preco: number }> = [];
  for (const p of SOCIAL_PACKAGES) {
    // Faixa: as duas pontas têm de existir lá. Preço fechado tem `min === max`.
    for (const valor of new Set([p.minPrice, p.maxPrice])) {
      if (!daPaginaPublica.has(valor)) fora.push({ plano: p.label, preco: valor });
    }
  }
  return fora;
}

describe("duas tabelas vivas — a divergência não anda calada", () => {
  it("a divergência é EXATAMENTE a que foi medida em 26/08/2026 — mexeu numa tabela, este teste grita", () => {
    const fora = precosQueNaoExistemNaPaginaPublica();

    // A fotografia da dívida no dia em que ela foi medida. Não é uma lista de
    // preços permitidos: é o retrato de um defeito conhecido, preso para que
    // ninguém o aumente por engano. Qualquer preço a MAIS aqui é dívida nova;
    // qualquer preço a MENOS é dívida paga — e nos dois casos alguém tem de
    // vir a este arquivo e dizer, por escrito, o que mudou.
    const MEDIDO_EM_26_08 = [
      { plano: "Plano Essencial",   preco: 590 },
      { plano: "Plano Crescimento", preco: 990 },
      { plano: "Plano Completo",    preco: 1790 },
    ];

    expect(
      fora.map((f) => `${f.plano} R$ ${f.preco}`).sort(),
      "Uma das duas tabelas de preço mudou sem a outra. Enquanto houver DUAS tabelas vivas, " +
      "alguém está sendo cobrado errado — e a decisão de qual delas vale é do CEO " +
      "(docs/medicoes/duas-tabelas-vivas-26-08.md). Atualize esta fotografia SÓ junto com a decisão.",
    ).toEqual(MEDIDO_EM_26_08.map((f) => `${f.plano} R$ ${f.preco}`).sort());
  });

  it("nome de plano cotado também não existe na página pública — e isso é o mesmo defeito", () => {
    const nomesPublicos = new Set(PLANOS.map((p) => p.nome.toLowerCase()));
    const cotadosForaDaPagina = SOCIAL_PACKAGES
      .map((p) => p.label.replace(/^plano\s+/i, "").trim().toLowerCase())
      .filter((n) => !nomesPublicos.has(n));

    // "Crescimento" existe nos dois lados (R$ 990 na proposta, R$ 2.590 na
    // vitrine — 2,6× de diferença, coberto pelo teste acima). Os outros dois
    // nomes não existem na vitrine de jeito nenhum: o cliente é cotado num
    // plano que ele não encontra na página que acabou de ler.
    expect(cotadosForaDaPagina.sort()).toEqual(["completo", "essencial"]);
  });
});
