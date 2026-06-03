"use client";

import { use, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import Link from "next/link";
import {
  ClientStatus,
  MOCK_BRAND_ASSETS,
  MOCK_AGENTS,
  ProjectStage,
  type BrandBrain,
} from "@/lib/agency/mock-data";
import type { OperationalRisk } from "@/lib/agency/workspace";
import { getClientAgentContext } from "@/lib/agency/workspace";
import { getClientProgress } from "@/lib/agency/reporting";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_COLORS: Record<string, string> = {
  logo: "bg-[#EEF0FF] text-[#5B5BD6]",
  color_palette: "bg-[#FEF3C7] text-[#D97706]",
  typography: "bg-[#F0FDF4] text-[#16A34A]",
  tone_of_voice: "bg-[#FFF7ED] text-[#C2410C]",
  visual_reference: "bg-[#F0F0ED] text-[#6B6B65]",
  guidelines: "bg-[#F5F3FF] text-[#7C3AED]",
};

const PIPELINE_STAGES: ProjectStage[] = [
  "briefing", "diagnosis", "planning", "production", "review", "delivery",
];

const ACTIVITY_ICONS: Record<string, string> = {
  project_created: "◆",
  project_stage_changed: "→",
  task_updated: "✓",
  deliverable_updated: "◎",
  client_created: "★",
  briefing_created: "◈",
  orchestrator_approved: "⚡",
};

// ─── Future-proof resource shape (supports AI and human agents) ───────────────

interface Resource {
  id: string;
  name: string;
  role: string;
  type: "ai" | "human";
  projectNames: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { clients, projects, tasks, deliverables, activity, materialRequests, updateClient } = useAgencyStore();
  const [editOpen, setEditOpen] = useState(false);
  const [brainEditing, setBrainEditing] = useState(false);
  const [brainDraft, setBrainDraft] = useState<BrandBrain | null>(null);
  const [brainSaved, setBrainSaved] = useState(false);
  const portalUrl = `/portal/client/${id}`;

  const client = clients.find((c) => c.id === id);
  if (!client) return notFound();

  const EMPTY_BRAIN: BrandBrain = {
    businessSummary: "", positioning: "", targetAudience: "", toneOfVoice: "",
    visualStyle: "", brandRules: "", productsToHighlight: "", thingsToAvoid: "",
    preferredChannels: "", strategicNotes: "",
  };
  const activeBrainDraft: BrandBrain = brainDraft ?? client.brandBrain ?? EMPTY_BRAIN;

  const handleSaveBrain = () => {
    updateClient(id, { brandBrain: activeBrainDraft });
    setBrainEditing(false);
    setBrainSaved(true);
    setTimeout(() => setBrainSaved(false), 3000);
  };

  // ── Derived collections ─────────────────────────────────────────────────────
  const clientProjects = projects.filter((p) => p.clientId === id);
  const clientProjectIds = new Set(clientProjects.map((p) => p.id));
  const projectMap = Object.fromEntries(clientProjects.map((p) => [p.id, p]));
  const agentMap = Object.fromEntries(MOCK_AGENTS.map((a) => [a.id, a]));

  const clientTasks = tasks.filter((t) => clientProjectIds.has(t.projectId));
  const clientDeliverables = deliverables.filter((d) => clientProjectIds.has(d.projectId));
  const clientActivity = [...activity]
    .filter((e) => (e.projectId !== undefined && clientProjectIds.has(e.projectId)) || e.clientId === id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
  const brandAssets = MOCK_BRAND_ASSETS.filter((a) => a.clientId === id);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeProjects   = clientProjects.filter((p) => p.stage !== "completed");
  const inProgressTasks  = clientTasks.filter((t) => t.status === "in_progress");
  const pendingTasks     = clientTasks.filter((t) => t.status === "pending");
  const doneTasks        = clientTasks.filter((t) => t.status === "done");
  const blockedTasks     = clientTasks.filter((t) => t.status === "blocked");

  // ── Resources ───────────────────────────────────────────────────────────────
  const agentIdSet = new Set(clientProjects.flatMap((p) => p.agents));
  const resources: Resource[] = MOCK_AGENTS
    .filter((a) => agentIdSet.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      type: "ai" as const,
      projectNames: clientProjects.filter((p) => p.agents.includes(a.id)).map((p) => p.name),
    }));

  // ── Task groups ─────────────────────────────────────────────────────────────
  const taskGroups = [
    { label: "Em Andamento", tasks: inProgressTasks, dot: "bg-[#5B5BD6]",  text: "text-[#5B5BD6]"  },
    { label: "Pendente",     tasks: pendingTasks,    dot: "bg-[#9B9B95]",  text: "text-[#6B6B65]"  },
    { label: "Bloqueada",    tasks: blockedTasks,    dot: "bg-[#DC2626]",  text: "text-[#DC2626]"  },
    { label: "Concluída",    tasks: doneTasks,       dot: "bg-[#16A34A]",  text: "text-[#16A34A]"  },
  ].filter((g) => g.tasks.length > 0);

  // ── Deliverables grouped by type ────────────────────────────────────────────
  const deliverableByType: Record<string, typeof clientDeliverables> = {};
  for (const d of clientDeliverables) {
    deliverableByType[d.type] = deliverableByType[d.type] ?? [];
    deliverableByType[d.type].push(d);
  }

  // ── Operational risks ────────────────────────────────────────────────────────
  const risks: OperationalRisk[] = [];
  const today = new Date();
  for (const p of clientProjects) {
    if (p.stage === "completed") continue;
    const deadline = new Date(p.deadline);
    const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) risks.push({ severity: "high", label: "Projeto atrasado", detail: `${p.name} passou o prazo em ${Math.abs(daysLeft)}d`, projectId: p.id });
    else if (daysLeft < 7) risks.push({ severity: "medium", label: "Prazo se aproximando", detail: `${p.name} — ${daysLeft}d restantes`, projectId: p.id });
  }
  const blockedCount = blockedTasks.length;
  if (blockedCount > 0) risks.push({ severity: "high", label: `${blockedCount} tarefa${blockedCount > 1 ? "s" : ""} bloqueada${blockedCount > 1 ? "s" : ""}`, detail: blockedTasks.map((t) => t.title).join(", ") });
  const stalledProjects = clientProjects.filter((p) => p.stage !== "completed" && !inProgressTasks.some((t) => t.projectId === p.id));
  for (const p of stalledProjects) risks.push({ severity: "low", label: "Sem tarefas ativas", detail: `${p.name} não tem tarefas em andamento`, projectId: p.id });
  const RISK_COLORS = { high: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", dot: "bg-[#DC2626]" }, medium: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", dot: "bg-[#D97706]" }, low: { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", dot: "bg-[#9B9B95]" } };

  // ── Agent context readiness ──────────────────────────────────────────────────
  const agentCtx = getClientAgentContext(client);
  const BRAIN_FIELDS: { key: keyof BrandBrain; label: string; placeholder: string }[] = [
    { key: "businessSummary",     label: "Resumo do Negócio",       placeholder: "O que o negócio é, o que vende, por que existe" },
    { key: "positioning",         label: "Posicionamento",          placeholder: "Posição no mercado e proposta de valor única" },
    { key: "targetAudience",      label: "Público-Alvo",            placeholder: "Com quem a marca está falando" },
    { key: "toneOfVoice",         label: "Tom de Voz",              placeholder: "Como a marca se comunica" },
    { key: "visualStyle",         label: "Estilo Visual",           placeholder: "Direção visual, cores, referências estéticas" },
    { key: "brandRules",          label: "Regras de Marca",         placeholder: "Inegociáveis — sempre seguir" },
    { key: "productsToHighlight", label: "Produtos em Destaque",    placeholder: "Produtos / serviços principais para destacar no conteúdo" },
    { key: "thingsToAvoid",       label: "O que Evitar",            placeholder: "Palavras, tons, referências para nunca usar" },
    { key: "preferredChannels",   label: "Canais Preferenciais",    placeholder: "Canais com melhor desempenho para esta marca" },
    { key: "strategicNotes",      label: "Notas Estratégicas",      placeholder: "Contexto interno da agência, histórico, ressalvas" },
  ];

  // ── Edit form ───────────────────────────────────────────────────────────────
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
            <Link href={portalUrl} target="_blank">
              <Button variant="ghost">Ver portal ↗</Button>
            </Link>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Editar Cliente</Button>
            <Link href="/agency/orchestrator">
              <Button variant="primary">+ Novo Projeto</Button>
            </Link>
          </>
        }
      />

      {/* ── Summary Bar ───────────────────────────────────────────────────────── */}
      {(() => {
        const cp = getClientProgress(id, projects, clientDeliverables.length > 0 ? clientDeliverables : deliverables.filter((d) => clientProjectIds.has(d.projectId)), materialRequests);
        const HEALTH = {
          on_track:        { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "No Prazo", dot: "bg-[#16A34A]" },
          needs_attention: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Atenção", dot: "bg-[#D97706]" },
          at_risk:         { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Em Risco", dot: "bg-[#DC2626]" },
        }[cp.healthStatus];
        return cp.totalDeliverables > 0 ? (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 mb-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-[#1A1A1A]">Progresso do Cliente</span>
              <span className={`flex items-center gap-1.5 h-5 px-2 rounded-full text-[10px] font-semibold ${HEALTH.bg} ${HEALTH.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${HEALTH.dot}`} />{HEALTH.label}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-3">
              {[
                { label: "Projetos Ativos",         value: cp.activeProjects,              neutral: true },
                { label: "Aguardando Aprovação",     value: cp.pendingApprovals,            warn: true },
                { label: "Em Revisão Interna",       value: cp.revisionsNeeded,             warn: true },
                { label: "Materiais Pendentes",      value: cp.pendingMaterialRequests,     warn: true },
                { label: "Entregas Aprovadas",       value: cp.approvedDeliverables,        good: true },
                { label: "Entregues",                value: cp.deliveredDeliverables,       good: true },
              ].map(({ label, value, neutral, warn, good }) => (
                <div key={label} className="text-center">
                  <div className={`text-[20px] font-bold mono-num leading-none ${warn && value > 0 ? "text-[#D97706]" : good && value > 0 ? "text-[#16A34A]" : "text-[#1A1A1A]"}`}>{value}</div>
                  <div className="text-[10px] text-[#9B9B95] mt-1 leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Projetos Ativos",  value: activeProjects.length,      alert: false },
          { label: "Em Andamento",     value: inProgressTasks.length,     alert: false },
          { label: "Tarefas Pendentes", value: pendingTasks.length,       alert: false },
          { label: "Entregas",         value: clientDeliverables.length,  alert: false },
          { label: "Bloqueadas",       value: blockedTasks.length,        alert: true  },
        ].map(({ label, value, alert }) => (
          <div
            key={label}
            className={`bg-white rounded-[10px] border px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
              alert && value > 0 ? "border-red-200" : "border-[#E5E5E2]"
            }`}
          >
            <div className={`text-[22px] font-bold mono-num leading-none ${
              alert && value > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]"
            }`}>
              {value}
            </div>
            <div className="text-[11px] text-[#9B9B95] mt-1.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Description */}
          {client.description && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[13px] text-[#6B6B65] leading-relaxed">{client.description}</p>
            </div>
          )}

          {/* ── Project Pipeline ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">
                Pipeline de Projetos
                <span className="ml-2 text-[12px] font-normal text-[#9B9B95]">{clientProjects.length} projeto{clientProjects.length !== 1 ? "s" : ""}</span>
              </h2>
              <Link href="/agency/orchestrator" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                + Novo projeto
              </Link>
            </div>

            {clientProjects.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">Nenhum projeto ainda.</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {clientProjects.map((project) => {
                  const stageIdx = PIPELINE_STAGES.indexOf(project.stage);
                  const isCompleted = project.stage === "completed";
                  const isOngoing   = project.stage === "ongoing";
                  return (
                    <div key={project.id} className="px-5 py-4 hover:bg-[#FAFAF9] transition-colors">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="min-w-0">
                          <Link
                            href={`/agency/projects/${project.id}`}
                            className="text-[13px] font-medium text-[#1A1A1A] hover:text-[#5B5BD6] transition-colors"
                          >
                            {project.name}
                          </Link>
                          <span className="ml-2 text-[11px] text-[#9B9B95]">{project.type}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={project.priority} />
                          <span className="text-[11px] text-[#9B9B95]">{project.deadline.slice(5)}</span>
                        </div>
                      </div>
                      {/* Stage bar */}
                      <div className="flex items-center gap-1">
                        {PIPELINE_STAGES.map((stage, i) => {
                          const passed  = isCompleted || isOngoing || i < stageIdx;
                          const current = !isCompleted && !isOngoing && stage === project.stage;
                          return (
                            <div
                              key={stage}
                              title={stage}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                current ? "bg-[#5B5BD6]"
                                : passed  ? "bg-[#C7C8F6]"
                                :           "bg-[#F0F0ED]"
                              }`}
                            />
                          );
                        })}
                        <span className="ml-2 text-[11px] text-[#9B9B95] capitalize shrink-0 w-16 text-right">
                          {project.stage}
                        </span>
                      </div>
                      {/* Approval status strip */}
                      {(() => {
                        const projDelivs = deliverables.filter((d) => d.projectId === project.id);
                        if (projDelivs.length === 0) return null;
                        const awaiting = projDelivs.filter((d) => d.status === "in_review").length;
                        const approved = projDelivs.filter((d) => d.status === "approved").length;
                        const revision = projDelivs.filter((d) => d.status === "draft" && d.clientFeedback).length;
                        if (awaiting === 0 && approved === 0 && revision === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {awaiting > 0 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706]">
                                {awaiting} aguardando revisão
                              </span>
                            )}
                            {revision > 0 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626]">
                                {revision} revisão necessária
                              </span>
                            )}
                            {approved > 0 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">
                                {approved} aprovado{approved !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Client Tasks ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">
                Tarefas
                <span className="ml-2 text-[12px] font-normal text-[#9B9B95]">{clientTasks.length} no total</span>
              </h2>
            </div>

            {clientTasks.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">Nenhuma tarefa ainda.</div>
            ) : (
              <div>
                {taskGroups.map((group) => (
                  <div key={group.label}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-5 py-2 bg-[#FAFAF9] border-b border-[#F0F0ED]">
                      <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                      <span className={`text-[11px] font-semibold uppercase tracking-[0.05em] ${group.text}`}>
                        {group.label}
                      </span>
                      <span className="text-[11px] text-[#9B9B95]">({group.tasks.length})</span>
                    </div>
                    {/* Task rows */}
                    {group.tasks.map((task, i) => {
                      const proj  = projectMap[task.projectId];
                      const agent = agentMap[task.agentId];
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 px-5 py-3 hover:bg-[#FAFAF9] transition-colors ${
                            i > 0 ? "border-t border-[#F7F7F6]" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#1A1A1A] font-medium leading-snug">{task.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {proj && (
                                <Link
                                  href={`/agency/projects/${proj.id}`}
                                  className="text-[11px] text-[#9B9B95] hover:text-[#5B5BD6] transition-colors"
                                >
                                  {proj.name}
                                </Link>
                              )}
                              {agent && (
                                <>
                                  <span className="text-[#D4D4CE]">·</span>
                                  <span className="text-[11px] text-[#9B9B95]">{agent.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-[#9B9B95] shrink-0 pt-0.5">{task.dueDate.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Client Deliverables ───────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">
                Entregas
                <span className="ml-2 text-[12px] font-normal text-[#9B9B95]">{clientDeliverables.length} no total</span>
              </h2>
              <Link href="/agency/deliverables" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                Ver todas
              </Link>
            </div>

            {clientDeliverables.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">Nenhuma entrega ainda.</div>
            ) : (
              <div>
                {Object.entries(deliverableByType).map(([type, items]) => (
                  <div key={type}>
                    <div className="flex items-center gap-2 px-5 py-2 bg-[#FAFAF9] border-b border-[#F0F0ED]">
                      <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">{type}</span>
                      <span className="text-[11px] text-[#9B9B95]">({items.length})</span>
                    </div>
                    {items.map((d, i) => {
                      const proj = projectMap[d.projectId];
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center gap-3 px-5 py-3 hover:bg-[#FAFAF9] transition-colors ${
                            i > 0 ? "border-t border-[#F7F7F6]" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#1A1A1A] font-medium">{d.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {proj && (
                                <Link
                                  href={`/agency/projects/${proj.id}`}
                                  className="text-[11px] text-[#9B9B95] hover:text-[#5B5BD6] transition-colors"
                                >
                                  {proj.name}
                                </Link>
                              )}
                              <span className="text-[#D4D4CE]">·</span>
                              <span className="text-[11px] text-[#9B9B95]">v{d.version}</span>
                            </div>
                          </div>
                          <Badge variant={d.status} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Brand Brain ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Brand Brain</h2>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  agentCtx.brandBrainReadiness === 10
                    ? "bg-[#DCFCE7] text-[#16A34A]"
                    : agentCtx.brandBrainReadiness >= 5
                    ? "bg-[#FEF3C7] text-[#D97706]"
                    : "bg-[#F0F0ED] text-[#9B9B95]"
                }`}>
                  {agentCtx.brandBrainReadiness}/10
                </span>
                {brainSaved && (
                  <span className="text-[11px] text-[#16A34A] font-medium">✓ Salvo</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {brainEditing ? (
                  <>
                    <Button variant="ghost" onClick={() => { setBrainDraft(null); setBrainEditing(false); }}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveBrain}>Salvar</Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => { setBrainDraft(client.brandBrain ?? EMPTY_BRAIN); setBrainEditing(true); }}>Editar</Button>
                )}
              </div>
            </div>

            <div className="divide-y divide-[#F0F0ED]">
              {BRAIN_FIELDS.map(({ key, label, placeholder }) => {
                const value = (client.brandBrain?.[key] ?? "") as string;
                const draftValue = (activeBrainDraft[key] ?? "") as string;
                return (
                  <div key={key} className="px-5 py-3.5">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">{label}</div>
                    {brainEditing ? (
                      <textarea
                        value={draftValue}
                        onChange={(e) => setBrainDraft({ ...activeBrainDraft, [key]: e.target.value })}
                        placeholder={placeholder}
                        rows={2}
                        className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                      />
                    ) : value ? (
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{value}</p>
                    ) : (
                      <p className="text-[12px] text-[#C0C0BC] italic">{placeholder}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Activity Timeline ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Atividade</h2>
            </div>

            {clientActivity.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#9B9B95]">Nenhuma atividade registrada ainda.</div>
            ) : (
              <div className="px-5 py-4">
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-[#F0F0ED]" />
                  <div className="space-y-4">
                    {clientActivity.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 relative">
                        {/* Dot */}
                        <div className="w-[15px] h-[15px] rounded-full bg-[#EEF0FF] border-2 border-[#5B5BD6] shrink-0 mt-0.5 z-10 flex items-center justify-center">
                          <span className="text-[7px] text-[#5B5BD6]">{ACTIVITY_ICONS[event.type] ?? "·"}</span>
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="text-[13px] text-[#1A1A1A] leading-snug">{event.message}</div>
                          <div className="text-[11px] text-[#9B9B95] mt-0.5">{timeAgo(event.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ── Overview stats ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Conta</div>
            <div className="space-y-3">
              {[
                { label: "Status",       value: client.status.charAt(0).toUpperCase() + client.status.slice(1) },
                { label: "Cliente desde", value: client.createdAt.slice(0, 7) },
                { label: "Setor",        value: client.industry },
                { label: "Concluídos",   value: String(clientProjects.filter((p) => p.stage === "completed").length) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2">
                  <span className="text-[12px] text-[#9B9B95] shrink-0">{label}</span>
                  <span className="text-[12px] font-medium text-[#1A1A1A] text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Operational Risks ────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Riscos Operacionais</div>
              {risks.length > 0 && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${risks.some(r => r.severity === "high") ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#FEF3C7] text-[#D97706]"}`}>
                  {risks.length} detectado{risks.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {risks.length === 0 ? (
              <div className="px-5 py-5 text-center text-[12px] text-[#9B9B95]">Nenhum risco detectado.</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {risks.map((risk, i) => {
                  const c = RISK_COLORS[risk.severity];
                  return (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-[12px] font-medium ${c.text}`}>{risk.label}</div>
                        <div className="text-[11px] text-[#9B9B95] mt-0.5 leading-snug truncate">{risk.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Assigned Resources ───────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Recursos Alocados</div>
            </div>

            {resources.length === 0 ? (
              <div className="px-5 py-6 text-center text-[13px] text-[#9B9B95]">Nenhum recurso alocado.</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {resources.map((res) => (
                  <div key={res.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-[#EEF0FF] flex items-center justify-center shrink-0 text-[11px] font-bold text-[#5B5BD6]">
                      {initials(res.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-[#1A1A1A]">{res.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          res.type === "ai"
                            ? "bg-[#EEF0FF] text-[#5B5BD6]"
                            : "bg-[#F0FDF4] text-[#16A34A]"
                        }`}>
                          {res.type === "ai" ? "IA" : "Humano"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9B9B95] mt-0.5">{res.role}</div>
                      <div className="text-[11px] text-[#C0C0BC] mt-0.5">
                        {res.projectNames.length} projeto{res.projectNames.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Brand Assets ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Ativos de Marca</div>
              <Link href="/agency/brand-assets" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                Gerenciar
              </Link>
            </div>

            {brandAssets.length === 0 ? (
              <div className="px-5 py-6 text-center text-[13px] text-[#9B9B95]">Nenhum ativo de marca ainda.</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {brandAssets.map((asset) => (
                  <div key={asset.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] shrink-0 ${ASSET_COLORS[asset.type] ?? "bg-[#F0F0ED] text-[#6B6B65]"}`}>
                        {asset.type.replace("_", " ").toUpperCase()}
                      </span>
                      <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{asset.name}</span>
                    </div>
                    {asset.value && (
                      <div className="text-[12px] text-[#6B6B65]">{asset.value}</div>
                    )}
                    {asset.notes && (
                      <div className="text-[11px] text-[#9B9B95] mt-1 italic">{asset.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Setor</label>
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
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
