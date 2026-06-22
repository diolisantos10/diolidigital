"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ConvState, ConvMessage, BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { canSubmitProposal, getSubmissionBlockReason, buildHandoffSummary } from "@/lib/agency/sdr-agent";
import { detectPackage, getPackageDef, SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";
import { FileUploadZone } from "@/components/agency/briefing/FileUploadZone";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import type { RequestAttachment, ExtractedRequestSummary } from "@/lib/agency/client-requests";
import type { SDRHandoff } from "@/lib/agency/sdr-agent";

// ── Public types ───────────────────────────────────────────────────────────────

export interface PublicBriefingRoomSubmitData {
  conversationTranscript: ConvMessage[];
  v2Scope: BriefingScope;
  v2Estimate: LiveEstimate;
  attachments: RequestAttachment[];
  extractedSummary: ExtractedRequestSummary;
  rawText: string;
  title: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  businessName: string;
  segment: string;
  sdrHandoff?: SDRHandoff;
}

interface PublicBriefingRoomProps {
  onSubmit: (data: PublicBriefingRoomSubmitData) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function buildRawText(messages: ConvMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `[${m.role === "assistant" ? "Dioli" : "Prospect"}] ${m.text}`)
    .join("\n\n");
}

function buildExtractedSummary(scope: BriefingScope): ExtractedRequestSummary {
  const services: string[] = [];
  const depts: string[] = [];
  if (scope.wantsSocialMedia)   { services.push("Social Media"); depts.push("social-media", "design"); }
  if (scope.wantsPaidTraffic)   { services.push("Tráfego Pago"); depts.push("paid-traffic"); }
  if (scope.branding.requested) { services.push("Identidade Visual"); depts.push("brand-hub"); }

  const s = scope.social;
  const quantities: string[] = [];
  if (s?.postsPerWeek !== undefined) quantities.push(`${s.postsPerWeek * 4} posts/mês`);
  if (s?.storiesPerWeek !== undefined && s.storiesPerWeek > 0) quantities.push(`${s.storiesPerWeek * 4} stories/mês`);
  if (s?.reelsPerMonth !== undefined && s.reelsPerMonth > 0) quantities.push(`${s.reelsPerMonth} reels/mês`);

  return {
    clientName:           scope.businessName,
    segment:              scope.segment,
    services,
    channels:             s?.platforms ?? [],
    objectives:           scope.objectives,
    quantities,
    urgency:              scope.deadline ?? undefined,
    suggestedDepartments: [...new Set(depts)],
    missingInfo:          [],
  };
}

function buildTitle(scope: BriefingScope): string {
  const biz = scope.businessName ?? "Prospect";
  const services: string[] = [];
  if (scope.wantsSocialMedia) {
    const postsPerMonth = (scope.social?.postsPerWeek ?? 0) * 4;
    if (postsPerMonth > 0) {
      const pkg = getPackageDef(detectPackage(postsPerMonth));
      services.push(pkg.label);
    } else {
      services.push("Social Media");
    }
  }
  if (scope.wantsPaidTraffic)   services.push("Tráfego Pago");
  if (scope.branding.requested) services.push("Identidade Visual");
  const serviceStr = services.length > 0 ? ` — ${services.join(", ")}` : "";
  return `Orçamento — ${biz}${serviceStr}`;
}

// ── Message text renderer ──────────────────────────────────────────────────────

function MsgText({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
          {para.split("\n").map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i}>{part.slice(2, -2)}</strong>
                ) : (
                  part
                )
              )}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ConvMessage }) {
  if (msg.role === "system") {
    return (
      <div className="text-center">
        <span className="inline-block text-[10px] text-[#9B9B95] bg-[#F7F7F6] px-3 py-1 rounded-full">
          {msg.text}
        </span>
      </div>
    );
  }
  const isAssistant = msg.role === "assistant";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="2.5" fill="white" fillOpacity="0.9"/>
          </svg>
        </div>
      )}
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-[12px] text-[13px] leading-relaxed ${
          isAssistant
            ? "bg-[#F7F7F6] text-[#1A1A1A] rounded-tl-[4px]"
            : "bg-[#1A1A1A] text-white rounded-tr-[4px]"
        }`}
      >
        <MsgText text={msg.text} />
      </div>
    </div>
  );
}

// ── Package badge ─────────────────────────────────────────────────────────────

const PKG_STYLE: Record<string, { bg: string; text: string }> = {
  starter: { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]" },
  growth:  { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]" },
  pro:     { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]" },
};

// ── Scope section ─────────────────────────────────────────────────────────────

function ScopeSection({ scope }: { scope: BriefingScope }) {
  let pkgLabel: string | null = null;
  let pkgStyle: { bg: string; text: string } | null = null;

  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    const postsPerMonth = scope.social.postsPerWeek * 4;
    const pkgId = detectPackage(postsPerMonth);
    const pkg   = getPackageDef(pkgId);
    pkgLabel = pkg.label;
    pkgStyle = PKG_STYLE[pkgId];
  }

  const rows: { label: string; value: string; dim?: boolean }[] = [];

  if (scope.serviceMode === "monthly")  rows.push({ label: "Modalidade", value: "Gestão mensal" });
  if (scope.serviceMode === "one_off")  rows.push({ label: "Modalidade", value: "Projeto pontual" });

  if (scope.wantsSocialMedia) {
    rows.push({ label: "Serviço", value: "Social Media" });
    if (scope.social?.platforms.length)
      rows.push({ label: "Canais", value: scope.social.platforms.join(", ") });
    if (scope.social?.postsPerWeek !== undefined)
      rows.push({ label: "Posts", value: `${scope.social.postsPerWeek * 4}/mês` });
    if (scope.social?.storiesPerWeek !== undefined)
      rows.push({
        label: "Stories",
        value: scope.social.storiesPerWeek > 0 ? `${scope.social.storiesPerWeek * 4}/mês` : "Não incluído",
        dim: scope.social.storiesPerWeek === 0,
      });
    if (scope.social?.reelsPerMonth !== undefined)
      rows.push({
        label: "Reels",
        value: scope.social.reelsPerMonth > 0 ? `${scope.social.reelsPerMonth}/mês (edição)` : "Não incluído",
        dim: scope.social.reelsPerMonth === 0,
      });
    if (scope.social?.hasPhotos !== undefined)
      rows.push({ label: "Fotos", value: scope.social.hasPhotos ? "Disponíveis" : "Sem produção", dim: !scope.social.hasPhotos });
    if (scope.social?.needsCopy !== undefined)
      rows.push({ label: "Copy", value: scope.social.needsCopy ? "Pela Dioli" : "Pelo cliente" });
  }

  if (scope.wantsPaidTraffic) {
    rows.push({ label: "Serviço", value: "Tráfego Pago" });
    if (scope.traffic?.monthlyAdBudget)
      rows.push({ label: "Verba ads", value: scope.traffic.monthlyAdBudget });
  }

  if (scope.branding.requested)
    rows.push({ label: "Serviço", value: "Identidade Visual" });
  if (scope.branding.hasBrandBook)
    rows.push({ label: "Brand Book", value: "Disponível — como referência" });
  if (scope.objectives.length)
    rows.push({ label: "Objetivos", value: scope.objectives.join(", ") });
  if (scope.budgetRange)
    rows.push({ label: "Orçamento", value: scope.budgetRange });
  if (scope.deadline)
    rows.push({ label: "Prazo", value: scope.deadline });

  return (
    <div className="space-y-2">
      {pkgLabel && pkgStyle && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Plano</span>
          <span className={`h-5 px-2.5 rounded-full text-[10px] font-semibold ${pkgStyle.bg} ${pkgStyle.text}`}>
            {pkgLabel}
          </span>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <span className="text-[#9B9B95] shrink-0 w-[68px]">{r.label}</span>
          <span className={r.dim ? "text-[#C0C0BC]" : "text-[#1A1A1A] font-medium"}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Estimate section ──────────────────────────────────────────────────────────

const CONFIDENCE_CFG = {
  none:   { label: "",                     bg: "",               text: "" },
  low:    { label: "Estimativa inicial",   bg: "bg-[#FEF3C7]",  text: "text-[#D97706]" },
  medium: { label: "Estimativa aprox.",    bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]" },
  high:   { label: "Estimativa confiável", bg: "bg-[#DCFCE7]",  text: "text-[#16A34A]" },
};

function EstimateSection({ estimate }: { estimate: LiveEstimate }) {
  const cfg = CONFIDENCE_CFG[estimate.confidence];
  return (
    <div className="border-t border-[#F0F0ED] pt-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Estimativa mensal</span>
        {estimate.confidence !== "none" && (
          <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
        )}
      </div>
      {estimate.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <span className="text-[#9B9B95] flex-1 leading-relaxed">{item.label}</span>
          <span className="text-[#6B6B65] shrink-0 text-right">
            {fmtBRL(item.minPrice)}–{fmtBRL(item.maxPrice)}
            <span className="text-[#C0C0BC]">/{item.unit}</span>
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1.5 border-t border-[#F0F0ED]">
        <span className="text-[11px] font-semibold text-[#1A1A1A]">Total</span>
        <span className="text-[13px] font-bold text-[#1A1A1A]">
          {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
        </span>
      </div>
    </div>
  );
}

// ── Quick action buttons ───────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  text: string;
  show: (scope: BriefingScope) => boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Plano Starter",
    text: "Quero começar com um plano mais simples e barato",
    show: (s) => s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) * 4 > 8,
  },
  {
    label: "Tirar reels",
    text: "Pode tirar os reels por enquanto",
    show: (s) => s.wantsSocialMedia && (s.social?.reelsPerMonth ?? 0) > 0,
  },
  {
    label: "Adicionar reels",
    text: "Quero adicionar 2 reels por mês",
    show: (s) => s.wantsSocialMedia && s.social?.postsPerWeek !== undefined && (s.social?.reelsPerMonth === 0 || s.social?.reelsPerMonth === undefined),
  },
  {
    label: "Sem tráfego pago",
    text: "Pode tirar o tráfego pago",
    show: (s) => !!s.wantsPaidTraffic,
  },
  {
    label: "Incluir tráfego pago",
    text: "Quero incluir tráfego pago",
    show: (s) => s.wantsSocialMedia && s.wantsPaidTraffic === false && s.social?.postsPerWeek !== undefined,
  },
  {
    label: "Menos posts",
    text: "Quero reduzir a quantidade de posts",
    show: (s) => s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) > 2,
  },
];

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({
  scope,
  estimate,
  submitLabel,
  onSubmit,
}: {
  scope: BriefingScope;
  estimate: LiveEstimate;
  submitLabel: string;
  onSubmit: () => void;
}) {
  let pkgDesc: string | null = null;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    const ppm = scope.social.postsPerWeek * 4;
    const pkg = getPackageDef(detectPackage(ppm));
    pkgDesc = pkg.description;
  }

  const timeline = scope.serviceMode === "one_off" ? "A definir por escopo" : "Início imediato após aprovação";
  const incl = estimate.included.slice(0, 6);
  const excl = estimate.notIncluded.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Banner */}
      <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-[8px] px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[#166534]">Proposta inicial pronta para revisão</p>
        <p className="text-[10px] text-[#16A34A] mt-0.5">
          Revise o escopo abaixo e envie para análise da Dioli.
        </p>
      </div>

      {/* Plano recomendado */}
      {pkgDesc && (
        <div>
          <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Plano recomendado</div>
          <p className="text-[11px] text-[#1A1A1A] font-medium">{pkgDesc}</p>
        </div>
      )}

      {/* Investimento */}
      {estimate.totalMin > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Investimento estimado</div>
          <p className="text-[14px] font-bold text-[#1A1A1A]">
            {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
            <span className="text-[11px] font-normal text-[#9B9B95] ml-1">/mês</span>
          </p>
          <p className="text-[9px] text-[#C0C0BC] mt-0.5">*Sujeito a detalhamento no escopo final</p>
        </div>
      )}

      {/* Prazo */}
      <div>
        <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Prazo de início</div>
        <p className="text-[11px] text-[#1A1A1A]">{scope.deadline ?? timeline}</p>
      </div>

      {/* Incluso */}
      {incl.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">O que está incluso</div>
          {incl.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[#1A1A1A] py-0.5">
              <span className="text-[#16A34A] shrink-0 font-bold">✓</span>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Não incluso */}
      {excl.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Não incluso</div>
          {excl.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[#9B9B95] py-0.5">
              <span className="shrink-0">–</span>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Próximos passos */}
      <div className="bg-[#F7F7F6] rounded-[8px] px-3 py-2.5">
        <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Próximos passos</div>
        <p className="text-[10px] text-[#6B6B65] leading-relaxed">
          Após o envio, nossa equipe revisa o escopo, prepara uma proposta formal e entra em contato em até 24h úteis.
        </p>
      </div>

      {/* Submit CTA */}
      <button
        onClick={onSubmit}
        className="w-full h-11 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[13px] font-semibold transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicBriefingRoom({ onSubmit }: PublicBriefingRoomProps) {
  const [state,          setState]          = useState<ProspectConvState>(() => initProspectConvState());
  const [inputText,      setInputText]      = useState("");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [attachments,    setAttachments]    = useState<RequestAttachment[]>([]);

  // Internal temp ID for file upload association
  const [tempClientId] = useState(() => "prospect-" + Date.now());

  const conv = state.conv;
  const sdr  = state.sdr;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv.messages]);

  // Append transcribed text to input (never auto-submits; user reviews before sending)
  const handleTranscript = useCallback((text: string) => {
    setInputText((prev) => (prev ? prev.trimEnd() + " " + text : text));
  }, []);

  const { isListening, isSupported, error: micError, startListening, stopListening } =
    useSpeechToText({ onTranscript: handleTranscript });

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    const fileNames = attachments.map((a) => a.fileName);
    setState((prev) => processProspectMessage(text, prev, fileNames));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function sendAction(text: string) {
    const fileNames = attachments.map((a) => a.fileName);
    setState((prev) => processProspectMessage(text, prev, fileNames));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSubmit() {
    const scope = conv.scope;
    const rawText = buildRawText(conv.messages);
    onSubmit({
      conversationTranscript: conv.messages,
      v2Scope: scope,
      v2Estimate: conv.estimate,
      attachments,
      extractedSummary: buildExtractedSummary(scope),
      rawText,
      title: buildTitle(scope),
      prospectName: scope.prospectName ?? "",
      prospectEmail: scope.prospectEmail ?? "",
      prospectPhone: scope.prospectPhone ?? "",
      businessName: scope.businessName ?? "",
      segment: scope.segment ?? "",
      sdrHandoff: buildHandoffSummary(conv, sdr),
    });
  }

  const scope    = conv.scope;
  const estimate = conv.estimate;
  const hasScope = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding.requested;
  const identityDone = !!scope.prospectEmail && !!scope.prospectPhone;
  const canSubmit    = canSubmitProposal(conv, sdr);
  const blockReason  = getSubmissionBlockReason(conv, sdr);

  const visibleActions = QUICK_ACTIONS.filter((qa) => qa.show(scope));

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6 items-start">

      {/* ── Left: Chat ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">

        {/* Chat header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Consultora de Orçamento</div>
            <div className="text-[14px] font-semibold text-[#1A1A1A] mt-0.5">Conversa com a Dioli Studio</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
            <span className="text-[11px] text-[#9B9B95]">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto min-h-[320px] max-h-[480px]">
          {conv.messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* File upload (toggled) */}
        {showFileUpload && (
          <div className="px-5 pb-3 border-t border-[#F0F0ED] pt-3">
            <FileUploadZone clientId={tempClientId} onChange={setAttachments} />
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[#F0F0ED] px-4 py-3">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                conv.isFirstMessage
                  ? "Diga seu nome e o nome do seu negócio para começar…"
                  : "Digite sua resposta…"
              }
              rows={2}
              className="flex-1 px-3 py-2.5 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#1A1A1A] focus:bg-white transition-all resize-none leading-relaxed placeholder:text-[#C0C0BC]"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="w-[52px] rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0"
              aria-label="Enviar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.5 7L1.5 1.5L4 7L1.5 12.5L12.5 7Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {/* Microphone button */}
            {isSupported ? (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`h-6 px-2.5 rounded-[5px] text-[10px] font-medium border transition-colors flex items-center gap-1.5 ${
                  isListening
                    ? "bg-[#FEE2E2] border-[#FECACA] text-[#DC2626]"
                    : "bg-white border-[#E5E5E2] text-[#9B9B95] hover:border-[#9B9B95]"
                }`}
                title={isListening ? "Parar gravação" : "Ditar por voz"}
              >
                {isListening ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />Parar</>
                ) : (
                  <>
                    <svg width="9" height="12" viewBox="0 0 9 12" fill="none">
                      <rect x="2.5" y="0.5" width="4" height="6" rx="2" stroke="currentColor" strokeWidth="1.1"/>
                      <path d="M0.5 6C0.5 8.21 2.29 10 4.5 10C6.71 10 8.5 8.21 8.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                      <line x1="4.5" y1="10" x2="4.5" y2="11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    </svg>
                    Voz
                  </>
                )}
              </button>
            ) : (
              <span className="text-[10px] text-[#C0C0BC]" title="Seu navegador não suporta transcrição por voz.">
                Microfone indisponível
              </span>
            )}
            {/* File attach button */}
            <button
              type="button"
              onClick={() => setShowFileUpload((v) => !v)}
              className={`h-6 px-2.5 rounded-[5px] text-[10px] font-medium border transition-colors flex items-center gap-1.5 ${
                showFileUpload
                  ? "bg-[#EEF0FF] border-[#C7C7FF] text-[#5B5BD6]"
                  : "bg-white border-[#E5E5E2] text-[#9B9B95] hover:border-[#9B9B95]"
              }`}
            >
              <svg width="10" height="11" viewBox="0 0 10 11" fill="none">
                <path d="M8.5 6V8.5A1 1 0 017.5 9.5H2A1 1 0 011 8.5V2A1 1 0 012 1H4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                <path d="M7 0.5L9.5 3L5.5 7H3.5V5L7 0.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {attachments.length > 0 ? `${attachments.length} arquivo${attachments.length !== 1 ? "s" : ""}` : "Anexar referência"}
            </button>
            <span className="text-[10px] text-[#C0C0BC] ml-auto hidden sm:block">
              Enter para enviar · Shift+Enter nova linha
            </span>
          </div>
          {/* Microphone error feedback */}
          {micError && (
            <p className="text-[10px] text-[#DC2626] mt-1">
              Não consegui acessar o microfone. Verifique a permissão do navegador.
            </p>
          )}
        </div>
      </div>

      {/* ── Right: Proposal panel ─────────────────────────────────────────────── */}
      <div className="sticky top-6">
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3.5 border-b border-[#F0F0ED]">
            <div className="text-[11px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">
              {canSubmit ? "Proposta pronta" : "Sua proposta em construção"}
            </div>
            <p className="text-[10px] text-[#9B9B95] mt-0.5">
              {canSubmit ? "Pronta para envio" : "Atualizada conforme você responde"}
            </p>
          </div>

          {/* Body */}
          {canSubmit ? (
            /* ── Proposal-ready state ── */
            <div className="px-4 py-4">
              <ProposalCard
                scope={scope}
                estimate={estimate}
                submitLabel="Enviar orçamento para análise da Dioli →"
                onSubmit={handleSubmit}
              />
            </div>
          ) : !hasScope ? (
            /* ── Identity / empty state ── */
            <div className="px-4 py-4">
              {/* Identity status panel */}
              <div className="px-0 py-0">
                <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
                  Seus dados de contato
                </div>
                {[
                  { label: "Nome",     value: scope.prospectName },
                  { label: "Negócio",  value: scope.businessName },
                  { label: "E-mail",   value: scope.prospectEmail },
                  { label: "WhatsApp", value: scope.prospectPhone },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2 text-[11px] py-0.5">
                    <span className="text-[#9B9B95] w-16 shrink-0">{row.label}</span>
                    {row.value ? (
                      <span className="text-[#1A1A1A] font-medium">{row.value}</span>
                    ) : (
                      <span className="text-[#D0D0CC]">aguardando…</span>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-[#C0C0BC] mt-3 leading-relaxed">
                  O escopo e estimativa aparecerão aqui conforme a conversa avança.
                </p>
              </div>
            </div>
          ) : (
            /* ── Scope in progress ── */
            <div className="px-4 py-4 space-y-4">
              {/* If identity not yet done, show identity fields too */}
              {!identityDone && (
                <div className="bg-[#F7F7F6] rounded-[8px] px-3 py-3 mb-2">
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
                    Seus dados de contato
                  </div>
                  {[
                    { label: "Nome",     value: scope.prospectName },
                    { label: "Negócio",  value: scope.businessName },
                    { label: "E-mail",   value: scope.prospectEmail },
                    { label: "WhatsApp", value: scope.prospectPhone },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 text-[11px] py-0.5">
                      <span className="text-[#9B9B95] w-16 shrink-0">{row.label}</span>
                      {row.value ? (
                        <span className="text-[#1A1A1A] font-medium">{row.value}</span>
                      ) : (
                        <span className="text-[#D0D0CC]">aguardando…</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <ScopeSection scope={scope} />

              {estimate.confidence !== "none" && (
                <EstimateSection estimate={estimate} />
              )}

              {/* SDR: budget fit indicator */}
              {sdr.budgetSignal.fitStatus === "fits" && sdr.budgetSignal.amount && (
                <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-[8px] px-3 py-2">
                  <p className="text-[10px] font-semibold text-[#166534]">Orçamento confirmado</p>
                  <p className="text-[9px] text-[#15803D] mt-0.5">
                    R$ {sdr.budgetSignal.amount.toLocaleString("pt-BR")} — dentro da estimativa.
                  </p>
                </div>
              )}
              {(sdr.budgetSignal.fitStatus === "above_budget" || sdr.budgetSignal.fitStatus === "below_recommended") && (
                <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2">
                  <p className="text-[10px] font-semibold text-[#D97706]">Orçamento abaixo da estimativa</p>
                  {sdr.budgetSignal.amount && (
                    <p className="text-[9px] text-[#92400E] mt-0.5">
                      R$ {sdr.budgetSignal.amount.toLocaleString("pt-BR")} mencionado — ajustando escopo.
                    </p>
                  )}
                </div>
              )}

              {/* SDR: active objection indicator */}
              {sdr.objection.active && (
                <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2">
                  <p className="text-[10px] font-semibold text-[#D97706]">Ponto em aberto</p>
                  <p className="text-[9px] text-[#92400E] mt-0.5">
                    Continue a conversa para resolver antes de enviar.
                  </p>
                </div>
              )}

              {estimate.missingForEstimate.length > 0 && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2.5">
                  <div className="text-[9px] font-semibold text-[#D97706] uppercase tracking-[0.06em] mb-1.5">
                    Preciso saber ainda
                  </div>
                  <ul className="space-y-0.5">
                    {estimate.missingForEstimate.map((m) => (
                      <li key={m} className="flex items-start gap-1.5 text-[10px] text-[#92400E]">
                        <span className="w-1 h-1 rounded-full bg-[#F59E0B] mt-1 shrink-0" />{m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {estimate.notIncluded.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Não incluso</div>
                  {estimate.notIncluded.slice(0, 3).map((ni) => (
                    <div key={ni} className="flex items-start gap-1.5 text-[10px] text-[#9B9B95] py-0.5">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-[#D0D0CC] shrink-0" />{ni}
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              {visibleActions.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">
                    Ajustar escopo
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleActions.map((qa) => (
                      <button
                        key={qa.label}
                        onClick={() => sendAction(qa.text)}
                        className="h-6 px-2.5 rounded-[5px] border border-[#E5E5E2] bg-white text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A] text-[10px] font-medium transition-colors"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 pb-3 border-t border-[#F0F0ED] pt-3">
              <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">
                Materiais anexados
              </div>
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 text-[10px] text-[#6B6B65] py-0.5">
                  <span className="w-1 h-1 rounded-full bg-[#9B9B95] shrink-0" />
                  <span className="truncate">{a.fileName}</span>
                </div>
              ))}
            </div>
          )}

          {/* Submit disabled state */}
          {!canSubmit && (
            <div className="px-4 pb-4 pt-3 border-t border-[#F0F0ED]">
              <button
                disabled
                className="w-full h-10 rounded-[8px] bg-[#F0F0ED] text-[#C0C0BC] text-[12px] cursor-not-allowed"
              >
                {blockReason ?? "Continue a conversa para enviar"}
              </button>
            </div>
          )}
        </div>

        {/* Packages reference — only shown before service scope is captured */}
        {!canSubmit && !hasScope && identityDone && (
          <div className="mt-3 bg-[#F7F7F6] rounded-[10px] border border-[#E5E5E2] px-4 py-3">
            <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
              Planos Social Media
            </div>
            {SOCIAL_PACKAGES.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between py-1 text-[10px]">
                <div>
                  <span className={`font-semibold ${PKG_STYLE[pkg.id]?.text ?? "text-[#6B6B65]"}`}>
                    {pkg.label}
                  </span>
                  <span className="text-[#9B9B95] ml-1">{pkg.description.split("—")[0].trim()}</span>
                </div>
                <span className="text-[#6B6B65] shrink-0 ml-2">
                  R$ {pkg.minPrice.toLocaleString("pt-BR")}–{pkg.maxPrice.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
