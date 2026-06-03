"use client";

import { useEffect, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";
import {
  getReadinessSignals,
  getPilotDataStatus,
  READINESS_WARNINGS,
  SMOKE_STEPS,
  type ReadinessLevel,
} from "@/lib/agency/readiness";

const LEVEL_DOT: Record<ReadinessLevel, string> = {
  ok: "bg-[#16A34A]",
  warning: "bg-[#D97706]",
  info: "bg-[#5B5BD6]",
};

export default function SettingsPage() {
  const { clients, projects, tasks, deliverables, briefings, resetStore, loadPilotData, clearAllData } =
    useAgencyStore();
  const { t, locale, setLocale } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [smokeChecked, setSmokeChecked] = useState<Record<string, boolean>>({});

  // Persistence is a client-only signal (localStorage isn't available on the server).
  useEffect(() => {
    try {
      setPersisted(!!window.localStorage.getItem("agency-os-v1"));
    } catch {
      setPersisted(false);
    }
  }, [clients, projects, deliverables]);

  const handleReset = () => {
    resetStore();
    setConfirmReset(false);
  };
  const handleClear = () => {
    clearAllData();
    setConfirmClear(false);
  };

  const stats = [
    { label: t.settings.labels.clients, value: clients.length },
    { label: t.settings.labels.projects, value: projects.length },
    { label: t.settings.labels.tasks, value: tasks.length },
    { label: t.settings.labels.deliverables, value: deliverables.length },
    { label: t.settings.labels.briefings, value: briefings.length },
  ];

  const LOCALES: { value: Locale; label: string; flag: string }[] = [
    { value: "pt-BR", label: "Português (BR)", flag: "🇧🇷" },
    { value: "en", label: "English", flag: "🇺🇸" },
  ];

  const signals = getReadinessSignals({ clients, projects, deliverables, persisted });
  const pilot = getPilotDataStatus(clients, projects, deliverables);
  const smokeDoneCount = SMOKE_STEPS.filter((s) => smokeChecked[s.id]).length;

  return (
    <>
      <AgencyHeader
        title={t.settings.title}
        subtitle={t.settings.subtitle}
      />

      <div className="max-w-2xl space-y-6">

        {/* ── Deployment Readiness (internal only) ───────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">
              Prontidão para Produção
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[#EEF0FF] text-[#5B5BD6]">
              Interno
            </span>
          </div>
          <div className="space-y-2.5">
            {signals.map((sig) => (
              <div key={sig.id} className="flex items-start gap-2.5">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${LEVEL_DOT[sig.level]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#1A1A1A] font-medium">{sig.label}</div>
                  <div className="text-[12px] text-[#6B6B65] leading-relaxed">{sig.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Internal warnings */}
          <div className="mt-5 pt-4 border-t border-[#E5E5E2] space-y-3">
            {READINESS_WARNINGS.map((w) => (
              <div
                key={w.id}
                className="rounded-[8px] border border-[#FDE7C7] bg-[#FFFBF4] px-3.5 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px]">⚠️</span>
                  <span className="text-[12px] font-semibold text-[#9A5B00]">{w.title}</span>
                </div>
                <p className="text-[12px] text-[#8A6A3A] leading-relaxed">{w.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Production Smoke Prep ───────────────────────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">
              Checklist de Smoke (Produção)
            </div>
            <span className="text-[12px] text-[#9B9B95] mono-num">
              {smokeDoneCount}/{SMOKE_STEPS.length}
            </span>
          </div>
          <p className="text-[12px] text-[#9B9B95] leading-relaxed mb-4">
            Verificação manual do operador antes de liberar o piloto. Marcações ficam apenas nesta sessão.
          </p>
          <div className="space-y-1.5">
            {SMOKE_STEPS.map((s) => {
              const done = !!smokeChecked[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => setSmokeChecked((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                  className="w-full flex items-start gap-2.5 text-left px-2 py-1.5 rounded-[6px] hover:bg-[#F7F7F6] transition-colors"
                >
                  <span
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center mt-0.5 shrink-0 ${
                      done ? "bg-[#16A34A] border-[#16A34A]" : "border-[#C0C0BA] bg-white"
                    }`}
                  >
                    {done && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium ${done ? "text-[#9B9B95] line-through" : "text-[#1A1A1A]"}`}>
                      {s.label}
                    </div>
                    <div className="text-[12px] text-[#9B9B95]">{s.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">
            {t.settings.language}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[#6B6B65]">{t.settings.languageDesc}</p>
            <div className="flex items-center gap-1.5 bg-[#F7F7F6] rounded-[7px] p-1">
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
        </div>

        {/* Workspace stats */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-4">{t.settings.workspaceOverview}</div>
          <div className="grid grid-cols-5 gap-3">
            {stats.map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-[22px] font-semibold text-[#1A1A1A] mono-num">{value}</div>
                <div className="text-[11px] text-[#9B9B95] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Persistence status */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">{t.settings.dataPersistence}</div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span className="text-[13px] text-[#1A1A1A] font-medium">{t.settings.persistenceActive}</span>
          </div>
          <p className="text-[12px] text-[#9B9B95] leading-relaxed">
            {t.settings.persistenceDesc}
          </p>
        </div>

        {/* Platform info */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">{t.settings.platform}</div>
          <div className="space-y-2">
            {[
              { label: t.settings.labels.system, value: "Dioli Agency OS" },
              { label: t.settings.labels.version, value: "1.0.0 MVP" },
              { label: t.settings.labels.techStack, value: "Next.js · Zustand · Tailwind CSS" },
              { label: t.settings.labels.storage, value: "Browser localStorage" },
              { label: t.settings.labels.environment, value: "Front-end only (no backend)" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[12px] text-[#9B9B95]">{label}</span>
                <span className="text-[12px] text-[#1A1A1A] font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Workspace data actions ──────────────────────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-4">{t.settings.workspaceActions}</div>

          {/* Load Dioli Digital pilot data */}
          <div className="flex items-center justify-between py-3 border-b border-[#F0F0ED]">
            <div className="pr-4">
              <div className="text-[13px] font-medium text-[#1A1A1A]">Carregar dados do piloto Dioli Digital</div>
              <div className="text-[12px] text-[#9B9B95] mt-0.5">
                Restaura o projeto piloto (Dioli Digital), suas entregas e tarefas sem apagar o restante do workspace.
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadPilotData()}
              disabled={pilot.available}
            >
              {pilot.available ? "Já carregado" : "Carregar piloto"}
            </Button>
          </div>

          {/* Reset to factory demo data */}
          <div className="flex items-center justify-between py-3 border-b border-[#F0F0ED]">
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

          {/* Clear all local data */}
          <div className="flex items-center justify-between py-3">
            <div className="pr-4">
              <div className="text-[13px] font-medium text-[#1A1A1A]">Limpar todos os dados locais</div>
              <div className="text-[12px] text-[#9B9B95] mt-0.5">
                Remove clientes, projetos, tarefas e entregas deste navegador. Ação irreversível — use “Carregar piloto” ou “Redefinir” para repovoar.
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

      </div>
    </>
  );
}
