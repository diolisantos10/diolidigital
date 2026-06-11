"use client";

import { useState } from "react";
import Link from "next/link";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { computeSocialScorecard } from "@/lib/dioli-brain/social-scorecard";
import type { SocialCanvas } from "@/lib/dioli-brain/social-canvas";
import { SocialCanvasCard } from "@/components/agency/social/SocialCanvasCard";

// Synthetic scenarios — simulator results stay in local state only (never persisted).
// Dioli Standard: Social never runs without Strategy. Each scenario first generates
// a synthetic StrategyCanvas, then feeds it to the Social Engine.

interface SocialScenario {
  id: string;
  label: string;
  businessName: string;
  segment: string;
  objectives: string[];
  services: string[];
  rawContext: string;
}

const SCENARIOS: SocialScenario[] = [
  {
    id: "restaurant",
    label: "Restaurante",
    businessName: "Cantina da Praça",
    segment: "Restaurante italiano de bairro",
    objectives: ["mais clientes no salão", "pedidos diretos sem apps"],
    services: ["Social Media"],
    rawContext: "Restaurante familiar com 15 anos de história, movimento fraco de segunda a quarta, depende do iFood.",
  },
  {
    id: "premium-restaurant",
    label: "Restaurante premium",
    businessName: "Maré Alta",
    segment: "Restaurante premium de frutos do mar",
    objectives: ["consolidar posicionamento premium", "aumentar reservas em datas especiais"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Casa sofisticada com chef autoral, ticket médio alto, quer ser referência de alta gastronomia na cidade.",
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    businessName: "Vitrine Verde",
    segment: "E-commerce de produtos naturais",
    objectives: ["reduzir CAC", "aumentar recompra"],
    services: ["Social Media", "Tráfego Pago"],
    rawContext: "Loja online com catálogo de 200 produtos, carrinho abandonado alto, sem fluxo de e-mail.",
  },
  {
    id: "clinic",
    label: "Clínica",
    businessName: "Clínica Vitalis",
    segment: "Clínica odontológica",
    objectives: ["preencher agenda ociosa", "atrair pacientes de ortodontia"],
    services: ["Social Media", "Tráfego Pago"],
    rawContext: "Clínica com 3 dentistas e estrutura nova, concorrência local forte no Instagram.",
  },
  {
    id: "beauty",
    label: "Beleza",
    businessName: "Studio Aurora",
    segment: "Salão de beleza e estética capilar",
    objectives: ["agenda cheia na semana", "atrair clientes de coloração"],
    services: ["Social Media", "Identidade Visual"],
    rawContext: "Salão especializado em loiras e mechas, portfólio desatualizado, agenda vazia de terça a quinta.",
  },
  {
    id: "gym",
    label: "Academia",
    businessName: "Forja Fitness",
    segment: "Academia de musculação e crossfit",
    objectives: ["reduzir churn", "aumentar matrículas fora da temporada"],
    services: ["Social Media"],
    rawContext: "Academia de bairro com comunidade forte, perde alunos no inverno, concorre com rede low-cost vizinha.",
  },
  {
    id: "consulting",
    label: "Consultoria",
    businessName: "Prisma Consultoria",
    segment: "Consultoria empresarial para PMEs",
    objectives: ["gerar leads qualificados", "construir autoridade"],
    services: ["Social Media"],
    rawContext: "Consultoria especializada em PMEs de tecnologia, cresce só por indicação, sem canal previsível.",
  },
  {
    id: "education",
    label: "Educação",
    businessName: "Colégio Horizonte",
    segment: "Educação — escola bilíngue de ensino fundamental",
    objectives: ["aumentar matrículas", "fortalecer confiança dos pais"],
    services: ["Social Media"],
    rawContext: "Escola bilíngue com metodologia própria, concorrência de redes maiores, período de matrícula se aproximando.",
  },
];

export default function SocialSimulatorPage() {
  const [canvases, setCanvases] = useState<SocialCanvas[]>([]);

  function runScenarioCanvas(scenario: SocialScenario): SocialCanvas {
    // Step 1 — synthetic Strategy (Social never runs without Strategy)
    const strategy = generateStrategyCanvas({
      businessName: scenario.businessName,
      segment: scenario.segment,
      objectives: scenario.objectives,
      services: scenario.services,
      rawContext: scenario.rawContext,
      source: "simulation",
    });
    // Step 2 — Social Engine consumes the StrategyCanvas
    return generateSocialCanvas({ strategyCanvas: strategy, source: "simulation" });
  }

  function runScenario(scenario: SocialScenario) {
    setCanvases((prev) => [runScenarioCanvas(scenario), ...prev].slice(0, 20));
  }

  function runAll() {
    setCanvases(SCENARIOS.map(runScenarioCanvas));
  }

  const passCount = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const warnCount = canvases.filter((c) => c.qualityGateResult.overall === "WARNING").length;
  const failCount = canvases.filter((c) => c.qualityGateResult.overall === "FAIL").length;
  const scorecard = computeSocialScorecard(canvases, 0);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4 text-[12px] text-[#9B9B95]">
        <Link href="/agency/simulations" className="hover:text-[#6B6B65] transition-colors">
          Laboratório
        </Link>
        <span>/</span>
        <span className="text-[#1A1A1A] font-medium">Social Media</span>
        <span className="ml-1 text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full tracking-wide">
          INTERNO
        </span>
        <a
          href="/agency/social"
          className="ml-auto text-[11px] text-[#9B9B95] hover:text-[#DB2777] transition-colors"
        >
          Workspace Social →
        </a>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Simulador Social</h1>
        <p className="text-[13px] text-[#6B6B65] mt-0.5 max-w-[600px] leading-relaxed">
          Cada cenário gera uma estratégia sintética e a transforma em Social Canvas, plano de conteúdo
          e calendário editorial via Social Engine. Resultados são locais à sessão — nada é salvo no pipeline real.
        </p>
      </div>

      {/* Scenario buttons */}
      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3.5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Cenários</span>
          <div className="flex items-center gap-2">
            <button
              onClick={runAll}
              className="h-7 px-3 rounded-[6px] bg-[#DB2777] hover:bg-[#BE185D] text-white text-[11px] font-semibold transition-colors"
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
        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => runScenario(s)}
              className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] bg-white text-[#6B6B65] hover:border-[#DB2777] hover:text-[#DB2777] text-[11px] font-medium transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results summary + synthetic scorecard */}
      {canvases.length > 0 && (
        <>
          <div className="flex items-center gap-4 mb-3 text-[12px]">
            <span className="font-semibold text-[#1A1A1A]">{canvases.length} canvas{canvases.length > 1 ? "es" : ""}</span>
            <span className="text-[#16A34A]">{passCount} PASS</span>
            <span className="text-[#D97706]">{warnCount} WARNING</span>
            <span className="text-[#DC2626]">{failCount} FAIL</span>
            <span className="text-[#9B9B95] ml-auto">
              Quality Gate pass rate: {Math.round((passCount / canvases.length) * 100)}%
            </span>
          </div>
          <div className="bg-[#FDF2F8] border border-[#FBCFE8] rounded-[10px] px-4 py-3 mb-4">
            <div className="text-[10px] font-semibold text-[#DB2777] uppercase tracking-[0.05em] mb-2">
              Scorecard da sessão (sintético)
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">{scorecard.plansCreated}</div>
                <div className="text-[9px] text-[#9B9B95]">Planos gerados</div>
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">{scorecard.calendarsGenerated}</div>
                <div className="text-[9px] text-[#9B9B95]">Calendários</div>
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">{scorecard.qualityGatePassRate}%</div>
                <div className="text-[9px] text-[#9B9B95]">QG Pass</div>
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">
                  {canvases.reduce((a, c) => a + c.contentPlan.totalPosts, 0)}
                </div>
                <div className="text-[9px] text-[#9B9B95]">Posts planejados</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Canvases */}
      {canvases.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-12 text-center">
          <p className="text-[13px] text-[#9B9B95]">
            Selecione um cenário acima para gerar um Social Canvas de teste.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {canvases.map((canvas) => (
            <SocialCanvasCard key={canvas.id} canvas={canvas} />
          ))}
        </div>
      )}
    </div>
  );
}
