"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";
import { runSystemDoctor, CHECK_GROUP_ORDER, type DiagnosticReport, type CheckStatus, type CheckSeverity } from "@/lib/agency/system-doctor";
import { getPilotDataStatus } from "@/lib/agency/readiness";

// ─── Status / severity display maps ──────────────────────────────────────────

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Tudo certo",
  warning: "Atenção",
  fail: "Falha crítica",
  info: "Informação",
};

const STATUS_COLOR: Record<CheckStatus, { dot: string; badge: string; border: string }> = {
  pass:    { dot: "bg-[#16A34A]", badge: "bg-[#DCFCE7] text-[#16A34A]", border: "border-[#DCFCE7]" },
  warning: { dot: "bg-[#D97706]", badge: "bg-[#FEF3C7] text-[#D97706]", border: "border-[#FEF3C7]" },
  fail:    { dot: "bg-[#DC2626]", badge: "bg-[#FEE2E2] text-[#DC2626]", border: "border-[#FEE2E2]" },
  info:    { dot: "bg-[#5B5BD6]", badge: "bg-[#EEF0FF] text-[#5B5BD6]", border: "border-[#EEF0FF]" },
};

const OVERALL_COLOR: Record<DiagnosticReport["overallStatus"], { ring: string; score: string; label: string; labelColor: string }> = {
  healthy:  { ring: "stroke-[#16A34A]", score: "text-[#16A34A]", label: "Sistema saudável",  labelColor: "text-[#16A34A]" },
  degraded: { ring: "stroke-[#D97706]", score: "text-[#D97706]", label: "Atenção necessária", labelColor: "text-[#D97706]" },
  critical: { ring: "stroke-[#DC2626]", score: "text-[#DC2626]", label: "Falha crítica",      labelColor: "text-[#DC2626]" },
};

function ScoreRing({ score, status }: { score: number; status: DiagnosticReport["overallStatus"] }) {
  const { ring, score: scoreColor } = OVERALL_COLOR[status];
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative w-[72px] h-[72px] shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5" className="stroke-[#F0F0ED]" />
        <circle
          cx="36" cy="36" r={r} fill="none" strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className={`${ring} transition-all duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[15px] font-bold mono-num ${scoreColor}`}>{score}</span>
      </div>
    </div>
  );
}

// Collapsible section wrapper for Advanced Tools and Technical Info
function CollapsibleSection({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#FAFAFA] transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[#1A1A1A]">{title}</span>
          {badge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[#F0F0ED] text-[#6B6B65]">{badge}</span>
          )}
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`shrink-0 text-[#9B9B95] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[#F0F0ED]">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { clients, projects, tasks, deliverables, briefings, materialRequests, strategyRooms, brandUpdates,
          integrationConfigs, agentProviderConfigs,
          resetStore, loadPilotData, clearAllData } = useAgencyStore();
  const { t, locale, setLocale } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    try { setPersisted(!!window.localStorage.getItem("agency-os-v1")); }
    catch { setPersisted(false); }
  }, [clients, projects, deliverables]);

  const report = runSystemDoctor({ clients, projects, deliverables, materialRequests, strategyRooms, persisted, integrationConfigs, agentProviderConfigs });
  const pilot = getPilotDataStatus(clients, projects, deliverables);
  const { score, pass, warning, fail, info, topAction, overallStatus, checks } = report;
  const oc = OVERALL_COLOR[overallStatus];

  const grouped = CHECK_GROUP_ORDER.map((group) => ({
    group,
    checks: checks.filter((c) => c.group === group),
  }));

  const handleReset = () => { resetStore(); setConfirmReset(false); };
  const handleClear = () => { clearAllData(); setConfirmClear(false); };

  // Workspace Status derived stats
  const inReviewCount = deliverables.filter((d) => d.status === "in_review").length;
  const pendingBrandUpdates = brandUpdates.filter((u) => u.status === "pending").length;
  const lastActivity = (() => {
    const dates = deliverables.map((d) => d.updatedAt ?? d.createdAt).filter(Boolean).sort().reverse();
    if (!dates[0]) return "—";
    const d = new Date(dates[0]);
    if (isNaN(d.getTime())) return dates[0];
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  })();

  const LOCALES: { value: Locale; label: string; flag: string }[] = [
    { value: "pt-BR", label: "Português (BR)", flag: "🇧🇷" },
    { value: "en", label: "English", flag: "🇺🇸" },
  ];

  return (
    <>
      <AgencyHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="max-w-2xl space-y-5">

        {/* ── SECTION 1: Saúde do Sistema ──────────────────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F0F0ED] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1A1A1A]">Saúde do Sistema</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[#EEF0FF] text-[#5B5BD6]">
              Interno · Tempo real
            </span>
          </div>

          {/* Score summary */}
          <div className="px-6 py-5 border-b border-[#F7F7F6]">
            <div className="flex items-center gap-5">
              <ScoreRing score={score} status={overallStatus} />
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-semibold mb-1 ${oc.labelColor}`}>{oc.label}</div>
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-[12px] text-[#6B6B65] mono-num">
                    <span className="font-semibold text-[#16A34A]">{pass}</span> ok ·{" "}
                    <span className="font-semibold text-[#D97706]">{warning}</span> atenção ·{" "}
                    <span className="font-semibold text-[#DC2626]">{fail}</span> falha ·{" "}
                    <span className="font-semibold text-[#5B5BD6]">{info}</span> info
                  </span>
                </div>
                {(fail > 0 || warning > 0) && (
                  <div className="flex items-start gap-2 bg-[#F7F7F6] rounded-[7px] px-3 py-2">
                    <svg className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M8 7v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    <p className="text-[11px] text-[#6B6B65] leading-relaxed flex-1">
                      <span className="font-medium text-[#1A1A1A]">Ação recomendada:</span>{" "}{topAction}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grouped checks */}
          <div className="divide-y divide-[#F7F7F6]">
            {grouped.map(({ group, checks: gChecks }) => {
              const isOpen = expandedGroup === group;
              const groupFail = gChecks.filter((c) => c.status === "fail").length;
              const groupWarn = gChecks.filter((c) => c.status === "warning").length;
              const groupPass = gChecks.filter((c) => c.status === "pass").length;
              const groupSummaryStatus: CheckStatus =
                groupFail > 0 ? "fail" : groupWarn > 0 ? "warning" : "pass";

              return (
                <div key={group}>
                  <button
                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-[#FAFAFA] transition-colors text-left"
                    onClick={() => setExpandedGroup(isOpen ? null : group)}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[groupSummaryStatus].dot}`} />
                    <span className="flex-1 text-[13px] font-medium text-[#1A1A1A]">{group}</span>
                    <div className="flex items-center gap-1.5">
                      {groupFail > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#FEE2E2] text-[#DC2626]">
                          {groupFail} falha{groupFail > 1 ? "s" : ""}
                        </span>
                      )}
                      {groupWarn > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#FEF3C7] text-[#D97706]">
                          {groupWarn} atenção
                        </span>
                      )}
                      {groupFail === 0 && groupWarn === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#DCFCE7] text-[#16A34A]">
                          {groupPass} ok
                        </span>
                      )}
                    </div>
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      className={`shrink-0 text-[#9B9B95] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="bg-[#FAFAFA] border-t border-[#F0F0ED] divide-y divide-[#F0F0ED]">
                      {gChecks.map((check) => {
                        const sc = STATUS_COLOR[check.status];
                        return (
                          <div key={check.id} className={`px-6 py-3.5 border-l-2 ${sc.border}`}>
                            <div className="flex items-start gap-2.5 mb-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${sc.dot}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-medium text-[#1A1A1A]">{check.label}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${sc.badge}`}>
                                    {STATUS_LABEL[check.status]}
                                  </span>
                                </div>
                                <p className="text-[12px] text-[#6B6B65] mt-1 leading-relaxed">{check.explanation}</p>
                                {check.status !== "pass" && check.status !== "info" && (
                                  <div className="mt-1.5 flex items-start gap-1.5">
                                    <span className="text-[11px] text-[#9B9B95] font-medium shrink-0">→</span>
                                    <p className="text-[11px] text-[#5B5BD6] leading-relaxed">{check.action}</p>
                                  </div>
                                )}
                              </div>
                              {check.route && (
                                <Link
                                  href={check.route}
                                  className="shrink-0 text-[11px] text-[#9B9B95] hover:text-[#5B5BD6] underline whitespace-nowrap"
                                >
                                  Ir →
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECTION 2: Status do Workspace ───────────────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F0F0ED]">
            <span className="text-[13px] font-semibold text-[#1A1A1A]">Status do Workspace</span>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Primary stats */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: t.settings.labels.clients, value: clients.length },
                { label: t.settings.labels.projects, value: projects.length },
                { label: t.settings.labels.deliverables, value: deliverables.length },
                { label: t.settings.labels.briefings, value: briefings.length },
                { label: t.settings.labels.tasks, value: tasks.length },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-[22px] font-semibold text-[#1A1A1A] mono-num">{value}</div>
                  <div className="text-[11px] text-[#9B9B95] mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Operational indicators */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#FAFAF9] rounded-[8px] px-3 py-2.5 border border-[#F0F0ED]">
                <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Revisões pendentes</div>
                <div className={`text-[18px] font-bold mono-num ${inReviewCount > 0 ? "text-[#D97706]" : "text-[#1A1A1A]"}`}>
                  {inReviewCount}
                </div>
              </div>
              <div className="bg-[#FAFAF9] rounded-[8px] px-3 py-2.5 border border-[#F0F0ED]">
                <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Brand updates pendentes</div>
                <div className={`text-[18px] font-bold mono-num ${pendingBrandUpdates > 0 ? "text-[#5B5BD6]" : "text-[#1A1A1A]"}`}>
                  {pendingBrandUpdates}
                </div>
              </div>
              <div className="bg-[#FAFAF9] rounded-[8px] px-3 py-2.5 border border-[#F0F0ED]">
                <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Última atividade</div>
                <div className="text-[14px] font-semibold text-[#1A1A1A] mono-num">{lastActivity}</div>
              </div>
            </div>

            {/* Integrations shortcut */}
            <div className="flex items-center justify-between bg-[#F0F0FE] rounded-[8px] px-4 py-3 border border-[#DDDDFB] mt-1">
              <div>
                <div className="text-[13px] font-semibold text-[#5B5BD6]">Ferramentas &amp; Integrações</div>
                <div className="text-[11px] text-[#6B6B65] mt-0.5">Gerenciar ferramentas, IAs dos agentes e conexões.</div>
              </div>
              <Link
                href="/agency/integrations"
                className="shrink-0 px-3 py-1.5 bg-[#5B5BD6] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#4A4AC0] transition-colors"
              >
                Gerenciar →
              </Link>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Ferramentas Avançadas (collapsed) ─────────────────────── */}
        <CollapsibleSection title="Ferramentas Avançadas" badge="Dados e idioma">
          <div className="px-6 py-5 space-y-0">
            {/* Load pilot data */}
            <div className="flex items-center justify-between py-3.5 border-b border-[#F0F0ED]">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[#1A1A1A]">Carregar dados do piloto Dioli Digital</div>
                <div className="text-[12px] text-[#9B9B95] mt-0.5">
                  Restaura o projeto piloto (Dioli Digital), suas entregas e tarefas sem apagar o restante do workspace.
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => loadPilotData()} disabled={pilot.available}>
                {pilot.available ? "Já carregado" : "Carregar piloto"}
              </Button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between py-3.5 border-b border-[#F0F0ED]">
              <p className="text-[13px] text-[#6B6B65] pr-4">{t.settings.languageDesc}</p>
              <div className="flex items-center gap-1.5 bg-[#F7F7F6] rounded-[7px] p-1 shrink-0">
                {LOCALES.map((loc) => (
                  <button
                    key={loc.value}
                    onClick={() => setLocale(loc.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[12px] font-medium transition-all ${
                      locale === loc.value
                        ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#1A1A1A]"
                        : "text-[#9B9B95] hover:text-[#6B6B65]"
                    }`}
                  >
                    <span>{loc.flag}</span>
                    <span>{loc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reset to factory */}
            <div className="flex items-center justify-between py-3.5 border-b border-[#F0F0ED]">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[#1A1A1A]">{t.settings.resetData}</div>
                <div className="text-[12px] text-[#9B9B95] mt-0.5">{t.settings.resetDataDesc}</div>
              </div>
              {!confirmReset ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                  {t.settings.resetData}
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[12px] text-[#6B6B65] font-medium">Restaurar dados de fábrica?</span>
                  <Button variant="primary" size="sm" onClick={handleReset}>{t.common.confirm}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>{t.common.cancel}</Button>
                </div>
              )}
            </div>

            {/* Clear all */}
            <div className="flex items-center justify-between py-3.5">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[#1A1A1A]">Limpar todos os dados locais</div>
                <div className="text-[12px] text-[#9B9B95] mt-0.5">
                  Remove clientes, projetos, tarefas e entregas deste navegador. Ação irreversível.
                </div>
              </div>
              {!confirmClear ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
                  Limpar tudo
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[12px] text-[#DC2626] font-medium">Apagar tudo definitivamente?</span>
                  <Button variant="danger" size="sm" onClick={handleClear}>{t.common.confirm}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>{t.common.cancel}</Button>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* ── SECTION 4: Informações Técnicas (collapsed) ──────────────────────── */}
        <CollapsibleSection title="Informações Técnicas" badge="Versão e ambiente">
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2.5">
              {[
                { label: "Sistema", value: "Dioli Agency OS v1.0" },
                { label: t.settings.labels.techStack, value: "Next.js · Zustand · Tailwind CSS" },
                { label: t.settings.labels.storage, value: "Browser localStorage" },
                { label: t.settings.labels.environment, value: "Front-end only (sem backend)" },
                { label: "Persistência", value: persisted ? "✓ Ativa — dados gravados" : "⚠ Sem dados gravados ainda" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-[12px] text-[#9B9B95]">{label}</span>
                  <span className={`text-[12px] font-medium ${label === "Persistência" && !persisted ? "text-[#D97706]" : "text-[#1A1A1A]"}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-1 border-t border-[#F0F0ED]">
              <p className="text-[11px] text-[#9B9B95] leading-relaxed">
                {t.settings.persistenceDesc}
              </p>
            </div>
          </div>
        </CollapsibleSection>

      </div>
    </>
  );
}
