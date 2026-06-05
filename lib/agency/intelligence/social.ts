// Rule-based Social Media Intelligence for the Social Media department.
// Generates content plan, posting frequency, formats, and 4-week calendar.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client } from "@/lib/agency/mock-data";

export interface SocialIntelligenceOutput {
  platform: string;
  contentThemes: string[];
  postingFrequency: string;
  formats: string[];
  hashtags: string[];
  copyTone: string;
  fourWeekPlan: string;
  executiveSummary: string;
}

export function runSocialRuleBased(
  project: Project,
  client: Client,
): SocialIntelligenceOutput {
  const bb = client.brandBrain;
  const channelsRaw = bb?.preferredChannels ?? "Instagram";
  const toneOfVoice = bb?.toneOfVoice ?? "natural e direto";
  const positioning = bb?.positioning ?? "marca com propósito";
  const productsToHighlight = bb?.productsToHighlight ?? "produto principal";
  const thingsToAvoid = bb?.thingsToAvoid ?? "";

  const hasInstagram = channelsRaw.toLowerCase().includes("instagram");
  const hasLinkedIn = channelsRaw.toLowerCase().includes("linkedin");
  const hasTikTok = channelsRaw.toLowerCase().includes("tiktok");
  const primaryChannel = hasTikTok
    ? "TikTok"
    : hasInstagram
    ? "Instagram"
    : hasLinkedIn
    ? "LinkedIn"
    : "Instagram";

  const contentThemes = [
    `Autoridade em ${client.industry}`,
    `Bastidores e processo: ${productsToHighlight.slice(0, 40)}`,
    "Depoimentos e prova social",
    "Educação e dicas do nicho",
    `Posicionamento: ${positioning.slice(0, 60)}`,
  ];

  const formats = hasInstagram
    ? [
        "Carrossel (autoridade e salvamentos)",
        "Reels (alcance e descoberta)",
        "Stories (relacionamento diário)",
      ]
    : hasLinkedIn
    ? [
        "Artigos de autoridade",
        "Posts de texto com insights",
        "Vídeos nativos curtos",
      ]
    : [
        "Vídeos nativos (tendências)",
        "Duetos com referências do nicho",
        "POV e storytelling",
      ];

  const hashtags = [
    `#${client.industry.toLowerCase().replace(/\s+/g, "").slice(0, 20)}`,
    `#${primaryChannel.toLowerCase().replace(/\s+/g, "")}marketing`,
    "#marketingdigital",
    "#branding",
    "#conteudo",
  ];

  const postingFrequency = hasTikTok
    ? "5–7 vídeos por semana (algoritmo exige volume)"
    : hasLinkedIn
    ? "3–4 posts por semana (qualidade > frequência)"
    : "4–5 posts + 5 stories por semana";

  const fourWeekPlan = [
    `Semana 1: Apresentação da marca + produto herói (${productsToHighlight.slice(0, 40)}).`,
    "Semana 2: Autoridade + educação do nicho.",
    "Semana 3: Prova social + depoimentos de clientes.",
    "Semana 4: Campanha de engajamento + CTA de conversão.",
  ].join(" ");

  const copyTone = [
    `Tom: ${toneOfVoice.slice(0, 100)}.`,
    thingsToAvoid ? `Evitar: ${thingsToAvoid.slice(0, 80)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const executiveSummary = `Social Intelligence para "${project.name}" (${client.name}): canal principal ${primaryChannel}, ${postingFrequency}. ${contentThemes.length} temas mapeados. Plano de 4 semanas gerado com foco em "${positioning.slice(0, 60)}".`;

  return {
    platform: primaryChannel,
    contentThemes,
    postingFrequency,
    formats,
    hashtags,
    copyTone,
    fourWeekPlan,
    executiveSummary,
  };
}
