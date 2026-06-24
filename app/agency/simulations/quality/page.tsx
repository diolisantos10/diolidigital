"use client";

import { useState } from "react";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateAnalyticsCanvas } from "@/lib/dioli-brain/analytics-engine";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";
import { computeQualityScorecard } from "@/lib/dioli-brain/quality-scorecard";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";
import { QualityAuditCard } from "@/components/agency/quality/QualityAuditCard";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

interface QualityScenario {
  id: string; label: string; businessName: string; segment: string;
  objectives: string[]; services: string[]; rawContext: string;
  withTraffic: boolean; withAnalytics: boolean;
}

const SCENARIOS: QualityScenario[] = [
  { id: "restaurant",          label: "Restaurante",         businessName: "Cantina da Praça",    segment: "Restaurante italiano de bairro",       objectives: ["mais clientes no salão"],                  services: ["Social Media", "Tráfego Pago"], rawContext: "Restaurante familiar, movimento fraco seg–qua.",              withTraffic: true,  withAnalytics: true  },
  { id: "premium-restaurant",  label: "Rest. premium",       businessName: "Maré Alta",           segment: "Restaurante premium de frutos do mar", objectives: ["aumentar reservas em datas especiais"],    services: ["Social Media", "Tráfego Pago"], rawContext: "Casa sofisticada com chef autoral, ticket alto.",              withTraffic: true,  withAnalytics: true  },
  { id: "ecommerce",           label: "E-commerce",          businessName: "Vitrine Verde",       segment: "E-commerce de produtos naturais",      objectives: ["reduzir CAC", "aumentar recompra"],        services: ["Tráfego Pago"],                 rawContext: "Loja com 200 produtos, carrinho abandonado alto.",             withTraffic: true,  withAnalytics: true  },
  { id: "clinic",              label: "Clínica",             businessName: "Clínica Vitalis",     segment: "Clínica odontológica",                 objectives: ["preencher agenda ociosa"],                 services: ["Social Media", "Tráfego Pago"], rawContext: "Clínica com 3 dentistas, concorrência local forte.",           withTraffic: true,  withAnalytics: true  },
  { id: "beauty",              label: "Beleza",              businessName: "Studio Aurora",       segment: "Salão de beleza e estética capilar",   objectives: ["agenda cheia"],                            services: ["Social Media"],                 rawContext: "Salão especializado em loiras, agenda vazia de terça a quinta.", withTraffic: false, withAnalytics: false },
  { id: "gym",                 label: "Academia",            businessName: "Forja Fitness",       segment: "Academia de musculação e crossfit",    objectives: ["aumentar matrículas"],                     services: ["Social Media", "Tráfego Pago"], rawContext: "Academia de bairro, perde alunos no inverno.",                withTraffic: true,  withAnalytics: true  },
  { id: "consulting",          label: "Consultoria B2B",     businessName: "Prisma Consultoria",  segment: "Consultoria empresarial para PMEs",    objectives: ["gerar leads qualificados"],                services: ["Tráfego Pago"],                 rawContext: "Consultoria sem canal previsível de aquisição.",               withTraffic: true,  withAnalytics: true  },
  { id: "education",           label: "Educação",            businessName: "Colégio Horizonte",   segment: "Educação — escola bilíngue",           objectives: ["aumentar matrículas"],                     services: ["Social Media", "Tráfego Pago"], rawContext: "Escola bilíngue, período de matrícula se aproximando.",        withTraffic: true,  withAnalytics: true  },
];

export default function QualitySimulatorPage() {
  const [canvases, setCanvases] = useState<QualityCanvas[]>([]);

  function runScenarioCanvas(s: QualityScenario): QualityCanvas {
    const strategy  = generateStrategyCanvas({ businessName: s.businessName, segment: s.segment, objectives: s.objectives, services: s.services, rawContext: s.rawContext, source: "simulation" });
    const traffic   = s.withTraffic ? generateTrafficCanvas({ strategyCanvas: strategy, budgetScenario: "medium", source: "simulation" }) : undefined;
    const analytics = s.withAnalytics ? generateAnalyticsCanvas({ strategyCanvas: strategy, trafficCanvas: traffic, source: "simulation" }) : undefined;
    return generateQualityCanvas({ strategyCanvas: strategy, trafficCanvas: traffic, analyticsCanvas: analytics, source: "simulation" });
  }

  function runAll() { setCanvases(SCENARIOS.map(runScenarioCanvas)); }

  const scorecard  = computeQualityScorecard(canvases, 0);
  const passCount  = canvases.filter((c) => c.overallVerdict === "PASS").length;
  const warnCount  = canvases.filter((c) => c.overallVerdict === "WARNING").length;
  const blockCount = canvases.filter((c) => c.overallVerdict === "BLOCKED").length;

  return (
    <div>
      <AgencyHeader
        title="Simulador de Quality"
        subtitle="Roda auditorias cross-departamento completas: Quality Gate global + departamental, detecção de padrões, flags de risco, recomendações e candidatos a evidência."
        actions={<a href="/agency/quality" className="text-[11px] text-[#9B9B95] hover:text-[#070A1F]">Workspace Quality →</a>}
      />

      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3.5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold text-[#9B9B95] uppercase">Cenários</span>
          <div className="flex gap-2">
            <button onClick={runAll} className="h-7 px-3 rounded-[6px] bg-[#070A1F] hover:bg-[#0D1230] text-white text-[11px] font-semibold">
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
              className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] bg-white hover:border-[#070A1F] hover:text-[#070A1F] text-[#6B6B65] text-[11px] font-medium">
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {canvases.length > 0 && (
        <>
          <div className="rounded-[10px] border border-[#070A1F]/20 bg-[#E6FBFA]/60 px-4 py-3 mb-5">
            <div className="text-[9px] font-semibold text-[#070A1F] uppercase tracking-[0.08em] mb-2">Sessão — {canvases.length} auditoria(s)</div>
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-8">
              {[
                { label: "Total",            value: canvases.length },
                { label: "PASS",             value: passCount },
                { label: "WARNING",          value: warnCount },
                { label: "BLOCKED",          value: blockCount },
                { label: "Padrões",          value: scorecard.patternsIdentified },
                { label: "Recomendações",    value: scorecard.recommendationsGenerated },
                { label: "Candidatos ev.",   value: scorecard.evidenceCandidatesFound },
                { label: "Brain Changes",    value: 0 },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
                  <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {canvases.map((c) => <QualityAuditCard key={c.id} canvas={c} />)}
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
