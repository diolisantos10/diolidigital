"use client";

import { useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

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

type AgentState = "idle" | "output_ready";
type OutputTab = "brand" | "content" | "posts" | "handoff";

export default function SocialMediaAgentPage() {
  const [form, setForm] = useState<SocialForm>(EMPTY_FORM);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("brand");

  const isReady = form.brandName.trim() !== "" && form.objective.trim() !== "";

  function handleRun() {
    setAgentState("output_ready");
    setActiveTab("brand");
  }

  function handleReset() {
    setAgentState("idle");
    setForm(EMPTY_FORM);
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

              {/* Submit / Reset button */}
              {agentState === "idle" ? (
                <button
                  disabled={!isReady}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#5B5BD6] text-white transition-all
                    hover:bg-[#4A4AC5] active:bg-[#3939B4]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Run Social Media Agent
                </button>
              ) : (
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
          ) : (
            <div className="space-y-4">

              {/* Output tabs */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[9px] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {(["brand", "content", "posts", "handoff"] as OutputTab[]).map((tab) => {
                  const labels: Record<OutputTab, string> = {
                    brand: "Brand Brief",
                    content: "Content Map",
                    posts: "Post Package",
                    handoff: "Design Handoff",
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
                      {["Practical understanding", "Communication style", "What to reinforce", "What to avoid"].map((label) => (
                        <div key={label} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">{label}</p>
                          <div className="space-y-1.5">
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-full" />
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-4/5" />
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-3/5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2 — Objective Translation */}
                  <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-bold flex items-center justify-center">2</span>
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">Objective Translation</p>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-3 gap-3">
                      {["Content direction", "Primary KPI", "Content ratio"].map((label) => (
                        <div key={label} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">{label}</p>
                          <div className="space-y-1.5">
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-full" />
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-3/4" />
                          </div>
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
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="h-3 bg-[#E5E5E2] rounded-full w-1/2" />
                            <div className="h-5 w-14 bg-[#EEF0FF] rounded-full" />
                          </div>
                          <div className="space-y-1.5">
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-full" />
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-5/6" />
                          </div>
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
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <div key={n} className="py-3 flex items-center gap-3">
                          <span className="text-[11px] font-semibold text-[#9B9B95] w-4">{n}</span>
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 bg-[#E5E5E2] rounded-full w-2/3" />
                            <div className="h-2 bg-[#F0F0ED] rounded-full w-1/2" />
                          </div>
                          <div className="h-5 w-16 bg-[#F0F0ED] rounded-full" />
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
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                        <div key={day} className="rounded-[8px] border border-[#E5E5E2] overflow-hidden">
                          <div className="bg-[#F7F7F6] px-2 py-1.5 text-center border-b border-[#E5E5E2]">
                            <p className="text-[11px] font-semibold text-[#6B6B65]">{day}</p>
                          </div>
                          <div className="p-2 space-y-1.5 min-h-[64px]">
                            <div className="h-2 bg-[#E5E5E2] rounded-full w-full" />
                            <div className="h-2 bg-[#F0F0ED] rounded-full w-3/4" />
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
                    <p className="text-[12px] text-[#9B9B95]">Section 6 — Final Post Package</p>
                  </div>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-3.5 border-b border-[#E5E5E2] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-[#9B9B95]">Post {n}</span>
                          <div className="h-3 bg-[#E5E5E2] rounded-full w-32" />
                        </div>
                        <div className="h-5 w-20 bg-[#F0F0ED] rounded-full" />
                      </div>
                      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                        {["Objective", "Format", "Caption", "CTA", "Creative direction", "AI image prompt", "Design notes"].map((field) => (
                          <div key={field} className={field === "Caption" || field === "Creative direction" || field === "AI image prompt" ? "col-span-2" : ""}>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">{field}</p>
                            <div className="space-y-1.5">
                              <div className="h-2.5 bg-[#E5E5E2] rounded-full w-full" />
                              {(field === "Caption" || field === "Creative direction" || field === "AI image prompt") && (
                                <div className="h-2.5 bg-[#F0F0ED] rounded-full w-4/5" />
                              )}
                            </div>
                          </div>
                        ))}
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
                      <p className="text-[12px] font-semibold text-white">design_handoff.json</p>
                      <span className="ml-auto text-[11px] text-[#6B6B65]">Ready for Design Agent</span>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className="rounded-[8px] border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="text-[11px] font-semibold text-[#5B5BD6]">POST_{String(n).padStart(2, "0")}</span>
                            <div className="h-2 bg-[#2A2A2A] rounded-full w-24" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {["format", "visual_direction", "prompt", "key_copy", "design_notes"].map((key) => (
                              <div key={key} className={key === "prompt" || key === "design_notes" ? "col-span-2" : ""}>
                                <p className="text-[10px] font-mono text-[#6B6B65] mb-1">{key}</p>
                                <div className="h-2 bg-[#2A2A2A] rounded-full w-full" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
