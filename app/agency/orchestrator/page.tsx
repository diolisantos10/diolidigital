"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";
import Badge from "@/components/agency/ui/Badge";
import Link from "next/link";
import { Priority, ProjectStage, MOCK_AGENTS, ProjectProposal } from "@/lib/agency/mock-data";
import IntakeEngine, { IntakeSummary, IntakePrefill } from "@/components/agency/intake/IntakeEngine";

type OrchestratorState = "idle" | "reviewing" | "analyzing" | "ready" | "approved";
type InputMode = "form" | "voice" | "audio";

// ─── Normalized briefing shape ────────────────────────────────────────────────
// All 3 input modes will eventually produce this object.

interface Briefing {
  clientId: string;
  services: string[];
  businessDescription: string;
  objective: string;
  targetAudience: string;
  channels: string[];
  deadline: string;
  notes: string;
}

const EMPTY_BRIEFING: Briefing = {
  clientId: "",
  services: [],
  businessDescription: "",
  objective: "",
  targetAudience: "",
  channels: [],
  deadline: "",
  notes: "",
};

interface OrchestratorPlan {
  pipeline: ProjectStage[];
  agents: string[];
  tasks: Array<{ title: string; description: string; agentId: string; stage: string; dueDate: string }>;
  risks: Array<{ level: "high" | "medium" | "low"; message: string }>;
}

// ─── Service-based plan generation ───────────────────────────────────────────

function briefingToAgents(b: Briefing): string[] {
  const set = new Set<string>();
  set.add("a6"); // Research — always included for diagnosis
  for (const svc of b.services) {
    if (svc === "social_media") { set.add("a3"); set.add("a1"); set.add("a2"); }
    if (svc === "ads")          { set.add("a4"); set.add("a1"); set.add("a2"); }
    if (svc === "seo")          { set.add("a8"); set.add("a1"); }
    if (svc === "branding")     { set.add("a2"); set.add("a1"); }
    if (svc === "content")      { set.add("a5"); set.add("a1"); }
  }
  if (set.has("a2") || set.has("a1")) set.add("a7"); // QA when there are production agents
  return Array.from(set);
}

function briefingToTasks(b: Briefing): OrchestratorPlan["tasks"] {
  const baseDate = b.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const d = new Date(baseDate);
  const offset = (days: number) => new Date(d.getTime() - days * 86400000).toISOString().slice(0, 10);

  const tasks: OrchestratorPlan["tasks"] = [];

  tasks.push({
    title: "Project briefing & context analysis",
    description: `Analyze client context, competitive landscape, and strategic opportunity for: ${b.objective || "defined objective"}.`,
    agentId: "a6", stage: "diagnosis", dueDate: offset(22),
  });

  if (b.services.includes("branding")) {
    tasks.push({ title: "Brand audit & positioning", description: "Audit brand equity, map competitive landscape, and define positioning pillars.", agentId: "a6", stage: "diagnosis", dueDate: offset(19) });
    tasks.push({ title: "Visual identity design", description: "Design logo, color palette, typography, and brand mark.", agentId: "a2", stage: "production", dueDate: offset(12) });
    tasks.push({ title: "Brand voice & messaging", description: "Define tone of voice, key messages, and language guidelines.", agentId: "a1", stage: "production", dueDate: offset(9) });
    tasks.push({ title: "Brand guidelines document", description: "Compile all elements into comprehensive brand guidelines.", agentId: "a7", stage: "review", dueDate: offset(5) });
  }

  if (b.services.includes("seo")) {
    tasks.push({ title: "SEO audit & keyword research", description: "Full technical SEO audit and priority keyword identification.", agentId: "a8", stage: "diagnosis", dueDate: offset(20) });
    tasks.push({ title: "Content strategy & briefs", description: "Map keywords to content opportunities and write content briefs.", agentId: "a8", stage: "planning", dueDate: offset(14) });
    tasks.push({ title: "SEO content production", description: "Write SEO-optimized articles and landing page copy.", agentId: "a1", stage: "production", dueDate: offset(7) });
  }

  if (b.services.includes("ads")) {
    tasks.push({ title: "Paid media strategy & audience setup", description: "Define campaign structure, audience segments, bidding strategy, and ad placements.", agentId: "a4", stage: "planning", dueDate: offset(16) });
    tasks.push({ title: "Ad copy & creative assets", description: "Write all ad copy variants and design visual assets for all placements.", agentId: "a1", stage: "production", dueDate: offset(10) });
    tasks.push({ title: "Campaign setup & launch", description: "Set up all ad accounts, tracking pixels, audiences, and launch campaigns.", agentId: "a4", stage: "production", dueDate: offset(6) });
  }

  if (b.services.includes("social_media")) {
    tasks.push({ title: "Social media strategy & content calendar", description: "Define channel strategy, content themes, posting cadence, and 30-day content calendar.", agentId: "a3", stage: "planning", dueDate: offset(17) });
    tasks.push({ title: "Social media copy & captions", description: "Write all social posts, captions, hashtags, and story scripts.", agentId: "a1", stage: "production", dueDate: offset(10) });
    tasks.push({ title: "Social media visual assets", description: "Design all visual content: feed posts, stories, cover images.", agentId: "a2", stage: "production", dueDate: offset(7) });
  }

  if (b.services.includes("content")) {
    tasks.push({ title: "Content strategy", description: "Define content pillars, formats, distribution channels, and editorial calendar.", agentId: "a5", stage: "planning", dueDate: offset(16) });
    tasks.push({ title: "Content production", description: "Write all content pieces: articles, landing pages, emails, and product copy.", agentId: "a1", stage: "production", dueDate: offset(8) });
  }

  tasks.sort((a, c) => (a.dueDate < c.dueDate ? -1 : 1));
  return tasks;
}

function briefingToPlan(b: Briefing): OrchestratorPlan {
  const agents = briefingToAgents(b);
  const tasks = briefingToTasks(b);

  const pipeline: ProjectStage[] = ["briefing", "diagnosis", "planning", "production"];
  if (b.services.some((s) => ["branding", "ads"].includes(s))) pipeline.push("review");
  if (b.services.some((s) => ["seo", "social_media"].includes(s))) pipeline.push("ongoing");
  else pipeline.push("delivery");

  const risks: OrchestratorPlan["risks"] = [];
  if (b.services.includes("branding"))
    risks.push({ level: "high", message: "Brand identity requires client approval at multiple stages — build in feedback time." });
  if (b.services.includes("ads"))
    risks.push({ level: "medium", message: "Ad performance depends on budget and audience quality — validate targeting assumptions early." });
  if (b.services.includes("seo"))
    risks.push({ level: "medium", message: "SEO results take 3–6 months to materialize — align client expectations upfront." });
  if (!b.deadline)
    risks.push({ level: "low", message: "No deadline set — consider adding one to ensure team prioritization." });

  return { pipeline, agents, tasks, risks };
}

// ─── Text parsing ─────────────────────────────────────────────────────────────
// Shared by Voice Description and Audio Upload modes.
// Each field draws from a distinct sentence; no duplication across fields.

function parseTextToBriefing(text: string, clientId: string): Briefing {
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const used = new Set<number>();

  // Take the first unused sentence matching a predicate, mark it used.
  const take = (test: (s: string) => boolean): string => {
    const idx = sentences.findIndex((s, i) => !used.has(i) && test(s));
    if (idx === -1) return "";
    used.add(idx);
    return sentences[idx];
  };

  // ── Target audience — must be explicitly stated ──────────────────────────
  const targetAudience = take((s) =>
    /target\s+audience|our\s+audience|targeting\s+|audience\s+is|aimed\s+at\b|for\s+(?:professionals|businesses|brands|women|men|startups)\b|\b\d{2}\s*(?:to|-)\s*\d{2}\b|millennials|gen\s*[zZ]\b|b2b\b|b2c\b/i.test(s)
  );

  // ── Business description — "is a/an", company-type nouns, no action intent ─
  const businessDescription = take((s) =>
    /\bis\s+an?\b|\bthey(?:'re| are)\s+an?\b|\bit'?s\s+an?\b|\bcompany\b|\bstartup\b|\bplatform\b|\bapp\b|\bstudio\b|\bfirm\b|\bshop\b|\bstore\b/i.test(s) &&
    !/^we\s+(?:need|want|are)\b|need\s+(?:a|to)\s|want\s+(?:a|to)\s|looking\s+to\b|aim\s+(?:is|to)\b|goal\s+(?:is|to)\b|increase\b|generate\b|drive\s+|launch\s+(?:a|the)\b|boost\b|rebrand\b/i.test(s)
  );

  // ── Objective — explicit goal structure only; no sentence[0] fallback ─────
  const objective = take((s) =>
    /(?:goal|objective|aim|purpose)\s+(?:is\s+)?to\b/i.test(s) ||
    /\bwe\s+(?:want|need|are\s+looking)\s+to\b/i.test(s) ||
    /\bto\s+(?:increase|grow|generate|drive|boost|launch|build|establish|improve|scale|expand|create\s+awareness)\b/i.test(s)
  );

  // ── Notes — execution details, style cues, constraints ────────────────────
  const notesParts: string[] = [];
  sentences.forEach((s, i) => {
    if (used.has(i)) return;
    // Explicit "Notes:" label
    if (/^notes?\s*[:—–]/i.test(s)) {
      notesParts.push(s.replace(/^notes?\s*[:—–]\s*/i, "").trim());
      used.add(i);
      return;
    }
    // Execution/style/constraint signals
    if (/transform\b|visual\s+style|\bstyle\s+(?:is|should|must)\b|use\s+(?:of\s+)?(?:models?|photos?|images?|\bai\b)|image\s+qualit|\bformat\s+(?:is|should)\b|constraint|budget\s+is|\btone\s+(?:is|should)\b|\bavoid\b|must\s+(?:be|use|have)\b|nothing\s+too\b|clean\s+look\b|bold\s+visual|minimal\b.*(?:clean|look|style)/i.test(s)) {
      notesParts.push(s);
      used.add(i);
    }
  });
  const notes = notesParts.join(" ");

  // ── Services — intent-first; require specific signals, avoid loose matches ─
  const services: string[] = [];
  // Social media: organic posting/growth intent, platform names not paired with "ads"
  if (/social\s+media\b|content\s+calendar\b|posting\s+(?:schedule|plan|strategy)\b|grow\s+(?:on\s+)?(?:instagram|linkedin|tiktok|facebook)\b|instagram(?!\s+ads?)\b|tiktok(?!\s+ads?)\b|facebook(?!\s+ads?)\b|redes\s+sociais\b/i.test(text)) services.push("social_media");
  // Ads: explicit paid media intent
  if (/\bads?\b|paid\s+media\b|advertising\b|google\s+ads\b|meta\s+ads\b|\bppc\b|performance\s+(?:campaign|marketing)\b|mídia\s+paga\b/i.test(text)) services.push("ads");
  // SEO: search-specific terms
  if (/\bseo\b|search\s+engine\s+optim|organic\s+search\b|keyword\s+rank/i.test(text)) services.push("seo");
  // Branding: identity work (not just "brand" appearing in any context)
  if (/\bbranding\b|\bbrand\s+(?:identity|guidelines|voice|system)\b|\blogo\b|visual\s+identity\b|\srebrand\b/i.test(text)) services.push("branding");
  // Content: written content production (not a stray "content" mention)
  if (/content\s+strateg|content\s+plan|blog\s+posts?\b|\barticles?\b|copywriting\b|landing\s+page\s+copy\b|email\s+copy\b|product\s+descri/i.test(text)) services.push("content");

  // ── Channels ──────────────────────────────────────────────────────────────
  const channels: string[] = [];
  if (/instagram/i.test(text)) channels.push("Instagram");
  if (/linkedin/i.test(text)) channels.push("LinkedIn");
  if (/facebook/i.test(text)) channels.push("Facebook");
  if (/\btiktok\b/i.test(text)) channels.push("TikTok");
  if (/\btwitter\b|x\.com/i.test(text)) channels.push("Twitter/X");
  if (/youtube/i.test(text)) channels.push("YouTube");
  if (/\bgoogle\b/i.test(text)) channels.push("Google");
  if (/\bemail\b/i.test(text)) channels.push("Email");

  // ── Deadline ──────────────────────────────────────────────────────────────
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  let deadline = "";
  const year = new Date().getFullYear();
  const monthMatch = lower.match(
    /(?:end\s+of|by|before|until|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/
  );
  if (monthMatch) {
    deadline = `${year}-${MONTHS[monthMatch[1]]}-28`;
  } else if (/next\s+month/i.test(lower)) {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    deadline = d.toISOString().slice(0, 10);
  } else {
    const weeksMatch = lower.match(/(\d+)\s*weeks?/);
    const monthsMatch = lower.match(/(\d+)\s*months?/);
    if (weeksMatch) {
      deadline = new Date(Date.now() + parseInt(weeksMatch[1]) * 7 * 86400000).toISOString().slice(0, 10);
    } else if (monthsMatch) {
      const d = new Date(); d.setMonth(d.getMonth() + parseInt(monthsMatch[1]));
      deadline = d.toISOString().slice(0, 10);
    }
  }

  return { clientId, services, objective, targetAudience, channels, deadline, businessDescription, notes };
}

// ─── Audio simulation ─────────────────────────────────────────────────────────

const MOCK_TRANSCRIPTS = [
  `So, basically what we need is a full social media campaign for the brand relaunch. The goal is to drive awareness and engagement — mainly on Instagram and LinkedIn. Our target audience is design-forward professionals, roughly 25 to 40 years old, based in urban centres in Brazil. We're thinking end of May as the deadline. Budget is lean, so we need creative that works hard. Notes: the client wants a bold visual direction, nothing too corporate.`,

  `Right, so the client is a B2B SaaS company in the HR space. They want to generate leads — ideally 300 qualified leads over a 6-week campaign. The channels are LinkedIn and Google Ads, maybe some email retargeting. The target audience is HR directors and People Ops managers at companies with 50 to 500 employees. Deadline is end of June. They also want SEO work done on their blog to support organic growth long-term.`,

  `We need a full branding project for a new food-tech startup. They're launching in 3 months, so the deadline is pretty tight. The objective is to build a strong visual identity and brand voice before the product launch. Target audience is health-conscious millennials, predominantly female, urban. Channels aren't fixed yet but they're planning TikTok and Instagram for launch. They also need content — product descriptions, landing page copy, that kind of thing.`,
];

function simulateTranscription(file: File): string {
  const idx = file.name.length % MOCK_TRANSCRIPTS.length;
  return MOCK_TRANSCRIPTS[idx];
}

// ─── Briefing helpers ─────────────────────────────────────────────────────────

function briefingToProjectType(b: Briefing): string {
  const first = b.services[0];
  if (!first) return "Campaign";
  return first === "social_media" ? "Social Media"
    : first === "ads"      ? "Paid Media"
    : first === "seo"      ? "SEO"
    : first === "branding" ? "Branding"
    : "Content";
}

// ─── Shared BriefingPreview component ────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  social_media: "Social Media", ads: "Ads", seo: "SEO", branding: "Branding", content: "Content",
};

function BriefingPreview({ briefing, subtitle }: { briefing: Briefing; subtitle: string }) {
  const Row = ({ label, value, detected }: { label: string; value: string; detected: boolean }) => (
    <div className="flex items-start gap-3 py-3 border-b border-[#F7F7F6] last:border-0">
      <div className="w-[130px] shrink-0">
        <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        {detected
          ? <p className="text-[13px] text-[#1A1A1A] leading-snug">{value}</p>
          : <p className="text-[12px] text-[#C0C0BC] italic">Not detected</p>
        }
      </div>
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        detected ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
      }`}>
        {detected ? "✓" : "—"}
      </span>
    </div>
  );

  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED] bg-[#FAFAF9]">
        <span className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">Parsed Brief Preview</span>
        <span className="text-[11px] text-[#9B9B95]">{subtitle}</span>
      </div>
      <div className="px-5">
        {/* Services */}
        <div className="flex items-start gap-3 py-3 border-b border-[#F7F7F6]">
          <div className="w-[130px] shrink-0 pt-0.5">
            <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Services</span>
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5">
            {briefing.services.length > 0
              ? briefing.services.map((s) => (
                  <span key={s} className="h-5 px-2 rounded-full text-[11px] font-medium bg-[#EEF0FF] text-[#5B5BD6]">
                    {SERVICE_LABELS[s] ?? s}
                  </span>
                ))
              : <span className="text-[12px] text-[#C0C0BC] italic">Not detected</span>
            }
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            briefing.services.length > 0 ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
          }`}>{briefing.services.length > 0 ? "✓" : "—"}</span>
        </div>
        <Row label="Objective"   value={briefing.objective}           detected={!!briefing.objective} />
        <Row label="Audience"    value={briefing.targetAudience}      detected={!!briefing.targetAudience} />
        {/* Channels */}
        <div className="flex items-start gap-3 py-3 border-b border-[#F7F7F6]">
          <div className="w-[130px] shrink-0 pt-0.5">
            <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Channels</span>
          </div>
          <div className="flex-1 min-w-0">
            {briefing.channels.length > 0
              ? <p className="text-[13px] text-[#1A1A1A]">{briefing.channels.join(" · ")}</p>
              : <p className="text-[12px] text-[#C0C0BC] italic">Not detected</p>
            }
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            briefing.channels.length > 0 ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
          }`}>{briefing.channels.length > 0 ? "✓" : "—"}</span>
        </div>
        <Row label="Deadline"    value={briefing.deadline}            detected={!!briefing.deadline} />
        <Row label="Description" value={briefing.businessDescription} detected={!!briefing.businessDescription} />
      </div>
    </div>
  );
}

// ─── Timer helper ─────────────────────────────────────────────────────────────

function formatTimer(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function OrchestratorPage() {
  const { clients, createProject, updateProject } = useAgencyStore();
  const router = useRouter();
  const [intakePhase, setIntakePhase] = useState<"intake" | "orchestrator">("intake");
  const [state, setState] = useState<OrchestratorState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("form");
  const [plan, setPlan] = useState<OrchestratorPlan | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioTranscribeState, setAudioTranscribeState] = useState<"idle" | "transcribing" | "done">("idle");
  const [audioTranscript, setAudioTranscript] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    priority: "high" as Priority,
  });

  const [briefing, setBriefing] = useState<Briefing>(EMPTY_BRIEFING);

  const [recordingState, setRecordingState] = useState<"idle" | "recording">("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recordingState]);

  const handleStartRecording = () => {
    setAudioFile(null);
    setAudioTranscript("");
    setAudioTranscribeState("idle");
    setRecordingSeconds(0);
    setRecordingState("recording");
  };

  const handleStopRecording = () => {
    const idx = recordingSeconds % MOCK_TRANSCRIPTS.length;
    setRecordingState("idle");
    setAudioTranscribeState("transcribing");
    setTimeout(() => {
      setAudioTranscript(MOCK_TRANSCRIPTS[idx]);
      setAudioTranscribeState("done");
    }, 2800);
  };

  useEffect(() => {
    if (state === "approved" && createdProjectId) {
      const timer = setTimeout(() => {
        router.push(`/agency/projects/${createdProjectId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state, createdProjectId, router]);

  const SERVICE_OPTIONS = [
    { id: "social_media", label: "Social Media" },
    { id: "ads",          label: "Ads" },
    { id: "seo",          label: "SEO" },
    { id: "branding",     label: "Branding" },
    { id: "content",      label: "Content" },
  ];

  // Structured form helpers — write to briefing state
  const setBriefingField = <K extends keyof Briefing>(key: K, value: Briefing[K]) => {
    setBriefing((prev) => ({ ...prev, [key]: value }));
  };

  const toggleService = (id: string) => {
    setBriefing((prev) => ({
      ...prev,
      services: prev.services.includes(id)
        ? prev.services.filter((s) => s !== id)
        : [...prev.services, id],
    }));
  };

  const handleGenerate = (b: Briefing) => {
    setBriefing(b);
    setState("analyzing");
    setTimeout(() => {
      setPlan(briefingToPlan(b));
      setState("ready");
    }, 2200);
  };

  // Voice / audio path: parse → show editable review step → user clicks Generate
  const handleParsed = (b: Briefing) => {
    setBriefing(b);
    setState("reviewing");
  };

  const handleApprove = () => {
    if (!plan) return;
    const projType = briefingToProjectType(briefing);
    const clientName = clients.find((c) => c.id === briefing.clientId)?.name ?? "Client";
    const deadline = briefing.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const id = createProject({
      name: `${projType} — ${clientName}`,
      clientId: briefing.clientId,
      goal: briefing.objective,
      type: projType,
      stage: "proposal_sent",
      priority: form.priority,
      deadline,
      agents: plan.agents,
      initialTasks: plan.tasks.map((t) => ({ title: t.title, description: t.description, agentId: t.agentId, dueDate: t.dueDate })),
      orchestratorBriefing: {
        services: briefing.services,
        businessDescription: briefing.businessDescription,
        objective: briefing.objective,
        targetAudience: briefing.targetAudience,
        channels: briefing.channels,
        deadline: briefing.deadline,
        notes: briefing.notes,
      },
    });

    // Generate mock proposal
    const serviceLabels: Record<string, string> = {
      social_media: "Social Media Management", branding: "Brand Identity",
      ads: "Paid Advertising", seo: "SEO", content: "Content Production", web: "Website",
    };
    const proposal: ProjectProposal = {
      scope: briefing.objective || `Full-service ${projType.toLowerCase()} engagement for ${clientName}.`,
      deliverables: briefing.services.map((s) => serviceLabels[s] ?? s),
      timeline: deadline ? `Project delivery by ${deadline}` : "Timeline to be confirmed",
      pricing: briefing.services.length <= 1 ? "€2,500 / month" : briefing.services.length <= 3 ? "€4,500 / month" : "€7,500 / month",
      status: "pending",
    };
    updateProject(id, { proposal });

    setCreatedProjectId(id);
    setState("approved");
  };

  const handleIntakeComplete = (_summary: IntakeSummary, prefill: IntakePrefill) => {
    setBriefing({
      clientId: prefill.clientId,
      services: prefill.services,
      businessDescription: prefill.businessDescription,
      objective: prefill.objective,
      targetAudience: prefill.targetAudience,
      channels: prefill.channels,
      deadline: prefill.deadline,
      notes: prefill.notes,
    });
    setIntakePhase("orchestrator");
  };

  const handleReset = () => {
    setState("idle"); setPlan(null); setCreatedProjectId(null);
    setAudioFile(null); setAudioTranscribeState("idle"); setAudioTranscript("");
    setRecordingState("idle"); setRecordingSeconds(0);
    setBriefing(EMPTY_BRIEFING);
    setForm({ clientId: "", priority: "high" });
  };

  const handleAudioTranscribe = () => {
    if (!audioFile) return;
    setAudioTranscribeState("transcribing");
    setTimeout(() => {
      setAudioTranscript(simulateTranscription(audioFile));
      setAudioTranscribeState("done");
    }, 2800);
  };


  const STEP_LABELS = ["Receive Brief", "Analyze Context", "Generate Pipeline", "Assign Agents", "Activate"];
  const STEP_STATES = { idle: -1, reviewing: 0, analyzing: 1, ready: 3, approved: 4 };
  const activeStep = STEP_STATES[state];

  return (
    <>
      <AgencyHeader
        title="Orchestrator"
        subtitle={intakePhase === "intake" ? "Step 1 of 2 — Capture and validate client context before generating an execution plan." : "Step 2 of 2 — Review the execution plan and approve it to create the project."}
      />

      {/* ── INTAKE PHASE ────────────────────────────────────────────────────── */}
      {intakePhase === "intake" && (
        <div className="mb-2">
          <IntakeEngine clients={clients} onComplete={handleIntakeComplete} />
        </div>
      )}

      {/* ── ORCHESTRATOR PHASE ──────────────────────────────────────────────── */}
      {intakePhase === "orchestrator" && (
      <>
      {/* Intake complete banner */}
      <div className="flex items-center justify-between mb-5 px-4 py-2.5 bg-[#DCFCE7] border border-[#BBF7D0] rounded-[8px]">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
            <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
              <path d="M1 3.5l2 2 4-4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="text-[12px] font-medium text-[#15803D]">Intake complete — brief pre-filled from your intake session.</span>
        </div>
        <button
          onClick={() => { setIntakePhase("intake"); setState("idle"); setPlan(null); setBriefing(EMPTY_BRIEFING); }}
          className="text-[11px] text-[#15803D] hover:text-[#166534] font-medium transition-colors"
        >
          ← Revise Intake
        </button>
      </div>

      {/* How it works strip */}
      <div className="flex items-center gap-0 mb-8 bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${
                i <= activeStep
                  ? "bg-[#5B5BD6] text-white"
                  : "bg-[#F0F0ED] text-[#9B9B95]"
              } ${state === "analyzing" && i === 1 ? "animate-pulse" : ""}`}>
                {i + 1}
              </div>
              <span className={`text-[12px] font-medium truncate ${i <= activeStep ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`flex-1 mx-3 h-[1px] transition-all ${i < activeStep ? "bg-[#5B5BD6]" : "bg-[#E5E5E2]"}`} />
            )}
          </div>
        ))}
      </div>

      {state === "approved" ? (
        /* Approved state */
        <div className="bg-white rounded-[10px] border border-[#5B5BD6] px-8 py-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
              <path d="M2 9l6 6L20 2" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-[18px] font-semibold text-[#1A1A1A] mb-2">Execution plan approved</h2>
          <p className="text-[14px] text-[#6B6B65] mb-8">The project has been created and is now active in your pipeline.</p>
          <div className="flex items-center justify-center gap-3">
            {createdProjectId && (
              <Link href={`/agency/projects/${createdProjectId}`}>
                <Button variant="primary">View Project</Button>
              </Link>
            )}
            <Button variant="secondary" onClick={handleReset}>Start New Brief</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[420px_1fr] gap-6">
          {/* Input panel */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit overflow-hidden">

            {/* Mode switcher */}
            <div className="flex border-b border-[#F0F0ED]">
              {([
                { id: "form",  label: "Structured Form", icon: "⊞" },
                { id: "voice", label: "Voice Description", icon: "◎" },
                { id: "audio", label: "Audio Upload",     icon: "♪" },
              ] as { id: InputMode; label: string; icon: string }[]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { if (state === "idle") setInputMode(m.id); }}
                  disabled={state !== "idle"}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium transition-colors border-b-2 -mb-[1px] ${
                    inputMode === m.id
                      ? "border-[#5B5BD6] text-[#5B5BD6]"
                      : "border-transparent text-[#9B9B95] hover:text-[#6B6B65]"
                  } disabled:opacity-50`}
                >
                  <span className="text-[13px]">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4">

            {/* ── MODE: Structured Form ── */}
            {inputMode === "form" && (
              <div className="space-y-4">

                {/* Client */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Client *</label>
                  <select
                    value={briefing.clientId}
                    onChange={(e) => setBriefingField("clientId", e.target.value)}
                    disabled={state !== "idle"}
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                  >
                    <option value="">Select client...</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Services multi-select */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                    Services *
                    {briefing.services.length > 0 && (
                      <span className="ml-1.5 text-[11px] font-normal text-[#9B9B95]">({briefing.services.length} selected)</span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_OPTIONS.map((svc) => {
                      const active = briefing.services.includes(svc.id);
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => { if (state === "idle") toggleService(svc.id); }}
                          disabled={state !== "idle"}
                          className={`h-7 px-3 rounded-full text-[12px] font-medium border transition-all disabled:opacity-50 ${
                            active
                              ? "bg-[#5B5BD6] border-[#5B5BD6] text-white"
                              : "bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
                          }`}
                        >
                          {svc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Business description */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Business Description</label>
                  <textarea
                    value={briefing.businessDescription}
                    onChange={(e) => setBriefingField("businessDescription", e.target.value)}
                    disabled={state !== "idle"}
                    placeholder="What does the client do? Their industry, product, or service."
                    rows={2}
                    className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Objective */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Objective *</label>
                  <textarea
                    value={briefing.objective}
                    onChange={(e) => setBriefingField("objective", e.target.value)}
                    disabled={state !== "idle"}
                    placeholder="What is the measurable goal? e.g. increase brand awareness, generate 200 leads."
                    rows={2}
                    className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Target audience */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Target Audience</label>
                  <input
                    value={briefing.targetAudience}
                    onChange={(e) => setBriefingField("targetAudience", e.target.value)}
                    disabled={state !== "idle"}
                    placeholder="e.g. Design professionals, 25–40, urban Brazil"
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                  />
                </div>

                {/* Channels */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Channels</label>
                  <input
                    value={briefing.channels.join(", ")}
                    onChange={(e) => setBriefingField("channels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    disabled={state !== "idle"}
                    placeholder="e.g. Instagram, LinkedIn, Google Ads"
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                  />
                </div>

                {/* Deadline + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Deadline <span className="font-normal text-[#9B9B95]">(optional)</span></label>
                    <input
                      type="date"
                      value={briefing.deadline}
                      onChange={(e) => setBriefingField("deadline", e.target.value)}
                      disabled={state !== "idle"}
                      className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as Priority }))}
                      disabled={state !== "idle"}
                      className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Notes</label>
                  <textarea
                    value={briefing.notes}
                    onChange={(e) => setBriefingField("notes", e.target.value)}
                    disabled={state !== "idle"}
                    placeholder="Constraints, references, budget, context…"
                    rows={2}
                    className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50 resize-none"
                  />
                </div>

                {state === "idle" && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() => handleGenerate(briefing)}
                    disabled={!briefing.clientId || !briefing.objective || briefing.services.length === 0}
                  >
                    Run Orchestrator
                  </Button>
                )}
                {state !== "idle" && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">
                    Reset
                  </Button>
                )}
              </div>
            )}

            {/* ── MODE: Voice Description ── */}
            {inputMode === "voice" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                    Describe the project in your own words
                  </label>
                  <textarea
                    value={voiceText}
                    onChange={(e) => setVoiceText(e.target.value)}
                    disabled={state !== "idle"}
                    placeholder={"e.g. \"We need a social media campaign for Nova Studio launching next month. The goal is to drive awareness among design-forward audiences on Instagram and LinkedIn. Deadline is end of April.\""}
                    rows={10}
                    className="w-full px-3 py-2.5 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50 resize-none leading-relaxed"
                  />
                  {voiceText.trim() && (
                    <p className="text-[11px] text-[#9B9B95] mt-1">
                      Preview updates live →
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Client *</label>
                  <select
                    value={form.clientId}
                    onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                    disabled={state !== "idle"}
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                  >
                    <option value="">Select client...</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {state === "idle" && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={!voiceText.trim() || !form.clientId}
                    onClick={() => {
                      const b = parseTextToBriefing(voiceText, form.clientId);
                      handleParsed({ ...b, objective: b.objective || voiceText.slice(0, 200) });
                    }}
                  >
                    Parse Brief
                  </Button>
                )}
                {state !== "idle" && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">Reset</Button>
                )}
              </div>
            )}

            {/* ── MODE: Audio Upload / Record ── */}
            {inputMode === "audio" && (
              <div className="space-y-4">

                {/* ── Recording active ── */}
                {recordingState === "recording" && (
                  <div className="flex flex-col items-center gap-4 px-6 py-8 bg-[#FEF2F2] border-2 border-[#FCA5A5] rounded-[10px]">
                    {/* Waveform */}
                    <div className="flex items-center gap-[3px] h-10">
                      {[5, 9, 6, 14, 8, 12, 5, 16, 7, 11, 6, 13, 8, 10, 5].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 rounded-full bg-[#EF4444] animate-pulse"
                          style={{
                            height: `${h * 2}px`,
                            animationDuration: `${500 + (i % 4) * 180}ms`,
                            animationDelay: `${i * 60}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold text-[#EF4444]">Recording…</p>
                      <p className="text-[12px] text-[#9B9B95] mt-0.5 tabular-nums">{formatTimer(recordingSeconds)}</p>
                    </div>
                    <button
                      onClick={handleStopRecording}
                      className="h-8 px-5 rounded-[7px] bg-[#EF4444] hover:bg-[#DC2626] text-white text-[12px] font-semibold transition-colors"
                    >
                      Stop Recording
                    </button>
                  </div>
                )}

                {/* ── Upload zone — hidden while recording or after transcription ── */}
                {audioTranscribeState !== "done" && recordingState === "idle" && (
                  <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-[10px] px-6 py-8 cursor-pointer transition-colors ${
                    audioFile ? "border-[#5B5BD6] bg-[#EEF0FF]/40" : "border-[#E5E5E2] hover:border-[#C0C0BA] bg-[#FAFAF9]"
                  } ${audioTranscribeState === "transcribing" ? "pointer-events-none" : ""}`}>
                    <input
                      type="file"
                      accept=".mp3,.m4a,.wav,.ogg,.webm"
                      className="sr-only"
                      onChange={(e) => {
                        setAudioFile(e.target.files?.[0] ?? null);
                        setAudioTranscribeState("idle");
                        setAudioTranscript("");
                      }}
                      disabled={audioTranscribeState === "transcribing"}
                    />
                    {audioFile ? (
                      <>
                        <div className={`w-10 h-10 rounded-full bg-[#EEF0FF] flex items-center justify-center ${audioTranscribeState === "transcribing" ? "animate-pulse" : ""}`}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M9 2C6.24 2 4 4.24 4 7v4c0 2.76 2.24 5 5 5s5-2.24 5-5V7c0-2.76-2.24-5-5-5z" stroke="#5B5BD6" strokeWidth="1.3"/>
                            <path d="M2 9.5C2 13.09 4.91 16 8.5 16h1C13.09 16 16 13.09 16 9.5" stroke="#5B5BD6" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="text-center">
                          <p className="text-[13px] font-medium text-[#5B5BD6]">{audioFile.name}</p>
                          <p className="text-[11px] text-[#9B9B95] mt-0.5">
                            {(audioFile.size / 1024).toFixed(0)} KB ·{" "}
                            {audioTranscribeState === "transcribing" ? "Transcribing…" : "Ready to transcribe"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-[#F0F0ED] flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M9 2C6.24 2 4 4.24 4 7v4c0 2.76 2.24 5 5 5s5-2.24 5-5V7c0-2.76-2.24-5-5-5z" stroke="#9B9B95" strokeWidth="1.3"/>
                            <path d="M2 9.5C2 13.09 4.91 16 8.5 16h1C13.09 16 16 13.09 16 9.5" stroke="#9B9B95" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="text-center">
                          <p className="text-[13px] font-medium text-[#1A1A1A]">Drop audio file here</p>
                          <p className="text-[11px] text-[#9B9B95] mt-0.5">MP3, M4A, WAV, OGG supported</p>
                        </div>
                      </>
                    )}
                  </label>
                )}

                {/* ── Record button — shown when idle, no file, not transcribed ── */}
                {audioTranscribeState === "idle" && recordingState === "idle" && !audioFile && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[1px] bg-[#F0F0ED]" />
                      <span className="text-[11px] text-[#C0C0BC]">or</span>
                      <div className="flex-1 h-[1px] bg-[#F0F0ED]" />
                    </div>
                    <button
                      onClick={handleStartRecording}
                      className="w-full h-10 flex items-center justify-center gap-2.5 rounded-[8px] border border-[#E5E5E2] bg-white hover:border-[#EF4444] hover:bg-[#FEF2F2] text-[#6B6B65] hover:text-[#EF4444] text-[13px] font-medium transition-all group"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#EF4444] group-hover:animate-pulse" />
                      Record Audio
                    </button>
                  </>
                )}

                {/* ── Transcribe button (upload path) ── */}
                {audioFile && audioTranscribeState === "idle" && recordingState === "idle" && (
                  <Button variant="secondary" size="lg" className="w-full" onClick={handleAudioTranscribe}>
                    Transcribe Audio
                  </Button>
                )}

                {/* ── Transcribing animation (shared by upload + record) ── */}
                {audioTranscribeState === "transcribing" && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-[#EEF0FF] rounded-[8px]">
                    <div className="flex gap-1 shrink-0">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1 h-4 bg-[#5B5BD6] rounded-full animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                    <p className="text-[12px] font-medium text-[#5B5BD6]">Transcribing audio…</p>
                  </div>
                )}

                {/* ── Transcript output (shared by upload + record) ── */}
                {audioTranscribeState === "done" && (
                  <>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                          <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
                            <path d="M1 3.5l2 2 4-4" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        <span className="text-[12px] font-medium text-[#1A1A1A]">Transcription complete</span>
                      </div>
                      <button
                        className="text-[11px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors"
                        onClick={() => {
                          setAudioFile(null); setAudioTranscribeState("idle"); setAudioTranscript("");
                          setRecordingState("idle"); setRecordingSeconds(0);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] px-3 py-2.5">
                      <p className="text-[12px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{audioTranscript}</p>
                    </div>
                  </>
                )}

                {/* ── Client + CTA — visible after transcription ── */}
                {audioTranscribeState === "done" && (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Client *</label>
                      <select
                        value={form.clientId}
                        onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                        disabled={state !== "idle"}
                        className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                      >
                        <option value="">Select client...</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={!form.clientId || state !== "idle"}
                      onClick={() => {
                        const b = parseTextToBriefing(audioTranscript, form.clientId);
                        handleParsed({ ...b, objective: b.objective || audioTranscript.slice(0, 200) });
                      }}
                    >
                      Review Briefing
                    </Button>
                  </>
                )}

                {state !== "idle" && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">Reset</Button>
                )}
              </div>
            )}

            </div>
          </div>

          {/* Output panel */}
          <div>
            {state === "idle" && (() => {
              // Audio mode after transcription → show parsed preview
              const previewText =
                inputMode === "voice" && voiceText.trim() ? voiceText
                : inputMode === "audio" && audioTranscribeState === "done" ? audioTranscript
                : null;

              if (previewText) {
                return (
                  <BriefingPreview
                    briefing={parseTextToBriefing(previewText, "")}
                    subtitle={inputMode === "voice" ? "Updates as you type" : "Parsed from transcript"}
                  />
                );
              }
              // Default idle placeholder
              return (
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
                    {inputMode === "voice"
                      ? "Start typing your project description — a parsed preview will appear here."
                      : inputMode === "audio"
                      ? "Upload and transcribe an audio brief — the parsed preview will appear here."
                      : "Fill in the client, goal, and deadline — then run the Orchestrator to generate an execution plan."}
                  </p>
                </div>
              );
            })()}

            {state === "reviewing" && (
              <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED] bg-[#FAFAF9]">
                  <span className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">Parsed Briefing</span>
                  <span className="text-[11px] text-[#9B9B95]">Review and adjust before generating</span>
                </div>

                {/* ── Briefing quality indicator ── */}
                {(() => {
                  const fields: Array<{ label: string; points: number; filled: boolean }> = [
                    { label: "Objective",       points: 20, filled: briefing.objective.trim().length >= 15 },
                    { label: "Target audience", points: 20, filled: !!briefing.targetAudience.trim() },
                    { label: "Services",        points: 20, filled: briefing.services.length > 0 },
                    { label: "Channels",        points: 15, filled: briefing.channels.length > 0 },
                    { label: "Notes",           points: 15, filled: !!briefing.notes.trim() },
                    { label: "Deadline",        points: 10, filled: !!briefing.deadline },
                  ];
                  const score = fields.filter((f) => f.filled).reduce((s, f) => s + f.points, 0);
                  const color =
                    score >= 80 ? { bar: "bg-[#16A34A]", text: "text-[#16A34A]", badge: "bg-[#DCFCE7] text-[#16A34A]" }
                    : score >= 50 ? { bar: "bg-[#D97706]", text: "text-[#D97706]", badge: "bg-[#FEF3C7] text-[#D97706]" }
                    :               { bar: "bg-[#DC2626]", text: "text-[#DC2626]", badge: "bg-[#FEE2E2] text-[#DC2626]" };
                  const missing = fields.filter((f) => !f.filled);
                  const done    = fields.filter((f) =>  f.filled);

                  return (
                    <div className="px-5 py-3.5 border-b border-[#F0F0ED] bg-[#FAFAF9] space-y-2.5">
                      {/* Score row */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Briefing Quality</span>
                        <span className={`text-[12px] font-bold tabular-nums ${color.text}`}>{score}%</span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${color.bar}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      {/* Field checklist */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                        {done.map((f) => (
                          <span key={f.label} className="flex items-center gap-1 text-[11px] text-[#6B6B65]">
                            <span className="text-[#16A34A]">✓</span> {f.label}
                          </span>
                        ))}
                        {missing.map((f) => (
                          <span key={f.label} className="flex items-center gap-1 text-[11px] text-[#9B9B95]">
                            <span className={color.text}>–</span> {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="px-5 py-4 space-y-4">

                  {/* Services */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                      Services
                      {briefing.services.length > 0 && (
                        <span className="ml-1.5 text-[11px] font-normal text-[#9B9B95]">({briefing.services.length} selected)</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_OPTIONS.map((svc) => {
                        const active = briefing.services.includes(svc.id);
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => toggleService(svc.id)}
                            className={`h-7 px-3 rounded-full text-[12px] font-medium border transition-all ${
                              active
                                ? "bg-[#5B5BD6] border-[#5B5BD6] text-white"
                                : "bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
                            }`}
                          >
                            {svc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Objective */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Objective</label>
                    <textarea
                      value={briefing.objective}
                      onChange={(e) => setBriefingField("objective", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                    />
                  </div>

                  {/* Business description */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Business Description</label>
                    <textarea
                      value={briefing.businessDescription}
                      onChange={(e) => setBriefingField("businessDescription", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                    />
                  </div>

                  {/* Target audience */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Target Audience</label>
                    <input
                      value={briefing.targetAudience}
                      onChange={(e) => setBriefingField("targetAudience", e.target.value)}
                      className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                    />
                  </div>

                  {/* Channels + Deadline */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Channels</label>
                      <input
                        value={briefing.channels.join(", ")}
                        onChange={(e) => setBriefingField("channels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                        placeholder="e.g. Instagram, LinkedIn"
                        className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Deadline</label>
                      <input
                        type="date"
                        value={briefing.deadline}
                        onChange={(e) => setBriefingField("deadline", e.target.value)}
                        className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Notes</label>
                    <textarea
                      value={briefing.notes}
                      onChange={(e) => setBriefingField("notes", e.target.value)}
                      rows={2}
                      placeholder="Constraints, references, budget, context…"
                      className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                    />
                  </div>

                  {/* ── Guided questions for missing / weak fields ── */}
                  {(() => {
                    type SuggestedQuestion = {
                      field: "objective" | "targetAudience" | "channels" | "deadline";
                      question: string;
                      placeholder: string;
                    };
                    const questions: SuggestedQuestion[] = [];
                    if (!briefing.objective || briefing.objective.trim().length < 15)
                      questions.push({ field: "objective",      question: "What is the main goal of this project?",      placeholder: "e.g. Grow our Instagram following, generate 200 qualified leads, launch the new collection." });
                    if (!briefing.targetAudience)
                      questions.push({ field: "targetAudience", question: "Who is the target audience?",                 placeholder: "e.g. Urban professionals 25–40, health-conscious millennials, HR directors at mid-size companies" });
                    if (briefing.channels.length === 0)
                      questions.push({ field: "channels",       question: "Which channels will this run on?",            placeholder: "e.g. Instagram, LinkedIn, Google Ads" });
                    if (!briefing.deadline)
                      questions.push({ field: "deadline",       question: "Is there a target deadline?",                placeholder: "" });

                    if (questions.length === 0) return null;

                    return (
                      <div className="border-t border-[#F0F0ED] pt-4 space-y-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Refine your briefing</span>
                          <span className="w-[18px] h-[18px] rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-bold flex items-center justify-center shrink-0">
                            {questions.length}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9B9B95] -mt-1">These fields are missing or incomplete — answers update the form above.</p>
                        {questions.map((q) => (
                          <div key={q.field}>
                            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">{q.question}</label>
                            {q.field === "objective" ? (
                              <textarea
                                value={briefing.objective}
                                onChange={(e) => setBriefingField("objective", e.target.value)}
                                placeholder={q.placeholder}
                                rows={2}
                                className="w-full px-3 py-2 text-[13px] bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] outline-none focus:border-[#F59E0B] focus:bg-white resize-none transition-colors"
                              />
                            ) : q.field === "deadline" ? (
                              <input
                                type="date"
                                value={briefing.deadline}
                                onChange={(e) => setBriefingField("deadline", e.target.value)}
                                className="w-full h-8 px-3 text-[13px] bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] outline-none focus:border-[#F59E0B] focus:bg-white transition-colors"
                              />
                            ) : q.field === "channels" ? (
                              <input
                                value={briefing.channels.join(", ")}
                                onChange={(e) => setBriefingField("channels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                                placeholder={q.placeholder}
                                className="w-full h-8 px-3 text-[13px] bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] outline-none focus:border-[#F59E0B] focus:bg-white transition-colors"
                              />
                            ) : (
                              <input
                                value={briefing.targetAudience}
                                onChange={(e) => setBriefingField("targetAudience", e.target.value)}
                                placeholder={q.placeholder}
                                className="w-full h-8 px-3 text-[13px] bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] outline-none focus:border-[#F59E0B] focus:bg-white transition-colors"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={handleReset} className="shrink-0">
                      Back
                    </Button>
                    <button
                      onClick={() => handleGenerate(briefing)}
                      disabled={!briefing.clientId || !briefing.objective || briefing.services.length === 0}
                      className="flex-1 h-9 bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 text-white text-[13px] font-semibold rounded-[8px] transition-colors"
                    >
                      Generate Plan
                    </button>
                  </div>

                </div>
              </div>
            )}

            {state === "analyzing" && (
              <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="w-10 h-10 rounded-full bg-[#EEF0FF] flex items-center justify-center mx-auto mb-4 animate-spin">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 2v3M9 13v3M2 9h3M13 9h3M4.05 4.05l2.12 2.12M11.83 11.83l2.12 2.12M4.05 13.95l2.12-2.12M11.83 6.17l2.12-2.12" stroke="#5B5BD6" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-medium text-[#1A1A1A]">Analyzing brief...</p>
                <p className="text-[13px] text-[#9B9B95] mt-1.5">Mapping goal to pipeline, selecting agents, sequencing tasks.</p>
              </div>
            )}

            {state === "ready" && plan && (
              <div className="space-y-4">
                {/* Pipeline */}
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Recommended Pipeline</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {plan.pipeline.map((stage, i) => (
                      <div key={stage} className="flex items-center gap-2">
                        <Badge variant={stage} size="md" />
                        {i < plan.pipeline.length - 1 && <span className="text-[#D0D0CC] text-[12px]">→</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agents */}
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Assigned Agents</div>
                  <div className="flex flex-wrap gap-2">
                    {plan.agents.map((agentId) => {
                      const agent = MOCK_AGENTS.find((a) => a.id === agentId);
                      if (!agent) return null;
                      return (
                        <div key={agentId} className="flex items-center gap-1.5 bg-[#EEF0FF] px-2.5 py-1.5 rounded-[7px]">
                          <div className="w-5 h-5 rounded-full bg-[#5B5BD6] flex items-center justify-center text-[9px] font-bold text-white">
                            {agent.name.slice(0, 1)}
                          </div>
                          <span className="text-[12px] font-medium text-[#5B5BD6]">{agent.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tasks */}
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Task Plan</div>
                  </div>
                  <div className="divide-y divide-[#F0F0ED]">
                    {plan.tasks.map((task, i) => {
                      const agent = MOCK_AGENTS.find((a) => a.id === task.agentId);
                      return (
                        <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                          <div className="w-5 h-5 rounded-full bg-[#F0F0ED] flex items-center justify-center text-[10px] font-bold text-[#9B9B95] shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[#1A1A1A]">{task.title}</div>
                            <div className="text-[12px] text-[#9B9B95] mt-0.5">{task.description}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[11px] text-[#6B6B65]">{agent?.name}</div>
                            <div className="text-[11px] text-[#9B9B95]">{task.dueDate.slice(5)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Risks */}
                {plan.risks.length > 0 && (
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Risk Flags</div>
                    <div className="space-y-2">
                      {plan.risks.map((risk, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <Badge variant={risk.level} />
                          <span className="text-[13px] text-[#1A1A1A]">{risk.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approve CTA */}
                <button
                  onClick={handleApprove}
                  className="w-full h-11 bg-[#1A1A1A] hover:bg-[#111111] text-white text-[14px] font-semibold rounded-[10px] transition-colors"
                >
                  Approve & Create Project
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </>
    )}
  </>
  );
}
