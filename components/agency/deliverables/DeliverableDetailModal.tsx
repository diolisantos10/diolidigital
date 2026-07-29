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
import DeliverablePreview from "@/components/agency/deliverables/DeliverablePreview";

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
  const QUALITY_COLOR = quality.level === "high" ? "text-[var(--success)]" : quality.level === "medium" ? "text-[var(--warning)]" : "text-[var(--danger)]";
  const QUALITY_BAR = quality.level === "high" ? "bg-[var(--success)]" : quality.level === "medium" ? "bg-[var(--warning)]" : "bg-[var(--danger)]";
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
            <div key={label} className="bg-[var(--bg-elevated)] rounded-[8px] px-3 py-2 border border-[var(--border)]">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">{label}</div>
              <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">{value}</div>
            </div>
          ))}
          <div className="bg-[var(--bg-elevated)] rounded-[8px] px-3 py-2 border border-[var(--border)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Status</div>
            <Badge variant={d.status} />
          </div>
        </div>

        {/* Next action */}
        <div className={`rounded-[8px] px-4 py-3 border ${revision ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[var(--bg)] border-[var(--border)]"}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-0.5 text-[var(--text-muted)]">Próxima ação</div>
          <div className={`text-[13px] font-medium ${revision ? "text-[#B45309]" : "text-[var(--text-primary)]"}`}>{nextAction}</div>
        </div>

        {/* Quality score (internal only) */}
        <div className="rounded-[8px] px-4 py-3 border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Qualidade da Entrega · interno</div>
            <span className={`text-[16px] font-bold mono-num ${QUALITY_COLOR}`}>{quality.score}<span className="text-[11px] text-[var(--text-muted)] font-medium">/100</span></span>
          </div>
          <div className="h-1.5 bg-[var(--accent)] rounded-full overflow-hidden mb-2.5">
            <div className={`h-full rounded-full ${QUALITY_BAR}`} style={{ width: `${quality.score}%` }} />
          </div>
          <div className="space-y-1">
            {quality.signals.map((sig) => (
              <div key={sig.label} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${sig.met ? "bg-[var(--success)]" : "bg-[var(--border-strong)]"}`} />
                  <span className="text-[var(--text-secondary)]">{sig.label}</span>
                </span>
                <span className="text-[var(--text-muted)] mono-num">{sig.points}/{sig.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Client feedback */}
        {lastFeedback && (
          <div className="rounded-[8px] px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] mb-0.5 text-[var(--warning)]">Feedback do cliente</div>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{lastFeedback}</p>
          </div>
        )}

        {/* Content / preview */}
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Conteúdo da Entrega</div>
          {d.previewContent ? (
            <DeliverablePreview deliverable={d} mode="internal" />
          ) : d.link ? (
            <a href={d.link} target="_blank" rel="noreferrer" className="text-[13px] text-[var(--navy)] hover:underline break-all">
              {d.link}
            </a>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)] italic">
              Conteúdo ainda não disponível — entrega pendente do agente responsável.
            </p>
          )}
        </div>

        {/* Revision history */}
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Histórico de Revisões</div>
          {history.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)] italic">Nenhuma revisão registrada ainda.</p>
          ) : (
            <div className="relative pl-4">
              <div className="absolute left-[5px] top-1 bottom-1 w-[1px] bg-[var(--accent)]" />
              <div className="space-y-3">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-4 top-1 w-[11px] h-[11px] rounded-full bg-[var(--accent-light)] border-2 border-[var(--navy)]" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">v{h.version}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] font-medium">
                        {REVISION_AUTHOR_LABEL[h.author]}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">{formatTimestamp(h.timestamp)}</span>
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">{h.note}</div>
                    {h.feedback && (
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 italic leading-relaxed">“{h.feedback}”</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Owner actions */}
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] mt-1 pt-4">
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
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
              Nota da nova versão (opcional)
            </label>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="O que mudou nesta versão?"
              rows={2}
              className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
