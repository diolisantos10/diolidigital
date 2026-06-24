"use client";

import { useState } from "react";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { computeDesignScorecard } from "@/lib/dioli-brain/design-scorecard";
import type { DesignCanvas } from "@/lib/dioli-brain/design-canvas";
import { DesignCanvasCard } from "@/components/agency/design/DesignCanvasCard";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

// Synthetic scenarios — results stay in local state only (never persisted).
// Dioli Standard: Design runs Strategy → Social → Design chain fully synthetic.

interface DesignScenario {
  id: string;
  label: string;
  businessName: string;
  segment: string;
  objectives: string[];
  services: string[];
  rawContext: string;
}

const SCENARIOS: DesignScenario[] = [
  {
    id: "restaurant",
    label: "Restaurante",
    businessName: "Cantina da Praça",
    segment: "Restaurante italiano de bairro",
    objectives: ["mais clientes no salão", "pedidos diretos sem apps"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Restaurante familiar com 15 anos de história, movimento fraco de segunda a quarta, depende do iFood.",
  },
  {
    id: "premium-restaurant",
    label: "Restaurante premium",
    businessName: "Maré Alta",
    segment: "Restaurante premium de frutos do mar",
    objectives: ["consolidar posicionamento premium", "aumentar reservas"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Casa sofisticada com chef autoral, ticket médio alto, quer ser referência de alta gastronomia na cidade.",
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    businessName: "Vitrine Verde",
    segment: "E-commerce de produtos naturais",
    objectives: ["reduzir CAC", "aumentar recompra"],
    services: ["Social Media", "Design"],
    rawContext: "Loja online com catálogo de 200 produtos, carrinho abandonado alto, sem identidade visual consistente.",
  },
  {
    id: "clinic",
    label: "Clínica",
    businessName: "Clínica Vitalis",
    segment: "Clínica odontológica",
    objectives: ["preencher agenda ociosa", "transmitir autoridade clínica"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Clínica com 3 dentistas e estrutura nova, identidade visual genérica, concorrência local forte.",
  },
  {
    id: "beauty",
    label: "Beleza",
    businessName: "Studio Aurora",
    segment: "Salão de beleza e estética capilar",
    objectives: ["agenda cheia", "atrair clientes de coloração"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Salão especializado em loiras e mechas, portfólio desatualizado, identidade visual fraca.",
  },
  {
    id: "gym",
    label: "Academia",
    businessName: "Forja Fitness",
    segment: "Academia de musculação e crossfit",
    objectives: ["reduzir churn", "aumentar matrículas fora da temporada"],
    services: ["Social Media", "Design"],
    rawContext: "Academia de bairro com comunidade forte, perde alunos no inverno, visual fraco comparado à concorrência.",
  },
  {
    id: "consulting",
    label: "Serviços / Consultoria",
    businessName: "Prisma Consultoria",
    segment: "Consultoria empresarial para PMEs",
    objectives: ["gerar leads qualificados", "construir autoridade"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Consultoria sem identidade visual profissional, crescimento só por indicação, sem canal previsível.",
  },
  {
    id: "education",
    label: "Educação",
    businessName: "Colégio Horizonte",
    segment: "Educação — escola bilíngue de ensino fundamental",
    objectives: ["aumentar matrículas", "fortalecer confiança dos pais"],
    services: ["Social Media", "Design"],
    rawContext: "Escola bilíngue com metodologia própria, materiais de comunicação despadronizados.",
  },
];

export default function DesignSimulatorPage() {
  const [canvases, setCanvases] = useState<DesignCanvas[]>([]);

  function runScenarioCanvas(scenario: DesignScenario): DesignCanvas {
    // Full chain: synthetic Strategy → Social → Design
    const strategy = generateStrategyCanvas({
      businessName: scenario.businessName,
      segment: scenario.segment,
      objectives: scenario.objectives,
      services: scenario.services,
      rawContext: scenario.rawContext,
      source: "simulation",
    });
    const social = generateSocialCanvas({ strategyCanvas: strategy, source: "simulation" });
    return generateDesignCanvas({ socialCanvas: social, source: "simulation" });
  }

  function runScenario(scenario: DesignScenario) {
    setCanvases((prev) => [runScenarioCanvas(scenario), ...prev].slice(0, 20));
  }

  function runAll() {
    setCanvases(SCENARIOS.map(runScenarioCanvas));
  }

  const passCount = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const warnCount = canvases.filter((c) => c.qualityGateResult.overall === "WARNING").length;
  const failCount = canvases.filter((c) => c.qualityGateResult.overall === "FAIL").length;
  const scorecard = computeDesignScorecard(canvases, 0);

  return (
    <div>
      <AgencyHeader
        title="Simulador de Design"
        subtitle="Cada cenário executa a cadeia completa: Estratégia → Social → Design Canvas com briefs criativos, prompts de imagem e requisitos de assets. Resultados são locais à sessão — nada é salvo no pipeline real."
        actions={<a href="/agency/design" className="text-[11px] text-[#9B9B95] hover:text-[#EA580C] transition-colors">Workspace Design →</a>}
      />

      {/* Scenario buttons */}
      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3.5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Cenários</span>
          <div className="flex items-center gap-2">
            <button
              onClick={runAll}
              className="h-7 px-3 rounded-[6px] bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-semibold transition-colors"
            >
              ✦ Rodar todos ({SCENARIOS.length})
            </button>
            {canvases.length > 0 && (
              <button
                onClick={() => setCanvases([])}
                className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#6B6B65] text-[11px] transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => runScenario(s)}
              className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] bg-white hover:border-[#EA580C] hover:text-[#EA580C] text-[#6B6B65] text-[11px] font-medium transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Session results */}
      {canvases.length > 0 && (
        <>
          {/* Session scorecard */}
          <div className="rounded-[10px] border border-[#EA580C]/20 bg-[#FFF7ED]/60 px-4 py-3 mb-5">
            <div className="text-[9px] font-semibold text-[#EA580C] uppercase tracking-[0.08em] mb-2">
              Sessão — {canvases.length} canvas{canvases.length !== 1 ? "es" : ""} gerado{canvases.length !== 1 ? "s" : ""}
            </div>
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-8">
              {[
                { label: "Total", value: canvases.length },
                { label: "QG PASS",    value: passCount },
                { label: "QG WARN",    value: warnCount },
                { label: "QG FAIL",    value: failCount },
                { label: "Briefs",     value: scorecard.briefsGenerated },
                { label: "Prompts",    value: scorecard.promptsGenerated },
                { label: "Assets",     value: scorecard.assetsRequired },
                { label: "Pass rate",  value: `${scorecard.qualityGatePassRate}%` },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
                  <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Canvas results */}
          <div className="space-y-4">
            {canvases.map((canvas, i) => (
              <DesignCanvasCard key={canvas.id} canvas={canvas} />
            ))}
          </div>
        </>
      )}

      {canvases.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[13px] text-[#9B9B95] mb-1">Nenhum cenário rodado ainda.</p>
          <p className="text-[11px] text-[#C0C0BA]">
            Escolha um cenário acima ou rode todos para ver o Design Engine em ação.
          </p>
        </div>
      )}
    </div>
  );
}
