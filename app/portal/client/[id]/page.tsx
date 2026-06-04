"use client";

import { use, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbBrandUpdates } from "@/lib/hooks/useDbBrandUpdates";
import { notFound } from "next/navigation";
import { DeliverableStatus, ProjectStage } from "@/lib/agency/mock-data";
import { getClientVisibleDeliverables } from "@/lib/agency/workspace";
import { getClientProgress, getNextProjectAction } from "@/lib/agency/reporting";
import { PORTAL_SAFE_BRAND_FIELDS, BRAND_FIELD_LABELS } from "@/lib/agency/roles";
import { parseBrandBook, type ParsedBrandField } from "@/lib/agency/brand-parser";
import DeliverablePreview from "@/components/agency/deliverables/DeliverablePreview";


const STAGE_LABEL: Record<ProjectStage, string> = {
  briefing: "Briefing", proposal_sent: "Aguardando Aprovação", approved: "Aprovado",
  diagnosis: "Diagnóstico", planning: "Planejamento",
  production: "Em Produção", review: "Em Revisão", delivery: "Entrega",
  ongoing: "Em Andamento", completed: "Concluído",
};

const STATUS_STYLES: Record<DeliverableStatus, { bg: string; text: string; label: string }> = {
  draft:     { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]",  label: "Rascunho"   },
  in_review: { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]",  label: "Em Revisão" },
  approved:  { bg: "bg-[#DCFCE7]",  text: "text-[#16A34A]",  label: "Aprovado"   },
  delivered: { bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]",  label: "Entregue"   },
};

const TYPE_ICON: Record<string, string> = {
  Copy: "✦", Design: "◈", Strategy: "◎", Report: "≡",
  "Ads Strategy": "◆", "Campaign Structure": "▤", "Audience Plan": "◉",
  "Ad Copy": "✦", "Creative Requirements": "◈", "Optimization Notes": "⊹",
  default: "□",
};

export default function ClientPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { clients, projects, deliverables, materialRequests, updateDeliverableStatus, setDeliverableFeedback,
          approveProposal, rejectProposal, requestProposalChanges } = useAgencyStore();
  const { add: addBrandUpdate } = useDbBrandUpdates({ clientId: id });
  const cp = getClientProgress(id, projects, deliverables, materialRequests);

  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  const clientProjects = projects.filter((p) => p.clientId === id);
  const clientProjectIds = new Set<string>(clientProjects.map((p) => p.id as string));
  const visibleDeliverables = getClientVisibleDeliverables(deliverables, clientProjectIds);
  const clientMaterialRequests = materialRequests.filter((r) => r.clientId === id && r.status === "pending");

  // Local UI state
  const [previewOpen,          setPreviewOpen]          = useState<Record<string, boolean>>({});
  const [feedbackOpen,         setFeedbackOpen]         = useState<Record<string, boolean>>({});
  const [feedbackText,         setFeedbackText]         = useState<Record<string, string>>({});
  const [proposalChangesOpen,  setProposalChangesOpen]  = useState<Record<string, boolean>>({});
  const [proposalChangesText,  setProposalChangesText]  = useState<Record<string, string>>({});
  const [proposalRejectOpen,   setProposalRejectOpen]   = useState<Record<string, boolean>>({});
  const [proposalRejectText,   setProposalRejectText]   = useState<Record<string, string>>({});

  // Brand section state
  const [brandSuggestOpen,     setBrandSuggestOpen]     = useState(false);
  const [brandSuggestField,    setBrandSuggestField]    = useState<string>(PORTAL_SAFE_BRAND_FIELDS[0]);
  const [brandSuggestText,     setBrandSuggestText]     = useState("");
  const [brandSuggestSent,     setBrandSuggestSent]     = useState(false);
  const [brandUploadMsg,       setBrandUploadMsg]       = useState<string | null>(null);
  const [portalParserOpen,     setPortalParserOpen]     = useState(false);
  const [portalParserText,     setPortalParserText]     = useState("");
  const [portalParserResults,  setPortalParserResults]  = useState<ParsedBrandField[]>([]);
  const [portalParserSent,     setPortalParserSent]     = useState(false);

  const handleBrandSuggest = () => {
    const text = brandSuggestText.trim();
    if (!text) return;
    addBrandUpdate({
      clientId: id,
      field: brandSuggestField,
      suggestedValue: text,
      currentValue: (client.brandBrain as Record<string, string> | undefined)?.[brandSuggestField] ?? "",
      source: "client",
      status: "pending",
    });
    setBrandSuggestText("");
    setBrandSuggestSent(true);
    setBrandSuggestOpen(false);
    setTimeout(() => setBrandSuggestSent(false), 4000);
  };

  const handleBrandBookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addBrandUpdate({
      clientId: id,
      field: "brand_book",
      suggestedValue: file.name,
      source: "upload",
      status: "pending",
      fileName: file.name,
      note: "Brand Book enviado pelo cliente para análise.",
    });
    setBrandUploadMsg(`"${file.name}" recebido. Nossa equipe irá analisá-lo e incorporar as informações ao seu Brand Hub.`);
    setTimeout(() => setBrandUploadMsg(null), 5000);
    e.target.value = "";
  };

  const handlePortalParse = () => {
    // Filter to only portal-safe fields
    const safeSet = new Set<string>(PORTAL_SAFE_BRAND_FIELDS);
    const results = parseBrandBook(portalParserText).filter((r) => safeSet.has(r.field));
    setPortalParserResults(results);
    setPortalParserSent(false);
  };

  const handlePortalQueueAll = () => {
    const brain = client.brandBrain as Record<string, string> | undefined;
    for (const r of portalParserResults) {
      addBrandUpdate({
        clientId: id, field: r.field, suggestedValue: r.value,
        currentValue: brain?.[r.field] ?? "",
        source: "client", status: "pending",
        note: "Extraído do Brand Book pelo cliente",
      });
    }
    setPortalParserSent(true);
    setPortalParserResults([]);
    setPortalParserText("");
    setTimeout(() => { setPortalParserSent(false); setPortalParserOpen(false); }, 4000);
  };

  const handleApprove = (deliverableId: string) => {
    updateDeliverableStatus(deliverableId, "approved");
    setFeedbackOpen((prev) => ({ ...prev, [deliverableId]: false }));
  };

  const handleRequestChanges = (deliverableId: string) => {
    setFeedbackOpen((prev) => ({ ...prev, [deliverableId]: true }));
    setFeedbackText((prev) => ({ ...prev, [deliverableId]: prev[deliverableId] ?? "" }));
  };

  const handleSendFeedback = (deliverableId: string) => {
    const text = (feedbackText[deliverableId] ?? "").trim();
    if (!text) return;
    setDeliverableFeedback(deliverableId, text);
    setFeedbackOpen((prev) => ({ ...prev, [deliverableId]: false }));
    setFeedbackText((prev) => ({ ...prev, [deliverableId]: "" }));
  };

  const totalInReview = deliverables.filter(
    (d) => clientProjects.some((p) => p.id === d.projectId) && d.status === "in_review"
  ).length;

  return (
    <>
      {/* Client header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A1A]">{client.name}</h1>
            <p className="text-[13px] text-[#9B9B95] mt-0.5">{client.industry}</p>
          </div>
          {totalInReview > 0 && (
            <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#FEF3C7] text-[#D97706] text-[12px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
              {totalInReview} aguardando revisão
            </span>
          )}
        </div>
        <p className="text-[13px] text-[#6B6B65] mt-3 max-w-lg leading-relaxed">
          Revise os materiais abaixo e aprove-os ou solicite ajustes. Seu feedback vai direto para a equipe.
        </p>
      </div>

      {/* ── Resumo do Projeto ─────────────────────────────────────────────── */}
      {cp.totalDeliverables > 0 && (() => {
        const nextMsg = (() => {
          if (cp.pendingApprovals > 0)
            return `Você tem ${cp.pendingApprovals} material(is) esperando sua aprovação abaixo.`;
          if (cp.revisionsNeeded > 0)
            return "Nossa equipe está ajustando alguns materiais com base no seu feedback. Avisaremos quando estiver pronto.";
          if (cp.pendingMaterialRequests > 0)
            return "Ainda aguardamos alguns materiais seus (ver lista abaixo).";
          if (cp.approvedDeliverables > 0)
            return "Tudo aprovado por enquanto. Novos materiais chegarão em breve.";
          return "O projeto está em andamento. Em breve você receberá materiais para revisar.";
        })();
        return (
          <div className="mb-6 bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
              <span className="text-[12px] font-semibold text-[#1A1A1A]">Resumo do Projeto</span>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Total de materiais",   value: cp.totalDeliverables,          subtle: false },
                  { label: "Aguardando sua revisão", value: cp.pendingApprovals,         subtle: cp.pendingApprovals === 0, warn: cp.pendingApprovals > 0 },
                  { label: "Aprovados por você",    value: cp.approvedDeliverables,       subtle: cp.approvedDeliverables === 0, good: true },
                  { label: "Entregues",             value: cp.deliveredDeliverables,      subtle: cp.deliveredDeliverables === 0, good: true },
                ].map(({ label, value, subtle, warn, good }) => (
                  <div key={label} className="text-center">
                    <div className={`text-[22px] font-bold mono-num leading-none ${warn ? "text-[#D97706]" : good && value > 0 ? "text-[#16A34A]" : "text-[#1A1A1A]"}`}>{value}</div>
                    <div className={`text-[10px] mt-1 ${subtle ? "text-[#C0C0BC]" : "text-[#9B9B95]"}`}>{label}</div>
                  </div>
                ))}
              </div>
              <div className={`flex items-start gap-2 rounded-[7px] px-3 py-2.5 ${
                cp.pendingApprovals > 0 ? "bg-[#FFFBEB] border border-[#FDE68A]"
                : cp.revisionsNeeded > 0 ? "bg-[#EEF0FF] border border-[#C7C7F5]"
                : "bg-[#F7F7F6] border border-[#F0F0ED]"
              }`}>
                <span className="text-[14px] shrink-0 mt-[1px]">
                  {cp.pendingApprovals > 0 ? "👀" : cp.revisionsNeeded > 0 ? "🔧" : "✅"}
                </span>
                <p className={`text-[12px] leading-relaxed ${cp.pendingApprovals > 0 ? "text-[#92400E]" : "text-[#6B6B65]"}`}>
                  {nextMsg}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {clientProjects.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhum projeto ativo</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5">Os projetos aparecerão aqui assim que forem criados.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {clientProjects.map((project) => {
            const projectDeliverables = deliverables.filter((d) => d.projectId === project.id);
            return (
              <div key={project.id}>
                {/* Project header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-[15px] font-semibold text-[#1A1A1A]">{project.name}</h2>
                  <span className={`h-5 px-2 rounded-full text-[10px] font-semibold bg-[#F0F0ED] text-[#6B6B65]`}>
                    {STAGE_LABEL[project.stage]}
                  </span>
                  <span className="text-[12px] text-[#9B9B95] ml-auto">Prazo {project.deadline.slice(5)}</span>
                </div>

                {/* Proposal section — shown when status is not draft */}
                {project.proposal && project.proposal.status !== "draft" && (() => {
                  const p = project.proposal!;
                  const isApproved = p.status === "approved";
                  const isRejected = p.status === "rejected";
                  const isChangesRequested = p.status === "changes_requested";
                  const isSent = p.status === "sent";
                  const changesOpen = proposalChangesOpen[project.id] ?? false;
                  const rejectOpen = proposalRejectOpen[project.id] ?? false;
                  const borderColor = isApproved ? "border-[#BBF7D0]" : isRejected ? "border-[#FECACA]" : isChangesRequested ? "border-[#FDE68A]" : "border-[#C7C7F5]";
                  return (
                    <div className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4 overflow-hidden ${borderColor}`}>
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
                        <span className="text-[12px] font-semibold text-[#1A1A1A]">Proposta do Projeto</span>
                        {isApproved && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A]">Aprovada</span>
                        )}
                        {isRejected && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">Reprovada</span>
                        )}
                        {isChangesRequested && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#D97706]">Alterações Solicitadas</span>
                        )}
                        {isSent && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#EEF0FF] text-[#5B5BD6]">Aguardando sua Aprovação</span>
                        )}
                      </div>
                      <div className="px-5 py-4 space-y-3">
                        {p.objective && (
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-0.5">Objetivo</p>
                            <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{p.objective}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-0.5">Escopo</p>
                          <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{p.scope}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Entregas</p>
                            <ul className="space-y-0.5">
                              {p.deliverables.map((d, i) => (
                                <li key={i} className="text-[12px] text-[#1A1A1A] flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-[#5B5BD6] shrink-0" />{d}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Cronograma</p>
                            <p className="text-[12px] text-[#1A1A1A]">{p.timeline}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Investimento</p>
                            <p className="text-[13px] font-semibold text-[#1A1A1A]">{p.pricing}</p>
                          </div>
                        </div>
                        {isChangesRequested && p.requestedChanges && (
                          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2">
                            <p className="text-[11px] font-semibold text-[#D97706] mb-0.5 uppercase tracking-[0.04em]">Seu feedback</p>
                            <p className="text-[12px] text-[#6B6B65]">{p.requestedChanges}</p>
                          </div>
                        )}
                        {isRejected && p.rejectionReason && (
                          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[7px] px-3 py-2">
                            <p className="text-[11px] font-semibold text-[#DC2626] mb-0.5 uppercase tracking-[0.04em]">Motivo da recusa</p>
                            <p className="text-[12px] text-[#6B6B65]">{p.rejectionReason}</p>
                          </div>
                        )}
                        {isSent && !changesOpen && !rejectOpen && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => approveProposal(project.id)}
                              className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                            >
                              Aprovar Proposta
                            </button>
                            <button
                              onClick={() => setProposalChangesOpen((prev) => ({ ...prev, [project.id]: true }))}
                              className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] hover:border-[#D97706] text-[#6B6B65] hover:text-[#D97706] text-[12px] font-medium transition-colors"
                            >
                              Solicitar Alterações
                            </button>
                            <button
                              onClick={() => setProposalRejectOpen((prev) => ({ ...prev, [project.id]: true }))}
                              className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] hover:border-[#DC2626] text-[#9B9B95] hover:text-[#DC2626] text-[12px] font-medium transition-colors"
                            >
                              Reprovar
                            </button>
                          </div>
                        )}
                        {changesOpen && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={proposalChangesText[project.id] ?? ""}
                              onChange={(e) => setProposalChangesText((prev) => ({ ...prev, [project.id]: e.target.value }))}
                              placeholder="Descreva o que precisa ser alterado na proposta…"
                              rows={3}
                              autoFocus
                              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const notes = (proposalChangesText[project.id] ?? "").trim();
                                  if (!notes) return;
                                  requestProposalChanges(project.id, notes);
                                  setProposalChangesOpen((prev) => ({ ...prev, [project.id]: false }));
                                  setProposalChangesText((prev) => ({ ...prev, [project.id]: "" }));
                                }}
                                disabled={!(proposalChangesText[project.id] ?? "").trim()}
                                className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] disabled:opacity-40 text-white text-[12px] font-medium"
                              >
                                Enviar Feedback
                              </button>
                              <button
                                onClick={() => setProposalChangesOpen((prev) => ({ ...prev, [project.id]: false }))}
                                className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] text-[12px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                        {rejectOpen && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={proposalRejectText[project.id] ?? ""}
                              onChange={(e) => setProposalRejectText((prev) => ({ ...prev, [project.id]: e.target.value }))}
                              placeholder="Explique o motivo da reprovação, se quiser…"
                              rows={3}
                              autoFocus
                              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#FECACA] rounded-[7px] outline-none focus:border-[#DC2626] focus:bg-white resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const reason = (proposalRejectText[project.id] ?? "").trim();
                                  rejectProposal(project.id, reason || undefined);
                                  setProposalRejectOpen((prev) => ({ ...prev, [project.id]: false }));
                                  setProposalRejectText((prev) => ({ ...prev, [project.id]: "" }));
                                }}
                                className="h-8 px-4 rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12px] font-medium transition-colors"
                              >
                                Confirmar Reprovação
                              </button>
                              <button
                                onClick={() => setProposalRejectOpen((prev) => ({ ...prev, [project.id]: false }))}
                                className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] text-[12px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {projectDeliverables.length === 0 ? (
                  <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-6 py-8 text-center">
                    <p className="text-[13px] text-[#9B9B95]">Nenhum material pronto para revisão ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectDeliverables.map((d) => {
                      const style = STATUS_STYLES[d.status];
                      const icon = TYPE_ICON[d.type] ?? TYPE_ICON.default;
                      const isInReview = d.status === "in_review";
                      const isFeedbackOpen = feedbackOpen[d.id] ?? false;
                      const isPreviewOpen = previewOpen[d.id] ?? false;
                      const hasPreview = !!d.previewContent;

                      return (
                        <div
                          key={d.id}
                          className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all ${
                            isInReview ? "border-[#F59E0B] shadow-[0_1px_8px_rgba(245,158,11,0.12)]" : "border-[#E5E5E2]"
                          }`}
                        >
                          {/* Attention banner for in_review items */}
                          {isInReview && !isFeedbackOpen && (
                            <div className="bg-[#FFFBEB] border-b border-[#FDE68A] px-5 py-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
                                <span className="text-[12px] font-semibold text-[#92400E]">Aguardando sua aprovação</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleApprove(d.id)}
                                  className="h-7 px-3 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-semibold transition-colors"
                                >
                                  ✓ Aprovar
                                </button>
                                <button
                                  onClick={() => handleRequestChanges(d.id)}
                                  className="h-7 px-3 rounded-[7px] border border-[#FDE68A] hover:border-[#F59E0B] text-[#92400E] hover:bg-[#FEF3C7] text-[12px] font-medium transition-colors"
                                >
                                  Solicitar Alterações
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* Type icon */}
                            <div className="w-10 h-10 rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] flex items-center justify-center text-[18px] text-[#9B9B95] shrink-0">
                              {icon}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-medium text-[#1A1A1A] truncate">{d.name}</span>
                                <span className="text-[11px] text-[#9B9B95] shrink-0">v{d.version}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[12px] text-[#9B9B95]">{d.type}</span>
                                <span className="text-[#D0D0CC]">·</span>
                                <span className="text-[12px] text-[#9B9B95]">{d.createdAt.slice(5)}</span>
                              </div>
                            </div>

                            {/* Status + preview toggle */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                              {hasPreview && (
                                <button
                                  onClick={() => setPreviewOpen((prev) => ({ ...prev, [d.id]: !isPreviewOpen }))}
                                  className="h-6 px-2.5 rounded-full border border-[#E5E5E2] text-[11px] text-[#6B6B65] hover:bg-[#F7F7F6] font-medium transition-colors"
                                >
                                  {isPreviewOpen ? "Fechar" : "Ver conteúdo"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Deliverable preview content */}
                          {hasPreview && isPreviewOpen && (
                            <div className="px-5 pb-5 border-t border-[#F0F0ED] pt-4 space-y-3 max-h-[520px] overflow-y-auto">
                              <DeliverablePreview deliverable={d} mode="portal" />
                            </div>
                          )}

                          {/* Revision in progress — keep it human, no internal detail */}
                          {d.status === "draft" && d.revisionStatus === "in_revision" ? (
                            <div className="mx-5 mb-4 px-3 py-2.5 bg-[#EEF0FF] border border-[#C7C7F5] rounded-[7px] flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6] shrink-0" />
                              <p className="text-[12px] text-[#5B5BD6] font-medium">Estamos ajustando esta entrega com base no seu feedback.</p>
                            </div>
                          ) : (
                            d.clientFeedback && d.status === "draft" && (
                              <div className="mx-5 mb-4 px-3 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px]">
                                <p className="text-[11px] font-semibold text-[#D97706] mb-0.5 uppercase tracking-[0.04em]">Seu feedback anterior</p>
                                <p className="text-[12px] text-[#6B6B65] leading-relaxed">{d.clientFeedback}</p>
                              </div>
                            )
                          )}

                          {/* Feedback input */}
                          {isFeedbackOpen && (
                            <div className="px-5 pb-5 space-y-2.5 border-t border-[#FDE68A] bg-[#FFFBEB] pt-4">
                              <label className="block text-[12px] font-semibold text-[#92400E]">
                                O que precisa ser alterado em "{d.name}"?
                              </label>
                              <textarea
                                value={feedbackText[d.id] ?? ""}
                                onChange={(e) => setFeedbackText((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                placeholder="Descreva o que precisa mudar — a equipe receberá isso diretamente."
                                rows={3}
                                autoFocus
                                className="w-full px-3 py-2 text-[13px] bg-white border border-[#FDE68A] rounded-[7px] outline-none focus:border-[#F59E0B] resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSendFeedback(d.id)}
                                  disabled={!(feedbackText[d.id] ?? "").trim()}
                                  className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 text-white text-[12px] font-medium transition-colors"
                                >
                                  Enviar Feedback
                                </button>
                                <button
                                  onClick={() => setFeedbackOpen((prev) => ({ ...prev, [d.id]: false }))}
                                  className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#6B6B65] text-[12px] transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Requested Materials ─────────────────────────────────────────────── */}
      {clientMaterialRequests.length > 0 && (
        <div className="mt-10">
          <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-1">Solicitamos de Você</h2>
          <p className="text-[12px] text-[#9B9B95] mb-4">
            A equipe precisa dos seguintes itens para avançar.
          </p>
          <div className="space-y-3">
            {clientMaterialRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#1A1A1A]">{req.title}</div>
                    {req.description && (
                      <p className="text-[12px] text-[#6B6B65] mt-1 leading-relaxed">{req.description}</p>
                    )}
                  </div>
                  <span className="h-5 px-2 rounded-full text-[10px] font-semibold bg-[#FEF3C7] text-[#D97706] shrink-0 whitespace-nowrap">
                    Pendente
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Informações da Marca ─────────────────────────────────────────────── */}
      {/* Client can view safe brand fields and suggest updates — never sees internal/strategic fields */}
      <div className="mt-12 border-t border-[#F0F0ED] pt-10">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Informações da Marca</h2>
            <p className="text-[12px] text-[#9B9B95] mt-1">
              Confira as informações que usamos para criar conteúdo para a sua marca. Se algo estiver desatualizado, clique em "Sugerir Atualização".
            </p>
          </div>
        </div>

        {/* Success message */}
        {brandSuggestSent && (
          <div className="mb-4 px-4 py-3 bg-[#DCFCE7] rounded-[8px] text-[13px] text-[#16A34A] font-medium">
            ✓ Sugestão enviada. Nossa equipe irá revisar e atualizar as informações.
          </div>
        )}
        {brandUploadMsg && (
          <div className="mb-4 px-4 py-3 bg-[#EEF0FF] rounded-[8px] text-[13px] text-[#5B5BD6] font-medium">
            ✓ {brandUploadMsg}
          </div>
        )}

        {/* Safe brand fields */}
        {client.brandBrain ? (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] divide-y divide-[#F0F0ED] mb-4">
            {PORTAL_SAFE_BRAND_FIELDS.map((field) => {
              const value = (client.brandBrain as Record<string, string> | undefined)?.[field];
              if (!value) return null;
              return (
                <div key={field} className="px-5 py-3.5">
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
                    {BRAND_FIELD_LABELS[field] ?? field}
                  </div>
                  <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{value}</p>
                </div>
              );
            })}
            {PORTAL_SAFE_BRAND_FIELDS.every((f) => !(client.brandBrain as Record<string, string> | undefined)?.[f]) && (
              <div className="px-5 py-8 text-center text-[13px] text-[#9B9B95]">
                Nenhuma informação de marca cadastrada ainda. Envie seu Brand Book ou preencha as informações com a equipe.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-8 text-center text-[13px] text-[#9B9B95] mb-4">
            Nenhuma informação de marca cadastrada ainda.
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {!brandSuggestOpen ? (
            <button
              onClick={() => setBrandSuggestOpen(true)}
              className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[13px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors"
            >
              Sugerir Atualização
            </button>
          ) : null}

          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.zip,.ai,.fig,.png,.jpg" className="hidden" onChange={handleBrandBookUpload} />
            <span className="inline-flex items-center h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[13px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors cursor-pointer">
              ↑ Enviar Brand Book
            </span>
          </label>
        </div>

        {/* Suggestion form */}
        {brandSuggestOpen && (
          <div className="mt-4 bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div className="text-[13px] font-semibold text-[#1A1A1A]">Sugerir atualização de marca</div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Qual informação deseja atualizar?</label>
              <select
                value={brandSuggestField}
                onChange={(e) => setBrandSuggestField(e.target.value)}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              >
                {PORTAL_SAFE_BRAND_FIELDS.map((f) => (
                  <option key={f} value={f}>{BRAND_FIELD_LABELS[f] ?? f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Sua sugestão</label>
              <textarea
                value={brandSuggestText}
                onChange={(e) => setBrandSuggestText(e.target.value)}
                placeholder="Descreva o que mudou ou o que está incorreto. Nossa equipe irá revisar antes de aplicar."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBrandSuggest}
                disabled={!brandSuggestText.trim()}
                className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#2A2A2A] disabled:opacity-40 text-white text-[12px] font-medium transition-colors"
              >
                Enviar Sugestão
              </button>
              <button
                onClick={() => { setBrandSuggestOpen(false); setBrandSuggestText(""); }}
                className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#6B6B65] text-[12px] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Brand Book Parser ─────────────────────────────────────────────── */}
        {portalParserSent && (
          <div className="mt-4 px-4 py-3 bg-[#DCFCE7] rounded-[8px] text-[13px] text-[#16A34A] font-medium">
            ✓ Sugestões enviadas. Nossa equipe irá revisar e atualizar as informações do Brand Hub.
          </div>
        )}

        {!portalParserOpen && !portalParserSent ? (
          <button
            onClick={() => setPortalParserOpen(true)}
            className="mt-3 h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[13px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F6] transition-colors"
          >
            ✦ Analisar Brand Book
          </button>
        ) : null}

        {portalParserOpen && (
          <div className="mt-4 bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-[#1A1A1A]">Analisar Brand Book</div>
                <p className="text-[12px] text-[#9B9B95] mt-0.5">
                  Cole o texto do seu Brand Book. Iremos identificar as informações automaticamente e enviar para revisão da equipe.
                </p>
              </div>
              <button
                onClick={() => { setPortalParserOpen(false); setPortalParserText(""); setPortalParserResults([]); }}
                className="text-[12px] text-[#9B9B95] hover:text-[#6B6B65] ml-4 shrink-0"
              >
                Fechar
              </button>
            </div>
            <textarea
              value={portalParserText}
              onChange={(e) => { setPortalParserText(e.target.value); setPortalParserResults([]); }}
              placeholder="Cole o texto do Brand Book aqui..."
              rows={6}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-y"
            />
            <div className="flex gap-2">
              <button
                onClick={handlePortalParse}
                disabled={!portalParserText.trim()}
                className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#2A2A2A] disabled:opacity-40 text-white text-[12px] font-medium transition-colors"
              >
                Analisar Brand Book
              </button>
              <button
                onClick={() => { setPortalParserOpen(false); setPortalParserText(""); setPortalParserResults([]); }}
                className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#6B6B65] text-[12px] transition-colors"
              >
                Cancelar
              </button>
            </div>

            {/* Results */}
            {portalParserResults.length > 0 && (
              <div className="border border-[#E5E5E2] rounded-[8px] overflow-hidden">
                <div className="px-4 py-3 bg-[#F7F7F6] border-b border-[#F0F0ED] flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#1A1A1A]">
                    {portalParserResults.length} sugestões encontradas
                  </span>
                  <button
                    onClick={handlePortalQueueAll}
                    className="h-7 px-3 rounded-[6px] bg-[#1A1A1A] hover:bg-[#2A2A2A] text-white text-[11px] font-medium transition-colors"
                  >
                    Aplicar ao Brand Hub ({portalParserResults.length})
                  </button>
                </div>
                <div className="divide-y divide-[#F0F0ED] max-h-[260px] overflow-y-auto">
                  {portalParserResults.map((r) => (
                    <div key={r.field} className="px-4 py-3">
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">
                        {BRAND_FIELD_LABELS[r.field] ?? r.field}
                      </div>
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed line-clamp-2">{r.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {portalParserText.trim() && portalParserResults.length === 0 && (
              <p className="text-[12px] text-[#9B9B95]">
                Nenhuma informação identificada. Verifique se o texto contém seções com títulos (ex.: "Cores da Marca:", "Tom de Voz:").
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
