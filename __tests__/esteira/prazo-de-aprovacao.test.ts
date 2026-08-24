// O prazo saiu do documento e virou número.
//
// A trava central: **prazo ausente não é prazo zero, e prazo derivado nunca se
// apresenta como prazo acordado.** Card com `expiresAt` manda; card sem
// `expiresAt` recebe a régua do contrato — e a leitura DIZ qual das duas valeu.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  prazoDeAprovacao,
  lerPrazoDoCard,
  PRAZO_DE_APROVACAO_EM_DIAS_UTEIS,
  FONTE_DO_PRAZO,
} from "@/lib/agency/esteira/prazo-de-aprovacao";

describe("o número é o que foi vendido, e ele está no documento", () => {
  it("2 dias úteis — o mesmo de docs/precos.md", () => {
    expect(PRAZO_DE_APROVACAO_EM_DIAS_UTEIS).toBe(2);
  });

  it("a régua não é opinião: o documento que a define ainda diz isso", () => {
    // Se alguém renegociar o prazo no documento e esquecer o código, este teste
    // cai. É a única defesa contra a régua e o contrato divergirem em silêncio.
    const precos = fs.readFileSync(path.join(process.cwd(), "docs/precos.md"), "utf8");
    expect(precos).toMatch(/Aprovação em até\s+2\s*\n?\s*dias úteis/);
    expect(FONTE_DO_PRAZO).toContain("docs/precos.md");
  });
});

describe("dias ÚTEIS, não dias corridos", () => {
  it("card de segunda vence na quarta", () => {
    // 2026-08-10 é uma segunda-feira.
    const vence = prazoDeAprovacao(new Date("2026-08-10T14:00:00Z"));
    expect(vence.toISOString()).toBe("2026-08-12T14:00:00.000Z");
  });

  it("card de SEXTA pula o fim de semana e vence na TERÇA", () => {
    // Sem isto, o cliente que recebe a peça sexta à tarde está atrasado no
    // domingo — cobrado por um prazo que a agência não vendeu.
    // 2026-08-14 é sexta; 15 e 16 caem no fim de semana.
    const vence = prazoDeAprovacao(new Date("2026-08-14T14:00:00Z"));
    expect(vence.getUTCDay(), "venceu num dia não útil").toBe(2); // terça
    expect(vence.toISOString()).toBe("2026-08-18T14:00:00.000Z");
  });

  it("a HORA da abertura é preservada — zerar o dia rouba horas do cliente", () => {
    const vence = prazoDeAprovacao(new Date("2026-08-10T23:30:00Z"));
    expect(vence.getUTCHours()).toBe(23);
    expect(vence.getUTCMinutes()).toBe(30);
  });

  it("prazo de zero dia NÃO vence no instante da abertura", () => {
    // O cliente estaria atrasado antes de ver a peça.
    const aberto = new Date("2026-08-10T14:00:00Z");
    expect(prazoDeAprovacao(aberto, 0).getTime()).toBeGreaterThan(aberto.getTime());
  });
});

describe("a procedência do prazo é declarada", () => {
  const ABERTO = new Date("2026-08-10T14:00:00Z");

  it("card COM prazo próprio usa o prazo do card, e diz isso", () => {
    const r = lerPrazoDoCard({ abertoEm: ABERTO, expiresAt: new Date("2026-08-11T00:00:00Z") },
      new Date("2026-08-12T00:00:00Z"));
    expect(r.origem).toBe("prazo_do_card");
    expect(r.venceu).toBe(true);
  });

  it("card SEM prazo próprio recebe a régua da casa, e ela se identifica", () => {
    const r = lerPrazoDoCard({ abertoEm: ABERTO, expiresAt: null }, new Date("2026-08-13T00:00:00Z"));
    expect(r.origem).toBe("regra_do_contrato");
    expect(r.venceu).toBe(true);
    expect(r.explicacao, "prazo derivado passando por prazo acordado").toContain("docs/precos.md");
  });

  it("A METADE OPOSTA: card de ontem sem prazo NÃO está vencido", () => {
    // Trava que dispara onde não há atraso é trava que alguém desliga.
    const r = lerPrazoDoCard({ abertoEm: ABERTO, expiresAt: null }, new Date("2026-08-11T14:00:00Z"));
    expect(r.venceu).toBe(false);
    expect(r.origem).toBe("regra_do_contrato");
  });
});

describe("não lê banco, não escreve banco", () => {
  const SRC = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/esteira/prazo-de-aprovacao.ts"), "utf8",
  );
  it("a régua é função pura — nenhuma consulta escondida", () => {
    for (const p of ["prisma", "fetch(", "await "]) {
      expect(SRC.includes(p), `a régua deixou de ser pura (${p})`).toBe(false);
    }
  });
});
