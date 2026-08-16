// NADA FICA PARADO EM SILÊNCIO — o bastão no chão tem dono, idade e cobrança.
//
// A regra do `03-ESTEIRA-E-HANDOFFS.md` já dizia que sem aceite a tarefa não
// sai da fila anterior, e `handoff.ts` já a cumpria. O que faltava era alguém
// OLHANDO a fila: o handoff ficava `aguardando_recebimento` para sempre.
//
// As duas metades: cobra o atrasado (com dono, idade e a frase de que ele
// continua na fila de quem entregou) e NÃO cobra o que está dentro do prazo.
// Alarme que dispara onde não há risco é alarme que alguém desliga.

import { describe, it, expect, vi } from "vitest";
import {
  cobrancasDeHandoff, cobrarOsBastoesNoChao, PRAZO_PADRAO_HORAS, HORAS_ATE_SUBIR_AO_CEO,
  type HandoffParado, type DependenciasDoGaviao,
} from "@/lib/agency/esteira-assistida/vigilancia-de-handoff";
import { HANDOFF_DA_ESTEIRA } from "@/lib/agency/esteira-assistida/recusa-visivel";

const AGORA = new Date("2026-08-16T12:00:00Z");
const h = (over: Partial<HandoffParado> = {}): HandoffParado => ({
  id: "hf1",
  deDepartamento: "pm",
  paraDepartamento: "branding",
  responsavelEntrega: "pm-orchestrator",
  correlationId: "assistido:cli:req",
  prazoProximo: new Date("2026-08-16T10:00:00Z"), // venceu há 2 h
  criadoEm: new Date("2026-08-16T04:00:00Z"),     // parado há 8 h
  ...over,
});

describe("⛔ o atrasado é cobrado, com dono e idade", () => {
  it("nomeia de quem é a bola, há quanto tempo, e que a tarefa NÃO saiu da fila anterior", () => {
    const [c] = cobrancasDeHandoff([h()], AGORA);
    expect(c!.atrasado).toBe(true);
    expect(c!.dono).toBeTruthy();
    expect(c!.dono).not.toBe("");
    expect(Math.round(c!.idadeHoras)).toBe(8);
    expect(c!.idade).toBe("há 8 h");
    expect(c!.motivo).toMatch(/não saiu de lá|continua na fila/i);
  });

  it("prazo AUSENTE não é prazo infinito — cai no padrão da casa e vence igual", () => {
    const velho = h({
      prazoProximo: null,
      criadoEm: new Date(AGORA.getTime() - (PRAZO_PADRAO_HORAS + 1) * 3_600_000),
    });
    expect(cobrancasDeHandoff([velho], AGORA)[0]!.atrasado).toBe(true);
  });

  it("o que ninguém pega por tempo demais SOBE AO CEO, e a frase diz isso", () => {
    const abandonado = h({ criadoEm: new Date(AGORA.getTime() - (HORAS_ATE_SUBIR_AO_CEO + 1) * 3_600_000) });
    const [c] = cobrancasDeHandoff([abandonado], AGORA);
    expect(c!.sobeAoCeo).toBe(true);
    expect(c!.motivo).toMatch(/sobe para o CEO/i);
  });
});

describe("✅ a metade limpa — o gavião não inventa problema", () => {
  it("handoff DENTRO do prazo não é cobrado", () => {
    const novo = h({
      criadoEm: new Date(AGORA.getTime() - 1 * 3_600_000),
      prazoProximo: new Date(AGORA.getTime() + 5 * 3_600_000),
    });
    const [c] = cobrancasDeHandoff([novo], AGORA);
    expect(c!.atrasado).toBe(false);
    expect(c!.sobeAoCeo).toBe(false);
    expect(c!.motivo).toContain("Dentro do prazo");
  });

  it("fila vazia devolve zero, sem alarme", async () => {
    const deps: DependenciasDoGaviao = {
      handoffsAguardando: async () => [],
      cobrancaRecente: async () => false,
      registrarCobranca: vi.fn(),
      agora: () => AGORA,
    };
    const r = await cobrarOsBastoesNoChao(deps);
    expect(r).toMatchObject({ aguardando: 0, atrasados: 0, subiramAoCeo: 0 });
    expect(deps.registrarCobranca).not.toHaveBeenCalled();
  });

  it("relógio para trás NÃO vira idade negativa", () => {
    const futuro = h({ criadoEm: new Date(AGORA.getTime() + 3_600_000) });
    expect(cobrancasDeHandoff([futuro], AGORA)[0]!.idadeHoras).toBe(0);
  });
});

describe("🔑 o gavião COBRA, e não aceita no lugar de ninguém", () => {
  it("grava a cobrança como linha visível do motor, com o sentinela de handoff", async () => {
    const gravadas: Array<{ funcaoId: string; motivo: string; correlationId: string }> = [];
    const deps: DependenciasDoGaviao = {
      handoffsAguardando: async () => [h()],
      cobrancaRecente: async () => false,
      registrarCobranca: async (d) => { gravadas.push(d); },
      agora: () => AGORA,
    };
    const r = await cobrarOsBastoesNoChao(deps);
    expect(r.atrasados).toBe(1);
    expect(gravadas[0]!.funcaoId).toBe(HANDOFF_DA_ESTEIRA);
    expect(gravadas[0]!.correlationId).toBe("handoff:hf1");
  });

  it("não cobra o mesmo handoff a cada passada — a janela segura a enxurrada", async () => {
    const deps: DependenciasDoGaviao = {
      handoffsAguardando: async () => [h()],
      cobrancaRecente: async () => true,
      registrarCobranca: vi.fn(),
      agora: () => AGORA,
    };
    const r = await cobrarOsBastoesNoChao(deps);
    expect(r.atrasados).toBe(1);              // continua atrasado na leitura
    expect(deps.registrarCobranca).not.toHaveBeenCalled(); // e não repete a linha
  });

  it("⛔ aceite automático é PROIBIDO — o módulo não tem como aceitar handoff", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/esteira-assistida/vigilancia-de-handoff.ts"), "utf8",
    );
    // Se a máquina aceitasse sozinha, a fila esvaziaria e o trabalho seguiria
    // sem dono — o oposto exato da regra que este módulo existe para exigir.
    expect(fonte).not.toMatch(/aceitarHandoff|\.aceitar\(/);
  });
});
