"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import Modal from "@/components/agency/ui/Modal";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import {
  getOwner,
  getVersion,
  getRevisionHistory,
  needsRevision,
  getDeliverableNextAction,
  getLastFeedback,
  REVISION_AUTHOR_LABEL,
} from "@/lib/agency/deliverables";
import { getDeliverableQuality, getBrandBrainScore } from "@/lib/agency/reporting";

interface Props {
  deliverableId: string | null;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Internal deliverable detail / review modal.
// Accessible from the project deliverables tab, the global deliverables list,
// and any internal view. Shows the full review lifecycle + owner actions.
export default function DeliverableDetailModal({ deliverableId, onClose }: Props) {
  const { deliverables, projects, clients, strategyRooms, updateDeliverableStatus, startDeliverableRevision, resolveDeliverableRevision } = useAgencyStore();
  const [resolveNote, setResolveNote] = useState("");

  const d = deliverables.find((x) => x.id === deliverableId) ?? null;
  if (!d) return null;

  const project = projects.find((p) => p.id === d.projectId);
  const client = clients.find((c) => c.id === project?.clientId);
  const strategyRoomReady = strategyRooms.some((r) => r.projectId === d.projectId && r.status === "ready");
  const quality = getDeliverableQuality(d, {
    brandBrainComplete: getBrandBrainScore(client).complete,
    strategyRoomReady,
  });
  const QUALITY_COLOR = quality.level === "high" ? "text-[#16A34A]" : quality.level === "medium" ? "text-[#D97706]" : "text-[#DC2626]";
  const QUALITY_BAR = quality.level === "high" ? "bg-[#16A34A]" : quality.level === "medium" ? "bg-[#D97706]" : "bg-[#DC2626]";
  const owner = getOwner(d);
  const version = getVersion(d);
  const history = getRevisionHistory(d);
  const revision = needsRevision(d);
  const nextAction = getDeliverableNextAction(d);
  const lastFeedback = getLastFeedback(d);

  const isDraft = d.status === "draft";
  const isInReview = d.status === "in_review";
  const isApproved = d.status === "approved";

  const handleResolve = () => {
    resolveDeliverableRevision(d.id, resolveNote || undefined);
    setResolveNote("");
  };

  return (
    <Modal open={!!d} onClose={onClose} title={d.name} width="max-w-2xl">
      <div className="space-y-5">
        {/* Meta grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Tipo", value: d.type },
            { label: "Projeto", value: project?.name ?? "—" },
            { label: "Cliente", value: client?.name ?? "—" },
            { label: "Responsável", value: owner.name },
            { label: "Versão", value: `v${version}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#FAFAF9] rounded-[8px] px-3 py-2 border border-[#F0F0ED]">
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">{label}</div>
              <div className="text-[12px] font-medium text-[#1A1A1A] truncate">{value}</div>
            </div>
          ))}
          <div className="bg-[#FAFAF9] rounded-[8px] px-3 py-2 border border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Status</div>
            <Badge variant={d.status} />
          </div>
        </div>

        {/* Next action */}
        <div className={`rounded-[8px] px-4 py-3 border ${revision ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F7F7F6] border-[#E5E5E2]"}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-0.5 text-[#9B9B95]">Próxima ação</div>
          <div className={`text-[13px] font-medium ${revision ? "text-[#B45309]" : "text-[#1A1A1A]"}`}>{nextAction}</div>
        </div>

        {/* Quality score (internal only) */}
        <div className="rounded-[8px] px-4 py-3 border border-[#E5E5E2] bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#9B9B95]">Qualidade da Entrega · interno</div>
            <span className={`text-[16px] font-bold mono-num ${QUALITY_COLOR}`}>{quality.score}<span className="text-[11px] text-[#9B9B95] font-medium">/100</span></span>
          </div>
          <div className="h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden mb-2.5">
            <div className={`h-full rounded-full ${QUALITY_BAR}`} style={{ width: `${quality.score}%` }} />
          </div>
          <div className="space-y-1">
            {quality.signals.map((sig) => (
              <div key={sig.label} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${sig.met ? "bg-[#16A34A]" : "bg-[#D0D0CC]"}`} />
                  <span className="text-[#6B6B65]">{sig.label}</span>
                </span>
                <span className="text-[#9B9B95] mono-num">{sig.points}/{sig.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Client feedback */}
        {lastFeedback && (
          <div className="rounded-[8px] px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] mb-0.5 text-[#D97706]">Feedback do cliente</div>
            <p className="text-[12px] text-[#6B6B65] leading-relaxed">{lastFeedback}</p>
          </div>
        )}

        {/* Content / preview */}
        <div>
          <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Conteúdo</div>
          {d.link ? (
            <a href={d.link} target="_blank" rel="noreferrer" className="text-[13px] text-[#5B5BD6] hover:underline break-all">
              {d.link}
            </a>
          ) : (
            <p className="text-[12px] text-[#9B9B95] italic">
              Pré-visualização não disponível. Esta entrega é gerada pelo agente responsável e revisada aqui.
            </p>
          )}
        </div>

        {/* Revision history */}
        <div>
          <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Histórico de Revisões</div>
          {history.length === 0 ? (
            <p className="text-[12px] text-[#9B9B95] italic">Nenhuma revisão registrada ainda.</p>
          ) : (
            <div className="relative pl-4">
              <div className="absolute left-[5px] top-1 bottom-1 w-[1px] bg-[#F0F0ED]" />
              <div className="space-y-3">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-4 top-1 w-[11px] h-[11px] rounded-full bg-[#EEF0FF] border-2 border-[#5B5BD6]" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[#1A1A1A]">v{h.version}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] font-medium">
                        {REVISION_AUTHOR_LABEL[h.author]}
                      </span>
                      <span className="text-[11px] text-[#9B9B95]">{formatTimestamp(h.timestamp)}</span>
                    </div>
                    <div className="text-[12px] text-[#6B6B65] mt-0.5">{h.note}</div>
                    {h.feedback && (
                      <div className="text-[11px] text-[#9B9B95] mt-0.5 italic leading-relaxed">“{h.feedback}”</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Owner actions */}
        <div className="flex flex-wrap gap-2 border-t border-[#F0F0ED] mt-1 pt-4">
          {revision && d.revisionStatus !== "in_revision" && (
            <Button variant="secondary" onClick={() => startDeliverableRevision(d.id)}>
              Iniciar revisão
            </Button>
          )}
          {revision && (
            <Button variant="primary" onClick={handleResolve}>
              Resolver revisão · nova versão
            </Button>
          )}
          {isDraft && !revision && (
            <Button variant="primary" onClick={() => updateDeliverableStatus(d.id, "in_review")}>
              Enviar à revisão do cliente
            </Button>
          )}
          {isInReview && (
            <>
              <Button variant="secondary" onClick={() => updateDeliverableStatus(d.id, "approved")}>
                Aprovar internamente
              </Button>
              <Button variant="ghost" onClick={() => updateDeliverableStatus(d.id, "draft")}>
                Voltar para rascunho
              </Button>
            </>
          )}
          {isApproved && (
            <Button variant="secondary" onClick={() => updateDeliverableStatus(d.id, "delivered")}>
              Marcar como entregue
            </Button>
          )}
        </div>

        {/* Resolve note (only relevant when a revision is open) */}
        {revision && (
          <div>
            <label className="block text-[11px] font-medium text-[#6B6B65] mb-1.5">
              Nota da nova versão (opcional)
            </label>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="O que mudou nesta versão?"
              rows={2}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
