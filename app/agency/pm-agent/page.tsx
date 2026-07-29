"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import type { PmAssessment } from "@/app/api/agents/pm/generate/route";
import { comoTexto, temSubstancia } from "@/lib/agency/esteira/conteudo";

const ACCENT = "#1A1A1A";

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "overview" | "priorities" | "plan" | "risks";

const STEPS = [
  "Lendo estado do projeto e pipeline…",
  "Analisando prazos e proposta…",
  "Mapeando bloqueios e riscos…",
  "Gerando plano semanal…",
  "Redigindo recomendações…",
];

const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
  { id: "overview",    label: "Visão Geral" },
  { id: "priorities",  label: "Prioridades" },
  { id: "plan",        label: "Plano Semanal" },
  { id: "risks",       label: "Riscos" },
];

function generateMockAssessment(projectName: string): PmAssessment {
  return {
    healthScore: 6,
    healthLabel: "Em risco",
    summary: `O projeto "${projectName}" está em andamento mas apresenta pontos de atenção que precisam ser resolvidos esta semana para manter o cronograma. A proposta precisa de acompanhamento e as entregas devem ser iniciadas.`,
    topPriorities: [
      "Confirmar aprovação da proposta com o cliente",
      "Iniciar geração de entregas pelo departamento responsável",
      "Agendar alinhamento semanal com o cliente",
    ],
    blockers: [],
    risks: [
      "Prazo pode ser comprometido sem início imediato da produção",
      "Cliente pode solicitar alterações após aprovação da proposta",
    ],
    weeklyPlan: [
      { day: "Segunda", task: "Enviar proposta atualizada ao cliente", owner: "PM" },
      { day: "Terça", task: "Rodar agente de estratégia e gerar Strategy Canvas", owner: "Strategy" },
      { day: "Quarta", task: "Gerar conteúdo de social media com base na estratégia", owner: "Social" },
      { day: "Quinta", task: "Briefing visual para o Design Agent", owner: "Design" },
      { day: "Sexta", task: "Revisão das entregas da semana e envio ao cliente", owner: "PM" },
    ],
    recommendation: "Priorize a aprovação da proposta esta semana para desbloquear a produção e garantir o cronograma.",
  };
}

export default function PmAgentPage() {
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("overview");
  const [stepIndex, setStepIndex] = useState(0);
  const [assessment, setAssessment] = useState<PmAssessment | null>(null);
  const [saved, setSaved] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { projects, clients, deliverables, pendingAgentInput, setPendingAgentInput } = useAgencyStore();
  const { createDeliverable } = useDbDeliverables();

  useEffect(() => {
    if (pendingAgentInput?.projectId) {
      setLinkedProjectId(pendingAgentInput.projectId);
      setPendingAgentInput(null);
    }
  }, [pendingAgentInput, setPendingAgentInput]);

  const linkedProject = linkedProjectId ? projects.find((p) => p.id === linkedProjectId) : null;
  const linkedClient  = linkedProject ? clients.find((c) => c.id === linkedProject.clientId) : null;

  const existingPlanningDelivs = linkedProjectId
    ? deliverables.filter((d) => d.projectId === linkedProjectId && d.type === "planning")
    : [];

  async function handleRun() {
    if (!linkedProject || !linkedClient) return;
    setAgentState("generating");
    setStepIndex(0);
    setSaved(false);
    setRunError(null);

    const stepDelays = [700, 1600, 2800, 4000, 5500];
    stepDelays.forEach((ms, i) => setTimeout(() => setStepIndex(i + 1), ms));

    let finalAssessment: PmAssessment;
    try {
      const res = await fetch("/api/agents/pm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:       linkedProject.id,
          clientId:        linkedClient.id,
          projectName:     linkedProject.name,
          clientName:      linkedClient.name,
          goal:            linkedProject.goal,
          stage:           linkedProject.stage,
          deadline:        linkedProject.deadline,
          proposalStatus:  linkedProject.proposal?.status ?? "draft",
          deliverableCount: deliverables.filter((d) => d.projectId === linkedProject.id).length,
          agentCount:      linkedProject.agents.length,
        }),
      });

      const data = (await res.json()) as { ok: boolean; assessment?: PmAssessment; error?: string };
      if (!data.ok || !data.assessment) {
        console.warn("[pm-agent] AI unavailable, using fallback:", data.error);
        finalAssessment = generateMockAssessment(linkedProject.name);
      } else {
        finalAssessment = data.assessment;
      }
    } catch (err) {
      console.warn("[pm-agent] fetch error, falling back:", err);
      finalAssessment = generateMockAssessment(linkedProject.name);
    }

    setAssessment(finalAssessment);
    setAgentState("output_ready");
    setActiveTab("overview");
    setStepIndex(5);
  }

  async function handleSave() {
    if (!linkedProjectId || !assessment || saved) return;
    const nome = `PM Assessment — ${linkedProject?.name ?? "Projeto"}`;
    const content = comoTexto(assessment, { titulo: nome });
    await createDeliverable({
      projectId: linkedProjectId,
      name:      nome,
      type:      "planning",
      status:    "in_review",
      ...(temSubstancia(content) ? { content } : {}),
    });
    setSaved(true);
  }

  function handleReset() {
    setAgentState("idle");
    setAssessment(null);
    setStepIndex(0);
    setSaved(false);
    setRunError(null);
  }

  const healthColor = assessment
    ? assessment.healthScore >= 8 ? "#16A34A"
    : assessment.healthScore >= 5 ? "#D97706"
    : "#DC2626"
    : "#9B9B95";

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="PM Agent"
        subtitle="Departamento de Gestão de Projetos — assessment de saúde, plano semanal e prioridades com IA."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-[#F0F0ED] text-[#1A1A1A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A]" />
            Gestão de Projetos
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1 · ✦ Dioli Brain</span>
          {linkedProject && (
            <Link href={`/agency/projects/${linkedProject.id}`} className="text-[12px] text-[#070A1F] hover:underline">
              ← {linkedProject.name}
            </Link>
          )}
          {agentState === "output_ready" && linkedProjectId && (
            <div className="ml-auto flex items-center gap-2">
              {saved ? (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Salvo no projeto
                </span>
              ) : (
                <button onClick={handleSave}
                  className="h-7 px-3 rounded-[6px] text-[12px] font-medium text-white bg-[#1A1A1A] hover:bg-[#111111] transition-colors">
                  Salvar assessment
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-[360px_1fr] gap-6 items-start">
          {/* ── LEFT ── */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Análise de Projeto</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Selecione um projeto para o PM Agent analisar.</p>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Projeto <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={linkedProjectId ?? ""}
                  onChange={(e) => { setLinkedProjectId(e.target.value || null); setAssessment(null); setSaved(false); setAgentState("idle"); setRunError(null); }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um projeto —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {linkedProject && (
                <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E5E5E2] px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Cliente</span>
                    <span className="text-[11px] text-[#1A1A1A]">{linkedClient?.name ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Estágio</span>
                    <span className="text-[11px] text-[#1A1A1A] capitalize">{linkedProject.stage}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Prazo</span>
                    <span className="text-[11px] text-[#1A1A1A]">{linkedProject.deadline}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Proposta</span>
                    <span className="text-[11px] text-[#1A1A1A]">{linkedProject.proposal?.status ?? "draft"}</span>
                  </div>
                </div>
              )}

              {existingPlanningDelivs.length > 0 && (
                <div className="rounded-[7px] bg-[#FAFAFA] border border-[#F0F0ED] px-3 py-2">
                  <p className="text-[11px] text-[#9B9B95]">{existingPlanningDelivs.length} planning(s) já salvo(s). Gerar novamente cria nova versão.</p>
                </div>
              )}

              {runError && (
                <div className="rounded-[7px] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2">
                  <p className="text-[11px] text-[#DC2626]">{runError}</p>
                </div>
              )}

              {agentState === "idle" && (
                <button disabled={!linkedProject} onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: linkedProject ? ACCENT : "#9CA3AF" }}>
                  {!linkedProject ? "Selecione um projeto" : "✦ Gerar PM Assessment"}
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2 bg-[#1A1A1A]">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analisando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset} className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-all">
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT ── */}
          {agentState === "idle" && !linkedProject && (
            <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full bg-[#F0F0ED] flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="3" width="14" height="14" rx="2" stroke="#1A1A1A" strokeWidth="1.5"/>
                  <path d="M7 7h6M7 10h6M7 13h4" stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[#1A1A1A] mb-1">PM Agent</p>
              <p className="text-[13px] text-[#9B9B95] max-w-sm mx-auto">Selecione um projeto para analisar saúde, prioridades e gerar um plano semanal com IA.</p>
            </div>
          )}

          {agentState === "idle" && linkedProject && (
            <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F0F0ED] flex items-center justify-center mx-auto mb-5">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="16" height="16" rx="2" stroke="#1A1A1A" strokeWidth="1.5"/>
                  <path d="M7 8h8M7 11h8M7 14h5" stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#1A1A1A] mb-2">Pronto para analisar</p>
              <p className="text-[13px] text-[#6B6B65] max-w-sm mx-auto leading-relaxed">
                {linkedClient?.name ?? "Cliente"} · {linkedProject.stage}. O PM Agent vai analisar o estado do projeto e gerar um assessment completo com plano semanal.
              </p>
            </div>
          )}

          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#DCFCE7]" : i === stepIndex ? "bg-[#F0F0ED]" : "bg-[#F0F0ED]"}`}>
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : i === stepIndex ? (
                        <span className="w-2.5 h-2.5 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin" />
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
              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "bg-[#1A1A1A] text-white" : "text-[#6B6B65] hover:bg-[#F7F7F6]"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {activeTab === "overview" && (
                <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-4">
                  <div className="flex items-center gap-4 pb-3 border-b border-[#F0F0ED]">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center border-4"
                      style={{ borderColor: healthColor }}>
                      <span className="text-[20px] font-black" style={{ color: healthColor }}>{assessment.healthScore}</span>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#1A1A1A]">{assessment.healthLabel}</p>
                      <p className="text-[11px] text-[#9B9B95]">Health Score · {assessment.healthScore}/10</p>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Resumo</div>
                    <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{assessment.summary}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Recomendação da semana</div>
                    <div className="bg-[#F7F7F6] rounded-[8px] border border-[#E5E5E2] px-4 py-3">
                      <p className="text-[13px] font-medium text-[#1A1A1A]">{assessment.recommendation}</p>
                    </div>
                  </div>
                  {assessment.blockers.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-[0.05em] mb-1.5">Bloqueios ativos</div>
                      <ul className="space-y-1">
                        {assessment.blockers.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[#DC2626]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />{b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Priorities */}
              {activeTab === "priorities" && (
                <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-2">
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Top prioridades desta semana</div>
                  {assessment.topPriorities.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] border border-[#E5E5E2] px-4 py-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 bg-[#1A1A1A]">{i + 1}</span>
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{p}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan */}
              {activeTab === "plan" && (
                <div className="space-y-2">
                  {assessment.weeklyPlan.map((day, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-3 flex items-center gap-4">
                      <div className="w-16 shrink-0">
                        <p className="text-[12px] font-semibold text-[#1A1A1A]">{day.day}</p>
                      </div>
                      <p className="text-[13px] text-[#1A1A1A] flex-1">{day.task}</p>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F0F0ED] text-[#6B6B65] shrink-0">{day.owner}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Risks */}
              {activeTab === "risks" && (
                <div className="bg-white rounded-[10px] border border-[#FECACA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="text-[11px] font-semibold text-[#DC2626] uppercase tracking-[0.05em] mb-2">Riscos identificados</div>
                  <ul className="space-y-2">
                    {assessment.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-[#6B6B65]">
                        <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between bg-[#F7F7F6] rounded-[12px] border border-[#E5E5E2] px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">Salvar PM Assessment como entrega</p>
                  <p className="text-[12px] text-[#9B9B95]">Vai para revisão como "planning" no projeto.</p>
                </div>
                {saved ? (
                  <span className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[#DCFCE7] text-[#16A34A]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Salvo
                  </span>
                ) : (
                  <button onClick={handleSave} className="h-9 px-5 rounded-[8px] text-white text-[13px] font-medium bg-[#1A1A1A] hover:bg-[#111111] transition-colors shrink-0">
                    Salvar entrega →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
