"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";

// ─── Piloto — Jornada Ponta a Ponta ──────────────────────────────────────────
//
// Começa do ZERO, na pele do cliente. O fluxo é:
//   Fase 1 — Você é o cliente: preenche o briefing (input).
//   Fase 2 — A agência recebe: analisa e converte em projeto (cria o cliente).
//   Fase 3 — Os agentes de IA produzem: PM → Estratégia → Marca → Social → Design → Ads.
//   Fase 4 — Aprovação e entrega ao cliente no portal.
// ─────────────────────────────────────────────────────────────────────────────

interface Step {
  number: number;
  who: "cliente" | "agência";
  dept: string;
  title: string;
  description: string;
  action: string;
  href: string;
  color: string;
  // How we detect this step is done from store state.
  done: (s: PilotProgress) => boolean;
  hint?: string;
}

interface PilotProgress {
  briefingSubmitted: boolean;
  projectCreated: boolean;
  delivByType: Record<string, number>;
}

const PHASES: { id: number; label: string; subtitle: string; color: string; steps: Step[] }[] = [
  {
    id: 1,
    label: "Fase 1 — Você é o cliente",
    subtitle: "Dê os inputs do seu negócio, passo a passo, como se fosse um cliente novo.",
    color: "#1A1A1A",
    steps: [
      {
        number: 1,
        who: "cliente",
        dept: "Briefing",
        title: "Preencher o briefing",
        description: "Converse com a Dioli, conte sobre o negócio, objetivos e canais. No fim, anexe o que tiver (logo, brand book) e envie. Isso cria a primeira solicitação.",
        action: "Abrir briefing do cliente",
        href: "/briefing",
        color: "#1A1A1A",
        done: (s) => s.briefingSubmitted,
        hint: "É o formulário público — você entra como o cliente, sem login.",
      },
    ],
  },
  {
    id: 2,
    label: "Fase 2 — A agência recebe",
    subtitle: "Agora você troca de chapéu: vira a agência e processa a solicitação que chegou.",
    color: "#5B5BD6",
    steps: [
      {
        number: 2,
        who: "agência",
        dept: "Solicitações",
        title: "Analisar e criar o projeto",
        description: "A solicitação aparece em Solicitações. Abra-a, clique em Analisar e depois em Converter em projeto. Isso cria o cliente e o projeto automaticamente.",
        action: "Abrir Solicitações",
        href: "/agency/requests",
        color: "#5B5BD6",
        done: (s) => s.projectCreated,
        hint: "Ao converter, o registro do cliente é criado — não precisa criar cliente à mão.",
      },
    ],
  },
  {
    id: 3,
    label: "Fase 3 — Os agentes de IA produzem",
    subtitle: "Com o projeto criado, rode cada departamento. Cada agente usa o contexto do cliente para raciocinar.",
    color: "#7C3AED",
    steps: [
      {
        number: 3,
        who: "agência",
        dept: "Gestão de Projetos",
        title: "PM Assessment",
        description: "O PM Agent analisa o estado do projeto, gera prioridades e plano semanal.",
        action: "Abrir PM Agent",
        href: "/agency/pm-agent",
        color: "#1A1A1A",
        done: (s) => (s.delivByType["planning"] ?? 0) > 0,
      },
      {
        number: 4,
        who: "agência",
        dept: "Estratégia",
        title: "Strategy Canvas",
        description: "Diagnóstico, posicionamento, público, canais e roadmap. Base de tudo.",
        action: "Abrir Strategy Agent",
        href: "/agency/strategy-agent",
        color: "#7C3AED",
        done: (s) => (s.delivByType["strategy_document"] ?? 0) > 0,
      },
      {
        number: 5,
        who: "agência",
        dept: "Brand Hub",
        title: "Brand Health Report",
        description: "Análise da saúde da marca — pontos fortes, lacunas, tom de voz e sugestões.",
        action: "Abrir Brand Hub",
        href: "/agency/brand-hub-agent",
        color: "#C2530A",
        done: (s) => (s.delivByType["document"] ?? 0) > 0,
      },
      {
        number: 6,
        who: "agência",
        dept: "Social Media",
        title: "Calendário Editorial",
        description: "Estratégia de conteúdo, calendário, posts e stories a partir do Brand Brain.",
        action: "Abrir Social Agent",
        href: "/agency/social-media-agent",
        color: "#E53E3E",
        done: (s) => (s.delivByType["social_media"] ?? 0) > 0,
      },
      {
        number: 7,
        who: "agência",
        dept: "Design",
        title: "Visual Briefs",
        description: "Briefs visuais detalhados para cada peça — conceito, paleta, instruções.",
        action: "Abrir Design Agent",
        href: "/agency/design-agent",
        color: "#2563EB",
        done: (s) => (s.delivByType["design"] ?? 0) > 0,
      },
      {
        number: 8,
        who: "agência",
        dept: "Tráfego Pago",
        title: "Plano de Mídia",
        description: "Funil, audiências, copy, criativos e otimizações. Requer proposta aprovada.",
        action: "Abrir Ads Agent",
        href: "/agency/ads-agent",
        color: "#0E7490",
        done: (s) => (s.delivByType["paid_traffic"] ?? 0) > 0,
      },
    ],
  },
  {
    id: 4,
    label: "Fase 4 — Aprovação e entrega",
    subtitle: "Revise tudo, aprove e envie ao portal do cliente.",
    color: "#059669",
    steps: [
      {
        number: 9,
        who: "agência",
        dept: "Aprovações",
        title: "Revisar e aprovar",
        description: "Todas as entregas em revisão aparecem aqui. Aprove ou peça alterações antes de mandar ao cliente.",
        action: "Abrir Aprovações",
        href: "/agency/approvals",
        color: "#059669",
        done: () => false,
      },
    ],
  },
];

export default function PilotPage() {
  const { clients, projects, deliverables, clientRequests, clearAllData } = useAgencyStore();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [aiStatus, setAiStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading");

  useEffect(() => {
    fetch("/api/ai-keys")
      .then((r) => r.json())
      .then((data) => {
        const anyConnected = data.providers?.some((p: { configured: boolean }) => p.configured);
        setAiStatus(anyConnected ? "connected" : "disconnected");
      })
      .catch(() => setAiStatus("error"));
  }, []);

  // Most-recent project = the one this pilot is working through.
  const activeProject = projects.length > 0 ? projects[projects.length - 1] : null;
  const activeClient = activeProject ? clients.find((c) => c.id === activeProject.clientId) : null;

  const delivByType: Record<string, number> = {};
  if (activeProject) {
    for (const d of deliverables) {
      if (d.projectId === activeProject.id) delivByType[d.type] = (delivByType[d.type] ?? 0) + 1;
    }
  }

  const progress: PilotProgress = {
    briefingSubmitted: (clientRequests ?? []).length > 0,
    projectCreated: projects.length > 0,
    delivByType,
  };

  const totalSteps = PHASES.reduce((n, p) => n + p.steps.length, 0);
  const doneSteps = PHASES.reduce((n, p) => n + p.steps.filter((st) => st.done(progress)).length, 0);

  function handleReset() {
    clearAllData();
    setConfirmingReset(false);
    if (typeof window !== "undefined") {
      // Drop persisted client-side AI run logs etc. handled by store; nothing else needed.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const isEmpty = clients.length === 0 && projects.length === 0 && (clientRequests ?? []).length === 0;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Piloto — Ponta a Ponta"
        subtitle="Comece do zero, na pele do cliente, e percorra todo o processo até a entrega."
      />

      <div className="flex-1 p-6 max-w-[920px] mx-auto w-full space-y-6">
        {/* ── Reset / status bar ── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[13px] font-semibold text-[#1A1A1A]">
                {isEmpty ? "Sistema zerado — pronto para começar" : `Progresso: ${doneSteps}/${totalSteps} etapas`}
              </p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">
                {isEmpty
                  ? "Nenhum cliente, projeto ou solicitação. Comece pela Fase 1."
                  : `${(clientRequests ?? []).length} solicitação(ões) · ${projects.length} projeto(s) · ${clients.length} cliente(s)`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!confirmingReset ? (
                <button
                  onClick={() => setConfirmingReset(true)}
                  className="h-8 px-4 rounded-[7px] border border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] hover:border-[#F87171] text-[12px] font-semibold transition-colors"
                >
                  ⟲ Começar do zero
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#DC2626] font-medium">Apagar tudo e zerar?</span>
                  <button onClick={handleReset}
                    className="h-8 px-3 rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12px] font-semibold transition-colors">
                    Sim, zerar
                  </button>
                  <button onClick={() => setConfirmingReset(false)}
                    className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] text-[12px] font-medium transition-colors">
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 w-full bg-[#F0F0ED] rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 bg-[#16A34A] rounded-full transition-all" style={{ width: `${(doneSteps / totalSteps) * 100}%` }} />
          </div>
        </div>

        {/* ── URLs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Link do cliente (input)</p>
            <Link href="/briefing" className="text-[13px] font-mono text-[#1A1A1A] hover:text-[#5B5BD6] transition-colors">/briefing</Link>
            <p className="text-[11px] text-[#9B9B95] mt-1 leading-snug">É aqui que o cliente entra e dá os inputs. Sem login.</p>
          </div>
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Link da agência (admin)</p>
            <Link href="/agency/requests" className="text-[13px] font-mono text-[#1A1A1A] hover:text-[#5B5BD6] transition-colors">/agency/requests</Link>
            <p className="text-[11px] text-[#9B9B95] mt-1 leading-snug">Onde a solicitação do cliente chega para você processar.</p>
          </div>
        </div>

        {/* ── AI connection warning ── */}
        {aiStatus === "disconnected" && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] px-5 py-4 flex items-start gap-3">
            <span className="text-[20px] leading-none shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#92400E]">Nenhuma IA conectada</p>
              <p className="text-[12px] text-[#78350F] mt-0.5 leading-relaxed">
                Os agentes vão rodar no modo regras — sem raciocínio real de IA. Para ativar Claude, OpenAI ou Gemini, clique em{" "}
                <strong>Conectar IA</strong> e cole a chave. Leva menos de 1 minuto.
              </p>
            </div>
            <Link
              href="/agency/integrations"
              className="shrink-0 h-8 px-4 rounded-[7px] bg-[#F59E0B] hover:bg-[#D97706] text-white text-[12px] font-semibold transition-colors inline-flex items-center"
            >
              Conectar IA →
            </Link>
          </div>
        )}

        {/* Active project banner */}
        {activeProject && (
          <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[10px] px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold text-[#7C3AED]">Projeto ativo do piloto</p>
              <p className="text-[12px] text-[#6B6B65] mt-0.5">
                <span className="font-medium text-[#1A1A1A]">{activeProject.name}</span>
                {activeClient && <> · {activeClient.name}</>} · {activeProject.stage}
              </p>
            </div>
            <Link href={`/agency/projects/${activeProject.id}`}
              className="h-8 px-4 rounded-[7px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[12px] font-medium transition-colors shrink-0">
              Ver projeto →
            </Link>
          </div>
        )}

        {/* ── Phases ── */}
        {PHASES.map((phase) => {
          const phaseDone = phase.steps.every((st) => st.done(progress));
          return (
            <div key={phase.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ backgroundColor: phaseDone ? "#16A34A" : phase.color }}>
                  {phaseDone ? "✓" : phase.id}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-[#1A1A1A]">{phase.label}</p>
                  <p className="text-[12px] text-[#9B9B95]">{phase.subtitle}</p>
                </div>
              </div>

              <div className="space-y-2.5 ml-3 pl-5 border-l-2 border-[#F0F0ED]">
                {phase.steps.map((step) => {
                  const isDone = step.done(progress);
                  return (
                    <div key={step.number}
                      className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 ${isDone ? "border-[#BBF7D0]" : "border-[#E5E5E2]"}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                          style={{ backgroundColor: isDone ? "#16A34A" : step.color }}>
                          {isDone ? (
                            <svg width="13" height="10" viewBox="0 0 14 11" fill="none">
                              <path d="M1 5.5l3.5 3.5L13 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : step.number}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: step.color }}>{step.dept}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${step.who === "cliente" ? "bg-[#F0F0ED] text-[#6B6B65]" : "bg-[#EEF0FF] text-[#5B5BD6]"}`}>
                              {step.who === "cliente" ? "VOCÊ = CLIENTE" : "VOCÊ = AGÊNCIA"}
                            </span>
                            {isDone && (
                              <span className="text-[9px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded-full">feito ✓</span>
                            )}
                          </div>
                          <p className="text-[14px] font-semibold text-[#1A1A1A] mb-1">{step.title}</p>
                          <p className="text-[12px] text-[#6B6B65] leading-relaxed">{step.description}</p>
                          {step.hint && (
                            <p className="text-[11px] text-[#9B9B95] mt-1.5 italic">{step.hint}</p>
                          )}
                        </div>

                        <div className="shrink-0">
                          <Link href={step.href}
                            className="h-8 px-4 rounded-[7px] text-[12px] font-semibold text-white inline-flex items-center transition-colors hover:opacity-90"
                            style={{ backgroundColor: isDone ? "#16A34A" : step.color }}>
                            {isDone ? "Abrir de novo" : step.action} →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Bottom links */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/agency/maestro" className="text-[12px] text-[#5B5BD6] hover:underline">← Painel Maestro</Link>
          <Link href="/agency/deliverables" className="text-[12px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">Ver todas as entregas →</Link>
        </div>
      </div>
    </div>
  );
}
