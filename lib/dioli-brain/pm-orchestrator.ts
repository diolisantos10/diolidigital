// PM Agent orchestration logic (server-side only).
// Takes a ClientKnowledgeSnapshot, reasons about it (AI when configured, else
// rule-based), and returns a ProjectProposal. The proposal is always a DRAFT —
// orchestratePMReasoning NEVER mutates state (Law 2). Applying is a separate,
// explicitly-approved route.

import { generate } from "@/lib/ai/generate";
import {
  buildPMOrchestratorMessages,
  validatePMOrchestratorOutput,
} from "@/lib/agency/intelligence/openai-schemas";
import { snapshotBrandBrain, type ClientKnowledgeSnapshot } from "@/lib/dioli-brain/client-snapshot";

export interface TaskProposal {
  title: string;
  description: string;
  department: string; // dept ID
  priority: "critical" | "high" | "medium" | "low";
  estimatedDays: number;
}

export interface ProjectProposal {
  name: string;
  goal: string;
  stage: string;
  tasks: TaskProposal[];
  // "ai" e não "openai": o texto pode vir de Claude, OpenAI, Gemini ou DeepSeek.
  // Quem produziu de fato está em `model`.
  reasoningMode: "ai" | "rule_based";
  model: string;
  warnings: string[];
}

// A chave conectada É o consentimento. BRAIN_AI_DEPARTMENTS agora só serve para
// DESLIGAR: sem a variável, o PM raciocina com IA.
//
// Antes era o contrário, e o efeito era o pior possível: quem conectava a chave
// pela tela via tudo verde e continuava recebendo plano feito por regras fixas,
// sem uma linha na tela dizendo por quê. Um interruptor invisível que faz o
// produto piorar em silêncio não é segurança, é armadilha — e a proteção real
// (cair no rule-based quando a IA falha) continua de pé logo abaixo.
function isPmAiEnabled(): boolean {
  const flag = (process.env.BRAIN_AI_DEPARTMENTS ?? "").trim();
  if (flag === "") return true;
  const depts = flag.split(",").map((s) => s.trim().toLowerCase());
  if (depts.includes("none")) return false;
  return depts.includes("all") || depts.includes("project-management") || depts.includes("pm");
}

// ── Rule-based PM reasoning fallback ──────────────────────────────────────────
// Mirrors the spirit of runPMRuleBased / PMIntelligenceOutput: produce a concrete,
// department-distributed task list grounded in the snapshot. Tasks are seeded by
// the services requested; missing brand-brain fields become alignment tasks
// (never invented data).

export function proposeProjectRuleBased(snapshot: ClientKnowledgeSnapshot): ProjectProposal {
  const warnings: string[] = [];
  const services = snapshot.services.map((s) => s.toLowerCase());
  const wantsSocial = services.some((s) => s.includes("social") || s.includes("conteúdo") || s.includes("conteudo"));
  const wantsTraffic = services.some((s) => s.includes("tráfego") || s.includes("trafego") || s.includes("ads") || s.includes("mídia") || s.includes("midia") || s.includes("paga"));
  const wantsDesign = services.some((s) => s.includes("design") || s.includes("identidade") || s.includes("visual"));

  const tasks: TaskProposal[] = [
    {
      title: `Strategy Room — ${snapshot.businessName}`,
      description: `Definir posicionamento, audiência e direção de comunicação para ${snapshot.businessName} com base no briefing.`,
      department: "strategy",
      priority: "critical",
      estimatedDays: 3,
    },
  ];

  if (wantsSocial || (!wantsTraffic && !wantsDesign)) {
    tasks.push({
      title: "Plano de conteúdo e calendário editorial",
      description: "Estruturar pilares de conteúdo, frequência e calendário do primeiro mês.",
      department: "social-media",
      priority: "high",
      estimatedDays: 4,
    });
  }
  if (wantsDesign) {
    tasks.push({
      title: "Direção visual e briefs criativos",
      description: "Definir conceito visual, paleta e gerar briefs criativos iniciais.",
      department: "design",
      priority: "high",
      estimatedDays: 4,
    });
  }
  if (wantsTraffic) {
    tasks.push({
      title: "Estrutura de campanhas de mídia paga",
      description: "Mapear funil, públicos e distribuição de budget para as campanhas iniciais.",
      department: "paid-traffic",
      priority: "high",
      estimatedDays: 3,
    });
  }

  tasks.push({
    title: "Definir KPIs e cadência de relatório",
    description: "Estabelecer indicadores primários e modelo de acompanhamento de performance.",
    department: "analytics",
    priority: "medium",
    estimatedDays: 2,
  });

  // Missing brand-brain fields → an explicit alignment task instead of inventing.
  if (snapshot.missingFields.length > 0) {
    tasks.push({
      title: "Alinhar Brand Brain com o cliente",
      description: `Coletar campos ausentes antes da produção em escala: ${snapshot.missingFields.join(", ")}.`,
      department: "project-management",
      priority: snapshot.missingFields.length >= 5 ? "high" : "medium",
      estimatedDays: 2,
    });
    warnings.push(`Brand Brain incompleto (${snapshot.missingFields.length} campo(s) ausente(s)) — tarefa de alinhamento adicionada.`);
  }

  const goal =
    snapshot.objectives.length > 0
      ? snapshot.objectives.join("; ")
      : `Estruturar presença de marketing para ${snapshot.businessName}.`;

  return {
    name: `Projeto — ${snapshot.businessName}`,
    goal,
    stage: "briefing",
    tasks,
    reasoningMode: "rule_based",
    model: "rule_based",
    warnings,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────
// Tries AI when configured + enabled; on any failure or incoherent output, falls
// back to the rule-based proposal (Law 1). Never throws for "AI unavailable".

export async function orchestratePMReasoning(
  snapshot: ClientKnowledgeSnapshot,
  workspaceId?: string,
): Promise<ProjectProposal> {
  const ruleBased = proposeProjectRuleBased(snapshot);

  if (!isPmAiEnabled()) {
    return { ...ruleBased, warnings: [...ruleBased.warnings, "IA do PM desligada por configuração (BRAIN_AI_DEPARTMENTS)."] };
  }

  const messages = buildPMOrchestratorMessages({
    businessName: snapshot.businessName,
    segment: snapshot.segment,
    services: snapshot.services,
    objectives: snapshot.objectives,
    rawContext: snapshot.rawContext,
    brandBrain: snapshotBrandBrain(snapshot),
    missingFields: snapshot.missingFields,
  });

  // generate() resolve a chave pela tela de Integrações primeiro e só depois pelo
  // ambiente — é por isso que este caminho trocou de lugar. Antes o PM só via
  // variável de ambiente: com a chave salva pela tela, ele voltava rule-based
  // calado, enquanto todos os outros departamentos raciocinavam com IA.
  const result = await generate({
    system: messages.system,
    user: messages.user,
    maxTokens: 2048,
    workspaceId,
    agentId: "pm-orquestrador",
  });

  if (!result.ok) {
    return { ...ruleBased, warnings: [...ruleBased.warnings, `IA indisponível (${result.error}) — proposta rule-based preservada.`] };
  }

  const validated = validatePMOrchestratorOutput(result.data);
  if (!validated) {
    return { ...ruleBased, warnings: [...ruleBased.warnings, "Resposta da IA inválida — proposta rule-based preservada."] };
  }

  return {
    name: validated.name,
    goal: validated.goal,
    stage: validated.stage,
    tasks: validated.tasks,
    reasoningMode: "ai",
    model: result.model,
    warnings: [],
  };
}
