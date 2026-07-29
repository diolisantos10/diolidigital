"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import { comoTexto, temSubstancia } from "@/lib/agency/esteira/conteudo";

const ACCENT = "#070A1F";

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "diagnostico" | "posicao" | "canais" | "roadmap" | "riscos" | "quality";

const STEPS = [
  "Lendo contexto do cliente e Brand Brain…",
  "Diagnosticando segmento e objetivos…",
  "Definindo posicionamento e público-alvo…",
  "Mapeando canais prioritários e serviços…",
  "Construindo roadmap de execução…",
  "Rodando Quality Gate estratégico…",
];

const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
  { id: "diagnostico", label: "Diagnóstico" },
  { id: "posicao",     label: "Posição & Público" },
  { id: "canais",      label: "Canais & Serviços" },
  { id: "roadmap",     label: "Roadmap" },
  { id: "riscos",      label: "Riscos & Oport." },
  { id: "quality",     label: "Quality Gate" },
];

export default function StrategyAgentPage() {
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("diagnostico");
  const [stepIndex, setStepIndex] = useState(0);
  const [canvas, setCanvas] = useState<StrategyCanvas | null>(null);
  const [mode, setMode] = useState<"openai" | "rule_based">("rule_based");
  const [aiModel, setAiModel] = useState<string>("rule_based");
  const [warnings, setWarnings] = useState<string[]>([]);
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
  const agentCtx = linkedClient ? getClientAgentContext(linkedClient) : null;

  const existingStrategyDelivs = linkedProjectId
    ? deliverables.filter((d) => d.projectId === linkedProjectId && d.type === "strategy_document")
    : [];

  async function handleRun() {
    if (!linkedProject || !linkedClient) return;
    setAgentState("generating");
    setStepIndex(0);
    setSaved(false);
    setRunError(null);
    setWarnings([]);

    const stepDelays = [700, 1600, 2800, 4200, 5800];
    stepDelays.forEach((ms, i) => setTimeout(() => setStepIndex(i + 1), ms));

    try {
      const res = await fetch("/api/brain/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dept: "strategy",
          context: {
            businessName: linkedClient.name,
            segment:      linkedClient.industry ?? "",
            objectives:   linkedProject.orchestratorBriefing?.objective
                            ? [linkedProject.orchestratorBriefing.objective]
                            : linkedProject.goal ? [linkedProject.goal] : [],
            services:     linkedProject.orchestratorBriefing?.services ?? [],
            rawContext:   linkedClient.brandBrain?.positioning
                            ?? linkedClient.targetAudience
                            ?? linkedProject.goal
                            ?? "",
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        mode: "openai" | "rule_based";
        canvas: StrategyCanvas;
        model: string;
        warnings: string[];
      };

      setCanvas(data.canvas);
      setMode(data.mode);
      setAiModel(data.model);
      setWarnings(data.warnings ?? []);
      setAgentState("output_ready");
      setActiveTab("diagnostico");
      setStepIndex(5);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Erro ao gerar estratégia.");
      setAgentState("idle");
    }
  }

  async function handleSave() {
    if (!linkedProjectId || !canvas || saved) return;
    // A estratégia inteira fica gravada — é o documento que guia todo o resto.
    const nome = `Strategy Canvas — ${canvas.clientName}`;
    const content = comoTexto(canvas, { titulo: nome });
    await createDeliverable({
      projectId: linkedProjectId,
      name:      nome,
      type:      "strategy_document",
      status:    "in_review",
      ...(temSubstancia(content) ? { content } : {}),
    });
    setSaved(true);
  }

  function handleReset() {
    setAgentState("idle");
    setCanvas(null);
    setStepIndex(0);
    setSaved(false);
    setRunError(null);
    setWarnings([]);
  }

  const qg = canvas?.qualityGateResult;

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      <AgencyHeader
        title="Agente de Estratégia"
        subtitle="Departamento de Estratégia — diagnóstico, posicionamento e roadmap a partir do Brand Brain. Primeiro elo da cadeia de produção."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase"
            style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
            Departamento de Estratégia
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">v1 · ✦ Dioli Brain</span>
          {linkedProject && (
            <Link href={`/agency/projects/${linkedProject.id}`} className="text-[12px] text-[var(--navy)] hover:underline">
              ← {linkedProject.name}
            </Link>
          )}
          {agentState === "output_ready" && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: mode === "openai" ? "#E6FBFA" : "#F0F0ED", color: mode === "openai" ? ACCENT : "#6B6B65" }}>
                {mode === "openai" ? `✦ IA · ${aiModel}` : "motor rule-based"}
              </span>
              {saved ? (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--success-bg)] text-[var(--success)] border border-[#BBF7D0]">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Salvo como entrega
                </span>
              ) : (
                <button onClick={handleSave}
                  className="h-7 px-3 rounded-[6px] text-[12px] font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}>
                  Salvar no projeto
                </button>
              )}
            </div>
          )}
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[360px_1fr] gap-6 items-start">
          {/* ── LEFT ── */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Briefing Estratégico</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Selecione um projeto para gerar o Strategy Canvas com IA.</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Project selector */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Projeto <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={linkedProjectId ?? ""}
                  onChange={(e) => {
                    setLinkedProjectId(e.target.value || null);
                    setCanvas(null);
                    setSaved(false);
                    setAgentState("idle");
                    setRunError(null);
                  }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um projeto —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Brain readiness */}
              {agentCtx && (
                <div className={`rounded-[8px] border px-3 py-2.5 ${agentCtx.brandBrainReadiness < 5 ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[var(--accent-light)] border-[var(--cyan)]"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color: agentCtx.brandBrainReadiness < 5 ? "#D97706" : ACCENT }}>
                        {agentCtx.brandBrainReadiness < 5 ? "⚠" : "●"}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                        {agentCtx.brandBrainReadiness < 5 ? "Brand Brain incompleto" : "Brand Brain ativo"}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">· {agentCtx.clientName}</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${agentCtx.brandBrainReadiness === 10 ? "bg-[var(--success-bg)] text-[var(--success)]" : agentCtx.brandBrainReadiness >= 5 ? "bg-[var(--accent-light)] text-[var(--navy)]" : "bg-[var(--accent)] text-[var(--text-muted)]"}`}>
                      {agentCtx.brandBrainReadiness}/10
                    </span>
                  </div>
                  {agentCtx.brandBrain?.positioning && (
                    <p className="text-[11px] text-[var(--text-secondary)] leading-snug truncate">{agentCtx.brandBrain.positioning}</p>
                  )}
                </div>
              )}

              {/* Existing deliverables note */}
              {existingStrategyDelivs.length > 0 && (
                <div className="rounded-[7px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {existingStrategyDelivs.length} strategy canvas já salvo neste projeto. Gerar novamente cria nova versão.
                  </p>
                </div>
              )}

              {/* What gets generated */}
              {linkedProject && (
                <div className="rounded-[8px] border border-[var(--cyan)] bg-[var(--accent-light)] px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: ACCENT }}>Será gerado</p>
                  <ul className="space-y-1">
                    {["Diagnóstico de negócio", "Posicionamento estratégico", "Público-alvo definido", "Canais e serviços prioritários", "Roadmap de execução", "Quality Gate (8 critérios)"].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error */}
              {runError && (
                <div className="rounded-[7px] bg-[var(--danger-bg)] border border-[#FECACA] px-3 py-2">
                  <p className="text-[11px] text-[var(--danger)]">{runError}</p>
                </div>
              )}

              {/* CTA */}
              {agentState === "idle" && (
                <button
                  disabled={!linkedProject}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: linkedProject ? ACCENT : "#9CA3AF" }}
                >
                  {!linkedProject ? "Selecione um projeto para começar" : "✦ Gerar Strategy Canvas"}
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

          {/* ── RIGHT ── */}

          {agentState === "idle" && !linkedProject && (
            <div className="bg-white rounded-[10px] border border-dashed border-[var(--border)] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke={ACCENT} strokeWidth="1.5"/>
                  <path d="M12.5 7.5L11 11l-3.5 1.5L9 9l3.5-1.5z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Departamento de Estratégia</p>
              <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto">Selecione um projeto para que o Dioli Brain gere o Strategy Canvas — diagnóstico, posicionamento e roadmap em segundos.</p>
            </div>
          )}

          {agentState === "idle" && linkedProject && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke={ACCENT} strokeWidth="1.5"/>
                  <path d="M14 8L12 12.5l-4 1.5L10 9.5 14 8z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">Pronto para raciocinar</p>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                {linkedClient?.name} · o Dioli Brain vai analisar o contexto do cliente e gerar um Strategy Canvas completo com diagnóstico, posicionamento e roadmap.
              </p>
            </div>
          )}

          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[var(--success-bg)]" : i === stepIndex ? "" : "bg-[var(--accent)]"}`}
                      style={i === stepIndex ? { backgroundColor: "#E6FBFA" } : {}}>
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
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

          {agentState === "output_ready" && canvas && (
            <div className="space-y-4">
              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-2.5 space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-[var(--warning)]">{w}</p>
                  ))}
                </div>
              )}

              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg)]"}`}
                    style={activeTab === t.id ? { backgroundColor: ACCENT } : {}}>
                    {t.label}
                    {t.id === "quality" && qg && (
                      <span className={`ml-1.5 text-[10px] font-bold ${qg.overall === "PASS" ? "text-[var(--success)]" : qg.overall === "WARNING" ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}>
                        {qg.overall}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Diagnóstico */}
              {activeTab === "diagnostico" && (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-4">
                  <Field label="Diagnóstico de negócio" value={canvas.businessSummary} />
                  <Field label="Objetivo principal" value={canvas.mainObjective} />
                  {canvas.secondaryObjectives.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Objetivos secundários</div>
                      <ul className="space-y-1">
                        {canvas.secondaryObjectives.map((o, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />{o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {canvas.differentiators.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Diferenciais</div>
                      <div className="flex flex-wrap gap-1.5">
                        {canvas.differentiators.map((d) => (
                          <span key={d} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-light)]" style={{ color: ACCENT }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Posição & Público */}
              {activeTab === "posicao" && (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 space-y-4">
                  <Field label="Posicionamento" value={canvas.positioningStatement} />
                  <Field label="Público-alvo" value={canvas.audience} />
                  <Field label="Direção de comunicação" value={canvas.communicationDirection} />
                  {canvas.painPoints.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Dores do público</div>
                      <ul className="space-y-1">
                        {canvas.painPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {canvas.competitiveAdvantages.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Vantagens competitivas</div>
                      <ul className="space-y-1">
                        {canvas.competitiveAdvantages.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Canais & Serviços */}
              {activeTab === "canais" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Canais prioritários</div>
                    <div className="flex flex-wrap gap-2">
                      {canvas.priorityChannels.map((ch) => (
                        <span key={ch} className="px-3 py-1 rounded-full text-[12px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>{ch}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Serviços recomendados</div>
                    <ul className="space-y-1">
                      {canvas.recommendedServices.map((s, i) => (
                        <li key={i} className="flex items-center gap-2 text-[13px] text-[var(--text-primary)]">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Territórios de conteúdo</div>
                    <div className="flex flex-wrap gap-2">
                      {canvas.contentTerritories.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--accent-light)]" style={{ color: ACCENT }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Roadmap */}
              {activeTab === "roadmap" && (
                <div className="space-y-3">
                  {canvas.recommendedRoadmap.map((phase, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: ACCENT }}>{i + 1}</span>
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{phase.phase}</span>
                        </div>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-light)]" style={{ color: ACCENT }}>
                          {phase.durationWeeks} {phase.durationWeeks === 1 ? "semana" : "semanas"}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{phase.focus}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Riscos & Oportunidades */}
              {activeTab === "riscos" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[10px] border border-[#FECACA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--danger)] uppercase tracking-[0.05em] mb-2">Riscos identificados</div>
                    <ul className="space-y-1.5">
                      {canvas.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white rounded-[10px] border border-[#BBF7D0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-[0.05em] mb-2">Oportunidades</div>
                    <ul className="space-y-1.5">
                      {canvas.opportunities.map((o, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Quality Gate */}
              {activeTab === "quality" && qg && (
                <div className="space-y-3">
                  <div className={`rounded-[10px] border px-5 py-4 flex items-center justify-between ${qg.overall === "PASS" ? "bg-[#F0FDF4] border-[#BBF7D0]" : qg.overall === "WARNING" ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[var(--danger-bg)] border-[#FECACA]"}`}>
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">Veredito: {qg.overall}</p>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{qg.passCount} pass · {qg.warningCount} warning · {qg.failCount} fail</p>
                    </div>
                    <span className={`text-[20px] font-black ${qg.overall === "PASS" ? "text-[var(--success)]" : qg.overall === "WARNING" ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}>
                      {qg.overall === "PASS" ? "✓" : qg.overall === "WARNING" ? "⚠" : "✗"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {qg.items.map((item) => (
                      <div key={item.id} className="bg-white rounded-[8px] border border-[var(--border)] px-4 py-3 flex items-start gap-3">
                        <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${item.status === "PASS" ? "bg-[var(--success)]" : item.status === "WARNING" ? "bg-[var(--warning)]" : "bg-[var(--danger)]"}`}>
                          {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                        </span>
                        <div>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                          <p className="text-[11px] text-[var(--text-muted)] leading-snug">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save footer */}
              <div className="flex items-center justify-between bg-[var(--bg)] rounded-[12px] border border-[var(--border)] px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Salvar Strategy Canvas como entrega</p>
                  <p className="text-[12px] text-[var(--text-muted)]">Vai para revisão como "strategy_document" no projeto.</p>
                </div>
                {saved ? (
                  <span className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[var(--success-bg)] text-[var(--success)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Salvo no projeto
                  </span>
                ) : (
                  <button onClick={handleSave} className="h-9 px-5 rounded-[8px] text-white text-[13px] font-medium transition-colors hover:opacity-90 shrink-0"
                    style={{ backgroundColor: ACCENT }}>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">{label}</div>
      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{value}</p>
    </div>
  );
}
