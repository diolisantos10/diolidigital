// A PEÇA NÃO NASCE COM UM DIA QUE NÃO EXISTE.
//
// O caso é o de produção: "Sexta é dia de estar aqui" num cliente cujo
// calendário é terça-a-quinta.
//
// PROVA POR MUTAÇÃO (onde):
//   • trocar `passa: false` por `true` em `briga_com_a_data_da_peca`
//     (`lib/agency/esteira/calendario-do-cliente.ts`) → reprova;
//   • apagar a linha do dia 5 em `PADRAO_DO_DIA` → reprova o caso medido;
//   • fazer `conferirDataDaPeca` acusar sem data e sem calendário → reprova
//     "ausência de informação não é informação".

import { describe, it, expect } from "vitest";
import { conferirDataDaPeca, diasCitados } from "@/lib/agency/esteira/calendario-do-cliente";

/** Uma quarta-feira. */
const QUARTA = new Date("2026-08-26T12:00:00.000Z");

describe("o caso medido em 27/08/2026", () => {
  it('"Sexta é dia de estar aqui" numa peça de quarta é barrado', () => {
    const r = conferirDataDaPeca({ texto: "Sexta é dia de estar aqui", agendadaPara: QUARTA });
    expect(r.veredito).toBe("briga_com_a_data_da_peca");
    expect(r.passa).toBe(false);
    expect(r.motivo).toContain("sexta-feira");
    expect(r.motivo).toContain("quarta-feira");
    expect(r.motivo).toContain("Dono:");
    expect(r.motivo).toContain("Próxima ação:");
  });

  it("sem hora marcada, o calendário do cliente responde", () => {
    const r = conferirDataDaPeca({ texto: "Sexta é dia de estar aqui", diasDoCalendario: [2, 3, 4] });
    expect(r.veredito).toBe("fora_do_calendario");
    expect(r.passa).toBe(false);
  });
});

describe("o que a régua NÃO acusa", () => {
  it("texto sem dia nenhum passa e não afirma nada", () => {
    const r = conferirDataDaPeca({ texto: "A massa é feita na hora", agendadaPara: QUARTA });
    expect(r.veredito).toBe("nao_medido");
    expect(r.passa).toBe(true);
    expect(r.motivo).toBe("");
  });

  it("sem data e sem calendário: não medido, nunca aprovado por dedução", () => {
    const r = conferirDataDaPeca({ texto: "Sexta é dia de estar aqui" });
    expect(r.veredito).toBe("nao_medido");
    expect(r.passa).toBe(true);
  });

  it("faixa de dias só é acusada quando NENHUM bate", () => {
    expect(conferirDataDaPeca({ texto: "De terça a quinta a gente convida os amigos", agendadaPara: QUARTA }).passa).toBe(true);
    expect(conferirDataDaPeca({ texto: "Sábado e domingo tem brunch", agendadaPara: QUARTA }).passa).toBe(false);
  });

  it("o dia certo passa, com e sem acento, no singular e no plural", () => {
    for (const t of ["Quarta tem prato especial", "quarta-feira é dia de massa", "Toda quarta a casa enche"]) {
      expect(conferirDataDaPeca({ texto: t, agendadaPara: QUARTA }).veredito).toBe("ok");
    }
    expect(diasCitados("terca-feira")).toEqual([2]);
  });
});
