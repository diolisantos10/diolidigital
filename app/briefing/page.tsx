"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { PublicBriefingRoom } from "@/components/agency/briefing/PublicBriefingRoom";
import type { PublicBriefingRoomSubmitData } from "@/components/agency/briefing/PublicBriefingRoom";
import { LeadNaPorta, type ContatoDaPorta } from "@/components/agency/briefing/LeadNaPorta";

export default function BriefingPage() {
  const { addClientRequest } = useAgencyStore();
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  // Quem sobe sem contato NÃO pode ver "entramos em contato pelo canal
  // informado". Prometer retorno para quem não deixou endereço é a mentira mais
  // fácil desta tela — e a que faz a pessoa esperar por uma ligação que não existe.
  const [temContato, setTemContato] = useState(true);
  // ── O CONTATO É PEDIDO NA PORTA, NÃO NO MEIO DA CONVERSA ──────────────────
  // Ordem do CEO em 16/08 depois de esperar a noite inteira por um orçamento
  // que não chegava: a casa não sabia como falar com ele. Perguntar no meio da
  // conversa depende de o modelo lembrar e de o cliente responder; perguntar na
  // porta acontece sempre. `entrou` guarda se o visitante já passou por lá —
  // inclusive quando escolheu não deixar contato (aí vale `null`).
  const [entrou, setEntrou] = useState(false);
  const [contatoDaPorta, setContatoDaPorta] = useState<ContatoDaPorta>(null);

  async function handleSubmit(data: PublicBriefingRoomSubmitData) {
    // O contato da PORTA manda: ele é o que o visitante declarou antes de
    // começar. O da conversa só completa o que ficou em branco.
    const contato = contatoDaPorta ?? data.contato;
    setTemContato(contato !== null);
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
      prospectName: contatoDaPorta?.nome || data.prospectName,
      prospectEmail: contatoDaPorta?.email || data.prospectEmail,
      prospectPhone: contatoDaPorta?.whatsapp || data.prospectPhone,
      sdrHandoff: data.sdrHandoff,
    });

    // Dual-write to DB — non-blocking, failure does not prevent local submission
    try {
      await fetch("/api/brain/client-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName:   data.prospectName ?? contatoDaPorta?.nome ?? data.title,
          segment:        data.extractedSummary.segment,
          services:       data.extractedSummary.services,
          objectives:     data.extractedSummary.objectives,
          rawContext:     data.rawText,
          source:         "briefing",
          // O contato vai como CAMPO PRÓPRIO, não enterrado no escopo. Quem
          // decide o que fazer com ele (proposta ou lead incompleto) é o
          // servidor — a tela só entrega o fato.
          contato,
          briefingJson:   { transcript: data.conversationTranscript, scope: data.v2Scope, estimate: data.v2Estimate },
          sdrHandoffJson: data.sdrHandoff ?? null,
          attachmentsJson: data.attachments.map((a) => ({
            id: a.id, fileName: a.fileName, fileType: a.fileType, sizeBytes: a.sizeBytes,
          })),
        }),
      });
    } catch {
      // DB write failure is non-fatal — local store is the fallback
      console.warn("[briefing] DB dual-write failed — request saved locally only");
    }

    setSubmittedId(id);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[var(--success)] text-[22px] font-bold">
          ✓
        </div>
        <h1 className="text-[22px] font-semibold text-[var(--text-primary)] mb-3">
          {temContato ? "Recebemos seu briefing." : "Seu briefing está guardado."}
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[400px] mx-auto mb-6">
          {temContato
            ? "Nossa equipe vai revisar a proposta inicial e retornar com os próximos passos em breve."
            : "Nada do que você contou se perdeu. Mas, como não temos WhatsApp nem e-mail seu, não temos como te enviar a proposta — quando quiser, é só falar com a gente pelo WhatsApp abaixo."}
        </p>
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] px-5 py-4 mb-8 text-left">
          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">O que acontece agora</p>
          <ol className="space-y-1.5">
            {(temContato
              ? [
                  "Nossa equipe analisa o escopo enviado",
                  "Preparamos uma proposta formal detalhada",
                  // ⛔ SEM PRAZO, e isto é ordem, não estilo. Em 16/08/2026 o CEO,
                  // com todas as letras: *"em relação à confirmação de promessa,
                  // de orçamento em um dia, não autorizei nada disso."* A tela
                  // prometia "em até 1 dia útil" para um retorno que ninguém se
                  // comprometeu a dar — e prazo prometido sem dono é dívida que a
                  // casa contrai em nome de quem não foi consultado.
                  "Entramos em contato pelo canal informado",
                ]
              : [
                  "Seu briefing fica guardado com tudo que você contou",
                  "A proposta só é preparada quando tivermos um canal de contato",
                  "Você pode nos chamar no WhatsApp a qualquer momento",
                ]
            ).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="w-4 h-4 rounded-full bg-[var(--text-primary)] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
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
            className="h-9 px-5 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] text-[13px] font-medium transition-colors"
          >
            Voltar ao início
          </button>
          <a
            href="https://wa.me/5511989400692"
            // PAR DE COR QUE VIRA JUNTO. O CEO, em 16/08/2026, não conseguiu ler
            // este botão: *"está preto sobre preto."*
            //
            // A causa não era este botão — era o par escolhido. `--text-primary`
            // é cor de TEXTO usada como FUNDO, e o tema escuro da casa redefine
            // `--background` sem redefinir `--text-primary`. Resultado medido:
            // fundo do botão #1F2937 sobre página #070A1F = **1,33:1**. O botão
            // deixa de existir. Um token que não vira junto com o tema é uma
            // cor fixa com nome de token.
            //
            // `--primary`/`--primary-foreground` são o par que a casa mantém
            // invertido nos dois temas (navy+branco no claro, cyan+navy no
            // escuro) — por isso o par, e não um hex novo aqui.
            className="h-9 px-5 rounded-[8px] bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] text-[13px] font-medium transition-opacity inline-flex items-center"
          >
            Falar com a Dioli no WhatsApp
          </a>
        </div>
        {submittedId && (
          <p className="mt-6 text-[10px] text-[var(--text-subtle)]">Referência: {submittedId}</p>
        )}
      </div>
    );
  }

  if (!entrou) {
    return (
      <LeadNaPorta
        aoEntrar={(c) => { setContatoDaPorta(c); setEntrou(true); }}
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
