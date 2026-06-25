// Deliverable builders for all AI-capable departments.
// Both the rule-based engine and the AI provider return the SAME output
// shape, so these builders work identically for either source — guaranteeing
// the UI renders AI and rule-based runs the same way.

import type { Deliverable } from "@/lib/agency/mock-data";
import type { StrategyIntelligenceOutput } from "@/lib/agency/intelligence/strategy";
import type { SocialIntelligenceOutput } from "@/lib/agency/intelligence/social";
import type { PMIntelligenceOutput } from "@/lib/agency/intelligence/pm";
import type { DesignIntelligenceOutput } from "@/lib/agency/intelligence/design";
import type { PaidTrafficIntelligenceOutput } from "@/lib/agency/intelligence/paid-traffic";

export type DeliverableDraft = Omit<Deliverable, "id" | "createdAt">;

export function buildStrategyDeliverable(
  projectName: string,
  projectId: string,
  ownerAgentId: string,
  output: StrategyIntelligenceOutput,
): DeliverableDraft {
  return {
    name: `Inteligência Estratégica — ${projectName}`,
    type: "planning",
    projectId,
    status: "draft",
    version: 1,
    ownerAgentId,
    previewContent: {
      summary: output.executiveSummary,
      sections: [
        { title: "Diagnóstico", body: output.diagnosis },
        { title: "Oportunidade", body: output.opportunity },
        { title: "Risco", body: output.risk },
        { title: "Posicionamento", body: output.positioning },
        { title: "Canais recomendados", body: output.channels.join(", ") },
        { title: "Entregas sugeridas", body: "", items: output.suggestedDeliverables },
      ],
    },
  };
}

export function buildSocialDeliverable(
  projectName: string,
  projectId: string,
  ownerAgentId: string,
  output: SocialIntelligenceOutput,
): DeliverableDraft {
  return {
    name: `Inteligência Social — ${projectName}`,
    type: "planning",
    projectId,
    status: "draft",
    version: 1,
    ownerAgentId,
    previewContent: {
      summary: output.executiveSummary,
      sections: [
        { title: "Canal principal", body: output.platform },
        { title: "Frequência de postagem", body: output.postingFrequency },
        { title: "Temas de conteúdo", body: "", items: output.contentThemes },
        { title: "Formatos", body: "", items: output.formats },
        { title: "Hashtags", body: output.hashtags.join(" ") },
        { title: "Tom de copy", body: output.copyTone },
        { title: "Plano 4 semanas", body: output.fourWeekPlan },
      ],
    },
  };
}

export function buildPMDeliverable(
  projectName: string,
  projectId: string,
  ownerAgentId: string,
  output: PMIntelligenceOutput,
): DeliverableDraft {
  return {
    name: `Inteligência de Gestão — ${projectName}`,
    type: "planning",
    projectId,
    status: "draft",
    version: 1,
    ownerAgentId,
    previewContent: {
      summary: output.executiveSummary,
      sections: [
        { title: "Status do projeto", body: output.projectStatus },
        {
          title: "Bloqueios identificados",
          body: output.blockers.length > 0 ? "" : "Nenhum bloqueio crítico.",
          items: output.blockers.length > 0 ? output.blockers : undefined,
        },
        { title: "Próximas ações", body: "", items: output.nextActions },
        {
          title: "Tarefas sugeridas",
          body: "",
          items: output.suggestedTasks.map(
            (t) => `[${t.urgency.toUpperCase()}] ${t.title} → ${t.owner}`,
          ),
        },
      ],
    },
  };
}

export function buildDesignDeliverable(
  projectName: string,
  projectId: string,
  ownerAgentId: string,
  output: DesignIntelligenceOutput,
): DeliverableDraft {
  return {
    name: `Inteligência de Design — ${projectName}`,
    type: "design",
    projectId,
    status: "draft",
    version: 1,
    ownerAgentId,
    previewContent: {
      summary: output.executiveSummary,
      sections: [
        { title: "Diagnóstico criativo", body: output.creativeDiagnosis },
        { title: "Direção visual", body: output.visualDirection },
        { title: "Riscos de design", body: "", items: output.designRisks },
        { title: "Assets necessários", body: "", items: output.assetRequirements },
        { title: "Ideias de prompt", body: "", items: output.promptIdeas },
        { title: "Recomendações de brief criativo", body: "", items: output.creativeBriefRecommendations },
      ],
    },
  };
}

export function buildTrafficDeliverable(
  projectName: string,
  projectId: string,
  ownerAgentId: string,
  output: PaidTrafficIntelligenceOutput,
): DeliverableDraft {
  return {
    name: `Inteligência de Tráfego — ${projectName}`,
    type: "ads",
    projectId,
    status: "draft",
    version: 1,
    ownerAgentId,
    previewContent: {
      summary: output.executiveSummary,
      sections: [
        { title: "Diagnóstico de campanha", body: output.campaignDiagnosis },
        { title: "Recomendação de funil", body: "", items: output.funnelRecommendation },
        { title: "Estratégia de audiência", body: "", items: output.audienceStrategy },
        { title: "Direção de budget", body: output.budgetDirection },
        { title: "Ângulos de anúncio", body: "", items: output.adAngles },
        { title: "Riscos de otimização", body: "", items: output.optimizationRisks },
      ],
    },
  };
}
