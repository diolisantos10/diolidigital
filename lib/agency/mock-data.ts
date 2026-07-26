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

// ─── Deliverable Preview Content ──────────────────────────────────────────────
// Structured content stored per deliverable type.
// Rendered in the internal detail modal AND in the client portal.
// "notes" fields are internal-only and must never render in the portal.

export interface PreviewSection {
  title: string;
  body: string;
  items?: string[];
  notes?: string;
}

export interface PreviewPost {
  order: number;
  format: string;         // "Carrossel", "Reels", "Imagem única", etc.
  caption: string;
  hashtags: string;
  notes?: string;         // internal only
}

export interface PreviewFrame {
  order: number;
  description: string;    // visual composition description
  copy?: string;          // on-screen text / headline
  cta?: string;           // call to action text
}

export interface PreviewCalendarEntry {
  week: string;
  day?: string;
  format: string;
  title: string;
  caption: string;
  notes?: string;         // internal only
}

export interface PreviewAdCopy {
  label: string;          // "Variação A", "Variação B", etc.
  headline: string;
  body: string;
  cta: string;
  format?: string;
}

export interface PreviewAudience {
  name: string;
  description: string;
  size: string;
  interests: string;
  behaviors?: string;
}

export interface PreviewCampaign {
  name: string;
  objective: string;
  budget: string;
  adsets: Array<{ name: string; audience: string; placements: string }>;
}

export interface PreviewDesignSpec {
  name: string;
  format: string;
  description: string;
  notes?: string;         // internal only
}

export interface DeliverablePreviewContent {
  summary?: string;                     // one-line brief shown at the top
  sections?: PreviewSection[];          // strategy / brief / report / identity docs
  posts?: PreviewPost[];                // post batches
  frames?: PreviewFrame[];              // story packages
  entries?: PreviewCalendarEntry[];     // editorial calendars
  adCopies?: PreviewAdCopy[];           // ad copy variations
  audiences?: PreviewAudience[];        // audience plans
  campaigns?: PreviewCampaign[];        // campaign structures
  designSpecs?: PreviewDesignSpec[];    // design specs and templates
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
  // ── Preview Content V1 ────────────────────────────────────────────────────
  previewContent?: DeliverablePreviewContent;
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
    | "orchestrator_approved"
    | "proposal_sent"
    | "proposal_approved"
    | "proposal_rejected"
    | "deliverable_approved"
    | "change_requested"
    | "revision_resolved"
    | "brand_update_applied"
    | "brand_update_submitted"
    | "material_request_created"
    | "strategy_room_generated"
    | "intelligence_run"
    | "request_deleted";
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
      visualStyle: "Monochrome with indigo accent (#070A1F). Clean, structured layouts. Geometric precision. Typography-forward. No decorative elements without function. Dark-mode friendly.",
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
    previewContent: {
      summary: "Estratégia completa de redes sociais para os primeiros 60 dias da Dioli Agência. 5 pilares, mix de formatos, CTAs e diretrizes de tom.",
      sections: [
        {
          title: "Objetivo da Estratégia",
          body: "Posicionar a Dioli Agência como referência em marketing digital com IA para PMEs brasileiras, gerando autoridade, confiança e leads qualificados nos primeiros 60 dias de operação.",
        },
        {
          title: "Pilares de Conteúdo",
          body: "5 pilares estruturam toda a produção de conteúdo:",
          items: [
            "1. Autoridade com IA — Como a IA transforma resultados reais de clientes",
            "2. Bastidores da Agência — O processo, a equipe, os bastidores do trabalho",
            "3. Resultados de Clientes — Cases, métricas, antes e depois",
            "4. Educação de Mercado — Dicas práticas e posicionamento como especialista",
            "5. Humanização — A história da fundação, os valores, o propósito",
          ],
        },
        {
          title: "Tom de Voz",
          body: "Direto e confiante, sem ser arrogante. Técnico mas acessível — complexidade explicada de forma simples. Inspirador e honesto — sem hype, sem promessas vazias. Leve e próximo, sem perder o profissionalismo.",
        },
        {
          title: "Formatos e Frequência",
          body: "Mix semanal recomendado:",
          items: [
            "Instagram Feed: 3×/semana — Carrosséis (educação), Posts únicos (resultados), Reels (bastidores)",
            "Instagram Stories: Diariamente — Enquetes, bastidores, CTA para portfólio",
            "LinkedIn: 2×/semana — Artigos de autoridade, cases expandidos",
          ],
        },
        {
          title: "CTAs Prioritários",
          body: "Hierarquia de chamadas para ação por objetivo:",
          items: [
            "Geração de leads: 'Fale com a Dioli sobre o seu projeto →'",
            "Autoridade: 'Veja como entregamos isso em 7 dias'",
            "Engajamento: 'Qual desses problemas você já enfrentou?'",
            "Salvamento: 'Salva esse post — você vai precisar'",
          ],
        },
      ],
    },
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
    previewContent: {
      summary: "Calendário editorial de 8 semanas (Junho–Julho 2026) para o lançamento da Dioli Agência. 3 publicações semanais no Instagram, alternando entre conteúdo educativo, case/prova social e posicionamento de marca.",
      entries: [
        { week: "Semana 1 (02–08 Jun)", day: "Terça", format: "Carrossel", title: "O que é uma agência com IA?", caption: "A Dioli não trabalha com tentativa e erro. Cada campanha começa com estratégia, dados e automação inteligente. Conheça a diferença." },
        { week: "Semana 1 (02–08 Jun)", day: "Quinta", format: "Reels", title: "Bastidores do lançamento", caption: "Meses de planejamento, tecnologia de ponta e uma equipe movida por resultado. Bem-vindo à Dioli Agência. 🧡", notes: "Usar B-roll do workspace + narração curta" },
        { week: "Semana 1 (02–08 Jun)", day: "Sábado", format: "Single", title: "Frase de posicionamento", caption: "\"Não vendemos seguidores. Vendemos crescimento.\" — Dioli Agência" },
        { week: "Semana 2 (09–15 Jun)", day: "Terça", format: "Carrossel", title: "3 erros que destroem campanhas de tráfego pago", caption: "Você investe em anúncios mas não vê resultado? O problema quase nunca está no criativo. Está na estratégia. Aqui estão os 3 erros mais comuns." },
        { week: "Semana 2 (09–15 Jun)", day: "Quinta", format: "Reels", title: "Case: restaurante 0 → 40k seguidores", caption: "Em 90 dias, um restaurante saiu do zero para 40 mil seguidores orgânicos. Estratégia + consistência + IA.", notes: "Usar gráficos animados + depoimento do cliente" },
        { week: "Semana 2 (09–15 Jun)", day: "Sábado", format: "Single", title: "Dado impactante sobre presença digital", caption: "87% dos consumidores pesquisam no Instagram antes de comprar. Sua marca está sendo encontrada?" },
        { week: "Semana 3 (16–22 Jun)", day: "Terça", format: "Carrossel", title: "Como funciona nosso processo de onboarding", caption: "Do briefing à primeira publicação em 7 dias. Veja como a Dioli estrutura o início de cada parceria." },
        { week: "Semana 3 (16–22 Jun)", day: "Quinta", format: "Reels", title: "Antes e depois: identidade visual", caption: "Uma identidade visual forte não é estética. É estratégia de marca. Veja a transformação." },
        { week: "Semana 3 (16–22 Jun)", day: "Sábado", format: "Single", title: "CTA de consulta gratuita", caption: "Quer saber o que está impedindo sua marca de crescer? Chama no direct. Consulta gratuita por tempo limitado." },
        { week: "Semana 4 (23–29 Jun)", day: "Terça", format: "Carrossel", title: "O que fazemos (e o que não fazemos)", caption: "Transparência é parte da nossa estratégia. Saiba exatamente o que você contrata quando escolhe a Dioli." },
        { week: "Semana 4 (23–29 Jun)", day: "Quinta", format: "Reels", title: "IA na prática: como usamos na sua campanha", caption: "Não é ficção científica. É análise de dados em tempo real, otimização automática e criação assistida. Assim funciona a Dioli." },
        { week: "Julho (abertura)", day: "Terça", format: "Carrossel", title: "Resultados de Junho — Transparência total", caption: "Fechamos Junho com X posts, Y alcance orgânico e Z novos leads. Aqui está o relatório completo.", notes: "Preencher métricas reais em 30/Jun" },
      ],
    },
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
    previewContent: {
      summary: "8 posts prontos para Semana 1 do lançamento. Mix de carrosséis educativos, reels de bastidores e singles de posicionamento. Tom direto, premium e orientado a resultado.",
      posts: [
        { order: 1, format: "Carrossel (6 slides)", caption: "A Dioli Agência não nasceu para ser mais uma. Nasceu para ser a diferença entre uma marca invisível e uma marca que vende.\n\n→ Estratégia orientada por dados\n→ IA integrada em cada etapa\n→ Resultados mensuráveis desde a semana 1\n\nBem-vindo ao novo padrão de marketing digital.", hashtags: "#DiolicAgência #MarketingDigital #IAnoMarketing #AgênciaDigital #EstraégiaDeConteúdo" },
        { order: 2, format: "Reels (0:45)", caption: "Bastidores de como construímos uma estratégia do zero. Sem achismo. Sem sorte. Só processo.\n\n🎯 Briefing aprofundado\n📊 Análise de concorrência\n🤖 IA para identificar oportunidades\n✍️ Conteúdo estratégico\n📈 Métricas que importam\n\nAssim nasce uma campanha Dioli.", hashtags: "#BastidoresDioli #ProcessoCriativo #MarketingComIA" },
        { order: 3, format: "Single (quote)", caption: "\"A maioria das marcas posta. Poucas se comunicam. Ainda menos convertem.\"\n\nA diferença está na estratégia — não na frequência.\n\n— Dioli Agência", hashtags: "#EstraégiaDeMarca #MarketingDigital #Conteúdo" },
        { order: 4, format: "Carrossel (5 slides)", caption: "5 perguntas para saber se você precisa de uma agência agora:\n\n1. Você posta, mas ninguém engaja?\n2. Você investe em anúncios sem retorno claro?\n3. Sua identidade visual não reflete quem você é?\n4. Você não tem tempo para criar conteúdo consistente?\n5. Você quer crescer, mas não sabe por onde começar?\n\nSe respondeu sim para 2 ou mais — vamos conversar.", hashtags: "#AgênciaDigital #GestãoDeMarca #MarketingParaPME" },
        { order: 5, format: "Single (dado)", caption: "Marcas que publicam com consistência e estratégia crescem 3x mais rápido do que as que publicam por impulso.\n\nConsistência + Estratégia = Crescimento.\n\nSimples assim.", hashtags: "#DadosDeMarketing #ConsistênciaDigital #CrescimentoDigital" },
        { order: 6, format: "Reels (1:00)", caption: "O que acontece quando uma PME decide levar o digital a sério?\n\n📍 Caso real. 60 dias. Resultado real.\n\nDesliza para ver os números 👉", hashtags: "#CaseDeMarketing #DiolicAgência #ResultadosReais", notes: "Animar gráfico de crescimento no final" },
        { order: 7, format: "Carrossel (4 slides)", caption: "Por que tráfego pago sozinho não basta:\n\nSlide 1: Anúncio atrai. Perfil converte — ou repele.\nSlide 2: Sem conteúdo orgânico forte, o custo por lead sobe.\nSlide 3: Marca fraca = público que clica, mas não compra.\nSlide 4: A solução é o ecossistema completo. Tráfego + Conteúdo + Marca.\n\nA Dioli integra os três.", hashtags: "#TráfegoPago #MetaAds #EcossistemaDigital" },
        { order: 8, format: "Single (CTA)", caption: "Primeira consulta gratuita.\n\nSem compromisso. Sem papo de vendedor.\n\nSó estratégia real para o seu negócio.\n\n👇 Link na bio ou chama no direct.", hashtags: "#ConsultaGratuita #MarketingDigital #DiolicAgência" },
      ],
    },
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
    previewContent: {
      summary: "Semana 2 aprofunda autoridade: erros comuns em tráfego pago, processo de onboarding, case de antes/depois e convite à consulta. Rascunho — aguarda revisão interna antes de enviar ao cliente.",
      posts: [
        { order: 1, format: "Carrossel (6 slides)", caption: "3 erros que destroem campanhas de tráfego pago (e como evitar cada um):\n\nErro 1: Público muito amplo → segmentação imprecisa = CPL alto\nErro 2: Criativo sem oferta clara → clique sem conversão\nErro 3: Ausência de pixel configurado → sem dados, sem otimização\n\nCorreções práticas em cada slide. Salva esse.", hashtags: "#MetaAds #TráfegoPago #GoogleAds #ErrosDeMarketing", notes: "Rascunho — revisar exemplos antes de aprovar" },
        { order: 2, format: "Reels (0:30)", caption: "Em 30 segundos: o que acontece depois que você nos contrata.\n\n📋 Briefing → 🔍 Diagnóstico → 🎯 Estratégia → ✍️ Conteúdo → 🚀 Publicação → 📊 Relatório\n\nTudo isso em 7 dias.", hashtags: "#OnboardingDioli #ProcessoÁgil #AgênciaDigital" },
        { order: 3, format: "Single (antes/depois)", caption: "Antes da Dioli: feed sem padrão, sem identidade, sem estratégia.\nDepois da Dioli: presença consistente, crescimento orgânico, conversão real.\n\nQual dos dois você quer ser?", hashtags: "#TransformaçãoDigital #AnteseDepois #IdentidadeVisual" },
        { order: 4, format: "Carrossel (5 slides)", caption: "O que a IA faz na sua campanha:\n\n1. Analisa padrões de engajamento do seu setor\n2. Identifica os melhores horários para publicar\n3. Sugere temas com maior potencial de alcance\n4. Otimiza copy com base em dados de conversão\n5. Gera relatórios automáticos com insights reais\n\nSem achismo. Com inteligência.", hashtags: "#IAnoMarketing #MarketingInteligente #AutomaçãoDeMarketing" },
        { order: 5, format: "Single (frase)", caption: "\"Não existe fórmula mágica. Existe processo. Existe dado. Existe consistência.\"\n\nE existe quem saiba usar os três.", hashtags: "#MarketingDigital #EstraégiaDeConteúdo #Resultado" },
        { order: 6, format: "Carrossel (4 slides)", caption: "Como avaliamos se sua marca está pronta para crescer:\n\n→ Identidade visual coerente?\n→ Posicionamento definido?\n→ Audiência mapeada?\n→ Objetivos mensuráveis?\n\nNosso diagnóstico gratuito responde essas perguntas em 24h.", hashtags: "#DiagnósticoDigital #ConsultaGratuita #Diolic" },
        { order: 7, format: "Reels (0:45)", caption: "Quanto custa não ter estratégia?\n\n→ Campanhas sem ROI\n→ Tempo desperdiçado em conteúdo que não converte\n→ Marca que cresce devagar (ou não cresce)\n\nO custo da inação é maior do que você imagina.", hashtags: "#ROI #EstraégiaDigital #MarketingComResultado" },
        { order: 8, format: "Single (CTA final semana)", caption: "Você chegou até aqui. Isso já diz muito sobre você.\n\nEmpresários que chegam até aqui são os que realmente querem crescer.\n\nVamos conversar? 👇 Link na bio.", hashtags: "#CTADioli #ConsultaEstraégica #VamosConversar" },
      ],
    },
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
    previewContent: {
      summary: "Sequência de 5 stories para o dia de lançamento. Narrativa em arco: teaser → apresentação → proposta de valor → prova social → CTA. Fundo escuro com acento laranja, tipografia bold.",
      frames: [
        { order: 1, description: "Tela de abertura — teaser", copy: "Algo está prestes a mudar.", cta: "Arrasta para ver 👉" },
        { order: 2, description: "Apresentação da agência", copy: "A Dioli Agência chegou.\n\nEstraégia. IA. Resultado.", cta: "Continua 👉" },
        { order: 3, description: "Proposta de valor em 3 pontos", copy: "✦ Marketing orientado por dados\n✦ IA integrada em cada entrega\n✦ Time dedicado ao seu crescimento", cta: "E tem mais 👉" },
        { order: 4, description: "Prova social / validação", copy: "Já ajudamos marcas a crescerem 3x em 90 dias.\n\nAgora é a sua vez.", cta: "Veja o que preparamos 👉" },
        { order: 5, description: "CTA final com link", copy: "Primeira consulta gratuita.\n\nPor tempo limitado.", cta: "Link na bio ou clica aqui ☝️" },
      ],
    },
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
    previewContent: {
      summary: "Briefing completo para o time de design criar todos os templates e criativos do lançamento. Inclui paleta, tipografia, tom visual, formatos requeridos e especificações por tipo de peça.",
      sections: [
        { title: "Identidade Visual", body: "A Dioli opera em dois modos visuais: dark mode (fundo #0A0A0A, acentos laranja #12B5AC) e light mode (fundo #FFFFFF, acentos laranja). O laranja é sempre o elemento de destaque — nunca decorativo. Tipografia principal: Inter Bold para headlines, Inter Regular para corpo. Sem serifadas." },
        { title: "Tom Visual", body: "Premium, moderno, direto. Sem ilustrações infantis ou clipart. Fotografias de alta qualidade ou ausência delas. Gráficos e ícones minimalistas. Espaço negativo generoso. Nunca poluído." },
        { title: "Formatos Requeridos", body: "Feed Instagram: 1080×1080px (single) e 1080×1350px (retrato). Stories: 1080×1920px. Reels (thumb): 1080×1080px. LinkedIn: 1200×628px. Todos os templates devem ter versão dark e light.", items: ["Feed quadrado: 1080×1080px", "Feed retrato: 1080×1350px", "Stories: 1080×1920px", "Thumb reels: 1080×1080px", "LinkedIn: 1200×628px"] },
        { title: "Especificações por Peça", body: "Carrosséis: primeiro slide com headline impactante (max 8 palavras), slides intermediários com bullet points ou dados, último slide sempre com CTA + logo. Singles: uma mensagem, máximo 12 palavras, logo sutil no rodapé." },
      ],
      designSpecs: [
        { name: "Template Carrossel Educativo", format: "1080×1350px × 6 slides", description: "Capa bold com título, slides 2–5 com conteúdo numerado, slide final com CTA e logo. Fundo escuro com texto branco e destaque laranja nos números." },
        { name: "Template Single Quote", format: "1080×1080px", description: "Texto centralizado em Inter Bold, máx. 15 palavras, linha decorativa laranja abaixo da assinatura. Fundo escuro." },
        { name: "Template Stories Sequencial", format: "1080×1920px × 5 telas", description: "Numeração discreta no canto superior, área de texto centralizada no terço inferior, CTA na última tela com botão laranja." },
      ],
    },
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
    previewContent: {
      summary: "12 layouts de templates para o feed do Instagram. Sistema visual coeso com dark mode como padrão, acento laranja, tipografia Inter. Versão 2 incorpora feedback do cliente: mais fundos escuros, laranja mais presente.",
      designSpecs: [
        { name: "Template A — Carrossel Educativo (dark)", format: "1080×1350px × 6 slides", description: "Capa: título bold, fundo #0A0A0A, destaque laranja. Slides 2–5: numeração laranja, texto branco. Slide 6: CTA + logo Dioli." },
        { name: "Template B — Carrossel Educativo (light)", format: "1080×1350px × 6 slides", description: "Variante clara do Template A. Fundo #F5F5F5, texto #0A0A0A, acentos laranja mantidos. Uso em publicações de tom mais acessível." },
        { name: "Template C — Single Quote (dark)", format: "1080×1080px", description: "Texto centralizado, Inter Bold, fundo escuro. Linha laranja acima da assinatura. Logo rodapé esquerdo." },
        { name: "Template D — Single Quote (light)", format: "1080×1080px", description: "Variante clara. Fundo branco, texto escuro, acento laranja na linha decorativa." },
        { name: "Template E — Single Dado/Estatística", format: "1080×1080px", description: "Número grande em laranja bold (ex: 87%), subtítulo em branco, contexto em cinza. Alto impacto visual." },
        { name: "Template F — CTA com Botão", format: "1080×1080px", description: "Chamada para ação com pseudo-botão laranja. Texto: convite à ação. Rodapé: @dioliconsulting." },
        { name: "Template G — Antes/Depois (split)", format: "1080×1080px", description: "Divisão vertical 50/50. Lado esquerdo cinza/neutro ('Antes'), direito laranja/vibrante ('Depois'). Label nos lados." },
        { name: "Template H — Reels Thumbnail", format: "1080×1080px", description: "Ícone de play sutil no canto inferior direito. Headline bold. Fundo escuro. Bordas com gradiente laranja sutil." },
        { name: "Template I — Conquista/Resultado", format: "1080×1350px", description: "Métrica principal em destaque máximo (tamanho 80pt laranja). Contexto abaixo em menor hierarquia." },
        { name: "Template J — Processo em Steps", format: "1080×1350px × 4 slides", description: "Linha do tempo vertical com pontos numerados em laranja. Fundo escuro. Progressão clara de step 1 a 4." },
        { name: "Template K — Pergunta/Resposta", format: "1080×1080px", description: "Pergunta em italic branco, resposta bold laranja. Formato de diálogo visual. Gera engajamento por reconhecimento." },
        { name: "Template L — Fechamento/Assinatura", format: "1080×1080px", description: "Template de encerramento de série. Logotipo centralizado grande. URL da agência. Fundo totalmente escuro." },
      ],
    },
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
    previewContent: {
      summary: "6 templates para Stories em 1080×1920px. Cobertura de todos os tipos de publicação em Stories: conteúdo narrativo, pergunta/enquete, bastidores, CTA direto, sequência de lançamento e anúncio de novidade.",
      designSpecs: [
        { name: "Stories A — Narrativa Sequencial", format: "1080×1920px", description: "Zona de segurança no terço central. Numeração (1/5) no canto superior direito. Headline bold no terço superior, corpo no meio, CTA no inferior." },
        { name: "Stories B — Enquete / Pergunta", format: "1080×1920px", description: "Texto da pergunta em bold centralizado. Área reservada abaixo para sticker de enquete do Instagram. Fundo degradê escuro→laranja sutil." },
        { name: "Stories C — Bastidores (vertical)", format: "1080×1920px", description: "Área superior para foto/vídeo (70% da tela). Barra inferior escura com texto de contexto e tag @dioliconsulting." },
        { name: "Stories D — CTA Direto", format: "1080×1920px", description: "Headline de 1 linha em 80pt bold. Sub em 28pt. Botão laranja arredondado no terço inferior. Seta de swipe up sutil abaixo." },
        { name: "Stories E — Anúncio de Novidade", format: "1080×1920px", description: "Selo 'NOVO' em laranja no canto superior esquerdo. Ícone de produto/serviço centralizado. Nome da oferta em destaque." },
        { name: "Stories F — Depoimento / Prova Social", format: "1080×1920px", description: "Aspas grandes em laranja no canto superior. Texto do depoimento em itálico branco centralizado. Nome/cargo da fonte no rodapé." },
      ],
    },
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
    previewContent: {
      summary: "3 variações de criativos para o dia de lançamento oficial. Cada variação testa um ângulo diferente: impacto emocional, proposta racional e urgência/escassez. Aprovados pelo cliente para uso imediato.",
      designSpecs: [
        { name: "Variação 1 — Impacto Emocional", format: "1080×1080px + 1080×1920px (Stories)", description: "Headline: \"A agência que faltava para o seu negócio.\" Fundo escuro total. Logo centralizado em laranja. Tagline abaixo em cinza claro. Zero distrações. Apelo à identidade." },
        { name: "Variação 2 — Proposta Racional", format: "1080×1080px + 1080×1920px (Stories)", description: "Headline: \"Estratégia. IA. Resultado.\" + 3 ícones abaixo representando cada pilar. Fundo escuro, ícones em laranja outlined. Texto explicativo compacto abaixo de cada ícone." },
        { name: "Variação 3 — Urgência / Escassez", format: "1080×1080px + 1080×1920px (Stories)", description: "Headline: \"Vagas limitadas para junho.\" Contador visual (ex: 3/10 vagas). CTA em botão laranja sólido. Subtext: \"Consulta gratuita — apenas esta semana.\"" },
      ],
    },
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
    previewContent: {
      summary: "Manual de uso da identidade visual da Dioli Agência aplicado às redes sociais. Define paleta oficial, tipografia, regras de uso do logo e comportamentos visuais proibidos.",
      sections: [
        { title: "Paleta de Cores", body: "Cor principal: Laranja Dioli (#12B5AC). Uso: CTAs, destaques, ícones ativos, números em dados. Fundos primários: Preto Profundo (#0A0A0A) para dark mode; Branco (#FFFFFF) para light mode. Cinza de suporte: #1A1A1A (cards dark), #F5F5F5 (cards light). Nunca usar o laranja como cor de fundo dominante — ele é sempre acento.", items: ["#12B5AC — Laranja Dioli (acento)", "#0A0A0A — Preto Profundo (fundo dark)", "#FFFFFF — Branco (fundo light)", "#1A1A1A — Cinza Escuro (cards dark)", "#F5F5F5 — Cinza Claro (cards light)"] },
        { title: "Tipografia", body: "Família principal: Inter (Google Fonts, sem custo). Headlines: Inter Bold (700), tamanho mínimo 28pt em qualquer peça. Corpo: Inter Regular (400), espaçamento de linha 1.5. Nunca usar serifadas, nunca usar fontes decorativas. Hierarquia obrigatória: Headline > Subheadline > Corpo > Rodapé." },
        { title: "Logo — Regras de Uso", body: "Versão principal: logotipo completo 'Dioli' em branco sobre fundo escuro, ou em preto sobre fundo branco. Versão reduzida: símbolo (ícone D) para uso em espaços pequenos (ex: rodapé de template). Zona de proteção: margem mínima equivalente à altura da letra 'D' ao redor do logo. Nunca deformar, rotacionar, aplicar sombra ou alterar cores do logo.", items: ["✓ Logo branco sobre fundo escuro", "✓ Logo preto sobre fundo branco", "✓ Logo laranja apenas em casos excepcionais (aprovação necessária)", "✗ Não aplicar sobre fotos sem overlay", "✗ Não usar versão colorida em fundos complexos"] },
        { title: "Comportamentos Proibidos", body: "Esta seção define o que NÃO fazer para proteger a percepção premium da marca.", items: ["✗ Usar mais de 2 cores em uma única peça além da paleta oficial", "✗ Fontes que não sejam Inter", "✗ Backgrounds com gradientes complexos ou texturas", "✗ Imagens com filtros excessivos ou cores saturadas", "✗ Emojis em peças formais ou carrosséis educativos", "✗ Texto menor que 18pt em qualquer publicação"] },
      ],
    },
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
    previewContent: {
      summary: "Estratégia completa de tráfego pago para o lançamento da Dioli Agência no Meta Ads. Orçamento inicial de R$1.500/mês, 3 fases (Awareness → Consideração → Conversão), KPIs definidos por fase.",
      sections: [
        { title: "Objetivo de Campanha", body: "Fase 1 (Semanas 1–2): Reconhecimento de marca. Alcançar empreendedores de PMEs na Grande Curitiba e demais capitais do Sul. Meta: 50.000 impressões, CPM abaixo de R$15. Fase 2 (Semanas 3–4): Geração de leads qualificados. Meta: 80 leads ao custo de até R$18,75/lead. Fase 3 (Mês 2+): Conversão para consulta agendada. Meta: 15 consultas realizadas, taxa de conversão lead→consulta ≥ 20%." },
        { title: "Orçamento", body: "Mês 1: R$1.500 total. Distribuição: 40% Awareness (R$600), 40% Leads (R$600), 20% Retargeting (R$300). Revisão de orçamento após Semana 2 com base em CPM e CTR reais. Escalonamento previsto para R$3.000/mês no Mês 2 se CPA < R$100." },
        { title: "Públicos-alvo", body: "Público Frio: donos de negócio 25–45 anos, interesses em marketing digital, empreendedorismo, Instagram Business, Meta for Business. Raio: Brasil (foco Sul/SP). Lookalike: baseado em lista de contatos atuais (mín. 100 e-mails). Retargeting: visitantes do site + pessoas que interagiram com o perfil nos últimos 30 dias." },
        { title: "Ângulos de Campanha", body: "Ângulo 1 — Dor: \"Você investe em marketing mas não vê resultado?\" (foco em frustração). Ângulo 2 — Autoridade: \"A agência que usa IA para criar campanhas que convertem\" (foco em diferencial). Ângulo 3 — Urgência: \"Vagas limitadas para junho — consulta gratuita\" (foco em escassez). Teste A/B obrigatório nas Semanas 1–2. Ângulo vencedor recebe 70% do budget na Semana 3." },
        { title: "KPIs e Metas", body: "Semana 1–2: Alcance ≥ 20.000 pessoas únicas, Impressões ≥ 50.000, CPM ≤ R$15, CTR ≥ 1,5%. Semana 3–4: Leads ≥ 80, CPL ≤ R$18,75, Taxa de clique para formulário ≥ 4%. Mês 2: Consultas ≥ 15, CPA ≤ R$100, Conversão lead→consulta ≥ 20%." },
      ],
    },
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
    previewContent: {
      summary: "Estrutura técnica das campanhas no Meta Ads Manager. 3 campanhas com objetivos distintos, 6 conjuntos de anúncios e 12 criativos ativos. Pronta para importação após aprovação.",
      campaigns: [
        {
          name: "DIOLI_JUN26_AWARENESS",
          objective: "Reconhecimento — Alcance máximo com frequência controlada (max 3x/semana por pessoa)",
          budget: "R$600 (Semanas 1–2)",
          adsets: [
            { name: "Frio — Empreendedores Sul", audience: "Donos de negócio 25–45, interesses marketing digital, Sul do Brasil", placements: "Feed Instagram + Stories Instagram" },
            { name: "Frio — Empreendedores SP/Capital", audience: "Donos de negócio 28–45, interesses empreendedorismo, São Paulo Capital", placements: "Feed Instagram + Reels" },
          ],
        },
        {
          name: "DIOLI_JUN26_LEADS",
          objective: "Geração de cadastros — Formulário nativo Meta (Nome, E-mail, Empresa, Desafio principal)",
          budget: "R$600 (Semanas 3–4)",
          adsets: [
            { name: "Lookalike 1% — Contatos", audience: "Lookalike de lista de contatos existente (1%), Brasil", placements: "Feed Instagram + Facebook Feed" },
            { name: "Interesse — Marketing Digital", audience: "Gestores de marketing 28–50, interesses Meta Business, Google Ads, Marketing Digital", placements: "Feed Instagram + Stories" },
          ],
        },
        {
          name: "DIOLI_JUN26_RETARGETING",
          objective: "Conversão — Agendamento de consulta gratuita",
          budget: "R$300 (Semanas 1–4, contínuo)",
          adsets: [
            { name: "Engajamento 30d — Instagram", audience: "Pessoas que interagiram com o perfil @dioliconsulting nos últimos 30 dias", placements: "Stories Instagram + Feed Instagram" },
            { name: "Visitantes do Site", audience: "Visitantes do site nos últimos 14 dias (via pixel)", placements: "Feed Instagram + Facebook" },
          ],
        },
      ],
    },
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
    previewContent: {
      summary: "6 variações de copy para anúncios no Meta Ads. Cobrem 3 ângulos (dor, autoridade, urgência) em 2 formatos cada (feed e stories). Aguardam aprovação interna antes de subir na plataforma.",
      adCopies: [
        { label: "Ângulo Dor — Feed", headline: "Você investe em marketing mas não vê resultado?", body: "A maioria das agências vende presença. A Dioli vende crescimento.\n\nEstraégia orientada por dados + IA integrada em cada campanha.\n\nPrimeira consulta gratuita — sem compromisso.", cta: "Agendar Consulta Gratuita", format: "Feed 1080×1080px" },
        { label: "Ângulo Dor — Stories", headline: "Cansado de gastar e não crescer?", body: "Chega de achismo no marketing.\n\nA Dioli usa dados reais e IA para criar campanhas que convertem.\n\nVagas limitadas para junho.", cta: "Quero Saber Mais", format: "Stories 1080×1920px" },
        { label: "Ângulo Autoridade — Feed", headline: "A agência que usa IA para criar campanhas que convertem.", body: "Não é promessa. É processo.\n\n→ Diagnóstico gratuito da sua presença digital\n→ Estratégia personalizada em 48h\n→ Execução com IA e time especializado\n\nResultados mensuráveis desde a semana 1.", cta: "Conhecer a Dioli", format: "Feed 1080×1080px" },
        { label: "Ângulo Autoridade — Stories", headline: "Marketing com IA. Resultados reais.", body: "Estratégia + Automação + Time dedicado.\n\nAssim funciona a Dioli Agência.", cta: "Ver Como Funciona", format: "Stories 1080×1920px" },
        { label: "Ângulo Urgência — Feed", headline: "Apenas 5 vagas para junho.", body: "A Dioli Agência trabalha com poucos clientes para entregar resultados extraordinários.\n\nRestam 5 vagas para início em junho.\n\nConsulta gratuita por tempo limitado.", cta: "Garantir Minha Vaga", format: "Feed 1080×1080px" },
        { label: "Ângulo Urgência — Stories", headline: "Vagas limitadas. Consulta gratuita.", body: "Não deixa para depois.\n\nFecha junho com estratégia. Começa julho crescendo.", cta: "Quero Minha Vaga", format: "Stories 1080×1920px" },
      ],
    },
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
    previewContent: {
      summary: "4 segmentos de público-alvo mapeados para as campanhas de tráfego pago e conteúdo orgânico. Cada segmento tem perfil detalhado, tamanho estimado, interesses e comportamentos de compra.",
      audiences: [
        { name: "Fundador de PME em Crescimento", description: "Dono de negócio entre 28–45 anos, empresa com 1–10 funcionários, já tem CNPJ e faturamento mínimo de R$10k/mês. Quer crescer mas não tem time de marketing interno. Busca parceiros, não fornecedores.", size: "Estimado: 180.000–250.000 pessoas (Brasil)", interests: "Empreendedorismo, Gestão de Negócios, Finanças, Automação, Instagram Business", behaviors: "Visita sites de agências, assiste conteúdo de marketing no YouTube, segue perfis como Conrado Adolpho, Neil Patel BR" },
        { name: "Gestor de Marketing de PME", description: "Profissional de marketing em empresa pequena ou média, 25–38 anos. Gerencia múltiplos canais com orçamento limitado. Precisa de parceiro estratégico e execução ágil. Responde a diretores, não ao dono.", size: "Estimado: 90.000–130.000 pessoas (Brasil)", interests: "Meta Ads, Google Ads, Canva, HubSpot, Marketing Digital, Growth Hacking", behaviors: "Lê blogs de marketing (Rock Content, Resultados Digitais), usa ferramentas SaaS, busca cursos e certificações" },
        { name: "Restaurante e Food Service", description: "Dono ou gestor de restaurante, cafeteria, delivery ou food business. Sabe que precisa de presença digital mas não tem tempo nem conhecimento para executar. Já tentou agências genéricas sem resultado.", size: "Estimado: 60.000–90.000 pessoas (Brasil Sul + capitais)", interests: "Gastronomia, Delivery, iFood, Instagram para restaurantes, Fotografia de alimentos", behaviors: "Pesquisa muito antes de contratar, prioriza referências e cases do mesmo setor" },
        { name: "Marca de Produto com Loja Online", description: "Empreendedor com e-commerce ou loja física + online. Produto próprio ou revenda. Busca aumentar vendas e reconhecimento de marca. Meta Ads já foi tentado mas sem ROI claro.", size: "Estimado: 120.000–200.000 pessoas (Brasil)", interests: "E-commerce, Shopify, Dropshipping, Moda, Beleza, Nicho de produto", behaviors: "Testa múltiplas agências, muito sensível a ROI, cancela contrato rápido sem resultado" },
      ],
    },
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
    previewContent: {
      summary: "Especificações técnicas e de mensagem para os criativos de anúncio em cada etapa do funil. Guia para o time de design e copy produzirem peças alinhadas com o objetivo de cada fase.",
      sections: [
        { title: "Topo de Funil — Awareness", body: "Objetivo: Interromper o scroll e gerar reconhecimento de marca. Métricas-alvo: CPM baixo, alta taxa de visualização de vídeo (≥ 15s), alcance amplo.", items: ["Formato: Reels curtos (15–30s) ou imagem bold com headline de impacto", "Mensagem: Dor ou curiosidade — NÃO tentar vender ainda", "Visual: Fundo escuro, headline grande, zero texto miúdo", "Copy: 1 frase de impacto + máx. 2 linhas de contexto", "CTA: 'Saiba mais' ou 'Ver perfil'", "Tom: Provocativo, intrigante, direto"] },
        { title: "Meio de Funil — Consideração", body: "Objetivo: Gerar cliques qualificados e leads. Público já conhece a marca. Hora de apresentar a proposta com mais profundidade.", items: ["Formato: Carrossel ou vídeo explicativo (30–60s)", "Mensagem: Diferencial da Dioli + processo + prova social", "Visual: Misto dark/light — mais estruturado que awareness", "Copy: 3–5 bullets com benefícios específicos", "CTA: 'Agendar Consulta Gratuita' ou 'Quero Saber Mais'", "Tom: Confiante, especialista, próximo"] },
        { title: "Fundo de Funil — Conversão", body: "Objetivo: Converter leads quentes em consultas agendadas. Público já interagiu com a marca pelo menos 2 vezes.", items: ["Formato: Single estático ou vídeo curto (15s) de retargeting", "Mensagem: Urgência real (vagas, prazo, oferta)", "Visual: Direto ao ponto — CTA laranja dominante", "Copy: Foco na ação imediata, poucos elementos", "CTA: 'Garantir Minha Vaga' ou 'Agendar Agora'", "Tom: Urgente, exclusivo, sem rodeios"] },
      ],
    },
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
    previewContent: {
      summary: "Observações e ações de otimização após a primeira semana de campanhas ativas. Em rascunho — dados reais serão inseridos ao final da Semana 1 (previsto: 09/Jun/2026).",
      sections: [
        { title: "Observações da Semana 1", body: "[ A preencher após 09/Jun/2026 com dados reais do Meta Ads Manager ]\n\nEstrutura de observação esperada:\n→ CPM real vs. meta (≤ R$15)\n→ CTR real vs. meta (≥ 1,5%)\n→ Frequência por conjunto de anúncios\n→ Criativo com melhor performance (headline vencedora)\n→ Público com menor CPM", notes: "Rascunho — preencher com dados reais em 09/Jun" },
        { title: "Ações de Otimização Planejadas", body: "Baseadas no playbook padrão para Semana 1 de campanha nova:", items: ["Pausar criativos com CTR < 0,8% após 500 impressões", "Escalar conjuntos de anúncios com CPL < R$15 em 20% do orçamento", "Duplicar conjunto vencedor com orçamento adicional de R$150", "Ajustar segmentação geográfica se houver concentração em uma região não-alvo", "Atualizar copy dos anúncios de baixo desempenho mantendo o visual"] },
        { title: "Próximos Passos — Semana 2", body: "Ações planejadas independente dos dados (estruturais):", items: ["Ativar campanha de Leads (DIOLI_JUN26_LEADS) na Semana 2", "Configurar evento de conversão 'Lead Gerado' no pixel", "Subir 2 novos criativos: Ângulo Dor v2 e Case Resultado", "Agendar call de alinhamento com cliente em 10/Jun para revisão de resultados"] },
      ],
    },
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
  { id: "ba9", clientId: "c3", type: "color_palette", name: "Studio Colors", value: "#111111, #F7F7F6, #070A1F", notes: "Accent (indigo) used sparingly — only for CTAs and highlights." },
];

export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: "ev1", type: "task_updated", message: "Campaign Manifesto Copy marked as done", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), projectId: "p1" },
  { id: "ev2", type: "project_stage_changed", message: "Paid Media — Q2 moved to Internal Review", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), projectId: "p5" },
  { id: "ev3", type: "deliverable_updated", message: "Q2 Strategy Brief marked as approved", timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(), projectId: "p5" },
  { id: "ev4", type: "project_created", message: "SEO & Content Strategy project opened", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), projectId: "p4" },
  { id: "ev5", type: "task_updated", message: "Competitive Landscape Analysis done", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), projectId: "p3" },
  { id: "ev6", type: "briefing_created", message: "Briefing submitted for Agency Positioning", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), projectId: "p3" },
];
