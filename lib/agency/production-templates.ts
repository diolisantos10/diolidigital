// Production client templates for Dioli Agency OS
// Ready-to-use starter packs for common client types.

export type TemplateId =
  | "dioli_digital"
  | "digital_solution";

export interface TemplateDeliverable {
  name: string;
  type: string;
  department: string;
}

export interface TemplateMaterialRequest {
  type: string;
  description: string;
}

export interface ProductionTemplate {
  id: TemplateId;
  name: string;
  description: string;
  industry: string;
  projectType: string;
  departments: string[];
  strategyFocus: string[];
  proposalPackage: string;
  starterBrandHub: {
    tone: string;
    values: string[];
    targetAudience: string;
    positioning: string;
  };
  suggestedDeliverables: TemplateDeliverable[];
  materialRequests: TemplateMaterialRequest[];
  agents: string[];
  color: string;
}

export const PRODUCTION_TEMPLATES: ProductionTemplate[] = [
  {
    id: "dioli_digital",
    name: "Dioli Digital",
    description: "Lançamento da agência interna — posicionamento premium no mercado digital",
    industry: "Marketing Digital",
    projectType: "launch",
    departments: ["strategy", "social-media", "design", "paid-traffic"],
    strategyFocus: [
      "Posicionamento como agência premium com IA integrada",
      "Autoridade em marketing digital B2B e B2C",
      "Diferenciação por tecnologia e inteligência de dados",
    ],
    proposalPackage: "Full-service: Social media + Design + Tráfego Pago + Estratégia",
    starterBrandHub: {
      tone: "Profissional e próximo",
      values: ["Inovação", "Resultado", "Transparência"],
      targetAudience: "Empresas de médio porte que querem escalar presença digital",
      positioning: "Agência full-service com IA integrada — resultados mensuráveis com tecnologia de ponta",
    },
    suggestedDeliverables: [
      { name: "Identidade visual", type: "design", department: "design" },
      { name: "Manual da marca", type: "document", department: "brand-hub" },
      { name: "Posts de lançamento (Pack 10)", type: "social_post", department: "social-media" },
      { name: "Stories de lançamento", type: "social_post", department: "social-media" },
      { name: "Campanha Meta Ads — Awareness", type: "ads", department: "paid-traffic" },
      { name: "Copy para anúncios — 5 variações", type: "copy", department: "paid-traffic" },
      { name: "Apresentação de posicionamento", type: "document", department: "strategy" },
      { name: "Bio e descrição de perfil", type: "copy", department: "social-media" },
      { name: "Calendário editorial — Mês 1", type: "planning", department: "social-media" },
    ],
    materialRequests: [
      { type: "logo", description: "Logo em vetor (SVG/AI) para aplicações digitais e impressas" },
      { type: "photos", description: "Fotos da equipe em alta resolução para humanizar a marca" },
      { type: "credentials", description: "Acesso às contas de redes sociais existentes" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#070A1F",
  },
  {
    id: "digital_solution",
    name: "Solução Digital",
    description: "Template genérico para clientes de solução digital — estratégia, branding, social e ads",
    industry: "Solução Digital",
    projectType: "full_service",
    departments: ["strategy", "brand-hub", "social-media", "design", "paid-traffic"],
    strategyFocus: [
      "Diagnóstico de posicionamento atual",
      "Definição de público-alvo e proposta de valor",
      "Estratégia de canais integrada",
    ],
    proposalPackage: "Full-service personalizado conforme diagnóstico estratégico",
    starterBrandHub: {
      tone: "A definir com o cliente",
      values: ["A definir com o cliente"],
      targetAudience: "A definir após diagnóstico",
      positioning: "A definir após análise estratégica",
    },
    suggestedDeliverables: [
      { name: "Diagnóstico de posicionamento", type: "document", department: "strategy" },
      { name: "Brand Brief inicial", type: "document", department: "brand-hub" },
      { name: "Calendário editorial — Mês 1", type: "planning", department: "social-media" },
      { name: "Pack de posts inicial (5)", type: "social_post", department: "social-media" },
      { name: "Identidade visual (ou refinamento)", type: "design", department: "design" },
      { name: "Campanha de awareness inicial", type: "ads", department: "paid-traffic" },
    ],
    materialRequests: [
      { type: "logo", description: "Logo em vetor (se existente) ou briefing para criação" },
      { type: "credentials", description: "Acesso às contas de redes sociais existentes" },
      { type: "references", description: "Referências visuais e de marca que o cliente gosta" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#0057FF",
  },
];

export function getTemplate(id: TemplateId): ProductionTemplate | undefined {
  return PRODUCTION_TEMPLATES.find((t) => t.id === id);
}
