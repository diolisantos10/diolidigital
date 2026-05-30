"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { AgentClientContext } from "@/lib/agency/workspace";

const FREQUENCY_OPTIONS = [
  "3x per week",
  "5x per week",
  "Daily",
  "2x per week",
  "1x per week",
];

const TONE_OPTIONS = [
  "Professional & authoritative",
  "Warm & conversational",
  "Bold & provocative",
  "Minimal & refined",
  "Playful & energetic",
  "Inspirational & aspirational",
];

const VISUAL_OPTIONS = [
  "Clean & minimalist",
  "Bold typography-led",
  "Editorial & fashion",
  "Dark & cinematic",
  "Bright & vibrant",
  "Organic & lifestyle",
];

interface SocialForm {
  brandName: string;
  brandSummary: string;
  toneOfVoice: string;
  visualStyle: string;
  objective: string;
  frequency: string;
  notes: string;
}

const EMPTY_FORM: SocialForm = {
  brandName: "",
  brandSummary: "",
  toneOfVoice: TONE_OPTIONS[0],
  visualStyle: VISUAL_OPTIONS[0],
  objective: "",
  frequency: FREQUENCY_OPTIONS[0],
  notes: "",
};

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "brand" | "content" | "posts" | "handoff" | "contract";

// ─── Output types ────────────────────────────────────────────────────────────

interface BrandInterpretation {
  practicalUnderstanding: string;
  communicationStyle: string;
  toReinforce: string[];
  toAvoid: string[];
}

interface ObjectiveTranslation {
  contentDirection: string;
  primaryKPI: string;
  contentRatio: string;
}

interface Territory {
  name: string;
  description: string;
  frequency: string;
}

interface ContentIdea {
  title: string;
  territory: string;
  format: string;
}

interface ScheduleDay {
  day: string;
  territory: string;
  format: string;
  active: boolean;
}

interface Post {
  id: number;
  title: string;
  objective: string;
  format: string;
  caption: string;
  cta: string;
  creativeDirection: string;
  imagePrompt: string;
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

interface HandoffEntry {
  postId: number;
  title: string;
  format: string;
  visualDirection: string;
  prompt: string;
  keyCopy: string;
  designNotes: string;
}

interface SocialOutput {
  brandInterpretation: BrandInterpretation;
  objectiveTranslation: ObjectiveTranslation;
  territories: Territory[];
  contentIdeas: ContentIdea[];
  schedule: ScheduleDay[];
  posts: Post[];
  handoff: HandoffEntry[];
  contracts: DesignContract[];
}

// ─── Mock generator ──────────────────────────────────────────────────────────

function generateMockOutput(form: SocialForm, ctx: AgentClientContext | null): SocialOutput {
  const b     = form.brandName;
  const brain = ctx?.brandBrain;

  // Brand Brain values take precedence over form selects
  const toneLabel   = (brain?.toneOfVoice   ?? form.toneOfVoice).toLowerCase();
  const visualLabel = (brain?.visualStyle    ?? form.visualStyle).toLowerCase();
  const audience    =  brain?.targetAudience ?? ctx?.targetAudience ?? "the brand's core audience";
  const visualPfx   =  brain?.visualStyle    ? brain.visualStyle + ", " : "";

  // Split free-text Brain fields into list items
  const splitLines = (s: string | undefined, limit = 4): string[] | null =>
    s ? s.split(/[,\n·•]+/).map((r) => r.trim()).filter(Boolean).slice(0, limit) : null;

  const brandInterpretation: BrandInterpretation = {
    practicalUnderstanding: brain?.businessSummary
      ? `${brain.businessSummary}${brain.positioning ? " " + brain.positioning : ""}`
      : `${b} operates in a space where audience trust and consistent visual presence are critical. The brand communicates expertise while remaining accessible to its target community.`,
    communicationStyle: brain?.toneOfVoice
      ? `${brain.toneOfVoice}. Posts should feel curated and intentional — every caption reflects the brand's point of view.`
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

  const objectiveTranslation: ObjectiveTranslation = {
    contentDirection: `Content should directly serve the goal of "${form.objective}". Each post must earn its place by moving ${audience} closer to action — awareness, trust, or enquiry.`,
    primaryKPI: "Reach growth + DM enquiry rate + saved posts per week",
    contentRatio: "50% value / educational — 30% brand story — 20% conversion / CTA",
  };

  const territories: Territory[] = [
    {
      name: "Brand World",
      description: brain?.businessSummary
        ? `Behind-the-scenes content that reveals the world behind ${b}. ${brain.businessSummary.slice(0, 100)}. Builds intimacy and brand affinity.`
        : `Behind-the-scenes, process, and philosophy content that lets the audience inside ${b}'s world. Builds intimacy and brand affinity.`,
      frequency: "2x per week",
    },
    {
      name: "Value & Education",
      description: brain?.productsToHighlight
        ? `Practical, shareable posts focused on ${brain.productsToHighlight.slice(0, 80)}. Positions the brand as the reference — not just a seller.`
        : "Practical, shareable posts that demonstrate expertise. Positions the brand as a reference — not just a seller.",
      frequency: "2x per week",
    },
    {
      name: "Social Proof",
      description: `Client results, testimonials, and transformation stories targeted at ${audience}. Converts curiosity into trust and trust into action.`,
      frequency: "1x per week",
    },
    {
      name: "Conversion",
      description: brain?.productsToHighlight
        ? `Direct calls to action tied to ${brain.productsToHighlight.split(/[,\n]/)[0].trim()}. Minimal copy, maximum clarity. Always with a frictionless next step.`
        : `Direct calls to action tied to ${b}'s core offer. Minimal copy, maximum clarity. Always with a frictionless next step.`,
      frequency: "1x per week",
    },
  ];

  const highlightTitle = brain?.productsToHighlight
    ? `Spotlight: ${brain.productsToHighlight.split(/[,\n]/)[0].trim()}`
    : "3 mistakes brands make on social media (and how to fix them)";

  const contentIdeas: ContentIdea[] = [
    { title: `"The ${b} Method" — how we approach every project`,   territory: "Brand World",      format: "Carousel"     },
    { title: highlightTitle,                                          territory: "Value & Education", format: "Carousel"     },
    { title: `Behind the brief: a day inside ${b}`,                  territory: "Brand World",      format: "Story"        },
    { title: `Client result: how we helped [client] achieve [outcome]`, territory: "Social Proof",  format: "Single Image" },
    { title: "What makes a great visual identity? A quick breakdown", territory: "Value & Education", format: "Carousel"    },
    { title: `Why we turned down a project last month`,              territory: "Brand World",      format: "Single Image" },
    { title: "Your questions answered — office hours recap",         territory: "Value & Education", format: "Story"       },
    { title: `Ready to grow your brand? Here's how to start with ${b}`, territory: "Conversion",   format: "Single Image" },
  ];

  const schedule: ScheduleDay[] = [
    { day: "Mon", territory: "Brand World",  format: "Carousel",     active: true  },
    { day: "Tue", territory: "—",            format: "—",            active: false },
    { day: "Wed", territory: "Value",        format: "Carousel",     active: true  },
    { day: "Thu", territory: "Social Proof", format: "Single Image", active: true  },
    { day: "Fri", territory: "Brand World",  format: "Story",        active: true  },
    { day: "Sat", territory: "—",            format: "—",            active: false },
    { day: "Sun", territory: "Conversion",   format: "Single Image", active: true  },
  ];

  const posts: Post[] = [
    {
      id: 1,
      title: `The ${b} Method`,
      objective: "Build brand authority and introduce the brand's unique process",
      format: "Carousel",
      caption: `There's a reason every project we take on starts the same way.\n\nNot with a brief. Not with a moodboard.\n\nWith a question: what does this brand actually need to say?\n\nSwipe to see how the ${b} method works from brief to delivery. 👉`,
      cta: "Save this post — you'll want to come back to it.",
      creativeDirection: `${toneLabel} tone, ${visualLabel} aesthetic. Slide 1: bold headline on brand-colour background. Slides 2–5: one idea per slide, clean typographic layout. Final slide: logo + CTA.`,
      imagePrompt: `${visualPfx}minimalist editorial layout, professional brand identity design process, clean typography on neutral background, high contrast, agency aesthetic, no people`,
      designNotes: `6-slide carousel. Consistent slide template. Typography-led. Brand colour on slide 1 and last slide.${brain?.visualStyle ? " Style ref: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 2,
      title: highlightTitle,
      objective: "Deliver value, increase saves and shares, attract ideal clients",
      format: "Carousel",
      caption: brain?.productsToHighlight
        ? `Not all products are created equal.\n\nHere's what makes ${brain.productsToHighlight.split(/[,\n]/)[0].trim()} the right choice — and why it matters for your brand.\n\nSwipe to find out. 👉`
        : `Most brands are losing on social — not because of bad content, but because of these 3 mistakes.\n\nAnd the worst part? They're easy to fix.\n\nSwipe to see if you're making any of them. 👉`,
      cta: "Tag a brand that needs to see this.",
      creativeDirection: `Clean educational layout. ${visualLabel} visual style throughout. ${toneLabel} tone in all copy.`,
      imagePrompt: `${visualPfx}clean infographic style, minimal illustration, bold numbers, educational content layout, neutral tones with brand accent colour`,
      designNotes: `5-slide carousel. Cover → Points → Summary/CTA.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 3,
      title: "Client Result Story",
      objective: "Build social proof and convert warm leads",
      format: "Single Image",
      caption: `Six months ago, [Client] came to us with a brand that wasn't landing.\n\nToday, they're [outcome].\n\nWhat changed? Not the product. The way people perceived it.\n\nThat's what great social strategy does.`,
      cta: "DM us 'STRATEGY' to learn how we can do the same for your brand.",
      creativeDirection: `Result-focused visual. ${visualLabel} treatment. Confident layout for ${audience}.`,
      imagePrompt: `${visualPfx}professional result showcase, before and after concept, clean layout, brand transformation visual, minimal design, confident typography`,
      designNotes: `Single image. Strong typographic headline with result number.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""} ${b} logo watermark bottom right.`,
    },
    {
      id: 4,
      title: `A Day Inside ${b}`,
      objective: "Humanise the brand and build audience connection",
      format: "Story",
      caption: `Ever wonder what a day inside ${b} looks like?\n\nWe pulled back the curtain. Swipe through to see.`,
      cta: "Reply with your biggest question about working with us.",
      creativeDirection: `Raw, behind-the-scenes feel within ${visualLabel} visual language. Authentic but intentional. Tone: ${toneLabel}.`,
      imagePrompt: `${visualPfx}behind the scenes creative workspace, natural lighting, process shots, authentic atmosphere, brand colours subtle in environment`,
      designNotes: `3–5 story slides. Mix photo + text overlay. Keep text minimal.${brain?.visualStyle ? " Style: " + brain.visualStyle + "." : ""}`,
    },
    {
      id: 5,
      title: "What Makes a Great Visual Identity",
      objective: "Educate the audience and position the brand as an expert",
      format: "Carousel",
      caption: `A logo is not a brand.\n\nA colour palette is not a brand.\n\nHere's what actually makes a visual identity work — and how to know if yours does. 👇`,
      cta: "Save this before your next brand refresh.",
      creativeDirection: `Educational carousel with clear hierarchy. ${visualLabel} visual style. Each slide has a concept title + 2-line explanation. Ends with ${b} sign-off. ${toneLabel} throughout.`,
      imagePrompt: `${visualPfx}educational design content, visual identity elements layout, typography system, colour palette display, clean minimal aesthetic, brand design concept`,
      designNotes: `6 slides. Cover + 4 concept slides + CTA slide. Typographic-led.${brain?.brandRules ? " Brand rules: " + brain.brandRules.slice(0, 60) + "…" : ""}`,
    },
    {
      id: 6,
      title: `Start With ${b}`,
      objective: "Drive direct enquiries and convert ready buyers",
      format: "Single Image",
      caption: `If you're serious about growing your brand in the next 90 days —\n\nwe should talk.\n\n${b} is now accepting new clients for Q2.\n\nSpots are limited. The process starts with one message.`,
      cta: "DM us 'START' to begin.",
      creativeDirection: `High-confidence conversion creative. Minimal copy on image. ${visualLabel} visual treatment. Clear, direct.${brain?.thingsToAvoid ? " Avoid: " + brain.thingsToAvoid.slice(0, 50) + "." : ""}`,
      imagePrompt: `${visualPfx}bold conversion creative, minimal text layout, strong brand colour, confident call to action design, premium aesthetic, clean composition`,
      designNotes: `Single image. Maximum 2 lines of text on asset. Brand colour dominant. ${b} logo centred or top-left. White space is intentional.`,
    },
  ];

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

  return { brandInterpretation, objectiveTranslation, territories, contentIdeas, schedule, posts, handoff, contracts };
}


// ─── Export helpers ───────────────────────────────────────────────────────────

function formatPostAsText(post: Post): string {
  return [
    `POST ${post.id} — ${post.title}`,
    `Format: ${post.format}`,
    `Objective: ${post.objective}`,
    ``,
    `Caption:`,
    post.caption,
    ``,
    `CTA: ${post.cta}`,
    ``,
    `Creative direction: ${post.creativeDirection}`,
    ``,
    `AI image prompt: ${post.imagePrompt}`,
    ``,
    `Design notes: ${post.designNotes}`,
  ].join("\n");
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

function buildExportText(form: SocialForm, output: SocialOutput): string {
  const lines: string[] = [
    `SOCIAL MEDIA PACKAGE — ${form.brandName.toUpperCase()}`,
    `Generated by Social Media Agent`,
    `Objective: ${form.objective}`,
    `Frequency: ${form.frequency}`,
    `Tone: ${form.toneOfVoice}`,
    `Visual style: ${form.visualStyle}`,
    ``,
    `${"=".repeat(60)}`,
    `POST PACKAGE`,
    `${"=".repeat(60)}`,
    ``,
    ...output.posts.map((p) => formatPostAsText(p) + "\n\n" + "-".repeat(60)),
    ``,
    `${"=".repeat(60)}`,
    `DESIGN HANDOFF`,
    `${"=".repeat(60)}`,
    ``,
    formatHandoffAsText(output.handoff),
    ``,
    `${"=".repeat(60)}`,
    `DESIGN AGENT INPUT CONTRACT`,
    `${"=".repeat(60)}`,
    ``,
    formatContractAsText(output.contracts),
  ];
  return lines.join("\n");
}

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

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Brand Brain context card ────────────────────────────────────────────────

function BrandBrainContextCard({ ctx }: { ctx: AgentClientContext }) {
  const ready      = ctx.brandBrainReadiness;
  const incomplete = ready < 5;
  return (
    <div className={`rounded-[8px] border px-3 py-3 ${incomplete ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F0FDF4] border-[#BBF7D0]"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-bold ${incomplete ? "text-[#D97706]" : "text-[#16A34A]"}`}>{incomplete ? "⚠" : "●"}</span>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">{incomplete ? "Brand Brain incomplete" : "Using Brand Brain"}</span>
          <span className="text-[10px] text-[#9B9B95]">· {ctx.clientName}</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ready === 10 ? "bg-[#DCFCE7] text-[#16A34A]" : ready >= 5 ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#F0F0ED] text-[#9B9B95]"}`}>{ready}/10</span>
      </div>
      {incomplete ? (
        <p className="text-[11px] text-[#D97706] leading-snug">Outputs will use generic brand signals. Complete Brand Brain in the client workspace for fully brand-specific results.</p>
      ) : (
        <div className="space-y-1 mt-1">
          {ctx.brandBrain?.toneOfVoice    && <div className="flex gap-2"><span className="text-[10px] text-[#9B9B95] w-14 shrink-0">Tone</span><span className="text-[11px] text-[#1A1A1A] truncate">{ctx.brandBrain.toneOfVoice}</span></div>}
          {ctx.brandBrain?.targetAudience && <div className="flex gap-2"><span className="text-[10px] text-[#9B9B95] w-14 shrink-0">Audience</span><span className="text-[11px] text-[#1A1A1A] truncate">{ctx.brandBrain.targetAudience}</span></div>}
          {ctx.brandBrain?.visualStyle    && <div className="flex gap-2"><span className="text-[10px] text-[#9B9B95] w-14 shrink-0">Visual</span><span className="text-[11px] text-[#1A1A1A] truncate">{ctx.brandBrain.visualStyle}</span></div>}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  "Reading brand inputs…",
  "Interpreting brand voice…",
  "Mapping content territories…",
  "Generating post ideas…",
  "Building post package…",
  "Preparing design handoff…",
];

export default function SocialMediaAgentPage() {
  const [form, setForm] = useState<SocialForm>(EMPTY_FORM);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("brand");
  const [stepIndex, setStepIndex] = useState(0);
  const [output, setOutput] = useState<SocialOutput | null>(null);
  const [sourceProject, setSourceProject] = useState<{ projectId: string; projectName: string } | null>(null);
  const [savedToProject, setSavedToProject] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const router = useRouter();
  const setPendingDesignContract = useAgencyStore((s) => s.setPendingDesignContract);
  const pendingAgentInput = useAgencyStore((s) => s.pendingAgentInput);
  const setPendingAgentInput = useAgencyStore((s) => s.setPendingAgentInput);
  const addDeliverable = useAgencyStore((s) => s.addDeliverable);
  const projects = useAgencyStore((s) => s.projects);
  const clients  = useAgencyStore((s) => s.clients);

  const linkedProject = sourceProject ? projects.find((p) => p.id === sourceProject.projectId) : null;
  const linkedClient  = linkedProject  ? clients.find((c) => c.id === linkedProject.clientId)  : null;
  const agentCtx: AgentClientContext | null = linkedClient ? getClientAgentContext(linkedClient) : null;
  const isProposalPending = linkedProject?.stage === "proposal_sent";
  const isReady = form.brandName.trim() !== "" && form.objective.trim() !== "" && !!sourceProject && !isProposalPending;

  useEffect(() => {
    if (pendingAgentInput) {
      // Try to pre-populate from Brand Brain if client data is available
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

  function handleSendToDesignAgent() {
    if (!output) return;
    setPendingDesignContract(formatContractAsText(output.contracts));
    router.push("/agency/design-agent");
  }

  function handleSaveToProject() {
    if (!output || !sourceProject) return;
    addDeliverable({
      projectId: sourceProject.projectId,
      name: `${form.brandName} — Social Media Package`,
      type: "Social Media Post",
      status: "in_review",
      version: 1,
    });
    addDeliverable({
      projectId: sourceProject.projectId,
      name: `${form.brandName} — Content Strategy`,
      type: "Social Media",
      status: "in_review",
      version: 1,
    });
    setSavedToProject(true);
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  }

  function handleExport() {
    if (!output) return;
    const content = buildExportText(form, output);
    const slug = form.brandName.toLowerCase().replace(/\s+/g, "-");
    downloadTextFile(`${slug}-social-media-package.txt`, content);
  }

  function handleRun() {
    setAgentState("generating");
    setStepIndex(0);
    const capturedCtx = agentCtx;

    let step = 0;
    const delays = [600, 700, 600, 700, 600, 500];
    let elapsed = 0;

    delays.forEach((delay, i) => {
      elapsed += delay;
      setTimeout(() => {
        setStepIndex(i);
        if (i === delays.length - 1) {
          setTimeout(() => {
            const generatedOutput = generateMockOutput(form, capturedCtx);
            setOutput(generatedOutput);
            setAgentState("output_ready");
            setActiveTab("brand");

            // Auto-save deliverables when a project is linked
            if (sourceProject) {
              generatedOutput.posts.forEach((post, idx) => {
                addDeliverable({
                  projectId: sourceProject.projectId,
                  name: `Post ${String(idx + 1).padStart(2, "0")} — ${post.title}`,
                  type: "Social Media Post",
                  status: "in_review",
                  version: 1,
                });
              });
              addDeliverable({
                projectId: sourceProject.projectId,
                name: `${form.brandName} — Content Strategy`,
                type: "Social Media",
                status: "in_review",
                version: 1,
              });
              setSavedToProject(true);
            }
          }, 400);
        }
      }, elapsed);
    });

    void step;
  }

  function handleReset() {
    setAgentState("idle");
    setForm(EMPTY_FORM);
    setOutput(null);
    setStepIndex(0);
    setSourceProject(null);
    setSavedToProject(false);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Social Media Agent"
        subtitle="Transform brand inputs into a complete social media execution package."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Top label */}
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-semibold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6] inline-block" />
            Production Agent
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1.0 — Mock Mode</span>
          {sourceProject && (
            <a
              href={`/agency/projects/${sourceProject.projectId}`}
              className="text-[12px] text-[#5B5BD6] hover:underline"
            >
              ← {sourceProject.projectName}
            </a>
          )}
          {agentState === "output_ready" && (
            <div className="ml-auto flex items-center gap-2">
              {sourceProject && (
                savedToProject ? (
                  <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Saved to {sourceProject.projectName}
                  </span>
                ) : (
                  <button
                    onClick={handleSaveToProject}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#5B5BD6] text-white hover:bg-[#4A4AC5] transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M5.5 1v6M2.5 4.5L5.5 7.5 8.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M1 8.5v1a.5.5 0 00.5.5h8a.5.5 0 00.5-.5v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    Save to {sourceProject.projectName}
                  </button>
                )
              )}
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] bg-white text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1v7M3.5 5.5L6.5 8.5 9.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Export Package
              </button>
            </div>
          )}
        </div>

        {/* Main 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">

          {/* LEFT — Input form */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Brand Brief</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Describe the brand and what you need.</p>
            </div>
            <div className="px-5 py-5 space-y-4">

              {/* Project link */}
              {!sourceProject && (
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                    Link to project <span className="text-[#DC2626]">*</span>
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const p = projects.find((x) => x.id === e.target.value);
                      if (p) setSourceProject({ projectId: p.id, projectName: p.name });
                    }}
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                  >
                    <option value="">— select a project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Brand name */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Brand name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={form.brandName}
                  onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                  placeholder="e.g. Santioh Studio"
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                />
              </div>

              {/* Brand summary */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Brand summary
                </label>
                <textarea
                  value={form.brandSummary}
                  onChange={(e) => setForm({ ...form, brandSummary: e.target.value })}
                  placeholder="Brief description of the brand, what it does, who it's for..."
                  rows={3}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* Tone of voice */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Tone of voice
                </label>
                <select
                  value={form.toneOfVoice}
                  onChange={(e) => setForm({ ...form, toneOfVoice: e.target.value })}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                >
                  {TONE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Visual style */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Visual style
                </label>
                <select
                  value={form.visualStyle}
                  onChange={(e) => setForm({ ...form, visualStyle: e.target.value })}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                >
                  {VISUAL_OPTIONS.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>

              {/* Main objective */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Main objective <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="e.g. Grow brand awareness and drive DM enquiries"
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                />
              </div>

              {/* Content frequency */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Content frequency
                </label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
                >
                  {FREQUENCY_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>

              {/* Extra notes */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Extra notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Campaigns, events, launches, constraints..."
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* Brand Brain context */}
              {agentCtx && sourceProject && (
                <BrandBrainContextCard ctx={agentCtx} />
              )}

              {/* Proposal gate */}
              {isProposalPending && (
                <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2.5">
                  <span className="text-[#D97706] text-[13px] shrink-0">⚠</span>
                  <p className="text-[12px] text-[#D97706] leading-snug">
                    Awaiting client approval — the project proposal must be approved before execution can begin.
                  </p>
                </div>
              )}

              {/* Submit / Reset button */}
              {agentState === "idle" && (
                <button
                  disabled={!isReady}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#5B5BD6] text-white transition-all
                    hover:bg-[#4A4AC5] active:bg-[#3939B4]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Generate Social Media Package
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#5B5BD6] text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating…
                </button>
              )}
              {agentState === "output_ready" && (
                <button
                  onClick={handleReset}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-all"
                >
                  Reset
                </button>
              )}

            </div>
          </div>

          {/* RIGHT — Output area */}
          {agentState === "idle" ? (
            <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full bg-[#F0F0ED] flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="3" width="5" height="5" rx="1" stroke="#9B9B95" strokeWidth="1.3"/>
                  <rect x="12" y="3" width="5" height="5" rx="1" stroke="#9B9B95" strokeWidth="1.3"/>
                  <rect x="3" y="12" width="5" height="5" rx="1" stroke="#9B9B95" strokeWidth="1.3"/>
                  <rect x="12" y="12" width="5" height="5" rx="1" stroke="#9B9B95" strokeWidth="1.3"/>
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#1A1A1A]">Awaiting brief input</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5 max-w-xs mx-auto">
                Fill in the brand brief and run the agent to generate your complete social media package.
              </p>
            </div>
          ) : agentState === "generating" ? (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[#EEF0FF] flex items-center justify-center mx-auto mb-5">
                <span className="w-5 h-5 border-2 border-[#5B5BD6] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-[#1A1A1A] mb-6">Generating your package…</p>
              <div className="max-w-[240px] mx-auto space-y-2.5">
                {STEPS.map((label, i) => (
                  <div key={label} className={`flex items-center gap-2.5 transition-opacity duration-300 ${i <= stepIndex ? "opacity-100" : "opacity-25"}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#5B5BD6]" : i === stepIndex ? "bg-[#EEF0FF] border border-[#5B5BD6]" : "bg-[#F0F0ED]"}`}>
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
          ) : output !== null ? (
            <div className="space-y-4">

              {/* Output tabs */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[9px] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {(["brand", "content", "posts", "handoff", "contract"] as OutputTab[]).map((tab) => {
                  const labels: Record<OutputTab, string> = {
                    brand: "Brand Brief",
                    content: "Content Map",
                    posts: "Post Package",
                    handoff: "Design Handoff",
                    contract: "Agent Contract",
                  };
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 h-7 rounded-[6px] text-[12px] font-medium transition-all ${
                        activeTab === tab
                          ? "bg-[#1A1A1A] text-white"
                          : "text-[#6B6B65] hover:text-[#1A1A1A] hover:bg-[#F0F0ED]"
                      }`}
                    >
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>

              {/* Tab: Brand Brief */}
              {activeTab === "brand" && (
                <div className="space-y-4">

                  {/* Section 1 — Brand Interpretation */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">1</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Brand Interpretation</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Practical understanding</p>
                        <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.brandInterpretation.practicalUnderstanding}</p>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Communication style</p>
                        <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{output.brandInterpretation.communicationStyle}</p>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">What to reinforce</p>
                        <ul className="space-y-1">
                          {output.brandInterpretation.toReinforce.map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[12px] text-[#1A1A1A]">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#5B5BD6] shrink-0" />{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">What to avoid</p>
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

                  {/* Section 2 — Objective Translation */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">2</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Objective Translation</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-3 gap-3">
                      {([
                        { label: "Content direction", value: output.objectiveTranslation.contentDirection },
                        { label: "Primary KPI", value: output.objectiveTranslation.primaryKPI },
                        { label: "Content ratio", value: output.objectiveTranslation.contentRatio },
                      ] as { label: string; value: string }[]).map(({ label, value }) => (
                        <div key={label} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">{label}</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Tab: Content Map */}
              {activeTab === "content" && (
                <div className="space-y-4">

                  {/* Section 3 — Content Territories */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">3</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Content Territories</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-2 gap-3">
                      {output.territories.map((t) => (
                        <div key={t.name} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[12px] font-semibold text-[#1A1A1A]">{t.name}</p>
                            <span className="px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-medium">{t.frequency}</span>
                          </div>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed">{t.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4 — Content Ideas */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">4</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Content Ideas</p>
                    </div>
                    <div className="px-5 py-3 divide-y divide-[#F0F0ED]">
                      {output.contentIdeas.map((idea, i) => (
                        <div key={idea.title} className="py-3 flex items-center gap-3">
                          <span className="text-[11px] font-semibold text-[#9B9B95] w-4 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{idea.title}</p>
                            <p className="text-[11px] text-[#9B9B95]">{idea.territory}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium shrink-0">{idea.format}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 5 — Content Schedule */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">5</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Content Schedule</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-7 gap-2">
                      {output.schedule.map((s) => (
                        <div key={s.day} className={`rounded-[8px] border overflow-hidden ${s.active ? "border-[#5B5BD6] bg-[#FAFAFE]" : "border-[#E5E5E2] bg-white"}`}>
                          <div className={`px-2 py-1.5 text-center border-b ${s.active ? "bg-[#EEF0FF] border-[#5B5BD6]" : "bg-[#F7F7F6] border-[#E5E5E2]"}`}>
                            <p className={`text-[11px] font-semibold ${s.active ? "text-[#5B5BD6]" : "text-[#6B6B65]"}`}>{s.day}</p>
                          </div>
                          <div className="p-2 min-h-[64px]">
                            {s.active ? (
                              <>
                                <p className="text-[10px] font-medium text-[#1A1A1A] leading-tight">{s.territory}</p>
                                <p className="text-[10px] text-[#9B9B95] mt-0.5">{s.format}</p>
                              </>
                            ) : (
                              <p className="text-[10px] text-[#C0C0BC]">Rest</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Tab: Post Package */}
              {activeTab === "posts" && (
                <div className="space-y-3">
                  <div className="px-1">
                    <p className="text-[12px] text-[#9B9B95]">Section 6 — Final Post Package · {output.posts.length} posts</p>
                  </div>
                  {output.posts.map((post) => (
                    <div key={post.id} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#9B9B95]">Post {post.id}</span>
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{post.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">{post.format}</span>
                          <button
                            onClick={() => handleCopy(`prompt-${post.id}`, post.imagePrompt)}
                            className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] hover:text-[#1A1A1A] transition-colors"
                          >
                            {copiedKey === `prompt-${post.id}` ? "Copied" : "Copy Prompt"}
                          </button>
                          <button
                            onClick={() => handleCopy(`post-${post.id}`, formatPostAsText(post))}
                            className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] hover:text-[#1A1A1A] transition-colors"
                          >
                            {copiedKey === `post-${post.id}` ? "Copied" : "Copy Post"}
                          </button>
                        </div>
                      </div>
                      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Objective</p>
                          <p className="text-[12px] text-[#1A1A1A]">{post.objective}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">CTA</p>
                          <p className="text-[12px] text-[#1A1A1A]">{post.cta}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Caption</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed whitespace-pre-line">{post.caption}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Creative direction</p>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{post.creativeDirection}</p>
                        </div>
                        <div className="col-span-2 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">AI image prompt</p>
                          <p className="text-[12px] text-[#6B6B65] font-mono leading-relaxed">{post.imagePrompt}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Design notes</p>
                          <p className="text-[12px] text-[#6B6B65]">{post.designNotes}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Design Handoff */}
              {activeTab === "handoff" && (
                <div className="space-y-3">
                  <div className="px-1">
                    <p className="text-[12px] text-[#9B9B95]">Section 7 — Design Handoff Block</p>
                  </div>
                  <div className="bg-[#111111] rounded-[10px] border border-[#2A2A2A] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#2A2A2A] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#5B5BD6]" />
                      <p className="text-[12px] font-semibold text-white">design_handoff.txt</p>
                      <span className="text-[11px] text-[#6B6B65]">Ready for Design Agent</span>
                      <button
                        onClick={() => handleCopy("handoff-all", formatHandoffAsText(output.handoff))}
                        className="ml-auto h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#2A2A2A] text-[#9B9B95] hover:border-[#5B5BD6] hover:text-white transition-colors"
                      >
                        {copiedKey === "handoff-all" ? "Copied" : "Copy All"}
                      </button>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {output.handoff.map((h) => (
                        <div key={h.postId} className="rounded-[8px] border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[11px] font-semibold text-[#5B5BD6] font-mono">POST_{String(h.postId).padStart(2, "0")}</span>
                            <span className="text-[11px] text-[#6B6B65]">{h.title}</span>
                            <button
                              onClick={() => handleCopy(
                                `handoff-${h.postId}`,
                                [
                                  `POST_${String(h.postId).padStart(2, "0")} — ${h.title}`,
                                  `format: ${h.format}`,
                                  `key_copy: ${h.keyCopy}`,
                                  `visual_direction: ${h.visualDirection}`,
                                  `prompt: ${h.prompt}`,
                                  `design_notes: ${h.designNotes}`,
                                ].join("\n")
                              )}
                              className="ml-auto h-5 px-2 rounded-[4px] text-[10px] font-medium border border-[#2A2A2A] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-white transition-colors"
                            >
                              {copiedKey === `handoff-${h.postId}` ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                            <div>
                              <p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">format</p>
                              <p className="text-[11px] text-white">{h.format}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">key_copy</p>
                              <p className="text-[11px] text-white truncate">{h.keyCopy}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">visual_direction</p>
                              <p className="text-[11px] text-[#C0C0BC] leading-relaxed">{h.visualDirection}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">prompt</p>
                              <p className="text-[11px] text-[#C0C0BC] font-mono leading-relaxed">{h.prompt}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-mono text-[#6B6B65] mb-0.5">design_notes</p>
                              <p className="text-[11px] text-[#C0C0BC] leading-relaxed">{h.designNotes}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Agent Contract */}
              {activeTab === "contract" && (
                <div className="space-y-4">

                  {/* Header block */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-[#5B5BD6]" />
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">Design Agent Input Contract</p>
                          <span className="px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-semibold uppercase tracking-wide">v1.0</span>
                        </div>
                        <p className="text-[12px] text-[#6B6B65] max-w-xl">
                          Structured specification ready for consumption by a Design Agent. Each contract entry maps one post to its full design brief — format, copy, direction, prompt, and notes — with no ambiguity.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy("contract-all", formatContractAsText(output.contracts))}
                          className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] hover:text-[#1A1A1A] transition-colors"
                        >
                          {copiedKey === "contract-all" ? "Copied" : "Copy Contract"}
                        </button>
                        <button
                          onClick={handleSendToDesignAgent}
                          className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#C2530A] text-white hover:bg-[#A8460A] active:bg-[#8E3908] transition-colors flex items-center gap-1.5"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Send to Design Agent
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-3 border-t border-[#F0F0ED] grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-0.5">Brand</p>
                        <p className="text-[12px] font-medium text-[#1A1A1A]">{form.brandName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-0.5">Posts</p>
                        <p className="text-[12px] font-medium text-[#1A1A1A]">{output.contracts.length} assets</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-0.5">Source agent</p>
                        <p className="text-[12px] font-medium text-[#1A1A1A]">Social Media Agent</p>
                      </div>
                    </div>
                  </div>

                  {/* Contract entries */}
                  {output.contracts.map((c) => (
                    <div key={c.postId} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

                      {/* Entry header */}
                      <div className="px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] font-semibold text-[#5B5BD6] bg-[#EEF0FF] px-2 py-0.5 rounded-[4px]">
                            CONTRACT_{String(c.postId).padStart(2, "0")}
                          </span>
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{c.title}</p>
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{c.format}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(
                            `contract-${c.postId}`,
                            formatContractAsText([c])
                          )}
                          className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] hover:text-[#1A1A1A] transition-colors"
                        >
                          {copiedKey === `contract-${c.postId}` ? "Copied" : "Copy"}
                        </button>
                      </div>

                      {/* Fields grid */}
                      <div className="divide-y divide-[#F0F0ED]">
                        {[
                          { label: "content_objective", value: c.contentObjective },
                          { label: "key_copy", value: c.keyCopy },
                          { label: "cta", value: c.cta },
                          { label: "creative_direction", value: c.creativeDirection },
                          { label: "image_prompt", value: c.imagePrompt, mono: true },
                          { label: "design_notes", value: c.designNotes },
                        ].map(({ label, value, mono }) => (
                          <div key={label} className="px-5 py-3 grid grid-cols-[180px_1fr] gap-4 items-start">
                            <p className="text-[11px] font-mono font-medium text-[#9B9B95] pt-px">{label}</p>
                            <p className={`text-[12px] leading-relaxed text-[#1A1A1A] ${mono ? "font-mono text-[#6B6B65]" : ""}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                    </div>
                  ))}

                </div>
              )}

            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
