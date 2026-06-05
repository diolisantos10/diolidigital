// Rule-based Strategy Intelligence for the Strategy department.
// Produces actionable strategic analysis from client Brand Brain + project data.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client, Briefing } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

export interface StrategyIntelligenceOutput {
  diagnosis: string;
  opportunity: string;
  risk: string;
  positioning: string;
  channels: string[];
  suggestedDeliverables: string[];
  executiveSummary: string;
}

export function runStrategyRuleBased(
  project: Project,
  client: Client,
  briefing?: Briefing,
  materialRequests?: MaterialRequest[],
): StrategyIntelligenceOutput {
  const bb = client.brandBrain;
  const audience = bb?.targetAudience ?? briefing?.audience ?? "público-alvo não definido";
  const positioning = bb?.positioning ?? "posicionamento não mapeado";
  const toneOfVoice = bb?.toneOfVoice ?? "tom não definido";
  const channelsRaw = bb?.preferredChannels ?? "Instagram";
  const pendingMaterials =
    materialRequests?.filter((m) => m.projectId === project.id && m.status === "pending") ?? [];

  const hasInstagram = channelsRaw.toLowerCase().includes("instagram");
  const hasLinkedIn = channelsRaw.toLowerCase().includes("linkedin");
  const hasTikTok = channelsRaw.toLowerCase().includes("tiktok");
  const hasGoogle = channelsRaw.toLowerCase().includes("google");
  const primaryChannel = hasTikTok
    ? "TikTok"
    : hasInstagram
    ? "Instagram"
    : hasLinkedIn
    ? "LinkedIn"
    : "Instagram";

  const channels = [
    ...(hasInstagram ? ["Instagram (orgânico + pago)"] : []),
    ...(hasLinkedIn ? ["LinkedIn (B2B e autoridade)"] : []),
    ...(hasTikTok ? ["TikTok (alcance e descoberta)"] : []),
    ...(hasGoogle ? ["Google Ads (busca e intent)"] : []),
    ...(!hasInstagram && !hasLinkedIn && !hasTikTok && !hasGoogle
      ? ["Instagram (canal padrão)"]
      : []),
  ];

  const goal = project.proposal?.objective ?? project.name;

  const diagnosis = [
    `"${project.name}" para ${client.name} — objetivo: ${goal.slice(0, 100)}.`,
    `Posicionamento atual: ${positioning.slice(0, 120)}.`,
    `Tom de voz: ${toneOfVoice.slice(0, 80)}.`,
    pendingMaterials.length > 0
      ? `${pendingMaterials.length} material(is) pendente(s) do cliente podem bloquear a produção.`
      : "Sem materiais pendentes do cliente.",
  ].join(" ");

  const opportunity = `Audiência "${audience.slice(0, 80)}" ainda não está totalmente capturada. Canal prioritário ${primaryChannel} tem potencial alto de alcance com consistência de marca e frequência adequada.`;

  const risk =
    pendingMaterials.length > 0
      ? `${pendingMaterials.length} item(ns) crítico(s) de material pendente podem bloquear execução. Execução sem alinhamento de posicionamento pode fragmentar a percepção da marca.`
      : "Risco atual controlado. Manter alinhamento de posicionamento entre Social, Design e Tráfego Pago.";

  const suggestedDeliverables = [
    "Documento de posicionamento e pilares de conteúdo",
    `Calendário estratégico 90 dias (${primaryChannel} + canais secundários)`,
    "Mapa de mensagens-chave por audiência",
    "Briefing integrado para Social Media e Design",
    "Plano de lançamento e ativação inicial",
  ];

  const executiveSummary = `Strategy Intelligence para "${project.name}" (${client.name}): foco em ${primaryChannel}, posicionamento "${positioning.slice(0, 60)}". Audiência: ${audience.slice(0, 60)}. ${suggestedDeliverables.length} entregas estratégicas recomendadas. Iniciar pelos pilares de conteúdo antes de qualquer produção em volume.`;

  return {
    diagnosis,
    opportunity,
    risk,
    positioning: `${positioning.slice(0, 200)} — diferenciação por consistência e relevância para ${audience.slice(0, 60)}.`,
    channels,
    suggestedDeliverables,
    executiveSummary,
  };
}
