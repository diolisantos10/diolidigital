"use client";

import { useState } from "react";
import type { Client } from "@/lib/agency/mock-data";
import Button from "@/components/agency/ui/Button";
import { useAgencyStore } from "@/store/agency-store";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientLevel = "beginner" | "intermediate" | "advanced";
type IntakeMode = "guided" | "free_brief" | "existing_brief";
type IntakePhase = "client" | "project";
type LevelText = string | Record<ClientLevel, string>;

interface IntakeQuestion {
  id: string;
  internalLabel: string;
  question: LevelText;
  hint?: LevelText;
  placeholder: LevelText;
  type: "text" | "textarea" | "multiselect";
  options?: string[] | Record<ClientLevel, string[]>;
  required: boolean;
  weight: number;
}

interface IntakeBlock {
  id: string;
  title: string;
  description: string;
  questions: IntakeQuestion[];
}

type IntakeAnswers = Record<string, string | string[]>;

export interface IntakeSummary {
  clientId: string;
  clientContext: string;
  projectObjective: string;
  servicesRequested: string[];
  missingInformation: string[];
  recommendedNextQuestions: string[];
  readinessScore: number;
  readinessLabel: "Not Ready" | "Partially Ready" | "Ready";
}

export interface IntakePrefill {
  clientId: string;
  services: string[];
  businessDescription: string;
  objective: string;
  targetAudience: string;
  channels: string[];
  deadline: string;
  notes: string;
}

// ─── Level-text resolver ──────────────────────────────────────────────────────

function resolve(text: LevelText, level: ClientLevel): string {
  return typeof text === "string" ? text : text[level];
}

function resolveOptions(opts: string[] | Record<ClientLevel, string[]>, level: ClientLevel): string[] {
  return Array.isArray(opts) ? opts : opts[level];
}

// ─── CLIENT PROFILE blocks — stored once per client ──────────────────────────
// These fields describe who the client is, not what they want to do right now.

const CLIENT_PROFILE_BLOCKS: IntakeBlock[] = [
  {
    id: "business",
    title: "Your Business",
    description: "Let's start with who you are and what you do.",
    questions: [
      {
        id: "business_name",
        internalLabel: "Business name & industry",
        question: {
          beginner: "What's the name of your business, and what do you sell or offer?",
          intermediate: "What is the business name and industry?",
          advanced: "Business name and industry.",
        },
        hint: {
          beginner: "Just the basics — we'll build from here.",
          intermediate: "Include the sector if helpful (e.g. F&B, SaaS, fashion).",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Sushikasa — we're a Japanese restaurant in São Paulo",
          intermediate: "e.g. Sushikasa — premium Japanese restaurant chain",
          advanced: "e.g. Sushikasa / Food & Beverage / 5 locations",
        },
        type: "text",
        required: true,
        weight: 8,
      },
      {
        id: "business_description",
        internalLabel: "Business description",
        question: {
          beginner: "Tell us a bit about your business — what you do, who you help, and how long you've been running.",
          intermediate: "Briefly describe what the business does, its market position, and size.",
          advanced: "Business description: product/service, positioning, scale, maturity.",
        },
        hint: {
          beginner: "No need to be formal — describe it like you would to a new customer.",
          intermediate: "2–3 sentences is enough.",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. We've been open for 3 years and serve premium Japanese food in São Paulo. People come for special occasions — the experience is what sets us apart.",
          intermediate: "e.g. 5 premium restaurants in São Paulo, targeting high-income professionals. Expanding to Rio in Q3.",
          advanced: "e.g. 5-location premium F&B brand, Series A, 40% YoY growth, B2C focused.",
        },
        type: "textarea",
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "brand",
    title: "Your Brand",
    description: "What does your brand look like, and how does it speak?",
    questions: [
      {
        id: "brand_tone",
        internalLabel: "Brand tone of voice",
        question: {
          beginner: "How do you want your brand to come across to customers? More serious, fun, elegant, approachable, or bold?",
          intermediate: "How would you describe your brand's personality and tone of communication?",
          advanced: "Brand tone of voice and communication guidelines.",
        },
        hint: {
          beginner: "This helps us write and design in a style that feels natural for your business.",
          intermediate: "Think in adjectives: refined, playful, bold, trustworthy, warm, etc.",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Elegant but warm — we want people to feel welcomed and special, not sold to",
          intermediate: "e.g. Refined, premium, minimal — never loud or casual",
          advanced: "e.g. Sophisticated, culturally aware, minimal; avoids corporate or promotional language",
        },
        type: "text",
        required: false,
        weight: 5,
      },
      {
        id: "brand_existing",
        internalLabel: "Existing brand assets",
        question: {
          beginner: "Do you already have a logo or any visual materials? What do you have?",
          intermediate: "What brand materials are already in place?",
          advanced: "Existing brand assets (logo, visual identity, guidelines, photography).",
        },
        hint: {
          beginner: "Think: a logo file, professional photos, colors that are yours, anything a designer gave you.",
          intermediate: "e.g. Logo, brand guidelines, color palette, photography library.",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Yes — we have a logo and professional photos from last year's campaign",
          intermediate: "e.g. Full brand guidelines, logo in SVG, professional photography",
          advanced: "e.g. Complete brand system: logo, guidelines, palette, photography library",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "audience",
    title: "Who You're Talking To",
    description: "Tell us about the people you want to reach.",
    questions: [
      {
        id: "audience",
        internalLabel: "Target audience",
        question: {
          beginner: "Who usually buys from you or uses your service? Describe this person in your own words.",
          intermediate: "Describe your target audience: age, profession, lifestyle, and what they value.",
          advanced: "Target audience profile: demographics, psychographics, platform behaviour, segmentation.",
        },
        hint: {
          beginner: "Think about: how old are they, what do they do for work, what do they care about, how did they find you?",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Mostly couples and professionals in their 30s and 40s looking for a special night out — they usually find us through Instagram or a friend's recommendation",
          intermediate: "e.g. Urban professionals 30–45, high disposable income, value experiences. Active on Instagram and LinkedIn.",
          advanced: "e.g. HR directors at 50–500 person companies, B2B, LinkedIn-first, decision-makers in People Ops.",
        },
        type: "textarea",
        required: true,
        weight: 15,
      },
    ],
  },
  {
    id: "current_marketing",
    title: "What You're Doing Today",
    description: "Help us understand your current marketing situation.",
    questions: [
      {
        id: "current_channels",
        internalLabel: "Current channels",
        question: {
          beginner: "Are you already posting or advertising anywhere? Where?",
          intermediate: "Which marketing channels are you currently active on?",
          advanced: "Current active channels and approximate performance.",
        },
        hint: {
          beginner: "For example: Instagram, Google, flyers, email, word of mouth — anything counts.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. We post on Instagram sometimes, and we show up on Google Maps",
          intermediate: "e.g. Instagram, email newsletter, occasional Google Ads",
          advanced: "e.g. Meta (organic + paid), Google Ads, email CRM (Mailchimp, 12k list)",
        },
        type: "text",
        required: false,
        weight: 4,
      },
      {
        id: "what_works",
        internalLabel: "What is working",
        question: {
          beginner: "What has worked well for you in getting customers so far?",
          intermediate: "What's working well in your current marketing?",
          advanced: "High-performing tactics, channels, or creatives.",
        },
        hint: {
          beginner: "Even small things count — a post that got lots of reactions, a promotion that filled the place, word of mouth.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Our food photos on Instagram get a lot of messages asking for the address",
          intermediate: "e.g. Instagram organic is strong, email open rate is 40%",
          advanced: "e.g. Meta prospecting ROAS 3.8x, email 42% OR, organic LinkedIn strong for leads",
        },
        type: "text",
        required: false,
        weight: 3,
      },
      {
        id: "what_fails",
        internalLabel: "What is not working",
        question: {
          beginner: "Has anything you tried NOT worked — or felt like wasted money?",
          intermediate: "What hasn't worked or hasn't delivered results?",
          advanced: "Underperforming channels, wasted spend, or failed tactics.",
        },
        hint: {
          beginner: "This helps us avoid repeating the same mistakes.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. We tried running Facebook ads once but got zero results and spent a lot",
          intermediate: "e.g. Google Ads — no clear strategy, wasted budget last quarter",
          advanced: "e.g. Google Search <1.5x ROAS, influencer collabs no measurable ROI",
        },
        type: "text",
        required: false,
        weight: 3,
      },
    ],
  },
  {
    id: "assets",
    title: "What You Already Have",
    description: "Let's see what materials are ready to use.",
    questions: [
      {
        id: "available_assets",
        internalLabel: "Available assets",
        question: {
          beginner: "What do you already have that we could use? Select everything that applies.",
          intermediate: "What brand or content assets are already available?",
          advanced: "Available assets (select all that apply).",
        },
        hint: {
          beginner: "We'll use what you have and let you know what still needs to be created.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: {
          beginner: [
            "Logo and visual identity",
            "Professional photos",
            "Videos",
            "Written texts or scripts",
            "Product catalog or menu",
            "Customer testimonials or reviews",
            "Nothing yet — we start from scratch",
          ],
          intermediate: [
            "Logo + brand guidelines",
            "Photography",
            "Video content",
            "Copy / brand voice document",
            "Product catalogue",
            "Testimonials / reviews",
            "Competitor analysis",
            "Nothing yet",
          ],
          advanced: [
            "Logo + brand guidelines",
            "Photography",
            "Video content",
            "Copy / brand voice document",
            "Product catalogue",
            "Testimonials / reviews",
            "Competitor analysis",
            "Previous campaign reports / performance data",
            "Nothing yet",
          ],
        },
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "restrictions",
    title: "Brand Rules & Constraints",
    description: "Anything we should never do, say, or show for this client.",
    questions: [
      {
        id: "restrictions",
        internalLabel: "Restrictions and constraints",
        question: {
          beginner: "Is there anything you absolutely don't want — a word, a color, a competitor to never mention?",
          intermediate: "Are there any restrictions, brand rules, or things to avoid?",
          advanced: "Restrictions, compliance requirements, brand constraints, or internal blockers.",
        },
        hint: {
          beginner: "For example: a color that doesn't feel like you, a tone that's too pushy, a competitor you never want us to reference.",
          intermediate: "Include compliance requirements if relevant (e.g. LGPD, GDPR).",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. Please don't use red — it doesn't feel like us. And never mention [competitor name].",
          intermediate: "e.g. Avoid direct competitor references. Must comply with LGPD. No aggressive tone.",
          advanced: "e.g. LGPD compliant. No mention of X brand. Legal: avoid specific performance claims.",
        },
        type: "textarea",
        required: false,
        weight: 3,
      },
    ],
  },
];

// ─── PROJECT BRIEF blocks — captured fresh for each project ──────────────────
// These fields describe what the client wants to do right now.

const PROJECT_BRIEF_BLOCKS: IntakeBlock[] = [
  {
    id: "objective",
    title: "What You Want to Achieve",
    description: "What should this project actually do for the business?",
    questions: [
      {
        id: "objective",
        internalLabel: "Primary project objective",
        question: {
          beginner: "What do you want this project to achieve? More orders, more people finding you, more messages, more followers?",
          intermediate: "What is the primary goal of this project?",
          advanced: "Primary objective and campaign goal.",
        },
        hint: {
          beginner: "There's no wrong answer — we just want to understand what success looks like for you.",
          intermediate: "Be specific — a concrete outcome is more useful than a general direction.",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. I want more people to know we exist and come in to try us",
          intermediate: "e.g. Generate 300 qualified leads from HR directors over 6 weeks",
          advanced: "e.g. 300 MQLs in 6 weeks, CPL < €15, channel: LinkedIn + Google Ads",
        },
        type: "textarea",
        required: true,
        weight: 25,
      },
      {
        id: "success_criteria",
        internalLabel: "Success criteria / KPIs",
        question: {
          beginner: "How will you know if it worked? Is there a number you're hoping to hit?",
          intermediate: "What does success look like? Any specific numbers or metrics you're targeting?",
          advanced: "Success criteria and KPIs (ROAS, CPL, engagement rate, growth targets).",
        },
        hint: {
          beginner: "For example: 50 new bookings a month, twice the Instagram followers, 20% more website visits.",
          intermediate: "Even rough targets help us prioritise.",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. I'd love to double the number of online reservations in 3 months",
          intermediate: "e.g. 200 new followers/month, 5% engagement rate, 50 monthly form submissions",
          advanced: "e.g. ROAS 4x, CPL < €12, 5% conversion on landing page",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "services",
    title: "What Help You Need",
    description: "What kind of work does this project require?",
    questions: [
      {
        id: "services",
        internalLabel: "Services required",
        question: {
          beginner: "What kind of help are you looking for? Select everything that sounds relevant.",
          intermediate: "Which services are needed for this project?",
          advanced: "Select all required services.",
        },
        hint: {
          beginner: "Not sure what everything means? Pick what feels closest — we'll help you figure out the rest.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: {
          beginner: [
            "More visibility on social media",
            "Paid ads to bring in more customers",
            "Show up higher on Google",
            "A new logo or visual identity",
            "Written content and texts",
            "Email marketing",
            "Understand what's working (analytics)",
          ],
          intermediate: [
            "Social Media Management",
            "Paid Advertising",
            "SEO",
            "Branding & Identity",
            "Content Production",
            "Email Marketing",
            "Analytics & Reporting",
          ],
          advanced: [
            "Social Media",
            "Paid Ads",
            "SEO",
            "Branding",
            "Content Production",
            "Email Marketing",
            "Analytics",
          ],
        },
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "budget_timeline",
    title: "Budget & Timeline",
    description: "Help us scope what's realistic for this project.",
    questions: [
      {
        id: "budget",
        internalLabel: "Budget range",
        question: {
          beginner: "Roughly how much are you thinking of investing per month? Choose the range that feels closest.",
          intermediate: "What is the approximate monthly budget for this project?",
          advanced: "Budget range (monthly retainer or total project).",
        },
        hint: {
          beginner: "This helps us recommend what's actually possible with your investment.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: [
          "Under €1,000",
          "€1,000 – €3,000",
          "€3,000 – €7,000",
          "€7,000 – €15,000",
          "€15,000+",
          "Not defined yet",
        ],
        required: false,
        weight: 5,
      },
      {
        id: "deadline",
        internalLabel: "Deadline or launch date",
        question: {
          beginner: "Is there a specific date you need things to be ready by?",
          intermediate: "Is there a target launch date or hard deadline?",
          advanced: "Hard deadline or launch date.",
        },
        hint: {
          beginner: "For example: before a product launch, a seasonal event, or a month you have in mind.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "e.g. We're launching a new menu in July — everything should be ready by end of June",
          intermediate: "e.g. End of June, Q3 launch, 6 weeks from now",
          advanced: "e.g. 2025-06-30 hard deadline / 6-week runway",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
];

// Combined for scoring — order doesn't matter for computeIntakeSummary
const ALL_INTAKE_BLOCKS: IntakeBlock[] = [...CLIENT_PROFILE_BLOCKS, ...PROJECT_BRIEF_BLOCKS];

// ─── Scoring + summary ────────────────────────────────────────────────────────

function computeIntakeSummary(answers: IntakeAnswers, clientId: string): IntakeSummary {
  const allQuestions = ALL_INTAKE_BLOCKS.flatMap((b) => b.questions);
  let score = 0;
  const missingRequired: string[] = [];

  for (const q of allQuestions) {
    const answer = answers[q.id];
    const filled = Array.isArray(answer)
      ? answer.length > 0
      : typeof answer === "string" && answer.trim().length > 3;
    if (filled) {
      score += q.weight;
    } else if (q.required) {
      missingRequired.push(q.internalLabel);
    }
  }

  const servicesRaw = answers["services"];
  const servicesRequested: string[] = Array.isArray(servicesRaw) ? servicesRaw : [];

  const businessName = typeof answers["business_name"] === "string" ? answers["business_name"] : "";
  const businessDesc = typeof answers["business_description"] === "string" ? answers["business_description"] : "";
  const clientContext = [businessName, businessDesc].filter(Boolean).join(" — ");
  const projectObjective = typeof answers["objective"] === "string" ? answers["objective"] : "";

  const recommendedNextQuestions: string[] = [];
  if (!answers["success_criteria"]) recommendedNextQuestions.push("How will success be measured? (target metrics / KPIs)");
  if (!answers["current_channels"]) recommendedNextQuestions.push("Which channels are they currently active on?");
  if (!(answers["budget"] as string[] | undefined)?.length) recommendedNextQuestions.push("What is the approximate budget?");
  if (!answers["deadline"]) recommendedNextQuestions.push("Is there a deadline or launch date?");
  if (!answers["brand_tone"]) recommendedNextQuestions.push("How should the brand communicate? (tone of voice)");

  const readinessLabel: IntakeSummary["readinessLabel"] =
    score >= 70 ? "Ready" : score >= 40 ? "Partially Ready" : "Not Ready";

  return {
    clientId,
    clientContext,
    projectObjective,
    servicesRequested,
    missingInformation: missingRequired,
    recommendedNextQuestions,
    readinessScore: Math.min(score, 100),
    readinessLabel,
  };
}

// ─── Intake → orchestrator prefill ───────────────────────────────────────────

const SERVICE_ID_MAP: Record<string, string> = {
  "Social Media": "social_media",
  "Paid Ads": "ads",
  "SEO": "seo",
  "Branding": "branding",
  "Content Production": "content",
  "Email Marketing": "content",
  "Analytics": "content",
  "Social Media Management": "social_media",
  "Paid Advertising": "ads",
  "Branding & Identity": "branding",
  "Analytics & Reporting": "content",
  "More visibility on social media": "social_media",
  "Paid ads to bring in more customers": "ads",
  "Show up higher on Google": "seo",
  "A new logo or visual identity": "branding",
  "Written content and texts": "content",
  "Understand what's working (analytics)": "content",
};

export function intakeToPrefill(answers: IntakeAnswers, clientId: string): IntakePrefill {
  const servicesRaw = (answers["services"] as string[] | undefined) ?? [];
  const services = servicesRaw
    .map((s) => SERVICE_ID_MAP[s] ?? s)
    .filter((v, i, a) => a.indexOf(v) === i);

  const businessDescription = [
    typeof answers["business_name"] === "string" ? answers["business_name"] : "",
    typeof answers["business_description"] === "string" ? answers["business_description"] : "",
  ]
    .filter(Boolean)
    .join(". ");

  const channelsRaw = typeof answers["current_channels"] === "string" ? answers["current_channels"] : "";
  const channels = channelsRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

  const assetsRaw = (answers["available_assets"] as string[] | undefined) ?? [];
  const notes = [
    answers["brand_tone"] ? `Tone: ${answers["brand_tone"]}` : "",
    answers["restrictions"] ? `Restrictions: ${answers["restrictions"]}` : "",
    answers["what_fails"] ? `Currently failing: ${answers["what_fails"]}` : "",
    assetsRaw.length ? `Assets available: ${assetsRaw.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const deadlineText = typeof answers["deadline"] === "string" ? answers["deadline"].toLowerCase() : "";
  let deadline = "";
  const year = new Date().getFullYear();
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05",
    june: "06", july: "07", august: "08", september: "09", october: "10",
    november: "11", december: "12", jan: "01", feb: "02", mar: "03",
    apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10",
    nov: "11", dec: "12",
  };
  const mMatch = deadlineText.match(/(?:end\s+of\s+|by\s+|in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/);
  if (mMatch) deadline = `${year}-${MONTHS[mMatch[1]]}-28`;
  const wMatch = deadlineText.match(/(\d+)\s*weeks?/);
  const moMatch = deadlineText.match(/(\d+)\s*months?/);
  if (!deadline && wMatch) deadline = new Date(Date.now() + parseInt(wMatch[1]) * 7 * 86400000).toISOString().slice(0, 10);
  else if (!deadline && moMatch) { const d = new Date(); d.setMonth(d.getMonth() + parseInt(moMatch[1])); deadline = d.toISOString().slice(0, 10); }

  return {
    clientId,
    services,
    businessDescription,
    objective: typeof answers["objective"] === "string" ? answers["objective"] : "",
    targetAudience: typeof answers["audience"] === "string" ? answers["audience"] : "",
    channels,
    deadline,
    notes,
  };
}

// ─── Free text → answers ──────────────────────────────────────────────────────

function parseTextToAnswers(text: string): IntakeAnswers {
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: IntakeAnswers = {};

  const objectiveSentence = sentences.find((s) =>
    /(?:goal|objective|aim|purpose)\s+(?:is\s+)?to\b/i.test(s) ||
    /\bwe\s+(?:want|need|are\s+looking)\s+to\b/i.test(s) ||
    /\bto\s+(?:increase|grow|generate|drive|boost|launch|build|establish|improve|scale|expand)\b/i.test(s)
  );
  parsed["objective"] = objectiveSentence ?? text.slice(0, 200);

  const audienceSentence = sentences.find((s) =>
    /target\s+audience|our\s+audience|targeting\s+|audience\s+is|aimed\s+at\b|\b\d{2}\s*(?:to|-)\s*\d{2}\b|millennials|gen\s*[zZ]\b|b2b\b|b2c\b/i.test(s)
  );
  if (audienceSentence) parsed["audience"] = audienceSentence;

  const bizSentence = sentences.find((s) =>
    /\bis\s+an?\b|\bthey(?:'re| are)\s+an?\b|\bit'?s\s+an?\b|\bcompany\b|\bstartup\b|\bplatform\b/i.test(s) &&
    !/we\s+(?:need|want)|looking\s+to\b|increase\b|generate\b/i.test(s)
  );
  if (bizSentence) parsed["business_description"] = bizSentence;

  const services: string[] = [];
  if (/social\s+media|instagram|tiktok|facebook(?!\s+ads?)/i.test(lower)) services.push("Social Media");
  if (/\bads?\b|paid\s+media|advertising|google\s+ads|meta\s+ads/i.test(lower)) services.push("Paid Ads");
  if (/\bseo\b|search\s+engine\s+optim/i.test(lower)) services.push("SEO");
  if (/\bbranding\b|\bbrand\s+identity|\blogo\b/i.test(lower)) services.push("Branding");
  if (/content\s+strateg|content\s+plan|blog\s+posts?|copywriting/i.test(lower)) services.push("Content Production");
  if (/email\s+(?:marketing|campaign|newsletter)/i.test(lower)) services.push("Email Marketing");
  if (services.length) parsed["services"] = services;

  const channelParts: string[] = [];
  if (/instagram/i.test(text)) channelParts.push("Instagram");
  if (/linkedin/i.test(text)) channelParts.push("LinkedIn");
  if (/\btiktok\b/i.test(text)) channelParts.push("TikTok");
  if (/\bgoogle\b/i.test(text)) channelParts.push("Google");
  if (/facebook/i.test(text)) channelParts.push("Facebook");
  if (/\bemail\b/i.test(text)) channelParts.push("Email");
  if (channelParts.length) parsed["current_channels"] = channelParts.join(", ");

  const wMatch = lower.match(/(\d+)\s*weeks?/);
  const mMatch = lower.match(/(\d+)\s*months?/);
  const endMatch = lower.match(/end\s+of\s+([a-z]+)/);
  if (wMatch) parsed["deadline"] = `${wMatch[1]} weeks`;
  else if (mMatch) parsed["deadline"] = `${mMatch[1]} months`;
  else if (endMatch) parsed["deadline"] = `End of ${endMatch[1]}`;

  return parsed;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IntakeEngineProps {
  clients: Client[];
  onComplete: (summary: IntakeSummary, prefill: IntakePrefill) => void;
}

export default function IntakeEngine({ clients, onComplete }: IntakeEngineProps) {
  const { updateClient } = useAgencyStore();

  const [clientLevel, setClientLevel] = useState<ClientLevel | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("guided");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [intakePhase, setIntakePhase] = useState<IntakePhase>("client");
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [freeText, setFreeText] = useState("");
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const level = clientLevel ?? "intermediate";
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const setAnswer = (questionId: string, value: string | string[]) =>
    setAnswers((prev: IntakeAnswers) => ({ ...prev, [questionId]: value }));

  const toggleMultiselect = (questionId: string, option: string) => {
    const current = (answers[questionId] as string[] | undefined) ?? [];
    setAnswer(questionId, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  };

  // When a client is selected, pre-load all known profile data so we don't ask again
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    setProfileSaved(false);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setAnswers((prev: IntakeAnswers) => ({
        ...prev,
        ...(!prev["business_name"] && client.name ? { business_name: client.name } : {}),
        ...(!prev["business_description"] && client.description ? { business_description: client.description } : {}),
        ...(!prev["brand_tone"] && client.brandTone ? { brand_tone: client.brandTone } : {}),
        ...(!prev["brand_existing"] && client.brandExisting ? { brand_existing: client.brandExisting } : {}),
        ...(!prev["audience"] && client.targetAudience ? { audience: client.targetAudience } : {}),
        ...(!prev["current_channels"] && client.currentChannels ? { current_channels: client.currentChannels } : {}),
        ...(!prev["what_works"] && client.whatWorks ? { what_works: client.whatWorks } : {}),
        ...(!prev["what_fails"] && client.whatFails ? { what_fails: client.whatFails } : {}),
        ...(!(prev["available_assets"] as string[] | undefined)?.length && client.availableAssets?.length ? { available_assets: client.availableAssets } : {}),
        ...(!prev["restrictions"] && client.restrictions ? { restrictions: client.restrictions } : {}),
      }));
    }
  };

  // Persist completed client profile answers back to the Client Hub
  const saveClientProfile = (currentAnswers: IntakeAnswers, clientId: string) => {
    const updates: Partial<Client> = {};
    if (currentAnswers["business_description"]) updates.description = currentAnswers["business_description"] as string;
    if (currentAnswers["brand_tone"]) updates.brandTone = currentAnswers["brand_tone"] as string;
    if (currentAnswers["brand_existing"]) updates.brandExisting = currentAnswers["brand_existing"] as string;
    if (currentAnswers["audience"]) updates.targetAudience = currentAnswers["audience"] as string;
    if (currentAnswers["current_channels"]) updates.currentChannels = currentAnswers["current_channels"] as string;
    if (currentAnswers["what_works"]) updates.whatWorks = currentAnswers["what_works"] as string;
    if (currentAnswers["what_fails"]) updates.whatFails = currentAnswers["what_fails"] as string;
    if ((currentAnswers["available_assets"] as string[] | undefined)?.length) updates.availableAssets = currentAnswers["available_assets"] as string[];
    if (currentAnswers["restrictions"]) updates.restrictions = currentAnswers["restrictions"] as string;
    if (Object.keys(updates).length > 0) {
      updateClient(clientId, updates);
      setProfileSaved(true);
    }
  };

  const availableModes: IntakeMode[] =
    clientLevel === "beginner" ? ["guided"] :
    clientLevel === "intermediate" ? ["guided", "free_brief"] :
    ["guided", "free_brief", "existing_brief"];

  const MODE_LABELS: Record<IntakeMode, string> = {
    guided: "Guided Interview",
    free_brief: "Free Brief",
    existing_brief: "Existing Brief",
  };

  const handleLevelSelect = (lvl: ClientLevel) => {
    setClientLevel(lvl);
    setIntakeMode(lvl === "advanced" ? "existing_brief" : "guided");
    setIntakePhase("client");
    setCurrentBlockIndex(0);
    setAnswers({});
    setFreeText("");
    setSummary(null);
    setSelectedClientId("");
    setProfileSaved(false);
  };

  // Active blocks depend on which phase we're in
  const activeBlocks = intakePhase === "client" ? CLIENT_PROFILE_BLOCKS : PROJECT_BRIEF_BLOCKS;
  const currentBlock = activeBlocks[currentBlockIndex];
  const totalBlocks = activeBlocks.length;

  // Check if all required client profile fields are already filled (from auto-load or prior answers)
  const clientProfileComplete = CLIENT_PROFILE_BLOCKS
    .flatMap((b) => b.questions)
    .filter((q) => q.required)
    .every((q) => {
      const a = answers[q.id];
      return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
    });

  // Labels for missing required profile fields (shown in right panel during client phase)
  const missingProfileLabels = CLIENT_PROFILE_BLOCKS
    .flatMap((b) => b.questions)
    .filter((q) => q.required)
    .filter((q) => {
      const a = answers[q.id];
      return !(Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3);
    })
    .map((q) => q.internalLabel);

  const canAdvanceBlock = () =>
    currentBlock.questions
      .filter((q) => q.required)
      .every((q) => {
        const a = answers[q.id];
        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
      });

  const handleNextBlock = () => {
    if (currentBlockIndex < activeBlocks.length - 1) {
      setCurrentBlockIndex((i: number) => i + 1);
    } else if (intakePhase === "client") {
      saveClientProfile(answers, selectedClientId);
      setIntakePhase("project");
      setCurrentBlockIndex(0);
    } else {
      setSummary(computeIntakeSummary(answers, selectedClientId));
    }
  };

  const handleTextSubmit = () => {
    const parsed = parseTextToAnswers(freeText);
    // Auto-load client data on top of parsed answers
    if (selectedClient) {
      if (!parsed["business_name"] && selectedClient.name) parsed["business_name"] = selectedClient.name;
      if (!parsed["business_description"] && selectedClient.description) parsed["business_description"] = selectedClient.description;
    }
    setAnswers(parsed);
    setSummary(computeIntakeSummary(parsed, selectedClientId));
  };

  // ── Summary screen ──────────────────────────────────────────────────────────

  if (summary) {
    const color =
      summary.readinessScore >= 70
        ? { bar: "bg-[var(--success)]", text: "text-[var(--success)]", badge: "bg-[var(--success-bg)] text-[var(--success)]" }
        : summary.readinessScore >= 40
        ? { bar: "bg-[var(--warning)]", text: "text-[var(--warning)]", badge: "bg-[var(--warning-bg)] text-[var(--warning)]" }
        : { bar: "bg-[var(--danger)]", text: "text-[var(--danger)]", badge: "bg-[#FEE2E2] text-[var(--danger)]" };

    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            <span className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.05em]">Intake Summary</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
              {summary.readinessLabel}
            </span>
          </div>

          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">Readiness Score</span>
              <span className={`text-[14px] font-bold tabular-nums ${color.text}`}>{summary.readinessScore}%</span>
            </div>
            <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${color.bar}`} style={{ width: `${summary.readinessScore}%` }} />
            </div>
          </div>

          <div className="divide-y divide-[var(--border)]">
            <SummaryRow label="Client" value={summary.clientContext} />
            <SummaryRow label="Objective" value={summary.projectObjective} />
            <div className="flex items-start gap-3 px-5 py-3">
              <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
                Services
              </span>
              <div className="flex flex-wrap gap-1.5">
                {summary.servicesRequested.length > 0 ? (
                  summary.servicesRequested.map((s: string) => (
                    <span key={s} className="h-5 px-2 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--navy)]">{s}</span>
                  ))
                ) : (
                  <span className="text-[12px] text-[var(--text-subtle)] italic">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {summary.missingInformation.length > 0 && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--danger)] uppercase tracking-[0.05em] mb-2.5">
              Missing Required Information
            </div>
            <ul className="space-y-1.5">
              {summary.missingInformation.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#7F1D1D]">
                  <span className="shrink-0 text-[var(--danger)] font-bold mt-px">×</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.recommendedNextQuestions.length > 0 && (
          <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-2.5">
              Recommended Follow-up Questions
            </div>
            <ul className="space-y-1.5">
              {summary.recommendedNextQuestions.map((q: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#78350F]">
                  <span className="shrink-0 text-[var(--warning)] mt-px">→</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSummary(null)}>
            Revise Intake
          </Button>
          <button
            onClick={() => onComplete(summary, intakeToPrefill(answers, selectedClientId))}
            disabled={summary.missingInformation.length > 0}
            className="flex-1 h-9 bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
          >
            Continue to Orchestrator →
          </button>
        </div>
      </div>
    );
  }

  // ── Level selection screen ──────────────────────────────────────────────────

  if (!clientLevel) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border)]">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Client Intake</h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Before generating an execution plan, we gather and validate the project context. How experienced is this client with marketing?
            </p>
          </div>
          <div className="px-6 py-5">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Client Experience Level</div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    level: "beginner" as ClientLevel,
                    label: "Needs Guidance",
                    desc: "Client isn't sure what they need. We guide the whole conversation.",
                    icon: "?",
                    hoverBg: "group-hover:bg-[var(--danger)]",
                    badge: "bg-[#FEE2E2] text-[var(--danger)]",
                    modeNote: "Guided Interview only",
                  },
                  {
                    level: "intermediate" as ClientLevel,
                    label: "Has a Rough Idea",
                    desc: "Client has some direction but needs help structuring it.",
                    icon: "≈",
                    hoverBg: "group-hover:bg-[var(--warning)]",
                    badge: "bg-[var(--warning-bg)] text-[var(--warning)]",
                    modeNote: "Interview or Free Brief",
                  },
                  {
                    level: "advanced" as ClientLevel,
                    label: "Has a Full Brief",
                    desc: "Client knows exactly what they need and has materials ready.",
                    icon: "✓",
                    hoverBg: "group-hover:bg-[var(--success)]",
                    badge: "bg-[var(--success-bg)] text-[var(--success)]",
                    modeNote: "Any mode",
                  },
                ] as const
              ).map(({ level, label, desc, icon, hoverBg, badge, modeNote }) => (
                <button
                  key={level}
                  onClick={() => handleLevelSelect(level)}
                  className="flex flex-col items-start gap-3 p-4 rounded-[8px] border-2 border-[var(--border)] hover:border-[var(--navy)] hover:bg-[var(--accent-light)]/20 text-left transition-all group"
                >
                  <div className={`w-9 h-9 rounded-full bg-[var(--accent)] ${hoverBg} flex items-center justify-center text-[14px] font-bold text-[var(--text-muted)] group-hover:text-white transition-all`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{desc}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
                    {modeNote}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Intake form screen ──────────────────────────────────────────────────────

  const LEVEL_CHIP: Record<ClientLevel, { label: string; style: string }> = {
    beginner: { label: "Needs Guidance", style: "bg-[#FEE2E2] text-[var(--danger)]" },
    intermediate: { label: "Has a Rough Idea", style: "bg-[var(--warning-bg)] text-[var(--warning)]" },
    advanced: { label: "Has a Full Brief", style: "bg-[var(--success-bg)] text-[var(--success)]" },
  };

  const stepLabel = level === "beginner" ? "Step" : "Block";

  const nextBlockLabel =
    currentBlockIndex < activeBlocks.length - 1
      ? `Next: ${activeBlocks[currentBlockIndex + 1]?.title}`
      : intakePhase === "client"
      ? "Continue to Project Brief →"
      : "Generate Intake Summary";

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden h-fit">

        {/* Level chip + change */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Client</span>
            <span className={`h-5 px-2 rounded-full text-[11px] font-medium ${LEVEL_CHIP[level as ClientLevel].style}`}>
              {LEVEL_CHIP[level as ClientLevel].label}
            </span>
          </div>
          <button onClick={() => setClientLevel(null)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
            Change
          </button>
        </div>

        {/* Mode tabs */}
        {availableModes.length > 1 && (
          <div className="flex border-b border-[var(--border)]">
            {availableModes.map((mode) => (
              <button
                key={mode}
                onClick={() => { setIntakeMode(mode); setIntakePhase("client"); setCurrentBlockIndex(0); setSummary(null); setAnswers({}); setFreeText(""); setSelectedClientId(""); }}
                className={`flex-1 py-2.5 text-[12px] font-medium border-b-2 -mb-[1px] transition-colors ${
                  intakeMode === mode
                    ? "border-[var(--navy)] text-[var(--navy)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          {/* Client selector — auto-loads known profile data on selection */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Client *</label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            >
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── GUIDED INTERVIEW ─────────────────────────────────────────────── */}
          {intakeMode === "guided" && (
            <div className="space-y-4">
              {/* Phase indicator */}
              <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[7px]">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {intakePhase === "client" ? "Phase 1 — Client Profile" : "Phase 2 — Project Brief"}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {intakePhase === "client"
                      ? "Capture or confirm what we know about this client."
                      : `What does ${selectedClient?.name ?? "this client"} want to do now?`}
                  </div>
                </div>
                {intakePhase === "project" && (
                  <button
                    onClick={() => { setIntakePhase("client"); setCurrentBlockIndex(0); }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap shrink-0 ml-3"
                  >
                    ← Profile
                  </button>
                )}
              </div>

              {/* Profile saved confirmation */}
              {intakePhase === "project" && profileSaved && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--success-bg)] border border-[#BBF7D0] rounded-[7px]">
                  <span className="text-[var(--success)] font-bold text-[11px]">✓</span>
                  <span className="text-[12px] font-medium text-[#15803D]">Client profile updated</span>
                </div>
              )}

              {/* Profile complete shortcut — skip to project brief */}
              {intakePhase === "client" && clientProfileComplete && selectedClientId && (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[var(--success-bg)] border border-[#BBF7D0] rounded-[7px]">
                  <div>
                    <div className="text-[12px] font-semibold text-[#15803D]">Profile is complete</div>
                    <div className="text-[11px] text-[#166534]">All key client information is loaded.</div>
                  </div>
                  <button
                    onClick={() => { saveClientProfile(answers, selectedClientId); setIntakePhase("project"); setCurrentBlockIndex(0); }}
                    className="h-7 px-3 text-[12px] font-semibold bg-[var(--success)] text-white rounded-[6px] hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                  >
                    Start Project Brief →
                  </button>
                </div>
              )}

              {/* Block progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">
                    {stepLabel} {currentBlockIndex + 1} of {totalBlocks}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">{currentBlock.title}</span>
                </div>
                <div className="h-1 bg-[var(--accent)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--navy)] rounded-full transition-all duration-300"
                    style={{ width: `${((currentBlockIndex + 1) / totalBlocks) * 100}%` }}
                  />
                </div>
              </div>

              {/* Block header */}
              <div>
                <div className="text-[14px] font-semibold text-[var(--text-primary)]">{currentBlock.title}</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{currentBlock.description}</div>
              </div>

              {/* Questions */}
              <div className="space-y-3.5">
                {currentBlock.questions.map((q) => {
                  const questionText = resolve(q.question, level);
                  const hintText = q.hint ? resolve(q.hint, level) : "";
                  const placeholderText = resolve(q.placeholder, level);
                  const opts = q.options ? resolveOptions(q.options, level) : [];

                  return (
                    <div key={q.id}>
                      <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1 leading-snug">
                        {questionText}
                        {q.required && <span className="text-[var(--danger)] ml-0.5">*</span>}
                      </label>
                      {hintText && (
                        <p className="text-[11px] text-[var(--text-muted)] mb-1.5 leading-snug">{hintText}</p>
                      )}
                      {q.type === "textarea" && (
                        <textarea
                          value={(answers[q.id] as string) ?? ""}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder={placeholderText}
                          rows={3}
                          className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
                        />
                      )}
                      {q.type === "text" && (
                        <input
                          value={(answers[q.id] as string) ?? ""}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder={placeholderText}
                          className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                        />
                      )}
                      {q.type === "multiselect" && (
                        <div className="flex flex-wrap gap-2">
                          {opts.map((opt) => {
                            const selected = ((answers[q.id] as string[] | undefined) ?? []).includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleMultiselect(q.id, opt)}
                                className={`h-7 px-3 rounded-full text-[12px] font-medium border transition-all ${
                                  selected
                                    ? "bg-[var(--navy)] border-[var(--navy)] text-white"
                                    : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)]"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex gap-2 pt-1">
                {(currentBlockIndex > 0 || intakePhase === "project") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (currentBlockIndex > 0) {
                        setCurrentBlockIndex((i: number) => i - 1);
                      } else {
                        setIntakePhase("client");
                        setCurrentBlockIndex(CLIENT_PROFILE_BLOCKS.length - 1);
                      }
                    }}
                  >
                    Back
                  </Button>
                )}
                <button
                  onClick={handleNextBlock}
                  disabled={!selectedClientId || !canAdvanceBlock()}
                  className={`flex-1 h-9 text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    currentBlockIndex === totalBlocks - 1 && intakePhase === "project"
                      ? "bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white"
                      : "bg-[var(--navy)] hover:bg-[#0D1230] text-white"
                  }`}
                >
                  {nextBlockLabel}
                </button>
              </div>
            </div>
          )}

          {/* ── FREE BRIEF ───────────────────────────────────────────────────── */}
          {intakeMode === "free_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Describe the client and what they want to achieve
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  Include who the client is, what their business does, who they're targeting, what they want to achieve with this project, and what kind of help they need.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={`e.g. "The client runs a Japanese restaurant in São Paulo. They want more people to discover them and visit — especially couples and professionals looking for a special experience. They're active on Instagram but have never run paid ads. Budget is around €2,000/month and they need to be ready before July."`}
                  rows={9}
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none leading-relaxed"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 20}
                className="w-full h-9 bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Parse & Generate Summary
              </button>
            </div>
          )}

          {/* ── EXISTING BRIEF ───────────────────────────────────────────────── */}
          {intakeMode === "existing_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Paste the client's existing brief
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  We'll extract client profile data and project objectives automatically. Review the summary before continuing.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Paste the full brief text here..."
                  rows={11}
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none leading-relaxed font-mono"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 30}
                className="w-full h-9 bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Extract & Review
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {intakeMode === "guided" && (
          <>
            {/* CLIENT PHASE: block progress map + known info */}
            {intakePhase === "client" && (
              <>
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Client Profile — Progress</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {CLIENT_PROFILE_BLOCKS.map((block, i) => {
                      const isActive = i === currentBlockIndex;
                      const isDone = i < currentBlockIndex;
                      const allRequired = block.questions.filter((q) => q.required).every((q) => {
                        const a = answers[q.id];
                        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
                      });
                      return (
                        <div key={block.id} className={`flex items-center gap-3 px-5 py-3 ${isActive ? "bg-[var(--accent-light)]/40" : ""}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            allRequired && (isDone || isActive) ? "bg-[var(--success-bg)] text-[var(--success)]" :
                            isActive ? "bg-[var(--navy)] text-white" :
                            "bg-[var(--accent)] text-[var(--text-muted)]"
                          }`}>
                            {allRequired && (isDone || isActive) ? "✓" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-medium ${isActive ? "text-[var(--navy)]" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                              {block.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{block.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Known information from Client Hub */}
                {selectedClient && (
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Loaded from Client Hub</span>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      <ContextRow label="Name" value={selectedClient.name} />
                      <ContextRow label="Industry" value={selectedClient.industry} />
                      {selectedClient.website && <ContextRow label="Website" value={selectedClient.website} />}
                      {selectedClient.description && <ContextRow label="About" value={selectedClient.description} />}
                    </div>
                    {missingProfileLabels.length > 0 && (
                      <div className="px-5 py-3 border-t border-[var(--border)] bg-[#FFFBEB]">
                        <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Missing from profile</div>
                        <div className="space-y-1">
                          {missingProfileLabels.map((label) => (
                            <div key={label} className="flex items-center gap-1.5 text-[11px] text-[#92400E]">
                              <span className="shrink-0 text-[var(--warning)]">·</span>
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* PROJECT PHASE: client context card + project brief progress */}
            {intakePhase === "project" && (
              <>
                {/* Client profile summary — read-only context */}
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Client Profile</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {selectedClient && <ContextRow label="Client" value={`${selectedClient.name} · ${selectedClient.industry}`} />}
                    {answers["business_description"] && <ContextRow label="About" value={answers["business_description"] as string} />}
                    {answers["audience"] && <ContextRow label="Audience" value={answers["audience"] as string} />}
                    {answers["brand_tone"] && <ContextRow label="Tone" value={answers["brand_tone"] as string} />}
                    {answers["current_channels"] && <ContextRow label="Channels" value={answers["current_channels"] as string} />}
                    {answers["restrictions"] && <ContextRow label="Constraints" value={answers["restrictions"] as string} />}
                    {!answers["business_description"] && !answers["audience"] && (
                      <div className="px-5 py-3">
                        <p className="text-[12px] text-[var(--text-subtle)] italic">No profile data captured yet.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Project brief block progress */}
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Project Brief — Progress</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {PROJECT_BRIEF_BLOCKS.map((block, i) => {
                      const isActive = i === currentBlockIndex;
                      const isDone = i < currentBlockIndex;
                      const allRequired = block.questions.filter((q) => q.required).every((q) => {
                        const a = answers[q.id];
                        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
                      });
                      return (
                        <div key={block.id} className={`flex items-center gap-3 px-5 py-3 ${isActive ? "bg-[var(--accent-light)]/40" : ""}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            allRequired && (isDone || isActive) ? "bg-[var(--success-bg)] text-[var(--success)]" :
                            isActive ? "bg-[var(--navy)] text-white" :
                            "bg-[var(--accent)] text-[var(--text-muted)]"
                          }`}>
                            {allRequired && (isDone || isActive) ? "✓" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-medium ${isActive ? "text-[var(--navy)]" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                              {block.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{block.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Free brief / existing brief: what to include */}
        {(intakeMode === "free_brief" || intakeMode === "existing_brief") && (
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
              Client Profile
            </div>
            <ul className="space-y-1.5 mb-4">
              {["Who the client is and what they do", "Their target audience", "Current marketing channels", "Brand tone and visual assets", "Brand rules or constraints"].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#BBF7D0] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
              Project Brief
            </div>
            <ul className="space-y-1.5">
              {["What they want to achieve with this project", "Services needed", "Budget range", "Deadline or launch date"].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
        {label}
      </span>
      {value ? (
        <p className="flex-1 text-[13px] text-[var(--text-primary)] leading-snug">{value}</p>
      ) : (
        <p className="flex-1 text-[12px] text-[var(--text-subtle)] italic">Not provided</p>
      )}
    </div>
  );
}

// ─── ContextRow ───────────────────────────────────────────────────────────────

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-2.5">
      <span className="w-[80px] shrink-0 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
        {label}
      </span>
      <p className="flex-1 text-[12px] text-[var(--text-primary)] leading-snug">{value}</p>
    </div>
  );
}
