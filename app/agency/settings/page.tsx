"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { useDbClients } from "@/lib/hooks/useDbClients";
import { useDbProjects } from "@/lib/hooks/useDbProjects";
import { useDbTasks } from "@/lib/hooks/useDbTasks";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { useDbMaterialRequests } from "@/lib/hooks/useDbMaterialRequests";
import { useDbActivityEvents } from "@/lib/hooks/useDbActivityEvents";
import { useDbBrandHub } from "@/lib/hooks/useDbBrandHub";
import { useDbStrategyRooms } from "@/lib/hooks/useDbStrategyRooms";
import { useDbBriefings } from "@/lib/hooks/useDbBriefings";
import { useDbBrandUpdates } from "@/lib/hooks/useDbBrandUpdates";
import { useDbAIRunLogs } from "@/lib/hooks/useDbAIRunLogs";
import { useAiProviderStatus } from "@/lib/hooks/useAiProviderStatus";
import { PILOT_CLIENT_ID } from "@/lib/agency/system-doctor";
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
  info:    { dot: "bg-[#070A1F]", badge: "bg-[#E6FBFA] text-[#070A1F]", border: "border-[#E6FBFA]" },
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
    <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
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

// ── Pending Brain Updates (learning loop, Phase 5) ────────────────────────────
// Lists pending BrainUpdate proposals and lets a human apply each one (the only
// path that mutates the actual BrandBrain).

interface PendingBrainUpdate {
  id: string;
  clientRequestId: string;
  department: string;
  fieldChanged: string;
  previousValue: string | null;
  proposedValue: string;
  source: string;
}

function PendingBrainUpdates() {
  const [updates, setUpdates] = useState<PendingBrainUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brain/updates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUpdates((await res.json()) as PendingBrainUpdate[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar atualizações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function apply(id: string) {
    setApplying(id);
    setError(null);
    try {
      const res = await fetch(`/api/brain/updates/${id}/apply`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar.");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F0F0ED] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1A1A]">Atualizações de Brain pendentes</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[#E6FBFA] text-[#070A1F]">
          ✦ Learning loop
        </span>
      </div>
      <div className="px-6 py-4 space-y-2">
        {loading && <p className="text-[12px] text-[#9B9B95]">Carregando…</p>}
        {error && <p className="text-[12px] text-[#991B1B]">{error}</p>}
        {!loading && !error && updates.length === 0 && (
          <p className="text-[12px] text-[#9B9B95]">Nenhuma atualização pendente. O Brain propõe mudanças a partir de entregas aprovadas.</p>
        )}
        {updates.map((u) => (
          <div key={u.id} className="flex items-start gap-3 border border-[#F0F0ED] rounded-[8px] px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-[#1A1A1A]">{u.fieldChanged}</span>
                <span className="h-4 px-1.5 rounded-[3px] bg-[#F0F0ED] text-[#6B6B65] text-[9px] font-medium leading-4">{u.department}</span>
                <span className="h-4 px-1.5 rounded-[3px] bg-[#E6FBFA] text-[#070A1F] text-[9px] font-medium leading-4">{u.source}</span>
              </div>
              {u.previousValue && (
                <p className="text-[11px] text-[#9B9B95] mt-0.5 line-through truncate">{u.previousValue}</p>
              )}
              <p className="text-[11px] text-[#1A1A1A] mt-0.5 truncate">{u.proposedValue}</p>
            </div>
            <button
              onClick={() => apply(u.id)}
              disabled={applying === u.id}
              className="h-7 px-3 rounded-[6px] bg-[#070A1F] hover:bg-[#0D1230] disabled:opacity-50 text-white text-[11px] font-medium transition-colors shrink-0"
            >
              {applying === u.id ? "Aplicando…" : "Aplicar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { deliverables, briefings, materialRequests, strategyRooms, brandUpdates,
          integrationConfigs, agentProviderConfigs, aiRunLogs: storeRunLogs, departmentConfigs, clientRequests,
          resetStore, loadPilotData, clearAllData } = useAgencyStore();
  const { logs: dbAiRunLogs, source: aiRunLogSource } = useDbAIRunLogs({ limit: 200 });
  const { openaiConfigured } = useAiProviderStatus();

  const { clients, source: clientsSource } = useDbClients();
  const { projects, source: projectsSource } = useDbProjects();
  const { tasks, source: tasksSource } = useDbTasks();
  const { source: deliverablesSource } = useDbDeliverables();
  const { source: materialRequestsSource } = useDbMaterialRequests();
  const { source: activitySource } = useDbActivityEvents({ limit: 1 });
  const { source: brandHubSource } = useDbBrandHub(PILOT_CLIENT_ID);
  const { source: strategyRoomsSource } = useDbStrategyRooms();
  const { source: briefingsSource } = useDbBriefings();
  const { source: brandUpdatesSource } = useDbBrandUpdates();
  const { t, locale, setLocale } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dbAvailable, setDbAvailable] = useState<boolean | undefined>(undefined);
  const [authMode, setAuthMode] = useState<"real" | "mock" | "none">("none");
  const [sessionActive, setSessionActive] = useState<boolean | undefined>(undefined);
  const [sessionUser, setSessionUser] = useState<string | undefined>(undefined);

  useEffect(() => {
    try { setPersisted(!!window.localStorage.getItem("agency-os-v1")); }
    catch { setPersisted(false); }
  }, [clients, projects, deliverables]);

  // Check DB availability + auth session status asynchronously
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/clients").then((r) => {
        if (!cancelled) {
          setDbAvailable(r.ok || r.status === 401);
          setAuthMode(r.ok ? "real" : "mock");
        }
      }).catch(() => { if (!cancelled) setDbAvailable(false); }),
      fetch("/api/session").then((r) => r.json()).then((data: { active?: boolean; name?: string; email?: string }) => {
        if (!cancelled) {
          setSessionActive(!!data.active);
          if (data.active && data.name) setSessionUser(`${data.name} (${data.email ?? ""})`);
        }
      }).catch(() => { if (!cancelled) setSessionActive(false); }),
    ]);
    return () => { cancelled = true; };
  }, []);

  const portalMode = dbAvailable ? "token" : "id_legacy";
  const dbSyncStatus = {
    clients:          clientsSource,
    projects:         (projectsSource === "mixed" ? "db" : projectsSource) as "db" | "local",
    tasks:            tasksSource,
    deliverables:     deliverablesSource,
    materialRequests: materialRequestsSource,
    activityEvents:   activitySource,
    brandHub:         brandHubSource,
    strategyRooms:    strategyRoomsSource,
    briefings:        briefingsSource,
    brandUpdates:     brandUpdatesSource,
    // Agent outputs are persisted as deliverables — mirror that source.
    agentOutputs:     deliverablesSource,
  };
  // Prefer DB-sourced AI run logs; fall back to local store.
  const aiRunLogs = dbAiRunLogs.length > 0 ? dbAiRunLogs : storeRunLogs;
  const report = runSystemDoctor({ clients, projects, deliverables, materialRequests, strategyRooms, tasks, persisted, integrationConfigs, agentProviderConfigs, dbAvailable, authMode, portalMode, sessionActive, sessionUser, dbSyncStatus, aiRunLogs, aiRunLogSource, openaiConfigured, departmentConfigs, clientRequests });
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

        {/* ── Learning loop: pending Brain updates ─────────────────────────────── */}
        <PendingBrainUpdates />

        {/* ── SECTION 1: Saúde do Sistema ──────────────────────────────────────── */}
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F0F0ED] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1A1A1A]">Saúde do Sistema</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[#E6FBFA] text-[#070A1F]">
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
                    <span className="font-semibold text-[#070A1F]">{info}</span> info
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
                                    <p className="text-[11px] text-[#070A1F] leading-relaxed">{check.action}</p>
                                  </div>
                                )}
                              </div>
                              {check.route && (
                                <Link
                                  href={check.route}
                                  className="shrink-0 text-[11px] text-[#9B9B95] hover:text-[#070A1F] underline whitespace-nowrap"
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
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
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
                <div className={`text-[18px] font-bold mono-num ${pendingBrandUpdates > 0 ? "text-[#070A1F]" : "text-[#1A1A1A]"}`}>
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
                <div className="text-[13px] font-semibold text-[#070A1F]">Ferramentas &amp; Integrações</div>
                <div className="text-[11px] text-[#6B6B65] mt-0.5">Gerenciar ferramentas, IAs dos agentes e conexões.</div>
              </div>
              <Link
                href="/agency/integrations"
                className="shrink-0 px-3 py-1.5 bg-[#070A1F] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#0D1230] transition-colors"
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
                <div className="text-[13px] font-medium text-[#1A1A1A]">Carregar solicitação — Dioli Digital (Instagram)</div>
                <div className="text-[12px] text-[#9B9B95] mt-0.5">
                  Adiciona o cliente Dioli Digital e uma solicitação pronta (1 post/dia no Instagram) na fila de Solicitações — pronta para o Comercial converter.
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadPilotData()}
                disabled={clientRequests.some((r) => r.id === "cr-dioli-instagram-01")}
              >
                {clientRequests.some((r) => r.id === "cr-dioli-instagram-01") ? "Já carregado" : "Carregar solicitação"}
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
