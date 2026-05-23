"use client";

import { useState } from "react";
import type { Client } from "@/lib/agency/mock-data";
import Button from "@/components/agency/ui/Button";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientLevel = "lost" | "medium" | "advanced";
type IntakeMode = "guided" | "free_brief" | "existing_brief";

interface IntakeQuestion {
  id: string;
  question: string;
  hint?: string;
  placeholder: string;
  type: "text" | "textarea" | "multiselect";
  options?: string[];
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

// ─── Question blocks ──────────────────────────────────────────────────────────

const INTAKE_BLOCKS: IntakeBlock[] = [
  {
    id: "business",
    title: "Business",
    description: "Who is the client and what do they do?",
    questions: [
      {
        id: "business_name",
        question: "What is the client's business name and industry?",
        placeholder: "e.g. Sushikasa — premium Japanese restaurant chain",
        type: "text",
        required: true,
        weight: 8,
      },
      {
        id: "business_description",
        question: "Describe what the business does in 2–3 sentences.",
        hint: "Product, service, market position, how long they've been operating.",
        placeholder: "e.g. We operate 5 premium Japanese restaurants in São Paulo, targeting high-income professionals. Expanding to Rio in Q3.",
        type: "textarea",
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "brand",
    title: "Brand",
    description: "What does the brand look and sound like?",
    questions: [
      {
        id: "brand_tone",
        question: "How would you describe the brand's tone of voice?",
        placeholder: "e.g. Refined, premium, minimal — never loud or casual",
        type: "text",
        required: false,
        weight: 5,
      },
      {
        id: "brand_existing",
        question: "Does the brand have an existing identity?",
        hint: "Logo, brand guidelines, color palette, photography?",
        placeholder: "e.g. Full brand guidelines, logo in SVG, professional photography from last campaign",
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "objective",
    title: "Objective",
    description: "What does the client actually want to achieve?",
    questions: [
      {
        id: "objective",
        question: "What is the primary goal of this project?",
        hint: "Be specific — a measurable outcome is more useful than a vague direction.",
        placeholder: "e.g. Generate 300 qualified leads from HR directors over 6 weeks via LinkedIn and Google Ads",
        type: "textarea",
        required: true,
        weight: 25,
      },
      {
        id: "success_criteria",
        question: "How will success be measured?",
        placeholder: "e.g. ROAS 4x, 200 new followers/month, 5% engagement rate",
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "audience",
    title: "Audience",
    description: "Who are we trying to reach?",
    questions: [
      {
        id: "audience",
        question: "Describe the target audience.",
        hint: "Age, profession, location, platform behaviour, values.",
        placeholder: "e.g. HR directors at companies with 50–500 employees, active on LinkedIn, 35–50 years old",
        type: "textarea",
        required: true,
        weight: 15,
      },
    ],
  },
  {
    id: "current_marketing",
    title: "Current Marketing",
    description: "What's happening with their marketing today?",
    questions: [
      {
        id: "current_channels",
        question: "Which channels are they currently using?",
        placeholder: "e.g. Instagram, email newsletter, occasional Google Ads",
        type: "text",
        required: false,
        weight: 4,
      },
      {
        id: "what_works",
        question: "What is currently working well?",
        placeholder: "e.g. Instagram organic is strong, email open rate is 40%",
        type: "text",
        required: false,
        weight: 3,
      },
      {
        id: "what_fails",
        question: "What has failed or is not producing results?",
        placeholder: "e.g. Google Ads — no strategy, wasted budget last quarter",
        type: "text",
        required: false,
        weight: 3,
      },
    ],
  },
  {
    id: "assets",
    title: "Assets Available",
    description: "What materials are ready to use right now?",
    questions: [
      {
        id: "available_assets",
        question: "Which assets are available?",
        type: "multiselect",
        placeholder: "",
        options: [
          "Logo + brand guidelines",
          "Photography",
          "Video content",
          "Copy / brand voice doc",
          "Product catalogue",
          "Testimonials / reviews",
          "Competitor analysis",
          "None — starting from scratch",
        ],
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "services",
    title: "Services Needed",
    description: "Which services does this project require?",
    questions: [
      {
        id: "services",
        question: "Select all services needed.",
        type: "multiselect",
        placeholder: "",
        options: [
          "Social Media",
          "Paid Ads",
          "SEO",
          "Branding",
          "Content Production",
          "Email Marketing",
          "Analytics",
        ],
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "budget_timeline",
    title: "Budget / Timeline",
    description: "Scope the project financially and temporally.",
    questions: [
      {
        id: "budget",
        question: "Approximate budget range.",
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
        question: "Is there a hard deadline or expected launch date?",
        placeholder: "e.g. End of June, Q3 launch, 8 weeks from now",
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "restrictions",
    title: "Restrictions",
    description: "What should we avoid or be careful about?",
    questions: [
      {
        id: "restrictions",
        question: "Any restrictions, constraints, or things to avoid?",
        hint: "Competitor names, colors, tones, compliance requirements, internal blockers.",
        placeholder: "e.g. Never mention competitor brand names. Must comply with LGPD. Avoid red in the creative.",
        type: "textarea",
        required: false,
        weight: 3,
      },
    ],
  },
];

// ─── Scoring + summary ────────────────────────────────────────────────────────

function computeIntakeSummary(answers: IntakeAnswers, clientId: string): IntakeSummary {
  const allQuestions = INTAKE_BLOCKS.flatMap((b) => b.questions);
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
      missingRequired.push(q.question);
    }
  }

  const servicesRaw = answers["services"];
  const servicesRequested: string[] = Array.isArray(servicesRaw) ? servicesRaw : [];

  const businessName = typeof answers["business_name"] === "string" ? answers["business_name"] : "";
  const businessDesc = typeof answers["business_description"] === "string" ? answers["business_description"] : "";
  const clientContext = [businessName, businessDesc].filter(Boolean).join(" — ");
  const projectObjective = typeof answers["objective"] === "string" ? answers["objective"] : "";

  const recommendedNextQuestions: string[] = [];
  if (!answers["success_criteria"]) recommendedNextQuestions.push("How will success be measured?");
  if (!answers["current_channels"]) recommendedNextQuestions.push("Which channels are they currently using?");
  if (!(answers["budget"] as string[] | undefined)?.length) recommendedNextQuestions.push("What is the approximate budget?");
  if (!answers["deadline"]) recommendedNextQuestions.push("Is there a hard deadline?");
  if (!answers["brand_tone"]) recommendedNextQuestions.push("What is the brand's tone of voice?");

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

// ─── Free text → answers (shared by Free Brief + Existing Brief modes) ────────

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
  const [clientLevel, setClientLevel] = useState<ClientLevel | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("guided");
  const [selectedClientId, setSelectedClientId] = useState("");

  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [freeText, setFreeText] = useState("");
  const [summary, setSummary] = useState<IntakeSummary | null>(null);

  const setAnswer = (questionId: string, value: string | string[]) =>
    setAnswers((prev: IntakeAnswers) => ({ ...prev, [questionId]: value }));

  const toggleMultiselect = (questionId: string, option: string) => {
    const current = (answers[questionId] as string[] | undefined) ?? [];
    setAnswer(questionId, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  };

  const availableModes: IntakeMode[] =
    clientLevel === "lost" ? ["guided"] :
    clientLevel === "medium" ? ["guided", "free_brief"] :
    ["guided", "free_brief", "existing_brief"];

  const MODE_LABELS: Record<IntakeMode, string> = {
    guided: "Guided Interview",
    free_brief: "Free Brief",
    existing_brief: "Existing Brief",
  };

  const handleLevelSelect = (level: ClientLevel) => {
    setClientLevel(level);
    setIntakeMode(level === "advanced" ? "existing_brief" : "guided");
    setCurrentBlockIndex(0);
    setAnswers({});
    setFreeText("");
    setSummary(null);
  };

  const currentBlock = INTAKE_BLOCKS[currentBlockIndex];
  const totalBlocks = INTAKE_BLOCKS.length;

  const canAdvanceBlock = () =>
    currentBlock.questions
      .filter((q) => q.required)
      .every((q) => {
        const a = answers[q.id];
        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
      });

  const handleNextBlock = () => {
    if (currentBlockIndex < totalBlocks - 1) {
      setCurrentBlockIndex((i: number) => i + 1);
    } else {
      setSummary(computeIntakeSummary(answers, selectedClientId));
    }
  };

  const handleTextSubmit = () => {
    const parsed = parseTextToAnswers(freeText);
    setAnswers(parsed);
    setSummary(computeIntakeSummary(parsed, selectedClientId));
  };

  // ── Summary screen ──────────────────────────────────────────────────────────

  if (summary) {
    const color =
      summary.readinessScore >= 70
        ? { bar: "bg-[#16A34A]", text: "text-[#16A34A]", badge: "bg-[#DCFCE7] text-[#16A34A]" }
        : summary.readinessScore >= 40
        ? { bar: "bg-[#D97706]", text: "text-[#D97706]", badge: "bg-[#FEF3C7] text-[#D97706]" }
        : { bar: "bg-[#DC2626]", text: "text-[#DC2626]", badge: "bg-[#FEE2E2] text-[#DC2626]" };

    return (
      <div className="max-w-2xl space-y-4">
        {/* Summary card */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED] bg-[#FAFAF9]">
            <span className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">Intake Summary</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
              {summary.readinessLabel}
            </span>
          </div>

          {/* Readiness score */}
          <div className="px-5 py-4 border-b border-[#F0F0ED]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[#6B6B65]">Readiness Score</span>
              <span className={`text-[14px] font-bold tabular-nums ${color.text}`}>{summary.readinessScore}%</span>
            </div>
            <div className="h-2 bg-[#F0F0ED] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${color.bar}`}
                style={{ width: `${summary.readinessScore}%` }}
              />
            </div>
          </div>

          {/* Structured fields */}
          <div className="divide-y divide-[#F7F7F6]">
            <SummaryRow label="Client Context" value={summary.clientContext} />
            <SummaryRow label="Objective" value={summary.projectObjective} />
            <div className="flex items-start gap-3 px-5 py-3">
              <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] pt-0.5">
                Services
              </span>
              <div className="flex flex-wrap gap-1.5">
                {summary.servicesRequested.length > 0 ? (
                  summary.servicesRequested.map((s) => (
                    <span key={s} className="h-5 px-2 rounded-full text-[11px] font-medium bg-[#EEF0FF] text-[#5B5BD6]">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-[#C0C0BC] italic">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Missing required info */}
        {summary.missingInformation.length > 0 && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[#DC2626] uppercase tracking-[0.05em] mb-2.5">
              Missing Required Information
            </div>
            <ul className="space-y-1.5">
              {summary.missingInformation.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#7F1D1D]">
                  <span className="shrink-0 text-[#DC2626] font-bold mt-px">×</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended follow-up questions */}
        {summary.recommendedNextQuestions.length > 0 && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-2.5">
              Recommended Follow-up Questions
            </div>
            <ul className="space-y-1.5">
              {summary.recommendedNextQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#78350F]">
                  <span className="shrink-0 text-[#D97706] mt-px">→</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSummary(null)}>
            Revise Intake
          </Button>
          <button
            onClick={() => onComplete(summary, intakeToPrefill(answers, selectedClientId))}
            disabled={summary.missingInformation.length > 0}
            className="flex-1 h-9 bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
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
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#F0F0ED]">
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Client Intake</h2>
            <p className="text-[13px] text-[#9B9B95] mt-1">
              Before generating an execution plan, we gather and validate the project context. Select the client's level of clarity.
            </p>
          </div>
          <div className="px-6 py-5">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Client Level</div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    level: "lost" as ClientLevel,
                    label: "Lost Client",
                    desc: "Doesn't know what they need. We guide everything.",
                    icon: "?",
                    color: "group-hover:bg-[#DC2626]",
                    badge: "bg-[#FEE2E2] text-[#DC2626]",
                  },
                  {
                    level: "medium" as ClientLevel,
                    label: "Medium Client",
                    desc: "Has a rough idea. Needs structure and clarity.",
                    icon: "≈",
                    color: "group-hover:bg-[#D97706]",
                    badge: "bg-[#FEF3C7] text-[#D97706]",
                  },
                  {
                    level: "advanced" as ClientLevel,
                    label: "Advanced Client",
                    desc: "Already has a complete briefing. Ready to go.",
                    icon: "✓",
                    color: "group-hover:bg-[#16A34A]",
                    badge: "bg-[#DCFCE7] text-[#16A34A]",
                  },
                ] as const
              ).map(({ level, label, desc, icon, color, badge }) => (
                <button
                  key={level}
                  onClick={() => handleLevelSelect(level)}
                  className="flex flex-col items-start gap-3 p-4 rounded-[8px] border-2 border-[#E5E5E2] hover:border-[#5B5BD6] hover:bg-[#EEF0FF]/20 text-left transition-all group"
                >
                  <div className={`w-9 h-9 rounded-full bg-[#F0F0ED] ${color} flex items-center justify-center text-[14px] font-bold text-[#9B9B95] group-hover:text-white transition-all`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#1A1A1A]">{label}</div>
                    <div className="text-[11px] text-[#9B9B95] mt-0.5 leading-snug">{desc}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
                    {level === "lost" ? "Guided Interview" : level === "medium" ? "Interview / Free Brief" : "Existing Brief"}
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

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      {/* Left panel */}
      <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden h-fit">

        {/* Level chip + change */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED] bg-[#FAFAF9]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Level</span>
            <span className={`h-5 px-2 rounded-full text-[11px] font-medium ${
              clientLevel === "lost" ? "bg-[#FEE2E2] text-[#DC2626]" :
              clientLevel === "medium" ? "bg-[#FEF3C7] text-[#D97706]" :
              "bg-[#DCFCE7] text-[#16A34A]"
            }`}>
              {clientLevel === "lost" ? "Lost" : clientLevel === "medium" ? "Medium" : "Advanced"}
            </span>
          </div>
          <button onClick={() => setClientLevel(null)} className="text-[11px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors">
            Change
          </button>
        </div>

        {/* Mode tabs (shown when multiple modes are available) */}
        {availableModes.length > 1 && (
          <div className="flex border-b border-[#F0F0ED]">
            {availableModes.map((mode) => (
              <button
                key={mode}
                onClick={() => { setIntakeMode(mode); setCurrentBlockIndex(0); setSummary(null); setAnswers({}); setFreeText(""); }}
                className={`flex-1 py-2.5 text-[12px] font-medium border-b-2 -mb-[1px] transition-colors ${
                  intakeMode === mode
                    ? "border-[#5B5BD6] text-[#5B5BD6]"
                    : "border-transparent text-[#9B9B95] hover:text-[#6B6B65]"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          {/* Client selector */}
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Client *</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            >
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── GUIDED INTERVIEW ─────────────────────────────────────────────── */}
          {intakeMode === "guided" && (
            <div className="space-y-4">
              {/* Block progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">
                    Block {currentBlockIndex + 1} of {totalBlocks}
                  </span>
                  <span className="text-[11px] text-[#9B9B95]">{currentBlock.title}</span>
                </div>
                <div className="h-1 bg-[#F0F0ED] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5B5BD6] rounded-full transition-all duration-300"
                    style={{ width: `${((currentBlockIndex + 1) / totalBlocks) * 100}%` }}
                  />
                </div>
              </div>

              {/* Block header */}
              <div>
                <div className="text-[14px] font-semibold text-[#1A1A1A]">{currentBlock.title}</div>
                <div className="text-[12px] text-[#9B9B95] mt-0.5">{currentBlock.description}</div>
              </div>

              {/* Questions */}
              <div className="space-y-3.5">
                {currentBlock.questions.map((q) => (
                  <div key={q.id}>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1">
                      {q.question}
                      {q.required && <span className="text-[#DC2626] ml-0.5">*</span>}
                    </label>
                    {q.hint && <p className="text-[11px] text-[#9B9B95] mb-1.5">{q.hint}</p>}

                    {q.type === "textarea" && (
                      <textarea
                        value={(answers[q.id] as string) ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        rows={3}
                        className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                      />
                    )}
                    {q.type === "text" && (
                      <input
                        value={(answers[q.id] as string) ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                      />
                    )}
                    {q.type === "multiselect" && q.options && (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => {
                          const selected = ((answers[q.id] as string[] | undefined) ?? []).includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleMultiselect(q.id, opt)}
                              className={`h-7 px-3 rounded-full text-[12px] font-medium border transition-all ${
                                selected
                                  ? "bg-[#5B5BD6] border-[#5B5BD6] text-white"
                                  : "bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex gap-2 pt-1">
                {currentBlockIndex > 0 && (
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setCurrentBlockIndex((i) => i - 1)}>
                    Back
                  </Button>
                )}
                <button
                  onClick={handleNextBlock}
                  disabled={!selectedClientId || !canAdvanceBlock()}
                  className={`flex-1 h-9 text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    currentBlockIndex === totalBlocks - 1
                      ? "bg-[#1A1A1A] hover:bg-[#111111] text-white"
                      : "bg-[#5B5BD6] hover:bg-[#4A4AC0] text-white"
                  }`}
                >
                  {currentBlockIndex === totalBlocks - 1
                    ? "Generate Intake Summary"
                    : `Next: ${INTAKE_BLOCKS[currentBlockIndex + 1]?.title}`}
                </button>
              </div>
            </div>
          )}

          {/* ── FREE BRIEF ───────────────────────────────────────────────────── */}
          {intakeMode === "free_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Describe the project in your own words
                </label>
                <p className="text-[11px] text-[#9B9B95] mb-2">
                  Cover: who the client is, the goal, the audience, and the services needed.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={`e.g. "The client is a B2B SaaS company in HR. They want to generate 300 qualified leads in 6 weeks via LinkedIn Ads and Google Ads. Target: HR directors at mid-size companies. They have a brand kit and existing copy."`}
                  rows={9}
                  className="w-full px-3 py-2.5 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none leading-relaxed"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 20}
                className="w-full h-9 bg-[#5B5BD6] hover:bg-[#4A4AC0] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Parse & Generate Summary
              </button>
            </div>
          )}

          {/* ── EXISTING BRIEF ───────────────────────────────────────────────── */}
          {intakeMode === "existing_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Paste the client's existing brief
                </label>
                <p className="text-[11px] text-[#9B9B95] mb-2">
                  We'll extract key fields automatically. Review the summary before continuing.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Paste the full brief text here..."
                  rows={11}
                  className="w-full px-3 py-2.5 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none leading-relaxed font-mono"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 30}
                className="w-full h-9 bg-[#5B5BD6] hover:bg-[#4A4AC0] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Extract & Review
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="space-y-3">
        {/* Block progress map (guided only) */}
        {intakeMode === "guided" && (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#F0F0ED]">
              <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Interview Progress</span>
            </div>
            <div className="divide-y divide-[#F7F7F6]">
              {INTAKE_BLOCKS.map((block, i) => {
                const isActive = i === currentBlockIndex;
                const isDone = i < currentBlockIndex;
                const allRequired = block.questions.filter((q) => q.required).every((q) => {
                  const a = answers[q.id];
                  return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
                });
                return (
                  <div key={block.id} className={`flex items-center gap-3 px-5 py-3 ${isActive ? "bg-[#EEF0FF]/40" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      isDone && allRequired ? "bg-[#DCFCE7] text-[#16A34A]" :
                      isActive ? "bg-[#5B5BD6] text-white" :
                      "bg-[#F0F0ED] text-[#9B9B95]"
                    }`}>
                      {isDone && allRequired ? "✓" : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-medium ${isActive ? "text-[#5B5BD6]" : isDone ? "text-[#6B6B65]" : "text-[#9B9B95]"}`}>
                        {block.title}
                      </div>
                      <div className="text-[11px] text-[#9B9B95] truncate">{block.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hint card (free brief / existing brief) */}
        {(intakeMode === "free_brief" || intakeMode === "existing_brief") && (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">
              {intakeMode === "free_brief" ? "What to include" : "What we extract"}
            </div>
            <ul className="space-y-2">
              {[
                "Business context & industry",
                "Primary objective & KPIs",
                "Target audience",
                "Services required",
                "Channels & platforms",
                "Deadline or timeline",
                "Budget range",
                "Restrictions or constraints",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[#6B6B65]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D0D0CC] shrink-0" />
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
      <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] pt-0.5">
        {label}
      </span>
      {value ? (
        <p className="flex-1 text-[13px] text-[#1A1A1A] leading-snug">{value}</p>
      ) : (
        <p className="flex-1 text-[12px] text-[#C0C0BC] italic">Not provided</p>
      )}
    </div>
  );
}
