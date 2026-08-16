"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { PublicBriefingRoom } from "@/components/agency/briefing/PublicBriefingRoom";
import type { PublicBriefingRoomSubmitData } from "@/components/agency/briefing/PublicBriefingRoom";
import { EstadoDoBriefing } from "@/components/agency/briefing/EstadoDoBriefing";

export default function BriefingPage() {
  const { addClientRequest } = useAgencyStore();
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  // O id que o SERVIDOR devolveu. É diferente do id do store local: só com ele
  // dá para perguntar ao servidor em que ponto o orçamento está. `null` quando o
  // POST não chegou — e nesse caso a tela diz isso, em vez de inventar progresso.
  const [idNoServidor, setIdNoServidor] = useState<string | null>(null);
  const [falhouAoEnviar, setFalhouAoEnviar] = useState(false);

  async function handleSubmit(data: PublicBriefingRoomSubmitData) {
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
      sdrHandoff: data.sdrHandoff,
    });

    // Dual-write to DB — non-blocking, failure does not prevent local submission
    try {
      const resposta = await fetch("/api/brain/client-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName:   data.prospectName ?? data.title,
          segment:        data.extractedSummary.segment,
          services:       data.extractedSummary.services,
          objectives:     data.extractedSummary.objectives,
          rawContext:     data.rawText,
          source:         "briefing",
          // O contato vai como CAMPO PRÓPRIO, não enterrado no escopo. Quem
          // decide o que fazer com ele (proposta ou lead incompleto) é o
          // servidor — a tela só entrega o fato.
          contato:        data.contato,
          briefingJson:   { transcript: data.conversationTranscript, scope: data.v2Scope, estimate: data.v2Estimate },
          sdrHandoffJson: data.sdrHandoff ?? null,
          attachmentsJson: data.attachments.map((a) => ({
            id: a.id, fileName: a.fileName, fileType: a.fileType, sizeBytes: a.sizeBytes,
          })),
        }),
      });

      // O id do servidor é o que destranca o estado real. Sem ele a tela não
      // tem como perguntar nada — e é por isso que ela precisa saber a diferença
      // entre "não perguntei ainda" e "não consegui perguntar".
      if (resposta.ok) {
        const criado = await resposta.json();
        if (criado && typeof criado.id === "string") setIdNoServidor(criado.id);
        else setFalhouAoEnviar(true);
      } else {
        setFalhouAoEnviar(true);
      }
    } catch {
      // DB write failure is non-fatal — local store is the fallback
      console.warn("[briefing] DB dual-write failed — request saved locally only");
      setFalhouAoEnviar(true);
    }

    setSubmittedId(id);
    setSubmitted(true);
  }

  // ── A CONFIRMAÇÃO NÃO PROMETE MAIS PRAZO (16/08/2026) ──────────────────────
  //
  // O que estava aqui era texto fixo: "Entramos em contato pelo canal informado
  // em até 1 dia útil". Ninguém decidiu esse prazo e nada no código o garantia.
  // A regra que fica: **nunca se escreve prazo na cara do cliente sem que exista,
  // no código, algo que garanta esse prazo.** No lugar do prazo, o estado REAL,
  // lido do servidor. Ver `components/agency/briefing/EstadoDoBriefing.tsx` e
  // `lib/agency/briefing/estado-do-briefing.ts`.
  if (submitted) {
    return (
      <EstadoDoBriefing
        idNoServidor={idNoServidor}
        falhouAoEnviar={falhouAoEnviar}
        referencia={submittedId}
        onVoltar={() => {
          setSubmitted(false);
          setSubmittedId(null);
          setIdNoServidor(null);
          setFalhouAoEnviar(false);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">Vamos entender seu projeto</h1>
        <p className="text-[14px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-[540px]">
          Converse com a Dioli, conte o que você precisa e receba uma estimativa inicial de escopo, prazo e investimento.
        </p>
      </div>
      <PublicBriefingRoom onSubmit={handleSubmit} />
    </div>
  );
}
