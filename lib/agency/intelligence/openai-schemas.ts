// Isomorphic OpenAI prompt builders + output validators for department intelligence.
// NO secrets, NO network calls here — safe to import on both server and client.
// The server route (app/api/ai/run) builds messages from these and calls OpenAI;
// validators guarantee the response matches the rule-based output shape so the
// rest of the app (deliverable builders, UI) works identically.

import type { StrategyIntelligenceOutput } from "@/lib/agency/intelligence/strategy";
import type { SocialIntelligenceOutput } from "@/lib/agency/intelligence/social";
import type { PMIntelligenceOutput, PMSuggestedTask } from "@/lib/agency/intelligence/pm";
import type { DesignIntelligenceOutput } from "@/lib/agency/intelligence/design";
import type { PaidTrafficIntelligenceOutput } from "@/lib/agency/intelligence/paid-traffic";

// Analytics / Quality have no rule-based *IntelligenceOutput type — the flat AI
// JSON shape is defined here (matches the canvas fields the route overlays).
export interface AnalyticsIntelligenceOutput {
  primaryKPIs: string[];
  reportingCadence: string;
  attributionModel: string;
  keyInsights: string[];
  performanceGaps: string[];
  recommendations: string[];
  executiveSummary: string;
}

export interface QualityIntelligenceOutput {
  overallVerdict: "PASS" | "WARNING" | "FAIL";
  criticalFindings: string[];
  recommendations: string[];
  patternNotes: string[];
  executiveSummary: string;
}

// Department ids supported by /api/ai/run (both OpenAI and Claude providers).
export const OPENAI_DEPARTMENTS = [
  "strategy", "social-media", "project-management", "design", "paid-traffic",
] as const;

// Brain reasoning-dept ids (used by the /api/brain/reason gateway). All 6 depts
// now have an AI prompt builder + validator (Phase 4).
export const BRAIN_AI_DEPTS = [
  "strategy", "social", "design", "traffic", "analytics", "quality",
] as const;
export type BrainAiDept = (typeof BRAIN_AI_DEPTS)[number];
export type OpenAIDepartmentId = (typeof OPENAI_DEPARTMENTS)[number];

export function isOpenAIDepartment(id: string): id is OpenAIDepartmentId {
  return (OPENAI_DEPARTMENTS as readonly string[]).includes(id);
}

// Flattened, serializable context the client sends to the server route.
// Only includes data the authenticated internal user already has — no secrets.
export interface AIRunContext {
  projectName: string;
  projectGoal?: string;
  clientName: string;
  clientIndustry: string;
  // Portal-safe brand fields, already in the internal user's store
  brandBrain?: Record<string, string>;
  briefingAudience?: string;
  pendingMaterialCount?: number;
  // PM-specific snapshot
  stage?: string;
  deliverablesCount?: number;
  inReviewCount?: number;
  revisionCount?: number;
  hasStrategyRoom?: boolean;
  // Department prompt / instructions (operator-editable)
  prompt: string;
}

/** Um turno anterior da conversa. `assistant` é a fala da casa. */
export interface TurnoDeHistorico {
  role: "user" | "assistant";
  content: string;
}

export interface OpenAIMessages {
  system: string;
  user: string;
  /**
   * OS TURNOS ANTERIORES, quando o chamador for uma CONVERSA e não um pedido
   * de turno único.
   *
   * OPCIONAL, e ausente por padrão — de propósito. Os 29 chamadores desta casa
   * (PM, esteira, radar, qualificação…) mandam `{system, user}` e continuam
   * mandando exatamente isso: são pedidos de turno único, e para eles nada
   * muda. Quem precisa disto é o SDR, que é a única conversa de verdade da
   * casa — até 18 turnos alternados — e que por não caber aqui vinha falando
   * direto com a Anthropic, com o modelo escrito na mão desde 24/06.
   *
   * O histórico entra ANTES do `user` em todo provedor; `user` continua sendo
   * a fala da vez.
   */
  historico?: TurnoDeHistorico[];
}

function brandBrainBlock(ctx: AIRunContext): string {
  const bb = ctx.brandBrain ?? {};
  const lines = Object.entries(bb)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${v}`);
  return lines.length > 0 ? lines.join("\n") : "(Brand Brain incompleto ou ausente)";
}

// ─── Message builders ─────────────────────────────────────────────────────────

export function buildStrategyMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Strategy Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "diagnosis": string,
  "opportunity": string,
  "risk": string,
  "positioning": string,
  "channels": string[],
  "suggestedDeliverables": string[],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;

  const user = `Projeto: "${ctx.projectName}"
Objetivo: ${ctx.projectGoal ?? ctx.projectName}
Cliente: ${ctx.clientName} (${ctx.clientIndustry})
Audiência (briefing): ${ctx.briefingAudience ?? "não informada"}
Materiais pendentes do cliente: ${ctx.pendingMaterialCount ?? 0}

Brand Brain:
${brandBrainBlock(ctx)}

Gere uma análise estratégica acionável (diagnóstico, oportunidade, risco, posicionamento, canais recomendados, entregas sugeridas e resumo executivo).`;

  return { system, user };
}

export function buildSocialMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Social Media Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "platform": string,
  "contentThemes": string[],
  "postingFrequency": string,
  "formats": string[],
  "hashtags": string[],
  "copyTone": string,
  "fourWeekPlan": string,
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;

  const user = `Projeto: "${ctx.projectName}"
Cliente: ${ctx.clientName} (${ctx.clientIndustry})

Brand Brain:
${brandBrainBlock(ctx)}

Gere uma estratégia de redes sociais (canal principal, pilares/temas de conteúdo, frequência de postagem, formatos, hashtags, tom de copy, plano de 4 semanas e resumo executivo).`;

  return { system, user };
}

export function buildPMMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o PM Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "projectStatus": string,
  "blockers": string[],
  "nextActions": string[],
  "suggestedTasks": [{ "title": string, "owner": string, "urgency": "critical"|"high"|"medium"|"low" }],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;

  const user = `Projeto: "${ctx.projectName}" — fase: ${ctx.stage ?? "desconhecida"}
Cliente: ${ctx.clientName} (${ctx.clientIndustry})
Entregas produzidas: ${ctx.deliverablesCount ?? 0}, em revisão: ${ctx.inReviewCount ?? 0}, com revisão solicitada: ${ctx.revisionCount ?? 0}
Strategy Room gerada: ${ctx.hasStrategyRoom ? "sim" : "não"}
Materiais pendentes do cliente: ${ctx.pendingMaterialCount ?? 0}

Gere um diagnóstico de gestão (status, bloqueios, próximas ações, tarefas sugeridas com urgência e resumo executivo).`;

  return { system, user };
}

// ── PM Orchestrator ───────────────────────────────────────────────────────────
// Distinct from buildPMMessages (which diagnoses an existing project). The
// orchestrator turns a client briefing/snapshot into a full project proposal:
// name, goal, stage, and a department-distributed task list. Output is a DRAFT —
// the server never auto-applies it (Law 2).

// Minimal snapshot shape the orchestrator prompt needs. Kept structural (not an
// import of the server-only snapshot module) so this file stays isomorphic.
export interface PMOrchestratorInput {
  businessName: string;
  segment: string;
  services: string[];
  objectives: string[];
  rawContext: string;
  brandBrain?: Record<string, string>;
  missingFields?: string[];
}

export function buildPMOrchestratorMessages(input: PMOrchestratorInput): OpenAIMessages {
  const bb = Object.entries(input.brandBrain ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${v}`);
  const brandBlock = bb.length > 0 ? bb.join("\n") : "(Brand Brain incompleto ou ausente)";

  const system = `Você é o PM Orchestrator da Dioli Agência. Responda SEMPRE em português do Brasil.
A partir do briefing do cliente, proponha UM projeto com tarefas distribuídas por departamento.
Departamentos válidos (use exatamente estes ids no campo "department"):
strategy, social-media, design, paid-traffic, analytics, branding.
NUNCA use "project-management": coordenar o projeto é o seu próprio trabalho, não uma entrega do plano.
NUNCA invente fatos ausentes — se faltar informação, gere uma tarefa de coleta/alinhamento.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "name": string,
  "goal": string,
  "stage": string,
  "tasks": [{ "title": string, "description": string, "department": string, "priority": "critical"|"high"|"medium"|"low", "estimatedDays": number }]
}
Não inclua texto fora do JSON.`;

  const user = `Cliente: ${input.businessName} (${input.segment || "segmento não informado"})
Serviços contratados/desejados: ${input.services.length > 0 ? input.services.join(", ") : "não informados"}
Objetivos: ${input.objectives.length > 0 ? input.objectives.join("; ") : "não informados"}
Contexto: ${input.rawContext.slice(0, 600) || "(sem contexto adicional)"}
${input.missingFields && input.missingFields.length > 0 ? `Campos ausentes no Brand Brain: ${input.missingFields.join(", ")}` : ""}

Brand Brain:
${brandBlock}

Gere um plano de projeto acionável (nome, objetivo, estágio inicial e 4–8 tarefas distribuídas pelos departamentos relevantes, com prioridade e estimativa em dias).`;

  return { system, user };
}

const PRIORITIES = ["critical", "high", "medium", "low"];
// ── POR QUE `project-management` SAIU DAQUI (8ª volta, 26/08/2026) ──────────
//
// MEDIDO EM PRODUÇÃO: `gerente_geral_recusou_demanda` — *"O Gerente Geral não
// despacha para si mesmo — demanda que volta para o topo não anda."*
//
// A trava está CERTA e não se afrouxa. Quem estava errado é quem chamava: no
// manifesto (`architecture.manifest.json`), o gerente do departamento
// `project-management` é o próprio `gerente-geral`. Então TODA tarefa que
// nascesse com esse departamento produzia, por construção, um despacho do
// Gerente Geral para ele mesmo — e uma recusa. Não era um caso de borda: era
// aritmética da cadeia de comando, e acontecia sempre.
//
// A porta que oferecia o departamento ao modelo era esta lista. Ela oferece
// agora `branding`, que existe no catálogo, tem gerente de verdade
// (`manager-branding`) e é onde mora o Brand Brain — que era justamente o
// assunto da tarefa que a casa recusava ("Alinhar Brand Brain com o cliente").
//
// ⚠️ Coordenação de projeto não vira tarefa do plano em lugar nenhum: o Gerente
// Geral coordena por ser o Gerente Geral, não por receber um card. Reintroduzir
// `project-management` aqui é reintroduzir a recusa.
const ORCHESTRATOR_DEPTS = ["strategy", "social-media", "design", "paid-traffic", "analytics", "branding"];

export interface ValidatedTaskProposal {
  title: string;
  description: string;
  department: string;
  priority: "critical" | "high" | "medium" | "low";
  estimatedDays: number;
}

export interface ValidatedProjectProposal {
  name: string;
  goal: string;
  stage: string;
  tasks: ValidatedTaskProposal[];
}

export function validatePMOrchestratorOutput(raw: unknown): ValidatedProjectProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isStr(o.name) || !isStr(o.goal) || !isStr(o.stage) || !Array.isArray(o.tasks)) return null;
  const tasks: ValidatedTaskProposal[] = [];
  for (const t of o.tasks as unknown[]) {
    if (!t || typeof t !== "object") return null;
    const tt = t as Record<string, unknown>;
    if (!isStr(tt.title) || !isStr(tt.description)) return null;
    if (!isStr(tt.department) || !ORCHESTRATOR_DEPTS.includes(tt.department)) return null;
    if (!isStr(tt.priority) || !PRIORITIES.includes(tt.priority)) return null;
    const days = typeof tt.estimatedDays === "number" && tt.estimatedDays > 0 ? Math.round(tt.estimatedDays) : 3;
    tasks.push({
      title: tt.title,
      description: tt.description,
      department: tt.department,
      priority: tt.priority as ValidatedTaskProposal["priority"],
      estimatedDays: days,
    });
  }
  if (tasks.length === 0) return null;
  return { name: o.name, goal: o.goal, stage: o.stage, tasks };
}

// ── Design / Traffic / Analytics / Quality builders (Phase 4) ──────────────────

export function buildDesignMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Design Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "creativeDiagnosis": string,
  "visualDirection": string,
  "designRisks": string[],
  "assetRequirements": string[],
  "promptIdeas": string[],
  "creativeBriefRecommendations": string[],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;
  const user = `Projeto: "${ctx.projectName}"
Cliente: ${ctx.clientName} (${ctx.clientIndustry})

Brand Brain:
${brandBrainBlock(ctx)}

Gere uma direção criativa (diagnóstico, direção visual, riscos, requisitos de assets, ideias de prompt, recomendações de brief e resumo executivo).`;
  return { system, user };
}

export function buildTrafficMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Ads Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "campaignDiagnosis": string,
  "funnelRecommendation": string[],
  "audienceStrategy": string[],
  "budgetDirection": string,
  "adAngles": string[],
  "optimizationRisks": string[],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;
  const user = `Projeto: "${ctx.projectName}"
Cliente: ${ctx.clientName} (${ctx.clientIndustry})
Objetivo: ${ctx.projectGoal ?? ctx.projectName}

Brand Brain:
${brandBrainBlock(ctx)}

Gere um plano de tráfego pago (diagnóstico, funil, estratégia de público, direção de budget, ângulos de anúncio, riscos de otimização e resumo executivo).`;
  return { system, user };
}

export function buildAnalyticsMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Analytics Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "primaryKPIs": string[],
  "reportingCadence": string,
  "attributionModel": string,
  "keyInsights": string[],
  "performanceGaps": string[],
  "recommendations": string[],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;
  const user = `Projeto: "${ctx.projectName}"
Cliente: ${ctx.clientName} (${ctx.clientIndustry})
Objetivo: ${ctx.projectGoal ?? ctx.projectName}

Brand Brain:
${brandBrainBlock(ctx)}

Gere um framework de analytics (KPIs primários, cadência de relatório, modelo de atribuição, insights-chave, gaps de performance, recomendações e resumo executivo).`;
  return { system, user };
}

export function buildQualityMessages(ctx: AIRunContext): OpenAIMessages {
  const system = `${ctx.prompt}

Você é o Quality Agent da Dioli Agência. Responda SEMPRE em português do Brasil.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{
  "overallVerdict": "PASS"|"WARNING"|"FAIL",
  "criticalFindings": string[],
  "recommendations": string[],
  "patternNotes": string[],
  "executiveSummary": string
}
Não inclua texto fora do JSON.`;
  const user = `Projeto: "${ctx.projectName}"
Cliente: ${ctx.clientName} (${ctx.clientIndustry})

Brand Brain:
${brandBrainBlock(ctx)}

Audite os entregáveis do projeto contra padrões de qualidade (veredito geral, achados críticos, recomendações, notas de padrão e resumo executivo).`;
  return { system, user };
}

export function validateDesignOutput(raw: unknown): DesignIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.creativeDiagnosis) && isStr(o.visualDirection) && isStrArr(o.designRisks) &&
    isStrArr(o.assetRequirements) && isStrArr(o.promptIdeas) &&
    isStrArr(o.creativeBriefRecommendations) && isStr(o.executiveSummary)
  ) {
    return {
      creativeDiagnosis: o.creativeDiagnosis,
      visualDirection: o.visualDirection,
      designRisks: o.designRisks,
      assetRequirements: o.assetRequirements,
      promptIdeas: o.promptIdeas,
      creativeBriefRecommendations: o.creativeBriefRecommendations,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

export function validateTrafficOutput(raw: unknown): PaidTrafficIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.campaignDiagnosis) && isStrArr(o.funnelRecommendation) && isStrArr(o.audienceStrategy) &&
    isStr(o.budgetDirection) && isStrArr(o.adAngles) && isStrArr(o.optimizationRisks) &&
    isStr(o.executiveSummary)
  ) {
    return {
      campaignDiagnosis: o.campaignDiagnosis,
      funnelRecommendation: o.funnelRecommendation,
      audienceStrategy: o.audienceStrategy,
      budgetDirection: o.budgetDirection,
      adAngles: o.adAngles,
      optimizationRisks: o.optimizationRisks,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

export function validateAnalyticsOutput(raw: unknown): AnalyticsIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStrArr(o.primaryKPIs) && isStr(o.reportingCadence) && isStr(o.attributionModel) &&
    isStrArr(o.keyInsights) && isStrArr(o.performanceGaps) && isStrArr(o.recommendations) &&
    isStr(o.executiveSummary)
  ) {
    return {
      primaryKPIs: o.primaryKPIs,
      reportingCadence: o.reportingCadence,
      attributionModel: o.attributionModel,
      keyInsights: o.keyInsights,
      performanceGaps: o.performanceGaps,
      recommendations: o.recommendations,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

const QUALITY_VERDICTS = ["PASS", "WARNING", "FAIL"];

export function validateQualityOutput(raw: unknown): QualityIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.overallVerdict) && QUALITY_VERDICTS.includes(o.overallVerdict) &&
    isStrArr(o.criticalFindings) && isStrArr(o.recommendations) &&
    isStrArr(o.patternNotes) && isStr(o.executiveSummary)
  ) {
    return {
      overallVerdict: o.overallVerdict as QualityIntelligenceOutput["overallVerdict"],
      criticalFindings: o.criticalFindings,
      recommendations: o.recommendations,
      patternNotes: o.patternNotes,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

// Dispatch by Brain reasoning-dept id (Phase 4). Used by /api/brain/reason.
export function buildBrainMessages(dept: BrainAiDept, ctx: AIRunContext): OpenAIMessages {
  switch (dept) {
    case "strategy":  return buildStrategyMessages(ctx);
    case "social":    return buildSocialMessages(ctx);
    case "design":    return buildDesignMessages(ctx);
    case "traffic":   return buildTrafficMessages(ctx);
    case "analytics": return buildAnalyticsMessages(ctx);
    case "quality":   return buildQualityMessages(ctx);
  }
}

export function buildMessages(departmentId: OpenAIDepartmentId, ctx: AIRunContext): OpenAIMessages {
  switch (departmentId) {
    case "strategy":          return buildStrategyMessages(ctx);
    case "social-media":      return buildSocialMessages(ctx);
    case "project-management": return buildPMMessages(ctx);
    case "design":            return buildDesignMessages(ctx);
    case "paid-traffic":      return buildTrafficMessages(ctx);
  }
}

// ─── Validators ───────────────────────────────────────────────────────────────

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateStrategyOutput(raw: unknown): StrategyIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.diagnosis) &&
    isStr(o.opportunity) &&
    isStr(o.risk) &&
    isStr(o.positioning) &&
    isStrArr(o.channels) &&
    isStrArr(o.suggestedDeliverables) &&
    isStr(o.executiveSummary)
  ) {
    return {
      diagnosis: o.diagnosis,
      opportunity: o.opportunity,
      risk: o.risk,
      positioning: o.positioning,
      channels: o.channels,
      suggestedDeliverables: o.suggestedDeliverables,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

export function validateSocialOutput(raw: unknown): SocialIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.platform) &&
    isStrArr(o.contentThemes) &&
    isStr(o.postingFrequency) &&
    isStrArr(o.formats) &&
    isStrArr(o.hashtags) &&
    isStr(o.copyTone) &&
    isStr(o.fourWeekPlan) &&
    isStr(o.executiveSummary)
  ) {
    return {
      platform: o.platform,
      contentThemes: o.contentThemes,
      postingFrequency: o.postingFrequency,
      formats: o.formats,
      hashtags: o.hashtags,
      copyTone: o.copyTone,
      fourWeekPlan: o.fourWeekPlan,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}

const URGENCIES = ["critical", "high", "medium", "low"];

export function validatePMOutput(raw: unknown): PMIntelligenceOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isStr(o.projectStatus) &&
    isStrArr(o.blockers) &&
    isStrArr(o.nextActions) &&
    Array.isArray(o.suggestedTasks) &&
    isStr(o.executiveSummary)
  ) {
    const tasks: PMSuggestedTask[] = [];
    for (const t of o.suggestedTasks as unknown[]) {
      if (!t || typeof t !== "object") return null;
      const tt = t as Record<string, unknown>;
      if (!isStr(tt.title) || !isStr(tt.owner) || !isStr(tt.urgency) || !URGENCIES.includes(tt.urgency)) {
        return null;
      }
      tasks.push({
        title: tt.title,
        owner: tt.owner,
        urgency: tt.urgency as PMSuggestedTask["urgency"],
      });
    }
    return {
      projectStatus: o.projectStatus,
      blockers: o.blockers,
      nextActions: o.nextActions,
      suggestedTasks: tasks,
      executiveSummary: o.executiveSummary,
    };
  }
  return null;
}
