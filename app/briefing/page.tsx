"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { PublicBriefingRoom } from "@/components/agency/briefing/PublicBriefingRoom";
import type { PublicBriefingRoomSubmitData } from "@/components/agency/briefing/PublicBriefingRoom";

export default function BriefingPage() {
  const { addClientRequest } = useAgencyStore();
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  function handleSubmit(data: PublicBriefingRoomSubmitData) {
    const id = addClientRequest({
      clientId: `prospect-${Date.now()}`,
      source: "public_briefing",
      title: data.title,
      rawText: data.rawText,
      extractedSummary: data.extractedSummary,
      suggestedDepartments: data.extractedSummary.suggestedDepartments,
      missingInfo: data.extractedSummary.missingInfo,
      status: "new",
      attachments: data.attachments,
      conversationTranscript: data.conversationTranscript,
      v2Scope: data.v2Scope,
      v2Estimate: data.v2Estimate,
      prospectName: data.prospectName,
      prospectEmail: data.prospectEmail,
      prospectPhone: data.prospectPhone,
    });
    setSubmittedId(id);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[#16A34A] text-[22px] font-bold">
          ✓
        </div>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mb-3">
          Recebemos seu briefing.
        </h1>
        <p className="text-[14px] text-[#6B6B65] leading-relaxed max-w-[400px] mx-auto mb-6">
          Nossa equipe vai revisar a proposta inicial e retornar com os próximos passos em breve.
        </p>
        <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-5 py-4 mb-8 text-left">
          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">O que acontece agora</p>
          <ol className="space-y-1.5">
            {[
              "Nossa equipe analisa o escopo enviado",
              "Preparamos uma proposta formal detalhada",
              "Entramos em contato por e-mail ou WhatsApp em até 1 dia útil",
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[#6B6B65]">
                <span className="w-4 h-4 rounded-full bg-[#1A1A1A] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => { setSubmitted(false); setSubmittedId(null); }}
            className="h-9 px-5 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] text-[13px] font-medium transition-colors"
          >
            Voltar ao início
          </button>
          <a
            href="https://wa.me/5511999999999"
            className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[13px] font-medium transition-colors inline-flex items-center"
          >
            Enviar complemento por WhatsApp
          </a>
        </div>
        {submittedId && (
          <p className="mt-6 text-[10px] text-[#C0C0BC]">Referência: {submittedId}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#1A1A1A]">Vamos entender seu projeto</h1>
        <p className="text-[14px] text-[#6B6B65] mt-1 leading-relaxed max-w-[540px]">
          Converse com a Dioli, conte o que você precisa e receba uma estimativa inicial de escopo, prazo e investimento.
        </p>
      </div>
      <PublicBriefingRoom onSubmit={handleSubmit} />
    </div>
  );
}
