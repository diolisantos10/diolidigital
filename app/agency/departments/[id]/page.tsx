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
  type ReadinessStatus,
} from "@/lib/agency/department-blueprint";

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

type TabId =
  | "overview"
  | "intake"
  | "queue"
  | "execution"
  | "deliverables"
  | "handoffs"
  | "intelligence"
  | "tools"
  | "people"
  | "quality"
  | "history"
  | "metrics";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "intake", label: "Intake" },
  { id: "queue", label: "Fila de Trabalho" },
  { id: "execution", label: "Execução" },
  { id: "deliverables", label: "Entregas" },
  { id: "handoffs", label: "Handoffs" },
  { id: "intelligence", label: "Inteligência" },
  { id: "tools", label: "Ferramentas" },
  { id: "people", label: "Pessoas" },
  { id: "quality", label: "Qualidade" },
  { id: "history", label: "Histórico" },
  { id: "metrics", label: "Métricas" },
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

// Small shared "A configurar" placeholder.
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

export default function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabId>("overview");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState(false);
  const [intelligenceRunning, setIntelligenceRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const store = useAgencyStore();
  const { deliverables, tasks, projects, materialRequests, strategyRooms, clients, departmentConfigs, saveDepartmentConfig, aiRunLogs: storeRunLogs, runDepartmentIntelligenceWithProvider } = store;
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
        <Link href="/agency/departments" className="mt-3 inline-block text-[13px] text-[#5B5BD6] hover:underline">
          ← Voltar para Departamentos
        </Link>
      </div>
    );
  }

  const activeDept = dept;
  const blueprint = getBlueprint(dept.id);
  const completeness = blueprint ? getBlueprintCompleteness(blueprint) : 0;

  const savedConfig = departmentConfigs?.find((c) => c.departmentId === dept.id);
  const activePrompt = promptDraft ?? savedConfig?.currentPrompt ?? dept.defaultPrompt;

  const deptDelivs = deliverables.filter((d) => {
    const agentDept = AGENT_DEPT_MAP[d.ownerAgentId ?? ""];
    if (agentDept === dept.id) return true;
    if (
      (dept.id === "strategy" || dept.id === "project-management") &&
      ["document", "planning"].includes(d.type) &&
      !Object.keys(AGENT_DEPT_MAP).includes(d.ownerAgentId ?? "")
    )
      return true;
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

  const metrics = {
    openTasks: deptTasks.length,
    pendingApprovals: deptDelivs.filter((d) => d.status === "in_review").length,
    pendingRevisions: deptDelivs.filter((d) => needsRevision(d)).length,
    deliverablesProduced: deptDelivs.length,
    approvedDeliverables: deptDelivs.filter((d) => d.status === "approved" || d.status === "delivered").length,
  };

  // Health/readiness score: blend of blueprint completeness and live blockers.
  const liveHealth = (() => {
    let score = 100;
    score -= metrics.pendingRevisions * 10;
    score -= Math.max(0, metrics.openTasks - 3) * 5;
    if (metrics.pendingApprovals > 4) score -= 10;
    return Math.max(0, Math.min(100, score));
  })();
  const healthScore = Math.round((completeness + liveHealth) / 2);

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
    medium: { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]", label: "Médio" },
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

  // Next recommended action (operations-room style).
  const nextAction =
    metrics.pendingRevisions > 0
      ? `Resolver ${metrics.pendingRevisions} revisão(ões) aberta(s)`
      : metrics.openTasks > 0
      ? `Atacar a fila: ${metrics.openTasks} tarefa(s) pendente(s)`
      : metrics.pendingApprovals > 0
      ? `Acompanhar ${metrics.pendingApprovals} aprovação(ões) do cliente`
      : "Sem ações urgentes — departamento saudável";

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
          <div className="flex items-center gap-2 mt-1">
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

      {/* ── Overview (Department Dashboard) ──────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Dashboard cards — live operations room */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Trabalho ativo", value: metrics.openTasks, warn: metrics.openTasks > 3 },
              { label: "Bloqueado", value: 0 },
              { label: "Em revisão", value: metrics.pendingApprovals, warn: metrics.pendingApprovals > 4 },
              { label: "Aguardando aprovação", value: metrics.pendingApprovals },
              { label: "Entregas produzidas", value: metrics.deliverablesProduced },
              { label: "Problemas de qualidade", value: metrics.pendingRevisions, warn: metrics.pendingRevisions > 0 },
              { label: "Entregas aprovadas", value: metrics.approvedDeliverables },
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

          {/* Identity */}
          {blueprint && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Identidade do departamento" />
                <dl className="space-y-3">
                  {[
                    { k: "Missão", v: blueprint.identity.mission },
                    { k: "Papel na agência", v: blueprint.identity.roleInAgency },
                    { k: "Propósito de negócio", v: blueprint.identity.businessPurpose },
                    { k: "O que é sucesso", v: blueprint.identity.successDefinition },
                  ].map((row) => (
                    <div key={row.k}>
                      <dt className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-0.5">{row.k}</dt>
                      <dd className="text-[13px] text-[#6B6B65] leading-relaxed">{row.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Responsabilidades" />
                <ul className="space-y-1.5">
                  {dept.responsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[#6B6B65]">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dept.color }} />
                      {r}
                    </li>
                  ))}
                </ul>
                {blueprint.maturity !== "gold_standard" && (
                  <div className="mt-4 p-3 rounded-[8px] bg-[#FEF3C7] border border-[#FDE68A] text-[11px] text-[#92400E]">
                    Este departamento usa o shell do blueprint. Seções operacionais marcadas como
                    “A configurar” serão preenchidas ao promover para padrão-ouro (referência: Design).
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Intake ───────────────────────────────────────────────────────────── */}
      {tab === "intake" && (
        blueprint?.intake ? (
          <div className="space-y-4">
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Como a demanda chega" />
              <p className="text-[13px] text-[#6B6B65] leading-relaxed">{blueprint.intake.howDemandArrives}</p>
            </div>

            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Canais de demanda aceitos" hint="Ativos e canais futuros prontos para classificação" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {blueprint.intake.acceptedSources.map((src) => (
                  <div key={src.kind} className="flex items-start gap-2.5 p-3 rounded-[8px] border border-[#E8E8E3] bg-[#F7F7F6]">
                    <span className={`mt-0.5 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium shrink-0 ${
                      src.status === "active" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#EEF0FF] text-[#5B5BD6]"
                    }`}>
                      {src.status === "active" ? "Ativo" : "Futuro"}
                    </span>
                    <div>
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{src.label}</div>
                      <div className="text-[11px] text-[#6B6B65] leading-relaxed">{src.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Informações obrigatórias" />
                <ul className="space-y-2">
                  {blueprint.intake.requiredInformation.map((f, i) => (
                    <li key={i} className="text-[13px]">
                      <span className="font-medium text-[#1A1A1A]">{f.label}</span>
                      <span className="block text-[11px] text-[#6B6B65]">{f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Informações opcionais" />
                <ul className="space-y-2">
                  {blueprint.intake.optionalInformation.map((f, i) => (
                    <li key={i} className="text-[13px]">
                      <span className="font-medium text-[#1A1A1A]">{f.label}</span>
                      <span className="block text-[11px] text-[#6B6B65]">{f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Tipos de input aceitos" />
                <div className="flex flex-wrap gap-1.5">
                  {blueprint.intake.acceptedInputTypes.map((t) => (
                    <span key={t} className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#F0F0ED] text-[#6B6B65]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Qualidade do input & lacunas" />
                <p className="text-[12px] text-[#6B6B65] mb-2"><strong className="text-[#1A1A1A]">Score:</strong> {blueprint.intake.inputQualityScoreModel}</p>
                <p className="text-[12px] text-[#6B6B65]"><strong className="text-[#1A1A1A]">Se faltar informação:</strong> {blueprint.intake.missingInformationBehavior}</p>
              </div>
            </div>
          </div>
        ) : <NotConfigured section="Intake" />
      )}

      {/* ── Work Queue ───────────────────────────────────────────────────────── */}
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

          {/* Status lanes from blueprint */}
          {blueprint?.workQueue && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {blueprint.workQueue.lanes.map((lane) => (
                <span key={lane.key} className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#F0F0ED] text-[#6B6B65]">
                  {lane.label}
                </span>
              ))}
            </div>
          )}

          {dept.generatorRoute && (
            <div
              className="flex items-center justify-between gap-3 p-4 rounded-[10px] mb-4 border"
              style={{ backgroundColor: dept.accentBg, borderColor: `${dept.color}33` }}
            >
              <div>
                <div className="text-[12px] font-semibold" style={{ color: dept.color }}>Próxima ação</div>
                <div className="text-[12px] text-[#6B6B65] mt-0.5">Produza entregas deste departamento usando a ferramenta dedicada.</div>
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

      {/* ── Execution ────────────────────────────────────────────────────────── */}
      {tab === "execution" && (
        blueprint?.execution ? (
          <div className="space-y-4">
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Processo padrão" hint="Passos que todo item percorre" />
              <ol className="space-y-3">
                {blueprint.execution.steps.map((s) => (
                  <li key={s.order} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ backgroundColor: dept.color }}>
                      {s.order}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{s.title}</div>
                      <div className="text-[12px] text-[#6B6B65]">{s.description}</div>
                      {s.internalCheck && <div className="text-[11px] text-[#16A34A] mt-0.5">✓ {s.internalCheck}</div>}
                      {s.collaborationPoint && <div className="text-[11px] text-[#5B5BD6] mt-0.5">↔ {s.collaborationPoint}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Checagens internas" />
                <ul className="space-y-1.5">
                  {blueprint.execution.internalChecks.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#16A34A] mt-0.5">✓</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Pontos de colaboração" />
                <ul className="space-y-1.5">
                  {blueprint.execution.collaborationPoints.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#5B5BD6] mt-0.5">↔</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Regras de escalada" />
                <ul className="space-y-1.5">
                  {blueprint.execution.escalationRules.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#D97706] mt-0.5">⚑</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Regras de handoff" />
                <ul className="space-y-1.5">
                  {blueprint.execution.handoffRules.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#5B5BD6] mt-0.5">→</span> {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : <NotConfigured section="Execução" />
      )}

      {/* ── Deliverables ─────────────────────────────────────────────────────── */}
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
                      <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-medium bg-[#EEF0FF] text-[#5B5BD6]">{t.outputFormat}</span>
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
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Entregas produzidas ({deptDelivs.length})</h3>
            <Link href="/agency/deliverables" className="text-[12px] text-[#5B5BD6] hover:underline">Ver todas →</Link>
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
        blueprint?.handoffs ? (
          <div className="space-y-6">
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
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9B9B95]"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9B9B95]"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
          </div>
        ) : <NotConfigured section="Handoffs" />
      )}

      {/* ── Intelligence ─────────────────────────────────────────────────────── */}
      {tab === "intelligence" && (
        <div className="space-y-4">
          {/* Intelligence Mode run card (live) */}
          {INTELLIGENCE_DEPTS.has(activeDept.id) && (
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
                    <p className="text-[12px] text-[#6B6B65]">Nenhum run registrado. Execute a inteligência para gerar análise e entregas automáticas.</p>
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

          {/* Provider-agnostic intelligence layer from blueprint */}
          {blueprint?.intelligence ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="O que pode analisar" />
                <ul className="space-y-1.5">
                  {blueprint.intelligence.canAnalyze.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#5B5BD6] mt-0.5">●</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Decisões que apoia" />
                <ul className="space-y-1.5">
                  {blueprint.intelligence.supportsDecisions.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#5B5BD6] mt-0.5">●</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Recomendações que produz" />
                <ul className="space-y-1.5">
                  {blueprint.intelligence.canRecommend.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#16A34A] mt-0.5">✓</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] p-5">
                <SectionTitle title="Nunca decide sozinho" />
                <ul className="space-y-1.5">
                  {blueprint.intelligence.mustNeverDecideAlone.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#92400E] flex items-start gap-1.5"><span className="mt-0.5">✗</span> {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <NotConfigured section="Inteligência" />
          )}
        </div>
      )}

      {/* ── Tools ────────────────────────────────────────────────────────────── */}
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
                <Link href="/agency/integrations" className="mt-2 inline-block text-[12px] text-[#5B5BD6] hover:underline">Configurar integrações →</Link>
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
                      integration.status === "active" || integration.status === "configured" ? "bg-[#DCFCE7] text-[#16A34A]"
                      : integration.status === "planned" ? "bg-[#EEF0FF] text-[#5B5BD6]" : "bg-[#F0F0ED] text-[#9B9B95]"
                    }`}>
                      {integration.status === "active" ? "Ativo" : integration.status === "configured" ? "Configurado" : integration.status === "planned" ? "Planejado" : "Disponível"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── People ───────────────────────────────────────────────────────────── */}
      {tab === "people" && (
        blueprint?.people ? (
          <div className="space-y-4">
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Funções humanas (futuro)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {blueprint.people.roles.map((r, i) => (
                  <div key={i} className="p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="text-[13px] font-semibold text-[#1A1A1A] mb-1.5">{r.title}</div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Responsabilidades</div>
                    <ul className="mb-1.5">{r.responsibilities.map((x, j) => <li key={j} className="text-[11px] text-[#6B6B65]">• {x}</li>)}</ul>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Permissões</div>
                    <ul>{r.permissions.map((x, j) => <li key={j} className="text-[11px] text-[#6B6B65]">• {x}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Regras de takeover" />
                <ul className="space-y-1.5">
                  {blueprint.people.takeoverRules.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#D97706] mt-0.5">⚑</span> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
                <SectionTitle title="Colaboração IA × humano" />
                <ul className="space-y-1.5">
                  {blueprint.people.aiHumanCollaboration.map((c, i) => (
                    <li key={i} className="text-[12px] text-[#6B6B65] flex items-start gap-1.5"><span className="text-[#5B5BD6] mt-0.5">↔</span> {c}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
              <SectionTitle title="Roles com acesso (atual)" />
              <div className="flex flex-wrap gap-2">
                {dept.ownerRoles.map((r) => (
                  <div key={r} className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="w-7 h-7 rounded-full bg-[#5B5BD6]/10 flex items-center justify-center text-[11px] font-semibold text-[#5B5BD6]">{r.charAt(0).toUpperCase()}</div>
                    <div className="text-[12px] text-[#6B6B65]">{r}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <NotConfigured section="Pessoas" />
      )}

      {/* ── Quality ──────────────────────────────────────────────────────────── */}
      {tab === "quality" && (
        blueprint?.quality ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Antes de iniciar", items: blueprint.quality.beforeStart, icon: "▶", color: "#5B5BD6" },
                { title: "Antes de entregar", items: blueprint.quality.beforeDelivery, icon: "✓", color: "#16A34A" },
                { title: "Antes do handoff", items: blueprint.quality.beforeHandoff, icon: "→", color: "#0E7490" },
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
              <div className="bg-white rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] p-5">
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

      {/* ── History ──────────────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="O que é auditado" />
            <p className="text-[12px] text-[#6B6B65] mb-3">{blueprint?.history.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {(blueprint?.history.tracks ?? []).map((t, i) => (
                <span key={i} className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#F0F0ED] text-[#6B6B65]">{t}</span>
              ))}
            </div>
          </div>

          {/* Decision log — derived from AI run logs */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Log de decisões & runs" hint="Execuções de inteligência registradas" />
            {deptRunLogs.length === 0 ? (
              <div className="text-[12px] text-[#9B9B95]">Nenhum registro ainda. Runs de inteligência aparecerão aqui.</div>
            ) : (
              <div className="space-y-2">
                {deptRunLogs.slice(0, 10).map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-3 p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3]">
                    <div className="min-w-0">
                      <div className="text-[12px] text-[#1A1A1A]">{l.outputSummary}</div>
                      <div className="text-[10px] text-[#9B9B95] mt-0.5">{new Date(l.createdAt).toLocaleString("pt-BR")} · {l.provider}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium ${
                      l.status === "success" ? "bg-[#DCFCE7] text-[#16A34A]" : l.status === "fallback" ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#FEE2E2] text-[#DC2626]"
                    }`}>
                      {l.status === "success" ? "Sucesso" : l.status === "fallback" ? "Fallback" : "Erro"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Metrics ──────────────────────────────────────────────────────────── */}
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
            <SectionTitle title="Taxa de aprovação" />
            {metrics.deliverablesProduced === 0 ? (
              <div className="text-[13px] text-[#9B9B95]">Nenhuma entrega produzida ainda.</div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-[#6B6B65]">Aprovadas / Total</span>
                  <span className="text-[13px] font-medium text-[#1A1A1A]">
                    {metrics.approvedDeliverables}/{metrics.deliverablesProduced} ({Math.round((metrics.approvedDeliverables / metrics.deliverablesProduced) * 100)}%)
                  </span>
                </div>
                <div className="h-2 bg-[#F0F0ED] rounded-full overflow-hidden">
                  <div className="h-full bg-[#16A34A] rounded-full" style={{ width: `${Math.round((metrics.approvedDeliverables / metrics.deliverablesProduced) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Agent config — moved here (operations room, not a bot page) */}
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5">
            <SectionTitle title="Configuração do agente do departamento" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Provedor de IA</label>
                {isOpenAICapable ? (
                  <select
                    value={selectedProvider}
                    onChange={(e) => saveDepartmentConfig(activeDept.id, { aiProvider: e.target.value, model: e.target.value })}
                    className="w-full p-3 rounded-[8px] bg-white border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6]"
                  >
                    <option value="rule_based">Regras locais (sem IA externa)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                ) : (
                  <div className="p-3 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3] text-[13px] text-[#1A1A1A]">
                    {(savedConfig?.aiProvider ?? dept.aiProvider) === "rule_based" ? "Regras locais (sem IA externa)" : (savedConfig?.aiProvider ?? dept.aiProvider)}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1.5">Prompt do agente</label>
                <div className="flex gap-2">
                  <button onClick={handleResetPrompt} className="h-9 px-3 rounded-[7px] border border-[#E8E8E3] text-[12px] text-[#6B6B65] hover:bg-[#F7F7F6]">Restaurar</button>
                  <button onClick={handleSavePrompt} className="h-9 px-4 rounded-[7px] bg-[#5B5BD6] text-white text-[12px] font-medium hover:bg-[#4A4AC5]">{promptSaved ? "Salvo ✓" : "Salvar"}</button>
                </div>
              </div>
            </div>
            <textarea
              value={activePrompt}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={10}
              className="mt-3 w-full p-4 rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] font-mono leading-relaxed resize-y outline-none focus:border-[#5B5BD6]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
