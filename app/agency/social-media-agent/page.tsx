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

export default function SocialMediaAgentPage() {
  const [form, setForm] = useState<SocialForm>(EMPTY_FORM);

  const isReady = form.brandName.trim() !== "" && form.objective.trim() !== "";

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

              {/* Submit button */}
              <button
                disabled={!isReady}
                className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-[#5B5BD6] text-white transition-all
                  hover:bg-[#4A4AC5] active:bg-[#3939B4]
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run Social Media Agent
              </button>

            </div>
          </div>

          {/* RIGHT — Output area */}
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

        </div>
      </div>
    </div>
  );
}
