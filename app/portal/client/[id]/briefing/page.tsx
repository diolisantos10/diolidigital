"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import { BriefingRoomV2 } from "@/components/agency/briefing/BriefingRoomV2";
import type { BriefingRoomV2SubmitData } from "@/components/agency/briefing/BriefingRoomV2";

export default function BriefingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { clients, addClientRequest } = useAgencyStore();

  // All hooks before conditional return
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [countdown,   setCountdown]   = useState(3);

  useEffect(() => {
    if (!submittedId) return;
    if (countdown <= 0) { router.push(`/portal/client/${id}`); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [submittedId, countdown, router, id]);

  // Client guard (after all hooks)
  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  function handleSubmit(data: BriefingRoomV2SubmitData) {
    const reqId = addClientRequest({
      clientId: id,
      title: data.title,
      rawText: data.rawText,
      extractedSummary: data.extractedSummary,
      suggestedDepartments: data.extractedSummary.suggestedDepartments,
      missingInfo: data.extractedSummary.missingInfo,
      status: "new",
      source: "client_portal",
      attachments: data.attachments,
      conversationTranscript: data.conversationTranscript,
      v2Scope: data.v2Scope,
      v2Estimate: data.v2Estimate,
    });
    setSubmittedId(reqId);
    setCountdown(3);
  }

  if (submittedId) {
    return (
      <div className="max-w-[560px] mx-auto py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[28px]">
          ✓
        </div>
        <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">Solicitação enviada!</h1>
        <p className="text-[14px] text-[#6B6B65] leading-relaxed max-w-[380px] mx-auto mb-2">
          Recebemos seu briefing. Nossa equipe irá analisar e entrar em contato com os próximos passos.
        </p>
        <p className="text-[12px] text-[#9B9B95] mb-8">
          Redirecionando para o seu painel em {countdown}s…
        </p>
        <button
          onClick={() => router.push(`/portal/client/${id}`)}
          className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[13px] font-medium transition-colors"
        >
          Ir para meu painel →
        </button>
      </div>
    );
  }

  return (
    <BriefingRoomV2
      clientId={id}
      onSubmit={handleSubmit}
      onCancel={() => router.push(`/portal/client/${id}`)}
    />
  );
}
