// contarFormas — o placar tem de dizer QUAL das três causas foi, em todas.
//
// A primeira rodada ao vivo (24/08/2026) barrou 10 turnos: o placar contou
// "malformado ×9, price_leak ×1" e mostrou o laudo de UM. Nove ficaram sem
// causa — e número sem causa é exatamente o beco que o laudo existe para abrir.
//
// As linhas abaixo são as REAIS daquela rodada, copiadas do log do Actions.
// Teste alimentado por texto inventado prova que a função lê o texto inventado.

import { describe, it, expect } from "vitest";
import { contarFormas } from "@/lib/agency/cliente-falso/placar";

const MALFORMADO_PROSA =
  "[resposta barrada pelo guarda: malformado — a resposta do modelo terminou de ser escrita e ainda " +
  "assim não veio em formato válido — na forma: o modelo não abriu JSON nenhum (respondeu em prosa, " +
  "297 caracteres) — quem respondeu ao visitante foi o motor de regras.]";

const MALFORMADO_PREAMBULO =
  "[resposta barrada pelo guarda: malformado — a resposta do modelo terminou de ser escrita e ainda " +
  "assim não veio em formato válido — na forma: 42 caractere(s) de texto ANTES do pacote (pacote de " +
  "880 caracteres) — quem respondeu ao visitante foi o motor de regras.]";

const PRICE_LEAK =
  "[resposta barrada pelo guarda: price_leak — o modelo citou preço ou desconto na fala, o que só " +
  "pode acontecer depois do login — quem respondeu ao visitante foi o motor de regras." +
  " O escopo (o que o cliente já tinha dito) foi salvo mesmo assim.]";

describe("contarFormas — o número vem com a causa junto", () => {
  it("agrupa nove turnos da MESMA causa numa linha só, com a contagem", () => {
    const r = contarFormas(Array(9).fill(MALFORMADO_PROSA));
    expect(r).toHaveLength(1);
    expect(r[0][1]).toBe(9);
    expect(r[0][0]).toMatch(/^malformado: /);
    expect(r[0][0]).toMatch(/não abriu JSON nenhum/);
  });

  it("SEPARA causas diferentes — 3 de um jeito e 6 de outro são dois achados", () => {
    const r = contarFormas([...Array(6).fill(MALFORMADO_PROSA), ...Array(3).fill(MALFORMADO_PREAMBULO)]);
    expect(r).toHaveLength(2);
    // Ordenado pela contagem: o mais frequente primeiro.
    expect(r[0][1]).toBe(6);
    expect(r[1][1]).toBe(3);
    expect(r[0][0]).toMatch(/prosa/);
    expect(r[1][0]).toMatch(/ANTES do pacote/);
  });

  it("diz com todas as letras quando o guarda não julga formato — ausência não vira lacuna muda", () => {
    const r = contarFormas([PRICE_LEAK]);
    expect(r[0][0]).toMatch(/^price_leak/);
    expect(r[0][0]).toMatch(/não julga formato/);
  });

  it("a rodada real de 24/08 se lê inteira: malformado ×9 com causa, price_leak ×1 sem", () => {
    const r = contarFormas([...Array(9).fill(MALFORMADO_PROSA), PRICE_LEAK]);
    expect(r.map(([, n]) => n)).toEqual([9, 1]);
  });

  // ── O ACHADO DA RODADA DE 24/08, virado em teste ─────────────────────────
  // Dez turnos da MESMA causa viraram NOVE linhas no placar, porque o laudo
  // carrega o tamanho do pacote e os tamanhos diferiam. Uma causa lida como
  // nove achados é o oposto do que o agrupamento existe para fazer.
  it("uma causa com tamanhos diferentes é UMA linha, não nove", () => {
    const tamanhos = [201, 216, 216, 242, 243, 252, 254, 262, 265, 319];
    const barrados = tamanhos.map((t) =>
      MALFORMADO_PROSA.replace("297 caracteres", `${t} caracteres`),
    );
    const r = contarFormas(barrados);
    expect(r).toHaveLength(1);
    expect(r[0][1]).toBe(10);
    expect(r[0][0]).toMatch(/não abriu JSON nenhum/);
  });

  it("ainda separa causas de FEITIO diferente — normalizar número não pode fundir tudo", () => {
    const r = contarFormas([MALFORMADO_PROSA, MALFORMADO_PREAMBULO]);
    expect(r).toHaveLength(2);
  });

  it("não quebra com linha fora do feitio esperado", () => {
    expect(() => contarFormas(["texto qualquer", ""])).not.toThrow();
    expect(contarFormas(["texto qualquer"])[0][1]).toBe(1);
  });
});
