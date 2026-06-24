"use client";

import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

export default function AgentsPage() {
  const active = MOCK_AGENTS.filter((a) => a.status === "active");
  const available = MOCK_AGENTS.filter((a) => a.status === "available");

  return (
    <>
      <AgencyHeader
        title="Agent Registry"
        subtitle={`${MOCK_AGENTS.length} agents — ${active.length} currently active`}
      />

      <div className="space-y-6">
        {/* Active agents */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Active</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {active.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        </div>

        {/* Available agents */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#D0D0CC]" />
            <span className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Available</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {available.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function AgentCard({ agent }: { agent: typeof MOCK_AGENTS[0] }) {
  return (
    <div className="bg-white rounded-[12px] border border-[#E5E5E2] px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-[#E6FBFA] flex items-center justify-center text-[14px] font-bold text-[#070A1F]">
            {agent.name.slice(0, 1)}
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[#1A1A1A]">{agent.name}</div>
            <div className="text-[12px] text-[#9B9B95]">{agent.role}</div>
          </div>
        </div>
        <Badge variant={agent.status} />
      </div>

      <p className="text-[12px] text-[#6B6B65] mb-4 leading-relaxed">{agent.whenToUse}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Inputs</div>
          <div className="space-y-0.5">
            {agent.inputs.slice(0, 3).map((input) => (
              <div key={input} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-[#D0D0CC] shrink-0" />
                <span className="text-[11px] text-[#6B6B65]">{input}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Outputs</div>
          <div className="space-y-0.5">
            {agent.outputs.slice(0, 3).map((output) => (
              <div key={output} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-[#070A1F]/40 shrink-0" />
                <span className="text-[11px] text-[#6B6B65]">{output}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
