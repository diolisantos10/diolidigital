"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { extractBriefing } from "@/lib/agency/briefing-extractor";
import { DEMO_CLIENT_ID, SUSHI_CAZZA_EXAMPLE_TEXT } from "@/lib/agency/demo-client";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";

export default function DemoBriefingPage() {
  const { addClientRequest } = useAgencyStore();

  const [rawText,  setRawText]  = useState("");
  const [title,    setTitle]    = useState("");
  const [deadline, setDeadline] = useState("");
  const [links,    setLinks]    = useState("");
  const [budget,   setBudget]   = useState("");
  const [summary,  setSummary]  = useState(() => extractBriefing("").summary);
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { summary: s } = extractBriefing(rawText);
      setSummary(s);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawText]);

  const handleTranscript = useCallback((text: string) => {
    setRawText((prev) => prev ? prev.trimEnd() + " " + text : text);
  }, []);

  const { isListening, isSupported, error: micError, startListening, stopListening } =
    useSpeechToText({ onTranscript: handleTranscript });

  function fillExample() {
    setRawText(SUSHI_CAZZA_EXAMPLE_TEXT);
  }

  function handleSubmit() {
    if (!rawText.trim()) return;
    const { summary: s, title: derivedTitle } = extractBriefing(rawText);
    const extra: string[] = [];
    if (deadline.trim()) extra.push(`Prazo: ${deadline.trim()}`);
    if (links.trim())    extra.push(`Links: ${links.trim()}`);
    if (budget.trim())   extra.push(`Orçamento: ${budget.trim()}`);
    const fullText = extra.length > 0 ? `${rawText.trim()}\n\n${extra.join("\n")}` : rawText.trim();

    const id = addClientRequest({
      clientId: DEMO_CLIENT_ID,
      title: title.trim() || derivedTitle,
      rawText: fullText,
      extractedSummary: s,
      suggestedDepartments: s.suggestedDepartments,
      missingInfo: s.missingInfo,
      status: "new",
      source: "client_portal",
      attachments: [],
    });
    setSubmittedId(id);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[#16A34A] text-[24px] font-bold">
          ✓
        </div>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mb-2">Solicitação enviada para a Dioli.</h1>
        <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-1">
          Próximo passo: nossa equipe vai analisar e estruturar seu projeto.
        </p>
        <p className="text-[12px] text-[#9B9B95] mb-8">
          Você será notificado assim que tivermos novidades.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/portal-demo/sushi-cazza"
            className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors inline-flex items-center"
          >
            Ver minha solicitação →
          </Link>
          <button
            onClick={() => {
              setRawText(""); setTitle(""); setDeadline(""); setLinks(""); setBudget("");
              setSummary(extractBriefing("").summary);
              setSubmitted(false); setSubmittedId(null);
            }}
            className="h-9 px-4 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:text-[#1A1A1A] text-[12px] font-medium transition-colors"
          >
            Enviar outra solicitação
          </button>
          <Link
            href="/agency/requests"
            className="h-9 px-4 rounded-[8px] border border-[#5B5BD6] text-[#5B5BD6] hover:bg-[#EEF0FF] text-[12px] font-medium transition-colors inline-flex items-center"
          >
            Abrir painel do cliente →
          </Link>
        </div>

        {submittedId && (
          <p className="mt-8 text-[11px] text-[#C0C0BC]">ID da solicitação: {submittedId}</p>
        )}
      </div>
    );
  }

  const hasContent = rawText.trim().length > 0;
  const hasSummaryData =
    summary.services.length > 0 ||
    summary.channels.length > 0 ||
    summary.objectives.length > 0 ||
    summary.urgency;

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 items-start">
      {/* Left: form */}
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Nova solicitação</h1>
            <p className="text-[13px] text-[#9B9B95] mt-0.5">
              Descreva o que você precisa — nossa equipe vai analisar e propor os próximos passos.
            </p>
          </div>
          <button
            onClick={fillExample}
            className="h-8 px-3 rounded-[7px] border border-[#FDE68A] bg-[#FFFBEB] text-[#D97706] hover:border-[#F59E0B] text-[11px] font-semibold transition-colors shrink-0"
          >
            ✦ Preencher exemplo Sushi Cazza
          </button>
        </div>

        {/* Main textarea */}
        <div>
          <label className="block text-[12px] font-semibold text-[#1A1A1A] mb-2">
            Descreva sua necessidade <span className="text-[#DC2626]">*</span>
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Ex.: Preciso de social media para Instagram, com foco em ganhar novos clientes e vender mais. Ainda não tenho identidade visual definida..."
            rows={8}
            autoFocus
            className="w-full px-4 py-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[10px] outline-none focus:border-[#5B5BD6] focus:shadow-[0_0_0_3px_rgba(91,91,214,0.08)] resize-none leading-relaxed transition-all placeholder:text-[#C0C0BC]"
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-[#C0C0BC]">{rawText.length} caracteres</p>

            {/* Mic button */}
            {isSupported ? (
              <div className="flex items-center gap-2">
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
                      : "bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95]"
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
              </div>
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

          {/* Mic helper + error */}
          {isSupported && !micError && (
            <p className="text-[11px] text-[#9B9B95] mt-1.5">
              Você pode falar o briefing em voz alta. A transcrição será adicionada ao texto acima.
            </p>
          )}
          {micError && (
            <p className="text-[11px] text-[#DC2626] mt-1.5">{micError}</p>
          )}
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
              Título da solicitação (opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deixe em branco para gerarmos automaticamente"
              className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#5B5BD6] transition-colors placeholder:text-[#C0C0BC]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
              Prazo desejado (opcional)
            </label>
            <input
              type="text"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="Ex.: até final de julho"
              className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#5B5BD6] transition-colors placeholder:text-[#C0C0BC]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
              Links de referência (opcional)
            </label>
            <input
              type="text"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder="@perfis, sites que admira..."
              className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#5B5BD6] transition-colors placeholder:text-[#C0C0BC]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
              Orçamento disponível (opcional)
            </label>
            <input
              type="text"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Ex.: R$ 2.000/mês"
              className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#5B5BD6] transition-colors placeholder:text-[#C0C0BC]"
            />
          </div>
        </div>

        {/* Upload placeholder */}
        <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-5 py-4 text-center">
          <p className="text-[12px] text-[#9B9B95]">
            ↑ Arraste arquivos aqui ou{" "}
            <span className="text-[#5B5BD6] cursor-not-allowed">clique para selecionar</span>
            <span className="block text-[10px] text-[#C0C0BC] mt-0.5">
              Brand Book, logo, referências — disponível em breve
            </span>
          </p>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={!hasContent}
            className="h-10 px-6 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
          >
            Enviar solicitação →
          </button>
          <Link
            href="/portal-demo/sushi-cazza"
            className="h-10 px-4 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:text-[#1A1A1A] text-[12px] font-medium transition-colors inline-flex items-center"
          >
            Cancelar
          </Link>
        </div>
      </div>

      {/* Right: live extraction panel */}
      <div className="sticky top-6">
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#F0F0ED]">
            <div className="text-[11px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">
              Resumo da solicitação
            </div>
            <p className="text-[10px] text-[#9B9B95] mt-0.5">Gerado automaticamente enquanto você digita</p>
          </div>

          {!hasContent ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-[#C0C0BC]">
                Comece a digitar para ver o resumo aparecer aqui.
              </p>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-4">
              {summary.services.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Serviços</div>
                  <div className="flex flex-wrap gap-1">
                    {summary.services.map((s) => (
                      <span key={s} className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {summary.channels.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Canais</div>
                  <div className="flex flex-wrap gap-1">
                    {summary.channels.map((c) => (
                      <span key={c} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {summary.objectives.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Objetivos detectados</div>
                  <div className="flex flex-wrap gap-1">
                    {summary.objectives.map((o) => (
                      <span key={o} className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-medium">{o}</span>
                    ))}
                  </div>
                </div>
              )}
              {summary.quantities.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Quantidades</div>
                  <div className="flex flex-wrap gap-1">
                    {summary.quantities.map((q) => (
                      <span key={q} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{q}</span>
                    ))}
                  </div>
                </div>
              )}
              {summary.urgency && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Urgência</div>
                  <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[10px] font-medium inline-block">
                    {summary.urgency}
                  </span>
                </div>
              )}
              {summary.suggestedDepartments.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Equipes sugeridas</div>
                  <div className="flex flex-wrap gap-1">
                    {summary.suggestedDepartments.map((d) => (
                      <span key={d} className="h-5 px-2 rounded-full bg-[#F7F7F6] border border-[#E5E5E2] text-[#6B6B65] text-[10px] font-medium">{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {!hasSummaryData && hasContent && (
                <p className="text-[11px] text-[#9B9B95] text-center py-2">
                  Nenhum dado identificado ainda — continue descrevendo.
                </p>
              )}
              {summary.missingInfo.length > 0 && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2.5 mt-2">
                  <div className="text-[9px] font-semibold text-[#D97706] uppercase tracking-[0.06em] mb-1">Informações que ajudam</div>
                  <ul className="space-y-0.5">
                    {summary.missingInfo.map((m) => (
                      <li key={m} className="text-[10px] text-[#92400E] flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-[#F59E0B] shrink-0" />{m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
