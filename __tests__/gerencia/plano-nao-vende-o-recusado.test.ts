// O PLANO NÃO VENDE O QUE O CLIENTE RECUSOU.
//
// A régua nasce de uma medição em produção, 26/08/2026 (6ª volta de cliente
// oculto, item 8): o cliente escreveu "Anúncios não, agora não", o escopo
// aceito gravou `wantsPaidTraffic: false`, e o plano do Gerente Geral saiu com
// "Planejamento de Paid Strategy (Opcional)" para o agente de tráfego pago.
//
// O caso do meio é o que importa: a tarefa medida chegou com o departamento de
// ESTRATÉGIA no carimbo. Uma régua que só olhasse `department` daria verde
// sobre o defeito exato que a mediu.

import { describe, it, expect } from "vitest";
import {
  escopoDoBriefing,
  escopoDoBriefingJson,
  escopoSemRecusa,
  conferirContraOEscopo,
} from "@/lib/agency/gerencia/contrato-do-plano";
import { despacharPlanoPeloGerenteGeral } from "@/lib/agency/gerencia/entrada-da-demanda";

const ACEITE = { aceiteComercial: true, correlationId: "teste:contrato" };

describe("o escopo aceito, lido como recusa", () => {
  it("só `false` recusa — silêncio nunca vira negação (guardrail 1)", () => {
    expect(escopoDoBriefing({ wantsPaidTraffic: false }).recusados).toContain("paid-traffic");
    expect(escopoDoBriefing({ wantsPaidTraffic: undefined }).recusados).toEqual([]);
    expect(escopoDoBriefing({ wantsPaidTraffic: null }).recusados).toEqual([]);
    expect(escopoDoBriefing({}).recusados).toEqual([]);
    expect(escopoDoBriefing(null).recusados).toEqual([]);
    // `true` é contratação, não recusa.
    expect(escopoDoBriefing({ wantsPaidTraffic: true }).recusados).toEqual([]);
  });

  it("lê as flags na raiz e aninhadas em `scope`, e guarda ONDE está registrado", () => {
    const raiz = escopoDoBriefingJson(JSON.stringify({ wantsPaidTraffic: false }));
    expect(raiz.recusados).toContain("paid-traffic");
    expect(raiz.ondeEstaRegistrado["paid-traffic"]).toBe("wantsPaidTraffic: false");

    const aninhado = escopoDoBriefingJson(JSON.stringify({ scope: { wantsPaidTraffic: false } }));
    expect(aninhado.recusados).toContain("paid-traffic");

    expect(escopoDoBriefingJson(JSON.stringify({ branding: { requested: false } })).recusados).toContain("branding");
    expect(escopoDoBriefingJson(JSON.stringify({ wantsSocialMedia: false })).recusados).toContain("social-media");
  });

  it("JSON ilegível vira escopo SEM recusa — nunca uma recusa inventada, nunca exceção", () => {
    expect(escopoDoBriefingJson("{isso não é json").recusados).toEqual([]);
    expect(escopoDoBriefingJson(null).recusados).toEqual([]);
    expect(escopoDoBriefingJson("null").recusados).toEqual([]);
  });
});

describe("a conferência, tarefa a tarefa", () => {
  const recusouAnuncios = escopoDoBriefing({ wantsPaidTraffic: false });

  it("recusa a tarefa DO departamento recusado, e diz onde a recusa está registrada", () => {
    const v = conferirContraOEscopo(
      { title: "Estrutura de campanhas de mídia paga", description: "Mapear funil e públicos." },
      "paid-traffic",
      recusouAnuncios,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.departamentoRecusado).toBe("paid-traffic");
      expect(v.motivo).toContain("wantsPaidTraffic: false");
    }
  });

  it("O CASO MEDIDO: recusa pelas PALAVRAS mesmo com o carimbo de outro departamento", () => {
    const v = conferirContraOEscopo(
      { title: "Planejamento de Paid Strategy (Opcional)", description: "Estruturar aquisição paga." },
      "strategy", // o carimbo que a tarefa medida trazia
      recusouAnuncios,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toContain("Paid Strategy");
  });

  it("não barra trabalho legítimo do plano — nem 'campanha' de conteúdo", () => {
    for (const t of [
      { title: "Strategy Room — Cantina Oculta", description: "Posicionamento e audiência." },
      { title: "Plano de conteúdo e calendário editorial", description: "Pilares e frequência." },
      { title: "Campanha de conteúdo de aniversário", description: "Série de posts orgânicos." },
      { title: "Definir KPIs e cadência de relatório", description: "Indicadores primários." },
    ]) {
      expect(conferirContraOEscopo(t, "strategy", recusouAnuncios).ok).toBe(true);
    }
  });

  it("sem escopo lido, nada é barrado — o contrato não inventa recusa", () => {
    const t = { title: "Estrutura de campanhas de mídia paga", description: "" };
    expect(conferirContraOEscopo(t, "paid-traffic", undefined).ok).toBe(true);
    expect(conferirContraOEscopo(t, "paid-traffic", escopoSemRecusa()).ok).toBe(true);
  });
});

describe("a porta por onde TODO plano entra", () => {
  // O plano medido em produção, com as duas tarefas que importam.
  const plano = [
    { title: "Strategy Room — Cantina Oculta", description: "Posicionamento.", department: "strategy", estimatedDays: 3 },
    { title: "Plano de conteúdo e calendário editorial", description: "Pilares.", department: "social-media", estimatedDays: 4 },
    { title: "Planejamento de Paid Strategy (Opcional)", description: "Aquisição paga.", department: "strategy", estimatedDays: 3 },
    { title: "Estrutura de campanhas de mídia paga", description: "Funil.", department: "paid-traffic", estimatedDays: 3 },
  ];

  it("com `wantsPaidTraffic: false`, as DUAS tarefas de mídia paga são recusadas e as outras seguem", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, {
      ...ACEITE,
      escopo: escopoDoBriefingJson(JSON.stringify({ wantsPaidTraffic: false })),
    });

    const titulosDespachados = r.despachadas.map((d) => d.tarefa.title);
    expect(titulosDespachados).toEqual([
      "Strategy Room — Cantina Oculta",
      "Plano de conteúdo e calendário editorial",
    ]);

    const recusados = r.recusadas.map((x) => x.tarefa.title);
    expect(recusados).toContain("Planejamento de Paid Strategy (Opcional)");
    expect(recusados).toContain("Estrutura de campanhas de mídia paga");
    // Recusa sem motivo é silêncio com outro nome.
    for (const x of r.recusadas) expect(x.motivo).toMatch(/RECUSOU "paid-traffic"/);
  });

  it("MUTAÇÃO: sem o escopo no contexto, o mesmo plano passa inteiro — a trava é o escopo, não o acaso", () => {
    const semEscopo = despacharPlanoPeloGerenteGeral(plano, ACEITE);
    expect(semEscopo.despachadas).toHaveLength(4);
    expect(semEscopo.recusadas).toHaveLength(0);
  });

  it("MUTAÇÃO: com o cliente QUERENDO tráfego, o mesmo plano passa inteiro", () => {
    const querendo = despacharPlanoPeloGerenteGeral(plano, {
      ...ACEITE,
      escopo: escopoDoBriefingJson(JSON.stringify({ wantsPaidTraffic: true })),
    });
    expect(querendo.despachadas).toHaveLength(4);
  });

  it("a trava do aceite comercial continua ANTES de tudo: sem aceite, zero despachado", () => {
    const r = despacharPlanoPeloGerenteGeral(plano, {
      ...ACEITE,
      aceiteComercial: false,
      escopo: escopoDoBriefingJson(JSON.stringify({ wantsPaidTraffic: false })),
    });
    expect(r.despachadas).toHaveLength(0);
    expect(r.recusadas).toHaveLength(4);
  });
});
