// O PORTÃO DO PM — as duas metades.
//
// Metade 1: barra o problema plantado (tarefa sem dono, tarefa sem prazo).
// Metade 2: NÃO inventa problema no caso limpo — conjunto bem formado passa
// inteiro. Portão que reprova o legítimo é desligado na primeira semana, e
// freio desligado protege menos que freio nenhum, porque some do radar.
//
// A terceira metade, que não é sobre o portão e sim sobre a casa: a guarda de
// que ninguém grava Task por fora do ponto único. Conferência espalhada é
// aviso; ponto único é trava.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  conferirPortaoDoPM,
  prazoAPartirDaEstimativa,
  prazoValido,
  donoValido,
  type TarefaProposta,
} from "@/lib/agency/tarefas/portao-do-pm";

const RAIZ = resolve(__dirname, "../..");

function tarefa(over: Partial<TarefaProposta> = {}): TarefaProposta {
  return {
    projectId: "p1",
    title: "Plano de conteúdo",
    agentId: "a3",
    dueDate: "2026-08-20",
    ...over,
  };
}

describe("metade 1 — o portão BARRA o que está errado", () => {
  it("tarefa sem dono é reprovada e NÃO entra", () => {
    const v = conferirPortaoDoPM([tarefa({ agentId: null })]);
    expect(v.aprovado).toBe(false);
    expect(v.aprovadas).toHaveLength(0);
    expect(v.reprovadas[0]!.violacoes).toEqual(["pm_task_owner"]);
    expect(v.itens.find((i) => i.id === "pm_task_owner")!.status).toBe("FAIL");
  });

  it("dono em branco não é dono — string vazia e espaço em branco reprovam", () => {
    for (const agentId of ["", "   ", undefined]) {
      expect(conferirPortaoDoPM([tarefa({ agentId })]).aprovado, String(agentId)).toBe(false);
    }
  });

  it("tarefa sem prazo é reprovada e NÃO entra", () => {
    const v = conferirPortaoDoPM([tarefa({ dueDate: null })]);
    expect(v.aprovado).toBe(false);
    expect(v.reprovadas[0]!.violacoes).toEqual(["pm_deadline"]);
    expect(v.itens.find((i) => i.id === "pm_deadline")!.status).toBe("FAIL");
  });

  it("prazo em formato errado reprova — e data de calendário que não existe também", () => {
    // 2026-02-31 casa com a regex e não existe. Prazo que não existe é prazo
    // que ninguém cumpre, e um vencimento inalcançável nunca dispara alerta.
    for (const dueDate of ["20/08/2026", "2026-8-20", "amanhã", "2026-02-31", "2026-13-01"]) {
      expect(conferirPortaoDoPM([tarefa({ dueDate })]).aprovado, dueDate).toBe(false);
    }
  });

  it("as duas violações juntas aparecem juntas — o parecer não esconde a segunda", () => {
    const v = conferirPortaoDoPM([tarefa({ agentId: null, dueDate: null })]);
    expect(v.reprovadas[0]!.violacoes.sort()).toEqual(["pm_deadline", "pm_task_owner"]);
    expect(v.reprovadas[0]!.parecer).toContain("sem responsável");
    expect(v.reprovadas[0]!.parecer).toContain("sem prazo");
  });

  it("reprovar uma NÃO derruba as outras — o freio é por tarefa, não freio de mão", () => {
    const v = conferirPortaoDoPM([tarefa(), tarefa({ title: "Órfã", agentId: null }), tarefa()]);
    expect(v.aprovado).toBe(false);
    expect(v.aprovadas).toHaveLength(2);
    expect(v.reprovadas).toHaveLength(1);
    expect(v.reprovadas[0]!.title).toBe("Órfã");
  });
});

describe("metade 2 — o portão NÃO inventa problema no caso limpo", () => {
  it("conjunto bem formado passa inteiro, sem ressalva", () => {
    const v = conferirPortaoDoPM([
      tarefa(),
      tarefa({ title: "Direção visual", agentId: "a2", dueDate: "2026-09-01" }),
      tarefa({ title: "KPIs", agentId: "a8", dueDate: "2026-12-31" }),
    ]);
    expect(v.aprovado).toBe(true);
    expect(v.aprovadas).toHaveLength(3);
    expect(v.reprovadas).toHaveLength(0);
    expect(v.itens.every((i) => i.status === "PASS")).toBe(true);
  });

  it("ano bissexto passa — 29/02/2028 é data real", () => {
    expect(prazoValido("2028-02-29")).toBe(true);
    expect(prazoValido("2027-02-29")).toBe(false);
  });

  it("lote vazio não é violação — projeto sem tarefa proposta não reprova nada", () => {
    const v = conferirPortaoDoPM([]);
    expect(v.aprovado).toBe(true);
    expect(v.itens.every((i) => i.status === "PASS")).toBe(true);
  });

  it("dono e prazo saem aparados, não recusados por espaço em volta", () => {
    const v = conferirPortaoDoPM([tarefa({ agentId: " a3 ", dueDate: " 2026-08-20 " })]);
    expect(v.aprovado).toBe(true);
    expect(v.aprovadas[0]!.agentId).toBe("a3");
    expect(v.aprovadas[0]!.dueDate).toBe("2026-08-20");
  });

  it("donoValido aceita id real e recusa o resto", () => {
    expect(donoValido("a1")).toBe(true);
    expect(donoValido(null)).toBe(false);
    expect(donoValido(42)).toBe(false);
  });
});

describe("o prazo vem do plano, não de chute", () => {
  it("estimatedDays do PM vira data — aritmética sobre dado que já existe", () => {
    const base = new Date("2026-08-06T00:00:00.000Z");
    expect(prazoAPartirDaEstimativa(3, base)).toBe("2026-08-09");
    expect(prazoAPartirDaEstimativa(30, base)).toBe("2026-09-05");
  });

  it("estimativa fracionária arredonda para cima — prazo curto demais é prazo estourado", () => {
    expect(prazoAPartirDaEstimativa(2.2, new Date("2026-08-06T00:00:00.000Z"))).toBe("2026-08-09");
  });

  it("SEM estimativa não inventa data — devolve null, e null é reprovado pelo portão", () => {
    // Este é o ponto em que preencher seria pior que barrar: uma data redonda
    // qualquer faria a checagem passar sempre e voltar a ser enfeite.
    for (const v of [undefined, null, 0, -3, NaN, "3 dias", 9999]) {
      expect(prazoAPartirDaEstimativa(v), String(v)).toBeNull();
    }
    expect(conferirPortaoDoPM([tarefa({ dueDate: prazoAPartirDaEstimativa(undefined) })]).aprovado).toBe(false);
  });
});

// ── A guarda do ponto único ──────────────────────────────────────────────────

/** Onde é LEGÍTIMO gravar Task direto. Só duas entradas, e as duas explicadas.
 *  Lista que cresce sem justificativa é a trava virando sugestão. */
const GRAVAM_TASK_POR_FORA: Record<string, string> = {
  "lib/agency/tarefas/criar-tarefas.ts":
    "é o próprio ponto único — é aqui que o portão roda antes de gravar.",
  "lib/agency/esteira/triagem.ts":
    "PENDENTE DE ADOÇÃO: em construção por outro agente em 06/08/2026 (passagem do pedido do cliente). Precisa passar por `criarTarefas` assim que pousar.",
  "app/api/messages/pedidos/route.ts":
    "PENDENTE DE ADOÇÃO: já grava com dono e prazo explícitos, então não viola as duas checagens — mas continua sendo um segundo caminho e deve migrar.",
};

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome === "generated" || nome.startsWith(".")) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosDeCodigo(p, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(p);
  }
  return acc;
}

describe("ninguém grava Task por fora do ponto único", () => {
  it("todo `prisma.task.create` está no ponto único ou declarado como pendente de adoção", () => {
    const alvos = [join(RAIZ, "lib"), join(RAIZ, "app")].flatMap((d) => arquivosDeCodigo(d));
    const infratores: string[] = [];

    for (const arquivo of alvos) {
      const texto = readFileSync(arquivo, "utf8");
      if (!/prisma\.task\.create(Many)?\s*\(/.test(texto)) continue;
      const rel = relative(RAIZ, arquivo);
      if (!(rel in GRAVAM_TASK_POR_FORA)) infratores.push(rel);
    }

    expect(
      infratores,
      `Grava Task sem passar pelo portão do PM. Use \`criarTarefas\` (lib/agency/tarefas/criar-tarefas.ts) ou declare o motivo em GRAVAM_TASK_POR_FORA:\n${infratores.join("\n")}`,
    ).toEqual([]);
  });
});
