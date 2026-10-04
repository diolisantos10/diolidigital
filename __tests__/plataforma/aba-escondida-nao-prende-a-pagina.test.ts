// A PÁGINA NÃO FICA PRESA EM "CARREGANDO…" COM A ABA EM SEGUNDO PLANO.
//
// 04/10/2026: com a janela escondida, a página do cliente ficou mais de 30 s em
// "Carregando o cliente…". Medido: o React 19 (`$RC`, streaming) só revela o
// conteúdo pronto num quadro de animação, e aba escondida não ganha quadro.
// Ver `lib/navegador/quadro-em-aba-escondida.ts`.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SCRIPT_DO_QUADRO_EM_ABA_ESCONDIDA } from "@/lib/navegador/quadro-em-aba-escondida";

function janela(visibilidade: "hidden" | "visible") {
  const original = vi.fn((): number => 7);
  const cancelarOriginal = vi.fn((): void => undefined);
  const w: Record<string, unknown> = {
    requestAnimationFrame: original,
    cancelAnimationFrame: cancelarOriginal,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
  };
  new Function("window", "document", "performance", SCRIPT_DO_QUADRO_EM_ABA_ESCONDIDA)(w, { visibilityState: visibilidade }, performance);
  return { w, original, cancelarOriginal };
}

describe("o quadro de animação em aba escondida", () => {
  it("ESCONDIDA: o callback roda por temporizador (a revelação acontece)", async () => {
    const { w, original } = janela("hidden");
    const cb = vi.fn((): void => undefined);
    const id = (w.requestAnimationFrame as (f: () => void) => number)(cb);
    expect(id).toBeLessThan(0);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    expect(original).not.toHaveBeenCalled();
  });

  it("ESCONDIDA: cancelar o id negativo cancela o temporizador", async () => {
    const { w, cancelarOriginal } = janela("hidden");
    const cb = vi.fn((): void => undefined);
    const id = (w.requestAnimationFrame as (f: () => void) => number)(cb);
    (w.cancelAnimationFrame as (i: number) => void)(id);
    await new Promise((r) => setTimeout(r, 40));
    expect(cb).not.toHaveBeenCalled();
    expect(cancelarOriginal).not.toHaveBeenCalled();
  });

  it("VISÍVEL: o requestAnimationFrame do navegador, intocado", () => {
    const { w, original } = janela("visible");
    expect((w.requestAnimationFrame as (f: () => void) => number)(() => undefined)).toBe(7);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("o layout raiz carrega o script no <head>, antes do conteúdo", () => {
    const LAYOUT = readFileSync(`${process.cwd()}/app/layout.tsx`, "utf8");
    const i = LAYOUT.indexOf("__html: SCRIPT_DO_QUADRO_EM_ABA_ESCONDIDA");
    expect(i).toBeGreaterThan(LAYOUT.indexOf("<head>"));
    expect(i).toBeLessThan(LAYOUT.indexOf("{children}"));
  });
});
