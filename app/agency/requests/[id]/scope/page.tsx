"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { PortalChat } from "@/components/agency/portal/PortalChat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientRequestDb {
  id: string;
  businessName: string;
  status: string;
  [key: string]: unknown;
}

interface Artifact {
  id: string;
  clientRequestId: string;
  department: string;
  status: string;
  canvas: Record<string, unknown>;
  [key: string]: unknown;
}

type Decision = { action: "approved" | "revision" | null; note: string };

// ── Department config ─────────────────────────────────────────────────────────

const DEPARTMENTS: { key: string; label: string }[] = [
  { key: "strategy", label: "Estratégia" },
  { key: "social",   label: "Social Media" },
  { key: "design",   label: "Design" },
  { key: "traffic",  label: "Tráfego Pago" },
  { key: "analytics",label: "Analytics" },
  { key: "quality",  label: "Qualidade" },
];

// ── Quality gate badge ────────────────────────────────────────────────────────

type GateResult = "PASS" | "WARNING" | "FAIL" | string;

function QualityGateBadge({ result }: { result: GateResult | undefined | null }) {
  if (!result) return null;
  const upper = (result as string).toUpperCase();
  if (upper === "PASS") {
    return (
      <span className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold flex items-center">
        PASS
      </span>
    );
  }
  if (upper === "WARNING") {
    return (
      <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-bold flex items-center">
        WARNING
      </span>
    );
  }
  if (upper === "FAIL") {
    return (
      <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#991B1B] text-[10px] font-bold flex items-center">
        FAIL
      </span>
    );
  }
  return (
    <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-bold flex items-center">
      {result}
    </span>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">{label}</span>
      <span className="text-[13px] text-[#1A1A1A] leading-snug">{value}</span>
    </div>
  );
}

function TagList({ items, getLabel }: { items: unknown[]; getLabel?: (item: unknown) => string }) {
  if (!Array.isArray(items) || items.length === 0) return <span className="text-[12px] text-[#9B9B95]">—</span>;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {items.map((item, i) => {
        const label = getLabel ? getLabel(item) : String(item);
        return (
          <span key={i} className="h-5 px-2 rounded-[4px] bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ── Canvas field renderers per department ─────────────────────────────────────

function StrategyFields({ canvas }: { canvas: Record<string, unknown> }) {
  const roadmap = Array.isArray(canvas.recommendedRoadmap) ? canvas.recommendedRoadmap as Array<{ phase?: string; durationWeeks?: number }> : [];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div className="col-span-2">
        <FieldRow label="Posicionamento" value={canvas.positioningStatement as string} />
      </div>
      <FieldRow label="Objetivo principal" value={canvas.mainObjective as string} />
      <FieldRow label="Público-alvo" value={canvas.audience as string} />
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Canais prioritários</span>
        <TagList items={Array.isArray(canvas.priorityChannels) ? canvas.priorityChannels as unknown[] : []} />
      </div>
      {roadmap.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Roadmap recomendado</span>
          <div className="mt-1 space-y-1">
            {roadmap.map((phase, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] text-[#1A1A1A]">
                <span className="w-4 h-4 rounded-full bg-[#070A1F] text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span>{phase.phase}</span>
                {phase.durationWeeks && (
                  <span className="text-[11px] text-[#9B9B95]">· {phase.durationWeeks}sem</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SocialFields({ canvas }: { canvas: Record<string, unknown> }) {
  const pillars = Array.isArray(canvas.editorialPillars) ? canvas.editorialPillars as Array<{ name?: string }> : [];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <FieldRow label="Objetivo de conteúdo" value={canvas.contentObjective as string} />
      <FieldRow label="Frequência recomendada" value={canvas.recommendedFrequency as string} />
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Canais prioritários</span>
        <TagList items={Array.isArray(canvas.priorityChannels) ? canvas.priorityChannels as unknown[] : []} />
      </div>
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Formatos recomendados</span>
        <TagList items={Array.isArray(canvas.recommendedFormats) ? canvas.recommendedFormats as unknown[] : []} />
      </div>
      {pillars.length > 0 && (
        <div className="col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Pilares editoriais</span>
          <TagList items={pillars} getLabel={(p) => (p as { name?: string }).name ?? String(p)} />
        </div>
      )}
    </div>
  );
}

function DesignFields({ canvas }: { canvas: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div className="col-span-2">
        <FieldRow label="Conceito visual" value={canvas.visualConcept as string} />
      </div>
      <FieldRow label="Tom visual" value={canvas.visualTone as string} />
      <FieldRow label="Direção de cores" value={canvas.colorDirection as string} />
      <FieldRow
        label="Total de assets necessários"
        value={canvas.totalAssetsRequired !== undefined ? String(canvas.totalAssetsRequired) : undefined}
      />
    </div>
  );
}

function TrafficFields({ canvas }: { canvas: Record<string, unknown> }) {
  const campaigns = Array.isArray(canvas.campaigns) ? canvas.campaigns as Array<{ name?: string; channel?: string; objective?: string }> : [];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <FieldRow
        label="Leads/mês projetados"
        value={canvas.projectedMonthlyLeads !== undefined ? String(canvas.projectedMonthlyLeads) : undefined}
      />
      <FieldRow
        label="ROAS projetado"
        value={canvas.projectedROAS !== undefined ? String(canvas.projectedROAS) : undefined}
      />
      <FieldRow
        label="CAC projetado"
        value={canvas.projectedCAC !== undefined ? String(canvas.projectedCAC) : undefined}
      />
      <FieldRow label="Cenário de budget" value={canvas.budgetScenario as string} />
      {campaigns.length > 0 && (
        <div className="col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Campanhas</span>
          <div className="mt-1 space-y-1.5">
            {campaigns.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="font-medium text-[#1A1A1A]">{c.name}</span>
                {c.channel && (
                  <span className="h-4 px-1.5 rounded-[3px] bg-[#F0F0ED] text-[#6B6B65] text-[10px]">{c.channel}</span>
                )}
                {c.objective && (
                  <span className="text-[#9B9B95] text-[11px]">· {c.objective}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsFields({ canvas }: { canvas: Record<string, unknown> }) {
  const kpis = Array.isArray(canvas.kpis) ? canvas.kpis as Array<{ label?: string }> : [];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <FieldRow label="KPI primário" value={canvas.primaryKPI as string} />
      <FieldRow label="Cadência de relatórios" value={canvas.reportingCadence as string} />
      <FieldRow label="Plataforma de dashboard" value={canvas.dashboardPlatform as string} />
      {kpis.length > 0 && (
        <div className="col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">KPIs</span>
          <TagList items={kpis} getLabel={(k) => (k as { label?: string }).label ?? String(k)} />
        </div>
      )}
    </div>
  );
}

function QualityFields({ canvas }: { canvas: Record<string, unknown> }) {
  const gateResult = canvas.gateResult as Record<string, unknown> | undefined;
  const findings = Array.isArray(canvas.keyFindings) ? (canvas.keyFindings as string[]).slice(0, 3) : [];
  const recommendations = Array.isArray(canvas.recommendations)
    ? (canvas.recommendations as Array<{ recommendation?: string; priority?: string }>).slice(0, 3)
    : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="col-span-2">
          <FieldRow label="Veredicto geral" value={canvas.overallVerdict as string} />
        </div>
        {gateResult && (
          <>
            <FieldRow
              label="Aprovados"
              value={
                gateResult.passCount !== undefined ? (
                  <span className="text-[#16A34A] font-semibold">{String(gateResult.passCount)}</span>
                ) : undefined
              }
            />
            <FieldRow
              label="Alertas"
              value={
                gateResult.warningCount !== undefined ? (
                  <span className="text-[#D97706] font-semibold">{String(gateResult.warningCount)}</span>
                ) : undefined
              }
            />
            <FieldRow
              label="Falhas"
              value={
                gateResult.failCount !== undefined ? (
                  <span className="text-[#DC2626] font-semibold">{String(gateResult.failCount)}</span>
                ) : undefined
              }
            />
          </>
        )}
      </div>
      {findings.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Principais achados</span>
          <ul className="mt-1 space-y-1">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#1A1A1A]">
                <span className="text-[#9B9B95] shrink-0">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#9B9B95]">Recomendações</span>
          <ul className="mt-1 space-y-1.5">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                {r.priority && (
                  <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-bold flex items-center shrink-0 ${
                    r.priority === "high" || r.priority === "critical"
                      ? "bg-[#FEE2E2] text-[#991B1B]"
                      : r.priority === "medium"
                      ? "bg-[#FEF3C7] text-[#92400E]"
                      : "bg-[#F0F0ED] text-[#6B6B65]"
                  }`}>
                    {r.priority}
                  </span>
                )}
                <span className="text-[#1A1A1A] leading-snug">{r.recommendation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CanvasFields({ deptKey, canvas }: { deptKey: string; canvas: Record<string, unknown> }) {
  switch (deptKey) {
    case "strategy":  return <StrategyFields canvas={canvas} />;
    case "social":    return <SocialFields canvas={canvas} />;
    case "design":    return <DesignFields canvas={canvas} />;
    case "traffic":   return <TrafficFields canvas={canvas} />;
    case "analytics": return <AnalyticsFields canvas={canvas} />;
    case "quality":   return <QualityFields canvas={canvas} />;
    default:          return null;
  }
}

// ── Section Card ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  deptKey: string;
  label: string;
  artifact: Artifact | undefined;
  decision: Decision;
  onDecision: (action: "approved" | "revision") => void;
  onNote: (note: string) => void;
}

function SectionCard({ deptKey, label, artifact, decision, onDecision, onNote }: SectionCardProps) {
  const canvas = artifact?.canvas ?? {};
  const gateOverall =
    (canvas.qualityGateResult as Record<string, unknown> | undefined)?.overall as string | undefined ??
    (canvas.gateResult as Record<string, unknown> | undefined)?.overall as string | undefined;

  const isApproved = decision.action === "approved";
  const isRevision = decision.action === "revision";

  return (
    <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0ED]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">{label}</h2>
          <QualityGateBadge result={gateOverall} />
        </div>
        {!artifact && (
          <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold">
            Sem rascunho
          </span>
        )}
      </div>

      {/* Canvas fields */}
      <div className="px-6 py-5">
        {artifact ? (
          <CanvasFields deptKey={deptKey} canvas={canvas} />
        ) : (
          <p className="text-[13px] text-[#9B9B95]">
            Nenhum artefato em rascunho encontrado para esta seção.
          </p>
        )}
      </div>

      {/* Decision buttons */}
      <div className="px-6 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          {/* Aprovar */}
          <button
            onClick={() => onDecision("approved")}
            className={`h-9 px-4 rounded-[8px] text-[13px] font-semibold transition-colors ${
              isApproved
                ? "bg-[#070A1F] text-white"
                : "border border-[#070A1F] text-[#070A1F] bg-white hover:bg-[#E6FBFA]"
            }`}
          >
            {isApproved ? "✓ Aprovado" : "Aprovar"}
          </button>

          {/* Pedir revisão */}
          <button
            onClick={() => onDecision("revision")}
            className={`h-9 px-4 rounded-[8px] text-[13px] font-semibold transition-colors ${
              isRevision
                ? "border-2 border-[#D97706] text-[#92400E] bg-[#FEF3C7]"
                : "border border-[#D0D0CC] text-[#6B6B65] bg-white hover:border-[#9B9B95] hover:text-[#1A1A1A]"
            }`}
          >
            {isRevision ? "✏ Revisão solicitada" : "Pedir revisão"}
          </button>
        </div>

        {/* Nota textarea — only shown when revision is selected */}
        {isRevision && (
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-[0.06em]">
              Nota para revisão <span className="font-normal text-[#9B9B95]">(opcional)</span>
            </label>
            <textarea
              value={decision.note}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Descreva o que precisa ser revisado…"
              rows={3}
              className="w-full rounded-[8px] border border-[#E5E5E2] px-3 py-2 text-[13px] text-[#1A1A1A] placeholder:text-[#C0C0BC] resize-none focus:outline-none focus:border-[#070A1F] focus:ring-1 focus:ring-[#070A1F] transition-colors"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading Spinner ───────────────────────────────────────────────────────────

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-[#E5E5E2] border-t-[#070A1F] animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScopeReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: requestId } = use(params);

  // ── State ─────────────────────────────────────────────────────────────────

  const [request, setRequest] = useState<ClientRequestDb | null>(null);
  const [artifactMap, setArtifactMap] = useState<Record<string, Artifact>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({
    strategy:  { action: null, note: "" },
    social:    { action: null, note: "" },
    design:    { action: null, note: "" },
    traffic:   { action: null, note: "" },
    analytics: { action: null, note: "" },
    quality:   { action: null, note: "" },
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set once the scope is fully approved and the project is created. Drives the
  // success screen — we do NOT redirect to /agency/projects/[id] because that
  // page reads the Zustand store, not the DB, and would 404 on a DB project.
  const [approvedProjectId, setApprovedProjectId] = useState<string | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const [reqRes, artRes] = await Promise.all([
          fetch(`/api/brain/client-requests?id=${encodeURIComponent(requestId)}`),
          fetch(`/api/brain/artifacts?clientRequestId=${encodeURIComponent(requestId)}`),
        ]);

        if (!reqRes.ok) throw new Error(`Erro ao buscar solicitação: HTTP ${reqRes.status}`);
        if (!artRes.ok) throw new Error(`Erro ao buscar artefatos: HTTP ${artRes.status}`);

        const reqData = await reqRes.json();
        const artData = await artRes.json();

        if (cancelled) return;

        // Support both { request } and direct object shapes
        const req: ClientRequestDb = reqData.request ?? reqData;
        setRequest(req);

        // Filter to draft artifacts and index by department
        const artifacts: Artifact[] = Array.isArray(artData.artifacts)
          ? artData.artifacts
          : Array.isArray(artData)
          ? artData
          : [];

        const draftMap: Record<string, Artifact> = {};
        for (const a of artifacts) {
          if (a.status === "draft" && a.department) {
            let canvas: Record<string, unknown> = {};
            const raw = (a as Record<string, unknown>).canvasJson;
            if (typeof raw === "string") {
              try { canvas = JSON.parse(raw); } catch { /* ignore */ }
            } else if (raw && typeof raw === "object") {
              canvas = raw as Record<string, unknown>;
            }
            draftMap[a.department as string] = { ...a, canvas };
          }
        }
        setArtifactMap(draftMap);
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Erro desconhecido ao carregar dados.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [requestId]);

  // ── Decision handlers ─────────────────────────────────────────────────────

  function handleDecision(deptKey: string, action: "approved" | "revision") {
    setDecisions((prev) => ({
      ...prev,
      [deptKey]: { ...prev[deptKey], action },
    }));
  }

  function handleNote(deptKey: string, note: string) {
    setDecisions((prev) => ({
      ...prev,
      [deptKey]: { ...prev[deptKey], note },
    }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const allDecided = DEPARTMENTS.every((d) => decisions[d.key]?.action !== null);
  const approvedCount = DEPARTMENTS.filter((d) => decisions[d.key]?.action === "approved").length;
  const revisionCount = DEPARTMENTS.filter((d) => decisions[d.key]?.action === "revision").length;

  async function handleSubmit() {
    if (!allDecided || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/brain/auto-scope/${encodeURIComponent(requestId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.action === "approved_all") {
        // Project created in the DB. Show an in-page success state instead of
        // redirecting to the Zustand-backed project page (which would 404).
        setApprovedProjectId(data.projectId ?? "");
        setSubmitting(false);
      } else if (data.action === "revisions_requested") {
        window.location.replace("/agency/requests");
      } else {
        throw new Error("Resposta inesperada do servidor.");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erro ao confirmar decisões.");
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (approvedProjectId !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg, #F5F5F3)" }}>
        <div className="max-w-[460px] w-full bg-white border border-[#E5E5E2] rounded-[16px] p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-5 text-[#16A34A] text-[26px] font-bold">
            ✓
          </div>
          <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">Escopo aprovado</h1>
          <p className="text-[14px] text-[#6B6B65] leading-relaxed mb-6">
            O projeto de <span className="font-semibold text-[#1A1A1A]">{request?.businessName ?? "este cliente"}</span> foi
            criado e entrou em execução. A equipe já pode tocar as frentes aprovadas.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href={approvedProjectId ? `/agency/execution/${approvedProjectId}` : "/agency/requests"}
              className="h-10 px-5 rounded-[8px] bg-[#070A1F] text-white text-[13px] font-semibold hover:bg-[#0D1230] transition-colors inline-flex items-center"
            >
              Ver o projeto →
            </Link>
            <Link
              href="/agency/requests"
              className="h-10 px-5 rounded-[8px] border border-[#E5E5E2] bg-white text-[#6B6B65] hover:text-[#1A1A1A] hover:border-[#9B9B95] text-[13px] font-semibold transition-colors inline-flex items-center"
            >
              Solicitações
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg, #F5F5F3)" }}>
      {/* Scrollable content area */}
      <div className="px-8 py-8 space-y-6 max-w-[900px] mx-auto pb-32">
        <AgencyHeader
          title="Revisão do Escopo"
          eyebrow={request?.businessName ?? undefined}
          subtitle="Aprove ou solicite revisão de cada seção antes de criar o projeto."
          actions={
            <Link
              href="/agency/requests"
              className="h-9 px-4 rounded-[8px] border border-[#E5E5E2] bg-white text-[#6B6B65] hover:text-[#1A1A1A] hover:border-[#9B9B95] text-[13px] font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              ← Voltar
            </Link>
          }
        />

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Spinner size={28} />
              <p className="text-[13px] text-[#9B9B95]">Carregando escopo…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && fetchError && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[12px] px-6 py-5">
            <p className="text-[14px] font-semibold text-[#991B1B]">Erro ao carregar</p>
            <p className="text-[13px] text-[#B91C1C] mt-1">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 h-8 px-4 rounded-[7px] border border-[#FCA5A5] bg-white text-[#DC2626] text-[12px] font-semibold hover:bg-[#FEF2F2] transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Department section cards */}
        {!loading && !fetchError && (
          <>
            {DEPARTMENTS.map((dept) => (
              <SectionCard
                key={dept.key}
                deptKey={dept.key}
                label={dept.label}
                artifact={artifactMap[dept.key]}
                decision={decisions[dept.key]}
                onDecision={(action) => handleDecision(dept.key, action)}
                onNote={(note) => handleNote(dept.key, note)}
              />
            ))}
          </>
        )}

        {/* Conversa com o cliente — mesmo canal do portal, lado da equipe */}
        {!loading && !fetchError && request && (
          <div>
            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
              Conversa com o cliente
            </p>
            <PortalChat
              clientRequestId={requestId}
              height={320}
              suggestContext={`O escopo do projeto de ${request.businessName} acabou de ser revisado pela equipe (${approvedCount} de ${DEPARTMENTS.length} áreas aprovadas). Escreva uma mensagem avisando que o projeto foi aprovado e que a equipe vai dar sequência ao cronograma, com próximos passos em breve.`}
            />
          </div>
        )}
      </div>

      {/* Sticky footer */}
      {!loading && !fetchError && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E5E5E2] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="max-w-[900px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
            {/* Decision summary */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[#6B6B65]">
                <span className="font-semibold text-[#1A1A1A]">{approvedCount}</span> aprovada{approvedCount !== 1 ? "s" : ""}
              </span>
              {revisionCount > 0 && (
                <>
                  <span className="text-[#D0D0CC]">·</span>
                  <span className="text-[13px] text-[#6B6B65]">
                    <span className="font-semibold text-[#D97706]">{revisionCount}</span> revisão{revisionCount !== 1 ? " solicitadas" : " solicitada"}
                  </span>
                </>
              )}
              {!allDecided && (
                <>
                  <span className="text-[#D0D0CC]">·</span>
                  <span className="text-[13px] text-[#9B9B95]">
                    {DEPARTMENTS.length - approvedCount - revisionCount} pendente{DEPARTMENTS.length - approvedCount - revisionCount !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Error message */}
              {submitError && (
                <p className="text-[12px] text-[#DC2626] max-w-[260px] text-right">{submitError}</p>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={!allDecided || submitting}
                className={`h-9 px-5 rounded-[8px] text-[13px] font-semibold transition-colors inline-flex items-center gap-2 ${
                  allDecided && !submitting
                    ? "bg-[#070A1F] text-white hover:bg-[#0D1230]"
                    : "bg-[#E5E5E2] text-[#9B9B95] cursor-not-allowed"
                }`}
              >
                {submitting && <Spinner size={14} />}
                {submitting ? "Confirmando…" : "Confirmar decisões"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
