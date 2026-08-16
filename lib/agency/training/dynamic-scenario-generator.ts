import type { SimulationScenario, SimulationDifficulty, PersonaAnswers, DynamicScenarioMetadata } from "./types";

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────────
// Same seed → same scenario. No seed → unique each call.

function mulberry32(seed: number): () => number {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function strToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Dimensions ────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { id: "restaurant",   label: "Restaurante",          article: "um",        isRestaurant: true  },
  { id: "sushi",        label: "Restaurante Japonês",  article: "um",        isRestaurant: true  },
  { id: "burger",       label: "Hamburgueria",         article: "uma",       isRestaurant: true  },
  { id: "nails",        label: "Esmalteria/Manicure",  article: "uma",       isRestaurant: false },
  { id: "salon",        label: "Salão de Beleza",      article: "um",        isRestaurant: false },
  { id: "aesthetic",    label: "Clínica de Estética",  article: "uma",       isRestaurant: false },
  { id: "dental",       label: "Clínica Odontológica", article: "uma",       isRestaurant: false },
  { id: "gym",          label: "Academia",             article: "uma",       isRestaurant: false },
  { id: "fashion",      label: "Loja de Moda",         article: "uma",       isRestaurant: false },
  { id: "saas",         label: "Software/SaaS",        article: "um",        isRestaurant: false },
  { id: "realestate",   label: "Imobiliária",          article: "uma",       isRestaurant: false },
  { id: "education",    label: "Escola/Curso Online",  article: "uma",       isRestaurant: false },
  { id: "coach",        label: "Coach/Consultoria",    article: "uma empresa de", isRestaurant: false },
  { id: "events",       label: "Buffet/Eventos",       article: "um",        isRestaurant: false },
  { id: "petshop",      label: "Pet Shop",             article: "um",        isRestaurant: false },
  { id: "automotive",   label: "Oficina/Auto",         article: "uma",       isRestaurant: false },
  { id: "construction", label: "Interiores/Projetos",  article: "uma empresa de", isRestaurant: false },
  { id: "ecommerce",    label: "Loja Online",          article: "uma",       isRestaurant: false },
] as const;

const MATURITIES = [
  { id: "new",      label: "Negócio novo",      context: "estou começando agora"            },
  { id: "local",    label: "Local estabelecido", context: "tenho alguns anos de mercado"     },
  { id: "growing",  label: "Em crescimento",    context: "estou escalando o negócio"         },
  { id: "premium",  label: "Marca premium",     context: "atendo o público premium"          },
  { id: "micro",    label: "MEI/Solo",          context: "trabalho sozinho(a)"               },
] as const;

const PERSONA_TONES = [
  { id: "direct",       label: "Direto",        suffix: ".",                        defaultAns: "sim"                       },
  { id: "confused",     label: "Confuso",       suffix: ". Não sei bem.",            defaultAns: "não tenho certeza"         },
  { id: "anxious",      label: "Ansioso",       suffix: "! Preciso logo.",           defaultAns: "sim sim, pode continuar"   },
  { id: "skeptical",    label: "Cético",        suffix: ". Mas será que vale?",      defaultAns: "depende, pode explicar?"   },
  { id: "excited",      label: "Entusiasmado",  suffix: "! Quero crescer muito!",    defaultAns: "adorei, continua!"         },
  { id: "demanding",    label: "Exigente",      suffix: ". Quero resultado de verdade.", defaultAns: "ok mas precisa ser bom" },
  { id: "inexperienced",label: "Inexperiente",  suffix: ". Não entendo muito disso.", defaultAns: "acho que sim?"           },
] as const;

const BUDGET_PROFILES = [
  { id: "very_low",     label: "Muito baixo (≤ R$700)",   answer: "tenho uns 600 reais por mês",              range: { min: 600,  max: 700  }, objectionMsg: "600 reais é tudo que tenho" },
  { id: "below_min",    label: "Abaixo mínimo (R$800–1k)", answer: "meu orçamento é uns 900 reais",            range: { min: 800,  max: 1000 }, objectionMsg: "900 reais é o máximo" },
  { id: "starter",      label: "Faixa R$1.2k–1.8k",       answer: "posso investir até 1.500 reais por mês",   range: { min: 1200, max: 1800 }, objectionMsg: "tá um pouco acima do meu orçamento" },
  { id: "medium",       label: "Médio (R$2k–3k)",         answer: "tenho uns 2.500 reais disponíveis",        range: { min: 2000, max: 3000 }, objectionMsg: undefined },
  { id: "premium",      label: "Faixa R$4k+",             answer: "invisto em torno de 5 mil por mês",        range: { min: 4000, max: 6000 }, objectionMsg: undefined },
  { id: "undisclosed",  label: "Não informa",             answer: "não sei dizer ainda, depende da proposta", range: undefined,               objectionMsg: "não sei quanto custa isso" },
  { id: "contradiction",label: "Contraditório",           answer: "depende do que vocês entregam mesmo",      range: { min: 1000, max: 1500 }, objectionMsg: "achei mais caro do que esperava" },
] as const;

const OBJECTION_PROFILES = [
  { id: "none",      label: "Sem objeção",        types: [] as string[],              msg: undefined,                                    turn: undefined },
  { id: "price",     label: "Preço alto",         types: ["price_too_high"],          msg: "tá muito caro para o que eu esperava",       turn: 4 },
  { id: "cheaper",   label: "Quer mais barato",   types: ["wants_cheaper"],           msg: "não tem algo mais simples e barato?",        turn: 4 },
  { id: "urgent",    label: "Urgência",           types: ["deadline_pressure"],       msg: "preciso disso para a semana que vem urgente", turn: 3 },
  { id: "value",     label: "Quer garantia",      types: ["wants_more_value"],        msg: "vocês garantem quantos clientes novos?",     turn: 5 },
  { id: "nephew",    label: "Sobrinho freelancer", types: ["wants_cheaper"],          msg: "meu sobrinho faz isso por 200 reais",        turn: 4 },
  { id: "test",      label: "Testar 1 mês",       types: ["unsure_budget"],           msg: "posso testar só um mês antes de fechar?",   turn: 4 },
  { id: "approval",  label: "Aprovação interna",  types: ["needs_internal_approval"], msg: "preciso aprovar com minha sócia antes",     turn: 6 },
  { id: "remove",    label: "Quer remover item",  types: ["wants_remove_item"],       msg: "dá para tirar os reels do escopo?",         turn: 5 },
] as const;

const MATERIAL_PROFILES = [
  { id: "has_all",       label: "Tem tudo",           hasBrandBook: true,  brandingAns: "tenho brand book completo, não preciso de nova identidade" },
  { id: "logo_only",     label: "Só tem logo",        hasBrandBook: false, brandingAns: "tenho logo mas está básico" },
  { id: "has_photos",    label: "Tem fotos",          hasBrandBook: false, brandingAns: "tenho fotos dos produtos/serviços" },
  { id: "no_photos",     label: "Sem fotos",          hasBrandBook: false, brandingAns: "não tenho fotos profissionais ainda" },
  { id: "old_instagram", label: "Instagram antigo",   hasBrandBook: false, brandingAns: "tenho Instagram mas está muito desatualizado" },
  { id: "nothing",       label: "Sem materiais",      hasBrandBook: false, brandingAns: "não tenho nada, estou começando do zero" },
  { id: "has_menu",      label: "Tem cardápio/catálogo", hasBrandBook: false, brandingAns: "tenho cardápio e fotos dos produtos" },
] as const;

const SERVICE_INTENTS = [
  {
    id: "social",        label: "Social Media",         services: ["social_media"],
    keyword: "social media para o Instagram",
    trafficAns: "não por enquanto",
    brandingDefault: "já tenho logo, não preciso",
  },
  {
    id: "traffic",       label: "Tráfego Pago",         services: ["paid_traffic"],
    keyword: "tráfego pago",
    trafficAns: "sim, tráfego pago é meu foco",
    brandingDefault: "não preciso de identidade agora",
  },
  {
    id: "social_traffic", label: "Social + Tráfego",   services: ["social_media", "paid_traffic"],
    keyword: "social media e tráfego pago",
    trafficAns: "sim, quero anúncios também",
    brandingDefault: "já tenho logo",
  },
  {
    id: "branding",      label: "Identidade Visual",    services: ["branding"],
    keyword: "identidade visual nova",
    trafficAns: "não por agora",
    brandingDefault: "quero uma identidade profissional nova",
  },
  {
    id: "full",          label: "Presença Completa",    services: ["social_media", "paid_traffic", "branding"],
    keyword: "social media, tráfego pago e identidade visual",
    trafficAns: "sim, quero anúncios com certeza",
    brandingDefault: "quero identidade visual também",
  },
  {
    id: "unclear",       label: "Escopo Indefinido",    services: ["social_media"],
    keyword: "marketing digital",
    trafficAns: "talvez, não sei ao certo",
    brandingDefault: "talvez precise, não sei",
  },
] as const;

// ── Name data ─────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Ana", "Beatriz", "Carlos", "Diego", "Fernanda", "Gabriel", "Helena",
  "Igor", "Juliana", "Kenji", "Laura", "Marco", "Natalia", "Oscar",
  "Patricia", "Rafael", "Sandra", "Thiago", "Ursula", "Victor",
  "Wanderson", "Yasmin", "Zelia", "Bruno", "Camila", "Eduardo", "Flavia",
  "Gustavo", "Isabela", "Joao", "Larissa", "Marcelo", "Nathalia", "Renata",
] as const;

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Costa", "Pereira", "Alves", "Lima",
  "Rodrigues", "Ferreira", "Barbosa", "Carvalho", "Melo", "Ribeiro",
  "Andrade", "Coelho", "Teixeira", "Nunes", "Azevedo", "Souza", "Martins",
  "Castro", "Moreira", "Pinto", "Nascimento", "Gomes", "Araújo",
] as const;

// ── Business name templates ───────────────────────────────────────────────────
// {f} = first name, {l} = last name

const BIZ_TEMPLATES: Record<string, string[]> = {
  restaurant:   ["{f} Restaurante", "Cantina {l}", "Mesa {f}", "Sabores do {l}", "Cozinha {f}", "Tempero {l}"],
  sushi:        ["{f} Sushi", "Sakura {l}", "Nippon {f}", "{l} Garden", "Fuji {f}", "Nori {f}"],
  burger:       ["Burger {f}", "{l} Burger", "Casa do Burger {f}", "{f} Artesanal", "Hamburgão {l}"],
  nails:        ["Studio {f}", "{f} Nails", "Esmaltes {f}", "{f} Esmalteria", "Nail Studio {l}"],
  salon:        ["{f} Hair", "Salão {f}", "{f} Beleza", "{l} Studio", "Hair by {f}"],
  aesthetic:    ["Clínica {f}", "{f} Estética", "Belle {l}", "Studio {f} Estética", "{l} Clinic"],
  dental:       ["Clínica {l}", "Odonto {f}", "{l} Odontologia", "Sorriso {f}", "Dr. {l} Odonto"],
  gym:          ["Academia {f}", "{f} Fitness", "Studio {f}", "{l} Gym", "FitStar {f}"],
  fashion:      ["{f} Modas", "Loja {f}", "{f} Store", "Boutique {f}", "{l} Fashion"],
  saas:         ["{l}Pro", "{f}Tech", "{l}App", "{f}Hub", "Smart{l}", "{f}Digital"],
  realestate:   ["Imobiliária {l}", "{l} Imóveis", "{f} Corretor", "{l} Realty", "{f} Imóveis"],
  education:    ["Escola {l}", "Curso {f}", "{f} Academy", "{l} Educação", "{f} Ensina"],
  coach:        ["{f} Coach", "{f} Mentoria", "{l} Consulting", "{f} Desenvolvimento", "Mentora {f}"],
  events:       ["Buffet {f}", "{f} Eventos", "{l} Festas", "{f} Celebrações", "Espaço {f}"],
  petshop:      ["Pet {f}", "{f} Animal", "{l} Pet Shop", "Mundo Pet {f}", "Patinha {l}"],
  automotive:   ["Auto {l}", "{l} Auto", "Oficina {f}", "{f} Mecânica", "{l} Motors"],
  construction: ["{l} Interiores", "{f} Arquitetura", "Casa {f}", "{l} Projetos", "{f} Design"],
  ecommerce:    ["{f} Shop", "{l} Store", "Loja {f}", "{f} Online", "{l} E-commerce"],
};

// ── Initial message templates ─────────────────────────────────────────────────

const INTRO_TEMPLATES = [
  "Olá! Me chamo {name} e tenho {article} chamado {biz}. Quero {service}{suffix}",
  "Oi, sou {name} e tenho {article} {biz}. Preciso de {service}{suffix}",
  "Me chamo {name} {last}. Tenho {article} {biz} e quero {service}{suffix}",
  "Bom dia! Sou {name} {last}, tenho {article} {biz} e estou procurando {service}{suffix}",
  "Olá! Sou a/o {name} e tenho {article} {biz}. {context}. Quero {service}{suffix}",
] as const;

const CONTEXT_PHRASES: Record<string, string[]> = {
  new:     ["Acabei de abrir", "Estou começando agora", "É um negócio novo"],
  local:   ["Tenho 3 anos no mercado", "Já sou estabelecido na região", "Tenho uma clientela fiel"],
  growing: ["Estou crescendo rápido", "Quero escalar", "Estou em expansão"],
  premium: ["Atendo o público premium", "Sou referência no segmento", "Trabalho com alto ticket"],
  micro:   ["Trabalho sozinho", "Sou MEI", "Faço tudo solo ainda"],
};

const FREQUENCY_ANSWERS = [
  "2 vezes por semana",
  "3 vezes por semana",
  "4 vezes por semana",
  "5 vezes por semana",
  "todo dia útil",
  "3 vezes por semana no feed",
] as const;

const OBJECTIVE_ANSWERS_BY_SEGMENT: Record<string, string[]> = {
  restaurant:   ["mais clientes no salão e mais delivery", "lotar nos fins de semana", "mais pedidos via iFood e WhatsApp"],
  sushi:        ["mais clientes jantar e delivery", "fidelizar os clientes", "aumentar o ticket médio"],
  burger:       ["mais pedidos de delivery", "encher nos fins de semana", "atrair o público jovem"],
  nails:        ["mais agendamentos", "clientes fiéis que voltam sempre", "expandir a clientela"],
  salon:        ["mais clientes novos por semana", "posicionamento premium", "fidelizar as clientes"],
  aesthetic:    ["mais consultas e procedimentos", "ser referência na região", "novos pacientes"],
  dental:       ["mais pacientes novos por mês", "ser referência em ortodontia", "pacientes de plano particular"],
  gym:          ["mais alunos matriculados", "lotar as turmas", "reduzir a evasão"],
  fashion:      ["mais vendas online e na loja", "atrair o público jovem", "aumentar o ticket médio"],
  saas:         ["mais leads qualificados", "aumentar MRR", "posicionamento como autoridade"],
  realestate:   ["mais captações e vendas", "10 imóveis vendidos por mês", "leads qualificados"],
  education:    ["mais matrículas", "50 alunos novos por semestre", "reconhecimento de marca"],
  coach:        ["mais clientes high-ticket", "posicionamento de autoridade", "mais leads qualificados"],
  events:       ["mais eventos fechados", "posicionamento premium", "agenda cheia no fim de semana"],
  petshop:      ["mais clientes pet", "mais banhos e tosas agendados", "fidelizar tutores"],
  automotive:   ["mais clientes na região", "ser referência em revisões", "mais orçamentos aprovados"],
  construction: ["mais projetos fechados", "leads de alto valor", "ser referência em interiores"],
  ecommerce:    ["mais vendas online", "aumentar o ticket médio", "mais acessos no site"],
};

const GENERIC_OBJECTIVES = [
  "mais clientes",
  "mais visibilidade online",
  "crescer nas redes",
] as const;

const ACCEPTANCE_MESSAGES = [
  "ok, pode ser então",
  "tá bom, entendido",
  "aceito, vamos assim",
  "combinado, pode montar a proposta",
  "faz sentido, vamos em frente",
] as const;

// ── Difficulty computation ────────────────────────────────────────────────────

function computeDifficulty(
  budgetId: string,
  objectionId: string,
  toneId: string,
  intentId: string,
): SimulationDifficulty {
  let score = 0;
  if (budgetId === "very_low")      score += 3;
  else if (budgetId === "below_min") score += 2;
  else if (budgetId === "undisclosed" || budgetId === "contradiction") score += 1;
  if (objectionId !== "none")       score += 2;
  if (["nephew", "value", "approval"].includes(objectionId)) score += 1;
  if (["confused", "skeptical", "demanding"].includes(toneId)) score += 1;
  if (intentId === "unclear")       score += 1;
  if (intentId === "full")          score += 1;
  if (score <= 1) return "easy";
  if (score <= 3) return "medium";
  if (score <= 5) return "hard";
  return "extreme";
}

// ── Email / phone generator ───────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function generateEmail(firstName: string, bizName: string): string {
  return `${slugify(firstName)}@${slugify(bizName)}.com.br`;
}

function generatePhone(rng: () => number): string {
  return `119${String(Math.floor(rng() * 90000000) + 10000000)}`;
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateDynamicScenario(seed?: string | number): SimulationScenario & {
  scenarioSeed:     string;
  scenarioMetadata: DynamicScenarioMetadata;
} {
  const resolvedSeed =
    seed !== undefined
      ? String(seed)
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const numericSeed = strToSeed(resolvedSeed);
  const rng = mulberry32(numericSeed);

  // ── Pick dimensions
  const segment   = pick(SEGMENTS,        rng);
  const maturity  = pick(MATURITIES,      rng);
  const tone      = pick(PERSONA_TONES,   rng);
  const budget    = pick(BUDGET_PROFILES, rng);
  const objProf   = pick(OBJECTION_PROFILES, rng);
  const material  = pick(MATERIAL_PROFILES,  rng);
  const intent    = pick(SERVICE_INTENTS,    rng);

  // ── Names
  const firstName    = pick(FIRST_NAMES, rng);
  const lastName     = pick(LAST_NAMES,  rng);
  const bizTemplates = BIZ_TEMPLATES[segment.id] ?? ["{f} Digital"];
  const bizTemplate  = pick(bizTemplates, rng);
  const businessName = bizTemplate.replace("{f}", firstName).replace("{l}", lastName);

  // ── Budget objection merge: if budget profile has a forced objection message, prefer it
  const objectionMessage: string | undefined = objProf.msg ?? budget.objectionMsg ?? undefined;
  const objectionAfterTurn: number | undefined = objProf.turn
    ?? (budget.objectionMsg ? pick([3, 4] as const, rng) : undefined);

  // Use objectionTypes from objection profile if non-empty, else infer from budget
  const objectionTypes: string[] = objProf.types.length > 0
    ? [...objProf.types]
    : (budget.id === "very_low" || budget.id === "below_min")
      ? ["price_too_high", "wants_cheaper"]
      : [];

  // ── Build initial message
  const introTemplate = pick(INTRO_TEMPLATES, rng);
  const contextPhrase = pick(CONTEXT_PHRASES[maturity.id] ?? CONTEXT_PHRASES.local, rng);
  const initialMessage = introTemplate
    .replace("{name}", firstName)
    .replace("{last}", lastName)
    .replace("{article}", segment.article)
    .replace("{biz}", businessName)
    .replace("{service}", intent.keyword)
    .replace("{context}", contextPhrase)
    .replace("{suffix}", tone.suffix);

  // ── Build persona answers
  const objectives = OBJECTIVE_ANSWERS_BY_SEGMENT[segment.id] ?? [...GENERIC_OBJECTIVES];
  const objectiveAnswer = pick(objectives, rng);
  const frequencyAnswer = pick(FREQUENCY_ANSWERS, rng);

  // Branding answer: if intent wants branding, say yes; if material has brand book, reflect that
  const brandingAnswer = intent.id === "branding" || intent.id === "full"
    ? "quero uma identidade visual nova e profissional"
    : material.hasBrandBook
    ? "tenho brand book completo, não preciso de nova identidade"
    : material.brandingAns;

  const personaAnswers: PersonaAnswers = {
    identity:  `${firstName} ${lastName}, ${businessName}`,
    email:     generateEmail(firstName, businessName),
    phone:     generatePhone(rng),
    service:   pick(
      intent.id === "social"   ? ["quero Instagram profissional", "redes sociais para o negócio"] :
      intent.id === "traffic"  ? ["quero anúncios pagos", "tráfego pago é o que preciso"] :
      intent.id === "branding" ? ["quero identidade visual nova", "preciso de logo profissional"] :
      intent.id === "full"     ? ["quero social media, tráfego e branding"] :
      ["quero melhorar minha presença online", "social media em geral"],
      rng,
    ),
    frequency: frequencyAnswer,
    budget:    budget.answer,
    objective: objectiveAnswer,
    traffic:   intent.trafficAns,
    branding:  brandingAnswer,
    default:   tone.defaultAns,
  };

  // ── Expected behaviors (representative, not exhaustive)
  const expectedBehaviors: string[] = ["capture_identity", "ask_frequency"];
  if (objectionTypes.length > 0) expectedBehaviors.push("handle_price_objection");
  if (segment.isRestaurant)      expectedBehaviors.push("ask_restaurant_frequency");
  if (budget.id === "very_low" || budget.id === "below_min")
    expectedBehaviors.push("handle_below_minimum_budget");
  if (intent.id === "unclear")   expectedBehaviors.push("guide_unclear_client");
  if (material.id === "nothing") expectedBehaviors.push("address_no_materials");
  if (intent.id === "traffic" || intent.id === "social_traffic")
    expectedBehaviors.push("ask_media_budget_separately");

  return {
    id:               `dynamic_${resolvedSeed}`,
    agentId:          "sdr",
    name:             `${businessName} — ${segment.label}`,
    segment:          segment.label,
    difficulty:       computeDifficulty(budget.id, objProf.id, tone.id, intent.id),
    persona:          `${firstName} ${lastName} — ${tone.label}, ${maturity.label}`,
    initialMessage,
    personaAnswers,
    expectedBehaviors,
    objectionTypes,
    budgetRange:      budget.range ?? undefined,
    targetServices:   [...intent.services],
    objectionMessage: objectionMessage,
    objectionAfterTurn,
    acceptanceMessage: objectionMessage ? pick(ACCEPTANCE_MESSAGES, rng) : undefined,
    createdAt:        new Date().toISOString(),
    // ── Provenance (used by runner + UI)
    scenarioSeed:     resolvedSeed,
    scenarioMetadata: {
      segment:          segment.label,
      businessMaturity: maturity.label,
      personaTone:      tone.label,
      budgetProfile:    budget.label,
      objectionProfile: objProf.label,
      materialProfile:  material.label,
      serviceIntent:    intent.label,
    },
  };
}
