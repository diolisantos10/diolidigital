// Dioli Brain — Quality Engine
// Generates QualityCanvas audit reports from any upstream canvas.
// Uses DIOLI_COGNITIVE_FLOW + department-specific quality gates.
// Pure function — no side effects, no store access.
//
// ─── O QUE ESTAVA ESCRITO AQUI, E POR QUE ERA GRAVE (corrigido 05/08/2026) ───
//
//     const hasHallucination  = false; // synthetic — never has hallucinations
//     const hasBrandViolation = false; // synthetic — always respects brand
//     const hasClientValue    = true;
//     const matchesBriefing   = true;
//
// Quatro das cinco checagens globais bloqueantes eram constantes verdadeiras, e
// a quinta (`des_no_invented`) era `getPass: () => true` com o detalhe
// "Assets seguem o Brand Hub aprovado" — uma AFIRMAÇÃO DE FATO sobre algo que
// o código nunca consultou. Isso virava `overallVerdict: "PASS"` e a frase
// "qualidade verificada", persistida por `run-auto-scope.ts` para todo cliente.
//
// O comentário "synthetic" contava a origem (canvases de simulação) mas o valor
// era usado no caminho REAL (`source: "request"`). Premissa de simulação vazando
// para produção é como quase toda mentira de sistema começa.
//
// Agora: sem mecanismo → `UNVERIFIED`. Com mecanismo → o mecanismo decide.
// O único mecanismo determinístico que existe é o piso de verdade
// (`conferirPisoDeVerdade`), e ele só roda quando o SERVIDOR entrega a
// `VerdadeDoCliente` lida do banco — nunca com uma verdade montada por quem
// chama. Sem ela, `no_hallucination` é `UNVERIFIED`, e o veredito não é PASS.

import type { QualityCanvas, QualityAuditType, QualityPattern, QualityRecommendation, GlobalCheckId, GlobalFinding } from "./quality-canvas";
import { runQualityAuditGate } from "./quality-canvas";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";
import { projecoesComOrigemDeclarada } from "./traffic-canvas";
import type { StrategyCanvas } from "./strategy-canvas";
import type { SocialCanvas } from "./social-canvas";
import type { DesignCanvas } from "./design-canvas";
import type { TrafficCanvas } from "./traffic-canvas";
import type { AnalyticsCanvas } from "./analytics-canvas";

export interface QualityEngineInput {
  strategyCanvas?: StrategyCanvas;
  socialCanvas?: SocialCanvas;
  designCanvas?: DesignCanvas;
  trafficCanvas?: TrafficCanvas;
  analyticsCanvas?: AnalyticsCanvas;
  requestId?: string;
  source?: "request" | "simulation";
  /**
   * A verdade do cliente LIDA PELO SERVIDOR (`buildVerdadeDoCliente`). É o que
   * transforma `no_hallucination` de constante em checagem. Ausente = a
   * checagem fica `UNVERIFIED`; nunca vira PASS por omissão.
   */
  verdade?: VerdadeDoCliente;
}

// ── Segment-aware dept check profiles ────────────────────────────────────────

interface DeptCheckSpec {
  id: string; label: string; blocking: boolean;
  /** `null` = não há como conferir. Vira `UNVERIFIED`, jamais PASS. */
  getPass: (input: QualityEngineInput) => boolean | null;
  getDetail: (input: QualityEngineInput) => string;
}

const STRATEGY_CHECKS: DeptCheckSpec[] = [
  { id: "str_positioning",   label: "Posicionamento coerente",         blocking: true,  getPass: (i) => (i.strategyCanvas?.positioningStatement?.trim().length ?? 0) >= 20, getDetail: (i) => i.strategyCanvas?.positioningStatement ? "Posicionamento definido." : "Posicionamento não definido." },
  { id: "str_audience",      label: "Público-alvo definido",           blocking: true,  getPass: (i) => (i.strategyCanvas?.audience?.trim().length ?? 0) > 10, getDetail: (i) => i.strategyCanvas?.audience ? "Público-alvo definido." : "Público-alvo não declarado." },
  { id: "str_territories",   label: "Territórios de conteúdo",         blocking: false, getPass: (i) => (i.strategyCanvas?.contentTerritories?.length ?? 0) > 0, getDetail: (i) => `${i.strategyCanvas?.contentTerritories?.length ?? 0} território(s) mapeado(s).` },
];

const SOCIAL_CHECKS: DeptCheckSpec[] = [
  { id: "soc_brand_voice",   label: "Direção de comunicação definida",  blocking: true,  getPass: (i) => (i.socialCanvas?.communicationDirection?.trim().length ?? 0) > 10, getDetail: (i) => i.socialCanvas?.communicationDirection ? "Direção de comunicação declarada." : "Direção de comunicação não especificada." },
  { id: "soc_calendar",      label: "Calendário editorial gerado",     blocking: false, getPass: (i) => (i.socialCanvas?.editorialCalendar?.entries?.length ?? 0) > 0, getDetail: (i) => "Calendário editorial verificado." },
  { id: "soc_cta",           label: "CTAs presentes no plano",         blocking: false, getPass: (i) => (i.socialCanvas?.contentPlan?.themes?.length ?? 0) > 0, getDetail: (i) => "Temas de conteúdo verificados." },
];

const DESIGN_CHECKS: DeptCheckSpec[] = [
  { id: "des_visual",        label: "Consistência visual verificada",  blocking: true,  getPass: (i) => !!i.designCanvas?.colorDirection, getDetail: (i) => i.designCanvas?.colorDirection ? "Direção de cor definida." : "Direção de cor não especificada." },
  { id: "des_briefs",        label: "Briefs criativos gerados",        blocking: true,  getPass: (i) => (i.designCanvas?.creativeBriefs?.length ?? 0) > 0, getDetail: (i) => `${i.designCanvas?.creativeBriefs?.length ?? 0} brief(s) criado(s).` },
  // Era `getPass: () => true` com o detalhe "Assets seguem o Brand Hub
  // aprovado." — uma afirmação de fato sobre um inventário que este código
  // nunca leu. Não existe Brand Hub consultável aqui; enquanto não existir, a
  // resposta honesta é "não sei".
  { id: "des_no_invented",   label: "Sem assets inventados",           blocking: true,  getPass: (_i) => null, getDetail: (_i) => "NÃO VERIFICADO — a agência não tem inventário do Brand Hub consultável por código. Nenhuma conferência de asset foi feita." },
];

const TRAFFIC_CHECKS: DeptCheckSpec[] = [
  { id: "trf_budget_sep",    label: "Fee separado do budget de mídia", blocking: true,  getPass: (i) => (i.trafficCanvas?.budgetAllocation?.managementFeeBRL ?? 0) > 0 && (i.trafficCanvas?.budgetAllocation?.mediaBudgetBRL ?? 0) > 0, getDetail: (i) => i.trafficCanvas ? `Fee: R$ ${i.trafficCanvas.budgetAllocation?.managementFeeBRL?.toLocaleString("pt-BR") ?? "?"} | Budget: R$ ${i.trafficCanvas.budgetAllocation?.mediaBudgetBRL?.toLocaleString("pt-BR") ?? "?"}` : "Budget não verificado." },
  { id: "trf_offer",         label: "Oferta de campanha clara",        blocking: true,  getPass: (i) => (i.trafficCanvas?.offerMappings?.length ?? 0) > 0, getDetail: (i) => `${i.trafficCanvas?.offerMappings?.length ?? 0} oferta(s) mapeada(s).` },
  { id: "trf_audience",      label: "Lógica de público coerente",      blocking: true,  getPass: (i) => (i.trafficCanvas?.audiences?.length ?? 0) > 0, getDetail: (i) => (i.trafficCanvas?.audiences?.length ?? 0) > 0 ? `${i.trafficCanvas!.audiences.length} segmento(s) de público definido(s).` : "Modelo de audiência não especificado." },
];

const ANALYTICS_CHECKS: DeptCheckSpec[] = [
  { id: "ana_source",        label: "Fonte das métricas declarada",    blocking: true,  getPass: (i) => (i.analyticsCanvas?.kpis?.every((k) => k.dataSource) ?? false), getDetail: (i) => `${i.analyticsCanvas?.kpis?.length ?? 0} KPI(s) com fonte declarada.` },
  { id: "ana_insight",       label: "Insights acionáveis gerados",     blocking: false, getPass: (i) => (i.analyticsCanvas?.keyInsights?.length ?? 0) > 0, getDetail: (i) => `${i.analyticsCanvas?.keyInsights?.length ?? 0} insight(s) gerado(s).` },
  { id: "ana_attribution",   label: "Modelo de atribuição configurado",blocking: true,  getPass: (i) => !!i.analyticsCanvas?.attributionLayer?.recommendedModel, getDetail: (i) => i.analyticsCanvas?.attributionLayer?.recommendedModel ? `Modelo: ${i.analyticsCanvas.attributionLayer.recommendedModel}` : "Modelo de atribuição não configurado." },
];

const DEPT_CHECKS: Record<string, DeptCheckSpec[]> = {
  strategy:      STRATEGY_CHECKS,
  "social-media": SOCIAL_CHECKS,
  design:        DESIGN_CHECKS,
  "paid-traffic": TRAFFIC_CHECKS,
  analytics:     ANALYTICS_CHECKS,
};

// ── O QUE DÁ PARA CONFERIR DE VERDADE ────────────────────────────────────────

/**
 * O texto que a agência AFIRMA — a prosa que descreve o cliente e vira peça,
 * legenda, oferta e copy. É este texto que o piso de verdade confere.
 *
 * O que fica de fora, e por quê: a tabela financeira e os projetados do tráfego
 * (`budgetAllocation`, `projectedROAS`, `projectedCAC`). Não é brecha — é que
 * esses campos têm um dono próprio de honestidade agora: o
 * `projections_anchored`, que exige que o número venha da verba do cliente ou
 * carregue a ressalva de faixa de referência. Passá-los pelo piso de verdade
 * (que reprova todo "R$" que o cliente não informou) faria TODO plano de mídia
 * ser bloqueado por citar o próprio fee — reprovar tudo é como se desliga um
 * freio.
 */
function textoAfirmado(input: QualityEngineInput): string {
  const partes: string[] = [];
  const s = input.strategyCanvas;
  if (s) {
    partes.push(s.positioningStatement ?? "", s.audience ?? "", s.mainObjective ?? "");
    for (const t of s.contentTerritories ?? []) partes.push(typeof t === "string" ? t : JSON.stringify(t));
  }
  const so = input.socialCanvas;
  if (so) {
    partes.push(so.communicationDirection ?? "");
    for (const e of so.editorialCalendar?.entries ?? []) partes.push(JSON.stringify(e));
    for (const t of so.contentPlan?.themes ?? []) partes.push(typeof t === "string" ? t : JSON.stringify(t));
  }
  const d = input.designCanvas;
  if (d) {
    partes.push(d.colorDirection ?? "");
    for (const b of d.creativeBriefs ?? []) partes.push(JSON.stringify(b));
  }
  const t = input.trafficCanvas;
  if (t) {
    partes.push(t.offerContext ?? "", t.targetAudience ?? "", t.channelRationale ?? "");
    for (const o of t.offerMappings ?? []) partes.push([o.name, o.description, o.cta].filter(Boolean).join(" "));
    for (const c of t.creativeRequirements ?? []) partes.push([c.copyDirection, c.ctaText].filter(Boolean).join(" "));
  }
  return partes.filter((p) => typeof p === "string" && p.trim().length > 0).join("\n");
}

/**
 * As checagens globais, apuradas com o que EXISTE. Cada uma responde uma de
 * três coisas: passou, falhou, ou "não tenho mecanismo". Nenhuma responde
 * "passou" por não ter olhado.
 */
function apurarGlobais(
  input: QualityEngineInput,
  ctx: { hasRisks: boolean; hasEvidencePath: boolean },
): Partial<Record<GlobalCheckId, GlobalFinding>> {
  const findings: Partial<Record<GlobalCheckId, GlobalFinding>> = {};

  // 1. SEM ALUCINAÇÃO — a única global bloqueante que hoje tem mecanismo.
  //    Depende da verdade lida pelo SERVIDOR; sem ela, não se afirma nada.
  if (input.verdade) {
    const texto = textoAfirmado(input);
    if (texto.trim().length === 0) {
      findings.no_hallucination = {
        status: "UNVERIFIED",
        detail: "NÃO VERIFICADO — os canvases não trouxeram texto afirmativo para conferir contra a verdade do cliente.",
      };
    } else {
      const veredito = conferirPisoDeVerdade(texto, input.verdade);
      findings.no_hallucination = veredito.aprovado
        ? { status: "PASS", detail: "Conferido contra a verdade do cliente lida do banco (telefone, e-mail, valor, documento, promessa, horário, área, prazo): nenhuma afirmação sem lastro." }
        : { status: "FAIL", detail: `${veredito.violacoes.length} afirmação(ões) sem lastro na verdade do cliente. ${resumirViolacoes(veredito.violacoes).slice(0, 600)}` };
    }
  }

  // 2. NÚMEROS PROJETADOS COM ORIGEM DECLARADA — determinístico, e existe.
  if (input.trafficCanvas) {
    const ok = projecoesComOrigemDeclarada(input.trafficCanvas);
    findings.projections_anchored = ok
      ? {
          status: "PASS",
          detail: input.trafficCanvas.budgetBasis === "verba_informada"
            ? "Budget e projeções derivados da verba informada pelo cliente."
            : "Cliente não informou verba — todo campo projetado carrega a ressalva de faixa de referência do segmento.",
        }
      : { status: "FAIL", detail: "Números projetados sem verba do cliente e sem ressalva de origem — o time leria a faixa do segmento como estimativa deste cliente." };
  } else {
    findings.projections_anchored = { status: "PASS", detail: "Sem plano de mídia nesta auditoria — nenhum número projetado a ancorar." };
  }

  // 3. RISCOS — só sabemos olhar o gate do tráfego. Fora dele, não sabemos.
  if (input.trafficCanvas) {
    findings.risk_checked = ctx.hasRisks
      ? { status: "WARNING", detail: "Quality Gate do tráfego reprovou — riscos identificados, endereçamento NÃO verificado." }
      : { status: "WARNING", detail: "Quality Gate do tráfego sem falha. Riscos legais, financeiros e reputacionais do entregável NÃO foram verificados — não há mecanismo para isso." };
  }
  // Sem tráfego, `risk_checked` fica ausente → UNVERIFIED.

  // 4. APROVAÇÃO — esta é verdade de código, não de julgamento: o artefato
  //    nasce `draft` e a governança separa aprovar de aplicar.
  findings.approval_verified = {
    status: "PASS",
    detail: "Artefato nasce em rascunho; aprovação e aplicação são transições separadas na governança do Brain.",
  };

  // 5. CAMINHO DE EVIDÊNCIA — checagem real sobre o estado dos canvases.
  findings.evidence_path = ctx.hasEvidencePath
    ? { status: "PASS", detail: "Caminho de evidência definido — há canvas aprovado com métrica de sucesso." }
    : { status: "WARNING", detail: "Nenhum canvas aprovado — definir como medir o sucesso deste entregável." };

  // 6, 7, 8. MARCA, BRIEFING e VALOR AO CLIENTE ficam DE FORA de propósito.
  //    Não existe mecanismo executável para nenhum dos três, e é exatamente
  //    isso que o relatório precisa dizer. Ausentes daqui → `UNVERIFIED`.
  //    (`respects_brand`, `matches_briefing`, `client_value_clear`.)

  return findings;
}

// ── Pattern detection ─────────────────────────────────────────────────────────

function detectPatterns(input: QualityEngineInput): QualityPattern[] {
  const patterns: QualityPattern[] = [];

  if (input.strategyCanvas) {
    if ((input.strategyCanvas.contentTerritories?.length ?? 0) >= 3) {
      patterns.push({ id: "str_rich_territories", department: "strategy", type: "strength", description: "Estratégia com múltiplos territórios de conteúdo — base sólida para execução.", frequency: 1, actionable: false });
    }
  }
  if (input.trafficCanvas && (input.trafficCanvas.qualityGateResult?.overall === "PASS")) {
    patterns.push({ id: "trf_qg_pass", department: "paid-traffic", type: "strength", description: "Traffic Canvas passou no Quality Gate — pronto para execução.", frequency: 1, actionable: false });
  }
  if (input.analyticsCanvas && (input.analyticsCanvas.kpis?.length ?? 0) >= 5) {
    patterns.push({ id: "ana_kpi_rich", department: "analytics", type: "strength", description: "Framework de KPIs robusto — monitoramento abrangente.", frequency: 1, actionable: true });
  }
  if (!input.socialCanvas && input.strategyCanvas) {
    patterns.push({ id: "gap_social", department: "social-media", type: "risk", description: "Estratégia sem Social Canvas — conteúdo ainda não planejado.", frequency: 1, actionable: true });
  }
  if (input.trafficCanvas && !input.analyticsCanvas) {
    patterns.push({ id: "gap_analytics", department: "analytics", type: "risk", description: "Tráfego pago ativo sem Analytics Canvas — performance não monitorada.", frequency: 1, actionable: true });
  }

  return patterns;
}

// ── Recommendations builder ───────────────────────────────────────────────────

function buildQualityRecommendations(input: QualityEngineInput, patterns: QualityPattern[]): QualityRecommendation[] {
  const recs: QualityRecommendation[] = [];
  let n = 0;

  if (!input.socialCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "social-media", issue: "Social Canvas ausente", recommendation: "Gerar Social Canvas para estruturar o plano de conteúdo antes de produção.", priority: "alta", brainChangeCandidate: false });
  }
  if (!input.designCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "design", issue: "Design Canvas ausente", recommendation: "Gerar Design Canvas para definir direção visual antes de produzir assets.", priority: "media", brainChangeCandidate: false });
  }
  if (!input.analyticsCanvas && input.trafficCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "analytics", issue: "Analytics ausente para tráfego ativo", recommendation: "Criar Analytics Canvas para monitorar performance das campanhas.", priority: "alta", brainChangeCandidate: true });
  }
  if (patterns.some((p) => p.type === "risk")) {
    recs.push({ id: `q_rec_${n++}`, department: "quality", issue: "Riscos identificados no pipeline", recommendation: "Revisar os riscos identificados antes de avançar para a próxima fase.", priority: "alta", brainChangeCandidate: true });
  }
  if (input.analyticsCanvas && (input.analyticsCanvas.recommendations?.length ?? 0) > 0) {
    recs.push({ id: `q_rec_${n++}`, department: "analytics", issue: "Recomendações de analytics pendentes", recommendation: `Executar ${input.analyticsCanvas.recommendations.length} recomendação(ões) do Analytics Canvas.`, priority: "media", brainChangeCandidate: false });
  }

  return recs;
}

// ── Training signals & evidence candidates ────────────────────────────────────

function buildTrainingSignals(input: QualityEngineInput): string[] {
  const signals: string[] = [];
  if (input.strategyCanvas?.status === "approved") signals.push(`Estratégia aprovada para "${input.strategyCanvas.clientName}" — padrão de posicionamento para segmento "${input.strategyCanvas.segment}".`);
  if (input.trafficCanvas?.status === "approved") signals.push(`Traffic Canvas aprovado — padrão de budget e canais para segmento "${input.trafficCanvas.segment}".`);
  if (input.analyticsCanvas?.status === "approved") signals.push(`Analytics Canvas aprovado — modelo de atribuição "${input.analyticsCanvas.attributionLayer?.recommendedModel}" validado.`);
  return signals;
}

function buildEvidenceCandidates(input: QualityEngineInput): string[] {
  const ev: string[] = [];
  if (input.strategyCanvas?.status === "approved") ev.push(`Strategy Canvas aprovado: ${input.strategyCanvas.clientName}`);
  if (input.designCanvas?.status === "approved") ev.push(`Design Canvas aprovado: ${input.designCanvas.clientName}`);
  if (input.trafficCanvas?.status === "approved") ev.push(`Traffic Canvas aprovado com projeção de ROAS: ${input.trafficCanvas.projectedROAS ?? "N/D"}`);
  if (input.analyticsCanvas?.status === "approved") ev.push(`Analytics Canvas aprovado: framework de ${input.analyticsCanvas.kpis?.length ?? 0} KPIs`);
  return ev;
}

// ── Cognitive flow trace ──────────────────────────────────────────────────────

function buildQualityFlowTrace(input: QualityEngineInput) {
  return [
    { stepId: "q_step_1", order: 1, label: "Contexto",       completed: true, summary: "Contexto e escopo do cliente carregados." },
    { stepId: "q_step_2", order: 2, label: "Canvases",        completed: true, summary: `${[input.strategyCanvas, input.socialCanvas, input.designCanvas, input.trafficCanvas, input.analyticsCanvas].filter(Boolean).length} canvas(es) recebido(s) para auditoria.` },
    { stepId: "q_step_3", order: 3, label: "Global Gate",     completed: true, summary: "Quality Gate global executado." },
    { stepId: "q_step_4", order: 4, label: "Dept Gates",      completed: true, summary: "Quality Gates por departamento executados." },
    { stepId: "q_step_5", order: 5, label: "Padrões",         completed: true, summary: "Padrões de força e risco identificados." },
    { stepId: "q_step_6", order: 6, label: "Recomendações",   completed: true, summary: "Recomendações de melhoria geradas." },
    { stepId: "q_step_7", order: 7, label: "Evidências",      completed: true, summary: "Candidatos a evidência identificados." },
    { stepId: "q_step_8", order: 8, label: "Treinamento",     completed: true, summary: "Sinais de treinamento extraídos." },
    { stepId: "q_step_9", order: 9, label: "Governança",      completed: true, summary: "Auditoria registrada para revisão humana." },
  ];
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateQualityCanvas(input: QualityEngineInput): QualityCanvas {
  const primary = input.strategyCanvas ?? input.analyticsCanvas ?? input.trafficCanvas ?? input.designCanvas ?? input.socialCanvas;
  if (!primary) throw new Error("QualityEngine requires at least one upstream canvas.");

  const clientName = primary.clientName;
  const segment    = primary.segment;
  const source     = input.source ?? "simulation";

  // Determine the "main" department being audited
  const auditedDepartment = input.analyticsCanvas ? "analytics"
    : input.trafficCanvas ? "paid-traffic"
    : input.designCanvas  ? "design"
    : input.socialCanvas  ? "social-media"
    : "strategy";

  const auditedCanvasId = input.analyticsCanvas?.id ?? input.trafficCanvas?.id ?? input.designCanvas?.id ?? input.socialCanvas?.id ?? input.strategyCanvas?.id;

  const auditType: QualityAuditType = (input.strategyCanvas && input.trafficCanvas && input.analyticsCanvas)
    ? "cross_dept_audit"
    : "canvas_review";

  // Build dept-specific checks
  const deptCheckSpecs = DEPT_CHECKS[auditedDepartment] ?? [];
  const deptSpecificChecks = deptCheckSpecs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    blocking: spec.blocking,
    pass: spec.getPass(input),
    detail: spec.getDetail(input),
  }));

  // Risk detection
  const hasRisks = input.trafficCanvas
    ? (input.trafficCanvas.qualityGateResult?.overall === "FAIL")
    : false;

  const hasEvidencePath = !!(input.trafficCanvas?.status === "approved" || input.analyticsCanvas?.status === "approved");

  const globalFindings = apurarGlobais(input, { hasRisks, hasEvidencePath });

  const gateResult = runQualityAuditGate({
    clientName, segment, department: auditedDepartment, auditType,
    deptSpecificChecks, globalFindings,
  });

  const patterns     = detectPatterns(input);
  const recs         = buildQualityRecommendations(input, patterns);
  const signals      = buildTrainingSignals(input);
  const evidences    = buildEvidenceCandidates(input);
  const flowTrace    = buildQualityFlowTrace(input);

  const riskFlags = [
    ...(!input.socialCanvas && input.strategyCanvas ? ["Social Media: conteúdo não planejado"] : []),
    ...(!input.analyticsCanvas && input.trafficCanvas ? ["Analytics: performance não monitorada"] : []),
    ...(hasRisks ? ["Traffic: Quality Gate falhou — revisar antes de lançar"] : []),
  ];

  const naoVerificados = gateResult.globalItems
    .concat(gateResult.deptItems)
    .filter((i) => i.status === "UNVERIFIED")
    .map((i) => i.label);

  const keyFindings = [
    `Auditoria de ${auditedDepartment === "strategy" ? "Estratégia" : auditedDepartment === "paid-traffic" ? "Tráfego Pago" : auditedDepartment === "analytics" ? "Analytics" : auditedDepartment === "design" ? "Design" : "Social Media"} — veredicto: ${gateResult.overall}.`,
    `${gateResult.passCount} checks passaram · ${gateResult.warningCount} avisos · ${gateResult.failCount} falhas · ${gateResult.unverifiedCount} NÃO VERIFICADOS.`,
    ...(naoVerificados.length > 0
      ? [`⚠ Sem verificação (não confundir com aprovado): ${naoVerificados.join(", ")}.`]
      : []),
    ...(patterns.filter((p) => p.type === "strength").map((p) => `✓ Força: ${p.description}`).slice(0, 2)),
    ...(patterns.filter((p) => p.type === "risk").map((p) => `⚠ Risco: ${p.description}`).slice(0, 2)),
  ];

  // A frase "Todos os N checks aprovados — qualidade verificada" só pode existir
  // quando NADA ficou por verificar. Enquanto houver `unverifiedCount > 0`, o
  // relatório diz o que de fato aconteceu: parte foi conferida, parte não.
  const verdictRationale = gateResult.overall === "BLOCKED"
    ? `${gateResult.blockingFailures} falha(s) bloqueante(s) detectada(s) — entrega bloqueada até correção.`
    : gateResult.overall === "FAIL"
    ? `${gateResult.failCount} falha(s) não bloqueante(s) — revisão necessária antes de avançar.`
    : gateResult.unverifiedBlocking > 0
    ? `${gateResult.unverifiedCount} check(s) NÃO VERIFICADO(S), ${gateResult.unverifiedBlocking} deles bloqueante(s) — a agência NÃO conferiu ${naoVerificados.slice(0, 3).join(", ")}${naoVerificados.length > 3 ? " e outros" : ""}. Isto não é aprovação: é ausência de verificação, e esta casa não tem revisor humano depois daqui.`
    : gateResult.overall === "WARNING"
    ? `${gateResult.warningCount} aviso(s)${gateResult.unverifiedCount > 0 ? ` e ${gateResult.unverifiedCount} não verificado(s)` : ""} — entrega liberada mas recomenda-se revisão.`
    : `Todos os ${gateResult.passCount} checks executáveis aprovados — nenhum item ficou sem verificação.`;

  return {
    id: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    auditedDepartment,
    auditedCanvasId,
    requestId: input.requestId,
    clientName,
    segment,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    auditType,
    overallVerdict: gateResult.overall,
    verdictRationale,
    gateResult,
    patternsIdentified: patterns,
    riskFlags,
    recommendations: recs,
    trainingSignals: signals,
    evidenceCandidates: evidences,
    keyFindings,
    cognitiveFlowTrace: flowTrace,
  };
}
