// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientStatus = "active" | "inactive" | "prospect";
export type ProjectStage =
  | "briefing"
  | "proposal_sent"
  | "approved"
  | "diagnosis"
  | "planning"
  | "production"
  | "review"
  | "delivery"
  | "ongoing"
  | "completed";
export type Priority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";
export type DeliverableStatus = "draft" | "in_review" | "approved" | "delivered";
// Internal revision lifecycle — tracks where a deliverable sits in the review loop.
// "none" = no revision active; "revision_requested" = client asked for changes;
// "in_revision" = owner agent is reworking it; "resolved" = new version sent back.
export type RevisionStatus = "none" | "revision_requested" | "in_revision" | "resolved";
export type RevisionAuthor = "client" | "internal" | "agent";
export type BriefingStatus = "pending_analysis" | "analyzed" | "approved";
export type AgentStatus = "available" | "active";
export type AssetType = "logo" | "color_palette" | "typography" | "tone_of_voice" | "visual_reference" | "guidelines";

export interface BrandBrain {
  businessSummary: string;       // What the business is, what it sells, why it exists
  positioning: string;           // Market position and unique value proposition
  targetAudience: string;        // Who the brand is talking to
  toneOfVoice: string;           // How the brand communicates — adjectives, examples
  visualStyle: string;           // Visual direction, colors, aesthetic references
  brandRules: string;            // Non-negotiables — what we must always do
  productsToHighlight: string;   // Key products, services, or offers to feature
  thingsToAvoid: string;         // Words, tones, references, competitors to never use
  preferredChannels: string;     // Best-performing or priority channels for this brand
  strategicNotes: string;        // Agency-only context — ongoing strategy, history, caveats
  // Brand Hub extended fields (V1)
  colors?: string;               // Brand color palette with hex codes
  fonts?: string;                // Typography system: headings, body, accent
  references?: string;           // Visual references, asset locations, brand book links
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  website?: string;
  status: ClientStatus;
  description?: string;
  createdAt: string;
  // Intake-captured profile fields — saved from the Client Profile phase
  brandTone?: string;
  brandExisting?: string;
  targetAudience?: string;
  currentChannels?: string;
  whatWorks?: string;
  whatFails?: string;
  availableAssets?: string[];
  restrictions?: string;
  // Brand Brain — structured intelligence layer for agents and internal use
  brandBrain?: BrandBrain;
}

export type ProposalStatus = "draft" | "sent" | "approved" | "rejected" | "changes_requested";

export interface ProjectProposal {
  objective?: string;
  scope: string;
  deliverables: string[];
  timeline: string;
  pricing: string;
  status: ProposalStatus;
  requestedChanges?: string;
  rejectionReason?: string;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  includes: string[];
  pricing: string;
}

export const SERVICE_PACKAGES: ServicePackage[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Focused single-service engagement for brands with a clear, contained objective.",
    includes: ["1 core service", "Monthly reporting", "2 revision rounds"],
    pricing: "€2,500 / month",
  },
  {
    id: "growth",
    name: "Growth",
    description: "Multi-channel execution for brands actively scaling their digital presence.",
    includes: ["2–3 services", "Bi-weekly syncs", "3 revision rounds", "Brand Brain integration"],
    pricing: "€4,500 / month",
  },
  {
    id: "full_service",
    name: "Full Service",
    description: "Complete agency partnership — strategy, execution, and optimization across all channels.",
    includes: ["4+ services", "Weekly syncs", "Unlimited revisions", "Brand Brain integration", "Creative direction"],
    pricing: "€7,500 / month",
  },
];

export interface Project {
  id: string;
  name: string;
  clientId: string;
  goal: string;
  type: string;
  stage: ProjectStage;
  priority: Priority;
  deadline: string;
  agents: string[];
  createdAt: string;
  orchestratorBriefing?: OrchestratorBriefing;
  proposal?: ProjectProposal;
}

export interface OrchestratorBriefing {
  services: string[];
  businessDescription: string;
  objective: string;
  targetAudience: string;
  channels: string[];
  deadline: string;
  notes: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  agentId: string;
  status: TaskStatus;
  dueDate: string;
  deliverableId?: string;
}

// A single entry in a deliverable's revision history.
export interface RevisionEntry {
  version: number;
  status: DeliverableStatus;
  feedback?: string;
  author: RevisionAuthor;
  timestamp: string;
  note: string;
}

export interface Deliverable {
  id: string;
  projectId: string;
  name: string;
  type: string;
  status: DeliverableStatus;
  link?: string;
  version: number;
  createdAt: string;
  clientFeedback?: string;
  // ── Review Lifecycle V1 (all optional for backward compatibility) ──────────
  ownerAgentId?: string;          // responsible agent/owner — inferred from type if absent
  revisionStatus?: RevisionStatus;
  lastFeedback?: string;          // most recent feedback captured (client or internal)
  updatedAt?: string;             // ISO timestamp of last lifecycle change
  revisionHistory?: RevisionEntry[];
}

export interface Briefing {
  id: string;
  projectId: string;
  clientId: string;
  goal: string;
  audience: string;
  keyMessage: string;
  deliverables: string;
  deadline: string;
  successCriteria: string;
  notes?: string;
  status: BriefingStatus;
  createdAt: string;
}

// ─── Strategy Room ─────────────────────────────────────────────────────────────

export interface StrategyRoomSpecialist {
  specialistId: string;
  specialistName: string;
  role: string;
  mainInsight: string;
  recommendedDirection: string;
  suggestedDeliverables: string[];
  risks: string[];
  priority: "high" | "medium" | "low";
  confidence: number; // 1–10
  // V2 expanded profile
  mission?: string;
  perspective?: string;
  priorities?: string[];
  concerns?: string[];
}

export interface StrategyRoomSynthesis {
  recommendedStrategy: string;
  recommendedServices: string[];
  proposalImplications: string;
  keyRisks: string[];
  nextActionForPM: string;
  strategicScore: number; // 1–10
}

export interface DebateTurn {
  specialistId: string;
  specialistName: string;
  type: "opening" | "critique" | "addition" | "risk" | "consensus";
  content: string;
  replyTo?: string; // specialistId being addressed
}

export interface ConsensusLayer {
  positioning: string;
  strategy: string;
  risks: string[];
  opportunities: string[];
  recommendedPackage: string;
  recommendedChannels: string[];
  recommendedDeliverables: string[];
}

export interface ExecutiveSummary {
  biggestOpportunity: string;
  biggestRisk: string;
  recommendedAction: string;
  confidenceScore: number; // 1–10
}

export interface StrategyRoom {
  projectId: string;
  clientId: string;
  generatedAt: string;
  specialists: StrategyRoomSpecialist[];
  finalSynthesis: StrategyRoomSynthesis;
  status: "draft" | "ready";
  // V2 extensions
  debateTurns?: DebateTurn[];
  consensus?: ConsensusLayer;
  executiveSummary?: ExecutiveSummary;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  specialty: string;
  whenToUse: string;
  inputs: string[];
  outputs: string[];
  status: AgentStatus;
}

export interface BrandAsset {
  id: string;
  clientId: string;
  type: AssetType;
  name: string;
  value?: string;
  notes?: string;
}

export interface ActivityEvent {
  id: string;
  type:
    | "project_created"
    | "project_stage_changed"
    | "task_updated"
    | "deliverable_updated"
    | "client_created"
    | "briefing_created"
    | "orchestrator_approved";
  message: string;
  timestamp: string;
  projectId?: string;
  clientId?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const MOCK_CLIENTS: Client[] = [
  {
    id: "c4",
    name: "Dioli Digital",
    industry: "Agência Digital com IA",
    website: "dioli.digital",
    status: "active",
    description: "Empresa de soluções digitais com IA. Dioli Agência é o braço de marketing e design — focado em automação, conteúdo, tráfego e sistemas digitais para marcas, restaurantes e PMEs.",
    createdAt: "2026-05-30",
    brandBrain: {
      businessSummary: "Dioli Digital é uma empresa de soluções digitais impulsionadas por inteligência artificial. Seu primeiro braço operacional é a Dioli Agência — uma agência de marketing digital que entrega redes sociais, design, tráfego pago, copy e sistemas digitais completos para marcas, restaurantes, PMEs e fundadores. A proposta central: resultado de grande agência, com a agilidade e personalização de uma estrutura orientada por IA.",
      positioning: "A Dioli Agência não é uma agência tradicional. É uma estrutura de execução digital acelerada por IA, com estratégia sênior e entrega consistente. Posicionada entre a consultoria e a produção — pensa, executa e otimiza. O diferencial real: velocidade de execução, uso nativo de IA nos fluxos internos e foco em ROI para o cliente.",
      targetAudience: "Donos de negócio, fundadores e gestores de marketing de PMEs, restaurantes, lojas, profissionais liberais e marcas em fase de crescimento no Brasil. Precisam de presença digital consistente e resultados mensuráveis — sem o overhead de uma grande agência ou o amadorismo de freelancers.",
      toneOfVoice: "Estratégico, direto, premium. Fala como um parceiro sênior, não como vendedor. Confiante sem arrogância. Claro, sem jargão técnico desnecessário. Moderno sem apelar para hype de IA. Tom: como se a Dioli fosse o sócio mais inteligente da sala — que também entrega.",
      visualStyle: "Clean e tech-premium. Base preta ou branca com acentos em laranja. Tipografia moderna e forte. Layouts com espaço em branco generoso. Iconografia minimalista. Mockups e imagens de alto padrão — nunca stock genérico. Dark mode bem-vindo. Sem gradientes brilhantes, sem excesso de cor.",
      brandRules: "Nunca usar tom de 'melhor agência do mercado'. Nunca fazer promessas vagas de resultado. Logo nunca em fundos coloridos saturados. Laranja é acento, não base. Todo texto deve ser editado para concisão — se a palavra não ganha seu espaço, corta. Nunca comparar diretamente com concorrentes.",
      productsToHighlight: "Gestão de redes sociais com IA. Design de conteúdo e identidade visual. Tráfego pago (Meta e Google). Copy e conteúdo estratégico. Sistemas digitais automatizados. Onboarding de clientes via plataforma interna.",
      thingsToAvoid: "Hype genérico de IA: 'revolucionário', 'disruptivo', 'transformador'. Linguagem barata ou promocional demais. Jargão técnico que afasta o cliente leigo. Excesso de emojis ou informalidade excessiva. Qualquer coisa que pareça agência pequena tentando parecer grande.",
      preferredChannels: "Instagram (principal — reels e carrossel para autoridade e alcance). LinkedIn (para founders e decisores B2B). WhatsApp (relacionamento e fechamento). Site (conversão e portfólio).",
      strategicNotes: "Projeto de lançamento em andamento — piloto interno sendo gerenciado nesta plataforma. Meta para os primeiros 90 dias: 3 clientes pagantes em retainer. Comunicação deve equilibrar narrativa de IA com a humanidade da equipe. Fundador quer posicionamento premium desde o início, sem entrar em guerra de preço.",
      colors: "Preto #111111 (base e texto), Laranja #E85D04 (acento principal — CTAs, ícones, destaques), Branco #FFFFFF (fundos e espaço em branco), Cinza Claro #F7F7F6 (backgrounds secundários). Regra: laranja é acento — nunca usar como cor de fundo dominante.",
      fonts: "Títulos: Inter Bold (700) ou alternativa sem-serif moderna de alta legibilidade. Corpo de texto: Inter Regular (400). Números e dados: fonte monospace. Regra: nunca fontes decorativas, script ou serifadas — a identidade é tech-premium, não editorial.",
      references: "Referências de tom visual: Apple.com (clareza e espaço em branco generoso), Linear.app (UI minimalista e tech), Stripe (copy direta + premium sem pedantismo). Assets disponíveis: logo entregue pelo fundador (arquivos na pasta /brand-assets). Manual de identidade visual: a ser gerado pela equipe de design como entrega d17.",
    },
  },
  {
    id: "c1",
    name: "Sushikasa",
    industry: "Food & Beverage",
    website: "sushikasa.com.br",
    status: "active",
    description: "Premium Japanese restaurant chain. Bold identity, high-end positioning.",
    createdAt: "2024-01-10",
    brandBrain: {
      businessSummary: "Sushikasa is a 5-location premium Japanese restaurant chain in São Paulo. Positioned as a culinary experience, not just a meal — guests come for special occasions, business dinners, and celebrations.",
      positioning: "The most refined Japanese dining experience in São Paulo. Not fast, not casual — an event. Competes on atmosphere, quality, and exclusivity, not price.",
      targetAudience: "Urban professionals and couples aged 28–50, high disposable income, food-literate. Frequently dine out for experience, not just sustenance. Active on Instagram. Value recommendations from peers.",
      toneOfVoice: "Refined, confident, minimal. Speaks like a connoisseur, not a salesperson. Never loud, never promotional. Uses restraint. Short sentences. Evokes texture, ritual, and presence.",
      visualStyle: "Black and off-white as primary. Deep red as accent used sparingly. Photography: close-up textures, candlelit atmosphere, negative space. No bright gradients, no stock-looking imagery.",
      brandRules: "Never use exclamation marks. Never write 'best' or 'amazing'. Always use Cormorant Garamond for headlines. Safe space around logo must always be respected. Never pair with other restaurant brands.",
      productsToHighlight: "Omakase tasting menu (flagship). Premium sake pairing. Private dining room (capacity 14). Weekend brunch (newer, needs more awareness). Seasonal limited menus.",
      thingsToAvoid: "Words: cheap, deal, discount, fast, best, amazing. Competitors: never mention by name. Tone: never casual, never aggressive, never use slang. Imagery: crowds, messy food photos, bright lighting.",
      preferredChannels: "Instagram (primary — organic + paid). Google (Maps + Search for discovery). Email (retention for regular guests). LinkedIn (not primary but useful for corporate dining angle).",
      strategicNotes: "Currently in brand relaunch phase. New visual identity approved but not fully rolled out across all locations. Q3 expansion to Rio — all campaigns should avoid geo-locking to SP for now. Owner is involved in approvals — expects premium output with minimal copy.",
    },
  },
  {
    id: "c2",
    name: "Santioh",
    industry: "Fashion & Lifestyle",
    website: "santioh.com",
    status: "active",
    description: "Contemporary Brazilian streetwear brand targeting urban youth.",
    createdAt: "2024-02-05",
    brandBrain: {
      businessSummary: "Santioh is a contemporary Brazilian streetwear brand built for urban youth. Founded in São Paulo, sold online and in select concept stores. Collections release seasonally with a drop model.",
      positioning: "Authentic Brazilian street culture — not trend-chasing, not luxury cosplay. Sits between accessible and aspirational. Worn by people who shape culture, not follow it.",
      targetAudience: "Gen Z and younger millennials aged 18–28, São Paulo and major Brazilian cities. Active on Instagram and TikTok. Values authenticity, cultural references, and limited availability. Influenced by music, skateboarding, and local art.",
      toneOfVoice: "Bold, urban, direct. Culturally aware without trying too hard. Can use slang when targeting Gen Z — but never forced. Confident, not arrogant. Speaks peer-to-peer, not brand-to-consumer.",
      visualStyle: "Off-white and navy as base. High-contrast photography. Street environments, real locations, no studio backgrounds. Models are real people from the scene, not typical fashion models. Raw, editorial, energetic.",
      brandRules: "Never use white backgrounds alone — always texture or environment. Logo never in red. Avoid corporate fonts. Copy must feel written by someone from the scene, not a marketing team.",
      productsToHighlight: "Signature hoodies (flagship). Limited seasonal drops. Collab pieces (highest social traction). Accessories (lower margin but high visibility for brand building).",
      thingsToAvoid: "Generic lifestyle language. Anything that feels too polished or corporate. Comparisons to international brands. Aspirational language that disconnects from local roots. Over-editing images.",
      preferredChannels: "TikTok (fastest growth). Instagram Reels + Stories (primary community). WhatsApp (for loyal buyers via broadcast). Street activation / events (offline brand building).",
      strategicNotes: "Summer 2024 collection is the biggest drop to date. Founder wants to expand to Rio and Belo Horizonte but brand is still primarily SP. Influencer strategy is key — prefer micro-influencers from the actual scene over big names. Budget is growing but lean — needs high ROI creative.",
    },
  },
  {
    id: "c3",
    name: "Dioli Studio",
    industry: "Creative Services",
    website: "dioli.studio",
    status: "active",
    description: "Internal brand for the agency itself — portfolio, cases, and positioning.",
    createdAt: "2024-03-01",
    brandBrain: {
      businessSummary: "Dioli Studio is the agency's own brand — a strategic creative studio that builds brands, executes campaigns, and helps companies grow through design and marketing. Operates as a full-service partner, not just a vendor.",
      positioning: "Strategy first, execution always. Not a production shop, not a consultancy — a hybrid that thinks and builds. Trusted by growing brands that need senior thinking with hands-on delivery.",
      targetAudience: "Founders and marketing leads at SMBs and scale-ups, primarily in Brazil. Aged 28–45. Tired of agencies that overpromise and underdeliver. Looking for a long-term partner, not a project vendor.",
      toneOfVoice: "Intelligent, direct, zero fluff. Speaks like a senior partner, not a pitch deck. Uses precision over volume. Confident about what it does, honest about what it doesn't. Never uses buzzwords.",
      visualStyle: "Monochrome with indigo accent (#5B5BD6). Clean, structured layouts. Geometric precision. Typography-forward. No decorative elements without function. Dark-mode friendly.",
      brandRules: "Indigo used only for CTAs and key highlights. Logo is the geometric monogram — never stretch, never color versions except black/white. All copy must be edited for conciseness — if a word doesn't earn its place, cut it.",
      productsToHighlight: "Brand Strategy + Identity. Campaign production. AI-assisted execution workflows. Monthly retainer model. Portfolio cases (Sushikasa, Santioh).",
      thingsToAvoid: "Agency jargon: 'synergy', 'holistic', 'leverage', '360', 'deep dive'. Vague promises. Logos on colorful backgrounds. Anything that feels like a typical agency website.",
      preferredChannels: "LinkedIn (primary for B2B prospecting). Portfolio website (conversion). Referrals (highest close rate — track and nurture). Instagram (brand perception, not lead gen).",
      strategicNotes: "Agency positioning project is ongoing. New website is in wireframe stage. Main differentiator to communicate: AI-powered workflows + strategic seniority. Target: 3 new retainer clients in H2 2024. Currently under-marketed — the work speaks louder than the brand.",
    },
  },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: "p7",
    name: "Lançamento Dioli Agência",
    clientId: "c4",
    goal: "Lançar a Dioli Agência com presença digital consistente, identidade visual aplicada nas redes sociais e primeiros conteúdos que comuniquem o posicionamento premium e diferenciador da marca.",
    type: "Social Media + Design + Tráfego Pago",
    stage: "production",
    priority: "high",
    deadline: "2026-07-31",
    agents: ["a2", "a3", "a4"],
    createdAt: "2026-05-30",
    proposal: {
      objective: "Lançar a Dioli Agência com presença digital consistente que comunique seu posicionamento como agência digital com IA — estratégica, premium e orientada a resultado.",
      scope: "Estratégia completa de redes sociais com posicionamento, persona e pilares de conteúdo. Desenvolvimento do sistema de templates de design para Instagram. Calendário editorial para os primeiros 30 dias. Batch inicial de conteúdo pronto para publicação. Estratégia de tráfego pago para amplificar o lançamento via Meta Ads.",
      deliverables: [
        "Estratégia de redes sociais (documento completo)",
        "Sistema de templates de design — 12 layouts editáveis",
        "Calendário editorial — 30 dias",
        "Batch inicial — 16 posts prontos para publicar",
        "Guia de identidade visual aplicada",
        "Estratégia de tráfego pago — Meta Ads",
        "Criativos de lançamento (3 variações)",
      ],
      timeline: "6 semanas",
      pricing: "R$ 4.500 / mês",
      status: "approved",
    },
  },
  {
    id: "p1",
    name: "Brand Relaunch Campaign",
    clientId: "c1",
    goal: "Launch the redesigned Sushikasa brand across all digital channels with a cohesive campaign.",
    type: "Campaign",
    stage: "production",
    priority: "high",
    deadline: "2024-04-30",
    agents: ["a1", "a2", "a3", "a5"],
    createdAt: "2024-03-01",
  },
  {
    id: "p2",
    name: "Summer Collection Launch",
    clientId: "c2",
    goal: "Drive awareness and sales for the Santioh Summer 2024 collection via paid and organic.",
    type: "Campaign",
    stage: "planning",
    priority: "high",
    deadline: "2024-05-15",
    agents: ["a1", "a3", "a4"],
    createdAt: "2024-03-08",
  },
  {
    id: "p3",
    name: "Agency Positioning & Site",
    clientId: "c3",
    goal: "Define Dioli Studio's positioning and build its public website.",
    type: "Branding + Web",
    stage: "diagnosis",
    priority: "medium",
    deadline: "2024-06-01",
    agents: ["a2", "a6", "a7"],
    createdAt: "2024-03-10",
  },
  {
    id: "p4",
    name: "SEO & Content Strategy",
    clientId: "c1",
    goal: "Build an organic search presence for Sushikasa with content strategy and on-page SEO.",
    type: "SEO",
    stage: "briefing",
    priority: "medium",
    deadline: "2024-07-01",
    agents: ["a6", "a1"],
    createdAt: "2024-03-15",
  },
  {
    id: "p5",
    name: "Paid Media — Q2",
    clientId: "c2",
    goal: "Run performance campaigns across Meta and Google for Q2 with ROAS target of 4x.",
    type: "Paid Media",
    stage: "review",
    priority: "high",
    deadline: "2024-04-20",
    agents: ["a4", "a5"],
    createdAt: "2024-02-20",
  },
  {
    id: "p6",
    name: "Brand Identity System",
    clientId: "c3",
    goal: "Create the complete brand identity system for Dioli Studio: logo, colors, typography, voice.",
    type: "Branding",
    stage: "completed",
    priority: "low",
    deadline: "2024-03-31",
    agents: ["a2", "a7"],
    createdAt: "2024-01-15",
  },
];

export const MOCK_TASKS: Task[] = [
  // p1 tasks
  { id: "t1", projectId: "p1", title: "Write campaign manifesto copy", description: "Draft the brand manifesto for the relaunch — emotional, premium, Japanese-inspired.", agentId: "a1", status: "done", dueDate: "2024-04-05", deliverableId: "d1" },
  { id: "t2", projectId: "p1", title: "Design hero visual assets", description: "Create 5 hero visuals in the new brand style for web and social.", agentId: "a2", status: "in_progress", dueDate: "2024-04-12", deliverableId: "d2" },
  { id: "t3", projectId: "p1", title: "Set up Meta campaign structure", description: "Build out Meta Ads campaign structure: audiences, placements, creative sets.", agentId: "a4", status: "in_progress", dueDate: "2024-04-18", deliverableId: "d3" },
  { id: "t4", projectId: "p1", title: "Write ad copy variations (A/B)", description: "Write 6 ad copy variations for A/B testing across the campaign.", agentId: "a1", status: "pending", dueDate: "2024-04-20" },
  { id: "t5", projectId: "p1", title: "Internal QA review", description: "Full review of all campaign materials before client delivery.", agentId: "a7", status: "pending", dueDate: "2024-04-25" },
  // p2 tasks
  { id: "t6", projectId: "p2", title: "Define campaign concept", description: "Translate the Summer collection into a campaign narrative and visual concept.", agentId: "a1", status: "done", dueDate: "2024-03-25" },
  { id: "t7", projectId: "p2", title: "Build content calendar", description: "Plan 30 days of content across Instagram and TikTok.", agentId: "a3", status: "in_progress", dueDate: "2024-04-05" },
  { id: "t8", projectId: "p2", title: "Influencer brief and outreach", description: "Draft briefs and contact list for micro-influencer activation.", agentId: "a3", status: "pending", dueDate: "2024-04-15" },
  // p3 tasks
  { id: "t9", projectId: "p3", title: "Competitive landscape analysis", description: "Map top 5 competitor agencies and their positioning.", agentId: "a6", status: "done", dueDate: "2024-03-20" },
  { id: "t10", projectId: "p3", title: "Draft positioning statement", description: "Define the unique value proposition and core message for Dioli Studio.", agentId: "a1", status: "in_progress", dueDate: "2024-03-30" },
  { id: "t11", projectId: "p3", title: "Site wireframes", description: "Design low-fidelity wireframes for 5-page site.", agentId: "a2", status: "pending", dueDate: "2024-04-15" },
  // p5 tasks
  { id: "t12", projectId: "p5", title: "Audit Q1 campaign performance", description: "Full analysis of Q1 results: CPA, ROAS, CTR per adset.", agentId: "a4", status: "done", dueDate: "2024-04-01" },
  { id: "t13", projectId: "p5", title: "Build Q2 strategy brief", description: "Define Q2 targets, budget allocation, and channel mix.", agentId: "a4", status: "done", dueDate: "2024-04-05" },
  { id: "t14", projectId: "p5", title: "Creative performance review", description: "Review top/bottom performing creatives and brief new assets.", agentId: "a5", status: "in_progress", dueDate: "2024-04-15" },
];

export const MOCK_DELIVERABLES: Deliverable[] = [
  { id: "d1", projectId: "p1", name: "Campaign Manifesto Copy", type: "Copy", status: "approved", version: 2, createdAt: "2024-04-05" },
  { id: "d2", projectId: "p1", name: "Hero Visual Assets (5)", type: "Design", status: "in_review", version: 1, createdAt: "2024-04-10" },
  { id: "d3", projectId: "p1", name: "Meta Campaign Structure", type: "Strategy", status: "draft", version: 1, createdAt: "2024-04-12" },
  { id: "d4", projectId: "p2", name: "Campaign Concept Document", type: "Strategy", status: "approved", version: 1, createdAt: "2024-03-25" },
  { id: "d5", projectId: "p3", name: "Competitive Landscape Report", type: "Report", status: "delivered", version: 1, createdAt: "2024-03-20" },
  { id: "d6", projectId: "p5", name: "Q1 Performance Audit", type: "Report", status: "delivered", version: 1, createdAt: "2024-04-01" },
  { id: "d7", projectId: "p5", name: "Q2 Strategy Brief", type: "Strategy", status: "approved", version: 1, createdAt: "2024-04-05" },
  // ── Dioli Agência Pilot — Lançamento Dioli Agência (p7) ───────────────────
  // Social Media Agent (a3) — Redes Sociais
  {
    id: "d8",
    projectId: "p7",
    name: "Estratégia de Redes Sociais — Dioli Agência",
    type: "Content Strategy",
    status: "approved",
    version: 2,
    createdAt: "2026-06-01",
    ownerAgentId: "a3",
    revisionStatus: "resolved",
    lastFeedback: "Incluir pilar de bastidores e humanização da marca. Tom muito formal, suavizar.",
    updatedAt: "2026-06-03T08:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T10:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-01T14:00:00.000Z", note: "Status alterado para in_review" },
      { version: 1, status: "draft",     author: "client",   timestamp: "2026-06-02T09:00:00.000Z", note: "Cliente solicitou alterações", feedback: "Incluir pilar de bastidores e humanização da marca. Tom muito formal, suavizar." },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T11:00:00.000Z", note: "Revisão iniciada" },
      { version: 2, status: "in_review", author: "internal", timestamp: "2026-06-02T16:00:00.000Z", note: "Nova versão enviada para revisão do cliente" },
      { version: 2, status: "approved",  author: "internal", timestamp: "2026-06-03T08:00:00.000Z", note: "Aprovada pelo cliente" },
    ],
  },
  {
    id: "d9",
    projectId: "p7",
    name: "Calendário Editorial — Junho/Julho 2026",
    type: "Content Calendar",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a3",
    revisionStatus: "none",
    updatedAt: "2026-06-02T15:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T13:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T15:00:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  {
    id: "d10",
    projectId: "p7",
    name: "Batch de Posts — Semana 1 (8 posts prontos)",
    type: "Posts",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a3",
    revisionStatus: "none",
    updatedAt: "2026-06-02T16:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T14:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T16:00:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  {
    id: "d11",
    projectId: "p7",
    name: "Batch de Posts — Semana 2 (8 posts)",
    type: "Posts",
    status: "draft",
    version: 1,
    createdAt: "2026-06-03",
    ownerAgentId: "a3",
    revisionStatus: "none",
    updatedAt: "2026-06-03T09:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft", author: "agent", timestamp: "2026-06-03T09:00:00.000Z", note: "Entrega criada" },
    ],
  },
  {
    id: "d12",
    projectId: "p7",
    name: "Stories: Lançamento da Agência (5 telas)",
    type: "Stories",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a3",
    revisionStatus: "none",
    updatedAt: "2026-06-02T17:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T15:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T17:00:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  {
    id: "d13",
    projectId: "p7",
    name: "Briefing de Design — Redes Sociais",
    type: "Design Requests",
    status: "delivered",
    version: 1,
    createdAt: "2026-06-01",
    ownerAgentId: "a3",
    revisionStatus: "resolved",
    updatedAt: "2026-06-01T16:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T15:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "delivered", author: "internal", timestamp: "2026-06-01T16:00:00.000Z", note: "Entregue ao agente de Design" },
    ],
  },
  // Design Agent (a2) — Design
  {
    id: "d14",
    projectId: "p7",
    name: "Sistema de Templates — Feed Instagram (12 layouts)",
    type: "Design",
    status: "approved",
    version: 2,
    createdAt: "2026-06-01",
    ownerAgentId: "a2",
    revisionStatus: "resolved",
    lastFeedback: "Templates muito brancos. Aumentar presença do laranja como acento e usar mais fundos escuros para o dark mode.",
    updatedAt: "2026-06-03T09:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T12:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-01T17:00:00.000Z", note: "Status alterado para in_review" },
      { version: 1, status: "draft",     author: "client",   timestamp: "2026-06-02T10:30:00.000Z", note: "Cliente solicitou alterações", feedback: "Templates muito brancos. Aumentar presença do laranja como acento e usar mais fundos escuros para o dark mode." },
      { version: 2, status: "in_review", author: "internal", timestamp: "2026-06-02T18:00:00.000Z", note: "Nova versão enviada para revisão do cliente" },
      { version: 2, status: "approved",  author: "internal", timestamp: "2026-06-03T09:00:00.000Z", note: "Aprovada pelo cliente" },
    ],
  },
  {
    id: "d15",
    projectId: "p7",
    name: "Sistema de Templates — Stories (6 layouts)",
    type: "Design",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a2",
    revisionStatus: "none",
    updatedAt: "2026-06-02T18:30:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T17:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T18:30:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  {
    id: "d16",
    projectId: "p7",
    name: "Criativos de Lançamento (3 variações)",
    type: "Design",
    status: "approved",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a2",
    revisionStatus: "resolved",
    updatedAt: "2026-06-03T10:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T16:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T19:00:00.000Z", note: "Status alterado para in_review" },
      { version: 1, status: "approved",  author: "internal", timestamp: "2026-06-03T10:00:00.000Z", note: "Aprovada pelo cliente" },
    ],
  },
  {
    id: "d17",
    projectId: "p7",
    name: "Manual de Identidade Visual Aplicada",
    type: "Visual Identity",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-03",
    ownerAgentId: "a2",
    revisionStatus: "none",
    updatedAt: "2026-06-03T11:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-03T10:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-03T11:00:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  // Ads Agent (a4) — Tráfego Pago
  {
    id: "d18",
    projectId: "p7",
    name: "Estratégia de Tráfego Pago — Lançamento",
    type: "Ads Strategy",
    status: "approved",
    version: 1,
    createdAt: "2026-06-01",
    ownerAgentId: "a4",
    revisionStatus: "resolved",
    updatedAt: "2026-06-03T08:30:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T18:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-01T20:00:00.000Z", note: "Status alterado para in_review" },
      { version: 1, status: "approved",  author: "internal", timestamp: "2026-06-03T08:30:00.000Z", note: "Aprovada pelo cliente" },
    ],
  },
  {
    id: "d19",
    projectId: "p7",
    name: "Estrutura de Campanhas Meta Ads",
    type: "Campaign Structure",
    status: "in_review",
    version: 1,
    createdAt: "2026-06-02",
    ownerAgentId: "a4",
    revisionStatus: "none",
    updatedAt: "2026-06-02T20:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-02T18:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-02T20:00:00.000Z", note: "Status alterado para in_review" },
    ],
  },
  {
    id: "d20",
    projectId: "p7",
    name: "Copy de Anúncios — 6 variações",
    type: "Ad Copy",
    status: "draft",
    version: 1,
    createdAt: "2026-06-03",
    ownerAgentId: "a4",
    revisionStatus: "none",
    updatedAt: "2026-06-03T10:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft", author: "agent", timestamp: "2026-06-03T10:00:00.000Z", note: "Entrega criada" },
    ],
  },
  {
    id: "d21",
    projectId: "p7",
    name: "Mapeamento de Públicos-alvo",
    type: "Audience Plan",
    status: "approved",
    version: 1,
    createdAt: "2026-06-01",
    ownerAgentId: "a4",
    revisionStatus: "resolved",
    updatedAt: "2026-06-02T09:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T19:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "in_review", author: "internal", timestamp: "2026-06-01T21:00:00.000Z", note: "Status alterado para in_review" },
      { version: 1, status: "approved",  author: "internal", timestamp: "2026-06-02T09:00:00.000Z", note: "Aprovada pelo cliente" },
    ],
  },
  {
    id: "d22",
    projectId: "p7",
    name: "Requisitos de Criativos por Funil",
    type: "Creative Requirements",
    status: "delivered",
    version: 1,
    createdAt: "2026-06-01",
    ownerAgentId: "a4",
    revisionStatus: "resolved",
    updatedAt: "2026-06-02T10:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft",     author: "agent",    timestamp: "2026-06-01T20:00:00.000Z", note: "Entrega criada" },
      { version: 1, status: "delivered", author: "internal", timestamp: "2026-06-02T10:00:00.000Z", note: "Entregue ao time criativo" },
    ],
  },
  {
    id: "d23",
    projectId: "p7",
    name: "Notas de Otimização — Semana 1",
    type: "Optimization Notes",
    status: "draft",
    version: 1,
    createdAt: "2026-06-03",
    ownerAgentId: "a4",
    revisionStatus: "none",
    updatedAt: "2026-06-03T11:00:00.000Z",
    revisionHistory: [
      { version: 1, status: "draft", author: "agent", timestamp: "2026-06-03T11:00:00.000Z", note: "Entrega criada" },
    ],
  },
];

export const MOCK_BRIEFINGS: Briefing[] = [
  {
    id: "b4",
    projectId: "p7",
    clientId: "c4",
    goal: "Lançar a Dioli Agência com presença forte nas redes sociais, comunicando seu posicionamento como agência digital com IA de forma estratégica, premium e clara.",
    audience: "Donos de negócio, fundadores e gestores de marketing de PMEs — restaurantes, lojas, marcas em crescimento no Brasil que precisam de presença digital profissional.",
    keyMessage: "A Dioli Agência entrega resultado de grande agência com a agilidade da IA. Você foca no negócio, a gente cuida do digital.",
    deliverables: "Estratégia de redes sociais, sistema de templates de design, calendário editorial, batch inicial de conteúdo.",
    deadline: "2026-07-31",
    successCriteria: "Perfil no Instagram ativo com identidade consistente. 12 posts publicados no primeiro mês. Feedback positivo de 2+ clientes piloto sobre o posicionamento percebido.",
    status: "pending_analysis",
    createdAt: "2026-05-30",
  },
  {
    id: "b1",
    projectId: "p1",
    clientId: "c1",
    goal: "Relaunch the Sushikasa brand digitally with a premium campaign.",
    audience: "25–45, urban professionals, food enthusiasts, high disposable income.",
    keyMessage: "Sushikasa is not just sushi — it is a ritual.",
    deliverables: "Campaign manifesto, hero visuals, paid ads, social content.",
    deadline: "2024-04-30",
    successCriteria: "Brand recall +30%, social engagement +50%, store visits +15%.",
    status: "approved",
    createdAt: "2024-03-01",
  },
  {
    id: "b2",
    projectId: "p2",
    clientId: "c2",
    goal: "Generate awareness and conversions for the Summer 2024 collection.",
    audience: "18–28, urban youth, fashion-forward, active on Instagram and TikTok.",
    keyMessage: "Summer is a statement. Wear it.",
    deliverables: "Content calendar, influencer briefs, paid social strategy.",
    deadline: "2024-05-15",
    successCriteria: "30K+ reach, 5% engagement rate, 100+ collection page visits per day.",
    status: "analyzed",
    createdAt: "2024-03-08",
  },
  {
    id: "b3",
    projectId: "p3",
    clientId: "c3",
    goal: "Define and communicate Dioli Studio's market positioning.",
    audience: "SMBs and scale-ups seeking strategic marketing partnerships.",
    keyMessage: "Strategy first. Execution always.",
    deliverables: "Positioning document, website copy, brand identity system.",
    deadline: "2024-06-01",
    successCriteria: "Clear differentiation from competitors, positive feedback from 3 pilot clients.",
    status: "pending_analysis",
    createdAt: "2024-03-10",
  },
];

export const MOCK_AGENTS: Agent[] = [
  {
    id: "a1",
    name: "Copy Agent",
    role: "Copywriter & Content Strategist",
    specialty: "Brand voice, advertising copy, long-form content, UX writing",
    whenToUse: "Whenever text needs to be written — ads, landing pages, email, social, manifestos.",
    inputs: ["Brand brief", "Target audience", "Key message", "Tone of voice guidelines"],
    outputs: ["Headlines", "Ad copy", "Landing page copy", "Social captions", "Long-form content"],
    status: "active",
  },
  {
    id: "a2",
    name: "Design Agent",
    role: "Visual Designer & Art Director",
    specialty: "Brand identity, digital assets, campaign visuals, UI layouts",
    whenToUse: "When visual output is needed — ads, presentations, brand materials, web visuals.",
    inputs: ["Brand assets", "Campaign brief", "Copy draft", "Reference visuals"],
    outputs: ["Hero visuals", "Ad creatives", "Brand assets", "Presentation decks"],
    status: "active",
  },
  {
    id: "a3",
    name: "Social Media Agent",
    role: "Social Media Strategist",
    specialty: "Content calendars, community management, TikTok/IG strategy",
    whenToUse: "For social-first campaigns, content planning, and platform-specific strategy.",
    inputs: ["Campaign concept", "Brand voice", "Audience profile", "Platform goals"],
    outputs: ["Content calendar", "Caption library", "Hashtag strategy", "Influencer briefs"],
    status: "active",
  },
  {
    id: "a4",
    name: "Paid Media Agent",
    role: "Performance Marketing Specialist",
    specialty: "Meta Ads, Google Ads, campaign structure, ROAS optimization",
    whenToUse: "For any paid acquisition — campaign setup, optimization, and reporting.",
    inputs: ["Campaign goals", "Budget", "Audience segments", "Creative assets"],
    outputs: ["Campaign structure", "Ad sets", "Performance reports", "Optimization briefs"],
    status: "active",
  },
  {
    id: "a5",
    name: "Creative Director Agent",
    role: "Creative Director",
    specialty: "Creative concept, campaign direction, creative QA",
    whenToUse: "For high-level creative direction — when a project needs a unifying concept.",
    inputs: ["Brand brief", "Market context", "Target audience"],
    outputs: ["Creative concept", "Moodboard", "Campaign direction document"],
    status: "available",
  },
  {
    id: "a6",
    name: "Strategy Agent",
    role: "Brand & Business Strategist",
    specialty: "Market research, positioning, competitive analysis, brand architecture",
    whenToUse: "At the start of any strategic project — positioning, research, or diagnosis.",
    inputs: ["Business context", "Market data", "Competitor landscape"],
    outputs: ["Positioning statement", "Strategic brief", "Competitive analysis", "SWOT"],
    status: "active",
  },
  {
    id: "a7",
    name: "QA Agent",
    role: "Quality Assurance Reviewer",
    specialty: "Content review, brand consistency, deliverable validation",
    whenToUse: "Before any deliverable goes to the client — final check for quality and alignment.",
    inputs: ["Briefing", "Brand guidelines", "All deliverables"],
    outputs: ["Review report", "Revision requests", "Approval confirmation"],
    status: "available",
  },
  {
    id: "a8",
    name: "SEO Agent",
    role: "SEO & Content Specialist",
    specialty: "On-page SEO, keyword research, content strategy, technical audits",
    whenToUse: "For organic search visibility — audits, content briefs, and optimization.",
    inputs: ["Site access", "Target keywords", "Content goals"],
    outputs: ["SEO audit", "Keyword map", "Content briefs", "Optimized pages"],
    status: "available",
  },
  {
    id: "a9",
    name: "Analytics Agent",
    role: "Data Analyst",
    specialty: "Campaign analytics, performance reporting, insight generation",
    whenToUse: "Post-campaign or mid-campaign for performance review and data interpretation.",
    inputs: ["Campaign data", "KPIs", "Platform exports"],
    outputs: ["Performance report", "Insight summary", "Optimization recommendations"],
    status: "available",
  },
  {
    id: "a10",
    name: "Email Agent",
    role: "Email Marketing Specialist",
    specialty: "Email strategy, automation flows, lifecycle campaigns",
    whenToUse: "For retention-focused work — newsletters, flows, and CRM-adjacent campaigns.",
    inputs: ["Audience segments", "Campaign goal", "Brand voice"],
    outputs: ["Email sequence", "Subject line variants", "Automation map"],
    status: "available",
  },
];

export const MOCK_BRAND_ASSETS: BrandAsset[] = [
  { id: "ba1", clientId: "c1", type: "logo", name: "Sushikasa Primary Logo", value: "SVG + PNG, black and white versions", notes: "Always maintain safe space equal to the height of the 'S'." },
  { id: "ba2", clientId: "c1", type: "color_palette", name: "Brand Colors", value: "#1A1A1A, #F5F0E8, #C8303A, #8B6914", notes: "Primary: black. Accent: red. Never use more than 2 colors in a single piece." },
  { id: "ba3", clientId: "c1", type: "typography", name: "Typography System", value: "Headlines: Cormorant Garamond / Body: Inter", notes: "Headlines always uppercase for sub-brands." },
  { id: "ba4", clientId: "c1", type: "tone_of_voice", name: "Brand Voice", value: "Refined, confident, minimal, never loud.", notes: "Avoid exclamation marks. Never use slang. Write as if explaining to a connoisseur." },
  { id: "ba5", clientId: "c2", type: "logo", name: "Santioh Wordmark", value: "SVG + PNG, dark and light versions", notes: "Logo never in red. White on dark backgrounds only." },
  { id: "ba6", clientId: "c2", type: "color_palette", name: "Brand Colors", value: "#0A0A0A, #FFFFFF, #E8E0D0, #3D5A80", notes: "Off-white is the primary background. Navy is the accent." },
  { id: "ba7", clientId: "c2", type: "tone_of_voice", name: "Brand Voice", value: "Bold, urban, culturally aware, aspirational but accessible.", notes: "Can use slang when targeting Gen Z. Always confident, never arrogant." },
  { id: "ba8", clientId: "c3", type: "logo", name: "Dioli Studio Mark", value: "SVG, geometric monogram", notes: "Primary usage: black on white. Reversed: white on black. No color version." },
  { id: "ba9", clientId: "c3", type: "color_palette", name: "Studio Colors", value: "#111111, #F7F7F6, #5B5BD6", notes: "Accent (indigo) used sparingly — only for CTAs and highlights." },
];

export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: "ev1", type: "task_updated", message: "Campaign Manifesto Copy marked as done", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), projectId: "p1" },
  { id: "ev2", type: "project_stage_changed", message: "Paid Media — Q2 moved to Internal Review", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), projectId: "p5" },
  { id: "ev3", type: "deliverable_updated", message: "Q2 Strategy Brief marked as approved", timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(), projectId: "p5" },
  { id: "ev4", type: "project_created", message: "SEO & Content Strategy project opened", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), projectId: "p4" },
  { id: "ev5", type: "task_updated", message: "Competitive Landscape Analysis done", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), projectId: "p3" },
  { id: "ev6", type: "briefing_created", message: "Briefing submitted for Agency Positioning", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), projectId: "p3" },
];
