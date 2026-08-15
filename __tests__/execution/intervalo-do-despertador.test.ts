// A ARMADILHA DE UMA LINHA — o intervalo do relógio da agência.
//
// Estava assim, em `despertador.ts`:
//
//     const INTERVALO_MS = Number(process.env.DESPERTADOR_INTERVALO_MS ?? 5*60_000);
//
// `??` só pega `undefined` e `null`. Uma variável DEFINIDA e vazia vira
// `Number("")` = **0**. Um `"1h"` — digitado por quem achou que o campo aceitava
// unidade — vira **NaN**. `setInterval` com 0 ou NaN não espera nada: o relógio
// vira **laço quente**, e dentro dele há chamada de IA (que custa por chamada),
// publicação e disparo de WhatsApp.
//
// Um erro de digitação no painel do Railway viraria uma fatura, e nada no
// sistema diria por quê. Esta é a metade que reprova o valor inválido; a outra é
// a que garante que o valor legítimo continua valendo.

import { describe, it, expect } from "vitest";
import {
  lerIntervalo, INTERVALO_PADRAO_MS, INTERVALO_MINIMO_MS, INTERVALO_MAXIMO_MS,
} from "@/lib/agency/despertador";

describe("⛔ METADE 1 — valor inválido NUNCA vira laço quente", () => {
  it('a string VAZIA — o caso que virava `0` — cai no padrão E GRITA', () => {
    const r = lerIntervalo("");
    expect(r.ms).toBe(INTERVALO_PADRAO_MS);
    expect(r.aviso, "caiu no padrão em silêncio, que é como o erro sobrevive").toMatch(/VAZIA/);
  });

  it('"1h" — o caso que virava `NaN` — cai no padrão e diz que o valor é em ms', () => {
    const r = lerIntervalo("1h");
    expect(r.ms).toBe(INTERVALO_PADRAO_MS);
    expect(r.aviso).toMatch(/MILISSEGUNDOS/);
  });

  it("nenhum valor inválido escapa: o resultado é sempre finito e acima do piso", () => {
    for (const v of ["", " ", "1h", "5min", "abc", "0", "-1", "NaN", "Infinity", "1e999", "300", "999999999"]) {
      const r = lerIntervalo(v);
      expect(Number.isFinite(r.ms), `"${v}" produziu um intervalo não finito`).toBe(true);
      expect(r.ms, `"${v}" produziu intervalo abaixo do piso`).toBeGreaterThanOrEqual(INTERVALO_MINIMO_MS);
      expect(r.ms).toBeLessThanOrEqual(INTERVALO_MAXIMO_MS);
    }
  });

  it("valor abaixo do PISO cai no padrão — 300 ms é o mesmo laço quente com outra roupa", () => {
    const r = lerIntervalo("300");
    expect(r.ms).toBe(INTERVALO_PADRAO_MS);
    expect(r.aviso).toMatch(/piso/);
  });

  it("valor acima do TETO cai no padrão — provavelmente alguém digitou em segundos", () => {
    const r = lerIntervalo(String(INTERVALO_MAXIMO_MS + 1));
    expect(r.ms).toBe(INTERVALO_PADRAO_MS);
    expect(r.aviso).toMatch(/teto/);
  });

  it("todo desvio do que foi escrito é DITO — cair no padrão calado é o defeito", () => {
    for (const v of ["", "1h", "0", "-1", "99999999"]) {
      expect(lerIntervalo(v).aviso, `"${v}" caiu no padrão em silêncio`).toBeTruthy();
    }
  });
});

describe("✅ METADE 2 — o legítimo continua valendo, e sem barulho", () => {
  it("variável AUSENTE é o caso normal: padrão, sem aviso nenhum", () => {
    for (const v of [undefined, null]) {
      const r = lerIntervalo(v);
      expect(r.ms).toBe(INTERVALO_PADRAO_MS);
      expect(r.aviso, "gritou por uma configuração que está certa").toBeNull();
    }
  });

  it("um valor válido é OBEDECIDO — a trava não pode achatar todo mundo no padrão", () => {
    for (const ms of [INTERVALO_MINIMO_MS, 2 * 60_000, 10 * 60_000, INTERVALO_MAXIMO_MS]) {
      const r = lerIntervalo(String(ms));
      expect(r.ms, `${ms} ms foi ignorado`).toBe(ms);
      expect(r.aviso).toBeNull();
    }
  });

  it("espaço em volta não invalida um número certo", () => {
    expect(lerIntervalo("  120000  ").ms).toBe(120_000);
  });
});
