"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";

export default function SettingsPage() {
  const { clients, projects, tasks, deliverables, briefings, resetStore } = useAgencyStore();
  const { t, locale, setLocale } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    resetStore();
    setConfirmReset(false);
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

  return (
    <>
      <AgencyHeader
        title={t.settings.title}
        subtitle={t.settings.subtitle}
      />

      <div className="max-w-2xl space-y-6">

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

        {/* Reset */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">{t.settings.workspaceActions}</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium text-[#1A1A1A]">{t.settings.resetData}</div>
              <div className="text-[12px] text-[#9B9B95] mt-0.5">{t.settings.resetDataDesc}</div>
            </div>
            {!confirmReset ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
                {t.settings.resetData}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#DC2626] font-medium">{t.settings.areYouSure}</span>
                <Button variant="danger" size="sm" onClick={handleReset}>{t.common.confirm}</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>{t.common.cancel}</Button>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
