"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { DEMO_CLIENT_ID, SUSHI_CAZZA_EXAMPLE_TEXT } from "@/lib/agency/demo-client";
import { BriefingRoomV2 } from "@/components/agency/briefing/BriefingRoomV2";
import type { BriefingRoomV2SubmitData } from "@/components/agency/briefing/BriefingRoomV2";

export default function DemoBriefingPage() {
  const router = useRouter();
  const { addClientRequest } = useAgencyStore();

  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [countdown,   setCountdown]   = useState(3);

  useEffect(() => {
    if (!submittedId) return;
    if (countdown <= 0) { router.push("/portal-demo/sushi-cazza"); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [submittedId, countdown, router]);

  function handleSubmit(data: BriefingRoomV2SubmitData) {
    const id = addClientRequest({
      clientId: DEMO_CLIENT_ID,
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
    setSubmittedId(id);
    setCountdown(3);
  }

  if (submittedId) {
    return (
      <div className="max-w-[560px] mx-auto py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[#16A34A] text-[24px] font-bold">
          ✓
        </div>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mb-2">
          Solicitação enviada para a Dioli.
        </h1>
        <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-1">
          Nossa equipe vai analisar e estruturar seu projeto.
        </p>
        <p className="text-[12px] text-[#9B9B95] mb-8">
          Redirecionando para o seu painel em {countdown}s…
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/portal-demo/sushi-cazza"
            className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors inline-flex items-center"
          >
            Ir para meu painel →
          </Link>
        </div>
        <p className="mt-8 text-[11px] text-[#C0C0BC]">ID: {submittedId}</p>
      </div>
    );
  }

  return (
    <BriefingRoomV2
      clientId={DEMO_CLIENT_ID}
      showDemoButton
      exampleText={SUSHI_CAZZA_EXAMPLE_TEXT}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/portal-demo/sushi-cazza")}
    />
  );
}
