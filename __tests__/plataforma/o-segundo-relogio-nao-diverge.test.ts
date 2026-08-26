// O SEGUNDO RELÓGIO NÃO DIVERGE — e é por isso que ele pode continuar mudo.
//
// `POST /api/cron/execute` nunca teve um chamador. A casa mediu isso em
// 25/08/2026 e a resposta honesta NÃO foi "ligue um agendador": foi que a perna
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

  it("a rota declara, no próprio arquivo, que quem faz o trabalho é o despertador", () => {
    // Ponto fraco declarado é dívida; silencioso é armadilha. Se alguém apagar
    // a declaração, este teste cai antes de a armadilha voltar.
    expect(rota).toContain("despertador");
    expect(rota).toContain("retomarProducao");
  });
});
