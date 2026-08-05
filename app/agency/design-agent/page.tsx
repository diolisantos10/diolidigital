"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { AgentClientContext } from "@/lib/agency/workspace";
import { comoTexto, temSubstancia } from "@/lib/agency/esteira/conteudo";
import AvisoModoAlternativo from "@/components/agency/ui/AvisoModoAlternativo";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "briefs" | "specs";
type InputMode = "project_requests" | "contract";

interface DesignRequest {
  id: string;
  title: string;
  pillar: string;
  format: string;
  objective: string;
  keyCopy: string;
  imagePrompt: string;
  creativeDirection: string;
}

interface ParsedPost {
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

interface VisualBrief {
  postId: number;
  title: string;
  format: string;
  visualConcept: string;
  enhancedPrompt: string;
  layoutStructure: string[];
  designInstructions: {
    typography: string;
    spacing: string;
    composition: string;
    visualHierarchy: string;
  };
  styleConsistency: string;
}

// ─── Design request generator ─────────────────────────────────────────────────

function generateDesignRequests(brand: string, ctx: AgentClientContext | null): DesignRequest[] {
  const brain    = ctx?.brandBrain;
  const visual   = brain?.visualStyle    ?? "clean, professional";
  const audience = brain?.targetAudience ?? "target audience";
  const products = brain?.productsToHighlight
    ? brain.productsToHighlight.split(/[,\n]/)[0].trim()
    : `${brand}'s core offering`;

  return [
    {
      id: "dr-1",
      title: "Brand World Post",
      pillar: "Brand World",
      format: "Carousel",
      objective: "Build brand affinity through behind-the-scenes storytelling",
      keyCopy: `Inside ${brand}: how we approach every project`,
      imagePrompt: `${visual} brand editorial photography, behind-the-scenes process, intentional staging, warm professional lighting, consistent brand identity, ultra-high quality, no watermarks`,
      creativeDirection: `${visual} aesthetic — progressive reveal carousel. Each slide opens one layer of the brand story. Image-led, minimal typographic overlay. Breathable white space throughout.`,
    },
    {
      id: "dr-2",
      title: "Value & Education",
      pillar: "Value & Education",
      format: "Carousel",
      objective: `Position ${brand} as trusted authority — drive saves and shares`,
      keyCopy: `3 things ${audience.split(" ").slice(0, 4).join(" ")} need to know`,
      imagePrompt: `${visual} educational infographic layout, clean data visualisation, typography-led design, brand colours, professional quality, flat modern illustration`,
      creativeDirection: `Bold typographic carousel. Large numbers or icons per slide. Consistent grid. Brand accent colour for key callouts. Shareable, educational, information-dense but legible.`,
    },
    {
      id: "dr-3",
      title: "Social Proof",
      pillar: "Social Proof",
      format: "Single Image",
      objective: "Build trust and credibility through client transformation",
      keyCopy: `How ${brand} helped [client] achieve [result]`,
      imagePrompt: `${visual} testimonial creative, clean minimal layout, subtle gradient background, result metric prominently featured, confident brand treatment, no watermarks`,
      creativeDirection: `Single image with result metric as the hero. Clean and confident. Client quote in smaller type below the metric. Restrained — nothing competes with the number.`,
    },
    {
      id: "dr-4",
      title: "Conversion Creative",
      pillar: "Conversion",
      format: "Single Image",
      objective: "Drive direct enquiries — one action, maximum clarity",
      keyCopy: `Ready? ${products} — limited availability`,
      imagePrompt: `${visual} high-contrast conversion creative, bold CTA treatment, brand colours dominant, product or service highlight, direct confident composition, production-ready`,
      creativeDirection: `Bold and direct. High contrast. CTA is the visual hero — one clear action. Brand mark present but not competing. Must read at thumbnail scale.`,
    },
  ];
}

// ─── DesignRequest → ParsedPost ───────────────────────────────────────────────

function designRequestToPost(req: DesignRequest, index: number): ParsedPost {
  return {
    postId: index + 1,
    title: req.title,
    format: req.format,
    contentObjective: req.objective,
    keyCopy: req.keyCopy,
    cta: req.pillar === "Conversion" ? "DM us or click link in bio" : "Save this post",
    creativeDirection: req.creativeDirection,
    imagePrompt: req.imagePrompt,
    designNotes: `Pillar: ${req.pillar}. Format: ${req.format}.`,
  };
}

// ─── Contract parser ──────────────────────────────────────────────────────────

function parseContract(raw: string): ParsedPost[] {
  const chunks = raw.split(/┌─\s*CONTRACT_\d+\s*—?\s*/);
  const posts: ParsedPost[] = [];

  chunks.forEach((chunk, i) => {
    if (!chunk.trim()) return;
    const getField = (key: string) => {
      const re = new RegExp(`│\\s*${key}\\s+(.+)`);
      const m = chunk.match(re);
      return m ? m[1].trim() : "";
    };
    const titleLine = chunk.split("\n")[0].trim();
    const title = titleLine.replace(/^─\s*/, "").trim() || `Post ${i}`;
    posts.push({
      postId: i,
      title,
      format: getField("format") || "Single Image",
      contentObjective: getField("content_objective") || "",
      keyCopy: getField("key_copy") || "",
      cta: getField("cta") || "",
      creativeDirection: getField("creative_direction") || "",
      imagePrompt: getField("image_prompt") || "",
      designNotes: getField("design_notes") || "",
    });
  });

  if (posts.length === 0) {
    return [
      { postId: 1, title: "Brand Statement", format: "Single Image", contentObjective: "Build brand presence", keyCopy: "Make your brand impossible to ignore.", cta: "Learn more", creativeDirection: "Clean, bold, minimal", imagePrompt: "Minimal brand visual, clean layout", designNotes: "Single image, strong headline" },
      { postId: 2, title: "Value Post",      format: "Carousel",      contentObjective: "Educate the audience",  keyCopy: "Here's what most brands get wrong.", cta: "Save this post", creativeDirection: "Educational, typographic", imagePrompt: "Infographic style, clean slides", designNotes: "5-slide carousel, consistent template" },
      { postId: 3, title: "CTA Post",        format: "Single Image",  contentObjective: "Drive enquiries",       keyCopy: "Spots are limited.",               cta: "DM us START", creativeDirection: "High contrast, confident", imagePrompt: "Bold conversion creative, strong colour", designNotes: "Minimal text on image, CTA dominant" },
    ];
  }
  return posts;
}

// ─── Mock visual generator ────────────────────────────────────────────────────

function buildLayoutStructure(format: string, title: string): string[] {
  const f = format.toLowerCase();
  if (f.includes("carousel")) {
    return [
      `Slide 1 (Cover): Full-bleed background with "${title}" as the headline. Brand colour dominant. No body copy — just the hook.`,
      `Slide 2: Single idea, large numeral or icon top-left. 2-line statement. Generous white space.`,
      `Slide 3: Continuation of the core argument. Pull quote or key data point centred.`,
      `Slide 4: Supporting visual or example. Caption below image at 70% opacity.`,
      `Slide 5: Summary frame — 3-item list, clean bullet treatment, brand colour accents.`,
      `Slide 6 (CTA): Logo centred, CTA text below, muted background. Less is more.`,
    ];
  }
  if (f.includes("story")) {
    return [
      `Frame 1: Hook text only — 1 bold line centred on brand colour. No image.`,
      `Frame 2: Visual asset or product shot with subtle overlay. Text bottom-third.`,
      `Frame 3: CTA frame — swipe up / DM prompt with clear button treatment.`,
    ];
  }
  if (f.includes("reel")) {
    return [
      `0:00–0:03: Bold text hook on screen. Fast cut to brand context.`,
      `0:03–0:12: Core content delivery. Subtitles prominent, font matches brand.`,
      `0:12–0:15: CTA screen. Single action, centred.`,
    ];
  }
  return [
    `Primary zone (top 60%): Main visual asset or typographic hero. Should be readable at thumbnail scale.`,
    `Secondary zone (bottom 40%): Supporting copy or context. Restrained — acts as caption, not headline.`,
    `Brand anchor: Logo or brand mark bottom-right at 80% opacity. Present but never dominant.`,
  ];
}

function generateVisualBriefs(posts: ParsedPost[], ctx: AgentClientContext | null): VisualBrief[] {
  const brain          = ctx?.brandBrain;
  const visualStyle    = brain?.visualStyle    ?? "";
  const toneOfVoice    = brain?.toneOfVoice    ?? "";
  const brandRules     = brain?.brandRules     ?? "";
  const thingsToAvoid  = brain?.thingsToAvoid  ?? "";
  const brandVisualCtx = visualStyle  ? `${visualStyle} visual direction`  : "the brand's established visual identity";
  const brandToneCtx   = toneOfVoice  ? `${toneOfVoice} tone`             : "the brand's established tone";
  const visualPfx      = visualStyle  ? `${visualStyle}, `                 : "";

  return posts.map((p) => {
    const isCarousel = p.format.toLowerCase().includes("carousel");
    const isStory    = p.format.toLowerCase().includes("story");

    const visualConcept = p.creativeDirection
      ? `The visual direction leans into a ${p.creativeDirection.toLowerCase()} approach${visualStyle ? ", grounded in the brand's " + visualStyle.toLowerCase() + " aesthetic" : ""}. The concept centres on ${
          isCarousel
            ? "a progressive reveal — each slide earns the next by delivering one clear idea"
            : isStory
            ? "immediacy and intimacy — the story format demands a fast, punchy execution that lands in under 2 seconds"
            : "a single, decisive frame — one image, one message, zero noise"
        }. The key copy "${p.keyCopy.slice(0, 60)}${p.keyCopy.length > 60 ? "…" : ""}" becomes the visual anchor — it should be legible at thumb size.`
      : `Visual concept centres on the post objective: ${p.contentObjective}. Every element earns its place.${visualStyle ? " Style: " + visualStyle + "." : ""}`;

    const basePrompt      = p.imagePrompt || "Clean editorial visual, professional brand aesthetic";
    const enhancedPrompt  = [
      visualPfx + basePrompt,
      "ultra-high resolution, professional photography or CGI quality",
      "precise colour grading consistent with brand palette",
      "intentional negative space for text overlay",
      "no watermarks, no UI elements, no people unless specified",
      "output ratio 1:1 for feed or 9:16 for story",
      "editorial magazine quality, production-ready",
    ].join(", ");

    const designInstructions = {
      typography: isCarousel
        ? `Headline: bold sans-serif, 48–64px, tight leading. Body: regular weight, 18–22px, 1.5 line-height. Slide number: 10px uppercase, muted, top-right.`
        : `Headline: bold sans-serif, 64–80px. Text on image: white with drop shadow at 20% opacity. Never use more than 2 typefaces.`,
      spacing: isCarousel
        ? `Minimum 48px margin on all edges per slide. Inter-element spacing: 24px minimum. Breathing room is the point.`
        : `60px minimum margin on all edges. If it looks tight, remove something.`,
      composition: isStory
        ? `Vertical 9:16. Safe zone: avoid top and bottom 15%. Left-aligned text reads faster in story format.`
        : isCarousel
        ? `1:1 ratio per slide. Align consistently — never mix left and centre. Grid: 12-column with 24px gutters.`
        : `1:1 square. Rule of thirds: focal point on a third intersection. Avoid dead centre unless deliberate.`,
      visualHierarchy: `1st read (0–1s): ${p.keyCopy.slice(0, 40) || "Headline"} — lands immediately. 2nd read (1–3s): supporting context. 3rd read (3s+): brand mark and CTA. Do not compete with the 1st read at any layer.`,
    };

    const styleConsistencyBase = `Ensure the visual aligns with the brand's ${brandVisualCtx}. Typography must match the ${brandToneCtx} — ${
      p.contentObjective.toLowerCase().includes("authority") || p.contentObjective.toLowerCase().includes("expert")
        ? "authoritative and refined; avoid playful or decorative typefaces"
        : "approachable yet considered; avoid sterile or overly corporate treatments"
    }.`;
    const rulesNote  = brandRules   ? ` Brand rules: ${brandRules.slice(0, 120)}.`     : "";
    const avoidNote  = thingsToAvoid ? ` Never include: ${thingsToAvoid.slice(0, 100)}.` : " Colour palette must stay within the brand system.";
    const styleConsistency = styleConsistencyBase + rulesNote + avoidNote + " If in doubt, reduce — simpler is always more on-brand.";

    return {
      postId: p.postId,
      title: p.title,
      format: p.format,
      visualConcept,
      enhancedPrompt,
      layoutStructure: buildLayoutStructure(p.format, p.title),
      designInstructions,
      styleConsistency,
    };
  });
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function formatBriefAsText(b: VisualBrief): string {
  return [
    `VISUAL BRIEF — ${b.title} [${b.format}]`,
    ``,
    `VISUAL CONCEPT`,
    b.visualConcept,
    ``,
    `ENHANCED IMAGE PROMPT`,
    b.enhancedPrompt,
    ``,
    `LAYOUT STRUCTURE`,
    b.layoutStructure.map((l, i) => `  ${i + 1}. ${l}`).join("\n"),
    ``,
    `DESIGN INSTRUCTIONS`,
    `  Typography:  ${b.designInstructions.typography}`,
    `  Spacing:     ${b.designInstructions.spacing}`,
    `  Composition: ${b.designInstructions.composition}`,
    `  Hierarchy:   ${b.designInstructions.visualHierarchy}`,
    ``,
    `STYLE CONSISTENCY`,
    b.styleConsistency,
  ].join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandBrainContextCard({ ctx }: { ctx: AgentClientContext }) {
  const ready      = ctx.brandBrainReadiness;
  const incomplete = ready < 5;
  return (
    <div className={`rounded-[8px] border px-3 py-2.5 ${incomplete ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F0FDF4] border-[#BBF7D0]"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-bold ${incomplete ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>{incomplete ? "⚠" : "●"}</span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">{incomplete ? "Brand Brain incompleto" : "Brand Brain ativo"}</span>
          <span className="text-[10px] text-[var(--text-muted)]">· {ctx.clientName}</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ready === 10 ? "bg-[var(--success-bg)] text-[var(--success)]" : ready >= 5 ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[var(--accent)] text-[var(--text-muted)]"}`}>{ready}/10</span>
      </div>
      {incomplete ? (
        <p className="text-[11px] text-[var(--warning)] leading-snug">Complete o Brand Brain no workspace do cliente para outputs totalmente específicos da marca.</p>
      ) : (
        <div className="space-y-0.5 mt-1">
          {ctx.brandBrain?.visualStyle    && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-12 shrink-0">Visual</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.visualStyle}</span></div>}
          {ctx.brandBrain?.toneOfVoice    && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-12 shrink-0">Tone</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.toneOfVoice}</span></div>}
          {ctx.brandBrain?.targetAudience && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-12 shrink-0">Audience</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.targetAudience}</span></div>}
        </div>
      )}
    </div>
  );
}

function ProposalGatePanel({
  proposalStatus,
  linkedProject,
  linkedClient,
}: {
  proposalStatus: string | undefined;
  linkedProject: { id: string; name: string } | null;
  linkedClient: { name: string } | null;
}) {
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    draft:             { label: "Rascunho — não enviado ao cliente",  color: "text-[var(--text-secondary)]", bg: "bg-[var(--bg)]" },
    sent:              { label: "Aguardando aprovação do cliente",    color: "text-[var(--navy)]", bg: "bg-[var(--accent-light)]" },
    rejected:          { label: "Rejeitado pelo cliente",             color: "text-[var(--danger)]", bg: "bg-[var(--danger-bg)]" },
    changes_requested: { label: "Alterações solicitadas pelo cliente", color: "text-[var(--warning)]", bg: "bg-[#FFFBEB]" },
  };
  const info = proposalStatus ? (statusMap[proposalStatus] ?? statusMap.draft) : statusMap.draft;

  return (
    <div className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-[#E6FBFA] flex items-center justify-center mb-5">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 7v5M11 15h.01" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="11" cy="11" r="9" stroke="#D97706" strokeWidth="1.5"/>
        </svg>
      </div>
      <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">Execução bloqueada</p>
      <p className="text-[13px] text-[var(--text-secondary)] max-w-sm leading-relaxed mb-5">
        O Agente de Design só pode ser executado após a aprovação da proposta pelo cliente.
        Isso garante que todo o trabalho criativo seja comercialmente autorizado antes da produção.
      </p>
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full mb-5 ${info.bg}`}>
        <span className={`text-[12px] font-semibold ${info.color}`}>Status da proposta: {info.label}</span>
      </div>
      {linkedProject && (
        <Link
          href={`/agency/projects/${linkedProject.id}?tab=proposal`}
          className="h-8 px-4 rounded-[7px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[12px] font-medium transition-colors"
        >
          Ver Proposta →
        </Link>
      )}
      {proposalStatus === "sent" && linkedClient && (
        <p className="text-[11px] text-[var(--text-muted)] mt-3">Compartilhe o link do portal do cliente para {linkedClient.name} aprovar.</p>
      )}
      {proposalStatus === "draft" && (
        <p className="text-[11px] text-[var(--text-muted)] mt-3">Rascunho → Enviar ao cliente → Aguardar aprovação → Executar Agente de Design</p>
      )}
    </div>
  );
}

const STEPS = [
  "Lendo contexto da marca…",
  "Interpretando briefs criativos…",
  "Desenvolvendo conceitos visuais…",
  "Aprimorando prompts de imagem…",
  "Gerando estruturas de layout…",
  "Escrevendo especificações de design…",
];

const PILLAR_COLORS: Record<string, string> = {
  "Brand World":       "bg-[var(--accent-light)] text-[var(--navy)]",
  "Value & Education": "bg-[#E6FBFA] text-[#0E7C75]",
  "Social Proof":      "bg-[#F0FDF4] text-[var(--success)]",
  "Conversion":        "bg-[var(--warning-bg)] text-[var(--warning)]",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignAgentPage() {
  const [linkedProjectId,    setLinkedProjectId]    = useState<string | null>(null);
  const [inputMode,          setInputMode]          = useState<InputMode>("project_requests");
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set(["dr-1", "dr-2", "dr-3", "dr-4"]));
  const [contractInput,      setContractInput]      = useState("");
  const [agentState,         setAgentState]         = useState<AgentState>("idle");
  const [activeTab,          setActiveTab]          = useState<OutputTab>("briefs");
  const [stepIndex,          setStepIndex]          = useState(0);
  const [briefs,             setBriefs]             = useState<VisualBrief[]>([]);
  // Briefs vieram do gerador por regras, não da IA — DESIGN.md §7.3.
  const [motivoDaReserva,    setMotivoDaReserva]    = useState<string | null>(null);
  const [briefsSaved,        setBriefsSaved]        = useState(false);
  const [copiedKey,          setCopiedKey]          = useState<string | null>(null);

  type ImageStatus = "idle" | "generating" | "done" | "error";
  interface ImageState { status: ImageStatus; url?: string; error?: string }
  interface SaveForm  { name: string; projectId: string; saved: boolean }
  const [imageStates, setImageStates] = useState<Record<number, ImageState>>({});
  const [saveForms,   setSaveForms]   = useState<Record<number, SaveForm>>({});

  const {
    projects, clients, deliverables,
    pendingDesignContract, setPendingDesignContract,
    pendingAgentInput, setPendingAgentInput,
  } = useAgencyStore();
  const { createDeliverable } = useDbDeliverables();

  // Auto-load contract from Social Media Agent handoff
  useEffect(() => {
    if (pendingDesignContract) {
      setContractInput(pendingDesignContract);
      setInputMode("contract");
      setPendingDesignContract(null);
    }
  }, [pendingDesignContract, setPendingDesignContract]);

  // Auto-link project from project detail "Run" button
  useEffect(() => {
    if (pendingAgentInput?.projectId) {
      setLinkedProjectId(pendingAgentInput.projectId);
      setPendingAgentInput(null);
    }
  }, [pendingAgentInput, setPendingAgentInput]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const linkedProject  = linkedProjectId ? projects.find((p) => p.id === linkedProjectId) : null;
  const linkedClient   = linkedProject   ? clients.find((c) => c.id === linkedProject.clientId) : null;
  const agentCtx: AgentClientContext | null = linkedClient ? getClientAgentContext(linkedClient) : null;

  const proposalStatus   = linkedProject?.proposal?.status;
  const proposalApproved = proposalStatus === "approved";
  const proposalBlocked  = !!linkedProject && !proposalApproved;

  const projectDeliverables        = linkedProjectId ? deliverables.filter((d) => d.projectId === linkedProjectId) : [];
  const hasDesignRequestsDeliverable = projectDeliverables.some((d) => d.type === "Design Requests");
  const existingDesigns            = projectDeliverables.filter((d) => d.type === "Design");

  const autoRequests: DesignRequest[] = linkedProject
    ? generateDesignRequests(linkedClient?.name ?? linkedProject.name, agentCtx)
    : [];

  const selectedRequests = autoRequests.filter((r) => selectedRequestIds.has(r.id));

  const isReady = !!linkedProject && !proposalBlocked && (
    (inputMode === "project_requests" && selectedRequestIds.size > 0) ||
    (inputMode === "contract" && contractInput.trim().length > 20)
  );

  // ── Actions ───────────────────────────────────────────────────────────────────
  function toggleRequest(id: string) {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleRun() {
    setAgentState("generating");
    setStepIndex(0);
    setBriefsSaved(false);
    setMotivoDaReserva(null);
    const capturedCtx = agentCtx;
    const capturedClient = linkedClient;

    let posts: ParsedPost[];
    if (inputMode === "project_requests") {
      posts = selectedRequests.map((r, i) => designRequestToPost(r, i));
    } else {
      posts = parseContract(contractInput);
    }

    // Advance progress steps while real API runs
    const stepDelays = [600, 1400, 2500, 4000, 6000];
    stepDelays.forEach((ms, i) => {
      setTimeout(() => setStepIndex(i + 1), ms);
    });

    let finalBriefs: VisualBrief[];
    let motivo: string | null = null;
    try {
      const res = await fetch("/api/agents/design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts,
          brandName: capturedClient?.name ?? linkedProject?.name ?? "Marca",
          brandBrain: capturedCtx?.brandBrain ?? null,
        }),
      });

      const data = (await res.json()) as { ok: boolean; briefs?: VisualBrief[]; error?: string };

      if (!data.ok || !data.briefs || data.briefs.length === 0) {
        // Cair em regras é aceitável; cair em SILÊNCIO não. DESIGN.md §7.3.
        console.warn("[design-agent] AI unavailable, using rule-based fallback:", data.error);
        finalBriefs = generateVisualBriefs(posts, capturedCtx);
        motivo = data.error ?? "a IA não respondeu";
      } else {
        finalBriefs = data.briefs;
      }
    } catch (err) {
      console.warn("[design-agent] fetch error, falling back to rule-based:", err);
      finalBriefs = generateVisualBriefs(posts, capturedCtx);
      motivo = err instanceof Error ? err.message : "falha de conexão com o serviço de IA";
    }

    setMotivoDaReserva(motivo);
    setBriefs(finalBriefs);
    setAgentState("output_ready");
    setActiveTab("briefs");
    setStepIndex(5);
  }

  function handleSaveAllBriefs() {
    if (!linkedProjectId || !briefs.length || briefsSaved) return;
    briefs.forEach((b) => {
      // O brief inteiro vai junto — antes só o nome era guardado.
      const nome = `Brief de Design — ${b.title} (${b.format})`;
      const content = comoTexto(b, { titulo: nome });
      void createDeliverable({
        projectId: linkedProjectId,
        name:      nome,
        type:      "Design",
        status:    "in_review",
        ...(temSubstancia(content) ? { content } : {}),
      });
    });
    setBriefsSaved(true);
  }

  async function handleGenerateImage(postId: number, prompt: string) {
    setImageStates((prev) => ({ ...prev, [postId]: { status: "generating" } }));
    try {
      // Pick the aspect ratio from the post format so Stories/Reels come out
      // vertical (9:16-ish) and feed posts square.
      const fmt = (briefs.find((b) => b.postId === postId)?.format ?? "").toLowerCase();
      const size = /stor|reel|vertical|9:16/.test(fmt)
        ? "portrait"
        : /capa|banner|horizontal|16:9|landscape/.test(fmt)
        ? "landscape"
        : "square";
      const res  = await fetch("/api/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt, size, quality: "high" }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setImageStates((prev) => ({ ...prev, [postId]: { status: "error", error: data.error ?? "Não conseguimos gerar a imagem. Tente de novo em instantes." } }));
      } else {
        setImageStates((prev) => ({ ...prev, [postId]: { status: "done", url: data.url } }));
        const brief = briefs.find((b) => b.postId === postId);
        setSaveForms((prev) => ({
          ...prev,
          [postId]: {
            name:      brief ? `${brief.title} — ${brief.format}` : "Design Asset",
            projectId: linkedProjectId ?? projects[0]?.id ?? "",
            saved:     false,
          },
        }));
      }
    } catch {
      setImageStates((prev) => ({ ...prev, [postId]: { status: "error", error: "Sem conexão com o serviço de imagem. Verifique a internet e tente de novo." } }));
    }
  }

  function handleSaveDeliverable(postId: number) {
    const form = saveForms[postId];
    const img  = imageStates[postId];
    if (!form || !img?.url || !form.projectId || !form.name) return;
    void createDeliverable({
      projectId: form.projectId,
      name:      form.name,
      type:      "Design",
      status:    "in_review",
      link:      img.url,
    });
    setSaveForms((prev) => ({ ...prev, [postId]: { ...prev[postId], saved: true } }));
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  }

  function handleExport() {
    const content = [
      `DESIGN AGENT OUTPUT`,
      `${"=".repeat(60)}`,
      ``,
      ...briefs.map((b) => formatBriefAsText(b) + "\n\n" + "-".repeat(60)),
    ].join("\n");
    downloadTextFile("design-agent-output.txt", content);
  }

  function handleReset() {
    setAgentState("idle");
    setBriefs([]);
    setBriefsSaved(false);
    setStepIndex(0);
    setImageStates({});
    setSaveForms({});
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      <AgencyHeader
        title="Agente de Design"
        subtitle="Departamento Criativo — produz briefs de design revisáveis pelo cliente a partir das solicitações do Agente de Redes Sociais."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">

        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[11px] font-semibold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0E7C75]" />
            Departamento Criativo
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">v1 · DALL‑E 3</span>
          {linkedProject && (
            <Link href={`/agency/projects/${linkedProject.id}`} className="text-[12px] text-[var(--navy)] hover:underline">
              ← {linkedProject.name}
            </Link>
          )}
          {agentState === "output_ready" && (
            <div className="ml-auto flex items-center gap-2">
              {linkedProjectId && (
                briefsSaved ? (
                  <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--success-bg)] text-[var(--success)] border border-[#BBF7D0]">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Salvo — {briefs.length} brief{briefs.length !== 1 ? "s" : ""} de design
                  </span>
                ) : (
                  <button
                    onClick={handleSaveAllBriefs}
                    className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#0E7C75] text-white hover:bg-[#0B655F] transition-colors"
                  >
                    Salvar {briefs.length} brief{briefs.length !== 1 ? "s" : ""} no projeto
                  </button>
                )
              )}
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg)] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1v7M3.5 5.5L6.5 8.5 9.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Exportar
              </button>
            </div>
          )}
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── LEFT: Creative Brief ── */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Brief Criativo</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Selecione um projeto para carregar as solicitações de design do Agente de Redes Sociais.</p>
            </div>

            <div className="px-5 py-5 space-y-4">

              {/* Project selector */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Projeto <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={linkedProjectId ?? ""}
                  onChange={(e) => { setLinkedProjectId(e.target.value || null); setBriefs([]); setBriefsSaved(false); setAgentState("idle"); }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[#0E7C75] focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um projeto —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Brain */}
              {agentCtx && <BrandBrainContextCard ctx={agentCtx} />}

              {/* Execution gate — inline warning in form */}
              {proposalBlocked && linkedProject && (
                <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                    <path d="M7 4.5V7M7 9.5h.01" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="7" cy="7" r="6" stroke="#D97706" strokeWidth="1.2"/>
                  </svg>
                  <p className="text-[12px] text-[var(--warning)] leading-snug">A proposta deve ser aprovada antes de executar o Agente de Design.</p>
                </div>
              )}

              {/* Input mode toggle — only when project selected + not blocked */}
              {linkedProject && !proposalBlocked && (
                <>
                  <div className="flex items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-[7px] p-1">
                    {(["project_requests", "contract"] as InputMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setInputMode(mode)}
                        disabled={agentState !== "idle"}
                        className={`flex-1 h-6 rounded-[5px] text-[11px] font-medium transition-all ${
                          inputMode === mode
                            ? "bg-white text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {mode === "project_requests" ? "Do Projeto" : "Do Contrato"}
                      </button>
                    ))}
                  </div>

                  {/* ── Mode: Project Requests ── */}
                  {inputMode === "project_requests" && (
                    <div className="space-y-3">
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {hasDesignRequestsDeliverable ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                              <span className="text-[11px] font-medium text-[var(--success)]">Solicitações de redes sociais carregadas</span>
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                              <span className="text-[11px] font-medium text-[var(--text-muted)]">4 solicitações de template prontas</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedRequestIds(new Set(autoRequests.map((r) => r.id)))} className="text-[11px] text-[var(--navy)] hover:underline">All</button>
                          <span className="text-[var(--border-strong)] text-[10px]">·</span>
                          <button onClick={() => setSelectedRequestIds(new Set())} className="text-[11px] text-[var(--text-muted)] hover:underline">None</button>
                        </div>
                      </div>

                      {/* Request cards */}
                      <div className="space-y-2">
                        {autoRequests.map((req) => {
                          const selected = selectedRequestIds.has(req.id);
                          return (
                            <button
                              key={req.id}
                              onClick={() => toggleRequest(req.id)}
                              disabled={agentState !== "idle"}
                              className={`w-full text-left rounded-[8px] border px-3 py-2.5 transition-all ${
                                selected
                                  ? "bg-[#E6FBFA] border-[#FDBA74] shadow-[0_0_0_1px_#FDBA74]"
                                  : "bg-[var(--bg)] border-[var(--border)] hover:border-[#0E7C75] hover:bg-[#E6FBFA]"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3.5 h-3.5 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                                  selected ? "bg-[#0E7C75] border-[#0E7C75]" : "border-[var(--border-strong)]"
                                }`}>
                                  {selected && (
                                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                      <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <span className="text-[12px] font-semibold text-[var(--text-primary)] flex-1 truncate">{req.title}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PILLAR_COLORS[req.pillar] ?? "bg-[var(--accent)] text-[var(--text-secondary)]"}`}>{req.pillar}</span>
                              </div>
                              <div className="flex items-center gap-2 pl-5">
                                <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-1.5 py-0.5 rounded-[3px]">{req.format}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] truncate">{req.objective.slice(0, 45)}{req.objective.length > 45 ? "…" : ""}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* No requests from Social Media yet */}
                      {!hasDesignRequestsDeliverable && (
                        <div className="rounded-[7px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2.5">
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Nenhuma solicitação de redes sociais ainda.{" "}
                            <Link href="/agency/social-media-agent" className="text-[var(--navy)] hover:underline">
                              Execute o Agente de Redes Sociais
                            </Link>{" "}
                            primeiro para gerar solicitações específicas da marca.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Mode: Contract Input ── */}
                  {inputMode === "contract" && (
                    <div className="space-y-2">
                      <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Payload do contrato</label>
                      <textarea
                        value={contractInput}
                        onChange={(e) => setContractInput(e.target.value)}
                        disabled={agentState !== "idle"}
                        placeholder={`Cole o contrato aqui.\n\nFormato esperado:\n┌─ CONTRACT_01 — Título do Post\n│ format             Carousel\n│ content_objective  ...\n│ key_copy           ...\n│ cta                ...\n│ creative_direction ...\n│ image_prompt       ...\n└─ design_notes      ...`}
                        rows={12}
                        className="w-full px-3 py-2.5 text-[12px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[#0E7C75] focus:bg-white transition-colors resize-none disabled:opacity-50 leading-relaxed"
                      />
                      <div className="rounded-[7px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2">
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Copie o bloco de Handoff de Design da aba Design do Agente de Redes Sociais{" "}
                          <Link href="/agency/social-media-agent" className="text-[var(--navy)] hover:underline">aqui</Link>.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Run / Generating / Reset */}
              {agentState === "idle" && (
                <button
                  disabled={!isReady}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#0E7C75] text-white hover:bg-[#0B655F] active:bg-[#0B655F] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {!linkedProject
                    ? "Selecione um projeto para começar"
                    : proposalBlocked
                    ? "Aguardando aprovação da proposta"
                    : inputMode === "project_requests"
                    ? selectedRequestIds.size === 0
                      ? "Selecione pelo menos uma solicitação"
                      : `Gerar ${selectedRequestIds.size} Brief${selectedRequestIds.size !== 1 ? "s" : ""} de Design`
                    : "Executar Agente de Design"
                  }
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#0E7C75] text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button
                  onClick={handleReset}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] transition-all"
                >
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Output ── */}

          {/* Idle — no project */}
          {agentState === "idle" && !linkedProject && (
            <div className="bg-white rounded-[10px] border border-dashed border-[var(--border)] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full bg-[#E6FBFA] flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="#0E7C75" strokeWidth="1.3"/>
                  <path d="M7 13l2-4 2.5 2.5 2-4" stroke="#0E7C75" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">Selecione um projeto para começar</p>
              <p className="text-[13px] text-[var(--text-muted)] mt-1.5 max-w-xs mx-auto leading-relaxed">
                Vincule um projeto com proposta aprovada. O Agente de Design carregará as solicitações criativas automaticamente.
              </p>
            </div>
          )}

          {/* Idle — blocked */}
          {agentState === "idle" && linkedProject && proposalBlocked && (
            <ProposalGatePanel
              proposalStatus={proposalStatus}
              linkedProject={linkedProject}
              linkedClient={linkedClient ?? null}
            />
          )}

          {/* Idle — project linked, approved, requests ready */}
          {agentState === "idle" && linkedProject && !proposalBlocked && (
            <div className="space-y-4">
              {/* Project status overview */}
              <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Pipeline Criativo</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                    <span className="text-[11px] font-medium text-[var(--success)]">Execução desbloqueada</span>
                  </div>
                </div>

                {/* Social → Design flow */}
                <div className="flex items-center gap-2 mb-4">
                  <div className={`flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium ${hasDesignRequestsDeliverable ? "bg-[#F0FDF4] text-[var(--success)] border border-[#BBF7D0]" : "bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]"}`}>
                    {hasDesignRequestsDeliverable ? "✓ " : ""}Redes Sociais
                  </div>
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                    <path d="M1 5h13M10 1l4 4-4 4" stroke="var(--text-subtle)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium bg-[#E6FBFA] text-[#0E7C75] border border-[#FDBA74]">
                    Agente de Design
                  </div>
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                    <path d="M1 5h13M10 1l4 4-4 4" stroke="var(--text-subtle)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]">
                    Revisão do Cliente
                  </div>
                </div>

                {/* Existing designs */}
                {existingDesigns.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Entregas de Design Existentes</div>
                    <div className="space-y-1.5">
                      {existingDesigns.map((d) => (
                        <div key={d.id} className="flex items-center justify-between py-1.5 px-3 rounded-[6px] bg-[var(--bg)]">
                          <span className="text-[12px] text-[var(--text-primary)] truncate">{d.name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                            d.status === "approved" ? "bg-[var(--success-bg)] text-[var(--success)]"
                            : d.status === "in_review" ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                            : "bg-[var(--accent)] text-[var(--text-muted)]"
                          }`}>{d.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Nenhuma entrega de design ainda.{" "}
                    {inputMode === "project_requests"
                      ? `Selecione ${selectedRequestIds.size > 0 ? selectedRequestIds.size + " solicitação(ões)" : "solicitações"} e gere.`
                      : "Cole um contrato e execute."
                    }
                  </p>
                )}
              </div>

              {/* Selected requests preview */}
              {inputMode === "project_requests" && selectedRequests.length > 0 && (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{selectedRequests.length} solicitação{selectedRequests.length !== 1 ? "s" : ""} na fila para design</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {selectedRequests.map((req) => (
                      <div key={req.id} className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PILLAR_COLORS[req.pillar] ?? "bg-[var(--accent)] text-[var(--text-secondary)]"}`}>{req.pillar}</span>
                          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{req.title}</span>
                          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-1.5 py-0.5 rounded-[3px] ml-auto">{req.format}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">{req.objective}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generating */}
          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[#E6FBFA] flex items-center justify-center mx-auto mb-5">
                <span className="w-5 h-5 border-2 border-[#0E7C75] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-6">Gerando briefs visuais…</p>
              <div className="max-w-[240px] mx-auto space-y-2.5">
                {STEPS.map((label, i) => (
                  <div key={label} className={`flex items-center gap-2.5 transition-opacity duration-300 ${i <= stepIndex ? "opacity-100" : "opacity-25"}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#0E7C75]" : i === stepIndex ? "bg-[#E6FBFA] border border-[#0E7C75]" : "bg-[var(--accent)]"}`}>
                      {i < stepIndex && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4l1.8 1.8L6.5 2.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className={`text-[12px] text-left ${i <= stepIndex ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          {agentState === "output_ready" && briefs.length > 0 && (
            <div className="space-y-4">
              {motivoDaReserva && (
                <AvisoModoAlternativo oQue="Briefs visuais" motivo={motivoDaReserva} />
              )}

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-[9px] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {(["briefs", "specs"] as OutputTab[]).map((tab) => {
                  const labels: Record<OutputTab, string> = { briefs: `Briefs Visuais (${briefs.length})`, specs: "Especificações de Design" };
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 h-7 rounded-[6px] text-[12px] font-medium transition-all ${
                        activeTab === tab ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent)]"
                      }`}
                    >
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>

              {/* Tab: Visual Briefs */}
              {activeTab === "briefs" && (
                <div className="space-y-4">
                  {briefs.map((b) => (
                    <div key={b.postId} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

                      {/* Card header */}
                      <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[11px] font-semibold text-[#0E7C75] bg-[#E6FBFA] px-2 py-0.5 rounded-[4px]">
                            BRIEF_{String(b.postId).padStart(2, "0")}
                          </span>
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{b.title}</p>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">{b.format}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(`brief-${b.postId}`, formatBriefAsText(b))}
                          className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          {copiedKey === `brief-${b.postId}` ? "Copiado" : "Copiar Brief"}
                        </button>
                      </div>

                      <div className="divide-y divide-[var(--border)]">

                        {/* 1 — Visual Concept */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">1</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Conceito Visual</p>
                          </div>
                          <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{b.visualConcept}</p>
                        </div>

                        {/* 2 — Enhanced Prompt */}
                        <div className="px-5 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">2</span>
                              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Prompt de Imagem</p>
                            </div>
                            <button
                              onClick={() => handleCopy(`prompt-${b.postId}`, b.enhancedPrompt)}
                              className="h-5 px-2 rounded-[4px] text-[10px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] transition-colors"
                            >
                              {copiedKey === `prompt-${b.postId}` ? "Copiado" : "Copiar"}
                            </button>
                          </div>
                          <div className="rounded-[7px] bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5">
                            <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed">{b.enhancedPrompt}</p>
                          </div>
                        </div>

                        {/* Real image generation */}
                        <div className="px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-[var(--accent-light)] flex items-center justify-center shrink-0">
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M4 1v2.5L6 5M4 1L2 5M1 7h6" stroke="#070A1F" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Imagem Real</p>
                            </div>
                            {(!imageStates[b.postId] || imageStates[b.postId].status === "idle") && (
                              <button
                                onClick={() => handleGenerateImage(b.postId, b.enhancedPrompt)}
                                className="h-7 px-3 rounded-[6px] text-[12px] font-semibold bg-[var(--navy)] text-white hover:bg-[#0D1230] transition-colors flex items-center gap-1.5"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M5.5 1v4M5.5 10V6M1 5.5h4M10 5.5H6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                                </svg>
                                Gerar Imagem
                              </button>
                            )}
                            {imageStates[b.postId]?.status === "error" && (
                              <button
                                onClick={() => handleGenerateImage(b.postId, b.enhancedPrompt)}
                                className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                              >
                                Tentar novamente
                              </button>
                            )}
                          </div>

                          {imageStates[b.postId]?.status === "generating" && (
                            <div className="rounded-[8px] bg-[var(--bg)] border border-[var(--border)] py-8 flex flex-col items-center gap-3">
                              <span className="w-5 h-5 border-2 border-[var(--navy)] border-t-transparent rounded-full animate-spin" />
                              <p className="text-[12px] text-[var(--text-muted)]">Gerando imagem com DALL‑E 3…</p>
                            </div>
                          )}

                          {imageStates[b.postId]?.status === "error" && (
                            <div className="rounded-[8px] bg-[var(--danger-bg)] border border-[#FECACA] px-4 py-3 flex items-start gap-2">
                              <span className="text-[var(--danger)] shrink-0 mt-px">⚠</span>
                              <p className="text-[12px] text-[var(--danger)] leading-snug">{imageStates[b.postId].error}</p>
                            </div>
                          )}

                          {imageStates[b.postId]?.status === "done" && imageStates[b.postId].url && (
                            <div className="space-y-3">
                              <img
                                src={imageStates[b.postId].url}
                                alt={b.title}
                                className="w-full rounded-[8px] border border-[var(--border)] shadow-sm"
                              />
                              {saveForms[b.postId]?.saved ? (
                                <div className="rounded-[7px] bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-2.5 flex items-center gap-2">
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M2.5 7.5l3 3 6-6" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <p className="text-[12px] text-[var(--success)] font-medium">Salvo no projeto como entrega de Design · Em Revisão</p>
                                </div>
                              ) : (
                                <div className="rounded-[7px] bg-[var(--bg)] border border-[var(--border)] p-3.5 space-y-2.5">
                                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Salvar Imagem no Projeto</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Nome</label>
                                      <input
                                        value={saveForms[b.postId]?.name ?? b.title}
                                        onChange={(e) => setSaveForms((prev) => ({ ...prev, [b.postId]: { ...prev[b.postId], name: e.target.value } }))}
                                        className="w-full h-7 px-2 text-[12px] bg-white border border-[var(--border)] rounded-[5px] outline-none focus:border-[var(--navy)]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Projeto</label>
                                      <select
                                        value={saveForms[b.postId]?.projectId ?? ""}
                                        onChange={(e) => setSaveForms((prev) => ({ ...prev, [b.postId]: { ...prev[b.postId], projectId: e.target.value } }))}
                                        className="w-full h-7 px-2 text-[12px] bg-white border border-[var(--border)] rounded-[5px] outline-none focus:border-[var(--navy)]"
                                      >
                                        <option value="">— selecione —</option>
                                        {projects.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <button
                                    disabled={!saveForms[b.postId]?.projectId || !saveForms[b.postId]?.name}
                                    onClick={() => handleSaveDeliverable(b.postId)}
                                    className="w-full h-7 rounded-[5px] text-[12px] font-medium bg-[var(--text-primary)] text-white hover:bg-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Salvar como Entrega
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 3 — Layout Structure */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">3</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Estrutura de Layout</p>
                          </div>
                          <div className="space-y-2">
                            {b.layoutStructure.map((slide, i) => (
                              <div key={i} className="flex gap-3">
                                <span className="shrink-0 w-5 h-5 rounded-[4px] bg-[var(--accent)] text-[10px] font-semibold text-[var(--text-secondary)] flex items-center justify-center mt-0.5">
                                  {i + 1}
                                </span>
                                <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{slide}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Design Specs */}
              {activeTab === "specs" && (
                <div className="space-y-4">
                  {briefs.map((b) => (
                    <div key={b.postId} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-semibold text-[#0E7C75] bg-[#E6FBFA] px-2 py-0.5 rounded-[4px]">
                          BRIEF_{String(b.postId).padStart(2, "0")}
                        </span>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{b.title}</p>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">{b.format}</span>
                      </div>
                      <div className="divide-y divide-[var(--border)]">
                        {/* 4 — Design Instructions */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">4</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Instruções de Design</p>
                          </div>
                          <div className="space-y-3">
                            {([
                              { key: "Tipografia",       value: b.designInstructions.typography },
                              { key: "Espaçamento",      value: b.designInstructions.spacing },
                              { key: "Composição",       value: b.designInstructions.composition },
                              { key: "Hierarquia visual", value: b.designInstructions.visualHierarchy },
                            ] as { key: string; value: string }[]).map(({ key, value }) => (
                              <div key={key} className="grid grid-cols-[120px_1fr] gap-3 items-start">
                                <p className="text-[11px] font-semibold text-[var(--text-muted)] pt-px">{key}</p>
                                <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* 5 — Style Consistency */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">5</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Notas de Consistência de Marca</p>
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{b.styleConsistency}</p>
                        </div>
                        {/* Copy placement guidance */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">6</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Orientações de Copy</p>
                          </div>
                          <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{b.designInstructions.visualHierarchy}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-2 py-0.5 rounded-[3px]">Formato: {b.format}</span>
                            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-2 py-0.5 rounded-[3px]">Proporção: {b.format.toLowerCase().includes("story") ? "9:16" : "1:1"}</span>
                          </div>
                        </div>
                        {/* Brand consistency */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#E6FBFA] text-[#0E7C75] text-[9px] font-bold flex items-center justify-center">7</span>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Notas de Consistência de Marca</p>
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{b.styleConsistency}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
