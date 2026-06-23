"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbClients } from "@/lib/hooks/useDbClients";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import EmptyState from "@/components/agency/ui/EmptyState";
import Link from "next/link";
import { ClientStatus } from "@/lib/agency/mock-data";

function SourceBadge({ source }: { source: "db" | "local" }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${
      source === "db"
        ? "bg-[#DCFCE7] text-[#16A34A]"
        : "bg-[#F0F0ED] text-[#9B9B95]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${source === "db" ? "bg-[#16A34A]" : "bg-[#9B9B95]"}`} />
      {source === "db" ? "DB" : "Local"}
    </span>
  );
}

export default function ClientsPage() {
  const { projects, createClient } = useAgencyStore();
  const { clients, source, loading } = useDbClients();

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [modalOpen, setModalOpen]     = useState(false);
  const [form, setForm]               = useState({
    name: "", industry: "", website: "", status: "active" as ClientStatus, description: "",
  });

  const filtered = clients
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.industry ?? "").toLowerCase().includes(search.toLowerCase())
    );

  const getProjectCount = (clientId: string) =>
    projects.filter((p) => p.clientId === clientId).length;

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createClient(form);
    setForm({ name: "", industry: "", website: "", status: "active", description: "" });
    setModalOpen(false);
  };

  return (
    <>
      <AgencyHeader
        title="Clientes"
        subtitle={`${clients.length} cliente${clients.length !== 1 ? "s" : ""} cadastrado${clients.length !== 1 ? "s" : ""}`}
        meta={
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-[11px] text-[#9B9B95]">Carregando…</span>
            ) : (
              <SourceBadge source={source} />
            )}
          </div>
        }
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + Novo Cliente
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar clientes..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] placeholder:text-[#9B9B95] w-64"
        />
        <div className="flex items-center gap-1.5">
          {(["all", "active", "inactive", "prospect"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-7 px-3 text-[12px] font-medium rounded-[6px] transition-colors ${
                statusFilter === s ? "bg-[#1A1A1A] text-white" : "bg-white border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F0F0ED]"
              }`}
            >
              {s === "all" ? "Todos" : s === "active" ? "Ativo" : s === "inactive" ? "Inativo" : "Prospect"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={search ? "Tente ajustar a busca." : "Adicione seu primeiro cliente para começar."}
          action={<Button variant="primary" onClick={() => setModalOpen(true)}>Adicionar Cliente</Button>}
        />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Cliente</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Setor</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Projetos</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.id}
                  className={`group hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/agency/clients/${client.id}`} className="block">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-[#F0F0ED] flex items-center justify-center text-[12px] font-semibold text-[#6B6B65] shrink-0">
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-[#1A1A1A] group-hover:text-[#070A1F] transition-colors">
                            {client.name}
                          </div>
                          {client.website && (
                            <div className="text-[11px] text-[#9B9B95]">{client.website}</div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6B6B65]">{client.industry}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={client.status} />
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6B6B65] mono-num">{getProjectCount(client.id)}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#9B9B95]">{client.createdAt.slice(0, 7)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Cliente">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex.: Sushikasa"
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Setor</label>
              <input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="ex.: Alimentação"
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Site</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="ex.: exemplo.com.br"
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Breve descrição do cliente..."
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] focus:bg-white resize-none"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.name.trim()}>
              Criar Cliente
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
