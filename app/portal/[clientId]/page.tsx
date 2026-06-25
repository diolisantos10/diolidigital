"use client";

import { use } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";

export default function ClientPortalHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const { clients, projects, clientPortalItems, approveProposal, updateClientPortalItem } = useAgencyStore();

  const client = clients.find((c) => c.id === clientId);
  const clientProjects = projects.filter((p) => p.clientId === clientId);
  const portalItems = clientPortalItems.filter((i) => i.clientId === clientId);
  const pendingItems = portalItems.filter((i) => i.status === "pending");

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="text-[14px] text-[#9B9B95]">Portal não encontrado.</p>
        <p className="text-[12px] text-[#C0C0BC] mt-1">Verifique o link enviado pela Dioli Digital Studio.</p>
      </div>
    );
  }

  function handleApproveProposal(item: typeof portalItems[0]) {
    if (!item.projectId) return;
    // Approve proposal in store (cascades departments automatically)
    approveProposal(item.projectId);
    // Mark portal item as approved
    updateClientPortalItem(item.id, { status: "approved", respondedAt: new Date().toISOString() });
  }

  function handleRejectItem(item: typeof portalItems[0]) {
    updateClientPortalItem(item.id, { status: "rejected", respondedAt: new Date().toISOString() });
  }

  const STAGE_LABEL: Record<string, string> = {
    briefing: "Briefing recebido",
    proposal_sent: "Proposta enviada",
    approved: "Aprovado — em produção",
    diagnosis: "Diagnóstico",
    planning: "Planejamento",
    production: "Produção",
    review: "Em revisão",
    delivery: "Entrega",
    ongoing: "Em andamento",
    completed: "Concluído",
  };

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-[26px] font-bold text-[#1A1A1A]">Olá, {client.name} 👋</h1>
        <p className="text-[14px] text-[#6B6B65] mt-1">
          Bem-vindo ao seu portal. Aqui você acompanha e aprova tudo em tempo real.
        </p>
      </div>

      {/* Pending items — the most important section */}
      {pendingItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-[#1A1A1A]">Pendente de você</h2>
            <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold">{pendingItems.length}</span>
          </div>
          {pendingItems.map((item) => (
            <div key={item.id} className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${
                        item.type === "proposal_approval" ? "bg-[#E6FBFA] text-[#070A1F]"
                        : item.type === "content_approval" ? "bg-[#EDE9FE] text-[#5B21B6]"
                        : item.type === "material_request" ? "bg-[#FEF3C7] text-[#D97706]"
                        : "bg-[#F0F0ED] text-[#6B6B65]"
                      }`}>
                        {item.type === "proposal_approval" ? "✦ Proposta"
                        : item.type === "content_approval" ? "Arte para aprovação"
                        : item.type === "material_request" ? "Material solicitado"
                        : "Informação solicitada"}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-[#1A1A1A]">{item.title}</h3>
                    <p className="text-[13px] text-[#6B6B65] mt-0.5">{item.description}</p>

                    {/* Proposal detail */}
                    {item.type === "proposal_approval" && item.payload && (
                      <div className="mt-4 bg-[#F7F7F6] rounded-[10px] px-4 py-4 space-y-3">
                        {Boolean(item.payload.goal) && (
                          <div>
                            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Objetivo</p>
                            <p className="text-[13px] text-[#1A1A1A]">{String(item.payload.goal)}</p>
                          </div>
                        )}
                        {Array.isArray(item.payload.deliverables) && item.payload.deliverables.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">O que está incluído</p>
                            <div className="space-y-0.5">
                              {(item.payload.deliverables as string[]).map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[12px] text-[#1A1A1A]">
                                  <span className="text-[#16A34A]">✓</span> {d}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {Boolean(item.payload.pricing) && (
                            <div>
                              <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Investimento</p>
                              <p className="text-[15px] font-bold text-[#1A1A1A]">{String(item.payload.pricing)}</p>
                            </div>
                          )}
                          {Boolean(item.payload.timeline) && (
                            <div>
                              <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Prazo</p>
                              <p className="text-[13px] font-semibold text-[#1A1A1A]">{String(item.payload.timeline)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[#F0F0ED]">
                  <button
                    onClick={() => handleApproveProposal(item)}
                    className="h-9 px-5 rounded-[8px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[13px] font-semibold transition-colors"
                  >
                    {item.type === "proposal_approval" ? "✓ Aprovar proposta" : "✓ Aprovar"}
                  </button>
                  <button
                    onClick={() => handleRejectItem(item)}
                    className="h-9 px-4 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#DC2626] hover:text-[#DC2626] text-[13px] font-medium transition-colors"
                  >
                    {item.type === "proposal_approval" ? "Solicitar alteração" : "Recusar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All portal items (history) */}
      {portalItems.filter(i => i.status !== "pending").length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold text-[#1A1A1A] mb-3">Histórico</h2>
          <div className="space-y-2">
            {portalItems.filter(i => i.status !== "pending").map((item) => (
              <div key={item.id} className="flex items-center gap-3 bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-3.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.status === "approved" ? "bg-[#16A34A]" : "bg-[#DC2626]"}`} />
                <span className="flex-1 text-[13px] text-[#1A1A1A]">{item.title}</span>
                <span className="text-[11px] text-[#9B9B95]">
                  {item.status === "approved" ? "Aprovado" : "Recusado"} · {item.respondedAt ? new Date(item.respondedAt).toLocaleDateString("pt-BR") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects status */}
      {clientProjects.length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold text-[#1A1A1A] mb-3">Seus projetos</h2>
          <div className="space-y-3">
            {clientProjects.map((project) => (
              <div key={project.id} className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#1A1A1A]">{project.name}</h3>
                    <p className="text-[12px] text-[#9B9B95] mt-0.5">{project.type}</p>
                  </div>
                  <span className="h-6 px-3 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">
                    {STAGE_LABEL[project.stage] ?? project.stage}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {pendingItems.length === 0 && clientProjects.length === 0 && (
        <div className="text-center py-16 bg-white rounded-[12px] border border-[#E5E5E2]">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Tudo em dia!</p>
          <p className="text-[13px] text-[#9B9B95] mt-1">Nenhuma pendência no momento. A equipe está trabalhando nos seus projetos.</p>
        </div>
      )}
    </div>
  );
}
