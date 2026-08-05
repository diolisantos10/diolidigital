// O gate de qualidade só sabia dizer PASS.
//
// `quality-engine.ts` alimentava as cinco checagens globais BLOQUEANTES com
// constantes verdadeiras (`const hasHallucination = false; // synthetic`), o
// `des_no_invented` era `getPass: () => true` com o detalhe "Assets seguem o
// Brand Hub aprovado", e o resultado — `overallVerdict: "PASS"` + "Todos os N
// checks aprovados — qualidade verificada" — era persistido para todo cliente.
//
// O teste que importa está no primeiro describe: PEÇA COM ALUCINAÇÃO EVIDENTE
// NÃO RECEBE "QUALIDADE VERIFICADA".

import { describe, it, expect } from "vitest";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";
import { runQualityAuditGate, GLOBAL_AUDIT_CHECKS } from "@/lib/dioli-brain/quality-canvas";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { operacaoVazia, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";

const VERDADE: VerdadeDoCliente = {
  businessName: "Padaria do Zé",
  telefones: ["11988887777"],
  emails: ["contato@padariadoze.com.br"],
  servicos: ["social media"],
  valores: [60],
  verbas: [2000],
  operacao: operacaoVazia(),
};

function canvases(opts: { posicionamento?: string } = {}) {
  const strategyCanvas = generateStrategyCanvas({
    businessName: "Padaria do Zé",
    segment: "padaria",
    objectives: ["vender mais"],
    services: ["social media"],
    rawContext: "padaria de bairro",
    source: "request",
  });
  if (opts.posicionamento) strategyCanvas.positioningStatement = opts.posicionamento;
  const socialCanvas = generateSocialCanvas({ strategyCanvas, source: "request" });
  const designCanvas = generateDesignCanvas({ socialCanvas, source: "request" });
  const trafficCanvas = generateTrafficCanvas({ strategyCanvas, socialCanvas, designCanvas, verbaInformadaBRL: 2000, source: "request" });
  return { strategyCanvas, socialCanvas, designCanvas, trafficCanvas };
}

describe("PEÇA COM ALUCINAÇÃO EVIDENTE NÃO RECEBE 'qualidade verificada'", () => {
  it("telefone inventado no posicionamento → BLOCKED, e a frase de aprovação some", () => {
    const c = canvases({ posicionamento: "A padaria do bairro. Peça pelo telefone (11) 3333-2222 e receba em casa." });
    const canvas = generateQualityCanvas({ ...c, verdade: VERDADE, source: "request" });

    expect(canvas.overallVerdict).toBe("BLOCKED");
    expect(canvas.verdictRationale).not.toContain("qualidade verificada");
    const check = canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!;
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("sem lastro");
  });

  it("CNPJ inventado → BLOCKED", () => {
    const c = canvases({ posicionamento: "Padaria tradicional do bairro, CNPJ 12.345.678/0001-90, desde 1998." });
    const canvas = generateQualityCanvas({ ...c, verdade: VERDADE, source: "request" });
    expect(canvas.overallVerdict).toBe("BLOCKED");
    // E o bloqueio veio DAQUI — não de outro check qualquer.
    expect(canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!.status).toBe("FAIL");
    expect(canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!.detail).toContain("12.345.678/0001-90");
  });

  it("promessa de resultado com número → BLOCKED", () => {
    const c = canvases({ posicionamento: "Garantimos 300 clientes novos por mês para a padaria do bairro." });
    const canvas = generateQualityCanvas({ ...c, verdade: VERDADE, source: "request" });
    expect(canvas.overallVerdict).toBe("BLOCKED");
    expect(canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!.status).toBe("FAIL");
  });

  it("peça LIMPA com a verdade em mãos → a checagem realmente PASSA (não é carimbo de reprovação)", () => {
    // Um detector que reprova tudo é desligado na primeira semana. Este passa
    // quando o texto afirmado se limita ao que o cliente sustenta.
    const c = canvases({ posicionamento: "Pão quentinho todo dia para o bairro, feito na hora pela padaria." });
    c.strategyCanvas.audience = "Moradores do bairro que compram pão de manhã.";
    const canvas = generateQualityCanvas({
      strategyCanvas: c.strategyCanvas, verdade: VERDADE, source: "request",
    });
    const check = canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!;
    expect(check.status).toBe("PASS");
    expect(canvas.overallVerdict).not.toBe("BLOCKED");
  });

  it("ACHADO REAL: o `audience` de template do Strategy Engine é invenção, e agora aparece", () => {
    // Não é falso positivo — é o piso funcionando na primeira vez que rodou de
    // verdade. `strategy-engine.ts` escreve, por template de segmento, "num raio
    // de 5–10km" e "decidem onde comer pelo Instagram e por delivery" para um
    // cliente que nunca informou raio de entrega nem canal. Isso é fato sobre a
    // operação DELE, afirmado por tabela, e viaja para social/design/tráfego.
    //
    // Este teste NÃO existe para ser silenciado: existe para segurar o achado
    // até a frente de `departamentos` tirar o fato inventado do template. No dia
    // em que sair, ele quebra — e quebrar é a notícia boa.
    const c = canvases();
    const canvas = generateQualityCanvas({ ...c, verdade: VERDADE, source: "request" });
    const check = canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!;
    expect(check.status).toBe("FAIL");
    expect(check.detail).toMatch(/raio de entrega|Canal de contato/i);
  });

  it("SEM a verdade do cliente, a checagem NÃO vira PASS — vira NÃO VERIFICADO", () => {
    // O caminho perigoso: alucinação presente, mas o servidor não entregou a
    // verdade. A resposta certa é "não sei", nunca "está tudo certo".
    const c = canvases({ posicionamento: "Peça pelo telefone (11) 3333-2222." });
    const canvas = generateQualityCanvas({ ...c, source: "request" });

    const check = canvas.gateResult.globalItems.find((i) => i.id === "no_hallucination")!;
    expect(check.status).toBe("UNVERIFIED");
    expect(canvas.overallVerdict).not.toBe("PASS");
    expect(canvas.verdictRationale).not.toContain("qualidade verificada");
  });
});

describe("o relatório parou de afirmar o que não conferiu", () => {
  it("nenhum canvas recebe mais 'Todos os N checks aprovados — qualidade verificada'", () => {
    const canvas = generateQualityCanvas({ ...canvases(), verdade: VERDADE, source: "request" });
    expect(canvas.verdictRationale).not.toContain("qualidade verificada");
    expect(canvas.gateResult.unverifiedCount).toBeGreaterThan(0);
    expect(canvas.overallVerdict).not.toBe("PASS");
  });

  it("marca, briefing e valor ao cliente saem como NÃO VERIFICADO — não como PASS", () => {
    const canvas = generateQualityCanvas({ ...canvases(), verdade: VERDADE, source: "request" });
    for (const id of ["respects_brand", "matches_briefing", "client_value_clear"]) {
      const item = canvas.gateResult.globalItems.find((i) => i.id === id)!;
      expect(item.status, id).toBe("UNVERIFIED");
      expect(item.detail, id).toContain("NÃO VERIFICADO");
    }
  });

  it("'sem assets inventados' não afirma mais que os assets seguem o Brand Hub", () => {
    const c = canvases();
    const canvas = generateQualityCanvas({ designCanvas: c.designCanvas, verdade: VERDADE, source: "request" });
    const item = canvas.gateResult.deptItems.find((i) => i.id === "des_no_invented")!;
    expect(item.status).toBe("UNVERIFIED");
    expect(item.detail).not.toContain("Assets seguem o Brand Hub aprovado.");
  });

  it("os não-verificados aparecem nos keyFindings, com todas as letras", () => {
    const canvas = generateQualityCanvas({ ...canvases(), verdade: VERDADE, source: "request" });
    expect(canvas.keyFindings.some((f) => f.includes("NÃO VERIFICADOS"))).toBe(true);
    expect(canvas.keyFindings.some((f) => f.includes("Sem verificação"))).toBe(true);
  });
});

describe("o gate, isolado", () => {
  it("checagem sem apuração é UNVERIFIED — o default do registry é desconfiança", () => {
    const r = runQualityAuditGate({
      clientName: "x", segment: "y", department: "design", auditType: "canvas_review",
      deptSpecificChecks: [],
    });
    expect(r.unverifiedCount).toBe(GLOBAL_AUDIT_CHECKS.length);
    expect(r.passCount).toBe(0);
    expect(r.overall).toBe("WARNING");
    expect(r.overall).not.toBe("PASS");
  });

  it("bloqueante não verificado impede PASS mesmo sem nenhuma falha", () => {
    const r = runQualityAuditGate({
      clientName: "x", segment: "y", department: "design", auditType: "canvas_review",
      deptSpecificChecks: [],
      globalFindings: {
        no_hallucination: { status: "UNVERIFIED", detail: "não sei" },
        respects_brand: { status: "PASS", detail: "ok" },
        matches_briefing: { status: "PASS", detail: "ok" },
        client_value_clear: { status: "PASS", detail: "ok" },
        risk_checked: { status: "PASS", detail: "ok" },
        projections_anchored: { status: "PASS", detail: "ok" },
        approval_verified: { status: "PASS", detail: "ok" },
        evidence_path: { status: "PASS", detail: "ok" },
      },
    });
    expect(r.unverifiedBlocking).toBe(1);
    expect(r.overall).toBe("WARNING");
  });

  it("com TUDO apurado e aprovado, PASS continua possível — a trava não é um bloqueio cego", () => {
    const r = runQualityAuditGate({
      clientName: "x", segment: "y", department: "design", auditType: "canvas_review",
      deptSpecificChecks: [{ id: "d1", label: "d1", pass: true, detail: "ok", blocking: true }],
      globalFindings: {
        no_hallucination: { status: "PASS", detail: "ok" },
        respects_brand: { status: "PASS", detail: "ok" },
        matches_briefing: { status: "PASS", detail: "ok" },
        client_value_clear: { status: "PASS", detail: "ok" },
        risk_checked: { status: "PASS", detail: "ok" },
        projections_anchored: { status: "PASS", detail: "ok" },
        approval_verified: { status: "PASS", detail: "ok" },
        evidence_path: { status: "PASS", detail: "ok" },
      },
    });
    expect(r.overall).toBe("PASS");
    expect(r.unverifiedCount).toBe(0);
  });

  it("dept check com pass: null vira UNVERIFIED, não FAIL nem PASS", () => {
    const r = runQualityAuditGate({
      clientName: "x", segment: "y", department: "design", auditType: "canvas_review",
      deptSpecificChecks: [{ id: "d1", label: "d1", pass: null, detail: "não sei", blocking: true }],
    });
    expect(r.deptItems[0]!.status).toBe("UNVERIFIED");
    expect(r.failCount).toBe(0);
  });
});
