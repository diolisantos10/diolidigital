"use client";

import { use, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import { DeliverableStatus, ProjectStage } from "@/lib/agency/mock-data";
import { getClientVisibleDeliverables } from "@/lib/agency/workspace";


const STAGE_LABEL: Record<ProjectStage, string> = {
  briefing: "Briefing", proposal_sent: "Awaiting Approval", approved: "Approved",
  diagnosis: "Diagnosis", planning: "Planning",
  production: "In Production", review: "In Review", delivery: "Delivery",
  ongoing: "Ongoing", completed: "Completed",
};

const STATUS_STYLES: Record<DeliverableStatus, { bg: string; text: string; label: string }> = {
  draft:     { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]",  label: "Draft"      },
  in_review: { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]",  label: "In Review"  },
  approved:  { bg: "bg-[#DCFCE7]",  text: "text-[#16A34A]",  label: "Approved"   },
  delivered: { bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]",  label: "Delivered"  },
};

const TYPE_ICON: Record<string, string> = {
  Copy: "✦", Design: "◈", Strategy: "◎", Report: "≡", default: "□",
};

export default function ClientPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { clients, projects, deliverables, materialRequests, updateDeliverableStatus, setDeliverableFeedback, approveProposal, requestProposalChanges } = useAgencyStore();

  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  const clientProjects = projects.filter((p) => p.clientId === id);
  const clientProjectIds = new Set<string>(clientProjects.map((p) => p.id as string));
  const visibleDeliverables = getClientVisibleDeliverables(deliverables, clientProjectIds);
  const clientMaterialRequests = materialRequests.filter((r) => r.clientId === id && r.status === "pending");

  // Local UI state
  const [feedbackOpen,         setFeedbackOpen]         = useState<Record<string, boolean>>({});
  const [feedbackText,         setFeedbackText]         = useState<Record<string, string>>({});
  const [proposalChangesOpen,  setProposalChangesOpen]  = useState<Record<string, boolean>>({});
  const [proposalChangesText,  setProposalChangesText]  = useState<Record<string, string>>({});

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
              {totalInReview} awaiting review
            </span>
          )}
        </div>
        <p className="text-[13px] text-[#6B6B65] mt-3 max-w-lg leading-relaxed">
          Review the outputs below and approve them or request changes. Your feedback is shared directly with the team.
        </p>
      </div>

      {clientProjects.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">No active projects</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5">Projects will appear here once they are created.</p>
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
                  <span className="text-[12px] text-[#9B9B95] ml-auto">Due {project.deadline.slice(5)}</span>
                </div>

                {/* Proposal section */}
                {project.proposal && (project.stage === "proposal_sent" || project.stage === "approved") && (() => {
                  const p = project.proposal!;
                  const isApproved = p.status === "approved";
                  const isChangesRequested = p.status === "changes_requested";
                  const changesOpen = proposalChangesOpen[project.id] ?? false;
                  return (
                    <div className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4 overflow-hidden ${
                      isApproved ? "border-[#BBF7D0]" : isChangesRequested ? "border-[#FDE68A]" : "border-[#C7C7F5]"
                    }`}>
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
                        <span className="text-[12px] font-semibold text-[#1A1A1A]">Project Proposal</span>
                        {isApproved && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A]">Approved</span>
                        )}
                        {isChangesRequested && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#D97706]">Changes Requested</span>
                        )}
                        {p.status === "pending" && (
                          <span className="h-5 px-2 rounded-full text-[10px] font-bold bg-[#EEF0FF] text-[#5B5BD6]">Awaiting Your Approval</span>
                        )}
                      </div>
                      <div className="px-5 py-4 space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-0.5">Scope</p>
                          <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{p.scope}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Deliverables</p>
                            <ul className="space-y-0.5">
                              {p.deliverables.map((d, i) => (
                                <li key={i} className="text-[12px] text-[#1A1A1A] flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-[#5B5BD6] shrink-0" />{d}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Timeline</p>
                            <p className="text-[12px] text-[#1A1A1A]">{p.timeline}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1">Investment</p>
                            <p className="text-[13px] font-semibold text-[#1A1A1A]">{p.pricing}</p>
                          </div>
                        </div>
                        {isChangesRequested && p.requestedChanges && (
                          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2">
                            <p className="text-[11px] font-semibold text-[#D97706] mb-0.5 uppercase tracking-[0.04em]">Your feedback</p>
                            <p className="text-[12px] text-[#6B6B65]">{p.requestedChanges}</p>
                          </div>
                        )}
                        {!isApproved && !changesOpen && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => approveProposal(project.id)}
                              className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                            >
                              Approve Proposal
                            </button>
                            <button
                              onClick={() => setProposalChangesOpen((prev) => ({ ...prev, [project.id]: true }))}
                              className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] hover:border-[#D97706] text-[#6B6B65] hover:text-[#D97706] text-[12px] font-medium transition-colors"
                            >
                              Request Changes
                            </button>
                          </div>
                        )}
                        {changesOpen && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={proposalChangesText[project.id] ?? ""}
                              onChange={(e) => setProposalChangesText((prev) => ({ ...prev, [project.id]: e.target.value }))}
                              placeholder="Describe what needs to change in the proposal…"
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
                                Send Feedback
                              </button>
                              <button
                                onClick={() => setProposalChangesOpen((prev) => ({ ...prev, [project.id]: false }))}
                                className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] text-[12px]"
                              >
                                Cancel
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
                    <p className="text-[13px] text-[#9B9B95]">No outputs ready for review yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectDeliverables.map((d) => {
                      const style = STATUS_STYLES[d.status];
                      const icon = TYPE_ICON[d.type] ?? TYPE_ICON.default;
                      const isInReview = d.status === "in_review";
                      const isFeedbackOpen = feedbackOpen[d.id] ?? false;

                      return (
                        <div
                          key={d.id}
                          className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all ${
                            isInReview ? "border-[#FDE68A]" : "border-[#E5E5E2]"
                          }`}
                        >
                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* Type icon / preview placeholder */}
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

                            {/* Status + actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                              {isInReview && !isFeedbackOpen && (
                                <>
                                  <button
                                    onClick={() => handleApprove(d.id)}
                                    className="h-7 px-3 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRequestChanges(d.id)}
                                    className="h-7 px-3 rounded-[7px] border border-[#E5E5E2] hover:border-[#D97706] text-[#6B6B65] hover:text-[#D97706] text-[12px] font-medium transition-colors"
                                  >
                                    Request Changes
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Previous client feedback (if set and status = draft) */}
                          {d.clientFeedback && d.status === "draft" && (
                            <div className="mx-5 mb-4 px-3 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px]">
                              <p className="text-[11px] font-semibold text-[#D97706] mb-0.5 uppercase tracking-[0.04em]">Your feedback</p>
                              <p className="text-[12px] text-[#6B6B65] leading-relaxed">{d.clientFeedback}</p>
                            </div>
                          )}

                          {/* Feedback input */}
                          {isFeedbackOpen && (
                            <div className="px-5 pb-4 space-y-2.5 border-t border-[#F0F0ED] pt-4">
                              <label className="block text-[12px] font-medium text-[#1A1A1A]">
                                What needs to change?
                              </label>
                              <textarea
                                value={feedbackText[d.id] ?? ""}
                                onChange={(e) => setFeedbackText((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                placeholder="Describe the changes needed — the team will receive this directly."
                                rows={3}
                                autoFocus
                                className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSendFeedback(d.id)}
                                  disabled={!(feedbackText[d.id] ?? "").trim()}
                                  className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 text-white text-[12px] font-medium transition-colors"
                                >
                                  Send Feedback
                                </button>
                                <button
                                  onClick={() => setFeedbackOpen((prev) => ({ ...prev, [d.id]: false }))}
                                  className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#6B6B65] text-[12px] transition-colors"
                                >
                                  Cancel
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
          <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-1">Requested from You</h2>
          <p className="text-[12px] text-[#9B9B95] mb-4">
            The team needs the following from you to move forward.
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
                    Pending
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
