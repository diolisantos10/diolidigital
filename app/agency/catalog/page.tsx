import type { ReactNode } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import MarginIntelligencePanel from "@/components/agency/catalog/MarginIntelligencePanel";
import { DEPARTMENT_CATALOG } from "@/lib/agency/service-catalog";
import {
  SOCIAL_PACKAGES,
  REPORT_LABEL,
  COMMUNITY_LABEL,
  type PackageDef,
} from "@/lib/agency/live-calculator";

export const dynamic = "force-dynamic";

function brl(n: number) {
  return "R$ " + n.toLocaleString("pt-BR");
}

function Check({ on }: { on: boolean }) {
  return on ? (
    <span className="text-[#16A34A] font-bold">✓</span>
  ) : (
    <span className="text-[#D0D0CC]">—</span>
  );
}

// ── Social Media: full feature matrix ──────────────────────────────────────────

type Row = { label: string; render: (p: PackageDef) => ReactNode };

const SOCIAL_ROWS: Row[] = [
  { label: "Posts/semana",         render: (p) => <span className="font-semibold">{p.postsPerWeek}</span> },
  { label: "Stories/semana",       render: (p) => p.storiesPerWeek },
  { label: "Total posts/mês",      render: (p) => <span className="text-[#9B9B95]">{p.postsPerMonth}</span> },
  { label: "Reels/mês",            render: (p) => (p.reelsPerMonth > 0 ? p.reelsPerMonth : <Check on={false} />) },
  { label: "Copywriting",          render: (p) => <Check on={p.copy} /> },
  { label: "Design personalizado", render: (p) => <Check on={p.design} /> },
  { label: "Calendário editorial", render: (p) => <Check on={p.calendar} /> },
  { label: "Relatórios",           render: (p) => REPORT_LABEL[p.reports] },
  { label: "Gestão de comunidade", render: (p) => COMMUNITY_LABEL[p.community] },
];

function SocialPlansTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left p-3 font-semibold text-[#9B9B95] uppercase tracking-[0.05em] text-[10px] w-[180px]">
              Plano
            </th>
            {SOCIAL_PACKAGES.map((p) => (
              <th key={p.id} className="p-3 text-center border-l border-[#F0F0ED] min-w-[120px]">
                <div className="text-[13px] font-bold text-[#1A1A1A]">{p.label.replace("Plano ", "")}</div>
                <div className="text-[11px] font-semibold text-[#070A1F] mt-1">
                  {brl(p.minPrice)}–{brl(p.maxPrice)}
                </div>
                <div className="text-[9px] text-[#9B9B95]">/mês</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SOCIAL_ROWS.map((row, ri) => (
            <tr key={row.label} className={ri % 2 === 0 ? "bg-[#FAFAF9]" : "bg-white"}>
              <td className="p-3 text-[#6B6B65] font-medium border-t border-[#F0F0ED]">{row.label}</td>
              {SOCIAL_PACKAGES.map((p) => (
                <td key={p.id} className="p-3 text-center text-[#1A1A1A] border-t border-l border-[#F0F0ED]">
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const social   = DEPARTMENT_CATALOG.find((d) => d.id === "social");
  const addonDepts = DEPARTMENT_CATALOG.filter((d) => d.addons?.length);

  return (
    <div className="space-y-8">
      {/* Header */}
      <AgencyHeader
        title="Catálogo de Planos & Preços"
        subtitle="Cada departamento opera como uma empresa, com catálogo e preços próprios. Social Media é o carro-chefe, com planos isolados; Tráfego Pago e Identidade Visual são adicionais que se somam ao plano."
      />

      {/* Social Media department */}
      {social && (
        <section className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F0F0ED] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[#1A1A1A]">{social.name}</h2>
                <span className="h-5 px-2 rounded-full bg-[#9AF5F0]/30 text-[#070A1F] text-[10px] font-semibold flex items-center">
                  Carro-chefe
                </span>
              </div>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">{social.tagline}</p>
            </div>
            <span className="text-[11px] text-[#9B9B95]">Plano mensal · 5 níveis</span>
          </div>
          <div className="p-2">
            <SocialPlansTable />
          </div>
        </section>
      )}

      {/* Add-on departments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {addonDepts.map((dept) => (
          <section
            key={dept.id}
            className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[#1A1A1A]">{dept.name}</h2>
                <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-semibold flex items-center">
                  {dept.pricingModel === "project" ? "Por projeto" : "Adicional mensal"}
                </span>
              </div>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">{dept.tagline}</p>
            </div>
            <div className="divide-y divide-[#F0F0ED]">
              {dept.addons!.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#1A1A1A]">{a.label}</div>
                    <p className="text-[11px] text-[#9B9B95] mt-0.5">{a.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-bold text-[#070A1F]">
                      {brl(a.minPrice)}–{brl(a.maxPrice)}
                    </div>
                    <div className="text-[9px] text-[#9B9B95]">/{a.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-[#C0C0BC]">
        Preços de referência (faixa min–máx). A proposta final é calibrada conforme o escopo e o orçamento do cliente.
      </p>

      {/* Internal margin intelligence — master only, never client-facing */}
      <MarginIntelligencePanel />
    </div>
  );
}
