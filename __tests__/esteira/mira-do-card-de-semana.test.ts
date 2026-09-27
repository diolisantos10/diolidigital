// mira-do-card-de-semana.test.ts — a COLISÃO "sexta" (dia) × "sexto/sexta"
// (ordinal), só no ramo do CARD DE SEMANA (achado 2, C9-colateral, 27/09/2026,
// leia .despacho/C9-colateral.md e .despacho/C8-bloqueantes.out).
//
// `pecaApontadaPeloCliente` (a régua do `Deliverable`, em `mira-da-peca.ts`)
// lê "sexta" como ordinal 6 SEMPRE — o vocabulário dela não tem noção de dia
// da semana, e não devia ter: aquele módulo é sobre a posição na lista de um
// documento de texto, não sobre calendário. Aqui, no card de semana, cada
// peça TEM uma `scheduledFor` real, e "a de sexta" quase sempre quer dizer o
// DIA. Num card de 6+ peças, "6" cai DENTRO da faixa e a mira ordinal
// vencia — carimbando a peça de sábado (a 6ª da lista) quando o cliente
// pediu a de sexta-feira.
//
// `miraDoCardDeSemana` (`refacao.ts`, exportada) resolve a colisão: dia vence
// quando a mira ordinal só existe por causa da palavra "sexto/sexta" E ela
// não está em uso ordinal explícito ("a sexta peça", "o sexto story").
//
// Testado aqui como FUNÇÃO PURA — sem prisma, sem mock de banco — porque é
// exatamente disso que ela é feita.

import { describe, it, expect } from "vitest";
import { miraDoCardDeSemana } from "@/lib/agency/esteira/refacao";

interface Peca {
  id: string;
  scheduledFor: Date | null;
}

/**
 * 7 peças, uma por dia, segunda (07/12/2026) a domingo (13/12/2026) —
 * o card de 7 peças que a ficha pede. Confirmado fora do teste: 07/12/2026 é
 * segunda-feira (a mesma conta que `refacao-card-de-semana.test.ts` já usa
 * para 11/12/2026 = sexta-feira).
 */
function cardDeSeteDias(): Peca[] {
  const base = new Date("2026-12-07T13:00:00.000Z"); // segunda, 10h Brasília
  return Array.from({ length: 7 }, (_, i) => ({
    id: `sp${i + 1}`,
    scheduledFor: new Date(base.getTime() + i * 24 * 60 * 60 * 1000),
  }));
}

describe("miraDoCardDeSemana — a colisão sexta (dia) × sexto/sexta (ordinal)", () => {
  it('"a de sexta" com card de 7 peças → a peça marcada para SEXTA (dia), NÃO a 6ª por ordinal', () => {
    const pecas = cardDeSeteDias();
    const sexta = pecas[4]!; // 11/12/2026 — índice 4 (seg,ter,qua,qui,SEX,sab,dom)
    const r = miraDoCardDeSemana("a de sexta está com o texto errado", pecas);
    expect(r, "sem o conserto, \"sexta\" lia como ordinal 6 (a peça de sábado)").toBe(sexta.id);
  });

  it('"a sexta peça" continua ORDINAL — a 6ª da lista, não o dia', () => {
    const pecas = cardDeSeteDias();
    const r = miraDoCardDeSemana("a sexta peça está com o texto errado", pecas);
    expect(r).toBe(pecas[5]!.id); // 6ª peça (índice 5) — 12/12/2026, sábado
  });

  it('"sexta-feira" (com o sufixo) também lê como dia', () => {
    const pecas = cardDeSeteDias();
    const sexta = pecas[4]!;
    expect(miraDoCardDeSemana("adianta a peça de sexta-feira", pecas)).toBe(sexta.id);
  });

  it("sem mira nenhuma (nem ordinal, nem dia/data) → null", () => {
    const pecas = cardDeSeteDias();
    expect(miraDoCardDeSemana("está tudo sem graça", pecas)).toBeNull();
  });

  it("ordinal sem colisão (\"a terceira\") não regride", () => {
    const pecas = cardDeSeteDias();
    expect(miraDoCardDeSemana("a terceira peça precisa de outro texto", pecas)).toBe(pecas[2]!.id);
  });

  it("comentário vazio ou só espaço → null, nunca lança", () => {
    const pecas = cardDeSeteDias();
    expect(miraDoCardDeSemana("", pecas)).toBeNull();
    expect(miraDoCardDeSemana("   ", pecas)).toBeNull();
    expect(miraDoCardDeSemana(null, pecas)).toBeNull();
    expect(miraDoCardDeSemana(undefined, pecas)).toBeNull();
  });

  it('colisão "sexta" sem peça marcada para aquele dia → cai de volta para o ordinal (não regride o card pequeno)', () => {
    // Só 2 peças, nenhuma de sexta: dia não bate em nenhuma (miraPorDia null),
    // e como ordinal "6" está fora da faixa de 2 peças — sem mira nenhuma,
    // igual ao comportamento de antes do conserto.
    const pecas: Peca[] = [
      { id: "a", scheduledFor: new Date("2026-12-07T13:00:00.000Z") }, // segunda
      { id: "b", scheduledFor: new Date("2026-12-08T13:00:00.000Z") }, // terça
    ];
    expect(miraDoCardDeSemana("a sexta peça", pecas)).toBeNull();
  });
});
