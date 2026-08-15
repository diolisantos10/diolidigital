"use client";

import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";

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
import { TopDown } from "@/components/agency/TopDown";
import { ZerarAAgencia } from "@/components/agency/ZerarAAgencia";
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
  pass:    { dot: "bg-[var(--success)]", badge: "bg-[var(--success-bg)] text-[var(--success)]", border: "border-[var(--success-bg)]" },
  warning: { dot: "bg-[var(--warning)]", badge: "bg-[var(--warning-bg)] text-[var(--warning)]", border: "border-[var(--warning-bg)]" },
  fail:    { dot: "bg-[var(--danger)]", badge: "bg-[#FEE2E2] text-[var(--danger)]", border: "border-[#FEE2E2]" },
  info:    { dot: "bg-[var(--navy)]", badge: "bg-[var(--accent-light)] text-[var(--navy)]", border: "border-[var(--accent-light)]" },
};

const OVERALL_COLOR: Record<DiagnosticReport["overallStatus"], { ring: string; score: string; label: string; labelColor: string }> = {
  healthy:  { ring: "stroke-[var(--success)]", score: "text-[var(--success)]", label: "Sistema saudável",  labelColor: "text-[var(--success)]" },
  degraded: { ring: "stroke-[var(--warning)]", score: "text-[var(--warning)]", label: "Atenção necessária", labelColor: "text-[var(--warning)]" },
  critical: { ring: "stroke-[var(--danger)]", score: "text-[var(--danger)]", label: "Falha crítica",      labelColor: "text-[var(--danger)]" },
};

function ScoreRing({ score, status }: { score: number; status: DiagnosticReport["overallStatus"] }) {
  const { ring, score: scoreColor } = OVERALL_COLOR[status];
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative w-[72px] h-[72px] shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5" className="stroke-[var(--text-subtle)]" />
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
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--bg-elevated)] transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[var(--accent)] text-[var(--text-secondary)]">{badge}</span>
          )}
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
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
  // Erro em português com detalhe técnico separado — DESIGN.md §7.3.
  const [error, setError] = useState<ErroHumano | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brain/updates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUpdates((await res.json()) as PendingBrainUpdate[]);
      setError(null);
    } catch (e) {
      setError(mensagemDeErro(e, "carregar as atualizações do Brain"));
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
      setError(mensagemDeErro(e, "aplicar esta atualização"));
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">Atualizações de Brain pendentes</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[var(--accent-light)] text-[var(--navy)]">
          ✦ Learning loop
        </span>
      </div>
      <div className="px-6 py-4 space-y-2">
        {loading && <p className="text-[12px] text-[var(--text-muted)]">Carregando…</p>}
        {error && (
          <div role="alert" className="rounded-[8px] border border-[#FCA5A5] bg-[var(--danger-bg)] px-3 py-2.5">
            <p className="text-[13px] text-[#991B1B]">{error.mensagem}</p>
            {error.detalhe && (
              <p className="text-[11px] text-[#991B1B]/70 mt-1 break-words">Detalhe técnico: {error.detalhe}</p>
            )}
            <button
              onClick={() => { setError(null); void load(); }}
              className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[#991B1B] hover:bg-white/60 transition-colors"
            >
              Tentar de novo
            </button>
          </div>
        )}
        {!loading && !error && updates.length === 0 && (
          <p className="text-[12px] text-[var(--text-muted)]">Nenhuma atualização pendente. O Brain propõe mudanças a partir de entregas aprovadas.</p>
        )}
        {updates.map((u) => (
          <div key={u.id} className="flex items-start gap-3 border border-[var(--border)] rounded-[8px] px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">{u.fieldChanged}</span>
                <span className="h-4 px-1.5 rounded-[3px] bg-[var(--accent)] text-[var(--text-secondary)] text-[9px] font-medium leading-4">{u.department}</span>
                <span className="h-4 px-1.5 rounded-[3px] bg-[var(--accent-light)] text-[var(--navy)] text-[9px] font-medium leading-4">{u.source}</span>
              </div>
              {u.previousValue && (
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-through truncate">{u.previousValue}</p>
              )}
              <p className="text-[11px] text-[var(--text-primary)] mt-0.5 truncate">{u.proposedValue}</p>
            </div>
            <button
              onClick={() => apply(u.id)}
              disabled={applying === u.id}
              className="h-7 px-3 rounded-[6px] bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-50 text-white text-[11px] font-medium transition-colors shrink-0"
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
          integrationConfigs, aiRunLogs: storeRunLogs, departmentConfigs, clientRequests,
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
  const report = runSystemDoctor({ clients, projects, deliverables, materialRequests, strategyRooms, tasks, persisted, integrationConfigs, dbAvailable, authMode, portalMode, sessionActive, sessionUser, dbSyncStatus, aiRunLogs, aiRunLogSource, openaiConfigured, departmentConfigs, clientRequests });
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

        {/* ── TOP DOWN: as decisões que só o CEO toma ──────────────────────────
            Fica no topo de propósito: é o dispositivo que destrava a casa, e
            um dispositivo desses escondido no rodapé é um dispositivo que
            ninguém encontra na hora em que ele importa. Some sozinho para
            quem não é `master` — o portão é no servidor. */}
        <TopDown />

        {/* A inauguração. Some para quem não é `master`; o portão é no servidor. */}
        <ZerarAAgencia />

        {/* ── Learning loop: pending Brain updates ─────────────────────────────── */}
        <PendingBrainUpdates />

        {/* ── SECTION 1: Saúde do Sistema ──────────────────────────────────────── */}
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Saúde do Sistema</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[var(--accent-light)] text-[var(--navy)]">
              Interno · Tempo real
            </span>
          </div>

          {/* Score summary */}
          <div className="px-6 py-5 border-b border-[var(--border)]">
            <div className="flex items-center gap-5">
              <ScoreRing score={score} status={overallStatus} />
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-semibold mb-1 ${oc.labelColor}`}>{oc.label}</div>
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-[12px] text-[var(--text-secondary)] mono-num">
                    <span className="font-semibold text-[var(--success)]">{pass}</span> ok ·{" "}
                    <span className="font-semibold text-[var(--warning)]">{warning}</span> atenção ·{" "}
                    <span className="font-semibold text-[var(--danger)]">{fail}</span> falha ·{" "}
                    <span className="font-semibold text-[var(--navy)]">{info}</span> info
                  </span>
                </div>
                {(fail > 0 || warning > 0) && (
                  <div className="flex items-start gap-2 bg-[var(--bg)] rounded-[7px] px-3 py-2">
                    <svg className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M8 7v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed flex-1">
                      <span className="font-medium text-[var(--text-primary)]">Ação recomendada:</span>{" "}{topAction}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grouped checks */}
          <div className="divide-y divide-[var(--border)]">
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
                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-[var(--bg-elevated)] transition-colors text-left"
                    onClick={() => setExpandedGroup(isOpen ? null : group)}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[groupSummaryStatus].dot}`} />
                    <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)]">{group}</span>
                    <div className="flex items-center gap-1.5">
                      {groupFail > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#FEE2E2] text-[var(--danger)]">
                          {groupFail} falha{groupFail > 1 ? "s" : ""}
                        </span>
                      )}
                      {groupWarn > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--warning-bg)] text-[var(--warning)]">
                          {groupWarn} atenção
                        </span>
                      )}
                      {groupFail === 0 && groupWarn === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--success-bg)] text-[var(--success)]">
                          {groupPass} ok
                        </span>
                      )}
                    </div>
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="bg-[var(--bg-elevated)] border-t border-[var(--border)] divide-y divide-[var(--border)]">
                      {gChecks.map((check) => {
                        const sc = STATUS_COLOR[check.status];
                        return (
                          <div key={check.id} className={`px-6 py-3.5 border-l-2 ${sc.border}`}>
                            <div className="flex items-start gap-2.5 mb-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${sc.dot}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{check.label}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${sc.badge}`}>
                                    {STATUS_LABEL[check.status]}
                                  </span>
                                </div>
                                <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed">{check.explanation}</p>
                                {check.status !== "pass" && check.status !== "info" && (
                                  <div className="mt-1.5 flex items-start gap-1.5">
                                    <span className="text-[11px] text-[var(--text-muted)] font-medium shrink-0">→</span>
                                    <p className="text-[11px] text-[var(--navy)] leading-relaxed">{check.action}</p>
                                  </div>
                                )}
                              </div>
                              {check.route && (
                                <Link
                                  href={check.route}
                                  className="shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--navy)] underline whitespace-nowrap"
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
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Status do Workspace</span>
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
                  <div className="text-[22px] font-semibold text-[var(--text-primary)] mono-num">{value}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Operational indicators */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[var(--bg-elevated)] rounded-[8px] px-3 py-2.5 border border-[var(--border)]">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Revisões pendentes</div>
                <div className={`text-[18px] font-bold mono-num ${inReviewCount > 0 ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>
                  {inReviewCount}
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)] rounded-[8px] px-3 py-2.5 border border-[var(--border)]">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Brand updates pendentes</div>
                <div className={`text-[18px] font-bold mono-num ${pendingBrandUpdates > 0 ? "text-[var(--navy)]" : "text-[var(--text-primary)]"}`}>
                  {pendingBrandUpdates}
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)] rounded-[8px] px-3 py-2.5 border border-[var(--border)]">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Última atividade</div>
                <div className="text-[14px] font-semibold text-[var(--text-primary)] mono-num">{lastActivity}</div>
              </div>
            </div>

            {/* Integrations shortcut */}
            <div className="flex items-center justify-between bg-[#EFF4FF] rounded-[8px] px-4 py-3 border border-[#E6EEFF] mt-1">
              <div>
                <div className="text-[13px] font-semibold text-[var(--navy)]">Ferramentas &amp; Integrações</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">Gerenciar ferramentas, IAs dos agentes e conexões.</div>
              </div>
              <Link
                href="/agency/integrations"
                className="shrink-0 px-3 py-1.5 bg-[var(--navy)] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#0D1230] transition-colors"
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
            <div className="flex items-center justify-between py-3.5 border-b border-[var(--border)]">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">Carregar solicitação — Dioli Digital (Instagram)</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
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
            <div className="flex items-center justify-between py-3.5 border-b border-[var(--border)]">
              <p className="text-[13px] text-[var(--text-secondary)] pr-4">{t.settings.languageDesc}</p>
              <div className="flex items-center gap-1.5 bg-[var(--bg)] rounded-[7px] p-1 shrink-0">
                {LOCALES.map((loc) => (
                  <button
                    key={loc.value}
                    onClick={() => setLocale(loc.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[12px] font-medium transition-all ${
                      locale === loc.value
                        ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    <span>{loc.flag}</span>
                    <span>{loc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reset to factory */}
            <div className="flex items-center justify-between py-3.5 border-b border-[var(--border)]">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">{t.settings.resetData}</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{t.settings.resetDataDesc}</div>
              </div>
              {!confirmReset ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                  {t.settings.resetData}
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[12px] text-[var(--text-secondary)] font-medium">Restaurar dados de fábrica?</span>
                  <Button variant="primary" size="sm" onClick={handleReset}>{t.common.confirm}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>{t.common.cancel}</Button>
                </div>
              )}
            </div>

            {/* Clear all */}
            <div className="flex items-center justify-between py-3.5">
              <div className="pr-4">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">Limpar todos os dados locais</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  Remove clientes, projetos, tarefas e entregas deste navegador. Ação irreversível.
                </div>
              </div>
              {!confirmClear ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
                  Limpar tudo
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[12px] text-[var(--danger)] font-medium">Apagar tudo definitivamente?</span>
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
                  <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
                  <span className={`text-[12px] font-medium ${label === "Persistência" && !persisted ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-1 border-t border-[var(--border)]">
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {t.settings.persistenceDesc}
              </p>
            </div>
          </div>
        </CollapsibleSection>

      </div>
    </>
  );
}
