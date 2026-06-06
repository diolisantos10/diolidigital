// ─── Briefing Extractor ────────────────────────────────────────────────────────
// Pure rule-based extraction — no API calls, no secrets, safe for client portal.
// Parses free-text client briefs to produce a structured ExtractedRequestSummary.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedRequestSummary } from "./client-requests";

// ── Service detection ─────────────────────────────────────────────────────────

const SERVICE_PATTERNS: { label: string; patterns: RegExp[]; departments: string[] }[] = [
  {
    label: "Social Media",
    patterns: [/\bsocial\s*media\b/i, /\bconteúdo\b/i, /\bposts?\b/i, /\bfeed\b/i, /\binstagram\b/i, /\bfacebook\b/i, /\btiktok\b/i, /\bcalendário\s*editorial\b/i, /\bhistórias\b/i, /\bstories\b/i, /\bcreator\b/i],
    departments: ["social-media"],
  },
  {
    label: "Design",
    patterns: [/\bdesign\b/i, /\bidentidade\s*visual\b/i, /\blogo\b/i, /\bvisual\b/i, /\barte\b/i, /\bcriativos?\b/i, /\bpeças?\b/i, /\bgráfic[ao]\b/i, /\bbanner\b/i, /\bflyер\b/i, /\bflyer\b/i],
    departments: ["design"],
  },
  {
    label: "Tráfego Pago",
    patterns: [/\btráfego\s*pago\b/i, /\banúncios?\b/i, /\bads?\b/i, /\bcampanhas?\b/i, /\bmeta\s*ads\b/i, /\bgoogle\s*ads\b/i, /\binvestimento\s*em\s*mídia\b/i, /\bpatrocinado\b/i, /\bimpulsionamento\b/i],
    departments: ["paid-traffic"],
  },
  {
    label: "Branding",
    patterns: [/\bbranding\b/i, /\bmarca\b/i, /\bidentidade\s*de\s*marca\b/i, /\bposicionamento\b/i, /\btom\s*de\s*voz\b/i, /\bbrand\b/i],
    departments: ["brand-hub", "design"],
  },
  {
    label: "Website",
    patterns: [/\bwebsite\b/i, /\bsite\b/i, /\bhomepage\b/i, /\bpágina\s*web\b/i, /\bweb\b/i],
    departments: ["design"],
  },
  {
    label: "Landing Page",
    patterns: [/\blanding\s*page\b/i, /\bpágina\s*de\s*vendas\b/i, /\bpage\b/i, /\bcaptura\b/i],
    departments: ["design"],
  },
  {
    label: "Apresentação",
    patterns: [/\bapresentação\b/i, /\bpitch\b/i, /\bslides?\b/i, /\bdecks?\b/i, /\bpowerpoint\b/i],
    departments: ["design"],
  },
];

// ── Quantity detection ────────────────────────────────────────────────────────

const QUANTITY_PATTERNS: RegExp[] = [
  /\d+\s*posts?\b/i,
  /\d+\s*stories\b/i,
  /\d+\s*carrosséis?\b/i,
  /\d+\s*carousels?\b/i,
  /\d+\s*vídeos?\b/i,
  /\d+\s*anúncios?\b/i,
  /\d+\s*peças?\b/i,
  /\d+\s*artes?\b/i,
  /\d+\s*logos?\b/i,
  /\d+\s*criativos?\b/i,
];

// ── Channel detection ─────────────────────────────────────────────────────────

const CHANNEL_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Instagram",  pattern: /\binstagram\b/i },
  { label: "Facebook",   pattern: /\bfacebook\b/i },
  { label: "TikTok",     pattern: /\btiktok\b/i },
  { label: "Google",     pattern: /\bgoogle\b/i },
  { label: "Meta",       pattern: /\bmeta\b/i },
  { label: "WhatsApp",   pattern: /\bwhatsapp\b/i },
  { label: "YouTube",    pattern: /\byoutube\b/i },
  { label: "LinkedIn",   pattern: /\blinkedin\b/i },
  { label: "Pinterest",  pattern: /\bpinterest\b/i },
];

// ── Objective detection ───────────────────────────────────────────────────────

const OBJECTIVE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Aumentar vendas",       pattern: /\bvendas?\b|\bvender\b/i },
  { label: "Novos clientes",        pattern: /\bnovos?\s*clientes?\b/i },
  { label: "Autoridade / visibilidade", pattern: /\bautoridade\b|\bvisibilidade\b|\bpresença\b/i },
  { label: "Lançamento",            pattern: /\blançamento\b|\blançar\b/i },
  { label: "Branding / marca",      pattern: /\bfort[ae]lecer\s*a?\s*marca\b|\bbrand\s*awareness\b/i },
  { label: "Captação de leads",     pattern: /\bleads?\b|\bcaptação\b/i },
  { label: "Engajamento",           pattern: /\bengajamento\b|\binteração\b/i },
];

// ── Urgency detection ─────────────────────────────────────────────────────────

function detectUrgency(text: string): string | undefined {
  if (/\bhoje\b|\burgente\b|\bimediato\b/i.test(text)) return "Urgente (hoje)";
  if (/\bessa\s*semana\b|\beste\s*semana\b|\bnessa\s*semana\b/i.test(text)) return "Esta semana";
  if (/\bpróxim[ao]\s*semana\b/i.test(text)) return "Próxima semana";
  if (/\besse\s*mês\b|\beste\s*mês\b|\bmensal\b/i.test(text)) return "Este mês";
  if (/\bpróxim[ao]\s*mês\b/i.test(text)) return "Próximo mês";
  return undefined;
}

// ── Missing info detection ────────────────────────────────────────────────────

function detectMissingInfo(text: string, extracted: Partial<ExtractedRequestSummary>): string[] {
  const missing: string[] = [];

  const hasDeadline = /\bprazo\b|\bdata\b|\bdia\b|\bentrega\b|\bprevisto\b|\bplanejado\b/i.test(text);
  if (!hasDeadline) missing.push("Prazo de entrega");

  const hasQty = extracted.quantities && extracted.quantities.length > 0;
  if (!hasQty) missing.push("Quantidade de peças/posts");

  const hasBudget = /\borçamento\b|\bvalor\b|\binvestimento\b|\br\$\b|\breais\b/i.test(text);
  if (!hasBudget) missing.push("Orçamento");

  const hasReferences = /\breferência\b|\binspiração\b|\bexemplo\b|\blink\b|\burl\b|\bsite\b/i.test(text);
  if (!hasReferences) missing.push("Referências visuais ou de comunicação");

  const hasBrandAssets = /\blogo\b|\bpaleta\b|\bfontes?\b|\bbrand\s*guide\b|\bmanual\b|\bassets?\b/i.test(text);
  if (!hasBrandAssets) missing.push("Materiais de marca (logo, paleta, fontes)");

  const hasAudience = /\bpúblico\b|\baudiência\b|\bpessoas?\b|\bclientes?\b|\bfeminin[ao]\b|\bmasculin[ao]\b|\bidade\b/i.test(text);
  if (!hasAudience) missing.push("Público-alvo");

  const hasOffer = /\bproduto\b|\bserviço\b|\boferta\b|\bvender\b|\bpromover\b/i.test(text);
  if (!hasOffer) missing.push("Oferta ou produto principal");

  return missing;
}

// ── Title derivation ──────────────────────────────────────────────────────────

function deriveTitle(services: string[], channels: string[], rawText: string): string {
  if (services.length === 0) {
    const first = rawText.trim().split(/[.\n]/)[0].slice(0, 60);
    return first || "Solicitação sem título";
  }
  const svc = services.slice(0, 2).join(" + ");
  if (channels.length > 0) return `${svc} — ${channels[0]}`;
  return svc;
}

// ── Main extractor ────────────────────────────────────────────────────────────

export function extractBriefing(rawText: string): {
  summary: ExtractedRequestSummary;
  title: string;
} {
  const text = rawText.trim();

  // Services
  const services: string[] = [];
  const deptSet = new Set<string>();
  for (const s of SERVICE_PATTERNS) {
    if (s.patterns.some((p) => p.test(text))) {
      services.push(s.label);
      s.departments.forEach((d) => deptSet.add(d));
    }
  }

  // Quantities
  const quantities: string[] = [];
  for (const pat of QUANTITY_PATTERNS) {
    const match = text.match(pat);
    if (match) quantities.push(match[0]);
  }

  // Channels
  const channels: string[] = [];
  for (const c of CHANNEL_PATTERNS) {
    if (c.pattern.test(text)) channels.push(c.label);
  }

  // Objectives
  const objectives: string[] = [];
  for (const o of OBJECTIVE_PATTERNS) {
    if (o.pattern.test(text)) objectives.push(o.label);
  }

  // Urgency
  const urgency = detectUrgency(text);

  // Suggested departments (default to PM if nothing detected)
  const suggestedDepartments = deptSet.size > 0
    ? Array.from(deptSet)
    : ["project-management"];

  const partial: Partial<ExtractedRequestSummary> = { services, channels, objectives, quantities, urgency, suggestedDepartments };

  // Missing info
  const missingInfo = detectMissingInfo(text, partial);

  const summary: ExtractedRequestSummary = {
    services,
    channels,
    objectives,
    quantities,
    urgency,
    suggestedDepartments,
    missingInfo,
  };

  const title = deriveTitle(services, channels, text);

  return { summary, title };
}
