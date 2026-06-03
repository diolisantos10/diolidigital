import type { BrandBrain } from "./mock-data";

export interface ParsedBrandField {
  field: keyof BrandBrain;
  value: string;
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────
// Longer / more specific phrases are listed first so they score higher.
// "strategicNotes" is intentionally omitted — internal-only, never auto-parsed.

const FIELD_KEYWORDS: Partial<Record<keyof BrandBrain, string[]>> = {
  businessSummary: [
    "business summary", "resumo do negocio", "resumo de negocio",
    "sobre o negocio", "sobre a empresa", "quem somos", "o que somos",
    "nossa empresa", "sobre nos", "visao geral", "overview", "about us",
    "about", "empresa", "negocio",
  ],
  positioning: [
    "posicionamento de marca", "posicionamento", "proposta de valor",
    "value proposition", "unique selling", "diferencial", "positioning",
    "usp", "our position",
  ],
  targetAudience: [
    "publico-alvo", "publico alvo", "target audience", "perfil do cliente",
    "customer profile", "persona", "personas", "audiencia", "audience",
    "quem e nosso cliente", "target", "publico",
  ],
  toneOfVoice: [
    "tom de voz", "tone of voice", "voz da marca", "brand voice",
    "como falamos", "comunicacao", "linguagem", "language", "tone",
  ],
  visualStyle: [
    "estilo visual", "visual style", "identidade visual", "visual identity",
    "direcao visual", "visual direction", "look and feel", "aesthetic",
    "estetica", "design",
  ],
  colors: [
    "paleta de cores", "cores da marca", "color palette", "brand colors",
    "paleta de cor", "cores", "colors", "paleta", "palette",
  ],
  fonts: [
    "tipografia da marca", "tipografia", "typography", "typeface",
    "tipo grafico", "fontes", "fonts", "fonte",
  ],
  brandRules: [
    "regras de marca", "brand guidelines", "brand rules", "diretrizes",
    "guidelines", "normas", "regras", "dos and donts", "sempre faca",
    "must always",
  ],
  productsToHighlight: [
    "produtos em destaque", "servicos em destaque", "produtos principais",
    "principais produtos", "nossos produtos", "nossos servicos",
    "what we offer", "o que oferecemos", "products", "services",
    "ofertas", "highlights", "produtos", "servicos",
  ],
  thingsToAvoid: [
    "o que evitar", "o que nao fazer", "things to avoid", "nunca use",
    "nunca faca", "proibicoes", "nao usar", "nao use", "evitar", "avoid",
    "donts",
  ],
  preferredChannels: [
    "canais preferenciais", "canais prioritarios", "canais de comunicacao",
    "preferred channels", "redes sociais", "social media", "plataformas",
    "platforms", "channels", "canais",
  ],
  references: [
    "referencias visuais", "referencias e assets", "referencias de marca",
    "referencias", "inspiracoes", "references", "assets", "examples",
    "exemplos", "arquivos", "links",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['"']/g, "")
    .trim();
}

function scoreHeading(heading: string, keywords: string[]): number {
  const norm = normalizeForMatch(heading);
  let best = 0;
  for (const kw of keywords) {
    const normKw = normalizeForMatch(kw);
    if (norm === normKw) return 100;
    if (norm.includes(normKw)) best = Math.max(best, normKw.length >= 5 ? 80 : 60);
    else if (normKw.includes(norm) && norm.length > 4) best = Math.max(best, 50);
  }
  return best;
}

// Returns cleaned heading text, or null if the line is not a heading.
function extractHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;

  // ## Heading
  const mdMatch = trimmed.match(/^#{1,4}\s+(.+)/);
  if (mdMatch) return mdMatch[1].replace(/[*_:]+$/g, "").trim();

  // **Bold** or __Bold__
  const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/) ?? trimmed.match(/^__(.+?)__\s*$/);
  if (boldMatch) return boldMatch[1].replace(/:+$/, "").trim();

  // "Label:" on its own line
  const colonMatch = trimmed.match(/^([^:]{3,60}):\s*$/);
  if (colonMatch && !trimmed.startsWith("http")) return colonMatch[1].trim();

  // ALL CAPS line (4–50 chars, Latin letters, no digits)
  if (
    trimmed === trimmed.toUpperCase() &&
    trimmed.length >= 4 &&
    trimmed.length <= 50 &&
    /[A-ZÁÉÍÓÚÀÃÕÇ]/.test(trimmed) &&
    !/[0-9]/.test(trimmed) &&
    !/[<>{}[\]]/.test(trimmed)
  ) {
    return trimmed;
  }

  return null;
}

function extractHexColors(text: string): string {
  const matches = [...text.matchAll(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g)];
  if (matches.length === 0) return "";
  const unique = [...new Set(matches.map((m) => m[0].toUpperCase()))];
  return unique.join(", ");
}

function cleanBody(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .trim()
    .slice(0, 600);
}

// ─── Main export ──────────────────────────────────────────────────────────────

// Canonical order for results (strategicNotes excluded — internal only)
const FIELD_ORDER: (keyof BrandBrain)[] = [
  "businessSummary", "positioning", "targetAudience", "toneOfVoice",
  "visualStyle", "colors", "fonts", "brandRules", "productsToHighlight",
  "thingsToAvoid", "preferredChannels", "references",
];

export function parseBrandBook(rawText: string): ParsedBrandField[] {
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Segment text into (heading, body) pairs
  interface Section { heading: string; body: string[] }
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const h = extractHeading(line);
    if (h) {
      if (current) sections.push(current);
      current = { heading: h, body: [] };
    } else if (current) {
      current.body.push(line);
    }
    // Lines before the first heading are skipped
  }
  if (current) sections.push(current);

  // Match each section to the best-scoring field
  const fieldMap: Partial<Record<keyof BrandBrain, string>> = {};
  const SCORE_THRESHOLD = 40;

  for (const sec of sections) {
    const body = cleanBody(sec.body);
    if (!body) continue;

    let bestField: keyof BrandBrain | null = null;
    let bestScore = SCORE_THRESHOLD;

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as [keyof BrandBrain, string[]][]) {
      if (!keywords?.length) continue;
      const score = scoreHeading(sec.heading, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }

    if (bestField && !fieldMap[bestField]) {
      fieldMap[bestField] = body;
    }
  }

  // Fallback: scan entire text for hex codes if no colors section was detected
  if (!fieldMap.colors) {
    const hexColors = extractHexColors(rawText);
    if (hexColors) fieldMap.colors = hexColors;
  }

  return FIELD_ORDER.filter((f) => fieldMap[f]).map((f) => ({ field: f, value: fieldMap[f]! }));
}
