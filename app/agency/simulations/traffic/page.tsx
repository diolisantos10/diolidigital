"use client";

import { useState } from "react";
import Link from "next/link";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { computeTrafficScorecard } from "@/lib/dioli-brain/traffic-scorecard";
import type { TrafficCanvas } from "@/lib/dioli-brain/traffic-canvas";
import { TrafficCanvasCard } from "@/components/agency/traffic/TrafficCanvasCard";

interface TrafficScenario {
  id: string; label: string; businessName: string; segment: string;
  objectives: string[]; services: string[]; rawContext: string;
  budgetScenario: "low" | "medium" | "high" | "premium";
}

const SCENARIOS: TrafficScenario[] = [
  { id: "restaurant", label: "Restaurante", businessName: "Cantina da Praça", segment: "Restaurante italiano de bairro", objectives: ["mais clientes no salão"], services: ["Tráfego Pago"], rawContext: "Restaurante familiar, movimento fraco seg–qua.", budgetScenario: "low" },
  { id: "premium-restaurant", label: "Restaurante premium", businessName: "Maré Alta", segment: "Restaurante premium de frutos do mar", objectives: ["aumentar reservas em datas especiais"], services: ["Tráfego Pago"], rawContext: "Casa sofisticada com chef autoral, ticket alto.", budgetScenario: "high" },
  { id: "ecommerce", label: "E-commerce", businessName: "Vitrine Verde", segment: "E-commerce de produtos naturais", objectives: ["reduzir CAC", "aumentar recompra"], services: ["Tráfego Pago"], rawContext: "Loja com 200 produtos, carrinho abandonado alto.", budgetScenario: "medium" },
  { id: "clinic", label: "Clínica", businessName: "Clínica Vitalis", segment: "Clínica odontológica", objectives: ["preencher agenda ociosa"], services: ["Tráfego Pago"], rawContext: "Clínica com 3 dentistas, concorrência local forte.", budgetScenario: "medium" },
  { id: "beauty", label: "Beleza", businessName: "Studio Aurora", segment: "Salão de beleza e estética capilar", objectives: ["agenda cheia", "novos clientes de coloração"], services: ["Tráfego Pago"], rawContext: "Salão especializado em loiras, agenda vazia de terça a quinta.", budgetScenario: "low" },
  { id: "gym", label: "Academia", businessName: "Forja Fitness", segment: "Academia de musculação e crossfit", objectives: ["aumentar matrículas fora da temporada"], services: ["Tráfego Pago"], rawContext: "Academia de bairro, perde alunos no inverno.", budgetScenario: "medium" },
  { id: "consulting", label: "Consultoria B2B", businessName: "Prisma Consultoria", segment: "Consultoria empresarial para PMEs", objectives: ["gerar leads qualificados"], services: ["Tráfego Pago"], rawContext: "Consultoria sem canal previsível de aquisição.", budgetScenario: "high" },
  { id: "education", label: "Educação", businessName: "Colégio Horizonte", segment: "Educação — escola bilíngue", objectives: ["aumentar matrículas"], services: ["Tráfego Pago"], rawContext: "Escola bilíngue, período de matrícula se aproximando.", budgetScenario: "medium" },
];

export default function TrafficSimulatorPage() {
  const [canvases, setCanvases] = useState<TrafficCanvas[]>([]);

  function runScenarioCanvas(s: TrafficScenario): TrafficCanvas {
    const strategy = generateStrategyCanvas({ businessName: s.businessName, segment: s.segment, objectives: s.objectives, services: s.services, rawContext: s.rawContext, source: "simulation" });
    return generateTrafficCanvas({ strategyCanvas: strategy, budgetScenario: s.budgetScenario, source: "simulation" });
  }

  function runAll() { setCanvases(SCENARIOS.map(runScenarioCanvas)); }

  const scorecard = computeTrafficScorecard(canvases, 0);
  const passCount = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const warnCount = canvases.filter((c) => c.qualityGateResult.overall === "WARNING").length;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4 text-[12px] text-[#9B9B95]">
        <Link href="/agency/simulations" className="hover:text-[#6B6B65]">Laboratório</Link>
        <span>/</span>
        <span className="text-[#1A1A1A] font-medium">Tráfego Pago</span>
        <span className="ml-1 text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full">INTERNO</span>
        <a href="/agency/traffic" className="ml-auto text-[11px] text-[#9B9B95] hover:text-[#0284C7]">Workspace Traffic →</a>
      </div>

      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Simulador de Tráfego Pago</h1>
        <p className="text-[13px] text-[#6B6B65] mt-0.5 max-w-[640px] leading-relaxed">
          Gera Traffic Canvases completos por segmento: estrutura de campanhas, modelo de audiência, budget detalhado (fee separado), mapeamento de ofertas e projeções de CAC/ROAS.
        </p>
      </div>

      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3.5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold text-[#9B9B95] uppercase">Cenários</span>
          <div className="flex gap-2">
            <button onClick={runAll} className="h-7 px-3 rounded-[6px] bg-[#0284C7] hover:bg-[#0369A1] text-white text-[11px] font-semibold">
              ✦ Rodar todos ({SCENARIOS.length})
            </button>
            {canvases.length > 0 && (
              <button onClick={() => setCanvases([])} className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] text-[#9B9B95] text-[11px]">Limpar</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => setCanvases((prev) => [runScenarioCanvas(s), ...prev].slice(0, 20))}
              className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] bg-white hover:border-[#0284C7] hover:text-[#0284C7] text-[#6B6B65] text-[11px] font-medium">
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {canvases.length > 0 && (
        <>
          <div className="rounded-[10px] border border-[#0284C7]/20 bg-[#F0F9FF]/60 px-4 py-3 mb-5">
            <div className="text-[9px] font-semibold text-[#0284C7] uppercase tracking-[0.08em] mb-2">Sessão — {canvases.length} canvas(es)</div>
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-8">
              {[
                { label: "Total",      value: canvases.length },
                { label: "QG PASS",    value: passCount },
                { label: "QG WARN",    value: warnCount },
                { label: "Campanhas",  value: scorecard.campaignsPlanned },
                { label: "Budget total", value: `R$ ${scorecard.totalBudgetAllocated.toLocaleString("pt-BR")}` },
                { label: "Pass rate",  value: `${scorecard.qualityGatePassRate}%` },
                { label: "Evidências", value: scorecard.evidenceGenerated },
                { label: "Brain Changes", value: 0 },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
                  <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {canvases.map((c) => <TrafficCanvasCard key={c.id} canvas={c} />)}
          </div>
        </>
      )}

      {canvases.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[13px] text-[#9B9B95]">Nenhum cenário rodado ainda.</p>
        </div>
      )}
    </div>
  );
}
