"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MOCK_INTEGRATIONS,
  AGENT_AI_CONFIGS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  MODE_LABELS,
  MODE_COLORS,
  AGENT_LABELS,
  computeIntegrationReadiness,
  type IntegrationCategory,
  type Integration,
} from "@/lib/agency/integrations";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ReadinessRing({ score }: { score: number }) {
  const color =
    score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";
  const label =
    score >= 70 ? "Bom" : score >= 40 ? "Em progresso" : "Inicial";
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center border-4 shrink-0"
        style={{ borderColor: color }}
      >
        <span className="text-[18px] font-bold" style={{ color }}>{score}%</span>
      </div>
      <div>
        <div className="text-[13px] font-semibold" style={{ color }}>{label}</div>
        <div className="text-[11px] text-[#9B9B95] mt-0.5">Integrações prontas / total</div>
      </div>
    </div>
  );
}

function CategoryIcon({ cat }: { cat: IntegrationCategory }) {
  const icons: Record<IntegrationCategory, string> = {
    ai_provider:  "🤖",
    design_tool:  "🎨",
    ads_platform: "📢",
    storage:      "☁️",
    automation:   "⚙️",
    analytics:    "📊",
    publishing:   "📤",
  };
  return <span>{icons[cat] ?? "🔌"}</span>;
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const [open, setOpen] = useState(false);
  const statusStyle = STATUS_COLORS[integration.status];
  const priorityStyle = PRIORITY_COLORS[integration.priority];

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#FAFAF9] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1C1C1A]">{integration.name}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${statusStyle.bg} ${statusStyle.text}`}>
              {STATUS_LABELS[integration.status]}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${priorityStyle}`}>
              P: {PRIORITY_LABELS[integration.priority]}
            </span>
          </div>
          <p className="text-[11px] text-[#6B6B65] mt-0.5 truncate">{integration.purpose}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {integration.assignedAgents.map((ag) => (
              <span key={ag} className="text-[10px] bg-[#F0F0ED] text-[#6B6B65] px-1.5 py-0.5 rounded">
                {AGENT_LABELS[ag]}
              </span>
            ))}
          </div>
        </div>
        <span className={`text-[#9B9B95] shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#F4F4F0]">
          {/* Cost + Setup */}
          {(integration.costHint || integration.setupNotes) && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              {integration.costHint && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Custo estimado</div>
                  <div className="text-[12px] text-[#1C1C1A]">{integration.costHint}</div>
                </div>
              )}
              {integration.setupNotes && (
                <div>
                  <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Configuração</div>
                  <div className="text-[12px] text-[#6B6B65]">{integration.setupNotes}</div>
                </div>
              )}
            </div>
          )}
          {/* Capabilities + Limitations */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Capacidades</div>
              <ul className="space-y-1">
                {integration.capabilities.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-[11px] text-[#1C1C1A]">
                    <span className="text-[#16A34A] shrink-0 mt-0.5">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Limitações V1</div>
              <ul className="space-y-1">
                {integration.limitations.map((l) => (
                  <li key={l} className="flex items-start gap-1.5 text-[11px] text-[#6B6B65]">
                    <span className="text-[#D97706] shrink-0 mt-0.5">⚠</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* API key placeholder */}
          {(integration.status === "available" || integration.status === "planned") && (
            <div className="bg-[#F4F4F0] border border-[#E8E8E4] rounded-[8px] px-3 py-2">
              <div className="text-[11px] text-[#9B9B95] font-medium">🔒 Chave de API</div>
              <div className="text-[11px] text-[#C0C0BA] mt-0.5 italic">
                Configuração segura de chaves será adicionada com backend
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const readiness = computeIntegrationReadiness(MOCK_INTEGRATIONS);
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "all">("all");

  const filteredIntegrations =
    activeCategory === "all"
      ? MOCK_INTEGRATIONS
      : MOCK_INTEGRATIONS.filter((i) => i.category === activeCategory);

  const groupedByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    integrations: MOCK_INTEGRATIONS.filter((i) => i.category === cat),
  }));

  return (
    <div className="max-w-[960px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[22px] font-semibold text-[#1C1C1A] tracking-[-0.02em]">
            Ferramentas &amp; Integrações
          </h1>
          <span className="text-[11px] bg-[#F4F4F0] text-[#9B9B95] px-2 py-0.5 rounded font-medium">V1 — Mapeamento</span>
        </div>
        <p className="text-[13px] text-[#6B6B65]">
          Configuração de provedores de IA e ferramentas externas por agente. Sem chaves reais em V1.
        </p>
      </div>

      {/* Readiness Score Row */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
        <div className="flex items-start gap-8 flex-wrap">
          <ReadinessRing score={readiness.score} />
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#5B5BD6] mono-num">{readiness.configuredCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Configurados</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#0891B2] mono-num">{readiness.availableCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Disponíveis</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#9B9B95] mono-num">{readiness.plannedCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Planejados</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#D97706] mono-num">{readiness.unavailableCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Indisponíveis</div>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] bg-[#FAFAF9] rounded-[8px] px-4 py-3 border border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Prioridade de configuração</div>
            <div className="text-[12px] text-[#1C1C1A]">{readiness.topMissing}</div>
          </div>
        </div>
        {readiness.usableToday.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Disponível hoje</div>
            <div className="flex flex-wrap gap-1.5">
              {readiness.usableToday.map((name) => (
                <span key={name} className="text-[11px] bg-[#DCFCE7] text-[#16A34A] px-2 py-0.5 rounded font-medium">
                  ✓ {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Agent AI Configuration Matrix ─────────────────────────────────── */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
          <h2 className="text-[14px] font-semibold text-[#1C1C1A]">Matriz de Configuração por Agente</h2>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">Modo atual, provedor de IA e status de cada agente</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#F0F0ED] bg-[#FAFAF9]">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide w-[140px]">Agente</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Modo atual</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Provedor IA</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Ferramentas externas</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Pronto hoje</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide">Configuração faltando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F0]">
              {AGENT_AI_CONFIGS.map((agent) => {
                const modeStyle = MODE_COLORS[agent.currentMode];
                return (
                  <tr key={agent.agentId} className="hover:bg-[#FAFAF9] transition-colors">
                    <td className="px-5 py-3 font-semibold text-[#1C1C1A]">{agent.agentName}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${modeStyle}`}>
                        {MODE_LABELS[agent.currentMode]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#1C1C1A]">
                      <div>{agent.currentProvider}</div>
                      {agent.plannedProvider !== agent.currentProvider && (
                        <div className="text-[10px] text-[#9B9B95] mt-0.5">→ {agent.plannedProvider}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {agent.externalTools.length === 0 ? (
                        <span className="text-[#C0C0BA]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {agent.externalTools.map((t) => (
                            <span key={t} className="text-[10px] bg-[#EEF0FF] text-[#5B5BD6] px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {agent.readyToday ? (
                        <span className="text-[#16A34A] font-bold">✓</span>
                      ) : (
                        <span className="text-[#DC2626]">✗</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {agent.missingConfig.length === 0 ? (
                        <span className="text-[#16A34A] text-[11px]">Completo</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {agent.missingConfig.slice(0, 2).map((m) => (
                            <li key={m} className="text-[10px] text-[#9B9B95] flex items-start gap-1">
                              <span className="text-[#D97706] shrink-0">○</span>
                              <span className="truncate max-w-[200px]">{m}</span>
                            </li>
                          ))}
                          {agent.missingConfig.length > 2 && (
                            <li className="text-[10px] text-[#C0C0BA]">+{agent.missingConfig.length - 2} mais</li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Integration Cards ──────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
          <h2 className="text-[14px] font-semibold text-[#1C1C1A]">Integrações</h2>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">{MOCK_INTEGRATIONS.length} integrações mapeadas · clique para expandir detalhes</p>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-[#F0F0ED] overflow-x-auto">
          <button
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-[#1C1C1A] text-white"
                : "text-[#6B6B65] hover:bg-[#F4F4F0]"
            }`}
          >
            Todos ({MOCK_INTEGRATIONS.length})
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = MOCK_INTEGRATIONS.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-[#1C1C1A] text-white"
                    : "text-[#6B6B65] hover:bg-[#F4F4F0]"
                }`}
              >
                <CategoryIcon cat={cat} />
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {activeCategory === "all" ? (
            <div className="space-y-6">
              {groupedByCategory.map(({ category, integrations }) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon cat={category} />
                    <h3 className="text-[13px] font-semibold text-[#1C1C1A]">{CATEGORY_LABELS[category]}</h3>
                    <span className="text-[11px] text-[#9B9B95]">({integrations.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {integrations.map((int) => (
                      <IntegrationCard key={int.id} integration={int} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredIntegrations.map((int) => (
                <IntegrationCard key={int.id} integration={int} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security notice */}
      <div className="bg-[#F0F4FF] border border-[#DDDDFB] rounded-[10px] px-5 py-4 flex items-start gap-3">
        <span className="text-[16px] shrink-0">🔒</span>
        <div>
          <div className="text-[13px] font-semibold text-[#5B5BD6]">Segurança de chaves de API — V1</div>
          <p className="text-[12px] text-[#6B6B65] mt-1">
            Não insira chaves reais nesta interface. A configuração segura de credenciais será adicionada junto com o backend.
            Em V1, apenas a geração de imagens via DALL-E 3 está ativa (chave gerenciada pelo servidor).
          </p>
          <Link href="/agency/settings" className="text-[12px] text-[#5B5BD6] font-medium hover:underline mt-1 inline-block">
            Ver diagnóstico completo em Saúde do Sistema →
          </Link>
        </div>
      </div>
    </div>
  );
}
