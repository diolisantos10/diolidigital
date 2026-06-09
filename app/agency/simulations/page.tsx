"use client";

import Link from "next/link";

interface SimCard {
  id: string;
  label: string;
  description: string;
  status: "available" | "coming_soon";
  href: string;
  tag: string;
}

const SIMULATORS: SimCard[] = [
  {
    id: "sdr",
    label: "SDR Agent",
    description: "Simule conversas do agente de pré-venda com prospectos. Teste cenários de objeção de preço, qualificação e escopo.",
    status: "available",
    href: "/agency/simulations/sdr",
    tag: "Vendas · Briefing",
  },
  {
    id: "training",
    label: "Treinamento Contínuo SDR",
    description: "Rode simulações automáticas, avalie performance do SDR e gerencie sugestões de melhoria. Resultados salvos no banco de dados.",
    status: "available",
    href: "/agency/simulations/training",
    tag: "SDR · Avaliação",
  },
  {
    id: "pm",
    label: "PM Agent",
    description: "Simule fluxos de gestão de projetos, aprovações e handoffs entre departamentos.",
    status: "coming_soon",
    href: "#",
    tag: "Operações",
  },
  {
    id: "social",
    label: "Social Agent",
    description: "Simule geração de pautas, revisões de conteúdo e fluxo de aprovação de posts.",
    status: "coming_soon",
    href: "#",
    tag: "Social Media",
  },
  {
    id: "design",
    label: "Design Agent",
    description: "Simule briefings criativos, geração de conceitos visuais e revisões de identidade de marca.",
    status: "coming_soon",
    href: "#",
    tag: "Design",
  },
  {
    id: "ads",
    label: "Paid Traffic Agent",
    description: "Simule estrutura de campanhas, análise de segmentação e otimização de criativos para mídia paga.",
    status: "coming_soon",
    href: "#",
    tag: "Tráfego Pago",
  },
];

export default function SimulationsPage() {
  return (
    <div>
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <FlaskIcon />
          <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Laboratório de Simulações</h1>
        </div>
        <p className="text-[13px] text-[#6B6B65] leading-relaxed max-w-[540px]">
          Ambiente interno para testar agentes sem afetar fluxos reais. Simulações SDR salvam resultados no banco para análise contínua.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-[700px]">
        {SIMULATORS.map((sim) => (
          <SimulatorCard key={sim.id} sim={sim} />
        ))}
      </div>
    </div>
  );
}

function SimulatorCard({ sim }: { sim: SimCard }) {
  const available = sim.status === "available";

  const inner = (
    <div
      className={`
        group relative flex flex-col gap-3 p-5 rounded-[12px] border transition-all
        ${available
          ? "border-[#E5E5E2] bg-white hover:border-[#5B5BD6]/40 hover:shadow-[0_2px_12px_rgba(91,91,214,0.08)] cursor-pointer"
          : "border-[#EBEBEA] bg-[#FAFAF9] cursor-default opacity-70"
        }
      `}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">
          {sim.tag}
        </span>
        {available ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#16A34A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            Disponível
          </span>
        ) : (
          <span className="text-[10px] text-[#C0C0BC]">Em breve</span>
        )}
      </div>

      {/* Content */}
      <div>
        <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-1">{sim.label}</h2>
        <p className="text-[12px] text-[#6B6B65] leading-relaxed">{sim.description}</p>
      </div>

      {/* CTA */}
      {available && (
        <div className="mt-auto pt-1">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#5B5BD6] group-hover:gap-1.5 transition-all">
            Abrir simulador
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      )}

      {/* Internal badge */}
      <div className="absolute top-3 right-3">
        <span className="text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full tracking-wide">
          INTERNO
        </span>
      </div>
    </div>
  );

  if (available) {
    return <Link href={sim.href}>{inner}</Link>;
  }
  return inner;
}

function FlaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-[#5B5BD6]">
      <path d="M6 2v5L3 12a1 1 0 00.9 1.5h8.2A1 1 0 0013 12l-3-5V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.5 2h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
