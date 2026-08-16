// ─────────────────────────────────────────────────────────────────────────
// FURO 4 do laudo de qualidade da rodada 5 (16/08/2026)
//
// Todos os testes de "identidade-por-sessao.test.ts" chamam
// `derivarIdentidade(caminho, ancoraFabricada)` — ninguém chamava
// `descobrirAncoraDeSessao()` (em "scripts/reivindicar.mts"), a peça que
// DESCOBRE a âncora no ambiente (env + "/proc"). A lição já registrada
// nesta casa é que mecanismo não exercitado não é mecanismo pronto.
//
// A régua que decide os três ramos foi extraída para
// `calcularAncoraDeSessao`, em "lib/coordenacao/reivindicacoes.ts" — módulo
// puro, sem leitura de env/"/proc"/git. `scripts/reivindicar.mts` só faz a
// LEITURA (I/O) e repassa para esta função. Isto é o que torna os três
// ramos testáveis SEM processo real: o teste fabrica a "FonteDeAncora"
// (sessionId, pidBruto, starttimeDoPid) como um objeto puro, nunca spawna
// nada.
//
// Os três ramos, na mesma ordem de preferência da RODADA 5:
//   (a) CLAUDE_CODE_SESSION_ID presente;
//   (b) ausente, CLAUDE_PID + starttime (via "/proc/<pid>/stat") presentes;
//   (c) nenhum dos dois — modo DEGRADADO, com motivo.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from "vitest";

import { calcularAncoraDeSessao, type FonteDeAncora } from "@/lib/coordenacao/reivindicacoes";

/** Uma fonte "vazia" por padrão — cada teste sobrescreve só o que precisa,
 *  para deixar claro qual sinal está sendo exercitado. */
function fonte(parcial: Partial<FonteDeAncora> = {}): FonteDeAncora {
  return {
    sessionId: null,
    pidBruto: null,
    starttimeDoPid: () => null,
    ...parcial,
  };
}

describe("calcularAncoraDeSessao — os três ramos, sem processo real (FURO 4)", () => {
  it("(a) CLAUDE_CODE_SESSION_ID presente — usa direto, não degrada, nunca chama starttimeDoPid", () => {
    const starttimeDoPid = vi.fn(() => "999999");

    const info = calcularAncoraDeSessao(fonte({ sessionId: "dd73bb03-9fd0-59a6-a2f1-f61292854b92", starttimeDoPid }));

    expect(info).toEqual({ ancora: "dd73bb03-9fd0-59a6-a2f1-f61292854b92", degradado: false });
    // A fonte preferida não precisa da segunda (PID+starttime) — se ela
    // fosse chamada mesmo assim, seria I/O gasto à toa.
    expect(starttimeDoPid).not.toHaveBeenCalled();
  });

  it("(a) sessionId só de espaços em branco conta como AUSENTE — cai para o próximo ramo", () => {
    const info = calcularAncoraDeSessao(fonte({ sessionId: "   ", pidBruto: "4242", starttimeDoPid: () => "123" }));

    expect(info.degradado).toBe(false);
    expect(info.ancora).toBe("pid:4242:123");
  });

  it("(b) sessionId ausente, CLAUDE_PID + starttime presentes — usa \"pid:<pid>:<starttime>\"", () => {
    const starttimeDoPid = vi.fn((pid: number) => (pid === 4242 ? "1234567" : null));

    const info = calcularAncoraDeSessao(fonte({ pidBruto: "4242", starttimeDoPid }));

    expect(info).toEqual({ ancora: "pid:4242:1234567", degradado: false });
    expect(starttimeDoPid).toHaveBeenCalledWith(4242);
  });

  it("(b) CLAUDE_PID não numérico — trata como ausente, não explode, cai para degradado", () => {
    const starttimeDoPid = vi.fn(() => "123");

    const info = calcularAncoraDeSessao(fonte({ pidBruto: "não-é-um-numero", starttimeDoPid }));

    expect(info.degradado).toBe(true);
    expect(info.ancora).toBeNull();
    // "Number.parseInt" de uma string sem dígito no início devolve NaN antes
    // de qualquer tentativa de ler starttime — não deveria nem chamar.
    expect(starttimeDoPid).not.toHaveBeenCalled();
  });

  it("(b) CLAUDE_PID presente mas starttimeDoPid devolve null (\"/proc\" ilegível, ex.: macOS/Windows) — cai para degradado", () => {
    const info = calcularAncoraDeSessao(fonte({ pidBruto: "777", starttimeDoPid: () => null }));

    expect(info.degradado).toBe(true);
    expect(info.ancora).toBeNull();
    expect(info.motivo).toBeTruthy();
  });

  it("(c) nem sessionId nem pidBruto — modo DEGRADADO, com motivo explicando o risco", () => {
    const info = calcularAncoraDeSessao(fonte());

    expect(info.degradado).toBe(true);
    expect(info.ancora).toBeNull();
    expect(info.motivo).toMatch(/CLAUDE_CODE_SESSION_ID/);
    expect(info.motivo).toMatch(/CLAUDE_PID/);
  });

  it("o resultado de (a)/(b) alimenta \"derivarIdentidade\" com prefixo \"ses-\"; (c) fica em \"wt-\" — sem repetir a régua de derivação aqui, só a integração", async () => {
    const { derivarIdentidade } = await import("@/lib/coordenacao/reivindicacoes");
    const worktree = "/home/user/diolidigital";

    const comSessao = calcularAncoraDeSessao(fonte({ sessionId: "abc" }));
    const semNada = calcularAncoraDeSessao(fonte());

    expect(derivarIdentidade(worktree, comSessao.ancora).startsWith("ses-")).toBe(true);
    expect(derivarIdentidade(worktree, semNada.ancora).startsWith("wt-")).toBe(true);
  });
});
