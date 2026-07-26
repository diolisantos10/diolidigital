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
    <span className="text-[var(--success)] font-bold">✓</span>
  ) : (
    <span className="text-[var(--border-strong)]">—</span>
  );
}

// ── Social Media: full feature matrix ──────────────────────────────────────────

type Row = { label: string; render: (p: PackageDef) => ReactNode };

const SOCIAL_ROWS: Row[] = [
  { label: "Posts/semana",         render: (p) => <span className="font-semibold">{p.postsPerWeek}</span> },
  { label: "Stories/semana",       render: (p) => p.storiesPerWeek },
  { label: "Total posts/mês",      render: (p) => <span className="text-[var(--text-muted)]">{p.postsPerMonth}</span> },
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
            <th className="text-left p-3 font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] text-[10px] w-[180px]">
              Plano
            </th>
            {SOCIAL_PACKAGES.map((p) => (
              <th key={p.id} className="p-3 text-center border-l border-[var(--border)] min-w-[120px]">
                <div className="text-[13px] font-bold text-[var(--text-primary)]">{p.label.replace("Plano ", "")}</div>
                <div className="text-[11px] font-semibold text-[var(--navy)] mt-1">
                  {brl(p.minPrice)}–{brl(p.maxPrice)}
                </div>
                <div className="text-[9px] text-[var(--text-muted)]">/mês</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SOCIAL_ROWS.map((row, ri) => (
            <tr key={row.label} className={ri % 2 === 0 ? "bg-[var(--bg-elevated)]" : "bg-white"}>
              <td className="p-3 text-[var(--text-secondary)] font-medium border-t border-[var(--border)]">{row.label}</td>
              {SOCIAL_PACKAGES.map((p) => (
                <td key={p.id} className="p-3 text-center text-[var(--text-primary)] border-t border-l border-[var(--border)]">
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
        <section className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{social.name}</h2>
                <span className="h-5 px-2 rounded-full bg-[var(--cyan)]/30 text-[var(--navy)] text-[10px] font-semibold flex items-center">
                  Carro-chefe
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{social.tagline}</p>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Plano mensal · 5 níveis</span>
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
            className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{dept.name}</h2>
                <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center">
                  {dept.pricingModel === "project" ? "Por projeto" : "Adicional mensal"}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{dept.tagline}</p>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {dept.addons!.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">{a.label}</div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{a.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-bold text-[var(--navy)]">
                      {brl(a.minPrice)}–{brl(a.maxPrice)}
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">/{a.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-[var(--text-subtle)]">
        Preços de referência (faixa min–máx). A proposta final é calibrada conforme o escopo e o orçamento do cliente.
      </p>

      {/* Internal margin intelligence — master only, never client-facing */}
      <MarginIntelligencePanel />
    </div>
  );
}
