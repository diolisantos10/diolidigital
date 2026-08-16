import type { SimulationRun, AgentImprovementSuggestion, ImprovementImpact } from "./types";

interface IssuePattern {
  criterionId:     string;
  title:           string;
  problem:         string;
  suggestedChange: string;
  impact:          ImprovementImpact;
}

const ISSUE_PATTERNS: IssuePattern[] = [
  {
    criterionId:     "no_unresolved_objection",
    title:           "SDR encerra conversas com objeção de preço ativa",
    problem:
      "Em múltiplas simulações, o SDR chegou ao limite de turns sem resolver objeções de preço. O prospect não pode enviar proposta enquanto há objeção ativa.",
    suggestedChange:
      "Quando detectar price_too_high ou wants_cheaper, forçar pergunta de budget máximo antes de sugerir plano alternativo. Não encerrar fluxo sem resolução explícita.",
    impact: "critical",
  },
  {
    criterionId:     "identity_captured",
    title:           "SDR não captura identidade completa do prospect",
    problem:
      "Em múltiplas simulações, o prospect chegou ao final da conversa sem fornecer e-mail ou telefone, impedindo o envio da proposta.",
    suggestedChange:
      "Priorizar perguntas de identidade (e-mail + WhatsApp) antes das perguntas de serviço e frequência. Não avançar para pricing sem identidade completa.",
    impact: "high",
  },
  {
    criterionId:     "qualifying_complete",
    title:           "SDR não qualifica prospect suficientemente",
    problem:
      "Conversas encerrando sem capturar objetivo do cliente, frequência de posts ou budget. Escopo incompleto gera propostas fracas.",
    suggestedChange:
      "Adicionar verificação de qualificação mínima: nome+negócio, serviço, frequência/volume e budget antes de apresentar estimativa final.",
    impact: "medium",
  },
  {
    criterionId:     "viable_scope",
    title:           "SDR produz escopo com confiança baixa",
    problem:
      "Estimativas finais com confidence 'none' ou 'low' em múltiplas simulações, indicando que o SDR não coletou informações suficientes antes de encerrar.",
    suggestedChange:
      "Perguntar sobre frequência de posts e tipo de serviço desejado antes de apresentar qualquer estimativa. Não encerrar antes de confidence >= 'medium'.",
    impact: "high",
  },
  {
    criterionId:     "objection_handled",
    title:           "SDR não negocia quando cliente objeta ao preço",
    problem:
      "Quando o cliente objeta ao preço, o SDR não propõe plano ajustado nem pergunta budget máximo. A objeção fica sem resposta estruturada.",
    suggestedChange:
      "Ao detectar objection_types com price_too_high: executar buildPriceObjectionReply com parsedBudget antes de qualquer outro fluxo. Propor ENXUGAR o escopo (menos peças, tráfego pago depois) quando budget < estimativa atual — nunca citar plano nem valor: o catálogo é lib/agency/planos.ts e quem cota é o orçamento, depois do login.",
    impact: "critical",
  },
  {
    criterionId:     "restaurant_specifics",
    title:           "SDR não trata restaurantes de forma consultiva",
    problem:
      "Em simulações com segmento restaurante, SDR não pergunta sobre frequência de posts de forma consultiva nem aborda especificidades do setor.",
    suggestedChange:
      "Para isRestaurant === true, sempre substituir questão genérica de posts por buildConsultativeFrequencyQuestion antes de budget. Mencionar presença em stories como diferencial.",
    impact: "medium",
  },
  {
    criterionId:     "service_identified",
    title:           "SDR encerra sem identificar serviço desejado",
    problem:
      "Em múltiplas simulações, a conversa encerrou sem que o prospect indicasse qual serviço precisa (social media, tráfego ou branding).",
    suggestedChange:
      "Após captura de identidade, sempre perguntar explicitamente qual serviço o prospect busca antes de avançar para frequência ou budget.",
    impact: "high",
  },
];

const MIN_RUNS = 2;

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateImprovementSuggestions(
  runs: SimulationRun[],
  existingSuggestions: AgentImprovementSuggestion[],
): AgentImprovementSuggestion[] {
  const failedByCriterion = new Map<string, SimulationRun[]>();

  for (const run of runs) {
    for (const issue of run.issues) {
      const existing = failedByCriterion.get(issue.criterion) ?? [];
      failedByCriterion.set(issue.criterion, [...existing, run]);
    }
  }

  const newSuggestions: AgentImprovementSuggestion[] = [];

  for (const pattern of ISSUE_PATTERNS) {
    const failedRuns = failedByCriterion.get(pattern.criterionId) ?? [];
    if (failedRuns.length < MIN_RUNS) continue;

    const alreadyExists = existingSuggestions.some(
      (s) => s.agentId === "sdr" && s.title === pattern.title && s.status !== "rejected",
    );
    if (alreadyExists) continue;

    const examples = failedRuns
      .slice(0, 3)
      .map((r) => `• ${r.scenarioName} (score ${r.score})`)
      .join("\n");

    newSuggestions.push({
      id:             `imp_${uid()}`,
      agentId:        "sdr",
      sourceRunIds:   failedRuns.map((r) => r.id),
      title:          pattern.title,
      problem:        pattern.problem,
      evidence:       `Detectado em ${failedRuns.length} simulação(ões):\n${examples}`,
      suggestedChange: pattern.suggestedChange,
      impact:         pattern.impact,
      status:         "pending",
      createdAt:      new Date().toISOString(),
    });
  }

  return newSuggestions;
}
