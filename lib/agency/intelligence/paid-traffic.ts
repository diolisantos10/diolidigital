// Rule-based Paid Traffic Intelligence for the Paid Traffic department.
// Produces campaign diagnosis, funnel recommendation, audience strategy,
// budget direction, ad angles, and optimization risks.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client, StrategyRoom } from "@/lib/agency/mock-data";

export interface PaidTrafficIntelligenceOutput {
  campaignDiagnosis: string;
  funnelRecommendation: string[];
  audienceStrategy: string[];
  budgetDirection: string;
  adAngles: string[];
  optimizationRisks: string[];
  executiveSummary: string;
}

export function runPaidTrafficRuleBased(
  project: Project,
  client: Client,
  strategyRooms: StrategyRoom[],
): PaidTrafficIntelligenceOutput {
  const bb = client.brandBrain;
  const positioning = bb?.positioning ?? "posicionamento não mapeado";
  const audience = bb?.targetAudience ?? "público-alvo não definido";
  const productsToHighlight = bb?.productsToHighlight ?? "produto principal";
  const channelsRaw = bb?.preferredChannels ?? "Instagram";

  const hasMeta =
    channelsRaw.toLowerCase().includes("instagram") ||
    channelsRaw.toLowerCase().includes("facebook") ||
    channelsRaw.toLowerCase().includes("meta");
  const hasGoogle =
    channelsRaw.toLowerCase().includes("google") ||
    channelsRaw.toLowerCase().includes("seo") ||
    channelsRaw.toLowerCase().includes("search");
  const platform = hasMeta && hasGoogle
    ? "Meta Ads + Google Ads"
    : hasGoogle
    ? "Google Ads"
    : "Meta Ads";

  const hasStrategyRoom = strategyRooms.some((sr) => sr.projectId === project.id);
  const objective = project.proposal?.objective ?? project.name;

  const campaignDiagnosis = [
    `Campanha de tráfego para "${project.name}" (${client.name}) — objetivo: ${objective.slice(0, 80)}.`,
    `Plataforma recomendada: ${platform}.`,
    hasStrategyRoom
      ? "Strategy Room disponível — direção estratégica alinhada."
      : "Sem Strategy Room — recomendado gerar antes de escalar budget.",
  ].join(" ");

  const funnelRecommendation = [
    `Topo (Awareness): ${platform} — alcance e reconhecimento de ${productsToHighlight.slice(0, 40)}`,
    "Meio (Consideração): remarketing de engajamento + conteúdo de autoridade",
    "Fundo (Conversão): públicos quentes + oferta direta com CTA forte",
  ];

  const audienceStrategy = [
    `Público frio: interesses ligados a "${audience.slice(0, 50)}"`,
    "Público morno: engajamento social + visitantes do site (remarketing)",
    "Público quente: lista de clientes + lookalike 1-3%",
    `Segmentação alinhada ao posicionamento: ${positioning.slice(0, 50)}`,
  ];

  const budgetDirection = `Iniciar com budget de teste dividido 60% topo / 25% meio / 15% fundo. Validar criativos vencedores antes de escalar. ${platform === "Meta Ads + Google Ads" ? "Dividir verba entre Meta (descoberta) e Google (intenção de busca)." : `Concentrar em ${platform} no início para acelerar aprendizado do algoritmo.`}`;

  const adAngles = [
    `Dor → Solução: como ${productsToHighlight.slice(0, 30)} resolve o problema do cliente`,
    "Prova social: depoimentos e resultados reais",
    `Autoridade: por que ${client.name} é a escolha certa`,
    "Urgência/Oferta: gatilho de ação imediata",
  ];

  const optimizationRisks: string[] = [];
  if (!hasStrategyRoom) optimizationRisks.push("Sem Strategy Room — campanhas podem desviar do posicionamento");
  optimizationRisks.push("CPA acima do target por 3 dias → pausar e revisar criativos");
  optimizationRisks.push("Fadiga de criativo: rotacionar peças a cada 7-10 dias");
  optimizationRisks.push("Públicos amplos demais diluem orçamento — segmentar e testar");
  if (!bb?.targetAudience) optimizationRisks.push("Público-alvo não mapeado no Brand Brain — segmentação no escuro");

  const executiveSummary = `Paid Traffic Intelligence para "${project.name}" (${client.name}): plataforma ${platform}, funil de 3 etapas, ${adAngles.length} ângulos de anúncio. ${optimizationRisks.length} risco(s) de otimização mapeado(s). ${hasStrategyRoom ? "Strategy Room ativa." : "Recomendado gerar Strategy Room antes de escalar."}`;

  return {
    campaignDiagnosis,
    funnelRecommendation,
    audienceStrategy,
    budgetDirection,
    adAngles,
    optimizationRisks,
    executiveSummary,
  };
}
