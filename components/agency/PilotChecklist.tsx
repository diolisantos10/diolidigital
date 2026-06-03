"use client";

import type { ChecklistItem, PilotChecklist as PilotChecklistData } from "@/lib/agency/reporting";

// ─── Pilot Readiness Checklist ────────────────────────────────────────────────
// Internal-only operational checklist shown on the project detail page.
// Two phases: "Antes da execução" and "Antes da entrega".

function CheckRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span
        className={`mt-0.5 w-4 h-4 rounded-[5px] shrink-0 flex items-center justify-center text-[10px] font-bold ${
          item.done ? "bg-[#DCFCE7] text-[#16A34A]" : "border border-[#D0D0CC] text-transparent"
        }`}
      >
        {item.done ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <p className={`text-[12px] font-medium leading-snug ${item.done ? "text-[#1A1A1A]" : "text-[#6B6B65]"}`}>
          {item.label}
        </p>
        {!item.done && <p className="text-[11px] text-[#9B9B95] mt-0.5">{item.hint}</p>}
      </div>
    </div>
  );
}

function Phase({
  title,
  ready,
  readyLabel,
  pendingLabel,
  items,
}: {
  title: string;
  ready: boolean;
  readyLabel: string;
  pendingLabel: string;
  items: ChecklistItem[];
}) {
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
        <h3 className="text-[13px] font-semibold text-[#1A1A1A]">{title}</h3>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            ready ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEF3C7] text-[#D97706]"
          }`}
        >
          {ready ? readyLabel : `${doneCount}/${items.length} — ${pendingLabel}`}
        </span>
      </div>
      <div className="px-5 py-3">
        {items.map((item) => (
          <CheckRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function PilotChecklist({ checklist }: { checklist: PilotChecklistData }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Checklist do Primeiro Cliente</h2>
        <p className="text-[12px] text-[#9B9B95] mt-0.5">
          Prontidão operacional antes de executar e antes de entregar. Uso interno.
        </p>
      </div>
      <Phase
        title="Antes da execução"
        ready={checklist.readyToExecute}
        readyLabel="Pronto para executar"
        pendingLabel="em preparação"
        items={checklist.beforeExecution}
      />
      <Phase
        title="Antes da entrega"
        ready={checklist.readyToDeliver}
        readyLabel="Pronto para entregar"
        pendingLabel="em andamento"
        items={checklist.beforeDelivery}
      />
    </div>
  );
}
