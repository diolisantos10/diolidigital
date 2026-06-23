"use client";

import { useMemo } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import {
  DEPARTMENT_DEFS,
  AGENT_DEPT_MAP,
  DEPT_TASK_OWNER_MAP,
  type DepartmentDef,
} from "@/lib/agency/departments";
import { generateAllAutoTasks } from "@/lib/agency/orchestration/auto-tasks";
import { needsRevision } from "@/lib/agency/deliverables";

interface DeptMetrics {
  openTasks: number;
  pendingApprovals: number;
  pendingRevisions: number;
  deliverablesProduced: number;
  readiness: number;
  status: "healthy" | "attention" | "idle";
}

function computeMetrics(
  dept: DepartmentDef,
  store: ReturnType<typeof useAgencyStore.getState>,
  autoTasksAll: ReturnType<typeof generateAllAutoTasks>
): DeptMetrics {
  const { deliverables, projects } = store;

  const deptDelivs = deliverables.filter((d) => {
    const agentDept = AGENT_DEPT_MAP[d.ownerAgentId ?? ""];
    if (agentDept === dept.id) return true;
    if (
      (dept.id === "strategy" || dept.id === "project-management") &&
      ["document", "planning"].includes(d.type) &&
      !Object.keys(AGENT_DEPT_MAP).includes(d.ownerAgentId ?? "")
    )
      return true;
    if (
      dept.id === "brand-hub" &&
      d.type === "document" &&
      d.ownerAgentId === "a2"
    )
      return true;
    return false;
  });

  const pendingApprovals = deptDelivs.filter((d) => d.status === "in_review").length;
  const pendingRevisions = deptDelivs.filter((d) => needsRevision(d)).length;
  const deliverablesProduced = deptDelivs.length;

  const deptOwner = DEPT_TASK_OWNER_MAP[dept.id];
  const openTasks = deptOwner
    ? autoTasksAll.filter((t) => t.owner === deptOwner).length
    : 0;

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  let readiness = 40;
  if (dept.connectedToolIds.length > 0) readiness += 15;
  if (deliverablesProduced > 0) readiness += 30;
  if (openTasks === 0 && activeProjects.length > 0 && deliverablesProduced > 0) readiness += 15;

  const status: DeptMetrics["status"] =
    pendingRevisions > 2 || openTasks > 4
      ? "attention"
      : deliverablesProduced === 0 && activeProjects.length > 0
      ? "idle"
      : "healthy";

  return {
    openTasks,
    pendingApprovals,
    pendingRevisions,
    deliverablesProduced,
    readiness: Math.min(100, readiness),
    status,
  };
}

function StatusDot({ status }: { status: DeptMetrics["status"] }) {
  const colors = {
    healthy: "bg-[#16A34A]",
    attention: "bg-[#D97706]",
    idle: "bg-[#9B9B95]",
  };
  const labels = { healthy: "Operacional", attention: "Atenção", idle: "Sem saída" };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] text-[#6B6B65]">{labels[status]}</span>
    </span>
  );
}

function StatCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div
        className={`text-[18px] font-semibold leading-tight ${
          highlight && value > 0 ? "text-[#D97706]" : "text-[#1A1A1A]"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-[#9B9B95] mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function DeptCard({ dept, metrics }: { dept: DepartmentDef; metrics: DeptMetrics }) {
  return (
    <div className="bg-white rounded-[12px] border border-[#E8E8E3] flex flex-col hover:border-[#C8C8C3] transition-colors">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white text-[14px] font-bold shrink-0"
              style={{ backgroundColor: dept.color }}
            >
              {dept.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[#1A1A1A] leading-tight">{dept.name}</h3>
              <div className="mt-0.5">
                <StatusDot status={metrics.status} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-4 line-clamp-2">{dept.mission}</p>

        <div className="flex items-center gap-1.5 mb-4">
          <div
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium"
            style={{ backgroundColor: dept.accentBg, color: dept.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
            {dept.agentName}
          </div>
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#F0F0ED] text-[11px] text-[#6B6B65]">
            {dept.model === "rule_based" ? "Regras locais" : dept.model}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 py-3 border-t border-b border-[#F0F0ED]">
          <StatCell label="Tarefas" value={metrics.openTasks} highlight />
          <StatCell label="Aprovações" value={metrics.pendingApprovals} highlight />
          <StatCell label="Revisões" value={metrics.pendingRevisions} highlight />
          <StatCell label="Entregas" value={metrics.deliverablesProduced} />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[#9B9B95]">Prontidão</span>
            <span className="text-[11px] font-medium text-[#1A1A1A]">{metrics.readiness}%</span>
          </div>
          <div className="h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${metrics.readiness}%`,
                backgroundColor:
                  metrics.readiness >= 80
                    ? "#16A34A"
                    : metrics.readiness >= 50
                    ? "#D97706"
                    : "#DC2626",
              }}
            />
          </div>
        </div>
      </div>

      <div className="px-5 pb-4">
        <Link
          href={`/agency/departments/${dept.id}`}
          className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-[8px] border border-[#E8E8E3] text-[12px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F6] hover:border-[#D0D0CC] transition-colors"
        >
          Abrir Departamento
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  const store = useAgencyStore();
  const { projects, clients, deliverables, tasks, materialRequests, strategyRooms } = store;

  const autoTasks = useMemo(
    () => generateAllAutoTasks({ projects, clients, deliverables, tasks, materialRequests, strategyRooms }),
    [projects, clients, deliverables, tasks, materialRequests, strategyRooms]
  );

  const deptData = useMemo(
    () =>
      DEPARTMENT_DEFS.map((dept) => ({
        dept,
        metrics: computeMetrics(dept, store, autoTasks),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoTasks, deliverables, projects]
  );

  const healthy = deptData.filter((d) => d.metrics.status === "healthy").length;
  const attention = deptData.filter((d) => d.metrics.status === "attention").length;
  const idle = deptData.filter((d) => d.metrics.status === "idle").length;
  const totalTasks = deptData.reduce((s, d) => s + d.metrics.openTasks, 0);

  return (
    <div>
      <AgencyHeader
        title="Visão Geral dos Departamentos"
        subtitle="Linha de produção da Dioli Agência — cada departamento com missão, agente e métricas operacionais."
        actions={
          <Link
            href="/agency/production/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#070A1F] text-white text-[13px] font-medium hover:bg-[#4A4AC5] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Nova Linha de Produção
          </Link>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Departamentos", value: DEPARTMENT_DEFS.length, color: "#1A1A1A" },
          { label: "Operacionais", value: healthy, color: "#16A34A" },
          { label: "Com atenção", value: attention, color: "#D97706" },
          { label: "Tarefas abertas", value: totalTasks, color: totalTasks > 5 ? "#D97706" : "#1A1A1A" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-[10px] border border-[#E8E8E3] px-4 py-3">
            <div className="text-[22px] font-semibold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-[11px] text-[#9B9B95] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Department grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {deptData.map(({ dept, metrics }) => (
          <DeptCard key={dept.id} dept={dept} metrics={metrics} />
        ))}
      </div>

      {idle > 0 && (
        <div className="mt-6 p-4 rounded-[10px] bg-[#FEF3C7] border border-[#FDE68A] flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-[#D97706]">
            <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 3.5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <div>
            <div className="text-[13px] font-medium text-[#92400E]">
              {idle} departamento{idle > 1 ? "s" : ""} sem entrega com projetos ativos
            </div>
            <div className="text-[12px] text-[#A16207] mt-0.5">
              Verifique a fila de trabalho de cada departamento e inicie a produção.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
