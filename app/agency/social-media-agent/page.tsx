"use client";

import AgencyHeader from "@/components/agency/layout/AgencyHeader";

export default function SocialMediaAgentPage() {
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
              {/* Form fields will go here */}
              <div className="h-8 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-20 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-8 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-8 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-8 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-8 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-16 rounded-[7px] bg-[#F7F7F6] border border-[#E5E5E2]" />
              <div className="h-9 rounded-[7px] bg-[#5B5BD6] opacity-30" />
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
