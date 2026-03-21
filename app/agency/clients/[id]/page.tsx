"use client";

import { use, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import Link from "next/link";
import { ClientStatus } from "@/lib/agency/mock-data";
import { MOCK_BRAND_ASSETS } from "@/lib/agency/mock-data";

const ASSET_COLORS: Record<string, string> = {
  logo: "bg-[#EEF0FF] text-[#5B5BD6]",
  color_palette: "bg-[#FEF3C7] text-[#D97706]",
  typography: "bg-[#F0FDF4] text-[#16A34A]",
  tone_of_voice: "bg-[#FFF7ED] text-[#C2410C]",
  visual_reference: "bg-[#F0F0ED] text-[#6B6B65]",
  guidelines: "bg-[#F5F3FF] text-[#7C3AED]",
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { clients, projects, updateClient } = useAgencyStore();
  const [editOpen, setEditOpen] = useState(false);

  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  const clientProjects = projects.filter((p) => p.clientId === id);
  const brandAssets = MOCK_BRAND_ASSETS.filter((a) => a.clientId === id);
  const activeProjects = clientProjects.filter((p) => p.stage !== "completed");

  const [form, setForm] = useState({
    name: client.name,
    industry: client.industry,
    website: client.website ?? "",
    status: client.status,
    description: client.description ?? "",
  });

  const handleSave = () => {
    updateClient(id, form);
    setEditOpen(false);
  };

  return (
    <>
      <AgencyHeader
        title={client.name}
        subtitle={`${client.industry} · ${client.website ?? ""}`}
        meta={<Badge variant={client.status} size="md" />}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit Client</Button>
            <Link href="/agency/orchestrator">
              <Button variant="primary">+ New Project</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Left */}
        <div className="space-y-6">
          {/* Description */}
          {client.description && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[13px] text-[#6B6B65] leading-relaxed">{client.description}</p>
            </div>
          )}

          {/* Projects */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">
                Projects
                <span className="ml-2 text-[12px] font-normal text-[#9B9B95]">{clientProjects.length} total</span>
              </h2>
              <Link href="/agency/orchestrator" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                + New project
              </Link>
            </div>
            {clientProjects.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">No projects yet.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F0F0ED]">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Project</th>
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Stage</th>
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Priority</th>
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {clientProjects.map((project, i) => (
                    <tr key={project.id} className={`hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                      <td className="px-5 py-3">
                        <Link href={`/agency/projects/${project.id}`} className="text-[13px] font-medium text-[#1A1A1A] hover:text-[#5B5BD6] transition-colors">
                          {project.name}
                        </Link>
                        <div className="text-[11px] text-[#9B9B95]">{project.type}</div>
                      </td>
                      <td className="px-5 py-3"><Badge variant={project.stage} /></td>
                      <td className="px-5 py-3"><Badge variant={project.priority} /></td>
                      <td className="px-5 py-3 text-[12px] text-[#9B9B95]">{project.deadline.slice(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Brand Assets */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Brand Assets</h2>
              <Link href="/agency/brand-assets" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">Manage</Link>
            </div>
            {brandAssets.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">No brand assets yet.</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {brandAssets.map((asset) => (
                  <div key={asset.id} className="flex items-start gap-3 px-5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[4px] shrink-0 mt-0.5 ${ASSET_COLORS[asset.type] ?? "bg-[#F0F0ED] text-[#6B6B65]"}`}>
                      {asset.type.replace("_", " ").toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{asset.name}</div>
                      {asset.value && <div className="text-[12px] text-[#6B6B65] mt-0.5">{asset.value}</div>}
                      {asset.notes && <div className="text-[11px] text-[#9B9B95] mt-1 italic">{asset.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Overview</div>
            <div className="space-y-3">
              {[
                { label: "Total Projects", value: clientProjects.length },
                { label: "Active", value: activeProjects.length },
                { label: "Completed", value: clientProjects.filter(p => p.stage === "completed").length },
                { label: "Client Since", value: client.createdAt.slice(0, 7) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px] text-[#9B9B95]">{label}</span>
                  <span className="text-[13px] font-medium text-[#1A1A1A] mono-num">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Client">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Industry</label>
              <input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Website</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
