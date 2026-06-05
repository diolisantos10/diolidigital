// Rule-based Design Intelligence for the Design department.
// Produces creative diagnosis, visual direction, risks, asset requirements,
// prompt ideas, and creative brief recommendations.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client } from "@/lib/agency/mock-data";

export interface DesignIntelligenceOutput {
  creativeDiagnosis: string;
  visualDirection: string;
  designRisks: string[];
  assetRequirements: string[];
  promptIdeas: string[];
  creativeBriefRecommendations: string[];
  executiveSummary: string;
}

export function runDesignRuleBased(
  project: Project,
  client: Client,
): DesignIntelligenceOutput {
  const bb = client.brandBrain;
  const visualStyle = bb?.visualStyle ?? "estilo visual não definido";
  const colors = bb?.colors ?? "paleta de cores não mapeada";
  const fonts = bb?.fonts ?? "tipografia não definida";
  const thingsToAvoid = bb?.thingsToAvoid ?? "";
  const positioning = bb?.positioning ?? "posicionamento não mapeado";
  const productsToHighlight = bb?.productsToHighlight ?? "produto principal";
  const channelsRaw = bb?.preferredChannels ?? "Instagram";

  const hasVisualStyle = !!bb?.visualStyle;
  const hasColors = !!bb?.colors;
  const hasFonts = !!bb?.fonts;
  const hasInstagram = channelsRaw.toLowerCase().includes("instagram");

  const creativeDiagnosis = [
    `Identidade visual de ${client.name} para "${project.name}": ${visualStyle.slice(0, 100)}.`,
    hasColors ? `Paleta mapeada: ${colors.slice(0, 60)}.` : "Paleta de cores ainda não mapeada — risco de inconsistência.",
    hasFonts ? `Tipografia: ${fonts.slice(0, 60)}.` : "Tipografia não definida — necessário antes da produção em escala.",
  ].join(" ");

  const visualDirection = `Construir sistema visual coeso baseado em "${visualStyle.slice(0, 80)}", reforçando o posicionamento "${positioning.slice(0, 60)}". Priorizar templates reutilizáveis para ${hasInstagram ? "Feed e Stories do Instagram" : "os canais principais"} antes de qualquer produção em volume.`;

  const designRisks: string[] = [];
  if (!hasVisualStyle) designRisks.push("Estilo visual não definido — produção sem norte criativo");
  if (!hasColors) designRisks.push("Paleta de cores ausente — risco de inconsistência entre peças");
  if (!hasFonts) designRisks.push("Tipografia não definida — quebra de hierarquia visual");
  if (thingsToAvoid) designRisks.push(`Restrições do Brand Brain non-negotiable: ${thingsToAvoid.slice(0, 60)}`);
  designRisks.push("Design inconsistente entre canais fragmenta a percepção da marca");

  const assetRequirements = [
    "Kit de templates (Feed + Stories)",
    "Guia visual do projeto (cores, tipografia, espaçamento)",
    `Pacote inicial de peças para ${productsToHighlight.slice(0, 40)}`,
    "Identidade de canais (avatares, capas, destaques)",
    hasColors ? "Aplicação da paleta em componentes reutilizáveis" : "Definição e validação da paleta de cores",
  ];

  const promptIdeas = [
    `Mockup de post no estilo "${visualStyle.slice(0, 50)}" com paleta ${hasColors ? colors.slice(0, 40) : "da marca"}`,
    `Template de carrossel educativo sobre ${productsToHighlight.slice(0, 40)}`,
    `Capa de destaque com identidade visual de ${client.name}`,
    "Variações de banner para campanha de lançamento",
  ];

  const creativeBriefRecommendations = [
    `Definir tom visual: ${visualStyle.slice(0, 60)}`,
    `Limitar paleta a 3-4 cores principais${hasColors ? ` (base: ${colors.slice(0, 30)})` : ""}`,
    "Criar 3 templates base antes da produção em escala",
    thingsToAvoid ? `Evitar rigorosamente: ${thingsToAvoid.slice(0, 50)}` : "Validar restrições visuais com o cliente",
  ];

  const executiveSummary = `Design Intelligence para "${project.name}" (${client.name}): ${assetRequirements.length} assets recomendados, ${designRisks.length} risco(s) identificado(s). Foco em sistema visual coeso "${visualStyle.slice(0, 50)}" antes de produção em volume.`;

  return {
    creativeDiagnosis,
    visualDirection,
    designRisks,
    assetRequirements,
    promptIdeas,
    creativeBriefRecommendations,
    executiveSummary,
  };
}
