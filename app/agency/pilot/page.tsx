"use client";

import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

// ─── Sushi Cazza Pilot — Guided End-to-End Run ────────────────────────────────
//
// Step-by-step guide to run the complete agency pipeline with the first real
// client. Each step links directly to the right agent with context on what
// to do and what to expect.
// ─────────────────────────────────────────────────────────────────────────────

interface PilotStep {
  number: number;
  dept: string;
  title: string;
  description: string;
  action: string;
  href: string;
  color: string;
  deliverableType: string;
  expectedOutput: string;
}

const PILOT_STEPS: PilotStep[] = [
  {
    number: 1,
    dept: "Gestão de Projetos",
    title: "PM Assessment",
    description: "O PM Agent analisa o estado do projeto, gera prioridades e um plano semanal. Ponto de partida para qualquer projeto.",
    action: "Abrir PM Agent",
    href: "/agency/pm-agent",
    color: "#1A1A1A",
    deliverableType: "planning",
    expectedOutput: "Assessment de saúde do projeto + plano semanal",
  },
  {
    number: 2,
    dept: "Estratégia",
    title: "Strategy Canvas",
    description: "O Strategy Agent gera diagnóstico, posicionamento, público-alvo, canais e roadmap. Base para todos os outros departamentos.",
    action: "Abrir Strategy Agent",
    href: "/agency/strategy-agent",
    color: "#7C3AED",
    deliverableType: "strategy_document",
    expectedOutput: "Strategy Canvas com 6 abas + Quality Gate",
  },
  {
    number: 3,
    dept: "Brand Hub",
    title: "Brand Health Report",
    description: "O Brand Guardian analisa o Brand Brain do cliente — pontos fortes, lacunas, tom de voz e alertas de consistência.",
    action: "Abrir Brand Hub",
    href: "/agency/brand-hub-agent",
    color: "#C2530A",
    deliverableType: "document",
    expectedOutput: "Relatório de saúde da marca com score e sugestões",
  },
  {
    number: 4,
    dept: "Social Media",
    title: "Calendário Editorial",
    description: "O Social Agent gera estratégia de conteúdo, calendário editorial, posts e stories baseados no Brand Brain.",
    action: "Abrir Social Agent",
    href: "/agency/social-media-agent",
    color: "#E53E3E",
    deliverableType: "social_media",
    expectedOutput: "Calendário 30 dias + 4 posts + 3 stories",
  },
  {
    number: 5,
    dept: "Design",
    title: "Visual Briefs",
    description: "O Design Agent gera briefs visuais detalhados para cada peça criativa — conceito, paleta, tipografia e instruções de produção.",
    action: "Abrir Design Agent",
    href: "/agency/design-agent",
    color: "#2563EB",
    deliverableType: "design",
    expectedOutput: "Briefs visuais para todas as peças de design",
  },
  {
    number: 6,
    dept: "Tráfego Pago",
    title: "Plano de Mídia",
    description: "O Ads Agent arquiteta o plano de tráfego pago — funil, audiências, copy, criativos e otimizações. Requer proposta aprovada.",
    action: "Abrir Ads Agent",
    href: "/agency/ads-agent",
    color: "#0E7490",
    deliverableType: "paid_traffic",
    expectedOutput: "Estratégia de campanha + 6 entregas de ads",
  },
  {
    number: 7,
    dept: "Aprovações",
    title: "Enviar ao Cliente",
    description: "Após gerar e revisar todas as entregas, envie para aprovação no portal do cliente. O cliente visualiza e aprova cada entrega.",
    action: "Ver Aprovações",
    href: "/agency/approvals",
    color: "#059669",
    deliverableType: "",
    expectedOutput: "Entregas aprovadas pelo cliente no portal",
  },
];

export default function PilotPage() {
  const { clients, projects, deliverables } = useAgencyStore();

  // Find Sushikasa (first client with food industry)
  const sushiClient = clients.find((c) => c.name.toLowerCase().includes("sushi") || c.industry?.toLowerCase().includes("food"));
  const sushiProjects = sushiClient ? projects.filter((p) => p.clientId === sushiClient.id) : [];
  const activeProject = sushiProjects.find((p) => p.stage !== "completed") ?? sushiProjects[0] ?? null;

  const getDelivCount = (type: string) =>
    type && activeProject
      ? deliverables.filter((d) => d.projectId === activeProject.id && d.type === type).length
      : 0;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Piloto — Sushi Cazza"
        subtitle="Guia passo a passo para rodar o pipeline completo da agência com o primeiro cliente real."
      />

      <div className="flex-1 p-6 max-w-[900px] mx-auto w-full space-y-6">
        {/* Client card */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[8px] bg-[#FFF7ED] flex items-center justify-center text-[16px] font-bold text-[#C2530A]">S</div>
              <div>
                <p className="text-[14px] font-semibold text-[#1A1A1A]">{sushiClient?.name ?? "Sushikasa"}</p>
                <p className="text-[11px] text-[#9B9B95]">{sushiClient?.industry ?? "Food & Beverage"} · {sushiProjects.length} projeto(s)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sushiClient && (
                <Link href={`/agency/clients/${sushiClient.id}`} className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                  Ver cliente →
                </Link>
              )}
              {activeProject && (
                <Link href={`/agency/projects/${activeProject.id}`} className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#1A1A1A] text-white hover:bg-[#111111] transition-colors">
                  {activeProject.name} →
                </Link>
              )}
            </div>
          </div>
          {activeProject && (
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <span className="text-[11px] text-[#9B9B95]">Projeto ativo: <span className="text-[#1A1A1A] font-medium">{activeProject.name}</span></span>
              <span className="text-[11px] text-[#9B9B95]">Estágio: <span className="text-[#1A1A1A] font-medium capitalize">{activeProject.stage}</span></span>
              <span className="text-[11px] text-[#9B9B95]">Prazo: <span className="text-[#1A1A1A] font-medium">{activeProject.deadline}</span></span>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[10px] px-5 py-4">
          <p className="text-[12px] font-semibold text-[#7C3AED] mb-1.5">Como funciona o piloto</p>
          <p className="text-[12px] text-[#6B6B65] leading-relaxed">
            Execute cada departamento em sequência. Cada agente usa o Brand Brain do cliente e o contexto do projeto para raciocinar.
            Salve cada entrega como revisável — depois aprove ou solicite alterações antes de enviar ao portal do cliente.
            A IA está conectada se você configurou uma chave em <Link href="/agency/integrations" className="text-[#7C3AED] hover:underline font-medium">Integrações</Link>.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {PILOT_STEPS.map((step) => {
            const delivCount = getDelivCount(step.deliverableType);
            const isDone = delivCount > 0;

            return (
              <div key={step.number}
                className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 ${isDone ? "border-[#BBF7D0]" : "border-[#E5E5E2]"}`}>
                <div className="flex items-start gap-4">
                  {/* Step number */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                    style={{ backgroundColor: isDone ? "#16A34A" : step.color }}>
                    {isDone ? (
                      <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                        <path d="M1 5.5l3.5 3.5L13 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : step.number}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: step.color }}>{step.dept}</span>
                      {isDone && (
                        <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded-full">{delivCount} entrega(s) salva(s)</span>
                      )}
                    </div>
                    <p className="text-[14px] font-semibold text-[#1A1A1A] mb-1">{step.title}</p>
                    <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-2">{step.description}</p>
                    <p className="text-[11px] text-[#9B9B95]">
                      <span className="font-medium text-[#6B6B65]">Saída esperada:</span> {step.expectedOutput}
                    </p>
                  </div>

                  {/* CTA */}
                  <div className="shrink-0">
                    <Link href={step.href}
                      className="h-8 px-4 rounded-[7px] text-[12px] font-semibold text-white inline-flex items-center transition-colors hover:opacity-90"
                      style={{ backgroundColor: isDone ? "#16A34A" : step.color }}>
                      {isDone ? "Executar novamente" : step.action} →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom links */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/agency/maestro" className="text-[12px] text-[#5B5BD6] hover:underline">
            ← Painel Maestro
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/agency/deliverables" className="text-[12px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">
              Ver todas as entregas →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
