"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";

export default function SettingsPage() {
  const { clients, projects, tasks, deliverables, briefings, resetStore } = useAgencyStore();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    resetStore();
    setConfirmReset(false);
  };

  const stats = [
    { label: "Clients", value: clients.length },
    { label: "Projects", value: projects.length },
    { label: "Tasks", value: tasks.length },
    { label: "Deliverables", value: deliverables.length },
    { label: "Briefings", value: briefings.length },
  ];

  return (
    <>
      <AgencyHeader
        title="Settings"
        subtitle="Platform configuration and workspace management"
      />

      <div className="max-w-2xl space-y-6">
        {/* Workspace stats */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-4">Workspace Overview</div>
          <div className="grid grid-cols-5 gap-3">
            {stats.map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-[22px] font-semibold text-[#1A1A1A] mono-num">{value}</div>
                <div className="text-[11px] text-[#9B9B95] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Persistence status */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Data Persistence</div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span className="text-[13px] text-[#1A1A1A] font-medium">localStorage persistence active</span>
          </div>
          <p className="text-[12px] text-[#9B9B95] leading-relaxed">
            All data is stored in your browser&apos;s localStorage under the key <code className="text-[11px] bg-[#F0F0ED] px-1 py-0.5 rounded">agency-os-v1</code>. Data persists across page refreshes and browser sessions on this device.
          </p>
        </div>

        {/* Platform info */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Platform</div>
          <div className="space-y-2">
            {[
              { label: "System", value: "Dioli Agency OS" },
              { label: "Version", value: "1.0.0 MVP" },
              { label: "Tech Stack", value: "Next.js · Zustand · Tailwind CSS" },
              { label: "Storage", value: "Browser localStorage" },
              { label: "Environment", value: "Front-end only (no backend)" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[12px] text-[#9B9B95]">{label}</span>
                <span className="text-[12px] text-[#1A1A1A] font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reset */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Workspace Actions</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium text-[#1A1A1A]">Reset Demo Data</div>
              <div className="text-[12px] text-[#9B9B95] mt-0.5">Restore all data to the original mock dataset. This cannot be undone.</div>
            </div>
            {!confirmReset ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
                Reset Data
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#DC2626] font-medium">Are you sure?</span>
                <Button variant="danger" size="sm" onClick={handleReset}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
