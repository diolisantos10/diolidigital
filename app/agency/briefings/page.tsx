"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import EmptyState from "@/components/agency/ui/EmptyState";
import { BriefingStatus } from "@/lib/agency/mock-data";

export default function BriefingsPage() {
  const { briefings, projects, clients, createBriefing, updateBriefingStatus } = useAgencyStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    clientId: "",
    goal: "",
    audience: "",
    keyMessage: "",
    deliverables: "",
    deadline: "",
    successCriteria: "",
    notes: "",
    status: "pending_analysis" as BriefingStatus,
  });

  const getProject = (id: string) => projects.find((p) => p.id === id);
  const getClient = (id: string) => clients.find((c) => c.id === id);

  const CYCLE: Record<BriefingStatus, BriefingStatus> = {
    pending_analysis: "analyzed",
    analyzed: "approved",
    approved: "pending_analysis",
  };

  const handleCreate = () => {
    if (!form.projectId || !form.goal) return;
    const project = getProject(form.projectId);
    createBriefing({
      ...form,
      clientId: project?.clientId ?? form.clientId,
    });
    setForm({ projectId: "", clientId: "", goal: "", audience: "", keyMessage: "", deliverables: "", deadline: "", successCriteria: "", notes: "", status: "pending_analysis" });
    setModalOpen(false);
  };

  return (
    <>
      <AgencyHeader
        title="Briefings"
        subtitle={`${briefings.length} briefing${briefings.length !== 1 ? "s" : ""} enviado${briefings.length !== 1 ? "s" : ""}`}
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}>+ Novo Briefing</Button>}
      />

      {briefings.length === 0 ? (
        <EmptyState
          title="Nenhum briefing ainda"
          description="Envie um briefing de projeto para iniciar o fluxo do Orquestrador."
          action={<Button variant="primary" onClick={() => setModalOpen(true)}>Enviar Briefing</Button>}
        />
      ) : (
        <div className="space-y-3">
          {briefings.map((briefing) => {
            const project = getProject(briefing.projectId);
            const client = getClient(briefing.clientId || project?.clientId || "");
            return (
              <div
                key={briefing.id}
                className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-[14px] font-semibold text-[#1A1A1A]">
                        {project?.name ?? "Unknown Project"}
                      </span>
                      <button
                        onClick={() => updateBriefingStatus(briefing.id, CYCLE[briefing.status])}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <Badge variant={briefing.status} />
                      </button>
                    </div>
                    <div className="text-[12px] text-[#9B9B95]">
                      {client?.name} · Enviado em {briefing.createdAt}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    { label: "Objetivo de Negócio", value: briefing.goal },
                    { label: "Público-Alvo", value: briefing.audience },
                    { label: "Mensagem-Chave", value: briefing.keyMessage },
                    { label: "Critérios de Sucesso", value: briefing.successCriteria },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">{label}</div>
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{value}</p>
                    </div>
                  ))}
                </div>

                {briefing.deliverables && (
                  <div className="mt-3 pt-3 border-t border-[#F0F0ED]">
                    <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mr-2">Entregas:</span>
                    <span className="text-[13px] text-[#6B6B65]">{briefing.deliverables}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Briefing" width="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Projeto *</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            >
              <option value="">Selecionar projeto...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Objetivo de Negócio *</label>
            <textarea
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              placeholder="Qual é o objetivo de negócio deste projeto?"
              rows={2}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Público-Alvo</label>
              <textarea
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="Quem você quer alcançar?"
                rows={2}
                className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Mensagem-Chave</label>
              <textarea
                value={form.keyMessage}
                onChange={(e) => setForm({ ...form, keyMessage: e.target.value })}
                placeholder="Mensagem central a ser comunicada"
                rows={2}
                className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Entregas Esperadas</label>
              <input
                value={form.deliverables}
                onChange={(e) => setForm({ ...form, deliverables: e.target.value })}
                placeholder="ex.: textos, peças visuais, anúncios"
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Prazo</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Critérios de Sucesso</label>
            <input
              value={form.successCriteria}
              onChange={(e) => setForm({ ...form, successCriteria: e.target.value })}
              placeholder="Como o sucesso será medido?"
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.projectId || !form.goal}>
              Enviar Briefing
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
