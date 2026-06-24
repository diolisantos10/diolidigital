"use client";

import { useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore, type BrandUpdate } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { useDbMaterialRequests } from "@/lib/hooks/useDbMaterialRequests";
import { useDbBrandUpdates } from "@/lib/hooks/useDbBrandUpdates";
import type { MaterialRequest } from "@/lib/agency/workspace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoShortDate(iso: string) {
  const parts = iso.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[15px] font-semibold text-[#1C1C1A]">{label}</h2>
      {count > 0 && (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${color}`}>
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-[13px] text-[#9B9B95] py-4 px-3 bg-[#F9F9F7] rounded-[8px] text-center">
      {label}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const {
    projects,
    clients,
    approveProposal,
    rejectProposal,
  } = useAgencyStore();

  const {
    deliverables,
    updateStatus: updateDeliverableStatus,
    setFeedback: setDeliverableFeedback,
  } = useDbDeliverables();

  const {
    materialRequests,
    updateStatus: updateMaterialRequestStatus,
  } = useDbMaterialRequests();

  const {
    brandUpdates,
    apply: applyBrandUpdate,
    dismiss: dismissBrandUpdate,
  } = useDbBrandUpdates();

  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [expandedFeedback, setExpandedFeedback] = useState<Record<string, boolean>>({});

  // ── Compute queues ────────────────────────────────────────────────────────
  const sentProposals = projects.filter((p) => p.proposal?.status === "sent");

  const inReviewDeliverables = deliverables.filter((d) => d.status === "in_review");

  const pendingBrandUpdates = brandUpdates.filter((u) => u.status === "pending");

  const pendingMaterials = materialRequests.filter(
    (r): r is MaterialRequest => r.status === "pending"
  );

  const deliverablesNeedingRevision = deliverables.filter(
    (d) =>
      d.clientFeedback &&
      (d.status === "draft" || d.revisionStatus === "revision_requested" || d.revisionStatus === "in_revision")
  );

  const totalPending =
    sentProposals.length +
    inReviewDeliverables.length +
    pendingBrandUpdates.length +
    pendingMaterials.length +
    deliverablesNeedingRevision.length;

  const getClient = (clientId?: string) => clients.find((c) => c.id === clientId);
  const getProject = (projectId?: string) => projects.find((p) => p.id === projectId);

  return (
    <div className="max-w-[860px] mx-auto px-6 py-8">
      {/* Header */}
      <AgencyHeader
        title="Centro de Aprovações"
        subtitle={
          totalPending > 0
            ? `${totalPending} item(ns) aguardando ação`
            : "Nenhum item pendente — tudo em dia"
        }
        actions={
          totalPending > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEF3C7] text-[#D97706] text-[12px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />
              {totalPending} pendente{totalPending !== 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      />

      <div className="space-y-10">
        {/* ── 1. Proposals ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader label="Propostas Aguardando Resposta" count={sentProposals.length} color="bg-[#070A1F]" />
          {sentProposals.length === 0 ? (
            <EmptyState label="Nenhuma proposta aguardando aprovação." />
          ) : (
            <div className="space-y-3">
              {sentProposals.map((project) => {
                const client = getClient(project.clientId);
                return (
                  <div key={project.id} className="bg-white border border-[#E8E8E4] rounded-[10px] p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-[#1C1C1A] truncate">{project.name}</span>
                        <span className="text-[11px] text-[#9B9B95] shrink-0">{client?.name}</span>
                      </div>
                      {project.proposal?.pricing && (
                        <div className="text-[12px] text-[#6B6B65]">{project.proposal.pricing}</div>
                      )}
                      {project.proposal?.scope && (
                        <div className="text-[12px] text-[#9B9B95] mt-1 line-clamp-2">{project.proposal.scope}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => approveProposal(project.id)}
                        className="px-3 py-1.5 bg-[#070A1F] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#0D1230] transition-colors"
                      >
                        ✓ Aprovar
                      </button>
                      <button
                        onClick={() => rejectProposal(project.id)}
                        className="px-3 py-1.5 bg-[#FEE2E2] text-[#DC2626] text-[12px] font-medium rounded-[6px] hover:bg-[#FECACA] transition-colors"
                      >
                        Rejeitar
                      </button>
                      <Link
                        href={`/agency/projects/${project.id}`}
                        className="px-3 py-1.5 bg-[#F4F4F0] text-[#6B6B65] text-[12px] font-medium rounded-[6px] hover:bg-[#E8E8E4] transition-colors"
                      >
                        Ver projeto
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. Deliverables in review ────────────────────────────────── */}
        <section>
          <SectionHeader label="Entregas Aguardando Aprovação do Cliente" count={inReviewDeliverables.length} color="bg-[#D97706]" />
          {inReviewDeliverables.length === 0 ? (
            <EmptyState label="Nenhuma entrega aguardando aprovação do cliente." />
          ) : (
            <div className="space-y-3">
              {inReviewDeliverables.map((d) => {
                const project = getProject(d.projectId);
                return (
                  <div key={d.id} className="bg-white border border-[#E8E8E4] rounded-[10px] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#1C1C1A] truncate">{d.name}</span>
                          {d.version && d.version > 1 && (
                            <span className="text-[10px] bg-[#E6FBFA] text-[#070A1F] px-1.5 py-0.5 rounded font-medium">v{d.version}</span>
                          )}
                        </div>
                        {project && (
                          <div className="text-[12px] text-[#9B9B95]">{project.name}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => updateDeliverableStatus(d.id, "approved")}
                          className="px-3 py-1.5 bg-[#DCFCE7] text-[#16A34A] text-[12px] font-medium rounded-[6px] hover:bg-[#BBF7D0] transition-colors"
                        >
                          ✓ Aprovado
                        </button>
                        <button
                          onClick={() => {
                            setExpandedFeedback((prev) => ({ ...prev, [d.id]: !prev[d.id] }));
                          }}
                          className="px-3 py-1.5 bg-[#FEF3C7] text-[#D97706] text-[12px] font-medium rounded-[6px] hover:bg-[#FDE68A] transition-colors"
                        >
                          Solicitar Revisão
                        </button>
                      </div>
                    </div>
                    {expandedFeedback[d.id] && (
                      <div className="mt-3 pt-3 border-t border-[#F4F4F0]">
                        <label className="block text-[11px] text-[#6B6B65] font-medium mb-1.5 uppercase tracking-wide">
                          O que precisa ser alterado?
                        </label>
                        <textarea
                          value={feedbackMap[d.id] ?? ""}
                          onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          placeholder="Descreva as alterações necessárias..."
                          className="w-full text-[13px] border border-[#E8E8E4] rounded-[8px] px-3 py-2 resize-none h-20 outline-none focus:border-[#070A1F] transition-colors"
                        />
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => {
                              if (feedbackMap[d.id]?.trim()) {
                                setDeliverableFeedback(d.id, feedbackMap[d.id]);
                                setExpandedFeedback((prev) => ({ ...prev, [d.id]: false }));
                                setFeedbackMap((prev) => ({ ...prev, [d.id]: "" }));
                              }
                            }}
                            className="px-3 py-1.5 bg-[#D97706] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#B45309] transition-colors"
                          >
                            Enviar Feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 3. Deliverables needing revision ─────────────────────────── */}
        {deliverablesNeedingRevision.length > 0 && (
          <section>
            <SectionHeader label="Entregas com Revisão Pendente" count={deliverablesNeedingRevision.length} color="bg-[#DC2626]" />
            <div className="space-y-3">
              {deliverablesNeedingRevision.map((d) => {
                const project = getProject(d.projectId);
                return (
                  <div key={d.id} className="bg-white border border-[#FEE2E2] rounded-[10px] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#1C1C1A] truncate">{d.name}</span>
                          <span className="text-[10px] bg-[#FEE2E2] text-[#DC2626] px-1.5 py-0.5 rounded font-medium">Revisão solicitada</span>
                        </div>
                        {project && (
                          <div className="text-[12px] text-[#9B9B95] mb-1">{project.name}</div>
                        )}
                        {d.clientFeedback && (
                          <div className="text-[12px] text-[#6B6B65] bg-[#FEF9F0] border border-[#FDE68A] rounded-[6px] px-3 py-2 mt-2">
                            "{d.clientFeedback}"
                          </div>
                        )}
                      </div>
                      <Link
                        href="/agency/deliverables"
                        className="px-3 py-1.5 bg-[#F4F4F0] text-[#6B6B65] text-[12px] font-medium rounded-[6px] hover:bg-[#E8E8E4] transition-colors shrink-0"
                      >
                        Ver entrega
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 4. Brand updates ─────────────────────────────────────────── */}
        <section>
          <SectionHeader label="Sugestões de Marca Pendentes" count={pendingBrandUpdates.length} color="bg-[#070A1F]" />
          {pendingBrandUpdates.length === 0 ? (
            <EmptyState label="Nenhuma sugestão de marca aguardando revisão." />
          ) : (
            <div className="space-y-3">
              {pendingBrandUpdates.map((u: BrandUpdate) => {
                const client = getClient(u.clientId);
                return (
                  <div key={u.id} className="bg-white border border-[#E8E8E4] rounded-[10px] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#1C1C1A]">
                            {client?.name ?? "Cliente"}
                          </span>
                          <span className="text-[11px] text-[#9B9B95]">
                            {u.source === "client" ? "via portal" : "manual"}
                          </span>
                          <span className="text-[10px] text-[#9B9B95]">{isoShortDate(u.submittedAt)}</span>
                        </div>
                        <div className="text-[12px] text-[#6B6B65] line-clamp-2">{u.suggestedValue}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => applyBrandUpdate(u.id)}
                          className="px-3 py-1.5 bg-[#EDE9FE] text-[#070A1F] text-[12px] font-medium rounded-[6px] hover:bg-[#9AF5F0] transition-colors"
                        >
                          Aplicar ao Brand Hub
                        </button>
                        <button
                          onClick={() => dismissBrandUpdate(u.id)}
                          className="px-3 py-1.5 bg-[#F4F4F0] text-[#9B9B95] text-[12px] font-medium rounded-[6px] hover:bg-[#E8E8E4] transition-colors"
                        >
                          Dispensar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 5. Material requests ──────────────────────────────────────── */}
        <section>
          <SectionHeader label="Materiais Solicitados ao Cliente" count={pendingMaterials.length} color="bg-[#0891B2]" />
          {pendingMaterials.length === 0 ? (
            <EmptyState label="Nenhuma solicitação de material pendente." />
          ) : (
            <div className="space-y-3">
              {pendingMaterials.map((r) => {
                const project = getProject(r.projectId);
                return (
                  <div key={r.id} className="bg-white border border-[#E8E8E4] rounded-[10px] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#1C1C1A] truncate">{r.title}</span>
                          <span className="text-[10px] bg-[#E0F2FE] text-[#0891B2] px-1.5 py-0.5 rounded font-medium">Aguardando</span>
                        </div>
                        {project && (
                          <div className="text-[12px] text-[#9B9B95]">{project.name}</div>
                        )}
                        {r.description && (
                          <div className="text-[12px] text-[#6B6B65] mt-1 line-clamp-2">{r.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => updateMaterialRequestStatus(r.id, "received")}
                          className="px-3 py-1.5 bg-[#E0F2FE] text-[#0891B2] text-[12px] font-medium rounded-[6px] hover:bg-[#BAE6FD] transition-colors"
                        >
                          Marcar como recebido
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
