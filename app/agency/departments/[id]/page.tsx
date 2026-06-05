"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import {
  DEPARTMENT_DEFS,
  AGENT_DEPT_MAP,
  DEPT_TASK_OWNER_MAP,
  type DepartmentId,
} from "@/lib/agency/departments";
import { generateAllAutoTasks } from "@/lib/agency/orchestration/auto-tasks";
import { needsRevision } from "@/lib/agency/deliverables";
import { MOCK_INTEGRATIONS } from "@/lib/agency/integrations";

type TabId =
  | "overview"
  | "agent"
  | "prompt"
  | "tools"
  | "queue"
  | "deliverables"
  | "team"
  | "metrics";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "agent", label: "Configuração do Agente" },
  { id: "prompt", label: "Prompt & Instruções" },
  { id: "tools", label: "Ferramentas & Integrações" },
  { id: "queue", label: "Fila de Trabalho" },
  { id: "deliverables", label: "Entregas" },
  { id: "team", label: "Equipe Humana" },
  { id: "metrics", label: "Métricas" },
];

const DEPT_NAME_MAP: Record<string, string> = {
  project_management: "Gestão de Projetos",
  strategy: "Estratégia",
  brand_hub: "Brand Hub",
  social_media: "Social Media",
  design: "Design",
  paid_traffic: "Tráfego Pago",
  operations: "Operações & Sistema",
};

export default function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabId>("overview");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState(false);

  const store = useAgencyStore();
  const { deliverables, tasks, projects, materialRequests, strategyRooms, clients, departmentConfigs, saveDepartmentConfig } = store;

  const dept = DEPARTMENT_DEFS.find((d) => d.id === id);

  const autoTasks = useMemo(
    () => generateAllAutoTasks({ projects, clients, deliverables, tasks, materialRequests, strategyRooms }),
    [projects, clients, deliverables, tasks, materialRequests, strategyRooms]
  );

  if (!dept) {
    return (
      <div className="text-center py-20">
        <div className="text-[14px] text-[#9B9B95]">Departamento não encontrado.</div>
        <Link href="/agency/departments" className="mt-3 inline-block text-[13px] text-[#5B5BD6] hover:underline">
          ← Voltar para Departamentos
        </Link>
      </div>
    );
  }

  const savedConfig = departmentConfigs?.find((c) => c.departmentId === dept.id);
  const activePrompt = promptDraft ?? savedConfig?.currentPrompt ?? dept.defaultPrompt;

  // Deliverables for this dept
  const deptDelivs = deliverables.filter((d) => {
    const agentDept = AGENT_DEPT_MAP[d.ownerAgentId ?? ""];
    if (agentDept === dept.id) return true;
    if (
      (dept.id === "strategy" || dept.id === "project_management") &&
      ["document", "planning"].includes(d.type) &&
      !Object.keys(AGENT_DEPT_MAP).includes(d.ownerAgentId ?? "")
    )
      return true;
    return false;
  });

  // Work queue (auto-tasks for this dept)
  const deptOwner = DEPT_TASK_OWNER_MAP[dept.id as DepartmentId];
  const deptTasks = deptOwner ? autoTasks.filter((t) => t.owner === deptOwner) : [];

  // Connected integrations
  const connectedIntegrations = MOCK_INTEGRATIONS.filter((i) =>
    dept.connectedToolIds.includes(i.id)
  );

  const activeProjects = projects.filter((p) => p.stage !== "completed");

  // Metrics
  const metrics = {
    openTasks: deptTasks.length,
    pendingApprovals: deptDelivs.filter((d) => d.status === "in_review").length,
    pendingRevisions: deptDelivs.filter((d) => needsRevision(d)).length,
    deliverablesProduced: deptDelivs.length,
    approvedDeliverables: deptDelivs.filter((d) => d.status === "approved" || d.status === "delivered").length,
  };

  const activeDept = dept;

  function handleSavePrompt() {
    if (promptDraft !== null && saveDepartmentConfig) {
      saveDepartmentConfig(activeDept.id, { currentPrompt: promptDraft });
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 3000);
    }
  }

  function handleResetPrompt() {
    setPromptDraft(activeDept.defaultPrompt);
    if (saveDepartmentConfig) {
      saveDepartmentConfig(activeDept.id, { currentPrompt: activeDept.defaultPrompt });
    }
  }

  const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Crítico" },
    high: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Alto" },
    medium: { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]", label: "Médio" },
    low: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Baixo" },
  };

  const DELIVERABLE_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
    in_review: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Em revisão" },
    approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
    delivered: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Entregue" },
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/agency/departments"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Departamentos
        </Link>
      </div>

      <AgencyHeader
        title={dept.name}
        subtitle={dept.mission}
        meta={
          <div className="flex items-center gap-2 mt-1">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ backgroundColor: dept.accentBg, color: dept.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
              {dept.agentName}
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[#F0F0ED] text-[11px] text-[#6B6B65]">
              {savedConfig?.aiProvider ?? dept.aiProvider === "rule_based" ? "Regras locais" : (savedConfig?.aiProvider ?? dept.aiProvider)}
            </div>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-0.5 mb-6 overflow-x-auto border-b border-[#E8E8E3]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#5B5BD6] text-[#5B5BD6]"
                : "border-transparent text-[#6B6B65] hover:text-[#1A1A1A]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Tarefas abertas", value: metrics.openTasks, warn: metrics.openTasks > 3 },
              { label: "Aguardando aprovação", value: metrics.pendingApprovals, warn: metrics.pendingApprovals > 2 },
              { label: "Revisões abertas", value: metrics.pendingRevisions, warn: metrics.pendingRevisions > 0 },
              { label: "Entregas produzidas", value: metrics.deliverablesProduced },
              { label: "Entregas aprovadas", value: metrics.approvedDeliverables },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-[10px] border border-[#E8E8E3] px-4 py-3 text-center">
                <div className={`text-[24px] font-semibold ${s.warn && s.value > 0 ? "text-[#D97706]" : "text-[#1A1A1A]"}`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-[#9B9B95] mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Mission & Responsibilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Missão</h3>
              <p className="text-[13px] text-[#6B6B65] leading-relaxed">{dept.mission}</p>
            </div>
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Responsabilidades</h3>
              <ul className="space-y-1.5">
                {dept.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[#6B6B65]">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dept.color }} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Rules */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Regras Operacionais</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Regras</div>
                <ul className="space-y-1">
                  {dept.rules.map((r, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5">
                      <span className="text-[#16A34A] mt-0.5">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Ações proibidas</div>
                <ul className="space-y-1">
                  {dept.forbiddenActions.map((r, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5">
                      <span className="text-[#DC2626] mt-0.5">✗</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Escalada</div>
                <ul className="space-y-1">
                  {dept.escalationRules.map((r, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5">
                      <span className="text-[#D97706] mt-0.5">⚑</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "agent" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-4">Configuração do Agente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                  Agente Principal
                </label>
                <div className="flex items-center gap-2 p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                  <div className="w-8 h-8 rounded-[6px] flex items-center justify-center text-white text-[12px] font-bold"
                    style={{ backgroundColor: dept.color }}>
                    {dept.agentName.charAt(0)}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[#1A1A1A]">{dept.agentName}</div>
                    <div className="text-[11px] text-[#9B9B95]">{dept.primaryAgentId}</div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                  Provedor de IA
                </label>
                <div className="flex items-center gap-2 p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                  <div className="text-[13px] font-medium text-[#1A1A1A]">
                    {savedConfig?.aiProvider ?? dept.aiProvider === "rule_based" ? "Regras locais (sem IA externa)" : (savedConfig?.aiProvider ?? dept.aiProvider)}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                  Tipos de entrega gerenciados
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {dept.ownedDeliverableTypes.length > 0 ? dept.ownedDeliverableTypes.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-medium">
                      {t}
                    </span>
                  )) : (
                    <span className="text-[12px] text-[#9B9B95]">Nenhum tipo específico</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                  Roles com acesso
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {dept.ownerRoles.map((r) => (
                    <span key={r} className="px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-[10px] bg-[#F0F0ED] border border-[#E0E0DB]">
            <div className="text-[12px] text-[#6B6B65]">
              <strong className="text-[#1A1A1A]">V1 — Configuração mapeada.</strong>{" "}
              Configurações de provedor de IA por departamento estão disponíveis em{" "}
              <Link href="/agency/integrations" className="text-[#5B5BD6] hover:underline">
                Ferramentas & Integrações
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      {tab === "prompt" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Prompt & Instruções</h3>
                <p className="text-[12px] text-[#9B9B95] mt-0.5">
                  Define o comportamento e as regras deste agente para geração de conteúdo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetPrompt}
                  className="h-8 px-3 rounded-[7px] border border-[#E8E8E3] text-[12px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors"
                >
                  Restaurar padrão
                </button>
                <button
                  onClick={handleSavePrompt}
                  className="h-8 px-4 rounded-[7px] bg-[#5B5BD6] text-white text-[12px] font-medium hover:bg-[#4A4AC5] transition-colors"
                >
                  {promptSaved ? "Salvo ✓" : "Salvar"}
                </button>
              </div>
            </div>
            <textarea
              value={activePrompt}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={20}
              className="w-full p-4 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] font-mono leading-relaxed resize-y outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
            />
            {savedConfig?.promptUpdatedAt && (
              <div className="mt-2 text-[11px] text-[#9B9B95]">
                Última edição: {new Date(savedConfig.promptUpdatedAt).toLocaleString("pt-BR")}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "tools" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-4">Ferramentas & Integrações</h3>
            {connectedIntegrations.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-[13px] text-[#9B9B95]">Nenhuma ferramenta conectada a este departamento.</div>
                <Link href="/agency/integrations" className="mt-2 inline-block text-[12px] text-[#5B5BD6] hover:underline">
                  Configurar integrações →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {connectedIntegrations.map((integration) => (
                  <div key={integration.id} className="flex items-center justify-between p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div>
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{integration.name}</div>
                      <div className="text-[11px] text-[#9B9B95]">{integration.purpose}</div>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                      integration.status === "active" || integration.status === "configured"
                        ? "bg-[#DCFCE7] text-[#16A34A]"
                        : integration.status === "planned"
                        ? "bg-[#EEF0FF] text-[#5B5BD6]"
                        : "bg-[#F0F0ED] text-[#9B9B95]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        integration.status === "active" || integration.status === "configured"
                          ? "bg-[#16A34A]"
                          : integration.status === "planned"
                          ? "bg-[#5B5BD6]"
                          : "bg-[#9B9B95]"
                      }`} />
                      {integration.status === "active" ? "Ativo" :
                       integration.status === "configured" ? "Configurado" :
                       integration.status === "planned" ? "Planejado" : "Disponível"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 rounded-[10px] bg-[#EEF0FF] border border-[#C7C9F0]">
            <div className="text-[12px] text-[#5B5BD6]">
              Configure provedores de IA e ferramentas externas em{" "}
              <Link href="/agency/integrations" className="font-medium hover:underline">
                Ferramentas & Integrações
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      {tab === "queue" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">
              Fila de Trabalho
              {deptTasks.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D97706] text-white text-[10px] font-bold">
                  {deptTasks.length}
                </span>
              )}
            </h3>
            <Link href="/agency/tasks" className="text-[12px] text-[#5B5BD6] hover:underline">
              Ver Central de Tarefas →
            </Link>
          </div>

          {deptTasks.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] py-16 text-center">
              <div className="text-[32px] mb-3">✓</div>
              <div className="text-[14px] font-medium text-[#1A1A1A]">Fila vazia</div>
              <div className="text-[13px] text-[#9B9B95] mt-1">Nenhuma tarefa pendente para este departamento.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {deptTasks.map((task) => {
                const style = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.medium;
                return (
                  <div key={task.id} className="bg-white rounded-[10px] border border-[#E8E8E3] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                          <span className="text-[11px] text-[#9B9B95]">{task.projectName}</span>
                        </div>
                        <div className="text-[13px] font-medium text-[#1A1A1A]">{task.title}</div>
                        <div className="text-[12px] text-[#6B6B65] mt-0.5">{task.description}</div>
                      </div>
                      <Link
                        href={task.route}
                        className="shrink-0 h-7 px-3 rounded-[6px] bg-[#F7F7F6] border border-[#E8E8E3] text-[11px] text-[#6B6B65] hover:bg-[#F0F0ED] transition-colors inline-flex items-center"
                      >
                        Abrir
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "deliverables" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">
              Entregas ({deptDelivs.length})
            </h3>
            <Link href="/agency/deliverables" className="text-[12px] text-[#5B5BD6] hover:underline">
              Ver todas →
            </Link>
          </div>

          {deptDelivs.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] py-16 text-center">
              <div className="text-[13px] text-[#9B9B95]">Nenhuma entrega produzida por este departamento ainda.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {deptDelivs.slice().sort((a, b) => (b.updatedAt ?? b.createdAt) > (a.updatedAt ?? a.createdAt) ? 1 : -1).map((d) => {
                const style = DELIVERABLE_STATUS_STYLE[d.status] ?? DELIVERABLE_STATUS_STYLE.draft;
                const project = projects.find((p) => p.id === d.projectId);
                return (
                  <div key={d.id} className="bg-white rounded-[10px] border border-[#E8E8E3] p-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                        <span className="text-[11px] text-[#9B9B95]">{d.type}</span>
                        {needsRevision(d) && (
                          <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold bg-[#FEE2E2] text-[#DC2626]">
                            Revisão
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] font-medium text-[#1A1A1A] mt-1 truncate">{d.name}</div>
                      {project && (
                        <div className="text-[11px] text-[#9B9B95] mt-0.5">{project.name}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9B9B95] shrink-0">v{d.version ?? 1}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "team" && (
        <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-8 text-center">
          <div className="text-[32px] mb-3">👥</div>
          <h3 className="text-[16px] font-semibold text-[#1A1A1A] mb-2">Equipe Humana</h3>
          <p className="text-[13px] text-[#9B9B95] max-w-md mx-auto leading-relaxed">
            Placeholder para equipe humana do departamento. Em V2, esta seção permitirá
            associar usuários internos, definir responsabilidades e gerenciar aprovações por pessoa.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {dept.ownerRoles.map((r) => (
              <div key={r} className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                <div className="w-7 h-7 rounded-full bg-[#5B5BD6]/10 flex items-center justify-center text-[11px] font-semibold text-[#5B5BD6]">
                  {r.charAt(0).toUpperCase()}
                </div>
                <div className="text-[12px] text-[#6B6B65]">{r}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-[#9B9B95]">
            Roles com acesso a este departamento
          </div>
        </div>
      )}

      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Tarefas abertas", value: metrics.openTasks, icon: "📋" },
              { label: "Aguardando aprovação", value: metrics.pendingApprovals, icon: "⏳" },
              { label: "Revisões abertas", value: metrics.pendingRevisions, icon: "✏️" },
              { label: "Entregas produzidas", value: metrics.deliverablesProduced, icon: "📦" },
              { label: "Entregas aprovadas", value: metrics.approvedDeliverables, icon: "✅" },
              { label: "Projetos ativos", value: activeProjects.length, icon: "🚀" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-[12px] border border-[#E8E8E3] p-5 text-center">
                <div className="text-[24px] mb-1">{s.icon}</div>
                <div className="text-[28px] font-semibold text-[#1A1A1A]">{s.value}</div>
                <div className="text-[11px] text-[#9B9B95] mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-4">Taxa de aprovação</h3>
            {metrics.deliverablesProduced === 0 ? (
              <div className="text-[13px] text-[#9B9B95]">Nenhuma entrega produzida ainda.</div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-[#6B6B65]">Aprovadas / Total</span>
                  <span className="text-[13px] font-medium text-[#1A1A1A]">
                    {metrics.approvedDeliverables}/{metrics.deliverablesProduced} (
                    {Math.round((metrics.approvedDeliverables / metrics.deliverablesProduced) * 100)}%)
                  </span>
                </div>
                <div className="h-2 bg-[#F0F0ED] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#16A34A] rounded-full"
                    style={{
                      width: `${Math.round((metrics.approvedDeliverables / metrics.deliverablesProduced) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 rounded-[10px] bg-[#F0F0ED] border border-[#E0E0DB] text-[12px] text-[#6B6B65]">
            Métricas avançadas (tempo médio de aprovação, produtividade por período, comparativos) estarão disponíveis em V2.
          </div>
        </div>
      )}
    </div>
  );
}
