// Rule-based Brand Hub Intelligence for the Brand Hub department.
// Audits the client's Brand Brain: diagnosis, missing information,
// positioning gaps, tone/style consistency issues, recommended brand updates.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Client, BrandBrain } from "@/lib/agency/mock-data";

export interface BrandHubIntelligenceOutput {
  brandDiagnosis: string;
  missingInformation: string[];
  positioningGaps: string[];
  consistencyIssues: string[];
  recommendedBrandUpdates: { field: string; suggestion: string }[];
  completeness: number; // 0-100
  executiveSummary: string;
}

// Core Brand Brain fields and their human labels for completeness scoring.
const CORE_FIELDS: { key: keyof BrandBrain; label: string }[] = [
  { key: "businessSummary", label: "Resumo do negócio" },
  { key: "positioning", label: "Posicionamento" },
  { key: "targetAudience", label: "Público-alvo" },
  { key: "toneOfVoice", label: "Tom de voz" },
  { key: "visualStyle", label: "Estilo visual" },
  { key: "brandRules", label: "Regras de marca" },
  { key: "productsToHighlight", label: "Produtos a destacar" },
  { key: "thingsToAvoid", label: "Coisas a evitar" },
  { key: "preferredChannels", label: "Canais preferenciais" },
];

const EXTENDED_FIELDS: { key: keyof BrandBrain; label: string }[] = [
  { key: "colors", label: "Paleta de cores" },
  { key: "fonts", label: "Tipografia" },
  { key: "references", label: "Referências visuais" },
];

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function runBrandHubRuleBased(client: Client): BrandHubIntelligenceOutput {
  const bb = client.brandBrain;

  if (!bb) {
    return {
      brandDiagnosis: `${client.name} não possui Brand Brain configurado. Toda a estrutura de marca precisa ser criada antes de qualquer execução.`,
      missingInformation: CORE_FIELDS.map((f) => f.label),
      positioningGaps: ["Posicionamento inexistente — base estratégica ausente"],
      consistencyIssues: ["Sem Brand Brain, não há referência para verificar consistência"],
      recommendedBrandUpdates: CORE_FIELDS.map((f) => ({
        field: f.label,
        suggestion: `Preencher "${f.label}" no Brand Brain do cliente`,
      })),
      completeness: 0,
      executiveSummary: `Brand Hub Intelligence para ${client.name}: Brand Brain ausente. 0% de completude — criação completa necessária.`,
    };
  }

  const missingCore = CORE_FIELDS.filter((f) => !isFilled(bb[f.key]));
  const missingExtended = EXTENDED_FIELDS.filter((f) => !isFilled(bb[f.key]));
  const filledCore = CORE_FIELDS.length - missingCore.length;
  const completeness = Math.round((filledCore / CORE_FIELDS.length) * 100);

  const missingInformation = [
    ...missingCore.map((f) => f.label),
    ...missingExtended.map((f) => `${f.label} (recomendado)`),
  ];

  const positioningGaps: string[] = [];
  if (!isFilled(bb.positioning)) {
    positioningGaps.push("Posicionamento não definido — diferenciação de mercado ausente");
  } else if ((bb.positioning ?? "").length < 40) {
    positioningGaps.push("Posicionamento muito curto — falta clareza sobre o diferencial");
  }
  if (!isFilled(bb.targetAudience)) {
    positioningGaps.push("Público-alvo não mapeado — posicionamento sem destinatário claro");
  }
  if (isFilled(bb.positioning) && isFilled(bb.targetAudience) && positioningGaps.length === 0) {
    positioningGaps.push("Posicionamento e público alinhados — validar contra concorrência atual");
  }

  const consistencyIssues: string[] = [];
  if (!isFilled(bb.toneOfVoice)) {
    consistencyIssues.push("Tom de voz não definido — risco de comunicação inconsistente entre canais");
  }
  if (!isFilled(bb.visualStyle)) {
    consistencyIssues.push("Estilo visual não definido — Design sem direção criativa");
  }
  if (isFilled(bb.visualStyle) && !isFilled(bb.colors)) {
    consistencyIssues.push("Estilo visual definido mas sem paleta de cores — inconsistência potencial");
  }
  if (isFilled(bb.toneOfVoice) && !isFilled(bb.thingsToAvoid)) {
    consistencyIssues.push("Tom definido mas sem 'coisas a evitar' — falta guardrail de comunicação");
  }
  if (consistencyIssues.length === 0) {
    consistencyIssues.push("Tom e estilo consistentes — manter alinhamento em novas entregas");
  }

  const recommendedBrandUpdates = [
    ...missingCore.map((f) => ({
      field: f.label,
      suggestion: `Preencher "${f.label}" — campo essencial para execução`,
    })),
    ...missingExtended.map((f) => ({
      field: f.label,
      suggestion: `Adicionar "${f.label}" para fortalecer a consistência visual`,
    })),
  ];

  const brandDiagnosis = [
    `Brand Brain de ${client.name}: ${completeness}% completo (${filledCore}/${CORE_FIELDS.length} campos essenciais).`,
    missingCore.length > 0
      ? `${missingCore.length} campo(s) essencial(is) faltando: ${missingCore.map((f) => f.label).slice(0, 3).join(", ")}.`
      : "Todos os campos essenciais preenchidos.",
    `Posicionamento: ${isFilled(bb.positioning) ? bb.positioning!.slice(0, 60) : "ausente"}.`,
  ].join(" ");

  const executiveSummary = `Brand Hub Intelligence para ${client.name}: ${completeness}% completo. ${missingInformation.length} item(ns) faltando, ${positioningGaps.length} gap(s) de posicionamento, ${consistencyIssues.length} questão(ões) de consistência. ${recommendedBrandUpdates.length} atualização(ões) recomendada(s).`;

  return {
    brandDiagnosis,
    missingInformation,
    positioningGaps,
    consistencyIssues,
    recommendedBrandUpdates,
    completeness,
    executiveSummary,
  };
}
