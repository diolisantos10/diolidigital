// O SEGUNDO RELÓGIO NÃO DIVERGE — e é por isso que ele pode continuar mudo.
//
// O instrumento da casa dizia "relógio ausente: cron-execute". A leitura óbvia
// — "ninguém chama esta rota" — está ERRADA: o workflow existe, disparou 759
// vezes, e as 30 últimas foram todas `success`. O que faltava era a rota
// GRAVAR a própria batida. Ver o cabeçalho de `app/api/cron/execute/route.ts`.
//
// E nenhum relógio novo nasceu, porque nenhum precisava: a perna
// `retomarProducao()` do despertador (que roda de 5 em 5 minutos, dentro do
// app) já faz o mesmo trabalho, com os mesmos números e um candidato a mais.
//
// Uma decisão dessas só é segura enquanto as duas metades continuarem iguais.
// Se alguém subir o teto de tentativas num arquivo e não no outro, a rota que
// ninguém chama passa a prometer uma recuperação que não acontece — e o
// próximo a descobrir isso seria um cliente com produção parada.
//
// Este teste lê os DOIS fontes e cobra: mesmos números, mesma função de
// recuperação, e a perna viva cobrindo pelo menos os mesmos estados.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rota = readFileSync(join(process.cwd(), "app/api/cron/execute/route.ts"), "utf8");
const despertador = readFileSync(join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

const numero = (fonte: string, nome: string): string => {
  const m = fonte.match(new RegExp(`const ${nome}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`não achei ${nome}`);
  return m[1]!.trim();
};

describe("a rota muda e a perna viva têm os MESMOS números", () => {
  it("teto por passada", () => {
    expect(numero(rota, "MAX_PER_TICK")).toBe(numero(despertador, "MAX_POR_RODADA"));
  });
  it("teto de tentativas", () => {
    expect(numero(rota, "MAX_ATTEMPTS")).toBe(numero(despertador, "MAX_TENTATIVAS"));
  });
  it("janela do 'running' travado", () => {
    expect(numero(rota, "STALE_RUNNING_MS")).toBe(numero(despertador, "TRAVADO_MS"));
  });
});

describe("as duas metades recuperam a MESMA coisa", () => {
  it("as duas chamam runProjectExecution — e não duas recuperações parecidas", () => {
    expect(rota).toContain("runProjectExecution");
    expect(despertador).toContain("runProjectExecution");
  });

  it("a perna VIVA cobre os estados da rota, e mais um", () => {
    for (const estado of ['executionStatus: "running"', 'executionStatus: "failed"']) {
      expect(rota).toContain(estado);
      expect(despertador).toContain(estado);
    }
    // O candidato a MAIS: direção aprovada cujo disparo nunca aconteceu. É o
    // que faz a perna viva ser superconjunto — se ele sumir, a afirmação do
    // cabeçalho da rota deixa de ser verdade.
    expect(despertador).toContain('executionStatus: "pending"');
  });

  it("a rota GRAVA a própria batida — relógio vivo não pode ser carimbado de morto", () => {
    // O defeito de 26/08/2026: a rota rodava e nunca dizia que rodou, então o
    // pulso a chamava de ausente para sempre. Alarme que grita sobre o normal
    // ensina a ignorar alarme.
    expect(rota).toContain("heartbeatDoRelogio");
    expect(rota).toContain('relogio: "cron-execute"');
  });

  it("a tolerância de cada relógio sai de medida, não de um número só para todos", async () => {
    const { TOLERANCIA_POR_RELOGIO, detectarAusencias } = await import("@/lib/agency/v2-recovery/heartbeat");
    // Medido em 26/08 sobre 30 disparos reais: mediana 41,6 min, máximo 67,8.
    // Com os 30 min antigos, um relógio SAUDÁVEL virava alarme.
    expect(TOLERANCIA_POR_RELOGIO["cron-execute"]!).toBeGreaterThan(68);

    const agora = new Date("2026-08-26T12:00:00Z");
    const batidaDeUmaHoraAtras = [{ relogio: "cron-execute", ultimaBatida: new Date("2026-08-26T11:00:00Z") }];
    expect(detectarAusencias(["cron-execute"], batidaDeUmaHoraAtras, agora, 30)).toEqual([]);

    // E ainda pega o relógio morto de verdade: três janelas perdidas.
    const batidaDeOntem = [{ relogio: "cron-execute", ultimaBatida: new Date("2026-08-25T12:00:00Z") }];
    expect(detectarAusencias(["cron-execute"], batidaDeOntem, agora, 30)).toHaveLength(1);

    // Relógio SEM tolerância própria continua no piso do argumento — nada passa
    // a ter alarme frouxo por omissão.
    const novo = [{ relogio: "cron-novo", ultimaBatida: new Date("2026-08-26T11:00:00Z") }];
    expect(detectarAusencias(["cron-novo"], novo, agora, 30)).toHaveLength(1);
  });

  it("a rota declara, no próprio arquivo, que quem faz o trabalho é o despertador", () => {
    // Ponto fraco declarado é dívida; silencioso é armadilha. Se alguém apagar
    // a declaração, este teste cai antes de a armadilha voltar.
    expect(rota).toContain("despertador");
    expect(rota).toContain("retomarProducao");
  });
});
