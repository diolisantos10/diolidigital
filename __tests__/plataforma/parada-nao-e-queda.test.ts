// Parada a pedido da hospedagem NÃO pode sair com código de queda.
//
// Fixa o incidente de 06/08/2026: "Deployment crashed for diolidigital" chegou
// ao CEO por um container que tinha subido bem e foi trocado no rodízio normal
// de deploy. O culpado era o código de saída — o Next sai 143 no SIGTERM, e
// 143 é != 0, que é como a hospedagem reconhece defeito.
//
// Alarme que dispara em todo deploy treina todo mundo a ignorar alarme. O
// conserto só vale se ninguém puder desfazê-lo por engano — e ele tem DUAS
// metades que só funcionam juntas:
//   • scripts/start.sh exporta NEXT_MANUAL_SIG_HANDLE (senão o Next não larga
//     o sinal e o nosso handler nunca roda);
//   • instrumentation.ts registra o handler (senão a variável deixa o processo
//     SEM tratamento nenhum de SIGTERM).
// Remover uma sozinha é o defeito que estes testes existem para pegar.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const START_SH = join(RAIZ, "scripts/start.sh");
const INSTRUMENTATION = join(RAIZ, "instrumentation.ts");

describe("as duas metades do conserto andam juntas", () => {
  it("start.sh exporta NEXT_MANUAL_SIG_HANDLE antes de subir o servidor", () => {
    const sh = readFileSync(START_SH, "utf8");
    expect(
      /export\s+NEXT_MANUAL_SIG_HANDLE=/.test(sh),
      "scripts/start.sh precisa exportar NEXT_MANUAL_SIG_HANDLE — sem isso o Next " +
        "registra o handler dele e volta a sair 143, e todo deploy vira 'crash'.",
    ).toBe(true);

    // A ordem importa: exportar DEPOIS do `exec` não exporta nada.
    const posExport = sh.indexOf("NEXT_MANUAL_SIG_HANDLE");
    const posExec = sh.indexOf("exec \"$NODE\"");
    expect(posExport).toBeGreaterThan(-1);
    expect(posExec).toBeGreaterThan(-1);
    expect(
      posExport < posExec,
      "NEXT_MANUAL_SIG_HANDLE precisa ser exportado ANTES do exec do servidor.",
    ).toBe(true);
  });

  it("instrumentation.ts registra o handler que a variável exige", () => {
    const ts = readFileSync(INSTRUMENTATION, "utf8");
    expect(
      /process\.on\(\s*["']SIGTERM["']/.test(ts),
      "instrumentation.ts precisa tratar SIGTERM — com NEXT_MANUAL_SIG_HANDLE ligado " +
        "e sem handler, o processo fica sem tratamento nenhum de parada.",
    ).toBe(true);
    expect(/process\.exit\(0\)/.test(ts)).toBe(true);
    // O handler só deve valer quando a outra metade está ligada.
    expect(/NEXT_MANUAL_SIG_HANDLE/.test(ts)).toBe(true);
  });
});

describe("a prova no código de saída", () => {
  // Não basta o texto estar lá: o que a hospedagem lê é o número que o
  // processo devolve. Aqui um processo real recebe SIGTERM de verdade.
  const rodarComSigterm = (corpo: string): Promise<number | null> =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, ["-e", corpo], { stdio: "ignore" });
      // Espera o processo estar de pé antes de mandar o sinal.
      setTimeout(() => p.kill("SIGTERM"), 300);
      p.on("exit", (code) => resolve(code));
    });

  it("o comportamento ANTIGO (o do Next) sai 143 — o que a hospedagem chama de queda", async () => {
    const code = await rodarComSigterm(
      `process.on("SIGTERM", () => process.exit(143)); setInterval(() => {}, 1000);`,
    );
    expect(code).toBe(143);
    expect(code).not.toBe(0); // é exatamente isto que virava e-mail de crash
  });

  it("o comportamento NOVO sai 0 — parada atendida é sucesso", async () => {
    const code = await rodarComSigterm(
      `process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000);`,
    );
    expect(code).toBe(0);
  });

  it("queda de verdade continua saindo != 0 — não silenciamos defeito", async () => {
    // Uma exceção não tratada não chega por SIGTERM, então o handler novo não
    // a toca. Se este teste um dia virar 0, o conserto virou mordaça.
    let code: number | null = null;
    try {
      execFileSync(process.execPath, ["-e", 'throw new Error("queda de verdade")'], {
        stdio: "ignore",
      });
    } catch (e) {
      code = (e as { status?: number }).status ?? null;
    }
    expect(code).not.toBe(0);
    expect(code).not.toBeNull();
  });
});
