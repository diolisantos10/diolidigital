"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { AgentClientContext } from "@/lib/agency/workspace";
import Link from "next/link";

// ─── Form ────────────────────────────────────────────────────────────────────

interface SocialForm {
  brandName: string;
  brandSummary: string;
  toneOfVoice: string;
  visualStyle: string;
  objective: string;
  frequency: string;
  channels: string[];
  notes: string;
}

const TONE_OPTIONS = [
  "Profissional e autoritativo",
  "Caloroso e conversacional",
  "Ousado e provocativo",
  "Minimalista e refinado",
  "Descontraído e energético",
  "Inspiracional e aspiracional",
];

const VISUAL_OPTIONS = [
  "Limpo e minimalista",
  "Tipografia em destaque",
  "Editorial e fashion",
  "Escuro e cinematográfico",
  "Vibrante e colorido",
  "Orgânico e lifestyle",
];

const FREQUENCY_OPTIONS = ["3x por semana", "5x por semana", "Diário", "2x por semana", "1x por semana"];

const CHANNEL_OPTIONS = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X / Twitter", "YouTube"];

const EMPTY_FORM: SocialForm = {
  brandName: "",
  brandSummary: "",
  toneOfVoice: TONE_OPTIONS[0],
  visualStyle: VISUAL_OPTIONS[0],
  objective: "",
  frequency: FREQUENCY_OPTIONS[0],
  channels: ["Instagram"],
  notes: "",
};

// ─── Output types ────────────────────────────────────────────────────────────

interface BrandInterpretation {
  practicalUnderstanding: string;
  communicationStyle: string;
  toReinforce: string[];
  toAvoid: string[];
}

interface ContentPillar {
  name: string;
  description: string;
  percentage: number;
  example: string;
}

interface ChannelRec {
  channel: string;
  priority: "primary" | "secondary";
  rationale: string;
  formats: string[];
}

interface SocialStrategy {
  socialObjective: string;
  contentPositioning: string;
  contentPillars: ContentPillar[];
  channelRecommendations: ChannelRec[];
  postingFrequency: string;
  strategicRationale: string;
}

interface ContentIdea {
  title: string;
  pillar: string;
  format: string;
}

interface CalendarDay {
  day: string;
  active: boolean;
  format: string;
  theme: string;
  objective: string;
  channel: string;
  pillar: string;
}

interface Post {
  id: number;
  title: string;
  pillar: string;
  objective: string;
  format: string;
  caption: string;
  cta: string;
  creativeDirection: string;
  imagePrompt: string;
  designNotes: string;
}

interface StoryIdea {
  id: number;
  title: string;
  pillar: string;
  objective: string;
  slideCount: number;
  caption: string;
  cta: string;
  designNotes: string;
}

interface HandoffEntry {
  postId: number;
  title: string;
  format: string;
  visualDirection: string;
  prompt: string;
  keyCopy: string;
  designNotes: string;
}

interface DesignContract {
  postId: number;
  title: string;
  format: string;
  contentObjective: string;
  keyCopy: string;
  cta: string;
  creativeDirection: string;
  imagePrompt: string;
  designNotes: string;
}

interface SocialOutput {
  strategy: SocialStrategy;
  brandInterpretation: BrandInterpretation;
  contentIdeas: ContentIdea[];
  calendar: CalendarDay[];
  posts: Post[];
  stories: StoryIdea[];
  handoff: HandoffEntry[];
  contracts: DesignContract[];
}

// ─── Mock generator ──────────────────────────────────────────────────────────

function generateMockOutput(form: SocialForm, ctx: AgentClientContext | null): SocialOutput {
  const b     = form.brandName;
  const brain = ctx?.brandBrain;

  const tone      = (brain?.toneOfVoice   ?? form.toneOfVoice).toLowerCase();
  const visual    = (brain?.visualStyle   ?? form.visualStyle).toLowerCase();
  const audience  =  brain?.targetAudience ?? ctx?.targetAudience ?? "the brand's core audience";
  const visualPfx =  brain?.visualStyle   ? brain.visualStyle + ", " : "";
  const channels  = form.channels.length > 0 ? form.channels : ["Instagram"];
  const primaryCh = channels[0];

  const splitLines = (s: string | undefined, limit = 4): string[] | null =>
    s ? s.split(/[,\n·•]+/).map((r) => r.trim()).filter(Boolean).slice(0, limit) : null;

  // ── Brand interpretation ────────────────────────────────────────────────
  const brandInterpretation: BrandInterpretation = {
    practicalUnderstanding: brain?.businessSummary
      ? `${brain.businessSummary}${brain.positioning ? " " + brain.positioning : ""}`
      : `${b} operates in a space where audience trust and consistent presence are critical. The brand communicates expertise while remaining accessible to its target community.`,
    communicationStyle: brain?.toneOfVoice
      ? `${brain.toneOfVoice}. Every caption reflects the brand's point of view — curated and intentional.`
      : `${form.toneOfVoice} voice. Posts should feel curated and intentional — never reactive or generic.`,
    toReinforce: splitLines(brain?.brandRules) ?? [
      "Consistent visual identity across all formats",
      "Authoritative but approachable tone in captions",
      "Focus on value delivery over self-promotion",
      "Signature aesthetic in every creative asset",
    ],
    toAvoid: splitLines(brain?.thingsToAvoid) ?? [
      "Trend-chasing content that feels off-brand",
      "Overly casual or informal language",
      "Cluttered layouts that dilute the visual message",
      "Generic stock imagery without brand personality",
    ],
  };

  // ── Social strategy ─────────────────────────────────────────────────────
  const highlightProduct = brain?.productsToHighlight
    ? brain.productsToHighlight.split(/[,\n]/)[0].trim()
    : `${b}'s core offer`;

  const strategy: SocialStrategy = {
    socialObjective: form.objective
      ? `${form.objective} — specifically targeting ${audience} through consistent, brand-aligned content across ${channels.join(" and ")}.`
      : `Build brand authority and generate consistent inbound interest from ${audience} through ${form.frequency.toLowerCase()} content on ${primaryCh}.`,
    contentPositioning: brain?.positioning
      ? `${b} will be positioned on social as: ${brain.positioning}. Content avoids commoditisation — every post signals expertise, not just presence.`
      : `${b} will be positioned as a trusted authority in its space. Content avoids generic industry noise and instead creates a point of view that ${audience} can align with.`,
    contentPillars: [
      {
        name: "Brand World",
        description: brain?.businessSummary
          ? `Behind-the-scenes content revealing the world behind ${b}. ${brain.businessSummary.slice(0, 80)}. Builds intimacy and affinity.`
          : `Behind-the-scenes, process, and philosophy content that lets the audience inside ${b}'s world.`,
        percentage: 25,
        example: `"A day inside ${b}" — story-format walkthrough of how a project is built.`,
      },
      {
        name: "Value & Education",
        description: brain?.productsToHighlight
          ? `Practical, shareable posts highlighting ${brain.productsToHighlight.slice(0, 70)}. Positions the brand as reference, not just seller.`
          : "Practical, shareable posts that demonstrate expertise. Positions the brand as a reference — not just a seller.",
        percentage: 30,
        example: `"3 things most brands get wrong about [topic]" — carousel with actionable insight.`,
      },
      {
        name: "Social Proof",
        description: `Client results, testimonials, and transformation stories aimed at ${audience}. Converts curiosity into trust.`,
        percentage: 20,
        example: `"We helped [Client] achieve [outcome] in [timeframe]" — single image with result headline.`,
      },
      {
        name: "Conversion",
        description: brain?.productsToHighlight
          ? `Direct CTAs tied to ${highlightProduct}. Minimal copy, maximum clarity. Always one frictionless next step.`
          : `Direct calls to action tied to ${b}'s core offer. Minimal copy, maximum clarity.`,
        percentage: 25,
        example: `"Ready to grow? We're taking 3 new clients in Q2" — single image with DM CTA.`,
      },
    ],
    channelRecommendations: [
      {
        channel: primaryCh,
        priority: "primary",
        rationale: brain?.preferredChannels
          ? `${brain.preferredChannels.slice(0, 100)}`
          : `${primaryCh} is where ${audience} is most active and discovery-oriented for this category. Organic reach is still viable at this brand's scale.`,
        formats: primaryCh === "TikTok"
          ? ["Short-form video (15–30s)", "Talking head + text overlay", "Trending sound with brand message"]
          : primaryCh === "LinkedIn"
          ? ["Long-form carousel", "Text post + insight", "Case study post"]
          : ["Carousel", "Single image", "Reels", "Stories"],
      },
      ...(channels.length > 1 ? [{
        channel: channels[1],
        priority: "secondary" as const,
        rationale: `${channels[1]} is used as a distribution layer — repurpose primary content with channel-specific adaptation.`,
        formats: channels[1] === "TikTok"
          ? ["Repurposed Reels", "Behind-the-scenes clips"]
          : channels[1] === "LinkedIn"
          ? ["Thought leadership posts", "Case study carousels"]
          : ["Adapted Reels", "Cross-posted stories"],
      }] : []),
    ],
    postingFrequency: form.frequency,
    strategicRationale: brain?.strategicNotes
      ? `Strategic context: ${brain.strategicNotes.slice(0, 150)}. Content plan is designed to build sustained engagement momentum, not one-off spikes. Each post serves the funnel and the brand simultaneously.`
      : `This strategy is built for sustained momentum, not one-off spikes. The ${form.frequency.toLowerCase()} cadence is sustainable and sufficient to build algorithm favour while maintaining quality. Content is structured to serve the full funnel — awareness, trust, and conversion — without any single post having to do all three.`,
  };

  // ── Content ideas ───────────────────────────────────────────────────────
  const contentIdeas: ContentIdea[] = [
    { title: `"The ${b} Method" — how we approach every project`,            pillar: "Brand World",      format: "Carousel" },
    { title: `${brain?.productsToHighlight ? "Spotlight: " + highlightProduct : "3 mistakes brands make on social"}`, pillar: "Value & Education", format: "Carousel" },
    { title: `Behind the brief: a day inside ${b}`,                           pillar: "Brand World",      format: "Story" },
    { title: `Client result: how we helped [client] achieve [outcome]`,       pillar: "Social Proof",     format: "Single Image" },
    { title: "What makes [key topic] work? A quick breakdown",                pillar: "Value & Education", format: "Carousel" },
    { title: `Why we turned down a project last month`,                        pillar: "Brand World",      format: "Single Image" },
    { title: "Your questions answered — FAQ format",                           pillar: "Value & Education", format: "Carousel" },
    { title: `Ready to grow your brand? Here's how to start with ${b}`,       pillar: "Conversion",        format: "Single Image" },
  ];

  // ── Content calendar ────────────────────────────────────────────────────
  const freqNum = form.frequency === "Diário" ? 7
    : form.frequency === "5x por semana" ? 5
    : form.frequency === "3x por semana" ? 3
    : form.frequency === "2x por semana" ? 2
    : 1;
  const activeDays = ["Mon", "Wed", "Fri", "Sun", "Tue", "Thu", "Sat"].slice(0, freqNum);
  const dayMap: Record<string, { pillar: string; format: string; theme: string; objective: string }> = {
    Mon: { pillar: "Brand World",      format: "Carousel",     theme: "Process / behind-the-scenes",  objective: "Awareness & affinity" },
    Tue: { pillar: "Value & Education",format: "Carousel",     theme: "Educational / how-to",         objective: "Saves & shares" },
    Wed: { pillar: "Social Proof",     format: "Single Image", theme: "Client result",                objective: "Trust & credibility" },
    Thu: { pillar: "Value & Education",format: "Reel",         theme: "Quick tip / insight",          objective: "Reach & discovery" },
    Fri: { pillar: "Brand World",      format: "Story",        theme: "Team / culture",               objective: "Connection & intimacy" },
    Sat: { pillar: "Conversion",       format: "Single Image", theme: "Offer / CTA",                  objective: "Lead generation" },
    Sun: { pillar: "Social Proof",     format: "Carousel",     theme: "Case study",                   objective: "Consideration" },
  };

  const calendar: CalendarDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
    const isActive = activeDays.includes(day);
    const info = dayMap[day];
    return {
      day,
      active: isActive,
      format: isActive ? info.format : "—",
      theme: isActive ? info.theme : "—",
      objective: isActive ? info.objective : "—",
      channel: isActive ? primaryCh : "—",
      pillar: isActive ? info.pillar : "—",
    };
  });

  // ── Posts ───────────────────────────────────────────────────────────────
  const posts: Post[] = [
    {
      id: 1, title: `The ${b} Method`, pillar: "Brand World",
      objective: "Build brand authority and introduce the brand's unique process",
      format: "Carousel",
      caption: `There's a reason every project we take on starts the same way.\n\nNot with a brief. Not with a moodboard.\n\nWith a question: what does this brand actually need to say?\n\nSwipe to see how the ${b} method works from brief to delivery. 👉`,
      cta: "Save this post — you'll want to come back to it.",
      creativeDirection: `${tone} tone, ${visual} aesthetic. Slide 1: bold headline on brand-colour background. Slides 2–5: one idea per slide, clean typographic layout. Final slide: logo + CTA.`,
      imagePrompt: `${visualPfx}minimalist editorial layout, professional brand identity design process, clean typography on neutral background, high contrast, agency aesthetic, no people`,
      designNotes: `6-slide carousel. Consistent slide template. Typography-led. Brand colour on slide 1 and last slide.${brain?.visualStyle ? " Style ref: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 2,
      title: brain?.productsToHighlight ? `Spotlight: ${highlightProduct}` : "3 Mistakes Brands Make on Social",
      pillar: "Value & Education",
      objective: "Deliver value, increase saves and shares, attract ideal clients",
      format: "Carousel",
      caption: brain?.productsToHighlight
        ? `Not all offerings are equal.\n\nHere's what makes ${highlightProduct} the right choice — and why it matters for your brand.\n\nSwipe to find out. 👉`
        : `Most brands are losing on social — not because of bad content, but because of these 3 mistakes.\n\nAnd the worst part? They're easy to fix.\n\nSwipe to see if you're making any of them. 👉`,
      cta: "Tag a brand that needs to see this.",
      creativeDirection: `Clean educational layout. ${visual} visual style throughout. ${tone} tone in all copy.`,
      imagePrompt: `${visualPfx}clean infographic style, minimal illustration, bold numbers, educational content layout, neutral tones with brand accent colour`,
      designNotes: `5-slide carousel. Cover → Points → Summary/CTA.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 3, title: "Client Result Story", pillar: "Social Proof",
      objective: "Build social proof and convert warm leads",
      format: "Single Image",
      caption: `Six months ago, [Client] came to us with a brand that wasn't landing.\n\nToday, they're [outcome].\n\nWhat changed? Not the product. The way people perceived it.\n\nThat's what great social strategy does.`,
      cta: "DM us 'STRATEGY' to learn how we can do the same for your brand.",
      creativeDirection: `Result-focused visual. ${visual} treatment. Confident layout for ${audience}.`,
      imagePrompt: `${visualPfx}professional result showcase, clean layout, brand transformation visual, minimal design, confident typography`,
      designNotes: `Single image. Strong typographic headline with result number.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""} ${b} logo watermark bottom right.`,
    },
    {
      id: 4, title: `Start With ${b}`, pillar: "Conversion",
      objective: "Drive direct enquiries and convert ready buyers",
      format: "Single Image",
      caption: `If you're serious about growing your brand in the next 90 days —\n\nwe should talk.\n\n${b} is now accepting new clients.\n\nSpots are limited. The process starts with one message.`,
      cta: "DM us 'START' to begin.",
      creativeDirection: `High-confidence conversion creative. Minimal copy on image. ${visual} visual treatment. Clear, direct.${brain?.thingsToAvoid ? " Avoid: " + brain.thingsToAvoid.slice(0, 50) + "." : ""}`,
      imagePrompt: `${visualPfx}bold conversion creative, minimal text layout, strong brand colour, confident call to action design, premium aesthetic`,
      designNotes: `Single image. Maximum 2 lines of text on asset. Brand colour dominant. ${b} logo centred or top-left. White space is intentional.`,
    },
  ];

  // ── Stories ─────────────────────────────────────────────────────────────
  const stories: StoryIdea[] = [
    {
      id: 1, title: `A Day Inside ${b}`, pillar: "Brand World",
      objective: "Humanise the brand, increase DMs and replies",
      slideCount: 5,
      caption: `Ever wonder what a day inside ${b} actually looks like?\n\nWe pulled back the curtain. Swipe through to see.`,
      cta: "Reply with your biggest question about working with us.",
      designNotes: `3–5 story slides. Mix photo + text overlay. Keep copy minimal. ${visual} feel. Authentic — not over-produced.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 2, title: "Client Feedback Spotlight", pillar: "Social Proof",
      objective: "Convert followers who are already warm",
      slideCount: 3,
      caption: `We received this message last week.\n\nThis is why we do what we do.`,
      cta: "Swipe to see the full result — then DM us 'RESULTS' to see more.",
      designNotes: `3 slides: quote slide → context slide → CTA slide. Clean, high-contrast. Screenshot-style quote treatment.`,
    },
    {
      id: 3, title: "Quick Tip: 60-Second Insight", pillar: "Value & Education",
      objective: "Drive saves and forward-shares, build reach",
      slideCount: 4,
      caption: `One thing most brands forget to do on ${primaryCh}.\n\nAnd it takes 2 minutes to fix.`,
      cta: "Save this before you post today.",
      designNotes: `4 slides. Cover → Setup → Tip → CTA. Bold text on brand background. Ultra-readable.`,
    },
  ];

  // ── Handoff + Contracts ─────────────────────────────────────────────────
  const handoff: HandoffEntry[] = posts.map((p) => ({
    postId: p.id,
    title: p.title,
    format: p.format,
    visualDirection: p.creativeDirection,
    prompt: p.imagePrompt,
    keyCopy: p.caption.split("\n")[0],
    designNotes: p.designNotes,
  }));

  const contracts: DesignContract[] = posts.map((p) => ({
    postId: p.id,
    title: p.title,
    format: p.format,
    contentObjective: p.objective,
    keyCopy: p.caption.split("\n")[0],
    cta: p.cta,
    creativeDirection: p.creativeDirection,
    imagePrompt: p.imagePrompt,
    designNotes: p.designNotes,
  }));

  return { strategy, brandInterpretation, contentIdeas, calendar, posts, stories, handoff, contracts };
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function formatContractAsText(contracts: DesignContract[]): string {
  return contracts.map((c) => [
    `┌─ CONTRACT_${String(c.postId).padStart(2, "0")} — ${c.title}`,
    `│ format             ${c.format}`,
    `│ content_objective  ${c.contentObjective}`,
    `│ key_copy           ${c.keyCopy}`,
    `│ cta                ${c.cta}`,
    `│ creative_direction ${c.creativeDirection}`,
    `│ image_prompt       ${c.imagePrompt}`,
    `└─ design_notes      ${c.designNotes}`,
  ].join("\n")).join("\n\n");
}

function formatHandoffAsText(handoff: HandoffEntry[]): string {
  return handoff.map((h) => [
    `─── POST_${String(h.postId).padStart(2, "0")} — ${h.title}`,
    `format: ${h.format}`,
    `key_copy: ${h.keyCopy}`,
    `visual_direction: ${h.visualDirection}`,
    `prompt: ${h.prompt}`,
    `design_notes: ${h.designNotes}`,
  ].join("\n")).join("\n\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandBrainBadge({ ctx }: { ctx: AgentClientContext }) {
  const ready = ctx.brandBrainReadiness;
  const incomplete = ready < 5;
  return (
    <div className={`rounded-[8px] border px-3 py-2.5 ${incomplete ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F0FDF4] border-[#BBF7D0]"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-bold ${incomplete ? "text-[#D97706]" : "text-[#16A34A]"}`}>{incomplete ? "⚠" : "●"}</span>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">{incomplete ? "Brand Brain incompleto" : "Brand Brain ativo"}</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ready === 10 ? "bg-[#DCFCE7] text-[#16A34A]" : ready >= 5 ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#F0F0ED] text-[#9B9B95]"}`}>{ready}/10</span>
      </div>
      {incomplete
        ? <p className="text-[11px] text-[#D97706] leading-snug">Complete o Brand Brain no workspace do cliente para outputs totalmente específicos da marca.</p>
        : <div className="flex gap-3 flex-wrap mt-1">
            {ctx.brandBrain?.toneOfVoice    && <span className="text-[10px] text-[#6B6B65]">Tone: <span className="text-[#1A1A1A] font-medium">{ctx.brandBrain.toneOfVoice.slice(0,40)}</span></span>}
            {ctx.brandBrain?.targetAudience && <span className="text-[10px] text-[#6B6B65]">Audience: <span className="text-[#1A1A1A] font-medium">{ctx.brandBrain.targetAudience.slice(0,40)}</span></span>}
          </div>
      }
    </div>
  );
}

const STEPS = [
  "Lendo contexto da marca…",
  "Construindo estratégia social…",
  "Mapeando pilares de conteúdo…",
  "Gerando calendário de conteúdo…",
  "Escrevendo pacote de posts…",
  "Escrevendo ideias de stories…",
  "Preparando handoff de design…",
];

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "strategy" | "calendar" | "posts" | "stories" | "design";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialMediaAgentPage() {
  const [form, setForm]               = useState<SocialForm>(EMPTY_FORM);
  const [agentState, setAgentState]   = useState<AgentState>("idle");
  const [activeTab, setActiveTab]     = useState<OutputTab>("strategy");
  const [stepIndex, setStepIndex]     = useState(0);
  const [output, setOutput]           = useState<SocialOutput | null>(null);
  const [sourceProject, setSourceProject] = useState<{ projectId: string; projectName: string } | null>(null);
  const [savedToProject, setSavedToProject] = useState(false);
  const [copiedKey, setCopiedKey]     = useState<string | null>(null);

  const router = useRouter();
  const { projects, clients, setPendingDesignContract, pendingAgentInput, setPendingAgentInput } = useAgencyStore();
  const { createDeliverable } = useDbDeliverables();

  const linkedProject = sourceProject ? projects.find((p) => p.id === sourceProject.projectId) : null;
  const linkedClient  = linkedProject  ? clients.find((c) => c.id === linkedProject.clientId)  : null;
  const agentCtx: AgentClientContext | null = linkedClient ? getClientAgentContext(linkedClient) : null;

  // Execution gate: project linked but proposal not approved
  const proposalStatus = linkedProject?.proposal?.status;
  const proposalApproved = proposalStatus === "approved";
  const proposalBlocked = !!linkedProject && !proposalApproved;

  const isReady = form.brandName.trim() !== "" && form.objective.trim() !== "" && !!sourceProject && !proposalBlocked;

  // Pre-populate from pendingAgentInput (set by project detail page)
  useEffect(() => {
    if (pendingAgentInput) {
      const proj = projects.find((p) => p.id === pendingAgentInput.projectId);
      const cl   = proj ? clients.find((c) => c.id === proj.clientId) : null;
      const ctx  = cl ? getClientAgentContext(cl) : null;
      setForm({
        ...EMPTY_FORM,
        brandName:    pendingAgentInput.clientName,
        brandSummary: ctx?.brandBrain?.businessSummary ?? pendingAgentInput.goal,
        objective:    pendingAgentInput.goal,
        notes:        `Project: ${pendingAgentInput.projectName} (${pendingAgentInput.projectType})`,
      });
      setSourceProject({ projectId: pendingAgentInput.projectId, projectName: pendingAgentInput.projectName });
      setPendingAgentInput(null);
    }
  }, [pendingAgentInput, setPendingAgentInput, projects, clients]);

  async function handleRun() {
    if (!isReady) return;
    setAgentState("generating");
    setStepIndex(0);
    const capturedCtx = agentCtx;
    const capturedForm = form;

    // Advance through progress steps while the real API call runs in parallel
    const stepDelays = [800, 1200, 2000, 3500, 5500, 8000];
    stepDelays.forEach((ms, i) => {
      setTimeout(() => setStepIndex(i + 1), ms);
    });

    let finalResult: SocialOutput;
    try {
      const res = await fetch("/api/agents/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName:    capturedForm.brandName,
          brandSummary: capturedForm.brandSummary,
          toneOfVoice:  capturedForm.toneOfVoice,
          visualStyle:  capturedForm.visualStyle,
          objective:    capturedForm.objective,
          frequency:    capturedForm.frequency,
          channels:     capturedForm.channels,
          notes:        capturedForm.notes,
          brandBrain:   capturedCtx?.brandBrain ?? null,
        }),
      });

      const data = (await res.json()) as { ok: boolean; output?: SocialOutput; error?: string };

      if (!data.ok || !data.output) {
        console.warn("[social-agent] AI unavailable, using rule-based fallback:", data.error);
        finalResult = generateMockOutput(capturedForm, capturedCtx);
      } else {
        finalResult = data.output;
      }
    } catch (err) {
      console.warn("[social-agent] fetch error, falling back to rule-based:", err);
      finalResult = generateMockOutput(capturedForm, capturedCtx);
    }

    setOutput(finalResult);
    setAgentState("output_ready");
    setActiveTab("strategy");
    setStepIndex(6);
    if (sourceProject) {
      saveDeliverablesForProject(finalResult, sourceProject.projectId, capturedForm.brandName);
      setSavedToProject(true);
    }
  }

  function saveDeliverablesForProject(result: SocialOutput, projectId: string, brand: string) {
    void createDeliverable({ projectId, name: `Social Strategy — ${brand}`,                     type: "Content Strategy",  status: "in_review" });
    void createDeliverable({ projectId, name: `Content Calendar — ${brand}`,                    type: "Content Calendar",  status: "in_review" });
    void createDeliverable({ projectId, name: `Post Package — ${brand} (${result.posts.length} posts)`, type: "Posts",  status: "in_review" });
    void createDeliverable({ projectId, name: `Story Package — ${brand} (${result.stories.length} stories)`, type: "Stories", status: "in_review" });
    void createDeliverable({ projectId, name: `Design Requests — ${brand}`,                     type: "Design Requests",   status: "in_review" });
  }

  function handleSaveToProject() {
    if (!output || !sourceProject || savedToProject) return;
    saveDeliverablesForProject(output, sourceProject.projectId, form.brandName);
    setSavedToProject(true);
  }

  function handleSendToDesignAgent() {
    if (!output) return;
    setPendingDesignContract(formatContractAsText(output.contracts));
    router.push("/agency/design-agent");
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  }

  function handleExport() {
    if (!output) return;
    const lines = [
      `SOCIAL MEDIA PACKAGE — ${form.brandName.toUpperCase()}`,
      `Generated by Social Media Agent — Dioli Agency OS`,
      ``,
      `STRATEGY`,
      `Objective: ${output.strategy.socialObjective}`,
      `Positioning: ${output.strategy.contentPositioning}`,
      `Frequency: ${output.strategy.postingFrequency}`,
      `Rationale: ${output.strategy.strategicRationale}`,
      ``,
      `CONTENT PILLARS`,
      output.strategy.contentPillars.map((p) => `[${p.percentage}%] ${p.name}: ${p.description}`).join("\n"),
      ``,
      `POST PACKAGE`,
      output.posts.map((p) => `Post ${p.id} — ${p.title}\nCaption: ${p.caption}\nCTA: ${p.cta}\nDesign: ${p.designNotes}`).join("\n\n"),
      ``,
      `STORY IDEAS`,
      output.stories.map((s) => `Story ${s.id} — ${s.title} (${s.slideCount} slides)\nCaption: ${s.caption}\nCTA: ${s.cta}`).join("\n\n"),
      ``,
      `DESIGN HANDOFF`,
      formatHandoffAsText(output.handoff),
    ];
    downloadTextFile(`${form.brandName.toLowerCase().replace(/\s+/g, "-")}-social-package.txt`, lines.join("\n"));
  }

  function handleReset() {
    setAgentState("idle"); setOutput(null); setStepIndex(0);
    setForm(EMPTY_FORM); setSourceProject(null); setSavedToProject(false);
  }

  const TAB_LABELS: Record<OutputTab, string> = {
    strategy: "Estratégia",
    calendar: "Calendário",
    posts: "Posts",
    stories: "Stories",
    design: "Design",
  };

  // ── Blocked panel (proposal gate) ─────────────────────────────────────────
  const ProposalGatePanel = () => {
    const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
      draft:             { label: "Rascunho — não enviado", color: "text-[#6B6B65]", bg: "bg-[#F7F7F6]" },
      sent:              { label: "Aguardando aprovação do cliente", color: "text-[#070A1F]", bg: "bg-[#E6FBFA]" },
      rejected:          { label: "Rejeitado pelo cliente", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
      changes_requested: { label: "Alterações solicitadas", color: "text-[#D97706]", bg: "bg-[#FFFBEB]" },
    };
    const statusInfo = proposalStatus ? (statusLabels[proposalStatus] ?? statusLabels.draft) : statusLabels.draft;

    return (
      <div className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mb-5">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 7v5M11 15h.01" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="11" cy="11" r="9" stroke="#D97706" strokeWidth="1.5"/>
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-[#1A1A1A] mb-2">Execução bloqueada</p>
        <p className="text-[13px] text-[#6B6B65] max-w-sm leading-relaxed mb-5">
          O Agente de Redes Sociais só pode ser executado após a aprovação da proposta pelo cliente.
          Isso garante que todo o trabalho seja comercialmente autorizado antes da execução.
        </p>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full mb-5 ${statusInfo.bg}`}>
          <span className={`text-[12px] font-semibold ${statusInfo.color}`}>
            Status da proposta: {statusInfo.label}
          </span>
        </div>
        {linkedProject && (
          <Link
            href={`/agency/projects/${linkedProject.id}?tab=proposal`}
            className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
          >
            Ver Proposta →
          </Link>
        )}
        {proposalStatus === "draft" && (
          <p className="text-[11px] text-[#9B9B95] mt-3">Rascunho → Enviar ao cliente → Aguardar aprovação → Executar agente</p>
        )}
        {proposalStatus === "sent" && (
          <p className="text-[11px] text-[#9B9B95] mt-3">Compartilhe o link do portal do cliente para {linkedClient?.name} aprovar.</p>
        )}
        {proposalStatus === "rejected" && (
          <p className="text-[11px] text-[#9B9B95] mt-3">Revise e reenvie a proposta, depois aguarde a aprovação do cliente.</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Agente de Redes Sociais"
        subtitle="Estratégia alinhada à marca, calendário de conteúdo, posts e stories — prontos para revisão do cliente."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Top bar */}
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[11px] font-semibold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#070A1F]" />
            Departamento de Redes Sociais
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1</span>
          {sourceProject && (
            <Link href={`/agency/projects/${sourceProject.projectId}`} className="text-[12px] text-[#070A1F] hover:underline">
              ← {sourceProject.projectName}
            </Link>
          )}
          {agentState === "output_ready" && (
            <div className="ml-auto flex items-center gap-2">
              {sourceProject && (
                savedToProject ? (
                  <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Salvo — {sourceProject.projectName}
                  </span>
                ) : (
                  <button onClick={handleSaveToProject} className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#070A1F] text-white hover:bg-[#4A4AC5] transition-colors">
                    Salvar no projeto
                  </button>
                )
              )}
              <button onClick={handleExport} className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] bg-white text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors">
                Exportar Pacote
              </button>
            </div>
          )}
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[360px_1fr] gap-6 items-start">

          {/* LEFT — form */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Briefing</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Vincule um projeto e descreva o que precisa ser feito.</p>
            </div>
            <div className="px-5 py-5 space-y-4">

              {/* Project link */}
              {!sourceProject ? (
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                    Vincular ao projeto <span className="text-[#DC2626]">*</span>
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const p = projects.find((x) => x.id === e.target.value);
                      if (p) setSourceProject({ projectId: p.id, projectName: p.name });
                    }}
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
                  >
                    <option value="">— selecione um projeto —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between py-1.5 px-3 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${proposalApproved ? "bg-[#16A34A]" : proposalBlocked ? "bg-[#D97706]" : "bg-[#9B9B95]"}`} />
                    <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[160px]">{sourceProject.projectName}</span>
                  </div>
                  <button onClick={() => { setSourceProject(null); setSavedToProject(false); }} className="text-[11px] text-[#9B9B95] hover:text-[#DC2626] transition-colors">✕</button>
                </div>
              )}

              {/* Brand name */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Nome da marca <span className="text-[#DC2626]">*</span></label>
                <input
                  type="text"
                  value={form.brandName}
                  onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                  placeholder="e.g. Sushikasa"
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
                />
              </div>

              {/* Brand summary */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Resumo da marca</label>
                <textarea
                  value={form.brandSummary}
                  onChange={(e) => setForm({ ...form, brandSummary: e.target.value })}
                  placeholder="O que a marca faz, para quem é..."
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white resize-none"
                />
              </div>

              {/* Objective */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Objetivo principal <span className="text-[#DC2626]">*</span></label>
                <input
                  type="text"
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="ex.: Aumentar reconhecimento da marca e gerar contato direto"
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
                />
              </div>

              {/* Channels */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Plataformas</label>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const active = form.channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, channels: active
                            ? form.channels.filter((c) => c !== ch)
                            : [...form.channels, ch]
                          });
                        }}
                        className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-all ${
                          active ? "bg-[#1A1A1A] text-white" : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Frequency + Tone row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Frequência de posts</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full h-8 px-3 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white">
                    {FREQUENCY_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Tom de voz</label>
                  <select value={form.toneOfVoice} onChange={(e) => setForm({ ...form, toneOfVoice: e.target.value })}
                    className="w-full h-8 px-3 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white">
                    {TONE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Visual style */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Estilo visual</label>
                <select value={form.visualStyle} onChange={(e) => setForm({ ...form, visualStyle: e.target.value })}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white">
                  {VISUAL_OPTIONS.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Notas adicionais</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Campanhas, lançamentos, restrições..."
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white resize-none"
                />
              </div>

              {/* Brand Brain card */}
              {agentCtx && sourceProject && <BrandBrainBadge ctx={agentCtx} />}

              {/* Run / gate */}
              {agentState === "idle" && (
                proposalBlocked ? (
                  <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                      <path d="M7 4.5V7M7 9.5h.01" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round"/>
                      <circle cx="7" cy="7" r="6" stroke="#D97706" strokeWidth="1.2"/>
                    </svg>
                    <p className="text-[12px] text-[#D97706] leading-snug">A proposta deve ser aprovada antes de executar o agente.</p>
                  </div>
                ) : (
                  <button disabled={!isReady} onClick={handleRun}
                    className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#070A1F] text-white hover:bg-[#4A4AC5] active:bg-[#3939B4] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Executar Agente de Redes Sociais
                  </button>
                )
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#070A1F] text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-all">
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* RIGHT — output */}
          {agentState === "idle" ? (
            proposalBlocked ? <ProposalGatePanel /> : (
              <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-16 text-center">
                <div className="w-10 h-10 rounded-full bg-[#E6FBFA] flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="#070A1F" strokeWidth="1.3"/>
                    <path d="M7 10h6M10 7v6" stroke="#070A1F" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-medium text-[#1A1A1A]">Pronto para gerar</p>
                <p className="text-[13px] text-[#9B9B95] mt-1.5 max-w-xs mx-auto">
                  Vincule um projeto com proposta aprovada, preencha o briefing e execute o agente.
                </p>
              </div>
            )
          ) : agentState === "generating" ? (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[#E6FBFA] flex items-center justify-center mx-auto mb-5">
                <span className="w-5 h-5 border-2 border-[#070A1F] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-[#1A1A1A] mb-6">Construindo pacote de redes sociais…</p>
              <div className="max-w-[260px] mx-auto space-y-2.5">
                {STEPS.map((label, i) => (
                  <div key={label} className={`flex items-center gap-2.5 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-25"}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#070A1F]" : i === stepIndex ? "bg-[#E6FBFA] border border-[#070A1F]" : "bg-[#F0F0ED]"}`}>
                      {i < stepIndex && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4l1.8 1.8L6.5 2.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className={`text-[12px] text-left ${i <= stepIndex ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : output ? (
            <div className="space-y-4">

              {/* Saved banner */}
              {savedToProject && sourceProject && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#DCFCE7] border border-[#BBF7D0] rounded-[8px]">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-[12px] font-medium text-[#15803D]">
                      5 entregas salvas em <Link href={`/agency/projects/${sourceProject.projectId}`} className="underline">{sourceProject.projectName}</Link> — status: Em Revisão
                    </span>
                  </div>
                  <Link href={`/agency/clients/${linkedClient?.id}`} className="text-[11px] text-[#15803D] font-medium hover:opacity-70 transition-opacity">
                    Gerar link do portal →
                  </Link>
                </div>
              )}

              {/* Output tabs */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[9px] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {(["strategy", "calendar", "posts", "stories", "design"] as OutputTab[]).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex-1 h-7 rounded-[6px] text-[12px] font-medium transition-all ${
                      activeTab === tab ? "bg-[#1A1A1A] text-white" : "text-[#6B6B65] hover:text-[#1A1A1A] hover:bg-[#F0F0ED]"
                    }`}>
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {/* ── Tab: Strategy ─────────────────────────────────────────── */}
              {activeTab === "strategy" && (
                <div className="space-y-4">

                  {/* Social Strategy */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">1</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Estratégia de Redes Sociais</p>
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Objetivo Social</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.strategy.socialObjective}</p>
                        </div>
                        <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Posicionamento de Conteúdo</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.strategy.contentPositioning}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Frequência de Postagem</p>
                          <p className="text-[12px] font-semibold text-[#1A1A1A]">{output.strategy.postingFrequency}</p>
                        </div>
                        <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Justificativa Estratégica</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.strategy.strategicRationale}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content Pillars */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">2</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Pilares de Conteúdo</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-2 gap-3">
                      {output.strategy.contentPillars.map((pillar) => (
                        <div key={pillar.name} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[12px] font-semibold text-[#1A1A1A]">{pillar.name}</p>
                            <span className="px-2 py-0.5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold">{pillar.percentage}%</span>
                          </div>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-2">{pillar.description}</p>
                          <p className="text-[11px] text-[#9B9B95] italic">e.g. {pillar.example}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Channel Recommendations */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">3</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Recomendações de Canal</p>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {output.strategy.channelRecommendations.map((rec) => (
                        <div key={rec.channel} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-[12px] font-semibold text-[#1A1A1A]">{rec.channel}</p>
                            <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${rec.priority === "primary" ? "bg-[#E6FBFA] text-[#070A1F]" : "bg-[#F0F0ED] text-[#6B6B65]"}`}>
                              {rec.priority === "primary" ? "Primário" : "Secundário"}
                            </span>
                          </div>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-2">{rec.rationale}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {rec.formats.map((f) => (
                              <span key={f} className="h-5 px-2 rounded-full bg-white border border-[#E5E5E2] text-[10px] text-[#6B6B65]">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Brand interpretation */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">4</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Interpretação da Marca</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Entendimento</p>
                        <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.brandInterpretation.practicalUnderstanding}</p>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Estilo de Comunicação</p>
                        <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.brandInterpretation.communicationStyle}</p>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Reforçar</p>
                        <ul className="space-y-1">
                          {output.brandInterpretation.toReinforce.map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[12px] text-[#1A1A1A]">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#070A1F] shrink-0" />{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Evitar</p>
                        <ul className="space-y-1">
                          {output.brandInterpretation.toAvoid.map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[12px] text-[#6B6B65]">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Calendar ─────────────────────────────────────────── */}
              {activeTab === "calendar" && (
                <div className="space-y-4">
                  {/* Week grid */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">5</span>
                        <p className="text-[13px] font-semibold text-[#1A1A1A]">Calendário de Conteúdo Semanal</p>
                      </div>
                      <span className="text-[11px] text-[#9B9B95]">{output.calendar.filter((d) => d.active).length} dias ativos · {form.frequency}</span>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-7 gap-2">
                      {output.calendar.map((day) => (
                        <div key={day.day} className={`rounded-[8px] border overflow-hidden ${day.active ? "border-[#070A1F] bg-[#FAFAFE]" : "border-[#E5E5E2] bg-white"}`}>
                          <div className={`px-2 py-1.5 text-center border-b ${day.active ? "bg-[#E6FBFA] border-[#070A1F]" : "bg-[#F7F7F6] border-[#E5E5E2]"}`}>
                            <p className={`text-[11px] font-semibold ${day.active ? "text-[#070A1F]" : "text-[#6B6B65]"}`}>{day.day}</p>
                          </div>
                          <div className="p-2 min-h-[110px] space-y-1">
                            {day.active ? (
                              <>
                                <p className="text-[10px] font-semibold text-[#1A1A1A] leading-tight">{day.format}</p>
                                <p className="text-[10px] text-[#070A1F] font-medium">{day.pillar}</p>
                                <p className="text-[9.5px] text-[#6B6B65] leading-tight">{day.theme}</p>
                                <p className="text-[9px] text-[#9B9B95] leading-tight italic">{day.objective}</p>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-[3px] bg-[#F0F0ED] text-[9px] text-[#6B6B65]">{day.channel}</span>
                              </>
                            ) : (
                              <p className="text-[10px] text-[#C0C0BC]">Descanso</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Calendar detail list */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#E5E5E2]">
                      <p className="text-[12px] font-semibold text-[#1A1A1A]">Detalhe do Plano de Conteúdo</p>
                    </div>
                    <div className="divide-y divide-[#F0F0ED]">
                      {output.calendar.filter((d) => d.active).map((day) => (
                        <div key={day.day} className="grid grid-cols-[40px_90px_90px_1fr_90px_90px] items-center px-5 py-3 gap-3">
                          <span className="text-[11px] font-semibold text-[#070A1F]">{day.day}</span>
                          <span className="text-[11px] font-medium text-[#1A1A1A]">{day.format}</span>
                          <span className="text-[11px] text-[#6B6B65]">{day.pillar}</span>
                          <span className="text-[11px] text-[#1A1A1A]">{day.theme}</span>
                          <span className="text-[11px] text-[#9B9B95]">{day.objective}</span>
                          <span className="text-[11px] font-medium text-[#070A1F] text-right">{day.channel}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content ideas */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-bold flex items-center justify-center">6</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Banco de Ideias de Conteúdo</p>
                    </div>
                    <div className="divide-y divide-[#F0F0ED]">
                      {output.contentIdeas.map((idea, i) => (
                        <div key={idea.title} className="flex items-center gap-3 px-5 py-3">
                          <span className="text-[11px] font-semibold text-[#9B9B95] w-4 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{idea.title}</p>
                            <p className="text-[11px] text-[#9B9B95]">{idea.pillar}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium shrink-0">{idea.format}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Posts ────────────────────────────────────────────── */}
              {activeTab === "posts" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[12px] text-[#9B9B95]">{output.posts.length} ideias de post — prontas para revisão do cliente</p>
                    <button
                      onClick={() => handleCopy("all-captions", output.posts.map((p) => `POST ${p.id} — ${p.title}\n${p.caption}\n\nCTA: ${p.cta}`).join("\n\n---\n\n"))}
                      className="h-6 px-2.5 rounded-[5px] text-[11px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                      {copiedKey === "all-captions" ? "Copiado" : "Copiar Todas as Legendas"}
                    </button>
                  </div>
                  {output.posts.map((post) => (
                    <div key={post.id} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#9B9B95]">#{post.id}</span>
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{post.title}</p>
                          <span className="px-2 py-0.5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-medium">{post.pillar}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{post.format}</span>
                          <button onClick={() => handleCopy(`post-${post.id}`, `${post.title}\n\n${post.caption}\n\nCTA: ${post.cta}`)}
                            className="h-6 px-2 rounded-[5px] text-[10px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                            {copiedKey === `post-${post.id}` ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Objetivo</p>
                          <p className="text-[12px] text-[#1A1A1A]">{post.objective}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">CTA</p>
                          <p className="text-[12px] text-[#1A1A1A]">{post.cta}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Legenda</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed whitespace-pre-line">{post.caption}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Direção criativa</p>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed">{post.creativeDirection}</p>
                        </div>
                        <div className="col-span-2 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Notas de design</p>
                          <p className="text-[12px] text-[#6B6B65]">{post.designNotes}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Tab: Stories ──────────────────────────────────────────── */}
              {activeTab === "stories" && (
                <div className="space-y-3">
                  <div className="px-1">
                    <p className="text-[12px] text-[#9B9B95]">{output.stories.length} ideias de stories — formatos curtos e de alto engajamento</p>
                  </div>
                  {output.stories.map((story) => (
                    <div key={story.id} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#9B9B95]">Story {story.id}</span>
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{story.title}</p>
                          <span className="px-2 py-0.5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-medium">{story.pillar}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px]">{story.slideCount} slides</span>
                          <button onClick={() => handleCopy(`story-${story.id}`, `${story.title}\n\n${story.caption}\n\nCTA: ${story.cta}`)}
                            className="h-6 px-2 rounded-[5px] text-[10px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                            {copiedKey === `story-${story.id}` ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Objetivo</p>
                          <p className="text-[12px] text-[#1A1A1A]">{story.objective}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">CTA</p>
                          <p className="text-[12px] text-[#1A1A1A]">{story.cta}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Legenda / Roteiro</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed whitespace-pre-line">{story.caption}</p>
                        </div>
                        <div className="col-span-2 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Notas de design</p>
                          <p className="text-[12px] text-[#6B6B65]">{story.designNotes}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Tab: Design ───────────────────────────────────────────── */}
              {activeTab === "design" && (
                <div className="space-y-4">
                  {/* Handoff block */}
                  <div className="bg-[#111111] rounded-[10px] border border-[#2A2A2A] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#2A2A2A] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#070A1F]" />
                      <p className="text-[12px] font-semibold text-white">Handoff de Design</p>
                      <span className="text-[11px] text-[#6B6B65]">— pronto para o Agente de Design</span>
                      <button onClick={() => handleCopy("handoff-all", formatHandoffAsText(output.handoff))}
                        className="ml-auto h-6 px-2.5 rounded-[5px] text-[11px] border border-[#2A2A2A] text-[#9B9B95] hover:border-[#070A1F] hover:text-white transition-colors">
                        {copiedKey === "handoff-all" ? "Copiado" : "Copiar Tudo"}
                      </button>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {output.handoff.map((h) => (
                        <div key={h.postId} className="rounded-[8px] border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[11px] font-semibold text-[#070A1F] font-mono">POST_{String(h.postId).padStart(2, "0")}</span>
                            <span className="text-[11px] text-[#6B6B65]">{h.title}</span>
                            <button onClick={() => handleCopy(`h-${h.postId}`, `POST_${String(h.postId).padStart(2,"0")} — ${h.title}\nformat: ${h.format}\nkey_copy: ${h.keyCopy}\nvisual_direction: ${h.visualDirection}\nprompt: ${h.prompt}\ndesign_notes: ${h.designNotes}`)}
                              className="ml-auto h-5 px-2 rounded-[4px] text-[10px] border border-[#2A2A2A] text-[#6B6B65] hover:border-[#070A1F] hover:text-white transition-colors">
                              {copiedKey === `h-${h.postId}` ? "Copiado" : "Copiar"}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div><p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">format</p><p className="text-[11px] text-white">{h.format}</p></div>
                            <div><p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">key_copy</p><p className="text-[11px] text-white truncate">{h.keyCopy}</p></div>
                            <div className="col-span-2"><p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">visual_direction</p><p className="text-[11px] text-[#C0C0BC] leading-relaxed">{h.visualDirection}</p></div>
                            <div className="col-span-2"><p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">design_notes</p><p className="text-[11px] text-[#C0C0BC]">{h.designNotes}</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Send to Design Agent */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Enviar para Agente de Design</p>
                      <p className="text-[12px] text-[#9B9B95] mt-0.5">Passe o contrato de design completo para o Agente de Design produzir os assets.</p>
                    </div>
                    <button onClick={handleSendToDesignAgent}
                      className="h-8 px-4 rounded-[7px] text-[12px] font-medium bg-[#C2530A] text-white hover:bg-[#A8460A] transition-colors flex items-center gap-1.5 shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Enviar para Agente de Design
                    </button>
                  </div>

                  {/* Contracts */}
                  <div className="space-y-3">
                    {output.contracts.map((c) => (
                      <div key={c.postId} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                        <div className="px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E2] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[11px] font-semibold text-[#070A1F] bg-[#E6FBFA] px-2 py-0.5 rounded-[4px]">CONTRACT_{String(c.postId).padStart(2,"0")}</span>
                            <p className="text-[13px] font-semibold text-[#1A1A1A]">{c.title}</p>
                            <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px]">{c.format}</span>
                          </div>
                          <button onClick={() => handleCopy(`c-${c.postId}`, formatContractAsText([c]))}
                            className="h-6 px-2.5 rounded-[5px] text-[11px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                            {copiedKey === `c-${c.postId}` ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                        <div className="divide-y divide-[#F0F0ED]">
                          {([
                            { label: "content_objective", value: c.contentObjective },
                            { label: "key_copy",           value: c.keyCopy },
                            { label: "cta",                value: c.cta },
                            { label: "creative_direction", value: c.creativeDirection },
                            { label: "image_prompt",       value: c.imagePrompt, mono: true },
                            { label: "design_notes",       value: c.designNotes },
                          ] as { label: string; value: string; mono?: boolean }[]).map(({ label, value, mono }) => (
                            <div key={label} className="px-5 py-3 grid grid-cols-[160px_1fr] gap-4 items-start">
                              <p className="text-[11px] font-mono font-medium text-[#9B9B95] pt-px">{label}</p>
                              <p className={`text-[12px] leading-relaxed text-[#1A1A1A] ${mono ? "font-mono text-[#6B6B65]" : ""}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
