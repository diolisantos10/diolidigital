"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import { extractBriefing } from "@/lib/agency/briefing-extractor";
import type { ExtractedRequestSummary } from "@/lib/agency/client-requests";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";

// ── Dept display names ────────────────────────────────────────────────────────
const DEPT_LABELS: Record<string, string> = {
  "social-media":        "Social Media",
  "design":              "Design",
  "paid-traffic":        "Tráfego Pago",
  "brand-hub":           "Identidade de Marca",
  "project-management":  "Gestão de Projetos",
  "strategy":            "Estratégia",
};

export default function BriefingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { clients, addClientRequest } = useAgencyStore();

  // ── Form state ─────────────────────────────────────────────────────────────
  // All hooks must appear before any conditional return.
  const [rawText,    setRawText]    = useState("");
  const [title,      setTitle]      = useState("");
  const [deadline,   setDeadline]   = useState("");
  const [links,      setLinks]      = useState("");
  const [budget,     setBudget]     = useState("");

  // ── Live extraction state ──────────────────────────────────────────────────
  const [summary,    setSummary]    = useState<ExtractedRequestSummary | null>(null);
  const [autoTitle,  setAutoTitle]  = useState("");

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitted,  setSubmitted]  = useState(false);

  // ── Speech-to-text ────────────────────────────────────────────────────────
  const handleTranscript = useCallback((text: string) => {
    setRawText((prev) => prev ? prev.trimEnd() + " " + text : text);
  }, []);
  const { isListening, isSupported, error: micError, startListening, stopListening } =
    useSpeechToText({ onTranscript: handleTranscript });

  // Run extraction whenever rawText changes (debounced 300ms)
  const runExtraction = useCallback(() => {
    if (rawText.trim().length < 20) {
      setSummary(null);
      setAutoTitle("");
      return;
    }
    const { summary: s, title: t } = extractBriefing(rawText);
    setSummary(s);
    setAutoTitle(t);
  }, [rawText]);

  useEffect(() => {
    const timer = setTimeout(runExtraction, 300);
    return () => clearTimeout(timer);
  }, [runExtraction]);

  // ── Client guard (after all hooks) ────────────────────────────────────────
  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  const handleSubmit = () => {
    if (!rawText.trim()) return;

    const { summary: s, title: t } = extractBriefing(rawText);
    const finalTitle = title.trim() || t || "Solicitação";

    const enrichedMissingInfo = [...s.missingInfo];
    if (deadline.trim()) {
      const idx = enrichedMissingInfo.indexOf("Prazo de entrega");
      if (idx !== -1) enrichedMissingInfo.splice(idx, 1);
    }
    if (budget.trim()) {
      const idx = enrichedMissingInfo.indexOf("Orçamento");
      if (idx !== -1) enrichedMissingInfo.splice(idx, 1);
    }
    if (links.trim()) {
      const idx = enrichedMissingInfo.indexOf("Referências visuais ou de comunicação");
      if (idx !== -1) enrichedMissingInfo.splice(idx, 1);
    }

    addClientRequest({
      clientId: id,
      title: finalTitle,
      rawText: rawText.trim(),
      extractedSummary: { ...s, missingInfo: enrichedMissingInfo },
      suggestedDepartments: s.suggestedDepartments,
      missingInfo: enrichedMissingInfo,
      status: "new",
      source: "client_portal",
      attachments: [],
    });

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-[640px] mx-auto py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[28px]">
          ✓
        </div>
        <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">Solicitação enviada!</h1>
        <p className="text-[14px] text-[#6B6B65] leading-relaxed max-w-[380px] mx-auto mb-8">
          Recebemos seu briefing. Nossa equipe irá analisar e entrar em contato com os próximos passos.
        </p>
        <button
          onClick={() => router.push(`/portal/client/${id}`)}
          className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[13px] font-medium transition-colors"
        >
          Voltar ao portal
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/portal/client/${id}`)}
          className="text-[12px] text-[#9B9B95] hover:text-[#6B6B65] mb-4 flex items-center gap-1 transition-colors"
        >
          ← Voltar
        </button>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A]">Nova solicitação</h1>
        <p className="text-[13px] text-[#6B6B65] mt-1 leading-relaxed">
          Conte o que você precisa com suas palavras. Quanto mais detalhes, melhor conseguimos atender.
        </p>
      </div>

      <div className="space-y-5">
        {/* Main textarea */}
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Conte o que você precisa — descreva o projeto, os objetivos, o que você quer comunicar, para quem, e qualquer detalhe que achar importante..."
            rows={8}
            autoFocus
            className="w-full px-5 pt-5 pb-4 text-[14px] text-[#1A1A1A] placeholder:text-[#C0C0BC] leading-relaxed bg-transparent outline-none resize-none"
          />
          <div className="px-5 pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#C0C0BC]">{rawText.length} caracteres</span>
              {rawText.trim().length >= 20 && (
                <span className="text-[11px] text-[#9B9B95]">Analisando em tempo real...</span>
              )}
            </div>

            {/* Mic row */}
            <div className="flex items-center gap-2">
              {isSupported ? (
                <>
                  {isListening && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[#DC2626] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />
                      Ouvindo...
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    className={`h-7 px-3 rounded-[6px] text-[11px] font-medium border transition-colors flex items-center gap-1.5 ${
                      isListening
                        ? "bg-[#FEE2E2] border-[#FECACA] text-[#DC2626] hover:bg-[#FECACA]"
                        : "bg-[#F7F7F6] border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95]"
                    }`}
                  >
                    {isListening ? (
                      <>
                        <span className="w-2 h-2 rounded-[2px] bg-[#DC2626]" />
                        Parar gravação
                      </>
                    ) : (
                      <>
                        <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
                          <rect x="3.5" y="0.5" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M1 7C1 9.76 3.01 12 5.5 12C7.99 12 10 9.76 10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <line x1="5.5" y1="12" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Gravar áudio
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-7 px-3 rounded-[6px] text-[11px] font-medium border border-[#E5E5E2] bg-[#F7F7F6] text-[#C0C0BC] cursor-not-allowed"
                >
                  Microfone indisponível
                </button>
              )}
            </div>

            {/* Mic helper / error */}
            {isSupported && !micError && (
              <p className="text-[11px] text-[#9B9B95]">
                Você pode falar o briefing em voz alta. A transcrição será adicionada ao texto acima.
              </p>
            )}
            {micError && (
              <p className="text-[11px] text-[#DC2626]">{micError}</p>
            )}
          </div>
        </div>

        {/* Live extraction summary */}
        {summary && (
          <div className="bg-[#F7F7F6] rounded-[10px] border border-[#E5E5E2] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Resumo da solicitação</span>
              <span className="h-4 px-1.5 rounded-[4px] bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-semibold">automático</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {summary.services.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Serviços identificados</div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.services.map((s) => (
                      <span key={s} className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.channels.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Canais</div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.channels.map((c) => (
                      <span key={c} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.objectives.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.objectives.map((o) => (
                      <span key={o} className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-medium">{o}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.quantities.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Quantidades</div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.quantities.map((q) => (
                      <span key={q} className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[11px] font-medium">{q}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {summary.urgency && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Urgência:</span>
                <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[11px] font-medium">{summary.urgency}</span>
              </div>
            )}

            {summary.suggestedDepartments.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Equipes sugeridas</div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.suggestedDepartments.map((d) => (
                    <span key={d} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#1A1A1A] text-[11px] font-medium">
                      {DEPT_LABELS[d] ?? d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.missingInfo.length > 0 && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2.5">
                <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">Para agilizar o atendimento, adicione também:</div>
                <ul className="space-y-0.5">
                  {summary.missingInfo.map((m) => (
                    <li key={m} className="text-[12px] text-[#92400E] flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#F59E0B] shrink-0" />{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Optional fields */}
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
          <div className="text-[12px] font-semibold text-[#1A1A1A]">Detalhes complementares <span className="text-[#9B9B95] font-normal">(opcional)</span></div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">
                Título da solicitação
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={autoTitle || "Ex.: Posts de lançamento — Instagram"}
                className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">
                Prazo desejado
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">
              Links e referências
            </label>
            <input
              type="text"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder="Cole links de sites, redes sociais, ou exemplos que goste..."
              className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">
              Orçamento estimado
            </label>
            <input
              type="text"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Ex.: R$ 3.000 / mês ou por projeto"
              className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white transition-colors"
            />
          </div>

          {/* Upload placeholder */}
          <div className="border border-dashed border-[#E5E5E2] rounded-[8px] px-4 py-4 text-center">
            <p className="text-[12px] text-[#9B9B95]">↑ Anexar arquivos <span className="text-[#C0C0BC]">— disponível em breve</span></p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={rawText.trim().length < 10}
            className="h-10 px-6 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
          >
            Enviar solicitação
          </button>
          <button
            onClick={() => router.push(`/portal/client/${id}`)}
            className="h-10 px-4 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:text-[#1A1A1A] text-[13px] font-medium transition-colors"
          >
            Cancelar
          </button>
          <span className="text-[11px] text-[#C0C0BC] ml-auto">Nossa equipe responde em até 24h úteis</span>
        </div>
      </div>
    </div>
  );
}
