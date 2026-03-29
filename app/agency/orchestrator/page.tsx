"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";
import Badge from "@/components/agency/ui/Badge";
import Link from "next/link";
import { Priority, ProjectStage, MOCK_AGENTS } from "@/lib/agency/mock-data";

type OrchestratorState = "idle" | "analyzing" | "ready" | "approved";
type InputMode = "form" | "voice" | "audio";

interface OrchestratorPlan {
  pipeline: ProjectStage[];
  agents: string[];
  tasks: Array<{ title: string; description: string; agentId: string; stage: string; dueDate: string }>;
  risks: Array<{ level: "high" | "medium" | "low"; message: string }>;
}

function generatePlan(type: string, deadline: string): OrchestratorPlan {
  const baseDate = deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const d = new Date(baseDate);
  const offset = (days: number) => new Date(d.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const plans: Record<string, OrchestratorPlan> = {
    campaign: {
      pipeline: ["briefing", "diagnosis", "planning", "production", "review", "delivery"],
      agents: ["a6", "a1", "a2", "a4", "a5", "a7"],
      tasks: [
        { title: "Market & audience analysis", description: "Map target audience, competitive context, and strategic opportunity.", agentId: "a6", stage: "diagnosis", dueDate: offset(20) },
        { title: "Campaign concept development", description: "Define the creative direction and campaign narrative.", agentId: "a5", stage: "planning", dueDate: offset(16) },
        { title: "Write campaign copy", description: "Produce all copy: headline, body, CTAs, social captions.", agentId: "a1", stage: "production", dueDate: offset(12) },
        { title: "Design campaign visuals", description: "Create all visual assets: hero images, ad creatives, social formats.", agentId: "a2", stage: "production", dueDate: offset(10) },
        { title: "Set up paid media structure", description: "Build campaign architecture in Meta Ads and/or Google Ads.", agentId: "a4", stage: "production", dueDate: offset(8) },
        { title: "Internal QA review", description: "Validate all materials against briefing, brand, and quality standards.", agentId: "a7", stage: "review", dueDate: offset(4) },
      ],
      risks: [
        { level: "medium", message: "Creative review cycles may compress production timeline." },
        { level: "low", message: "Audience targeting assumptions need validation from client." },
      ],
    },
    branding: {
      pipeline: ["briefing", "diagnosis", "planning", "production", "review", "delivery"],
      agents: ["a6", "a2", "a1", "a7"],
      tasks: [
        { title: "Brand audit & competitive analysis", description: "Audit current brand equity and map the competitive landscape.", agentId: "a6", stage: "diagnosis", dueDate: offset(20) },
        { title: "Positioning strategy", description: "Define brand positioning, pillars, and differentiation.", agentId: "a6", stage: "planning", dueDate: offset(16) },
        { title: "Visual identity design", description: "Design logo, color system, typography, and usage guidelines.", agentId: "a2", stage: "production", dueDate: offset(10) },
        { title: "Brand voice & messaging", description: "Define tone of voice, key messages, and language guidelines.", agentId: "a1", stage: "production", dueDate: offset(8) },
        { title: "Brand guidelines document", description: "Compile all brand elements into a comprehensive guidelines document.", agentId: "a7", stage: "review", dueDate: offset(4) },
      ],
      risks: [
        { level: "high", message: "Brand identity requires client approval at multiple stages — build in feedback time." },
        { level: "low", message: "Asset delivery format (PDF/Figma/other) should be confirmed upfront." },
      ],
    },
    seo: {
      pipeline: ["briefing", "diagnosis", "planning", "production", "delivery", "ongoing"],
      agents: ["a8", "a6", "a1"],
      tasks: [
        { title: "SEO audit", description: "Full technical and on-page SEO audit of the current site.", agentId: "a8", stage: "diagnosis", dueDate: offset(20) },
        { title: "Keyword research & content map", description: "Identify priority keywords and map to content opportunities.", agentId: "a8", stage: "planning", dueDate: offset(15) },
        { title: "Content briefs", description: "Write detailed briefs for all content pieces to be produced.", agentId: "a8", stage: "planning", dueDate: offset(12) },
        { title: "Content production", description: "Write SEO-optimized articles and landing page copy.", agentId: "a1", stage: "production", dueDate: offset(7) },
        { title: "On-page implementation guide", description: "Document all technical and on-page changes to implement.", agentId: "a8", stage: "production", dueDate: offset(5) },
      ],
      risks: [
        { level: "medium", message: "SEO results require 3–6 months to materialize — set correct expectations with client." },
      ],
    },
  };

  const typeKey = type.toLowerCase().includes("brand") ? "branding" : type.toLowerCase().includes("seo") ? "seo" : "campaign";
  return plans[typeKey] ?? plans.campaign;
}

// ─── Voice parsing ────────────────────────────────────────────────────────────

interface ParsedBrief {
  services: string[];
  objective: string;
  targetAudience: string;
  channels: string[];
  deadline: string;
  businessDescription: string;
}

function parseVoiceText(text: string): ParsedBrief {
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);

  // Services — keyword scan
  const services: string[] = [];
  if (/social media|instagram|linkedin|twitter|tiktok|facebook|redes sociais|social/.test(lower)) services.push("social_media");
  if (/\bads\b|advertising|google ads|meta ads|paid media|mídia paga|anúncio/.test(lower)) services.push("ads");
  if (/\bseo\b|search engine|organic search|ranking/.test(lower)) services.push("seo");
  if (/\bbrand\b|branding|identity|logo|visual identity|\bmarca\b/.test(lower)) services.push("branding");
  if (/\bcontent\b|blog|articles|copywriting|conteúdo/.test(lower)) services.push("content");

  // Objective — sentence containing a goal verb
  const objectiveSentence = sentences.find((s) =>
    /goal|objective|want to|need to|looking to|aim|we need|we want|purpose|increase|generate|drive|grow|launch|build|boost/i.test(s)
  ) ?? sentences[0] ?? "";

  // Target audience
  const audienceSentence = sentences.find((s) =>
    /audience|target|targeting|demographic|age|professionals|consumers|users|women|men|customers|personas/i.test(s)
  ) ?? "";

  // Channels — explicit platform mentions
  const channels: string[] = [];
  if (/instagram/i.test(text)) channels.push("Instagram");
  if (/linkedin/i.test(text)) channels.push("LinkedIn");
  if (/facebook/i.test(text)) channels.push("Facebook");
  if (/\btiktok\b/i.test(text)) channels.push("TikTok");
  if (/\btwitter\b|x\.com/i.test(text)) channels.push("Twitter/X");
  if (/youtube/i.test(text)) channels.push("YouTube");
  if (/google/i.test(text)) channels.push("Google");
  if (/\bemail\b/i.test(text)) channels.push("Email");

  // Deadline — month names or relative expressions
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
    /(?:end of|by|before|until|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/
  );
  if (monthMatch) {
    deadline = `${year}-${MONTHS[monthMatch[1]]}-28`;
  } else if (/next month/.test(lower)) {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    deadline = d.toISOString().slice(0, 10);
  } else {
    const weeksMatch = lower.match(/(\d+)\s*weeks?/);
    if (weeksMatch) {
      const days = parseInt(weeksMatch[1]) * 7;
      deadline = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    }
  }

  // Business description — first sentence that reads like context (not a goal)
  const businessDescription = sentences.find((s) =>
    !/goal|objective|want|need|aim|increase|generate|drive|audience|deadline|end of/i.test(s)
  ) ?? "";

  return { services, objective: objectiveSentence, targetAudience: audienceSentence, channels, deadline, businessDescription };
}

export default function OrchestratorPage() {
  const { clients, createProject } = useAgencyStore();
  const [state, setState] = useState<OrchestratorState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("form");
  const [plan, setPlan] = useState<OrchestratorPlan | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    clientId: "",
    name: "",
    // legacy fields kept for handleAnalyze / handleApprove (derived below)
    goal: "",
    type: "Campaign",
    deadline: "",
    priority: "high" as Priority,
    notes: "",
    // new structured fields
    services: [] as string[],
    businessDescription: "",
    objective: "",
    targetAudience: "",
    channels: "",
  });

  const SERVICE_OPTIONS = [
    { id: "social_media", label: "Social Media" },
    { id: "ads",          label: "Ads" },
    { id: "seo",          label: "SEO" },
    { id: "branding",     label: "Branding" },
    { id: "content",      label: "Content" },
  ];

  // Keep legacy fields in sync so generation logic stays unchanged
  const setField = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "objective")           next.goal = value as string;
      if (key === "services") {
        const svcs = value as string[];
        if (svcs.length > 0) {
          const first = svcs[0];
          next.type = first === "social_media" ? "Social Media"
            : first === "ads"       ? "Paid Media"
            : first === "seo"       ? "SEO"
            : first === "branding"  ? "Branding"
            : "Content";
        }
      }
      return next;
    });
  };

  const toggleService = (id: string) => {
    const next = form.services.includes(id)
      ? form.services.filter((s) => s !== id)
      : [...form.services, id];
    setField("services", next);
  };

  const handleAnalyze = () => {
    if (!form.clientId || !form.goal) return;
    setState("analyzing");
    setTimeout(() => {
      const generatedPlan = generatePlan(form.type, form.deadline);
      setPlan(generatedPlan);
      setState("ready");
    }, 2200);
  };

  const handleApprove = () => {
    if (!plan) return;
    const id = createProject({
      name: form.name || `${form.type} — ${clients.find(c => c.id === form.clientId)?.name}`,
      clientId: form.clientId,
      goal: form.goal,
      type: form.type,
      stage: "diagnosis",
      priority: form.priority,
      deadline: form.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      agents: plan.agents,
      initialTasks: plan.tasks.map((t) => ({ title: t.title, description: t.description, agentId: t.agentId, dueDate: t.dueDate })),
    });
    setCreatedProjectId(id);
    setState("approved");
  };

  const handleReset = () => {
    setState("idle"); setPlan(null); setCreatedProjectId(null);
    setForm({
      clientId: "", name: "", goal: "", type: "Campaign",
      deadline: "", priority: "high", notes: "",
      services: [], businessDescription: "", objective: "",
      targetAudience: "", channels: "",
    });
  };

  const handleVoiceAnalyze = () => {
    if (!voiceText.trim() || !form.clientId) return;
    const parsed = parseVoiceText(voiceText);
    // Derive type and goal from parsed data, then run analysis
    const type = parsed.services.length > 0
      ? (parsed.services[0] === "social_media" ? "Social Media"
        : parsed.services[0] === "ads" ? "Paid Media"
        : parsed.services[0] === "seo" ? "SEO"
        : parsed.services[0] === "branding" ? "Branding"
        : "Content")
      : "Campaign";
    const goal = parsed.objective || voiceText.slice(0, 200);
    setForm((prev) => ({
      ...prev,
      goal,
      type,
      services: parsed.services,
      objective: parsed.objective,
      targetAudience: parsed.targetAudience,
      channels: parsed.channels.join(", "),
      businessDescription: parsed.businessDescription,
      deadline: parsed.deadline || prev.deadline,
    }));
    setState("analyzing");
    setTimeout(() => {
      setPlan(generatePlan(type, parsed.deadline));
      setState("ready");
    }, 2200);
  };

  const STEP_LABELS = ["Receive Brief", "Analyze Context", "Generate Pipeline", "Assign Agents", "Activate"];
  const STEP_STATES = { idle: -1, analyzing: 1, ready: 3, approved: 4 };
  const activeStep = STEP_STATES[state];

  return (
    <>
      <AgencyHeader
        title="Orchestrator"
        subtitle="Define a project goal. The Orchestrator will generate an execution plan."
      />

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
                    value={form.clientId}
                    onChange={(e) => setField("clientId", e.target.value)}
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
                    {form.services.length > 0 && (
                      <span className="ml-1.5 text-[11px] font-normal text-[#9B9B95]">({form.services.length} selected)</span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_OPTIONS.map((svc) => {
                      const active = form.services.includes(svc.id);
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
                    value={form.businessDescription}
                    onChange={(e) => setField("businessDescription", e.target.value)}
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
                    value={form.objective}
                    onChange={(e) => setField("objective", e.target.value)}
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
                    value={form.targetAudience}
                    onChange={(e) => setField("targetAudience", e.target.value)}
                    disabled={state !== "idle"}
                    placeholder="e.g. Design professionals, 25–40, urban Brazil"
                    className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                  />
                </div>

                {/* Channels */}
                <div>
                  <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Channels</label>
                  <input
                    value={form.channels}
                    onChange={(e) => setField("channels", e.target.value)}
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
                      value={form.deadline}
                      onChange={(e) => setField("deadline", e.target.value)}
                      disabled={state !== "idle"}
                      className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setField("priority", e.target.value as Priority)}
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
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
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
                    onClick={handleAnalyze}
                    disabled={!form.clientId || !form.objective || form.services.length === 0}
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
                    onClick={handleVoiceAnalyze}
                  >
                    Parse &amp; Generate Plan
                  </Button>
                )}
                {state !== "idle" && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">Reset</Button>
                )}
              </div>
            )}

            {/* ── MODE: Audio Upload ── */}
            {inputMode === "audio" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] px-3.5 py-3">
                  <span className="text-[18px] leading-none mt-0.5">♪</span>
                  <p className="text-[12px] text-[#6B6B65] leading-relaxed">
                    Upload a recorded brief (MP3, M4A, WAV). The system will simulate transcription and extract the structured brief.
                  </p>
                </div>

                {/* Upload zone */}
                <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-[10px] px-6 py-10 cursor-pointer transition-colors ${
                  audioFile ? "border-[#5B5BD6] bg-[#EEF0FF]/40" : "border-[#E5E5E2] hover:border-[#C0C0BA] bg-[#FAFAF9]"
                }`}>
                  <input
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg,.webm"
                    className="sr-only"
                    onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                    disabled={state !== "idle"}
                  />
                  {audioFile ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-[#EEF0FF] flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <path d="M9 2C6.24 2 4 4.24 4 7v4c0 2.76 2.24 5 5 5s5-2.24 5-5V7c0-2.76-2.24-5-5-5z" stroke="#5B5BD6" strokeWidth="1.3"/>
                          <path d="M2 9.5C2 13.09 4.91 16 8.5 16h1C13.09 16 16 13.09 16 9.5" stroke="#5B5BD6" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-[13px] font-medium text-[#5B5BD6]">{audioFile.name}</p>
                        <p className="text-[11px] text-[#9B9B95] mt-0.5">{(audioFile.size / 1024).toFixed(0)} KB · Ready to process</p>
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

                {audioFile && (
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Client *</label>
                    <select
                      value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      disabled={state !== "idle"}
                      className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
                    >
                      <option value="">Select client...</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {audioFile && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={!form.clientId}
                    onClick={() => {}}
                  >
                    Transcribe &amp; Generate Plan
                  </Button>
                )}
                {audioFile && (
                  <button
                    className="w-full text-[12px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors"
                    onClick={() => setAudioFile(null)}
                  >
                    Remove file
                  </button>
                )}
              </div>
            )}

            </div>
          </div>

          {/* Output panel */}
          <div>
            {state === "idle" && (() => {
              // Voice mode with text → show parsed preview
              if (inputMode === "voice" && voiceText.trim()) {
                const p = parseVoiceText(voiceText);
                const SERVICE_LABELS: Record<string, string> = {
                  social_media: "Social Media", ads: "Ads", seo: "SEO", branding: "Branding", content: "Content",
                };
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
                      <span className="text-[11px] text-[#9B9B95]">Updates as you type</span>
                    </div>
                    <div className="px-5">
                      {/* Services */}
                      <div className="flex items-start gap-3 py-3 border-b border-[#F7F7F6]">
                        <div className="w-[130px] shrink-0 pt-0.5">
                          <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Services</span>
                        </div>
                        <div className="flex-1 flex flex-wrap gap-1.5">
                          {p.services.length > 0
                            ? p.services.map((s) => (
                                <span key={s} className="h-5 px-2 rounded-full text-[11px] font-medium bg-[#EEF0FF] text-[#5B5BD6]">
                                  {SERVICE_LABELS[s] ?? s}
                                </span>
                              ))
                            : <span className="text-[12px] text-[#C0C0BC] italic">Not detected</span>
                          }
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          p.services.length > 0 ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
                        }`}>{p.services.length > 0 ? "✓" : "—"}</span>
                      </div>
                      <Row label="Objective"    value={p.objective}          detected={!!p.objective} />
                      <Row label="Audience"     value={p.targetAudience}     detected={!!p.targetAudience} />
                      {/* Channels */}
                      <div className="flex items-start gap-3 py-3 border-b border-[#F7F7F6]">
                        <div className="w-[130px] shrink-0 pt-0.5">
                          <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Channels</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {p.channels.length > 0
                            ? <p className="text-[13px] text-[#1A1A1A]">{p.channels.join(" · ")}</p>
                            : <p className="text-[12px] text-[#C0C0BC] italic">Not detected</p>
                          }
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          p.channels.length > 0 ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
                        }`}>{p.channels.length > 0 ? "✓" : "—"}</span>
                      </div>
                      <Row label="Deadline"     value={p.deadline}           detected={!!p.deadline} />
                      <Row label="Description"  value={p.businessDescription} detected={!!p.businessDescription} />
                    </div>
                  </div>
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
                      : "Fill in the client, goal, and deadline — then run the Orchestrator to generate an execution plan."}
                  </p>
                </div>
              );
            })()}

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
  );
}
