// A DEMANDA REAL ENTRA PELO GERENTE GERAL — e a porta velha foi fechada.
//
// `despacho.test.ts` já provava o JULGAMENTO do Gerente Geral. O que faltava,
// e é o que este arquivo prova, é que o caminho por onde a demanda entra de
// verdade nesta casa — o briefing que vira projeto — passa por ele.
//
// Duas metades, e as duas são necessárias:
//
//   1. comportamento: a cadeia de dois saltos, o aceite comercial como trava,
//      e o departamento inventado sendo RECUSADO em vez de despejado no PM;
//   2. a CATRACA de fonte: nenhum criador de tarefa escolhe agente por conta
//      própria. Sem esta metade, alguém reescreve `agentId: ...primaryAgentId`
//      amanhã e todos os testes de comportamento continuam verdes — a hierarquia
//      passa nos testes dela estando desligada do mundo.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  despacharPlanoPeloGerenteGeral,
  atribuirNoDepartamento,
  frazeDoDespacho,
  type TarefaDoPlano,
} from "@/lib/agency/gerencia/entrada-da-demanda";
import { GERENTE_GERAL, ehAgenteDeLinha, ehGerente } from "@/lib/agency/gerencia/cadeia";

const plano: TarefaDoPlano[] = [
  { title: "Linha editorial do mês", department: "social", estimatedDays: 3 },
  { title: "Peça de lançamento", department: "design", estimatedDays: 2 },
  { title: "Campanha de captação", department: "traffic", estimatedDays: 4 },
  { title: "Relatório de resultado", department: "analytics", estimatedDays: 1 },
];

const ctx = { aceiteComercial: true, clienteId: "cli_teste", correlationId: "c1" };

describe("o plano do projeto entra pelo Gerente Geral", () => {
  it("cada tarefa vai para um GERENTE — nunca para um agente de linha", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, ctx);
    expect(r.recusadas).toEqual([]);
    expect(r.despachadas).toHaveLength(4);
    for (const d of r.despachadas) {
      expect(ehGerente(d.gerenteId), `${d.gerenteId} não é gerente`).toBe(true);
      expect(ehAgenteDeLinha(d.gerenteId)).toBe(false);
      expect(d.gerenteId).not.toBe(GERENTE_GERAL);
    }
  });

  it("o departamento é o VERDADEIRO, não o que o legado sabe executar", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, ctx);
    const porTitulo = new Map(r.despachadas.map((d) => [d.tarefa.title, d]));
    expect(porTitulo.get("Linha editorial do mês")!.departamentoId).toBe("social-media");
    expect(porTitulo.get("Peça de lançamento")!.departamentoId).toBe("design");
    expect(porTitulo.get("Campanha de captação")!.departamentoId).toBe("paid-traffic");
    // A prova da substituição DECLARADA: o legado não tem `analytics`, mas o
    // gerente que recebe é o de analytics — só o executor é emprestado do PM.
    const rel = porTitulo.get("Relatório de resultado")!;
    expect(rel.departamentoId).toBe("analytics");
    expect(rel.gerenteId).toBe("manager-analytics");
    expect(rel.departamentoLegado).toBe("project-management");
  });

  it("o segundo salto entrega um executor que o motor sabe rodar", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, ctx);
    for (const d of r.despachadas) {
      expect(d.executorId, `${d.departamentoId} sem executor`).toBeTruthy();
    }
  });

  it("⛔ SEM ACEITE COMERCIAL, ZERO tarefa é despachada — não 'quase nenhuma'", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, { ...ctx, aceiteComercial: false });
    expect(r.despachadas).toEqual([]);
    expect(r.recusadas).toHaveLength(4);
    expect(r.recusadas[0]!.motivo).toContain("aceite comercial");
  });

  it("⛔ departamento inventado é RECUSADO — nunca despejado no PM", () => {
    // Era o defeito antigo: `?? \"project-management\"`. O plano vem de um
    // modelo de linguagem; departamento inventado é uma questão de quando.
    const r = despacharPlanoPeloGerenteGeral(
      [{ title: "Fazer growth hacking viral", department: "growth" }],
      ctx,
    );
    expect(r.despachadas).toEqual([]);
    expect(r.recusadas[0]!.motivo).toContain("growth");
    expect(r.recusadas[0]!.motivo).toContain("não existe no catálogo");
  });

  it("⛔ o segundo salto recusa quem não é o gerente daquele departamento", () => {
    expect(atribuirNoDepartamento("copywriter", "design").decisao).toBe("recusado");
    expect(atribuirNoDepartamento("manager-financeiro", "design").decisao).toBe("recusado");
    expect(atribuirNoDepartamento(GERENTE_GERAL, "design").decisao).toBe("recusado");
    expect(atribuirNoDepartamento("manager-design", "design").decisao).toBe("atribuido");
  });

  it("a frase do despacho diz o placar — batida sem placar não se audita", () => {
    const f = frazeDoDespacho(despacharPlanoPeloGerenteGeral(plano, ctx));
    expect(f).toContain(GERENTE_GERAL);
    expect(f).toContain("4 tarefa(s)");
  });
});

// ─── A CATRACA: ninguém escolhe agente por fora do gerente ───────────────────

describe("nenhum criador de tarefa escolhe agente por conta própria", () => {
  const raiz = process.cwd();

  function arquivos(dir: string, saida: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const c = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "generated" || e.name === "node_modules") continue;
        arquivos(c, saida);
      } else if (/\.tsx?$/.test(e.name)) saida.push(c);
    }
    return saida;
  }

  it("⛔ `primaryAgentId` só é lido dentro de lib/agency/gerencia/", () => {
    const infratores: string[] = [];
    for (const r of ["app", "lib", "components"]) {
      const base = path.join(raiz, r);
      if (!fs.existsSync(base)) continue;
      for (const arq of arquivos(base)) {
        const rel = path.relative(raiz, arq);
        if (rel === "lib/agency/departments.ts") continue; // é a definição
        if (rel.startsWith("lib/agency/gerencia/")) continue; // é o segundo salto
        if (fs.readFileSync(arq, "utf8").includes("primaryAgentId")) infratores.push(rel);
      }
    }
    expect(
      infratores,
      `estes arquivos escolhem o agente sem passar pelo gerente: ${infratores.join(", ")}. Use despacharPlanoPeloGerenteGeral.`,
    ).toEqual([]);
  });

  it("⛔ projeto NÃO NASCE sem aceite registrado — nem vazio", () => {
    // O pior resultado possível seria o projeto nascer, o Gerente Geral recusar
    // todas as tarefas por falta de aceite, e sobrar um projeto VAZIO no portal
    // do cliente — silencioso, porque nada falhou. `approvedBy` vem de
    // `session.name`, que sai do banco: nada garante que não seja vazio.
    const texto = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/execution/create-project-from-request.ts"),
      "utf8",
    );
    expect(texto, "a guarda do aceite sumiu").toContain("Projeto não nasce sem aceite registrado");
    // E ela vem ANTES do `prisma.project.create` — depois seria tarde: o
    // projeto já existiria.
    expect(texto.indexOf("Projeto não nasce sem aceite registrado")).toBeLessThan(
      texto.indexOf("prisma.project.create"),
    );
  });

  it("as duas portas que criam projeto despacham pelo Gerente Geral", () => {
    for (const p of [
      "lib/agency/execution/create-project-from-request.ts",
      "app/api/brain/orchestrate/apply/route.ts",
    ]) {
      const texto = fs.readFileSync(path.join(raiz, p), "utf8");
      expect(texto, `${p} não passa pelo GG`).toContain("despacharPlanoPeloGerenteGeral");
      expect(texto, `${p} ainda tem a tradução própria de departamento`).not.toContain("DEPT_TO_DEF[");
      // E — a parte que a primeira versão deste teste NÃO pegava — as tarefas
      // gravadas têm de SAIR do despacho. Importar o Gerente Geral e depois
      // gravar `proposal.tasks` direto deixaria a hierarquia importada e
      // ignorada, com a CI verde. Foi exatamente essa a mutação que passou.
      const criacao = texto.slice(texto.indexOf("criarTarefas("));
      expect(criacao.slice(0, 400), `${p}: criarTarefas não é alimentado pelo despacho do GG`).toContain(
        "plano.despachadas.map(",
      );
    }
  });
});
