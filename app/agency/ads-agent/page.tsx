"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { AgentClientContext } from "@/lib/agency/workspace";
import { generateAdsPlan, buildAdsDeliverables, ADS_DELIVERABLE_TYPES } from "@/lib/agency/ads-agent";
import type { AdsPlan } from "@/lib/agency/ads-agent";
import { comoTexto, temSubstancia } from "@/lib/agency/esteira/conteudo";
import AvisoModoAlternativo from "@/components/agency/ui/AvisoModoAlternativo";

// ─── Ads Agent — Paid Traffic Department ────────────────────────────────────────
//
// Planning + campaign architecture layer. Rule-based / mock generation only.
// No Meta Ads API, no Google Ads API, no real campaigns, no metrics.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#0E7490"; // cyan-700 — Paid Traffic department color

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "strategy" | "structure" | "audience" | "copy" | "creative" | "optimization";

const STEPS = [
  "Lendo Brand Brain e contexto do cliente…",
  "Consultando síntese do Strategy Room…",
  "Definindo objetivo e plataformas…",
  "Estruturando funil e audiências…",
  "Escrevendo ângulos de copy…",
  "Mapeando criativos, riscos e otimizações…",
];

const TYPE_TO_TAB: Record<string, OutputTab> = {
  "Ads Strategy": "strategy",
  "Campaign Structure": "structure",
  "Audience Plan": "audience",
  "Ad Copy": "copy",
  "Creative Requirements": "creative",
  "Optimization Notes": "optimization",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContextCard({ ctx, usedStrategyRoom }: { ctx: AgentClientContext; usedStrategyRoom: boolean }) {
  const ready = ctx.brandBrainReadiness;
  const incomplete = ready < 5;
  return (
    <div className="space-y-2">
      <div className={`rounded-[8px] border px-3 py-2.5 ${incomplete ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#E6FBFA] border-[#C7EFEC]"}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold`} style={{ color: incomplete ? "#D97706" : ACCENT }}>{incomplete ? "⚠" : "●"}</span>
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">{incomplete ? "Brand Brain incompleto" : "Brand Brain ativo"}</span>
            <span className="text-[10px] text-[var(--text-muted)]">· {ctx.clientName}</span>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ready === 10 ? "bg-[var(--success-bg)] text-[var(--success)]" : ready >= 5 ? "bg-[#E6FBFA] text-[#0E7490]" : "bg-[var(--accent)] text-[var(--text-muted)]"}`}>{ready}/10</span>
        </div>
        {incomplete ? (
          <p className="text-[11px] text-[var(--warning)] leading-snug">Complete o Brand Brain no workspace do cliente para um plano de mídia totalmente específico.</p>
        ) : (
          <div className="space-y-0.5 mt-1">
            {ctx.brandBrain?.preferredChannels && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">Canais</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.preferredChannels}</span></div>}
            {ctx.brandBrain?.targetAudience && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">Público</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.targetAudience}</span></div>}
            {ctx.brandBrain?.positioning && <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">Posição</span><span className="text-[11px] text-[var(--text-primary)] truncate">{ctx.brandBrain.positioning}</span></div>}
          </div>
        )}
      </div>
      <div className={`flex items-center gap-1.5 rounded-[8px] border px-3 py-2 ${usedStrategyRoom ? "bg-[var(--accent-light)] border-[#D6DEFF]" : "bg-[var(--bg-elevated)] border-[var(--border)]"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${usedStrategyRoom ? "bg-[var(--navy)]" : "bg-[var(--text-subtle)]"}`} />
        <span className={`text-[11px] font-medium ${usedStrategyRoom ? "text-[var(--navy)]" : "text-[var(--text-muted)]"}`}>
          {usedStrategyRoom ? "Strategy Room conectado" : "Strategy Room não gerado (opcional)"}
        </span>
      </div>
    </div>
  );
}

function ProposalGatePanel({ proposalStatus, linkedProject }: { proposalStatus: string | undefined; linkedProject: { id: string; name: string } | null }) {
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    draft:             { label: "Rascunho — não enviado ao cliente",   color: "text-[var(--text-secondary)]", bg: "bg-[var(--bg)]" },
    sent:              { label: "Aguardando aprovação do cliente",     color: "text-[var(--navy)]", bg: "bg-[var(--accent-light)]" },
    rejected:          { label: "Rejeitado pelo cliente",              color: "text-[var(--danger)]", bg: "bg-[var(--danger-bg)]" },
    changes_requested: { label: "Alterações solicitadas pelo cliente", color: "text-[var(--warning)]", bg: "bg-[#FFFBEB]" },
  };
  const info = proposalStatus ? (statusMap[proposalStatus] ?? statusMap.draft) : statusMap.draft;
  return (
    <div className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-[#E6FBFA] flex items-center justify-center mb-5">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 7v5M11 15h.01" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="11" cy="11" r="9" stroke="#D97706" strokeWidth="1.5" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">Execução bloqueada</p>
      <p className="text-[13px] text-[var(--text-secondary)] max-w-sm leading-relaxed mb-5">
        O Agente de Tráfego Pago só roda após a aprovação da proposta pelo cliente.
        Assim, todo o planejamento de mídia é comercialmente autorizado antes de começar.
      </p>
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full mb-5 ${info.bg}`}>
        <span className={`text-[12px] font-semibold ${info.color}`}>Status da proposta: {info.label}</span>
      </div>
      {linkedProject && (
        <Link href={`/agency/projects/${linkedProject.id}?tab=proposal`} className="h-8 px-4 rounded-[7px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[12px] font-medium transition-colors">
          Ver Proposta →
        </Link>
      )}
    </div>
  );
}

const AUDIENCE_COLOR: Record<string, string> = {
  fria: "bg-[var(--accent-light)] text-[var(--navy)]",
  morna: "bg-[var(--warning-bg)] text-[var(--warning)]",
  quente: "bg-[#FEE2E2] text-[var(--danger)]",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdsAgentPage() {
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("strategy");
  const [stepIndex, setStepIndex] = useState(0);
  const [plan, setPlan] = useState<AdsPlan | null>(null);
  // Resultado veio do gerador por regras, não da IA — DESIGN.md §7.3.
  const [motivoDaReserva, setMotivoDaReserva] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { projects, clients, deliverables, strategyRooms, pendingAgentInput, setPendingAgentInput } = useAgencyStore();
  const { createDeliverable } = useDbDeliverables();

  // Auto-link project from project detail "Run" handoff
  useEffect(() => {
    if (pendingAgentInput?.projectId) {
      setLinkedProjectId(pendingAgentInput.projectId);
      setPendingAgentInput(null);
    }
  }, [pendingAgentInput, setPendingAgentInput]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const linkedProject = linkedProjectId ? projects.find((p) => p.id === linkedProjectId) : null;
  const linkedClient = linkedProject ? clients.find((c) => c.id === linkedProject.clientId) : null;
  const agentCtx: AgentClientContext | null = linkedClient ? getClientAgentContext(linkedClient) : null;
  const strategyRoom = linkedProjectId ? strategyRooms.find((r) => r.projectId === linkedProjectId) ?? null : null;

  const proposalStatus = linkedProject?.proposal?.status;
  const proposalApproved = proposalStatus === "approved";
  const proposalBlocked = !!linkedProject && !proposalApproved;

  const projectDeliverables = linkedProjectId ? deliverables.filter((d) => d.projectId === linkedProjectId) : [];
  const existingAdsDeliverables = projectDeliverables.filter((d) => (ADS_DELIVERABLE_TYPES as readonly string[]).includes(d.type));

  const isReady = !!linkedProject && !proposalBlocked;

  // ── Actions ───────────────────────────────────────────────────────────────────
  async function handleRun() {
    if (!linkedProject || !linkedClient) return;
    setAgentState("generating");
    setStepIndex(0);
    setSaved(false);
    setMotivoDaReserva(null);

    // Advance steps while real API call runs
    const stepDelays = [800, 1800, 3000, 4500, 6500];
    stepDelays.forEach((ms, i) => {
      setTimeout(() => setStepIndex(i + 1), ms);
    });

    let finalPlan: AdsPlan;
    let motivo: string | null = null;
    try {
      const res = await fetch("/api/agents/ads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:            linkedProject.id,
          clientId:             linkedClient.id,
          projectName:          linkedProject.name,
          clientName:           linkedClient.name,
          projectObjective:     linkedProject.orchestratorBriefing?.objective ?? linkedProject.goal,
          services:             linkedProject.orchestratorBriefing?.services ?? [],
          budget:               linkedProject.proposal?.pricing,
          brandBrain:           linkedClient.brandBrain ?? null,
          strategyRoomSynthesis: strategyRoom?.finalSynthesis?.recommendedStrategy ?? null,
          brandBrainReadiness:  agentCtx?.brandBrainReadiness ?? 0,
        }),
      });

      const data = (await res.json()) as { ok: boolean; plan?: AdsPlan; error?: string };

      if (!data.ok || !data.plan) {
        // Cair em regras é aceitável; cair em SILÊNCIO não. DESIGN.md §7.3.
        console.warn("[ads-agent] AI unavailable, using rule-based fallback:", data.error);
        finalPlan = generateAdsPlan(linkedProject!, linkedClient!, strategyRoom, agentCtx);
        motivo = data.error ?? "a IA não respondeu";
      } else {
        finalPlan = data.plan;
      }
    } catch (err) {
      console.warn("[ads-agent] fetch error, falling back to rule-based:", err);
      finalPlan = generateAdsPlan(linkedProject!, linkedClient!, strategyRoom, agentCtx);
      motivo = err instanceof Error ? err.message : "falha de conexão com o serviço de IA";
    }

    setMotivoDaReserva(motivo);
    setPlan(finalPlan);
    setAgentState("output_ready");
    setActiveTab("strategy");
    setStepIndex(5);
  }

  function handleSaveAll() {
    if (!linkedProjectId || !plan || saved) return;
    const drafts = buildAdsDeliverables(plan, linkedProject?.name ?? "Projeto");
    drafts.forEach((d) => {
      // O entregável leva o CONTEÚDO. Salvar só o título fazia o cliente abrir
      // o portal e encontrar cartões vazios.
      const content = comoTexto(d, { titulo: d.name });
      void createDeliverable({
        projectId: linkedProjectId,
        name: d.name,
        type: d.type,
        status: "in_review",
        ...(temSubstancia(content) ? { content } : {}),
      });
    });
    setSaved(true);
  }

  function handleReset() {
    setAgentState("idle");
    setPlan(null);
    setStepIndex(0);
    setSaved(false);
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
    { id: "strategy", label: "Estratégia" },
    { id: "structure", label: "Estrutura" },
    { id: "audience", label: "Audiência" },
    { id: "copy", label: "Copy" },
    { id: "creative", label: "Criativos" },
    { id: "optimization", label: "Otimização" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      <AgencyHeader
        title="Agente de Tráfego Pago"
        subtitle="Departamento de Mídia Paga — arquiteta campanhas, audiências e criativos a partir do Brand Brain e do Strategy Room. Planejamento, não publicação."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
            Departamento de Tráfego Pago
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">v1 · planejamento (sem API)</span>
          {linkedProject && (
            <Link href={`/agency/projects/${linkedProject.id}`} className="text-[12px] text-[var(--navy)] hover:underline">
              ← {linkedProject.name}
            </Link>
          )}
          {agentState === "output_ready" && linkedProjectId && (
            <div className="ml-auto flex items-center gap-2">
              {saved ? (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--success-bg)] text-[var(--success)] border border-[#BBF7D0]">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Salvo — 6 entregas em revisão
                </span>
              ) : (
                <button
                  onClick={handleSaveAll}
                  className="h-7 px-3 rounded-[6px] text-[12px] font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  Salvar 6 entregas no projeto
                </button>
              )}
            </div>
          )}
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
          {/* ── LEFT: Setup ── */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Briefing de Mídia</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Selecione um projeto aprovado para arquitetar o plano de tráfego pago.</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Project selector */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Projeto <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={linkedProjectId ?? ""}
                  onChange={(e) => { setLinkedProjectId(e.target.value || null); setPlan(null); setSaved(false); setAgentState("idle"); }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um projeto —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Context */}
              {agentCtx && <ContextCard ctx={agentCtx} usedStrategyRoom={!!strategyRoom} />}

              {/* Execution gate inline */}
              {proposalBlocked && linkedProject && (
                <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] px-3 py-2.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                    <path d="M7 4.5V7M7 9.5h.01" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="7" cy="7" r="6" stroke="#D97706" strokeWidth="1.2" />
                  </svg>
                  <p className="text-[12px] text-[var(--warning)] leading-snug">A proposta deve estar aprovada antes de rodar o Agente de Tráfego Pago.</p>
                </div>
              )}

              {/* Already-generated note */}
              {isReady && existingAdsDeliverables.length > 0 && (
                <div className="rounded-[7px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2">
                  <p className="text-[11px] text-[var(--text-muted)]">{existingAdsDeliverables.length} entrega(s) de Ads já salva(s) neste projeto. Gerar novamente cria uma nova versão.</p>
                </div>
              )}

              {/* What gets generated */}
              {isReady && (
                <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
                  <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.05em] mb-2">Será gerado</p>
                  <ul className="space-y-1">
                    {ADS_DELIVERABLE_TYPES.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Run / Generating / Reset */}
              {agentState === "idle" && (
                <button
                  disabled={!isReady}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: isReady ? ACCENT : "#9CA3AF" }}
                >
                  {!linkedProject ? "Selecione um projeto para começar" : proposalBlocked ? "Aguardando aprovação da proposta" : "Arquitetar Plano de Tráfego"}
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: ACCENT }}>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset} className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] transition-all">
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Output ── */}

          {/* Idle — no project */}
          {agentState === "idle" && !linkedProject && (
            <div className="bg-white rounded-[10px] border border-dashed border-[var(--border)] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 17V9M8 17V4M13 17v-6M18 17V7" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Departamento de Tráfego Pago</p>
              <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto">Selecione um projeto com proposta aprovada para arquitetar a estratégia de campanha, audiências, copy e criativos.</p>
            </div>
          )}

          {/* Idle — proposal blocked */}
          {agentState === "idle" && linkedProject && proposalBlocked && (
            <ProposalGatePanel proposalStatus={proposalStatus} linkedProject={linkedProject} />
          )}

          {/* Idle — ready */}
          {agentState === "idle" && linkedProject && !proposalBlocked && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 19V10M9 19V5M15 19v-6M21 19V8" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">Pronto para arquitetar</p>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                {linkedClient?.name} · proposta aprovada. O agente usa o Brand Brain{strategyRoom ? " e o Strategy Room" : ""} para gerar um plano de mídia completo em 6 entregas.
              </p>
            </div>
          )}

          {/* Generating */}
          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[var(--success-bg)]" : i === stepIndex ? "" : "bg-[var(--accent)]"}`} style={i === stepIndex ? { backgroundColor: "#E6FBFA" } : {}}>
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : i === stepIndex ? (
                        <span className="w-2.5 h-2.5 border-2 rounded-full animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                      )}
                    </span>
                    <span className={`text-[13px] ${i <= stepIndex ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output ready */}
          {agentState === "output_ready" && plan && (
            <div className="space-y-4">
              {motivoDaReserva && (
                <AvisoModoAlternativo oQue="Plano de campanha" motivo={motivoDaReserva} />
              )}

              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg)]"}`}
                    style={activeTab === t.id ? { backgroundColor: ACCENT } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Strategy */}
              {activeTab === "strategy" && (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold text-white flex items-center" style={{ backgroundColor: ACCENT }}>{plan.platform}</span>
                    {plan.usedStrategyRoom && <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold bg-[var(--accent-light)] text-[var(--navy)] flex items-center">Baseado no Strategy Room</span>}
                    <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold bg-[var(--accent)] text-[var(--text-secondary)] flex items-center">Brand Brain {plan.brandBrainReadiness}/10</span>
                  </div>
                  <Field label="Objetivo da campanha" value={plan.campaignObjective} />
                  <Field label="Recomendação de plataforma" value={plan.platformRationale} />
                  <Field label="Ângulo de oferta" value={plan.offerAngle} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--bg-elevated)] rounded-[8px] border border-[var(--border)] px-3 py-2.5">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Budget sugerido</div>
                      <div className="text-[13px] font-semibold text-[var(--text-primary)]">{plan.budgetSuggestion}</div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] rounded-[8px] border border-[var(--border)] px-3 py-2.5">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Distribuição</div>
                      <div className="text-[12px] text-[var(--text-secondary)] leading-snug">{plan.budgetRationale}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Structure */}
              {activeTab === "structure" && (
                <div className="space-y-3">
                  {plan.funnel.map((f, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{f.stage}</span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>{f.platforms}</span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] mb-2">{f.goal}</p>
                      <div className="flex flex-wrap gap-1">
                        {f.formats.map((fmt) => (
                          <span key={fmt} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)]">{fmt}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Audience */}
              {activeTab === "audience" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Estratégia de audiência</div>
                    <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{plan.audienceStrategy}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {plan.audienceSegments.map((s, i) => (
                      <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{s.name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${AUDIENCE_COLOR[s.type]}`}>{s.type}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mb-1.5">{s.description}</p>
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug">{s.targeting}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Copy */}
              {activeTab === "copy" && (
                <div className="space-y-3">
                  {plan.adCopyIdeas.map((c, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>{c.angle}</span>
                      </div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">{c.headline}</p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-2">{c.primaryText}</p>
                      <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-[5px] bg-[var(--text-primary)] text-white">CTA: {c.cta}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Creative */}
              {activeTab === "creative" && (
                <div className="grid grid-cols-2 gap-3">
                  {plan.creativeRequirements.map((c, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{c.asset}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)]">{c.format}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mb-1">{c.spec}</p>
                      <p className="text-[11px] text-[var(--text-muted)] leading-snug">{c.direction}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Optimization */}
              {activeTab === "optimization" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[10px] border border-[#FECACA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--danger)] uppercase tracking-[0.05em] mb-2">Riscos da campanha</div>
                    <ul className="space-y-1.5">
                      {plan.campaignRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white rounded-[10px] border border-[#BBF7D0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-[0.05em] mb-2">Sugestões de otimização</div>
                    <ul className="space-y-1.5">
                      {plan.optimizationSuggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Save footer */}
              <div className="flex items-center justify-between bg-[var(--bg)] rounded-[12px] border border-[var(--border)] px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Salvar plano como entregas revisáveis</p>
                  <p className="text-[12px] text-[var(--text-muted)]">6 entregas agrupadas vão para revisão do cliente no portal.</p>
                </div>
                {saved ? (
                  <span className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[var(--success-bg)] text-[var(--success)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Salvo no projeto
                  </span>
                ) : (
                  <button onClick={handleSaveAll} className="h-9 px-5 rounded-[8px] text-white text-[13px] font-medium transition-colors hover:opacity-90 shrink-0" style={{ backgroundColor: ACCENT }}>
                    Salvar 6 entregas →
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">{label}</div>
      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{value}</p>
    </div>
  );
}
