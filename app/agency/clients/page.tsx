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
        ? "bg-[var(--success-bg)] text-[var(--success)]"
        : "bg-[var(--accent)] text-[var(--text-muted)]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${source === "db" ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"}`} />
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
              <span className="text-[11px] text-[var(--text-muted)]">Carregando…</span>
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
          className="h-8 px-3 text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] placeholder:text-[var(--text-muted)] w-64"
        />
        <div className="flex items-center gap-1.5">
          {(["all", "active", "inactive", "prospect"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-7 px-3 text-[12px] font-medium rounded-[6px] transition-colors ${
                statusFilter === s ? "bg-[var(--text-primary)] text-white" : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--accent)]"
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
        <>
        {/* Celular: cartão em vez de tabela de 5 colunas — DESIGN.md §6.3. */}
        <ul className="md:hidden space-y-2 list-none p-0 m-0">
          {filtered.map((client) => (
            <li key={client.id} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Link href={`/agency/clients/${client.id}`} className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-[10px] bg-[var(--accent)] flex items-center justify-center text-[13px] font-semibold text-[var(--text-secondary)] shrink-0">
                  {client.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">{client.name}</div>
                  <div className="text-[12px] text-[var(--text-secondary)] truncate">
                    {client.industry}
                    {client.website ? ` · ${client.website}` : ""}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge variant={client.status} />
                    <span className="text-[12px] text-[var(--text-secondary)] mono-num">
                      {getProjectCount(client.id)} projeto{getProjectCount(client.id) !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[12px] text-[var(--text-muted)]">· desde {client.createdAt.slice(0, 7)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Cliente</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Setor</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Projetos</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.id}
                  className={`group hover:bg-[var(--bg-elevated)] transition-colors ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/agency/clients/${client.id}`} className="block">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-[var(--accent)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-secondary)] shrink-0">
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--navy)] transition-colors">
                            {client.name}
                          </div>
                          {client.website && (
                            <div className="text-[11px] text-[var(--text-muted)]">{client.website}</div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{client.industry}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={client.status} />
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)] mono-num">{getProjectCount(client.id)}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[var(--text-muted)]">{client.createdAt.slice(0, 7)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Cliente">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex.: Sushikasa"
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Setor</label>
              <input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="ex.: Alimentação"
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Site</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="ex.: exemplo.com.br"
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Breve descrição do cliente..."
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
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
