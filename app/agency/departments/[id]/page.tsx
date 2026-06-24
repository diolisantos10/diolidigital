"use client";

import { use, useState, useMemo, useCallback } from "react";
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
import { useDbAIRunLogs } from "@/lib/hooks/useDbAIRunLogs";
import { useAiProviderStatus } from "@/lib/hooks/useAiProviderStatus";
import { isOpenAIDepartment } from "@/lib/agency/intelligence/openai-schemas";
import {
  getBlueprint,
  getBlueprintCompleteness,
  WORK_ITEM_STATUS_META,
  type WorkItemStatus,
  type ReadinessStatus,
} from "@/lib/agency/department-blueprint";
import DeptModeSelector, { DeptModeBadge } from "@/components/agency/departments/DeptModeSelector";
import type { DepartmentOperationMode } from "@/store/agency-store";

const INTELLIGENCE_DEPTS = new Set([
  "strategy",
  "social-media",
  "project-management",
  "design",
  "paid-traffic",
  "brand-hub",
  "operations",
]);

const INTELLIGENCE_LABELS: Record<string, string> = {
  strategy: "Rodar Inteligência Estratégica",
  "social-media": "Rodar Inteligência Social",
  "project-management": "Rodar Inteligência de Gestão",
  design: "Rodar Inteligência de Design",
  "paid-traffic": "Rodar Inteligência de Tráfego",
  "brand-hub": "Rodar Auditoria de Marca",
  operations: "Rodar Inteligência Operacional",
};

// Per-dept upstream sources (displayed in Handoffs tab).
const DEPT_INTAKE_SOURCES: Record<string, string[]> = {
  design: ["Gestão de Projetos", "Estratégia", "Social Media", "Brand Hub"],
  "social-media": ["Gestão de Projetos", "Estratégia", "Brand Hub"],
  "paid-traffic": ["Gestão de Projetos", "Estratégia", "Design"],
  strategy: ["PM — Intake Central"],
  "brand-hub": ["Gestão de Projetos"],
  operations: ["Gestão de Projetos"],
  "project-management": [],
};

type TabId = "painel" | "queue" | "deliverables" | "handoffs" | "quality" | "tools" | "team" | "config";

const TABS: { id: TabId; label: string }[] = [
  { id: "painel", label: "Painel" },
  { id: "queue", label: "Fila de Trabalho" },
  { id: "deliverables", label: "Entregas" },
  { id: "handoffs", label: "Handoffs" },
  { id: "quality", label: "Qualidade" },
  { id: "tools", label: "Ferramentas" },
  { id: "team", label: "Equipe" },
  { id: "config", label: "Configuração" },
];

const ALL_WORK_STATUSES: WorkItemStatus[] = [
  "waiting_for_input",
  "ready_to_start",
  "in_progress",
  "waiting_review",
  "waiting_client_approval",
  "revision_requested",
  "completed",
  "blocked",
];

const DEPT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEPARTMENT_DEFS.map((d) => [d.id, d.name])
);
const otherDeptLabel = (id: string) =>
  id === "client" ? "Cliente" : id === "external" ? "Externo" : DEPT_LABEL_MAP[id] ?? id;

const READINESS_STYLE: Record<ReadinessStatus, { bg: string; text: string; label: string }> = {
  ready: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Pronto" },
  partial: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Parcial" },
  not_configured: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "A configurar" },
};

const STATUS_STYLE: Record<WorkItemStatus, { bg: string; text: string; border: string }> = {
  waiting_for_input: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", border: "border-[#FDE68A]" },
  ready_to_start: { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", border: "border-[#C4C9FF]" },
  in_progress: { bg: "bg-[#DBEAFE]", text: "text-[#1D4ED8]", border: "border-[#93C5FD]" },
  waiting_review: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", border: "border-[#FDE68A]" },
  waiting_client_approval: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", border: "border-[#FDE68A]" },
  revision_requested: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", border: "border-[#FCA5A5]" },
  completed: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", border: "border-[#86EFAC]" },
  blocked: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", border: "border-[#FCA5A5]" },
};

function NotConfigured({ section }: { section: string }) {
  return (
    <div className="bg-white rounded-[12px] border border-dashed border-[#D0D0CC] py-12 text-center">
      <div className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#F0F0ED] text-[#9B9B95] mb-2">
        A configurar
      </div>
      <div className="text-[13px] text-[#6B6B65] max-w-md mx-auto">
        A seção <strong>{section}</strong> ainda não foi configurada para este departamento.
        Será preenchida quando este departamento adotar o blueprint completo.
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-3">
      {title}
      {hint && <span className="ml-2 text-[11px] font-normal text-[#9B9B95]">{hint}</span>}
    </h3>
  );
}

function delivStatusToWorkStatus(status: string, hasRevision: boolean): WorkItemStatus {
  if (hasRevision) return "revision_requested";
  switch (status) {
    case "draft": return "in_progress";
    case "in_review": return "waiting_client_approval";
    case "approved":
    case "delivered": return "completed";
    default: return "in_progress";
  }
}

// AutoTask has no status field; derive lane from source.
function autoTaskToWorkStatus(source: string): WorkItemStatus {
  switch (source) {
    case "revision_queue": return "revision_requested";
    case "material_follow_up": return "waiting_for_input";
    case "review_pending": return "waiting_review";
    case "dependency_violation": return "blocked";
    case "execution_gap": return "in_progress";
    default: return "ready_to_start";
  }
}

export default function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabId>("painel");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState(false);
  const [intelligenceRunning, setIntelligenceRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const store = useAgencyStore();
  const {
    deliverables, tasks, projects, materialRequests, strategyRooms, clients,
    departmentConfigs, saveDepartmentConfig,
    aiRunLogs: storeRunLogs, runDepartmentIntelligenceWithProvider,
  } = store;

  const dbRunLogs = useDbAIRunLogs({ departmentId: id, limit: 50 });
  const { openaiConfigured } = useAiProviderStatus();

  const dept = DEPARTMENT_DEFS.find((d) => d.id === id);

  const autoTasks = useMemo(
    () => generateAllAutoTasks({ projects, clients, deliverables, tasks, materialRequests, strategyRooms }),
    [projects, clients, deliverables, tasks, materialRequests, strategyRooms]
  );

  if (!dept) {
    return (
      <div className="text-center py-20">
        <div className="text-[14px] text-[#9B9B95]">Departamento não encontrado.</div>
        <Link href="/agency/departments" className="mt-3 inline-block text-[13px] text-[#070A1F] hover:underline">
          ← Voltar para Departamentos
        </Link>
      </div>
    );
  }

  const activeDept = dept;
  const blueprint = getBlueprint(dept.id);
  const completeness = blueprint ? getBlueprintCompleteness(blueprint) : 0;
  const isPM = dept.id === "project-management";

  const savedConfig = departmentConfigs?.find((c) => c.departmentId === dept.id);
  const activePrompt = promptDraft ?? savedConfig?.currentPrompt ?? dept.defaultPrompt;
  const operationMode: DepartmentOperationMode = savedConfig?.operationMode ?? "hybrid";

  function handleModeChange(next: DepartmentOperationMode) {
    saveDepartmentConfig(id, { operationMode: next });
  }

  const deptDelivs = deliverables.filter((d) => {
    const agentDept = AGENT_DEPT_MAP[d.ownerAgentId ?? ""];
    if (agentDept === dept.id) return true;
    if (
      (dept.id === "strategy" || dept.id === "project-management") &&
      ["document", "planning"].includes(d.type) &&
      !Object.keys(AGENT_DEPT_MAP).includes(d.ownerAgentId ?? "")
    ) return true;
    return false;
  });

  const deptOwner = DEPT_TASK_OWNER_MAP[dept.id as DepartmentId];
  const deptTasks = deptOwner ? autoTasks.filter((t) => t.owner === deptOwner) : [];

  const connectedIntegrations = MOCK_INTEGRATIONS.filter((i) =>
    dept.connectedToolIds.includes(i.id)
  );

  const activeProjects = projects.filter((p) => p.stage !== "completed");

  const deptRunLogs = dbRunLogs.logs.length > 0
    ? dbRunLogs.logs
    : (storeRunLogs?.filter((l) => l.departmentId === dept.id) ?? []);
  const lastRun = lastRunId
    ? deptRunLogs.find((l) => l.id === lastRunId) ?? deptRunLogs[0]
    : deptRunLogs[0];

  // Store tasks (Task[]) have status; filter by agentId → dept.
  const deptStoreTasks = tasks.filter((t) => AGENT_DEPT_MAP[t.agentId] === dept.id);

  const metrics = {
    openTasks: deptTasks.length,
    blockedTasks: deptStoreTasks.filter((t) => t.status === "blocked").length,
    pendingApprovals: deptDelivs.filter((d) => d.status === "in_review").length,
    pendingRevisions: deptDelivs.filter((d) => needsRevision(d)).length,
    deliverablesProduced: deptDelivs.length,
    approvedDeliverables: deptDelivs.filter((d) => d.status === "approved" || d.status === "delivered").length,
  };

  const liveHealth = (() => {
    let score = 100;
    score -= metrics.pendingRevisions * 10;
    score -= Math.max(0, metrics.openTasks - 3) * 5;
    if (metrics.pendingApprovals > 4) score -= 10;
    score -= metrics.blockedTasks * 15;
    return Math.max(0, Math.min(100, score));
  })();
  const healthScore = Math.round((completeness + liveHealth) / 2);

  // Build unified Kanban card list from tasks + deliverables.
  type KanbanCard = {
    id: string;
    title: string;
    status: WorkItemStatus;
    priority: string;
    project?: string;
    type: "task" | "deliverable";
    route: string;
  };

  const kanbanCards: KanbanCard[] = [
    ...deptTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: autoTaskToWorkStatus(t.source),
      priority: t.priority,
      project: t.projectName,
      type: "task" as const,
      route: t.route,
    })),
    ...deptDelivs.map((d) => {
      const project = projects.find((p) => p.id === d.projectId);
      return {
        id: d.id,
        title: d.name,
        status: delivStatusToWorkStatus(d.status, needsRevision(d)),
        priority: "medium",
        project: project?.name,
        type: "deliverable" as const,
        route: `/agency/deliverables`,
      };
    }),
  ];

  const nextAction =
    metrics.blockedTasks > 0
      ? `Desbloquear ${metrics.blockedTasks} tarefa(s) — detalhar motivo e resolver dependência`
      : metrics.pendingRevisions > 0
      ? `Resolver ${metrics.pendingRevisions} revisão(ões) aberta(s)`
      : metrics.openTasks > 0
      ? `Atacar a fila: ${metrics.openTasks} tarefa(s) pendente(s)`
      : metrics.pendingApprovals > 0
      ? `Acompanhar ${metrics.pendingApprovals} aprovação(ões) do cliente`
      : "Sem ações urgentes — departamento saudável";

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

  const handleRunIntelligence = useCallback(async () => {
    setIntelligenceRunning(true);
    try {
      const logId = await runDepartmentIntelligenceWithProvider(activeDept.id);
      setLastRunId(logId);
      if (logId && dbRunLogs.source === "db") {
        const newLog = useAgencyStore.getState().aiRunLogs.find((l) => l.id === logId);
        if (newLog) dbRunLogs.save(newLog);
      }
    } finally {
      setIntelligenceRunning(false);
    }
  }, [activeDept.id, runDepartmentIntelligenceWithProvider, dbRunLogs]);

  const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Crítico" },
    high: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Alto" },
    medium: { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Médio" },
    low: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Baixo" },
  };

  const DELIVERABLE_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
    in_review: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Em revisão" },
    approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
    delivered: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Entregue" },
  };

  const selectedProvider = savedConfig?.aiProvider ?? activeDept.aiProvider;
  const isOpenAICapable = isOpenAIDepartment(activeDept.id);
  const usingOpenAI = isOpenAICapable && selectedProvider === "openai";

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
        subtitle={blueprint?.identity.mission ?? dept.mission}
        meta={
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ backgroundColor: dept.accentBg, color: dept.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
              {dept.agentName}
            </div>
            {blueprint && (
              <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium ${
                blueprint.maturity === "gold_standard" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEF3C7] text-[#D97706]"
              }`}>
                {blueprint.maturity === "gold_standard" ? "★ Blueprint completo" : `Blueprint ${completeness}%`}
              </div>
            )}
            <DeptModeBadge mode={operationMode} />
          </div>
        }
        actions={
          dept.generatorRoute ? (
            <Link
              href={dept.generatorRoute}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-[8px] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: dept.color }}
            >
              {dept.generatorLabel ?? "Abrir ferramenta"}
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M3 6.5h7M7 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ) : undefined
        }
      />

      {/* ── Operation mode selector ─────────────────────────────────────────── */}
      <DeptModeSelector
        mode={operationMode}
        onChange={handleModeChange}
        deptColor={dept.color}
      />

      {/* Tabs */}
      <div className="flex gap-0.5 mb-6 overflow-x-auto border-b border-[#E8E8E3]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#070A1F] text-[#070A1F]"
                : "border-transparent text-[#6B6B65] hover:text-[#1A1A1A]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Painel (Operational Control Room) ────────────────────────────────── */}
      {tab === "painel" && (
        <div className="space-y-6">
          {/* PM: Central Intake banner */}
          {isPM && (
            <div className="rounded-[12px] border p-5" style={{ backgroundColor: dept.accentBg, borderColor: `${dept.color}33` }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: dept.color }}>
                Entrada Central de Demandas
              </div>
              <div className="text-[14px] font-semibold text-[#1A1A1A] mb-1">
                Todas as demandas entram pela Gestão de Projetos.
              </div>
              <div className="text-[13px] text-[#6B6B65] leading-relaxed mb-4">
                O PM qualifica, cria o projeto e distribui para os departamentos. Nenhum departamento recebe demanda diretamente do cliente — toda demanda passa por aqui primeiro.
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/agency/production/new"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-white text-[12px] font-medium hover:opacity-90"
                  style={{ backgroundColor: dept.color }}
                >
                  Nova Demanda
                </Link>
                <Link
                  href="/agency/production/new"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] border text-[12px] font-medium hover:opacity-80 bg-white"
                  style={{ color: dept.color, borderColor: dept.color }}
                >
                  Criar Linha de Produção
                </Link>
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Trabalho ativo", value: metrics.openTasks, warn: metrics.openTasks > 3 },
              { label: "Bloqueado", value: metrics.blockedTasks, warn: metrics.blockedTasks > 0 },
              { label: "Em revisão", value: metrics.pendingApprovals, warn: metrics.pendingApprovals > 4 },
              { label: "Revisões abertas", value: metrics.pendingRevisions, warn: metrics.pendingRevisions > 0 },
              { label: "Entregas produzidas", value: metrics.deliverablesProduced },
              { label: "Entregas aprovadas", value: metrics.approvedDeliverables, good: metrics.approvedDeliverables > 0 },
              { label: "Projetos ativos", value: activeProjects.length },
              { label: "Saúde do dept.", value: `${healthScore}%`, good: healthScore >= 75, warn: healthScore < 75 },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-[10px] border border-[#E8E8E3] px-4 py-3 text-center">
                <div className={`text-[22px] font-semibold ${
                  ("good" in s && s.good) ? "text-[#16A34A]"
                  : ("warn" in s && s.warn && (typeof s.value === "number" ? s.value > 0 : true)) ? "text-[#D97706]"
                  : "text-[#1A1A1A]"
                }`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-[#9B9B95] mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Next recommended action */}
          <div
            className="flex items-center justify-between gap-3 p-4 rounded-[12px] border"
            style={{ backgroundColor: dept.accentBg, borderColor: `${dept.color}33` }}
          >
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: dept.color }}>
                Próxima ação recomendada
              </div>
              <div className="text-[13px] text-[#1A1A1A] mt-0.5">{nextAction}</div>
            </div>
            <button
              onClick={() => setTab("queue")}
              className="shrink-0 h-9 px-4 rounded-[8px] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: dept.color }}
            >
              Ver fila →
            </button>
          </div>

          {/* Active projects table */}
          {activeProjects.length > 0 && (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Projetos ativos" hint="derivado dos dados atuais" />
              <div className="space-y-2">
                {activeProjects.slice(0, 6).map((p) => {
                  const client = clients.find((c) => c.id === p.clientId);
                  const deptDelivCount = deptDelivs.filter((d) => d.projectId === p.id).length;
                  const revCount = deptDelivs.filter((d) => d.projectId === p.id && needsRevision(d)).length;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[#1A1A1A] truncate">{p.name}</div>
                        {client && <div className="text-[11px] text-[#9B9B95]">{client.name}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[12px] font-medium text-[#1A1A1A]">{deptDelivCount} entrega(s)</div>
                        {revCount > 0 && (
                          <div className="text-[10px] text-[#DC2626]">{revCount} revisão(ões)</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Identity summary */}
          {blueprint && (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Identidade do departamento" />
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { k: "Missão", v: blueprint.identity.mission },
                  { k: "Papel na agência", v: blueprint.identity.roleInAgency },
                  { k: "O que é sucesso", v: blueprint.identity.successDefinition },
                  { k: "Propósito de negócio", v: blueprint.identity.businessPurpose },
                ].map((row) => (
                  <div key={row.k}>
                    <dt className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-0.5">{row.k}</dt>
                    <dd className="text-[13px] text-[#6B6B65] leading-relaxed">{row.v}</dd>
                  </div>
                ))}
              </dl>
              {blueprint.maturity !== "gold_standard" && (
                <div className="mt-4 p-3 rounded-[8px] bg-[#FEF3C7] border border-[#FDE68A] text-[11px] text-[#92400E]">
                  Este departamento usa o shell do blueprint. Seções marcadas como "A configurar" serão preenchidas ao promover para padrão-ouro (referência: Design).
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Fila de Trabalho (Kanban) ─────────────────────────────────────────── */}
      {tab === "queue" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">
              Kanban — Fila de Trabalho
              <span className="ml-2 text-[12px] font-normal text-[#9B9B95]">
                {kanbanCards.length} {kanbanCards.length === 1 ? "item" : "itens"} · derivado dos dados atuais
              </span>
            </h3>
            <Link href="/agency/tasks" className="text-[12px] text-[#070A1F] hover:underline">
              Central de Tarefas →
            </Link>
          </div>

          {dept.generatorRoute && (
            <div
              className="flex items-center justify-between gap-3 p-4 rounded-[10px] mb-5 border"
              style={{ backgroundColor: dept.accentBg, borderColor: `${dept.color}33` }}
            >
              <div>
                <div className="text-[12px] font-semibold" style={{ color: dept.color }}>Produzir neste departamento</div>
                <div className="text-[12px] text-[#6B6B65] mt-0.5">Use a ferramenta dedicada para gerar novas entregas.</div>
              </div>
              <Link
                href={dept.generatorRoute}
                className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-[8px] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: dept.color }}
              >
                {dept.generatorLabel ?? "Abrir ferramenta"}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            </div>
          )}

          {/* 8-lane Kanban board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3" style={{ minWidth: "1200px" }}>
              {ALL_WORK_STATUSES.map((status) => {
                const meta = WORK_ITEM_STATUS_META[status];
                const style = STATUS_STYLE[status];
                const cards = kanbanCards.filter((c) => c.status === status);
                return (
                  <div key={status} className="flex-1">
                    {/* Lane header */}
                    <div className={`mb-2 px-2.5 py-2 rounded-[8px] border ${style.bg} ${style.border}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wide leading-tight ${style.text}`}>
                        {meta.label}
                      </div>
                      <div className="text-[13px] font-semibold text-[#1A1A1A] mt-0.5">{cards.length}</div>
                    </div>
                    {/* Cards */}
                    <div className="space-y-1.5">
                      {cards.length === 0 ? (
                        <div className="border border-dashed border-[#E8E8E3] rounded-[8px] py-5 text-center">
                          <div className="text-[10px] text-[#9B9B95]">Vazio</div>
                        </div>
                      ) : (
                        cards.map((card) => {
                          const pStyle = PRIORITY_STYLE[card.priority] ?? PRIORITY_STYLE.medium;
                          return (
                            <Link
                              key={card.id}
                              href={card.route}
                              className="block bg-white rounded-[8px] border border-[#E8E8E3] p-2.5 hover:border-[#070A1F] transition-colors"
                            >
                              <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                                <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold ${pStyle.bg} ${pStyle.text}`}>
                                  {pStyle.label}
                                </span>
                                <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-medium ${
                                  card.type === "task" ? "bg-[#E6FBFA] text-[#070A1F]" : "bg-[#F0F0ED] text-[#6B6B65]"
                                }`}>
                                  {card.type === "task" ? "Tarefa" : "Entrega"}
                                </span>
                              </div>
                              <div className="text-[11px] font-medium text-[#1A1A1A] leading-tight line-clamp-2">
                                {card.title}
                              </div>
                              {card.project && (
                                <div className="text-[10px] text-[#9B9B95] mt-1 truncate">{card.project}</div>
                              )}
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Entregas ─────────────────────────────────────────────────────────── */}
      {tab === "deliverables" && (
        <div className="space-y-4">
          {blueprint?.deliverables && (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Tipos de entrega & critérios de aceite" />
              <div className="space-y-3">
                {blueprint.deliverables.types.map((t, i) => (
                  <div key={i} className="p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-medium text-[#1A1A1A]">{t.label}</span>
                      <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-medium bg-[#E6FBFA] text-[#070A1F]">{t.outputFormat}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.acceptanceCriteria.map((c, j) => (
                        <span key={j} className="text-[10px] text-[#6B6B65]">✓ {c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Regras de revisão</div>
                  <ul className="space-y-1">
                    {blueprint.deliverables.reviewRules.map((r, i) => (
                      <li key={i} className="text-[12px] text-[#6B6B65]">• {r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Fluxo de aprovação</div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#6B6B65]">
                    {blueprint.deliverables.approvalFlow.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#F0F0ED]">{s}</span>
                        {i < blueprint.deliverables!.approvalFlow.length - 1 && <span>→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">
              Entregas produzidas ({deptDelivs.length})
            </h3>
            <Link href="/agency/deliverables" className="text-[12px] text-[#070A1F] hover:underline">Ver todas →</Link>
          </div>

          {deptDelivs.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] py-16 text-center">
              <div className="text-[13px] text-[#9B9B95]">Nenhuma entrega produzida por este departamento ainda.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {deptDelivs
                .slice()
                .sort((a, b) => ((b.updatedAt ?? b.createdAt) > (a.updatedAt ?? a.createdAt) ? 1 : -1))
                .map((d) => {
                  const style = DELIVERABLE_STATUS_STYLE[d.status] ?? DELIVERABLE_STATUS_STYLE.draft;
                  const project = projects.find((p) => p.id === d.projectId);
                  return (
                    <div key={d.id} className="bg-white rounded-[10px] border border-[#E8E8E3] p-4 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
                          <span className="text-[11px] text-[#9B9B95]">{d.type}</span>
                          {needsRevision(d) && (
                            <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold bg-[#FEE2E2] text-[#DC2626]">Revisão</span>
                          )}
                        </div>
                        <div className="text-[13px] font-medium text-[#1A1A1A] mt-1 truncate">{d.name}</div>
                        {project && <div className="text-[11px] text-[#9B9B95] mt-0.5">{project.name}</div>}
                      </div>
                      <div className="text-[11px] text-[#9B9B95] shrink-0">v{d.version ?? 1}</div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Handoffs ─────────────────────────────────────────────────────────── */}
      {tab === "handoffs" && (
        <div className="space-y-6">
          {/* How this dept receives work */}
          {isPM ? (
            <div className="p-4 rounded-[12px] bg-[#E6FBFA] border border-[#C4C9FF]">
              <div className="text-[11px] font-bold text-[#070A1F] uppercase tracking-wide mb-1">Gestão de Projetos = Intake Central</div>
              <div className="text-[13px] text-[#1A1A1A]">
                Todas as demandas entram pela Gestão de Projetos. O PM qualifica e distribui para os departamentos de execução. Nenhum departamento recebe demanda diretamente do cliente.
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-[12px] border border-[#E8E8E3] bg-[#F7F7F6]">
              <div className="text-[11px] font-bold text-[#9B9B95] uppercase tracking-wide mb-1">
                Como este departamento recebe trabalho
              </div>
              <div className="text-[13px] text-[#6B6B65] mb-2">
                Este departamento recebe demandas qualificadas pela{" "}
                <strong className="text-[#1A1A1A]">Gestão de Projetos</strong>.
                Não há intake direto de clientes.
              </div>
              {(DEPT_INTAKE_SOURCES[dept.id]?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[#9B9B95]">Recebe de:</span>
                  {DEPT_INTAKE_SOURCES[dept.id].map((src) => (
                    <span key={src} className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-white border border-[#E8E8E3] text-[#1A1A1A]">
                      {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {blueprint?.handoffs ? (
            <>
              <div>
                <SectionTitle title="Recebe de" hint="Entradas que destravam o trabalho" />
                {blueprint.handoffs.receives.length === 0 ? (
                  <div className="text-[12px] text-[#9B9B95]">Nenhum handoff de entrada mapeado.</div>
                ) : (
                  <div className="space-y-3">
                    {blueprint.handoffs.receives.map((h, i) => (
                      <div key={i} className="bg-white rounded-[12px] border border-[#E8E8E3] p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[13px] font-semibold text-[#1A1A1A]">{otherDeptLabel(h.otherDeptId)}</span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9B9B95]">
                            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="text-[13px] font-semibold" style={{ color: dept.color }}>{dept.name}</span>
                        </div>
                        <div className="text-[11px] text-[#9B9B95] mb-2">Gatilho: {h.trigger}</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {h.artifacts.map((a, j) => (
                            <span key={j} className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#F0F0ED] text-[#6B6B65]">{a}</span>
                          ))}
                        </div>
                        <div className="text-[11px] text-[#6B6B65]">
                          <span className="font-medium text-[#1A1A1A]">Checklist de qualidade:</span> {h.qualityChecklist.join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SectionTitle title="Envia para" hint="Saídas repassadas adiante" />
                {blueprint.handoffs.sends.length === 0 ? (
                  <div className="text-[12px] text-[#9B9B95]">Nenhum handoff de saída mapeado.</div>
                ) : (
                  <div className="space-y-3">
                    {blueprint.handoffs.sends.map((h, i) => (
                      <div key={i} className="bg-white rounded-[12px] border border-[#E8E8E3] p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[13px] font-semibold" style={{ color: dept.color }}>{dept.name}</span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9B9B95]">
                            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="text-[13px] font-semibold text-[#1A1A1A]">{otherDeptLabel(h.otherDeptId)}</span>
                        </div>
                        <div className="text-[11px] text-[#9B9B95] mb-2">Gatilho: {h.trigger}</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {h.artifacts.map((a, j) => (
                            <span key={j} className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${dept.color}18`, color: dept.color }}>{a}</span>
                          ))}
                        </div>
                        <div className="text-[11px] text-[#6B6B65]">
                          <span className="font-medium text-[#1A1A1A]">Checklist de qualidade:</span> {h.qualityChecklist.join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <NotConfigured section="Handoffs" />
          )}
        </div>
      )}

      {/* ── Qualidade ────────────────────────────────────────────────────────── */}
      {tab === "quality" && (
        blueprint?.quality ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Antes de iniciar", items: blueprint.quality.beforeStart },
                { title: "Antes de entregar", items: blueprint.quality.beforeDelivery },
                { title: "Antes do handoff", items: blueprint.quality.beforeHandoff },
              ].map((col) => (
                <div key={col.title} className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                  <SectionTitle title={col.title} />
                  <ul className="space-y-2">
                    {col.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <div className="w-4 h-4 mt-0.5 shrink-0 rounded border-2 border-[#D0D0CC] bg-white" />
                        <span className="text-[12px] text-[#1A1A1A]">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#FFFBEB] rounded-[12px] border border-[#FDE68A] p-5">
                <SectionTitle title="Pontos comuns de falha" />
                <ul className="space-y-1.5">
                  {blueprint.quality.commonFailurePoints.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#92400E] flex items-start gap-1.5"><span className="mt-0.5">✗</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Modelo de score de qualidade" />
                <p className="text-[12px] text-[#6B6B65] leading-relaxed">{blueprint.quality.qualityScoreModel}</p>
              </div>
            </div>
          </div>
        ) : <NotConfigured section="Qualidade" />
      )}

      {/* ── Ferramentas ──────────────────────────────────────────────────────── */}
      {tab === "tools" && (
        <div className="space-y-4">
          {blueprint?.tools && (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Categorias de ferramentas" hint="Por categoria — sem integração real ainda" />
              <div className="space-y-2.5">
                {blueprint.tools.categories.map((c, i) => {
                  const rs = READINESS_STYLE[c.readiness];
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#1A1A1A]">{c.category}</span>
                          {c.required && <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-[#FEE2E2] text-[#DC2626]">Obrigatório</span>}
                        </div>
                        <div className="text-[11px] text-[#9B9B95]">{c.examples.join(", ")}</div>
                      </div>
                      <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium ${rs.bg} ${rs.text}`}>{rs.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Integrações conectadas" />
            {connectedIntegrations.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-[13px] text-[#9B9B95]">Nenhuma ferramenta conectada a este departamento.</div>
                <Link href="/agency/integrations" className="mt-2 inline-block text-[12px] text-[#070A1F] hover:underline">
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
                        ? "bg-[#E6FBFA] text-[#070A1F]"
                        : "bg-[#F0F0ED] text-[#9B9B95]"
                    }`}>
                      {integration.status === "active" ? "Ativo"
                        : integration.status === "configured" ? "Configurado"
                        : integration.status === "planned" ? "Planejado"
                        : "Disponível"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Equipe ───────────────────────────────────────────────────────────── */}
      {tab === "team" && (
        blueprint?.people ? (
          <div className="space-y-4">
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Funções humanas (futuro)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {blueprint.people.roles.map((r, i) => (
                  <div key={i} className="p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="text-[13px] font-semibold text-[#1A1A1A] mb-1.5">{r.title}</div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Responsabilidades</div>
                    <ul className="mb-1.5">
                      {r.responsibilities.map((x, j) => <li key={j} className="text-[11px] text-[#6B6B65]">• {x}</li>)}
                    </ul>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Permissões</div>
                    <ul>
                      {r.permissions.map((x, j) => <li key={j} className="text-[11px] text-[#6B6B65]">• {x}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Regras de takeover" />
                <ul className="space-y-1.5">
                  {blueprint.people.takeoverRules.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5">
                      <span className="text-[#D97706] mt-0.5">⚑</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Colaboração IA × humano" />
                <ul className="space-y-1.5">
                  {blueprint.people.aiHumanCollaboration.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5">
                      <span className="text-[#070A1F] mt-0.5">↔</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Roles com acesso (atual)" />
              <div className="flex flex-wrap gap-2">
                {dept.ownerRoles.map((r) => (
                  <div key={r} className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="w-7 h-7 rounded-full bg-[#070A1F]/10 flex items-center justify-center text-[11px] font-semibold text-[#070A1F]">
                      {r.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-[12px] text-[#6B6B65]">{r}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <NotConfigured section="Equipe" />
      )}

      {/* ── Configuração ─────────────────────────────────────────────────────── */}
      {tab === "config" && (
        <div className="space-y-6">
          {/* How this dept receives work (intake info moved here) */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Como este departamento recebe trabalho" />
            {isPM ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[#6B6B65] leading-relaxed">
                  A Gestão de Projetos é o ponto de entrada central. Todas as demandas chegam aqui primeiro — o PM qualifica, prioriza e distribui para os departamentos de execução.
                </p>
                <div className="p-3 rounded-[8px] bg-[#E6FBFA] border border-[#C4C9FF] text-[12px] text-[#070A1F]">
                  ↳ Nenhum departamento recebe demanda diretamente do cliente. Toda demanda passa pelo PM.
                </div>
              </div>
            ) : blueprint?.intake ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[#6B6B65] leading-relaxed">{blueprint.intake.howDemandArrives}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                      Informações obrigatórias
                    </div>
                    <ul className="space-y-1.5">
                      {blueprint.intake.requiredInformation.map((f, i) => (
                        <li key={i} className="text-[12px]">
                          <span className="font-medium text-[#1A1A1A]">{f.label}</span>
                          <span className="block text-[11px] text-[#6B6B65]">{f.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">
                      Se faltar informação
                    </div>
                    <p className="text-[12px] text-[#6B6B65]">{blueprint.intake.missingInformationBehavior}</p>
                    <div className="mt-3">
                      <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Score de input</div>
                      <p className="text-[11px] text-[#6B6B65]">{blueprint.intake.inputQualityScoreModel}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-[#6B6B65]">
                Este departamento recebe demandas qualificadas pela Gestão de Projetos.
                {(DEPT_INTAKE_SOURCES[dept.id]?.length ?? 0) > 0 &&
                  ` Fontes: ${DEPT_INTAKE_SOURCES[dept.id].join(", ")}.`}
              </p>
            )}
          </div>

          {/* Full-human mode banner — shown instead of intelligence runner */}
          {operationMode === "full_human" && (
            <div className="rounded-[12px] border border-[#FDE68A] bg-[#FEF3C7] px-5 py-4 flex items-start gap-3">
              <span className="text-[20px] shrink-0 mt-0.5">👤</span>
              <div>
                <div className="text-[13px] font-semibold text-[#92400E] mb-0.5">Modo 100% Humano ativo</div>
                <p className="text-[12px] text-[#92400E]/80 leading-relaxed">
                  A IA está desligada para este departamento. O trabalho é realizado e registrado manualmente.
                  Altere o modo de operação acima para reativar a inteligência.
                </p>
              </div>
            </div>
          )}

          {/* Full-AI mode banner — notify that deliveries are auto-approved */}
          {operationMode === "full_ai" && (
            <div className="rounded-[12px] border border-[#9AF5F0] bg-[#E6FBFA] px-5 py-4 flex items-start gap-3">
              <span className="text-[18px] shrink-0 mt-0.5">✦</span>
              <div>
                <div className="text-[13px] font-semibold text-[#070A1F] mb-0.5">Modo Autônomo IA ativo</div>
                <p className="text-[12px] text-[#070A1F]/70 leading-relaxed">
                  Entregas deste departamento são aprovadas automaticamente e registradas para auditoria.
                  Revise periodicamente em <strong>Qualidade</strong> para garantir padrão.
                </p>
              </div>
            </div>
          )}

          {/* Intelligence runner */}
          {INTELLIGENCE_DEPTS.has(activeDept.id) && operationMode !== "full_human" && (
            <div className="rounded-[12px] border p-5" style={{ backgroundColor: activeDept.accentBg, borderColor: `${activeDept.color}33` }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: activeDept.color }}>✦</div>
                    <h3 className="text-[13px] font-semibold" style={{ color: activeDept.color }}>Intelligence Mode</h3>
                    {usingOpenAI ? (
                      openaiConfigured === false ? (
                        <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">OpenAI — chave ausente</span>
                      ) : openaiConfigured === true ? (
                        <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#DCFCE7] text-[#16A34A]">OpenAI configurado</span>
                      ) : (
                        <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#F0F0ED] text-[#6B6B65]">OpenAI selecionado</span>
                      )
                    ) : (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${activeDept.color}22`, color: activeDept.color }}>Regras locais</span>
                    )}
                    {lastRun?.fallbackUsed && (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#D97706]">Fallback ativo</span>
                    )}
                  </div>
                  {lastRun ? (
                    <div className="space-y-1.5">
                      <div className="text-[12px] text-[#6B6B65]">
                        <strong>Último run:</strong> {new Date(lastRun.createdAt).toLocaleString("pt-BR")} —{" "}
                        <span className={lastRun.status === "success" ? "text-[#16A34A]" : lastRun.status === "fallback" ? "text-[#D97706]" : "text-[#DC2626]"}>
                          {lastRun.status === "success"
                            ? `Sucesso via ${lastRun.provider === "openai" ? `OpenAI (${lastRun.model})` : "regras locais"}`
                            : lastRun.status === "fallback" ? "Fallback (regras locais)" : "Erro"}
                        </span>
                      </div>
                      {lastRun.fallbackUsed && lastRun.fallbackReason && (
                        <div className="text-[11px] text-[#92400E]">Motivo do fallback: {lastRun.fallbackReason}</div>
                      )}
                      <p className="text-[12px] text-[#6B6B65] leading-relaxed line-clamp-2">{lastRun.outputSummary}</p>
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#6B6B65]">Nenhum run registrado. Execute a inteligência para gerar análise.</p>
                  )}
                </div>
                <button
                  onClick={handleRunIntelligence}
                  disabled={intelligenceRunning}
                  className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-[8px] text-white text-[12px] font-medium transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: activeDept.color }}
                >
                  {intelligenceRunning ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Executando...</>
                  ) : (INTELLIGENCE_LABELS[activeDept.id] ?? "Rodar Inteligência")}
                </button>
              </div>
            </div>
          )}

          {/* Agent config */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Configuração do agente" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Provedor de IA</label>
                {isOpenAICapable ? (
                  <select
                    value={selectedProvider}
                    onChange={(e) => saveDepartmentConfig(activeDept.id, { aiProvider: e.target.value, model: e.target.value })}
                    className="w-full p-3 rounded-[8px] bg-white border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#070A1F]"
                  >
                    <option value="rule_based">Regras locais (sem IA externa)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                ) : (
                  <div className="p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3] text-[13px] text-[#1A1A1A]">
                    {(savedConfig?.aiProvider ?? dept.aiProvider) === "rule_based"
                      ? "Regras locais (sem IA externa)"
                      : (savedConfig?.aiProvider ?? dept.aiProvider)}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Prompt do agente</label>
                <div className="flex gap-2">
                  <button onClick={handleResetPrompt} className="h-9 px-3 rounded-[7px] border border-[#E8E8E3] text-[12px] text-[#6B6B65] hover:bg-[#F7F7F6]">Restaurar</button>
                  <button onClick={handleSavePrompt} className="h-9 px-4 rounded-[7px] bg-[#070A1F] text-white text-[12px] font-medium hover:bg-[#0D1230]">
                    {promptSaved ? "Salvo ✓" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
            <textarea
              value={activePrompt}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={10}
              className="w-full p-4 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] font-mono leading-relaxed resize-y outline-none focus:border-[#070A1F]"
            />
          </div>

          {/* Audit trail + run log */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Trilha de auditoria" />
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(blueprint?.history.tracks ?? [
                "Log de atividade do departamento",
                "Histórico de versões das entregas",
                "Registros de aprovação e revisão",
                "Registros de handoff entre departamentos",
              ]).map((t, i) => (
                <span key={i} className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#F0F0ED] text-[#6B6B65]">{t}</span>
              ))}
            </div>
            {deptRunLogs.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Últimos runs de inteligência</div>
                <div className="space-y-2">
                  {deptRunLogs.slice(0, 5).map((l) => (
                    <div key={l.id} className="flex items-start justify-between gap-3 p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                      <div className="min-w-0">
                        <div className="text-[12px] text-[#1A1A1A]">{l.outputSummary}</div>
                        <div className="text-[10px] text-[#9B9B95] mt-0.5">
                          {new Date(l.createdAt).toLocaleString("pt-BR")} · {l.provider}
                        </div>
                      </div>
                      <span className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium ${
                        l.status === "success" ? "bg-[#DCFCE7] text-[#16A34A]"
                        : l.status === "fallback" ? "bg-[#FEF3C7] text-[#D97706]"
                        : "bg-[#FEE2E2] text-[#DC2626]"
                      }`}>
                        {l.status === "success" ? "Sucesso" : l.status === "fallback" ? "Fallback" : "Erro"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
