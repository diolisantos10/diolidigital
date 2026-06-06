"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
  type ClientRequestStatus,
} from "@/lib/agency/client-requests";

const DEPT_LABELS: Record<string, string> = {
  "social-media":       "Social Media",
  "design":             "Design",
  "paid-traffic":       "Tráfego Pago",
  "brand-hub":          "Identidade de Marca",
  "project-management": "Gestão de Projetos",
  "strategy":           "Estratégia",
};

const STATUS_FILTERS: { label: string; value: ClientRequestStatus | "all" }[] = [
  { label: "Todas",              value: "all" },
  { label: "Novas",              value: "new" },
  { label: "Em Análise",        value: "under_review" },
  { label: "Aguardando Proposta", value: "proposal_pending" },
  { label: "Em Andamento",      value: "in_progress" },
  { label: "Aguardando Cliente",value: "waiting_client" },
  { label: "Concluídas",        value: "completed" },
  { label: "Recusadas",         value: "rejected" },
];

export default function AgencyRequestsPage() {
  const { clientRequests, clients, updateClientRequest } = useAgencyStore();
  const [activeFilter, setActiveFilter] = useState<ClientRequestStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = (clientRequests ?? []).filter(
    (r) => activeFilter === "all" || r.status === activeFilter
  );

  const newCount = (clientRequests ?? []).filter((r) => r.status === "new").length;

  const getClientName = (clientId: string) =>
    clients.find((c) => c.id === clientId)?.name ?? clientId;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Solicitações de Clientes</h1>
          <p className="text-[13px] text-[#9B9B95] mt-0.5">
            Briefings recebidos pelo portal — analise e transforme em projetos.
          </p>
        </div>
        {newCount > 0 && (
          <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[12px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6]" />
            {newCount} nova{newCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count = f.value === "all"
            ? (clientRequests ?? []).length
            : (clientRequests ?? []).filter((r) => r.status === f.value).length;
          return (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors ${
                activeFilter === f.value
                  ? "bg-[#1A1A1A] text-white"
                  : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"
              }`}
            >
              {f.label} {count > 0 && <span className="opacity-60 ml-0.5">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhuma solicitação</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5">
            {activeFilter === "all"
              ? "Solicitações dos clientes aparecerão aqui quando enviadas pelo portal."
              : "Nenhuma solicitação com esse status no momento."}
          </p>
        </div>
      )}

      {/* Requests list */}
      <div className="space-y-3">
        {filtered.map((req) => {
          const style = REQUEST_STATUS_STYLE[req.status];
          const isExpanded = expandedId === req.id;
          const clientName = getClientName(req.clientId);

          return (
            <div
              key={req.id}
              className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              {/* Header row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#F7F7F6] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                {/* Status dot */}
                {req.status === "new" && (
                  <span className="w-2 h-2 rounded-full bg-[#5B5BD6] shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#1A1A1A]">{req.title}</span>
                    <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                      {REQUEST_STATUS_LABEL[req.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] text-[#6B6B65] font-medium">{clientName}</span>
                    {req.extractedSummary.services.length > 0 && (
                      <>
                        <span className="text-[#D0D0CC]">·</span>
                        <span className="text-[12px] text-[#9B9B95]">
                          {req.extractedSummary.services.slice(0, 2).join(", ")}
                        </span>
                      </>
                    )}
                    <span className="text-[#D0D0CC]">·</span>
                    <span className="text-[11px] text-[#C0C0BC]">
                      {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                {/* Missing info badge */}
                {req.missingInfo.length > 0 && (
                  <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold shrink-0">
                    {req.missingInfo.length} info{req.missingInfo.length !== 1 ? "s" : ""} ausente{req.missingInfo.length !== 1 ? "s" : ""}
                  </span>
                )}

                <span className="text-[#C0C0BC] text-[12px] shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-[#F0F0ED] px-5 py-5 space-y-5">
                  {/* Raw text */}
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Texto original</div>
                    <p className="text-[13px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap bg-[#F7F7F6] rounded-[8px] px-4 py-3">
                      {req.rawText}
                    </p>
                  </div>

                  {/* Extracted summary grid */}
                  <div className="grid grid-cols-2 gap-5">
                    {req.extractedSummary.services.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Serviços</div>
                        <div className="flex flex-wrap gap-1.5">
                          {req.extractedSummary.services.map((s) => (
                            <span key={s} className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-medium">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.extractedSummary.channels.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Canais</div>
                        <div className="flex flex-wrap gap-1.5">
                          {req.extractedSummary.channels.map((c) => (
                            <span key={c} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.extractedSummary.objectives.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
                        <div className="flex flex-wrap gap-1.5">
                          {req.extractedSummary.objectives.map((o) => (
                            <span key={o} className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-medium">{o}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.extractedSummary.quantities.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Quantidades</div>
                        <div className="flex flex-wrap gap-1.5">
                          {req.extractedSummary.quantities.map((q) => (
                            <span key={q} className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[11px] font-medium">{q}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.extractedSummary.suggestedDepartments.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Departamentos sugeridos</div>
                        <div className="flex flex-wrap gap-1.5">
                          {req.extractedSummary.suggestedDepartments.map((d) => (
                            <span key={d} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#1A1A1A] text-[11px] font-medium">
                              {DEPT_LABELS[d] ?? d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.extractedSummary.urgency && (
                      <div>
                        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Urgência</div>
                        <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[11px] font-medium inline-block">
                          {req.extractedSummary.urgency}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Missing info */}
                  {req.missingInfo.length > 0 && (
                    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3">
                      <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">Informações ausentes</div>
                      <ul className="space-y-0.5">
                        {req.missingInfo.map((m) => (
                          <li key={m} className="text-[12px] text-[#92400E] flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-[#F59E0B] shrink-0" />{m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[#F0F0ED]">
                    {req.status === "new" && (
                      <button
                        onClick={() => updateClientRequest(req.id, { status: "under_review" })}
                        className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                      >
                        Analisar
                      </button>
                    )}
                    {req.status === "under_review" && (
                      <button
                        onClick={() => updateClientRequest(req.id, { status: "proposal_pending" })}
                        className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                      >
                        Marcar como proposta pendente
                      </button>
                    )}
                    <button
                      disabled
                      className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] text-[12px] font-medium cursor-not-allowed opacity-60"
                      title="Em breve"
                    >
                      Criar projeto
                    </button>
                    {req.status !== "completed" && req.status !== "rejected" && (
                      <select
                        value={req.status}
                        onChange={(e) => updateClientRequest(req.id, { status: e.target.value as ClientRequestStatus })}
                        className="ml-auto h-8 px-2 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
                      >
                        {(["new", "under_review", "proposal_pending", "in_progress", "waiting_client", "completed", "rejected"] as ClientRequestStatus[]).map((s) => (
                          <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
