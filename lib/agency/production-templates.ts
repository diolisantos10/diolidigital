// Production client templates for Dioli Agency OS
// Ready-to-use starter packs for common client types.

export type TemplateId =
  | "dioli_digital"
  | "fute_foocci"
  | "sushi_cazza"
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
    departments: ["strategy", "social_media", "design", "paid_traffic"],
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
      { name: "Manual da marca", type: "document", department: "brand_hub" },
      { name: "Posts de lançamento (Pack 10)", type: "social_post", department: "social_media" },
      { name: "Stories de lançamento", type: "social_post", department: "social_media" },
      { name: "Campanha Meta Ads — Awareness", type: "ads", department: "paid_traffic" },
      { name: "Copy para anúncios — 5 variações", type: "copy", department: "paid_traffic" },
      { name: "Apresentação de posicionamento", type: "document", department: "strategy" },
      { name: "Bio e descrição de perfil", type: "copy", department: "social_media" },
      { name: "Calendário editorial — Mês 1", type: "planning", department: "social_media" },
    ],
    materialRequests: [
      { type: "logo", description: "Logo em vetor (SVG/AI) para aplicações digitais e impressas" },
      { type: "photos", description: "Fotos da equipe em alta resolução para humanizar a marca" },
      { type: "credentials", description: "Acesso às contas de redes sociais existentes" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#5B5BD6",
  },
  {
    id: "fute_foocci",
    name: "Fute / Foocci",
    description: "SaaS de tecnologia para restaurantes — posicionamento B2B com foco em escalabilidade",
    industry: "SaaS / Tecnologia para Restaurantes",
    projectType: "launch",
    departments: ["strategy", "social_media", "design", "paid_traffic"],
    strategyFocus: [
      "Posicionamento B2B para donos de restaurante",
      "Comunicação técnica + emocional (ROI + simplicidade)",
      "Lançamento com estratégia de product-led growth",
    ],
    proposalPackage: "Strategy + Branding + Social Media + Ads (LinkedIn + Meta)",
    starterBrandHub: {
      tone: "Confiante, prático e inovador",
      values: ["Eficiência", "Tecnologia", "Resultado para o restaurante"],
      targetAudience: "Donos e gestores de restaurantes que querem digitalizar operações",
      positioning: "A plataforma mais simples e completa para restaurantes modernos",
    },
    suggestedDeliverables: [
      { name: "Identidade visual — versão SaaS", type: "design", department: "design" },
      { name: "Apresentação de posicionamento B2B", type: "document", department: "strategy" },
      { name: "Landing page — copy e estrutura", type: "copy", department: "social_media" },
      { name: "Posts LinkedIn — autoridade B2B", type: "social_post", department: "social_media" },
      { name: "Campanha Meta Ads — geração de leads", type: "ads", department: "paid_traffic" },
      { name: "Materiais de onboarding (deck)", type: "document", department: "design" },
    ],
    materialRequests: [
      { type: "logo", description: "Logo atual em vetor para adaptação" },
      { type: "product_screens", description: "Screenshots/mockups do produto para uso em materiais" },
      { type: "case_studies", description: "Cases de clientes existentes para prova social" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#0E7490",
  },
  {
    id: "sushi_cazza",
    name: "Sushi Cazza",
    description: "Restaurante de sushi e rodízio — marca local, delivery e presença digital forte",
    industry: "Gastronomia / Restaurante",
    projectType: "branding",
    departments: ["social_media", "design", "paid_traffic"],
    strategyFocus: [
      "Posicionamento premium-acessível no mercado local",
      "Comunicação visual forte com foco em apetite-appeal",
      "Estratégia de delivery + visitas presenciais",
    ],
    proposalPackage: "Social Media + Design + Tráfego Local (Meta Ads geolocalizado)",
    starterBrandHub: {
      tone: "Caloroso, apetitoso e autêntico",
      values: ["Qualidade", "Experiência", "Tradição japonesa com toque brasileiro"],
      targetAudience: "Amantes de sushi e culinária japonesa na região, 25-45 anos",
      positioning: "O melhor rodízio de sushi da cidade — experiência premium sem complicação",
    },
    suggestedDeliverables: [
      { name: "Identidade visual completa", type: "design", department: "design" },
      { name: "Pack de posts — cardápio visual (10)", type: "social_post", department: "social_media" },
      { name: "Stories de promoção semanal", type: "social_post", department: "social_media" },
      { name: "Campanha Meta Ads — geolocalizada", type: "ads", department: "paid_traffic" },
      { name: "Copy para delivery (iFood/Rappi)", type: "copy", department: "social_media" },
      { name: "Calendário editorial — Mês 1", type: "planning", department: "social_media" },
    ],
    materialRequests: [
      { type: "photos", description: "Fotos profissionais dos pratos para feed do Instagram" },
      { type: "menu", description: "Cardápio completo com preços para criação de conteúdo" },
      { type: "logo", description: "Logo atual ou briefing para criação de nova identidade" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#C2530A",
  },
  {
    id: "digital_solution",
    name: "Solução Digital",
    description: "Template genérico para clientes de solução digital — estratégia, branding, social e ads",
    industry: "Solução Digital",
    projectType: "full_service",
    departments: ["strategy", "brand_hub", "social_media", "design", "paid_traffic"],
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
      { name: "Brand Brief inicial", type: "document", department: "brand_hub" },
      { name: "Calendário editorial — Mês 1", type: "planning", department: "social_media" },
      { name: "Pack de posts inicial (5)", type: "social_post", department: "social_media" },
      { name: "Identidade visual (ou refinamento)", type: "design", department: "design" },
      { name: "Campanha de awareness inicial", type: "ads", department: "paid_traffic" },
    ],
    materialRequests: [
      { type: "logo", description: "Logo em vetor (se existente) ou briefing para criação" },
      { type: "credentials", description: "Acesso às contas de redes sociais existentes" },
      { type: "references", description: "Referências visuais e de marca que o cliente gosta" },
    ],
    agents: ["a3", "a2", "a4"],
    color: "#7C3AED",
  },
];

export function getTemplate(id: TemplateId): ProductionTemplate | undefined {
  return PRODUCTION_TEMPLATES.find((t) => t.id === id);
}
