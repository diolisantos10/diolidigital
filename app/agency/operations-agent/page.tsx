"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import type { OperationsAssessment } from "@/app/api/agents/operations/generate/route";

const ACCENT = "#059669";

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "overview" | "bottlenecks" | "alerts" | "actions";

const STEPS = [
  "Lendo estado de projetos e pipeline…",
  "Medindo fila de aprovações e solicitações…",
  "Checando integrações e conexão de IA…",
  "Identificando gargalos e bloqueios…",
  "Redigindo diagnóstico operacional…",
];

const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
  { id: "overview",    label: "Visão Geral" },
  { id: "bottlenecks", label: "Gargalos" },
  { id: "alerts",      label: "Alertas" },
  { id: "actions",     label: "Ações" },
];

interface OpsMetrics {
  clientCount: number;
  projectCount: number;
  activeProjectCount: number;
  overdueProjects: number;
  deliverablesInReview: number;
  pendingApprovals: number;
  pendingRequests: number;
  blockedTasks: number;
  integrationsConnected: number;
  aiConnected: boolean;
}

function generateMockAssessment(m: OpsMetrics): OperationsAssessment {
  const alerts: OperationsAssessment["systemAlerts"] = [];
  if (!m.aiConnected) {
    alerts.push({ area: "IA", severity: "critical", message: "Nenhum provedor de IA conectado — os agentes rodam em modo regras, sem raciocínio real. Conecte uma chave em Integrações." });
  }
  if (m.pendingApprovals > 0) {
    alerts.push({ area: "Aprovações", severity: m.pendingApprovals > 3 ? "warning" : "info", message: `${m.pendingApprovals} item(ns) aguardando aprovação. Revise para não travar a entrega.` });
  }
  if (m.pendingRequests > 0) {
    alerts.push({ area: "Solicitações", severity: "warning", message: `${m.pendingRequests} solicitação(ões) de cliente sem tratamento.` });
  }
  if (m.blockedTasks > 0) {
    alerts.push({ area: "Pipeline", severity: "warning", message: `${m.blockedTasks} tarefa(s) bloqueada(s) no pipeline.` });
  }

  const bottlenecks: string[] = [];
  if (m.pendingApprovals > 0) bottlenecks.push(`Fila de aprovações com ${m.pendingApprovals} item(ns) parado(s)`);
  if (m.pendingRequests > 0) bottlenecks.push(`${m.pendingRequests} solicitação(ões) de cliente aguardando triagem`);
  if (m.blockedTasks > 0) bottlenecks.push(`${m.blockedTasks} tarefa(s) bloqueada(s) sem encaminhamento`);
  if (bottlenecks.length === 0) bottlenecks.push("Nenhum gargalo crítico no momento — operação fluindo");

  const actionItems: string[] = [];
  if (!m.aiConnected) actionItems.push("Conectar um provedor de IA em Integrações para ativar o raciocínio real dos agentes");
  if (m.pendingApprovals > 0) actionItems.push("Limpar a fila de aprovações pendentes");
  if (m.pendingRequests > 0) actionItems.push("Triar e converter as solicitações de cliente em projetos");
  if (m.blockedTasks > 0) actionItems.push("Desbloquear tarefas paradas no pipeline");
  if (actionItems.length === 0) actionItems.push("Manter a cadência atual e monitorar prazos");

  // Simple heuristic score: start at 10, subtract for each pressure point.
  let score = 10;
  if (!m.aiConnected) score -= 3;
  score -= Math.min(3, m.pendingApprovals);
  score -= Math.min(2, m.pendingRequests);
  score -= Math.min(2, m.blockedTasks);
  score -= Math.min(2, m.overdueProjects);
  score = Math.max(1, score);
  const label = score >= 8 ? "Saudável" : score >= 5 ? "Em risco" : "Crítico";

  return {
    healthScore: score,
    healthLabel: label,
    summary: `A agência tem ${m.projectCount} projeto(s) (${m.activeProjectCount} em produção) e ${m.clientCount} cliente(s). ${alerts.length === 0 ? "Operação sem alertas críticos no momento." : `${alerts.length} alerta(s) operacional(is) a tratar.`}`,
    bottlenecks,
    systemAlerts: alerts.length > 0 ? alerts : [{ area: "Sistema", severity: "info", message: "Nenhum alerta operacional ativo." }],
    actionItems,
    capacityNote: m.activeProjectCount > 5
      ? "Carga de produção elevada — avalie distribuição entre departamentos."
      : "Capacidade operacional confortável para a carga atual.",
    recommendation: !m.aiConnected
      ? "Prioridade #1: conectar uma IA. Sem ela, todo o sistema entrega resultado em modo regras."
      : (bottlenecks.length > 1 ? "Foque em zerar a fila de aprovações e solicitações antes de iniciar novas produções." : "Operação saudável — mantenha o monitoramento semanal."),
  };
}

export default function OperationsAgentPage() {
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("overview");
  const [stepIndex, setStepIndex] = useState(0);
  const [assessment, setAssessment] = useState<OperationsAssessment | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);

  const {
    clients, projects, deliverables, tasks,
    clientRequests, brandUpdates, materialRequests, integrationConfigs,
  } = useAgencyStore();

  useEffect(() => {
    fetch("/api/ai-keys")
      .then((r) => r.json())
      .then((data) => setAiConnected(!!data.providers?.some((p: { configured: boolean }) => p.configured)))
      .catch(() => setAiConnected(false));
  }, []);

  // ── Aggregate the whole-agency operational state ──
  const overdueProjects = projects.filter((p) => {
    if (!p.deadline) return false;
    const d = new Date(p.deadline);
    return !isNaN(d.getTime()) && d.getTime() < Date.now() && p.stage !== "delivery" && p.stage !== "completed";
  }).length;

  const deliverablesInReview = deliverables.filter((d) => d.status === "in_review").length;
  const pendingApprovals =
    projects.filter((p) => p.proposal?.status === "sent").length +
    deliverablesInReview +
    (brandUpdates ?? []).filter((u) => u.status === "pending").length +
    (materialRequests ?? []).filter((r) => r.status === "pending").length;

  const metrics: OpsMetrics = {
    clientCount: clients.length,
    projectCount: projects.length,
    activeProjectCount: projects.filter((p) => p.stage === "production" || p.stage === "ongoing").length,
    overdueProjects,
    deliverablesInReview,
    pendingApprovals,
    pendingRequests: (clientRequests ?? []).filter((r) => r.status === "new").length,
    blockedTasks: tasks.filter((t) => t.status === "blocked").length,
    integrationsConnected: (integrationConfigs ?? []).filter((c) => c.configured).length,
    aiConnected: aiConnected ?? false,
  };

  async function handleRun() {
    setAgentState("generating");
    setStepIndex(0);
    setUsedFallback(false);

    const stepDelays = [600, 1500, 2600, 3800, 5200];
    stepDelays.forEach((ms, i) => setTimeout(() => setStepIndex(i + 1), ms));

    let finalAssessment: OperationsAssessment;
    let fellBack = false;
    try {
      const res = await fetch("/api/agents/operations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metrics),
      });
      const data = (await res.json()) as { ok: boolean; assessment?: OperationsAssessment; error?: string };
      if (!data.ok || !data.assessment) {
        console.warn("[operations-agent] AI unavailable, using fallback:", data.error);
        finalAssessment = generateMockAssessment(metrics);
        fellBack = true;
      } else {
        finalAssessment = data.assessment;
      }
    } catch (err) {
      console.warn("[operations-agent] fetch error, falling back:", err);
      finalAssessment = generateMockAssessment(metrics);
      fellBack = true;
    }

    setAssessment(finalAssessment);
    setUsedFallback(fellBack);
    setAgentState("output_ready");
    setActiveTab("overview");
    setStepIndex(5);
  }

  function handleReset() {
    setAgentState("idle");
    setAssessment(null);
    setStepIndex(0);
    setUsedFallback(false);
  }

  const healthColor = assessment
    ? assessment.healthScore >= 8 ? "#16A34A"
    : assessment.healthScore >= 5 ? "#D97706"
    : "#DC2626"
    : "#9B9B95";

  const severityStyle = (s: string) =>
    s === "critical" ? { bg: "#FEF2F2", border: "#FECACA", dot: "#DC2626", text: "#DC2626" }
    : s === "warning" ? { bg: "#FFFBEB", border: "#FDE68A", dot: "#D97706", text: "#92400E" }
    : { bg: "#F0FDF4", border: "#BBF7D0", dot: "#16A34A", text: "#15803D" };

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Operations Agent — System Doctor"
        subtitle="Departamento de Operações — diagnóstico da saúde operacional da agência com IA."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-[#ECFDF5] text-[#059669]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
            Operações & Sistema
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1 · ✦ Dioli Brain</span>
        </div>

        <div className="grid grid-cols-[360px_1fr] gap-6 items-start">
          {/* ── LEFT ── */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Diagnóstico Operacional</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">O System Doctor analisa a agência inteira — não um projeto.</p>
            </div>
            <div className="px-5 py-5 space-y-4">
              {/* Live metrics snapshot */}
              <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Estado atual</p>
                {[
                  ["Clientes", metrics.clientCount],
                  ["Projetos", metrics.projectCount],
                  ["Em produção", metrics.activeProjectCount],
                  ["Aprovações pendentes", metrics.pendingApprovals],
                  ["Solicitações novas", metrics.pendingRequests],
                  ["Tarefas bloqueadas", metrics.blockedTasks],
                  ["Projetos atrasados", metrics.overdueProjects],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-[#6B6B65]">{label}</span>
                    <span className="text-[11px] font-semibold text-[#1A1A1A]">{val}</span>
                  </div>
                ))}
              </div>

              {/* AI connection status */}
              <div className={`rounded-[8px] border px-3 py-2.5 ${aiConnected ? "bg-[#F0FDF4] border-[#BBF7D0]" : aiConnected === false ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F7F7F6] border-[#E5E5E2]"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${aiConnected ? "bg-[#16A34A]" : aiConnected === false ? "bg-[#D97706]" : "bg-[#9B9B95]"}`} />
                  <span className="text-[11px] font-medium text-[#1A1A1A]">
                    {aiConnected == null ? "Verificando IA…" : aiConnected ? "IA conectada" : "Nenhuma IA conectada"}
                  </span>
                </div>
                {aiConnected === false && (
                  <Link href="/agency/integrations" className="text-[11px] text-[#D97706] hover:underline mt-1 inline-block">
                    Conectar agora →
                  </Link>
                )}
              </div>

              {agentState === "idle" && (
                <button onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}>
                  ✦ Rodar diagnóstico
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: ACCENT }}>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analisando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset} className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-all">
                  Rodar de novo
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT ── */}
          {agentState === "idle" && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-5">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 2a4 4 0 00-4 4v1a4 4 0 108 0V6a4 4 0 00-4-4z" stroke="#059669" strokeWidth="1.5"/>
                  <path d="M4 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#1A1A1A] mb-2">System Doctor pronto</p>
              <p className="text-[13px] text-[#6B6B65] max-w-sm mx-auto leading-relaxed">
                Rode o diagnóstico para avaliar a saúde operacional da agência — gargalos, alertas de sistema, capacidade e ações prioritárias.
              </p>
            </div>
          )}

          {agentState === "generating" && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[#F0F0ED]">
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : i === stepIndex ? (
                        <span className="w-2.5 h-2.5 border-2 border-[#059669] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C0C0BC]" />
                      )}
                    </span>
                    <span className={`text-[13px] ${i <= stepIndex ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agentState === "output_ready" && assessment && (
            <div className="space-y-4">
              {usedFallback && (
                <div className="rounded-[8px] bg-[#FFFBEB] border border-[#FDE68A] px-4 py-2.5 flex items-start gap-2">
                  <span className="text-[14px] leading-none mt-0.5">⚠️</span>
                  <p className="text-[12px] text-[#92400E] leading-snug">
                    Diagnóstico gerado em <strong>modo regras</strong> (sem IA). Conecte um provedor em{" "}
                    <Link href="/agency/integrations" className="underline">Integrações</Link> para raciocínio real.
                  </p>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "text-white" : "text-[#6B6B65] hover:bg-[#F7F7F6]"}`}
                    style={activeTab === t.id ? { backgroundColor: ACCENT } : {}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {activeTab === "overview" && (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-4">
                  <div className="flex items-center gap-4 pb-3 border-b border-[#F0F0ED]">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center border-4" style={{ borderColor: healthColor }}>
                      <span className="text-[20px] font-black" style={{ color: healthColor }}>{assessment.healthScore}</span>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#1A1A1A]">{assessment.healthLabel}</p>
                      <p className="text-[11px] text-[#9B9B95]">Health Score Operacional · {assessment.healthScore}/10</p>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Diagnóstico</div>
                    <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{assessment.summary}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Capacidade</div>
                    <p className="text-[13px] text-[#6B6B65] leading-relaxed">{assessment.capacityNote}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Recomendação</div>
                    <div className="bg-[#ECFDF5] rounded-[8px] border border-[#BBF7D0] px-4 py-3">
                      <p className="text-[13px] font-medium text-[#065F46]">{assessment.recommendation}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottlenecks */}
              {activeTab === "bottlenecks" && (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-2">
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Gargalos operacionais</div>
                  {assessment.bottlenecks.map((b, i) => (
                    <div key={i} className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] border border-[#E5E5E2] px-4 py-3">
                      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#D97706] shrink-0" />
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{b}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Alerts */}
              {activeTab === "alerts" && (
                <div className="space-y-2">
                  {assessment.systemAlerts.map((a, i) => {
                    const st = severityStyle(a.severity);
                    return (
                      <div key={i} className="rounded-[10px] border px-5 py-3" style={{ backgroundColor: st.bg, borderColor: st.border }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.dot }} />
                          <span className="text-[11px] font-semibold" style={{ color: st.text }}>{a.area}</span>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ backgroundColor: st.dot, color: "white" }}>{a.severity}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: st.text }}>{a.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              {activeTab === "actions" && (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-2">
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Ações recomendadas</div>
                  {assessment.actionItems.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] border border-[#E5E5E2] px-4 py-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: ACCENT }}>{i + 1}</span>
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
