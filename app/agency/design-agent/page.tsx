"use client";

import { useState, useEffect } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "briefs" | "specs";

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
  // Section 1
  visualConcept: string;
  // Section 2
  enhancedPrompt: string;
  // Section 3
  layoutStructure: string[];
  // Section 4
  designInstructions: {
    typography: string;
    spacing: string;
    composition: string;
    visualHierarchy: string;
  };
  // Section 5
  styleConsistency: string;
}

// ─── Contract parser ─────────────────────────────────────────────────────────

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

  // Fallback: if nothing parsed, create 3 generic placeholder posts
  if (posts.length === 0) {
    return [
      { postId: 1, title: "Brand Statement", format: "Single Image", contentObjective: "Build brand presence", keyCopy: "Make your brand impossible to ignore.", cta: "Learn more", creativeDirection: "Clean, bold, minimal", imagePrompt: "Minimal brand visual, clean layout", designNotes: "Single image, strong headline" },
      { postId: 2, title: "Value Post", format: "Carousel", contentObjective: "Educate the audience", keyCopy: "Here's what most brands get wrong.", cta: "Save this post", creativeDirection: "Educational, typographic", imagePrompt: "Infographic style, clean slides", designNotes: "5-slide carousel, consistent template" },
      { postId: 3, title: "CTA Post", format: "Single Image", contentObjective: "Drive enquiries", keyCopy: "Spots are limited.", cta: "DM us START", creativeDirection: "High contrast, confident", imagePrompt: "Bold conversion creative, strong colour", designNotes: "Minimal text on image, CTA dominant" },
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
  // Single image default
  return [
    `Primary zone (top 60%): Main visual asset or typographic hero. This carries the weight of the post — should be readable at thumbnail scale.`,
    `Secondary zone (bottom 40%): Supporting copy or context. Restrained treatment — acts as caption, not headline.`,
    `Brand anchor: Logo or brand mark bottom-right at 80% opacity. Present but never dominant.`,
  ];
}

function generateVisualBriefs(posts: ParsedPost[]): VisualBrief[] {
  return posts.map((p) => {
    const isCarousel = p.format.toLowerCase().includes("carousel");
    const isStory = p.format.toLowerCase().includes("story");

    const visualConcept = p.creativeDirection
      ? `The visual direction leans into a ${p.creativeDirection.toLowerCase()} approach. The concept centres on ${
          isCarousel
            ? "a progressive reveal — each slide earns the next by delivering one clear idea"
            : isStory
            ? "immediacy and intimacy — the story format demands a fast, punchy execution that lands in under 2 seconds"
            : "a single, decisive frame — one image, one message, zero noise"
        }. The key copy "${p.keyCopy.slice(0, 60)}${p.keyCopy.length > 60 ? "…" : ""}" becomes the visual anchor — it should be legible at thumb size.`
      : `Visual concept centres on the post objective: ${p.contentObjective}. The design should communicate confidence — every element earns its place.`;

    const basePrompt = p.imagePrompt || "Clean editorial visual, professional brand aesthetic";
    const enhancedPrompt = [
      basePrompt,
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
        : `Headline: bold sans-serif, 64–80px for single image. If text sits on image, use white with drop shadow at 20% opacity. Never use more than 2 typefaces.`,
      spacing: isCarousel
        ? `Minimum 48px margin on all edges per slide. Elements should never touch the edge. Inter-element spacing: 24px minimum. Breathing room is the point.`
        : `60px minimum margin on all edges. No element should feel crowded. If it looks tight, remove something.`,
      composition: isStory
        ? `Vertical 9:16. Text sits in the safe zone: avoid top and bottom 15% (UI chrome). Strong vertical alignment — left-aligned text reads faster in story format.`
        : isCarousel
        ? `1:1 ratio per slide. Centre or left-align consistently — never mix. Grid: 12-column with 24px gutters. Align elements to grid, not to each other.`
        : `1:1 square. Rule of thirds: place the focal point on a third intersection. Avoid dead centre unless it is a deliberate symmetrical composition.`,
      visualHierarchy: `1st read (0–1s): ${p.keyCopy.slice(0, 40) || "Headline text"} — should land immediately. 2nd read (1–3s): supporting context or subheading. 3rd read (3s+): brand mark and CTA. Do not compete with the 1st read at any layer.`,
    };

    const styleConsistency = `Ensure the visual output aligns with the brand's ${
      p.creativeDirection || "established visual identity"
    }. Typography choices must match the brand's tone — ${
      p.contentObjective.toLowerCase().includes("authority") || p.contentObjective.toLowerCase().includes("expert")
        ? "authoritative and refined; avoid playful or decorative typefaces"
        : "approachable yet considered; avoid sterile or overly corporate treatments"
    }. Colour palette must stay within the brand system — do not introduce new colours. If in doubt, reduce — a simpler version is always more on-brand than an overworked one.`;

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
    `VISUAL BRIEF — POST ${b.postId}: ${b.title} [${b.format}]`,
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STEPS = [
  "Reading input contract…",
  "Interpreting post formats…",
  "Developing visual concepts…",
  "Enhancing image prompts…",
  "Generating layout structures…",
  "Writing design specifications…",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DesignAgentPage() {
  const [contractInput, setContractInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const pendingContract       = useAgencyStore((s) => s.pendingDesignContract);
  const setPendingDesignContract = useAgencyStore((s) => s.setPendingDesignContract);
  const projects              = useAgencyStore((s) => s.projects);
  const addDeliverable        = useAgencyStore((s) => s.addDeliverable);
  const pendingAgentInput     = useAgencyStore((s) => s.pendingAgentInput);

  useEffect(() => {
    if (pendingContract) {
      setContractInput(pendingContract);
      setPendingDesignContract(null);
    }
  }, [pendingContract, setPendingDesignContract]);
  const [activeTab, setActiveTab] = useState<OutputTab>("briefs");
  const [stepIndex, setStepIndex] = useState(0);
  const [briefs, setBriefs] = useState<VisualBrief[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ── Real image generation ──────────────────────────────────────────────────
  type ImageStatus = "idle" | "generating" | "done" | "error";
  interface ImageState { status: ImageStatus; url?: string; error?: string }
  interface SaveForm { name: string; projectId: string; saved: boolean }

  const [imageStates, setImageStates] = useState<Record<number, ImageState>>({});
  const [saveForms,   setSaveForms]   = useState<Record<number, SaveForm>>({});

  async function handleGenerateImage(postId: number, prompt: string) {
    setImageStates((prev) => ({ ...prev, [postId]: { status: "generating" } }));
    try {
      const res  = await fetch("/api/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setImageStates((prev) => ({ ...prev, [postId]: { status: "error", error: data.error ?? "Generation failed." } }));
      } else {
        setImageStates((prev) => ({ ...prev, [postId]: { status: "done", url: data.url } }));
        const defaultProjectId = pendingAgentInput?.projectId ?? projects[0]?.id ?? "";
        const briefTitle = briefs.find((b) => b.postId === postId)?.title ?? "Design Asset";
        setSaveForms((prev) => ({
          ...prev,
          [postId]: { name: briefTitle, projectId: defaultProjectId, saved: false },
        }));
      }
    } catch {
      setImageStates((prev) => ({ ...prev, [postId]: { status: "error", error: "Network error — could not reach the image API." } }));
    }
  }

  function handleSaveDeliverable(postId: number) {
    const form = saveForms[postId];
    const img  = imageStates[postId];
    if (!form || !img?.url || !form.projectId || !form.name) return;
    addDeliverable({
      projectId: form.projectId,
      name:      form.name,
      type:      "Design",
      status:    "in_review",
      link:      img.url,
      version:   1,
    });
    setSaveForms((prev) => ({ ...prev, [postId]: { ...prev[postId], saved: true } }));
  }

  const isReady = contractInput.trim().length > 20;

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

  function handleRun() {
    setAgentState("generating");
    setStepIndex(0);

    const delays = [500, 600, 700, 600, 600, 500];
    let elapsed = 0;
    delays.forEach((delay, i) => {
      elapsed += delay;
      setTimeout(() => {
        setStepIndex(i);
        if (i === delays.length - 1) {
          setTimeout(() => {
            const parsed = parseContract(contractInput);
            setBriefs(generateVisualBriefs(parsed));
            setAgentState("output_ready");
            setActiveTab("briefs");
          }, 400);
        }
      }, elapsed);
    });
  }

  function handleReset() {
    setAgentState("idle");
    setContractInput("");
    setBriefs([]);
    setStepIndex(0);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Design Agent"
        subtitle="Transforms a Social Media Agent contract into visual execution instructions."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">

        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[11px] font-semibold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C2530A] inline-block" />
            Production Agent
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1.1 — DALL‑E 3</span>
          <span className="text-[12px] text-[#9B9B95]">·</span>
          <span className="text-[12px] text-[#9B9B95]">Receives output from Social Media Agent</span>
          {agentState === "output_ready" && (
            <button
              onClick={handleExport}
              className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] bg-white text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v7M3.5 5.5L6.5 8.5 9.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Export Output
            </button>
          )}
        </div>

        {/* Main 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">

          {/* LEFT — Input */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Input Contract</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Paste the Design Agent Input Contract from the Social Media Agent.</p>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Contract payload
                </label>
                <textarea
                  value={contractInput}
                  onChange={(e) => setContractInput(e.target.value)}
                  disabled={agentState !== "idle"}
                  placeholder={`Paste the contract here.\n\nExpected format:\n┌─ CONTRACT_01 — Post Title\n│ format             Carousel\n│ content_objective  ...\n│ key_copy           ...\n│ cta                ...\n│ creative_direction ...\n│ image_prompt       ...\n└─ design_notes      ...`}
                  rows={16}
                  className="w-full px-3 py-2.5 text-[12px] font-mono bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors resize-none disabled:opacity-50 leading-relaxed"
                />
              </div>

              <div className="rounded-[7px] bg-[#FAFAFA] border border-[#F0F0ED] px-3 py-2.5">
                <p className="text-[11px] font-medium text-[#9B9B95]">
                  No contract yet?{" "}
                  <a href="/agency/social-media-agent" className="text-[#5B5BD6] hover:underline">
                    Run the Social Media Agent
                  </a>{" "}
                  and copy the Agent Contract tab output.
                </p>
              </div>

              {agentState === "idle" && (
                <button
                  disabled={!isReady}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#C2530A] text-white transition-all
                    hover:bg-[#A8460A] active:bg-[#8E3908]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Run Design Agent
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#C2530A] text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
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

          {/* RIGHT — Output */}
          {agentState === "idle" && (
            <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full bg-[#FFF4ED] flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="#C2530A" strokeWidth="1.3"/>
                  <path d="M7 13l2-4 2.5 2.5 2-4" stroke="#C2530A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#1A1A1A]">Awaiting contract input</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5 max-w-xs mx-auto">
                Paste a Design Agent Input Contract from the Social Media Agent and run the Design Agent.
              </p>
            </div>
          )}

          {agentState === "generating" && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[#FFF4ED] flex items-center justify-center mx-auto mb-5">
                <span className="w-5 h-5 border-2 border-[#C2530A] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-[#1A1A1A] mb-6">Generating visual briefs…</p>
              <div className="max-w-[240px] mx-auto space-y-2.5">
                {STEPS.map((label, i) => (
                  <div key={label} className={`flex items-center gap-2.5 transition-opacity duration-300 ${i <= stepIndex ? "opacity-100" : "opacity-25"}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#C2530A]" : i === stepIndex ? "bg-[#FFF4ED] border border-[#C2530A]" : "bg-[#F0F0ED]"}`}>
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
          )}

          {agentState === "output_ready" && briefs.length > 0 && (
            <div className="space-y-4">

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[9px] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {(["briefs", "specs"] as OutputTab[]).map((tab) => {
                  const labels: Record<OutputTab, string> = {
                    briefs: "Visual Briefs",
                    specs: "Design Specs",
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

              {/* Tab: Visual Briefs */}
              {activeTab === "briefs" && (
                <div className="space-y-4">
                  {briefs.map((b) => (
                    <div key={b.postId} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

                      {/* Card header */}
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[11px] font-semibold text-[#C2530A] bg-[#FFF4ED] px-2 py-0.5 rounded-[4px]">
                            POST_{String(b.postId).padStart(2, "0")}
                          </span>
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{b.title}</p>
                          <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{b.format}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(`brief-${b.postId}`, formatBriefAsText(b))}
                          className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] hover:text-[#1A1A1A] transition-colors"
                        >
                          {copiedKey === `brief-${b.postId}` ? "Copied" : "Copy Brief"}
                        </button>
                      </div>

                      <div className="divide-y divide-[#F0F0ED]">

                        {/* Section 1 — Visual Concept */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[9px] font-bold flex items-center justify-center">1</span>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Visual Concept</p>
                          </div>
                          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{b.visualConcept}</p>
                        </div>

                        {/* Section 2 — Enhanced Prompt */}
                        <div className="px-5 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[9px] font-bold flex items-center justify-center">2</span>
                              <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Enhanced Image Prompt</p>
                            </div>
                            <button
                              onClick={() => handleCopy(`prompt-${b.postId}`, b.enhancedPrompt)}
                              className="h-5 px-2 rounded-[4px] text-[10px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors"
                            >
                              {copiedKey === `prompt-${b.postId}` ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div className="rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-2.5">
                            <p className="text-[11px] font-mono text-[#6B6B65] leading-relaxed">{b.enhancedPrompt}</p>
                          </div>
                        </div>

                        {/* Image generation section */}
                        <div className="px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-[#EEF0FF] flex items-center justify-center shrink-0">
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M4 1v2.5L6 5M4 1L2 5M1 7h6" stroke="#5B5BD6" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                              <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Real Image</p>
                            </div>
                            {(!imageStates[b.postId] || imageStates[b.postId].status === "idle") && (
                              <button
                                onClick={() => handleGenerateImage(b.postId, b.enhancedPrompt)}
                                className="h-7 px-3 rounded-[6px] text-[12px] font-semibold bg-[#5B5BD6] text-white hover:bg-[#4A4AC5] active:bg-[#3939B4] transition-colors flex items-center gap-1.5"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M5.5 1v4M5.5 10V6M1 5.5h4M10 5.5H6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                                </svg>
                                Generate Real Image
                              </button>
                            )}
                            {imageStates[b.postId]?.status === "error" && (
                              <button
                                onClick={() => handleGenerateImage(b.postId, b.enhancedPrompt)}
                                className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                              >
                                Retry
                              </button>
                            )}
                          </div>

                          {/* Generating */}
                          {imageStates[b.postId]?.status === "generating" && (
                            <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] py-8 flex flex-col items-center gap-3">
                              <span className="w-5 h-5 border-2 border-[#5B5BD6] border-t-transparent rounded-full animate-spin" />
                              <p className="text-[12px] text-[#9B9B95]">Generating with DALL‑E 3…</p>
                            </div>
                          )}

                          {/* Error */}
                          {imageStates[b.postId]?.status === "error" && (
                            <div className="rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-start gap-2">
                              <span className="text-[#DC2626] shrink-0 mt-px">⚠</span>
                              <p className="text-[12px] text-[#DC2626] leading-snug">{imageStates[b.postId].error}</p>
                            </div>
                          )}

                          {/* Done — image + save form */}
                          {imageStates[b.postId]?.status === "done" && imageStates[b.postId].url && (
                            <div className="space-y-3">
                              <img
                                src={imageStates[b.postId].url}
                                alt={b.title}
                                className="w-full rounded-[8px] border border-[#E5E5E2] shadow-sm"
                              />

                              {saveForms[b.postId]?.saved ? (
                                <div className="rounded-[7px] bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-2.5 flex items-center gap-2">
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M2.5 7.5l3 3 6-6" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <p className="text-[12px] text-[#16A34A] font-medium">Saved to project as a deliverable — status: In Review.</p>
                                </div>
                              ) : (
                                <div className="rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2] p-3.5 space-y-2.5">
                                  <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Save to Project</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] text-[#6B6B65] mb-1">Name</label>
                                      <input
                                        value={saveForms[b.postId]?.name ?? b.title}
                                        onChange={(e) => setSaveForms((prev) => ({ ...prev, [b.postId]: { ...prev[b.postId], name: e.target.value } }))}
                                        className="w-full h-7 px-2 text-[12px] bg-white border border-[#E5E5E2] rounded-[5px] outline-none focus:border-[#5B5BD6]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-[#6B6B65] mb-1">Project</label>
                                      <select
                                        value={saveForms[b.postId]?.projectId ?? ""}
                                        onChange={(e) => setSaveForms((prev) => ({ ...prev, [b.postId]: { ...prev[b.postId], projectId: e.target.value } }))}
                                        className="w-full h-7 px-2 text-[12px] bg-white border border-[#E5E5E2] rounded-[5px] outline-none focus:border-[#5B5BD6]"
                                      >
                                        <option value="">— select project —</option>
                                        {projects.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <button
                                    disabled={!saveForms[b.postId]?.projectId || !saveForms[b.postId]?.name}
                                    onClick={() => handleSaveDeliverable(b.postId)}
                                    className="w-full h-7 rounded-[5px] text-[12px] font-medium bg-[#1A1A1A] text-white hover:bg-[#2A2A2A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Save as Deliverable
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Section 3 — Layout Structure */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[9px] font-bold flex items-center justify-center">3</span>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Layout Structure</p>
                          </div>
                          <div className="space-y-2">
                            {b.layoutStructure.map((slide, i) => (
                              <div key={i} className="flex gap-3">
                                <span className="shrink-0 w-5 h-5 rounded-[4px] bg-[#F0F0ED] text-[10px] font-semibold text-[#6B6B65] flex items-center justify-center mt-0.5">
                                  {i + 1}
                                </span>
                                <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{slide}</p>
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
                    <div key={b.postId} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

                      {/* Card header */}
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-semibold text-[#C2530A] bg-[#FFF4ED] px-2 py-0.5 rounded-[4px]">
                          POST_{String(b.postId).padStart(2, "0")}
                        </span>
                        <p className="text-[13px] font-semibold text-[#1A1A1A]">{b.title}</p>
                        <span className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{b.format}</span>
                      </div>

                      <div className="divide-y divide-[#F0F0ED]">

                        {/* Section 4 — Design Instructions */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[9px] font-bold flex items-center justify-center">4</span>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Design Instructions</p>
                          </div>
                          <div className="space-y-3">
                            {([
                              { key: "Typography", value: b.designInstructions.typography },
                              { key: "Spacing", value: b.designInstructions.spacing },
                              { key: "Composition", value: b.designInstructions.composition },
                              { key: "Visual hierarchy", value: b.designInstructions.visualHierarchy },
                            ] as { key: string; value: string }[]).map(({ key, value }) => (
                              <div key={key} className="grid grid-cols-[120px_1fr] gap-3 items-start">
                                <p className="text-[11px] font-semibold text-[#9B9B95] pt-px">{key}</p>
                                <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Section 5 — Style Consistency */}
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-4 h-4 rounded-full bg-[#FFF4ED] text-[#C2530A] text-[9px] font-bold flex items-center justify-center">5</span>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide">Style Consistency Notes</p>
                          </div>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed">{b.styleConsistency}</p>
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
