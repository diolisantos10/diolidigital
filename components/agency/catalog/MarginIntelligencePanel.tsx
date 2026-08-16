"use client";

// Internal margin intelligence — MASTER ONLY.
// Surfaces the hidden economics behind the public catalogue: cost basis, floor
// price, target, and the margin % at each price point, plus the SDR's discount
// levers. This is the same data the SDR negotiates within (server-side); here
// it's made visible to the agency owner so margins can be reviewed and managed.
//
// Never rendered for non-master roles, and never shown in the public briefing.

import { useAgencyStore } from "@/store/agency-store";
import { SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";
import {
  SOCIAL_MARGINS,
  ADDON_MARGINS,
  DISCOUNT_LEVERS,
  marginPct,
  type MarginProfile,
} from "@/lib/agency/pricing-margins";

function brl(n: number) {
  return "R$ " + n.toLocaleString("pt-BR");
}

function MarginBadge({ pct }: { pct: number | null }) {
  // `null` = o custo daquela linha nunca foi medido. A pílula NÃO fica verde
  // nem some: ela diz "sem custo". Um selo verde sobre custo desconhecido é
  // exatamente o carimbo falso que esta casa já pagou caro.
  if (pct === null) {
    return (
      <span
        className="h-5 px-2 rounded-full text-[10px] font-bold bg-[var(--warning-bg)] text-[var(--warning)]"
        title="Custo de atendimento nunca medido — a margem não pode ser afirmada."
      >
        sem custo
      </span>
    );
  }
  const tone =
    pct >= 60 ? "bg-[var(--success-bg)] text-[var(--success)]" : pct >= 45 ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[#FEE2E2] text-[var(--danger)]";
  return <span className={`h-5 px-2 rounded-full text-[10px] font-bold ${tone}`}>{pct}%</span>;
}

function Row({
  label,
  detail,
  list,
  profile,
}: {
  label: string;
  detail: string;
  list: number;       // client-facing min price (the anchor for margin@list)
  profile: MarginProfile;
}) {
  const marginAtList = marginPct(list, profile.costBasis);
  const marginAtTarget = marginPct(profile.targetPrice, profile.costBasis);
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="p-3">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-[10px] text-[var(--text-muted)]">{detail}</div>
      </td>
      <td className="p-3 text-center text-[12px] text-[var(--text-secondary)] mono-num">
        {profile.costBasis === null ? <span className="text-[var(--warning)]" title="custo de atendimento nunca medido">não medido</span> : brl(profile.costBasis)}
      </td>
      <td className="p-3 text-center text-[12px] font-semibold text-[var(--danger)] mono-num">{brl(profile.floorPrice)}</td>
      <td className="p-3 text-center text-[12px] text-[var(--text-primary)] mono-num">{brl(list)}</td>
      <td className="p-3 text-center text-[12px] text-[var(--navy)] mono-num">{brl(profile.targetPrice)}</td>
      <td className="p-3 text-center"><MarginBadge pct={marginAtList} /></td>
      <td className="p-3 text-center"><MarginBadge pct={marginAtTarget} /></td>
    </tr>
  );
}

export default function MarginIntelligencePanel() {
  const currentRole = useAgencyStore((s) => s.currentRole);
  if (currentRole !== "master") return null;

  return (
    <section className="bg-[#0B0E1A] rounded-[12px] border border-[#1F2433] shadow-[0_1px_4px_rgba(0,0,0,0.2)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1F2433] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-white">Inteligência de Margem</h2>
            <span className="h-5 px-2 rounded-full bg-[var(--danger)]/20 text-[#FCA5A5] text-[10px] font-bold flex items-center">
              MASTER · INTERNO
            </span>
          </div>
          <p className="text-[12px] text-[#8B92A8] mt-0.5">
            Custo, piso e margem por serviço. É dentro deste piso que o SDR negocia — nunca abaixo. Nunca exposto ao cliente.
          </p>
        </div>
      </div>

      <div className="p-2 overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.05em] text-[#6B7280]">
              <th className="text-left p-3 font-semibold w-[200px]">Serviço</th>
              <th className="p-3 font-semibold text-center">Custo</th>
              <th className="p-3 font-semibold text-center">Piso</th>
              <th className="p-3 font-semibold text-center">Tabela (mín)</th>
              <th className="p-3 font-semibold text-center">Alvo</th>
              <th className="p-3 font-semibold text-center">Margem @tabela</th>
              <th className="p-3 font-semibold text-center">Margem @alvo</th>
            </tr>
          </thead>
          <tbody className="[&_td]:text-white">
            {/* Plano sem perfil de margem NÃO some da tela: some da tabela e
                aparece na linha de aviso abaixo. Sumir em silêncio é como um
                plano sem piso vira um plano que o SDR fecha no escuro. */}
            {SOCIAL_PACKAGES.map((p) => {
              const profile = SOCIAL_MARGINS[p.id];
              if (!profile) return null;
              return (
                <Row
                  key={p.id}
                  label={p.label}
                  detail={p.pecasPorMes === null ? "cadência não declarada" : `${p.pecasPorMes} peças/mês`}
                  list={p.minPrice}
                  profile={profile}
                />
              );
            })}
            <Row label="Tráfego Pago — gestão" detail="Fee mensal (verba à parte)" list={500} profile={ADDON_MARGINS.trafficMgmt} />
            <Row label="Identidade Visual" detail="Projeto" list={1200} profile={ADDON_MARGINS.branding} />
            <Row label="Rebranding Completo" detail="Projeto" list={2000} profile={ADDON_MARGINS.brandingFull} />
          </tbody>
        </table>
      </div>

      {/* Discount levers */}
      <div className="px-5 py-4 border-t border-[#1F2433]">
        <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-[0.05em] mb-2.5">
          Alavancas de desconto do SDR — só com contrapartida
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {DISCOUNT_LEVERS.map((l) => (
            <div key={l.id} className="bg-[#11151F] border border-[#1F2433] rounded-[8px] px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-white">{l.label}</span>
                <span className="h-5 px-2 rounded-full bg-[var(--success)]/15 text-[#4ADE80] text-[10px] font-bold shrink-0">
                  até {l.maxPct}%
                </span>
              </div>
              <p className="text-[10px] text-[#8B92A8] mt-1">Requer: {l.requires}</p>
              <p className="text-[10px] text-[#6B7280] mt-0.5 italic">{l.internalNote}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#4B5563] mt-3">
          As alavancas somam, mas o sistema corta automaticamente qualquer desconto que ultrapasse o piso. O SDR nunca vende abaixo do piso.
        </p>
      </div>
    </section>
  );
}
