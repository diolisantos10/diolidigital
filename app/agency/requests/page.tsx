"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { SecurePortalLinkButton } from "@/components/agency/portal/SecurePortalLinkButton";
import { useAgencyStore } from "@/store/agency-store";
import { useDbRequests, parseJson, type DbRequest } from "@/lib/agency/db-pipeline-hooks";
import { formatShort, timeAgo } from "@/lib/agency/format-time";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
  type ClientRequestStatus,
  type ClientRequest,
  type BriefingAnalysis,
} from "@/lib/agency/client-requests";
import type { BriefingScope, LiveEstimate, EstimateItem } from "@/lib/agency/briefing-conversation";
import type { SDRHandoff } from "@/lib/agency/sdr-agent";
import type { Priority } from "@/lib/agency/mock-data";
import { DEMO_CLIENT_ID } from "@/lib/agency/demo-client";
import { usePMOrchestrator } from "@/lib/dioli-brain/use-pm-orchestrator";
import { precoDoItemEmTexto, somaDosItens } from "@/lib/agency/comercial/preco-do-item";
import { linhaDeVolume, linhaDeVideo, linhaDeModalidade, type LinhaDeEscopo } from "@/lib/agency/comercial/escopo-na-voz-da-casa";

/** Uma linha do quadro de escopo no painel interno. Mesma forma da que o
 *  cliente lê — telas diferentes, verdade única. */
function LinhaDoEscopo({ linha }: { linha: LinhaDeEscopo }) {
  return (
    <div>
      <span className="text-[var(--text-muted)]">{linha.label}:</span>{" "}
      <span className={linha.dim ? "text-[var(--text-subtle)]" : linha.alerta ? "text-[var(--warning)] font-semibold" : undefined}>{linha.value}</span>
      {linha.detalhe ? <div className="text-[10px] text-[var(--text-muted)] leading-[1.45]">{linha.detalhe}</div> : null}
    </div>
  );
}

// ── Proposal Edit Types ───────────────────────────────────────────────────────

interface EditableItem extends EstimateItem {
  _key: string; // stable identity for React keys
}

interface ProposalDraft {
  items: EditableItem[];
  noteToClient: string;
  sentAt?: string;
}

// ── CopyLinkButton ────────────────────────────────────────────────────────────

function CopyLinkButton({ path, dark = false }: { path: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    const url = typeof window !== "undefined" ? window.location.origin + path : path;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={`h-9 px-4 rounded-[8px] text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
        dark
          ? "border border-white/20 bg-white/5 text-white hover:bg-white/10"
          : "h-7 px-3 rounded-[6px] border border-[var(--border)] bg-white text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

// ── PM Orchestrator (Phase 3) ─────────────────────────────────────────────────
// Minimal proposal flow attached to a status="new" DB request. Hidden entirely
// when BRAIN_PM_AUTOPILOT is off (propose() returns enabled:false → status
// "disabled"). The proposal is a DRAFT: nothing is created until "Aprovar & Criar".

const PRIORITY_STYLE: Record<string, string> = {
  critical: "bg-[#FEE2E2] text-[#991B1B]",
  high:     "bg-[var(--warning-bg)] text-[#92400E]",
  medium:   "bg-[var(--accent-light)] text-[var(--navy)]",
  low:      "bg-[var(--accent)] text-[var(--text-secondary)]",
};

function OrchestratePanel({ requestId, onApplied }: { requestId: string; onApplied: () => void }) {
  const { status, proposal, projectId, error, propose, apply, reset } = usePMOrchestrator(requestId);

  if (status === "idle") {
    return (
      <button
        onClick={propose}
        className="h-8 px-4 rounded-[7px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[12px] font-medium transition-colors shrink-0"
      >
        ✦ Orquestrar
      </button>
    );
  }
  if (status === "proposing") {
    return <span className="text-[11px] text-[var(--text-muted)] shrink-0">Raciocinando…</span>;
  }
  if (status === "disabled") {
    return <span className="text-[11px] text-[var(--text-muted)] shrink-0">PM Autopilot desativado</span>;
  }
  if (status === "done") {
    return (
      <span className="text-[11px] font-medium text-[#166534] shrink-0">
        Projeto criado{projectId ? ` (${projectId.slice(0, 6)}…)` : ""} ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-[#991B1B]">{error}</span>
        <button onClick={reset} className="text-[11px] underline text-[var(--text-secondary)]">Tentar de novo</button>
      </div>
    );
  }
  // proposed | applying — render the inline draft proposal for approval.
  if (!proposal) return null;
  return (
    <div className="w-full mt-2 rounded-[8px] border border-[var(--cyan)] bg-[#F5F8FF] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{proposal.name}</span>
        <span className="h-4 px-1.5 rounded-[3px] bg-[var(--navy)] text-white text-[9px] font-semibold leading-4">
          {proposal.reasoningMode === "ai" ? "IA" : "REGRAS LOCAIS"}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">DRAFT — nada foi criado ainda</span>
      </div>
      <p className="text-[11px] text-[var(--text-secondary)]">{proposal.goal}</p>
      {proposal.warnings.length > 0 && (
        <ul className="text-[10px] text-[#92400E] list-disc pl-4">
          {proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[var(--text-muted)] text-left">
            <th className="font-medium py-1">Tarefa</th>
            <th className="font-medium py-1">Depto</th>
            <th className="font-medium py-1">Prioridade</th>
            <th className="font-medium py-1">Dias</th>
          </tr>
        </thead>
        <tbody>
          {proposal.tasks.map((t, i) => (
            <tr key={i} className="border-t border-[#EEE]">
              <td className="py-1 pr-2 text-[var(--text-primary)]">{t.title}</td>
              <td className="py-1 pr-2 text-[var(--text-secondary)]">{t.department}</td>
              <td className="py-1 pr-2">
                <span className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold ${PRIORITY_STYLE[t.priority] ?? ""}`}>
                  {t.priority}
                </span>
              </td>
              <td className="py-1 text-[var(--text-secondary)]">{t.estimatedDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={async () => { await apply(proposal); onApplied(); }}
          disabled={status === "applying"}
          className="h-8 px-4 rounded-[7px] bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-50 text-white text-[12px] font-medium transition-colors"
        >
          {status === "applying" ? "Criando…" : "Aprovar & Criar projeto"}
        </button>
        <button onClick={reset} className="h-8 px-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Descartar
        </button>
      </div>
    </div>
  );
}

// ── SDRHandoffPanel / Brain Review Panel ─────────────────────────────────────

function SDRHandoffPanel({ handoff }: { handoff: SDRHandoff }) {
  const brain = handoff.brainReasoningOutput;
  const flow  = handoff.cognitiveFlowSummary;
  const qg    = handoff.qualityGateResult;

  const qgColors = {
    PASS:    { bg: "bg-[var(--success-bg)]", border: "border-[#86EFAC]", text: "text-[#166534]", badge: "bg-[var(--success)]" },
    WARNING: { bg: "bg-[var(--warning-bg)]", border: "border-[#FDE68A]", text: "text-[#92400E]", badge: "bg-[var(--warning)]" },
    FAIL:    { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]", badge: "bg-[var(--danger)]" },
  } as const;

  return (
    <div className="space-y-3">
      {/* Brain Review Panel header */}
      <div className="bg-[var(--accent-light)] border border-[var(--cyan)] rounded-[8px] px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em]">
            ✦ Brain Review Panel — SDR Agent
          </div>
          {qg && (
            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold ${qgColors[qg.overall].badge}`}>
              {qg.overall}
            </span>
          )}
        </div>

        {/* Brain Diagnosis */}
        {brain ? (
          <>
            <div>
              <p className="text-[10px] font-semibold text-[#1E3A8A] mb-1">Diagnóstico Brain</p>
              <p className="text-[11px] text-[#1E3A8A] leading-relaxed">{brain.intentionDetected}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-[var(--text-muted)]">Confiança:</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  brain.confidenceLevel === "high" ? "bg-[var(--success-bg)] text-[var(--success)]"
                  : brain.confidenceLevel === "medium" ? "bg-[var(--accent-light)] text-[var(--navy)]"
                  : "bg-[var(--warning-bg)] text-[var(--warning)]"
                }`}>
                  {brain.confidenceLevel === "high" ? "Alta" : brain.confidenceLevel === "medium" ? "Média" : "Baixa"}
                </span>
              </div>
            </div>

            {/* Known facts */}
            {brain.knownFacts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#1E3A8A] mb-1">Fatos Conhecidos</p>
                <div className="flex flex-wrap gap-1">
                  {brain.knownFacts.map((f, i) => (
                    <span key={i} className="h-5 px-2 rounded-[4px] bg-[#E9EFFF] text-[#1E3A8A] text-[10px]">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Unknown facts */}
            {brain.unknownFacts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--warning)] mb-0.5">Incógnitas</p>
                {brain.unknownFacts.slice(0, 4).map((u, i) => (
                  <p key={i} className="text-[11px] text-[#92400E]">? {u}</p>
                ))}
              </div>
            )}

            {/* Risks */}
            {brain.risks.length > 0 && (
              <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[6px] px-3 py-2">
                <p className="text-[10px] font-semibold text-[var(--warning)] mb-0.5">Riscos</p>
                {brain.risks.map((r, i) => (
                  <p key={i} className="text-[11px] text-[#92400E]">⚠ {r}</p>
                ))}
              </div>
            )}

            {/* Opportunities */}
            {brain.opportunities.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--success)] mb-0.5">Oportunidades</p>
                {brain.opportunities.map((o, i) => (
                  <p key={i} className="text-[11px] text-[#166534]">✓ {o}</p>
                ))}
              </div>
            )}

            {/* Recommended dept/services */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Departamento recomendado</p>
                <span className="h-5 px-2 rounded-full bg-[#E9EFFF] text-[var(--navy)] text-[10px] font-medium">
                  {brain.recommendedDepartment}
                </span>
              </div>
              {brain.recommendedServices.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Serviços recomendados</p>
                  <div className="flex flex-wrap gap-1">
                    {brain.recommendedServices.map((s, i) => (
                      <span key={i} className="h-5 px-2 rounded-full bg-[#E9EFFF] text-[var(--navy)] text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Diagnóstico</p>
              <p className="text-[11px] text-[#1E3A8A] leading-relaxed">{handoff.diagnosis}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Orçamento</p>
              <p className="text-[11px] text-[#1E3A8A]">{handoff.budgetFit}</p>
            </div>
          </>
        )}

        {/* Recommended PM action */}
        <div className="bg-[#E9EFFF] rounded-[6px] px-3 py-2">
          <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Ação recomendada para o PM</p>
          <p className="text-[11px] text-[#1E3A8A] leading-relaxed">
            {brain?.nextAction ?? handoff.recommendedPMAction}
          </p>
        </div>
      </div>

      {/* Cognitive Flow Summary */}
      {flow && (
        <div className="bg-[#EFF4FF] border border-[#D6DEFF] rounded-[8px] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em]">Fluxo Cognitivo</p>
            <span className="text-[11px] font-bold text-[var(--navy)]">{flow.stepsCompleted}/{flow.totalSteps} passos · {flow.completionRate}%</span>
          </div>
          <div className="w-full bg-[#E6EEFF] rounded-full h-1.5 mb-2">
            <div
              className="bg-[var(--navy)] h-1.5 rounded-full transition-all"
              style={{ width: `${flow.completionRate}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-1">
            {flow.steps.map((step) => (
              <div key={step.stepId} className="flex items-center gap-1 text-[9px]">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  step.completed ? "bg-[var(--navy)]" : "bg-[var(--border-strong)]"
                }`} />
                <span className={step.completed ? "text-[var(--navy)]" : "text-[var(--text-subtle)]"} title={step.summary}>
                  {step.order}. {step.label.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality Gate */}
      {qg && (
        <div className={`border rounded-[8px] px-4 py-3 ${qgColors[qg.overall].bg} ${qgColors[qg.overall].border}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${qgColors[qg.overall].text}`}>
              Quality Gate SDR — {qg.overall}
            </p>
            <span className="text-[10px] text-[var(--text-secondary)]">
              {qg.passCount} pass · {qg.warningCount} warn · {qg.failCount} fail
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {qg.items.map((item) => (
              <div key={item.id} className="flex items-start gap-1 text-[10px]" title={item.detail}>
                <span className={`shrink-0 font-bold ${
                  item.status === "PASS" ? "text-[var(--success)]"
                  : item.status === "WARNING" ? "text-[var(--warning)]"
                  : "text-[var(--danger)]"
                }`}>
                  {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                </span>
                <span className="text-[var(--text-secondary)] leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy fields: objections + tradeoffs */}
      {(handoff.objectionsHandled.length > 0 || handoff.tradeoffsAccepted.length > 0 || handoff.unresolvedRisks.length > 0) && (
        <div className="bg-[var(--accent-light)] border border-[var(--cyan)] rounded-[8px] px-4 py-3 space-y-2">
          {handoff.objectionsHandled.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Objeções tratadas</p>
              {handoff.objectionsHandled.map((o, i) => (
                <p key={i} className="text-[11px] text-[#1E3A8A]">• {o}</p>
              ))}
            </div>
          )}
          {handoff.tradeoffsAccepted.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Concessões aceitas</p>
              {handoff.tradeoffsAccepted.map((t, i) => (
                <p key={i} className="text-[11px] text-[#1E3A8A]">• {t}</p>
              ))}
            </div>
          )}
          {handoff.unresolvedRisks.length > 0 && (
            <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[6px] px-3 py-2">
              <p className="text-[10px] font-semibold text-[var(--warning)] mb-0.5">Riscos não resolvidos</p>
              {handoff.unresolvedRisks.map((r, i) => (
                <p key={i} className="text-[11px] text-[#92400E]">• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  "social-media":       "Social Media",
  "design":             "Design",
  "paid-traffic":       "Tráfego Pago",
  "brand-hub":          "Identidade de Marca",
  "project-management": "Gestão de Projetos",
  "strategy":           "Estratégia",
};

const DEPT_AGENT: Record<string, string> = {
  "project-management": "pm_agent",
  "strategy":           "pm_agent",
  "brand-hub":          "a2",
  "social-media":       "a3",
  "design":             "a2",
  "paid-traffic":       "a4",
};

const ALL_CONVERSION_DEPTS = ["strategy", "social-media", "design", "paid-traffic", "brand-hub"];

const STATUS_FILTERS: { label: string; value: ClientRequestStatus | "all" }[] = [
  { label: "Todas",              value: "all" },
  { label: "Novas",              value: "new" },
  { label: "Em Análise",        value: "under_review" },
  { label: "Aguardando Proposta", value: "proposal_pending" },
  { label: "Aguardando Estratégia", value: "waiting_strategy" },
  { label: "Aguardando Social", value: "waiting_social" },
  { label: "Aguardando Design", value: "waiting_design" },
  { label: "Aguardando Tráfego", value: "waiting_traffic" },
  { label: "Aguardando Analytics", value: "waiting_analytics" },
  { label: "Aguardando Quality", value: "waiting_quality" },
  { label: "Em Andamento",      value: "in_progress" },
  { label: "Aguardando Cliente",value: "waiting_client" },
  { label: "Concluídas",        value: "completed" },
  { label: "Recusadas",         value: "rejected" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveProjectName(services: string[], clientName: string): string {
  if (services.length === 0) return `Projeto Digital — ${clientName}`;
  const hasSocial  = services.some((s) => /social/i.test(s));
  const hasDesign  = services.some((s) => /design|branding/i.test(s));
  const hasTraffic = services.some((s) => /tráfego|pago|ads/i.test(s));
  if (hasSocial && hasDesign && hasTraffic) return `Crescimento Digital — ${clientName}`;
  if (hasSocial && hasDesign) return `Presença Digital — ${clientName}`;
  if (hasSocial) return `Crescimento Social — ${clientName}`;
  if (hasDesign) return `Identidade Visual — ${clientName}`;
  if (hasTraffic) return `Campanhas Pagas — ${clientName}`;
  return `${services[0]} — ${clientName}`;
}

function deriveGoal(objectives: string[]): string {
  if (objectives.length === 0) return "";
  return objectives.map((o) => o.replace(/^[A-Z]/, (c) => c.toLowerCase())).join(", ");
}

function deriveProjectType(services: string[]): string {
  if (services.length > 2) return "Multi-channel";
  if (services.some((s) => /social/i.test(s))) return "Social Media";
  if (services.some((s) => /design|branding/i.test(s))) return "Design";
  if (services.some((s) => /tráfego|ads/i.test(s))) return "Paid Traffic";
  return "Digital Marketing";
}

function suggestMaterials(services: string[]): string[] {
  const mats = new Set<string>();
  if (services.some((s) => /social/i.test(s))) {
    mats.add("Fotos e vídeos dos produtos/serviços");
    mats.add("Links das redes sociais ativas");
    mats.add("Promoções e ofertas vigentes");
  }
  if (services.some((s) => /design|branding/i.test(s))) {
    mats.add("Logo e identidade visual (arquivos editáveis)");
    mats.add("Paleta de cores e fontes da marca");
  }
  if (services.some((s) => /tráfego|pago|ads/i.test(s))) {
    mats.add("Conta de anúncios (Meta Ads / Google Ads)");
    mats.add("Criativos de anúncio anteriores (se houver)");
  }
  if (services.some((s) => /landing page|website|site/i.test(s))) {
    mats.add("Textos e conteúdo para a página");
    mats.add("Domínio e acesso à hospedagem");
  }
  if (services.some((s) => /apresentação|presentation/i.test(s))) {
    mats.add("Conteúdo e dados para a apresentação");
  }
  mats.add("Referências visuais ou de comunicação");
  mats.add("Descrição do público-alvo (idade, interesses, localização)");
  return Array.from(mats);
}

interface ConversionForm {
  projectName: string;
  goal: string;
  selectedDepts: string[];
  priority: Priority;
  deadline: string;
  scope: string;
  materials: string[];
  newMaterial: string;
}

function buildDefaultForm(req: ClientRequest, clientName: string): ConversionForm {
  const { services, objectives, urgency, suggestedDepartments } = req.extractedSummary;
  const priority: Priority =
    urgency?.toLowerCase().includes("urgente") || urgency?.toLowerCase().includes("hoje")
      ? "high"
      : urgency?.toLowerCase().includes("semana")
      ? "medium"
      : "medium";
  const deadline = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const depts = suggestedDepartments.filter((d) => d !== "project-management");
  return {
    projectName: deriveProjectName(services, clientName),
    goal: deriveGoal(objectives),
    selectedDepts: depts.length > 0 ? depts : ["social-media"],
    priority,
    deadline,
    scope: req.rawText.slice(0, 600),
    materials: suggestMaterials(services),
    newMaterial: "",
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgencyRequestsPage() {
  const {
    clientRequests, clients, projects, currentRole,
    updateClientRequest, updateProposal, createClient, createProject, createBriefing, addMaterialRequest,
    deleteClientRequest, deleteClientRequestsByClient,
    runDepartmentIntelligenceWithProvider, getDepartmentMode,
    addClientPortalItem,
  } = useAgencyStore();

  // Destructive controls are master-only — never shown to other internal roles
  // and never reachable from the client portal.
  const isMaster = currentRole === "master";
  const isEditorRole = currentRole === "master" || currentRole === "project_manager";

  // ── DB pipeline: real briefing submissions (new + scope_ready + needs_revision) ──
  const {
    requests: dbRequests,
    loading: dbLoading,
    error: dbError,
    reload: reloadDb,
  } = useDbRequests("new,scope_ready,needs_revision");
  const [dbSendError, setDbSendError] = useState<string | null>(null);
  const [dbDeleting, setDbDeleting] = useState<string | null>(null);
  const [dbGenerating, setDbGenerating] = useState<string | null>(null);

  const handleDeleteDbRequest = useCallback(
    async (req: DbRequest) => {
      if (!confirm(`Excluir o briefing de "${req.businessName}"? Esta ação é permanente.`)) return;
      setDbDeleting(req.id);
      setDbSendError(null);
      try {
        const res = await fetch(
          `/api/brain/client-requests?id=${encodeURIComponent(req.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ao excluir briefing.`);
        }
        await reloadDb();
      } catch (e) {
        setDbSendError(e instanceof Error ? e.message : "Falha ao excluir briefing.");
      } finally {
        setDbDeleting(null);
      }
    },
    [reloadDb],
  );

  const handleAutoScope = useCallback(
    async (req: DbRequest) => {
      setDbGenerating(req.id);
      setDbSendError(null);
      try {
        const res = await fetch("/api/brain/auto-scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientRequestId: req.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `HTTP ${res.status} ao gerar escopo.`);
        }
        window.location.assign(`/agency/requests/${req.id}/scope`);
      } catch (e) {
        setDbSendError(e instanceof Error ? e.message : "Falha ao gerar escopo.");
        setDbGenerating(null);
      }
    },
    [],
  );

  const [activeFilter, setActiveFilter]   = useState<ClientRequestStatus | "all">("all");
  const [sourceFilter, setSourceFilter]   = useState<"all" | "public_briefing" | "client_portal" | "self_serve">("all");
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convForm, setConvForm]         = useState<ConversionForm | null>(null);
  // requestId → created projectId (success state per request)
  const [createdProjects, setCreatedProjects] = useState<Record<string, string>>({});
  const [rawOpenId,       setRawOpenId]       = useState<string | null>(null);
  // Proposal editor state (master + PM only)
  const [proposalEditId,  setProposalEditId]  = useState<string | null>(null);
  const [proposalDrafts,  setProposalDrafts]  = useState<Record<string, ProposalDraft>>({});
  // Delete confirmation: the request pending permanent deletion (modal target)
  const [deleteTarget,    setDeleteTarget]    = useState<ClientRequest | null>(null);
  const [deleteConfirm,   setDeleteConfirm]   = useState("");
  // Demo reset confirmation (demonstration test requests)
  const [showDemoReset,   setShowDemoReset]   = useState(false);

  const all    = clientRequests ?? [];
  const filtered = all.filter((r) =>
    (activeFilter === "all" || r.status === activeFilter) &&
    (sourceFilter === "all" || r.source === sourceFilter)
  );
  const newCount = all.filter((r) => r.status === "new").length;
  const prospectCount = all.filter((r) => r.source === "public_briefing").length;

  const getClient = (clientId: string) => clients.find((c) => c.id === clientId);

  function openConversion(req: ClientRequest) {
    const client = getClient(req.clientId);
    const form = buildDefaultForm(req, client?.name ?? "Cliente");
    setConvForm(form);
    setConvertingId(req.id);
    setExpandedId(req.id);
  }

  function cancelConversion() {
    setConvertingId(null);
    setConvForm(null);
  }

  function handleConfirmConversion(req: ClientRequest) {
    if (!convForm) return;
    // Guard: if this request was already converted, don't create a second project.
    if (createdProjects[req.id]) return;

    const existingClient = getClient(req.clientId);

    // 0. Ensure a real Client record exists. Public-briefing prospects arrive
    // with a synthetic clientId ("prospect-…") and no Client row, so converting
    // them must first create the client — otherwise the downstream agent pages
    // (which look the client up) have nothing to run against.
    let clientId = req.clientId;
    let clientName = existingClient?.name ?? "Cliente";
    if (!existingClient) {
      clientName =
        req.extractedSummary.clientName ??
        req.v2Scope?.businessName ??
        req.prospectName ??
        req.title ??
        "Novo Cliente";
      clientId = createClient({
        name: clientName,
        industry: req.extractedSummary.segment ?? req.v2Scope?.segment ?? "—",
        status: "active",
        description: req.rawText.slice(0, 200),
      });
      // Point the request at the freshly created client so the portal and
      // pipeline views resolve the same record from here on.
      updateClientRequest(req.id, { clientId });
    }

    // Map selected dept IDs to unique agent IDs
    const agentIds = Array.from(
      new Set(
        ["pm_agent", ...convForm.selectedDepts.map((d) => DEPT_AGENT[d] ?? "pm_agent")]
      )
    );

    // 1. Create project
    const dueDays = Math.max(
      7,
      Math.floor((new Date(convForm.deadline).getTime() - Date.now()) / 86400000)
    );
    const pmDueDate = new Date(Date.now() + Math.min(dueDays, 7) * 86400000)
      .toISOString().slice(0, 10);

    const projectId = createProject({
      name:     convForm.projectName,
      clientId,
      goal:     convForm.goal || req.rawText.slice(0, 120),
      type:     deriveProjectType(req.extractedSummary.services),
      stage:    "briefing",
      priority: convForm.priority,
      deadline: convForm.deadline,
      agents:   agentIds,
      initialTasks: [
        {
          title: `Analisar solicitação e preparar proposta — ${clientName}`,
          description: `Solicitação convertida do portal. Escopo: ${convForm.scope.slice(0, 200)}`,
          agentId: "pm_agent",
          dueDate: pmDueDate,
        },
      ],
    });

    // 2. Create briefing
    createBriefing({
      projectId,
      clientId,
      goal:      convForm.goal || req.rawText.slice(0, 120),
      audience:  req.extractedSummary.objectives.join("; ") || "A definir",
      keyMessage: req.extractedSummary.objectives.slice(0, 2).join(", ") || "A definir",
      deliverables: req.extractedSummary.services.join(", ") || "A definir",
      deadline:  convForm.deadline,
      successCriteria: req.extractedSummary.objectives.join("; ") || "A definir",
      notes: `Convertido da solicitação do portal: "${req.title}"`,
      status: "pending_analysis",
    });

    // 3. Create material requests
    for (const mat of convForm.materials) {
      if (mat.trim()) {
        addMaterialRequest({
          clientId,
          projectId,
          title:     mat.trim(),
          description: "Necessário para início do projeto",
          status: "pending",
        });
      }
    }

    // 4. Auto-populate proposal from briefing data
    const estimate = req.v2Estimate;
    const scope    = req.v2Scope;
    const services = req.extractedSummary.services;
    const deliverablesList = scope
      ? [
          ...(scope.wantsSocialMedia ? ["Gestão de Social Media"] : []),
          ...(scope.wantsPaidTraffic ? ["Tráfego Pago"] : []),
          ...(scope.branding?.requested ? ["Identidade Visual / Branding"] : []),
          ...services.filter((s) => !/social|tráfego|ads|brand/i.test(s)),
        ]
      : services;
    // Use the NEGOTIATED price when the SDR granted a discount; otherwise list price.
    const unit = scope?.serviceMode === "one_off" ? "projeto" : "mês";
    let pricingText = "";
    if (estimate && estimate.confidence !== "none") {
      if (estimate.discountPct && estimate.discountedMin !== undefined) {
        const reason = estimate.discountReason ? ` (${estimate.discountPct}% — ${estimate.discountReason})` : ` (${estimate.discountPct}% off)`;
        pricingText = `R$ ${estimate.discountedMin.toLocaleString("pt-BR")} – R$ ${(estimate.discountedMax ?? estimate.discountedMin).toLocaleString("pt-BR")} / ${unit}${reason}`;
      } else {
        pricingText = `R$ ${estimate.totalMin.toLocaleString("pt-BR")} – R$ ${estimate.totalMax.toLocaleString("pt-BR")} / ${unit}`;
      }
    }
    const timelineText = scope?.deadline
      ? `Entrega: ${scope.deadline}`
      : convForm.deadline
      ? `Prazo: ${new Date(convForm.deadline).toLocaleDateString("pt-BR")}`
      : "";
    updateProposal(projectId, {
      objective:    convForm.goal || req.rawText.slice(0, 120),
      scope:        convForm.scope.slice(0, 800),
      deliverables: deliverablesList.length > 0 ? deliverablesList : ["A definir"],
      timeline:     timelineText,
      pricing:      pricingText,
      status:       "sent",
    });

    // Create portal item so client can see and approve the proposal
    addClientPortalItem({
      clientId,
      projectId,
      type: "proposal_approval",
      title: `Proposta — ${convForm.projectName}`,
      description: `Sua proposta está pronta para revisão e aprovação.`,
      status: "pending",
      payload: {
        projectName: convForm.projectName,
        goal: convForm.goal,
        pricing: pricingText,
        timeline: timelineText,
        deliverables: deliverablesList,
      },
    });

    // 5. Auto-run department intelligence for full_ai departments
    const deptIds = [...new Set(convForm.selectedDepts)];
    for (const deptId of deptIds) {
      const mode = getDepartmentMode(deptId);
      if (mode === "full_ai" || mode === "hybrid") {
        void runDepartmentIntelligenceWithProvider(deptId, projectId);
      }
    }
    // Always run PM intelligence so it can plan and coordinate
    void runDepartmentIntelligenceWithProvider("project-management", projectId);

    // 6. Update client request status
    updateClientRequest(req.id, { status: "in_progress", linkedProjectId: projectId });

    // 7. Record success
    setCreatedProjects((prev) => ({ ...prev, [req.id]: projectId }));
    setConvertingId(null);
    setConvForm(null);
  }

  function patchForm(patch: Partial<ConversionForm>) {
    setConvForm((f) => (f ? { ...f, ...patch } : f));
  }

  // Demo test requests = anything tied to the fixed demonstration client.
  const demoRequestCount = all.filter((r) => r.clientId === DEMO_CLIENT_ID).length;

  function openDeleteModal(req: ClientRequest) {
    setDeleteTarget(req);
    setDeleteConfirm("");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim().toUpperCase() !== "APAGAR") return;
    deleteClientRequest(deleteTarget.id);
    // Clean up any per-request UI state pointing at the removed row.
    if (expandedId === deleteTarget.id) setExpandedId(null);
    if (convertingId === deleteTarget.id) { setConvertingId(null); setConvForm(null); }
    setDeleteTarget(null);
    setDeleteConfirm("");
  }

  function runDemoReset() {
    deleteClientRequestsByClient(DEMO_CLIENT_ID);
    setShowDemoReset(false);
  }

  function openProposalEdit(req: ClientRequest) {
    const existing = proposalDrafts[req.id];
    if (existing) { setProposalEditId(req.id); return; }
    const estimate = req.v2Estimate;
    const items: EditableItem[] = estimate
      ? estimate.items.map((it, i) => ({ ...it, _key: `${i}` }))
      : [];
    setProposalDrafts((prev) => ({
      ...prev,
      [req.id]: { items, noteToClient: "" },
    }));
    setProposalEditId(req.id);
  }

  function saveProposalDraft(reqId: string, draft: ProposalDraft) {
    setProposalDrafts((prev) => ({ ...prev, [reqId]: draft }));
  }

  function markProposalSent(reqId: string) {
    setProposalDrafts((prev) => ({
      ...prev,
      [reqId]: { ...prev[reqId], sentAt: new Date().toISOString() },
    }));
    updateClientRequest(reqId, { status: "waiting_client" });
    setProposalEditId(null);
  }

  return (
    <div className="space-y-6">
      {/* ── DB Pipeline — briefings reais (ClientRequestDb) ── */}
      {!dbLoading && !dbError && dbRequests.length > 0 && (
        <div className="bg-white rounded-[10px] border border-[var(--cyan)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-[var(--accent-light)] border-b border-[var(--cyan)]">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Pipeline DB — Briefings reais</h2>
            <span className="h-5 px-2 rounded-full bg-white text-[var(--navy)] text-[10px] font-semibold flex items-center border border-[var(--cyan)]">
              {dbRequests.filter(r => r.status === "new").length} novo{dbRequests.filter(r => r.status === "new").length !== 1 ? "s" : ""}
            </span>
            {dbRequests.some(r => r.status === "scope_ready") && (
              <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[#92400E] text-[10px] font-semibold flex items-center">
                {dbRequests.filter(r => r.status === "scope_ready").length} para revisar
              </span>
            )}
            {dbRequests.some(r => r.status === "needs_revision") && (
              <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#991B1B] text-[10px] font-semibold flex items-center">
                {dbRequests.filter(r => r.status === "needs_revision").length} revisão
              </span>
            )}
            <span className="h-5 px-2 rounded-full bg-[var(--navy)] text-white text-[10px] font-semibold flex items-center">
              ✦ Dioli Brain
            </span>
          </div>
          {dbSendError && (
            <div className="px-5 py-2 bg-[#FEE2E2] border-b border-[#FECACA]">
              <p className="text-[11px] text-[#991B1B]">{dbSendError}</p>
            </div>
          )}
          <div className="divide-y divide-[var(--border)]">
            {dbRequests.map((req) => {
              const services = parseJson<string[]>(req.services, []);
              const isGenerating = dbGenerating === req.id;
              const STATUS_BADGE: Record<string, string> = {
                new: "bg-[var(--accent-light)] text-[var(--navy)]",
                scope_ready: "bg-[var(--warning-bg)] text-[#92400E]",
                needs_revision: "bg-[#FEE2E2] text-[#991B1B]",
              };
              const STATUS_LABEL: Record<string, string> = {
                new: "Novo",
                scope_ready: "Escopo pronto",
                needs_revision: "Revisão pendente",
              };
              return (
                <div key={req.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{req.businessName}</span>
                        {req.segment && (
                          <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">
                            {req.segment}
                          </span>
                        )}
                        <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${STATUS_BADGE[req.status] ?? "bg-[var(--accent)] text-[var(--text-secondary)]"}`}>
                          {STATUS_LABEL[req.status] ?? req.status}
                        </span>
                      </div>
                      {services.length > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{services.join(", ")}</p>
                      )}
                      <p className="text-[10.5px] text-[var(--text-subtle)] mt-0.5">
                        Recebido {formatShort(req.createdAt)} · {timeAgo(req.createdAt)}
                      </p>
                    </div>

                    {/* Per-status action buttons */}
                    {req.status === "new" && (
                      <span className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[7px] bg-[var(--accent)] text-[var(--text-secondary)] text-[12px] font-medium shrink-0">
                        <span className="w-3 h-3 rounded-full border-2 border-[var(--text-muted)] border-t-transparent animate-spin" />
                        Gerando escopo…
                      </span>
                    )}

                    {req.status === "scope_ready" && (
                      <a
                        href={`/agency/requests/${req.id}/scope`}
                        className="h-8 px-4 rounded-[7px] bg-[var(--cyan)] hover:bg-[#7DEDE7] text-[var(--navy)] text-[12px] font-semibold transition-colors shrink-0 inline-flex items-center gap-1"
                      >
                        Ver escopo →
                      </a>
                    )}

                    {req.status === "needs_revision" && (
                      <button
                        onClick={() => handleAutoScope(req)}
                        disabled={isGenerating}
                        className="h-8 px-4 rounded-[7px] border border-[#F59E0B] bg-[var(--warning-bg)] hover:bg-[#FDE68A] disabled:opacity-50 text-[#92400E] text-[12px] font-semibold transition-colors shrink-0 inline-flex items-center gap-1.5"
                      >
                        {isGenerating ? (
                          <>
                            <span className="w-3 h-3 rounded-full border-2 border-[#92400E] border-t-transparent animate-spin" />
                            Redesenhando…
                          </>
                        ) : (
                          <>↺ Redesenhar escopo</>
                        )}
                      </button>
                    )}

                    {isMaster && (
                      <button
                        onClick={() => handleDeleteDbRequest(req)}
                        disabled={dbDeleting === req.id}
                        title="Excluir briefing permanentemente"
                        className="h-8 w-8 rounded-[7px] border border-[#FCA5A5] bg-white hover:bg-[var(--danger-bg)] text-[var(--danger)] disabled:opacity-50 transition-colors shrink-0 inline-flex items-center justify-center"
                      >
                        {dbDeleting === req.id ? (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--danger)] border-t-transparent animate-spin" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Page header */}
      <AgencyHeader
        title="Solicitações de Clientes"
        subtitle="Briefings recebidos pelo portal — analise e transforme em projetos."
        actions={
          <>
            {isMaster && demoRequestCount > 0 && (
              <button
                onClick={() => setShowDemoReset(true)}
                className="h-7 px-3 rounded-[6px] border border-[#FCA5A5] bg-[var(--danger-bg)] text-[var(--danger)] hover:border-[#F87171] text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5"
                title="Apaga apenas as solicitações de demonstração"
              >
                <span className="text-[10px]">⟲</span>
                Limpar solicitações de demonstração ({demoRequestCount})
                <span className="h-3.5 px-1 rounded-[3px] bg-[var(--danger)] text-white text-[8px] font-bold leading-[14px]">ADMIN</span>
              </button>
            )}
            {newCount > 0 && (
              <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[12px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--navy)]" />
                {newCount} nova{newCount !== 1 ? "s" : ""}
              </span>
            )}
          </>
        }
      />

      {/* Public briefing link — entry point to onboard the first client */}
      <div className="flex items-center gap-4 bg-[var(--navy)] rounded-[12px] px-5 py-4">
        <div className="w-10 h-10 rounded-[10px] bg-[var(--cyan)]/15 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6.5L9.5 2z" stroke="#9AF5F0" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M9 2v4h4" stroke="#9AF5F0" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M5.5 8.5h5M5.5 11h3" stroke="#9AF5F0" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-white">Adicionar primeiro cliente</div>
          <p className="text-[12px] text-[var(--cyan)]/80 mt-0.5">
            Envie o link de briefing <code className="font-mono text-white">/briefing</code> ao cliente — ou preencha você mesmo para começar.
          </p>
        </div>
        <Link
          href="/briefing"
          target="_blank"
          className="h-9 px-4 rounded-[8px] bg-[var(--cyan)] text-[var(--navy)] hover:bg-[#7DEDE7] text-[13px] font-semibold transition-colors shrink-0 inline-flex items-center gap-1.5"
        >
          Abrir briefing →
        </Link>
        <CopyLinkButton path="/briefing" dark />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2">
        {[
          { label: "Todos",                                   value: "all" as const },
          { label: `Prospects (${prospectCount})`,            value: "public_briefing" as const },
          { label: "Portal de clientes",                      value: "client_portal" as const },
          { label: `Vitrine (${all.filter((r) => r.source === "self_serve").length})`, value: "self_serve" as const },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSourceFilter(opt.value)}
            className={`h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors ${
              sourceFilter === opt.value
                ? "bg-[var(--text-primary)] text-white"
                : "bg-[var(--accent)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count = f.value === "all" ? all.length : all.filter((r) => r.status === f.value).length;
          return (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors ${
                activeFilter === f.value
                  ? "bg-[var(--text-primary)] text-white"
                  : "bg-[var(--accent)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              }`}
            >
              {f.label}{count > 0 && <span className="opacity-60 ml-0.5"> ({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-[12px] border border-[var(--border)] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Nenhuma solicitação</p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1.5">
            {activeFilter === "all"
              ? "Solicitações dos clientes aparecerão aqui quando enviadas pelo portal."
              : "Nenhuma solicitação com esse status."}
          </p>
        </div>
      )}

      {/* Requests list */}
      <div className="space-y-3">
        {filtered.map((req) => {
          const style = REQUEST_STATUS_STYLE[req.status];
          const isExpanded = expandedId === req.id;
          const isConverting = convertingId === req.id;
          const createdProjectId = createdProjects[req.id];
          const clientName = req.source === "public_briefing"
            ? (req.prospectName ?? req.extractedSummary.clientName ?? req.clientId)
            : (getClient(req.clientId)?.name ?? req.clientId);

          return (
            <div
              key={req.id}
              className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              {/* ── Header row ── */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[var(--bg)] transition-colors"
                onClick={() => {
                  if (isConverting) return;
                  setExpandedId(isExpanded ? null : req.id);
                }}
              >
                {req.status === "new" && (
                  <span className="w-2 h-2 rounded-full bg-[var(--navy)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{req.title}</span>
                    <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                      {REQUEST_STATUS_LABEL[req.status]}
                    </span>
                    {createdProjectId && (
                      <span className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-semibold">
                        Projeto criado
                      </span>
                    )}
                    {req.v2Scope && (
                      <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-semibold">
                        V2 conversacional
                      </span>
                    )}
                    {req.source === "public_briefing" && (
                      <span className="h-5 px-2 rounded-full bg-[var(--info-bg)] text-[var(--info)] text-[10px] font-semibold">
                        briefing público
                      </span>
                    )}
                    {req.sdrHandoff && (
                      <span className="h-5 px-2 rounded-full bg-[#E9EFFF] text-[var(--navy)] text-[10px] font-semibold">
                        ✦ SDR
                      </span>
                    )}
                    {req.attachments.length > 0 && (
                      <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-semibold">
                        {req.attachments.length} arquivo{req.attachments.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] text-[var(--text-secondary)] font-medium">{clientName}</span>
                    {req.extractedSummary.services.length > 0 && (
                      <>
                        <span className="text-[var(--border-strong)]">·</span>
                        <span className="text-[12px] text-[var(--text-muted)]">
                          {req.extractedSummary.services.slice(0, 2).join(", ")}
                        </span>
                      </>
                    )}
                    <span className="text-[var(--border-strong)]">·</span>
                    <span className="text-[11px] text-[var(--text-subtle)]">
                      {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
                {req.missingInfo.length > 0 && (
                  <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[10px] font-semibold shrink-0">
                    {req.missingInfo.length} info{req.missingInfo.length !== 1 ? "s" : ""} ausente{req.missingInfo.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[var(--text-subtle)] text-[12px] shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && !isConverting && !createdProjectId && (
                <div className="border-t border-[var(--border)] px-5 py-5 space-y-5">
                  {/* Raw text — collapsible when analysis exists */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Texto original</div>
                      {req.analysis && (
                        <button
                          onClick={() => setRawOpenId(rawOpenId === req.id ? null : req.id)}
                          className="text-[10px] text-[var(--navy)] hover:underline font-medium"
                        >
                          {rawOpenId === req.id ? "▲ Ocultar" : "▼ Ver briefing completo"}
                        </button>
                      )}
                    </div>
                    {(!req.analysis || rawOpenId === req.id) && (
                      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap bg-[var(--bg)] rounded-[8px] px-4 py-3 max-h-[200px] overflow-y-auto">
                        {req.rawText}
                      </p>
                    )}
                  </div>

                  {/* Prospect contact info */}
                  {req.source === "public_briefing" && (
                    <div className="bg-[var(--info-bg)] border border-[#BFDBFE] rounded-[8px] px-4 py-3">
                      <div className="text-[10px] font-semibold text-[var(--info)] uppercase tracking-[0.05em] mb-2">
                        Dados do prospect
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {[
                          { label: "Nome",      value: req.prospectName },
                          { label: "Negócio",   value: req.extractedSummary.clientName ?? req.v2Scope?.businessName },
                          { label: "E-mail",    value: req.prospectEmail },
                          { label: "WhatsApp",  value: req.prospectPhone },
                          { label: "Segmento",  value: req.extractedSummary.segment ?? req.v2Scope?.segment },
                        ].filter((r) => r.value).map((row) => (
                          <div key={row.label} className="flex items-start gap-1.5 text-[11px]">
                            <span className="text-[#60A5FA] w-14 shrink-0">{row.label}</span>
                            <span className="text-[#1E3A5F] font-medium">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* V2 structured scope (from conversational briefing) */}
                  {req.v2Scope && (
                    <div className="space-y-2">
                      <V2ScopePanel scope={req.v2Scope} estimate={proposalDrafts[req.id] ? {
                        ...req.v2Estimate!,
                        items: proposalDrafts[req.id].items,
                        // Soma pela fonte única: item sem preço ("orçado à
                        // parte") não entra — nem como zero.
                        totalMin: somaDosItens(proposalDrafts[req.id].items).min,
                        totalMax: somaDosItens(proposalDrafts[req.id].items).max,
                      } : req.v2Estimate} />
                      {isEditorRole && req.v2Estimate && req.v2Estimate.confidence !== "none" && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openProposalEdit(req); }}
                            className="h-7 px-3 rounded-[6px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                              <path d="M11 2a1.414 1.414 0 012 2L5 12l-3 1 1-3L11 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                            </svg>
                            Editar proposta
                          </button>
                          {proposalDrafts[req.id]?.sentAt && (
                            <span className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[9px] font-semibold flex items-center gap-1">
                              ✓ Proposta enviada {new Date(proposalDrafts[req.id].sentAt!).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SDR Agent handoff summary */}
                  {req.sdrHandoff && (
                    <SDRHandoffPanel handoff={req.sdrHandoff} />
                  )}

                  {/* Analysis panel OR extracted summary */}
                  {req.analysis ? (
                    <AnalysisPanel analysis={req.analysis} />
                  ) : (
                    <>
                      {/* Extracted summary grid */}
                      <div className="grid grid-cols-2 gap-4">
                        {req.extractedSummary.services.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Serviços</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.services.map((s) => (
                                <span key={s} className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[11px] font-medium">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.channels.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Canais</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.channels.map((c) => (
                                <span key={c} className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[11px] font-medium">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.objectives.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.objectives.map((o) => (
                                <span key={o} className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[11px] font-medium">{o}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.urgency && (
                          <div>
                            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Urgência</div>
                            <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[var(--danger)] text-[11px] font-medium inline-block">
                              {req.extractedSummary.urgency}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Missing info */}
                      {req.missingInfo.length > 0 && (
                        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3">
                          <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Informações ausentes</div>
                          <ul className="space-y-0.5">
                            {req.missingInfo.map((m) => (
                              <li key={m} className="text-[12px] text-[#92400E] flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-[#F59E0B] shrink-0" />{m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}

                  {/* Attachments */}
                  {req.attachments.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
                        Arquivos anexados ({req.attachments.length})
                      </div>
                      <div className="space-y-1.5">
                        {req.attachments.map((att) => (
                          <div key={att.id} className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-[7px] px-3 py-2">
                            <div className="w-7 h-7 rounded-[5px] bg-white border border-[var(--border)] flex items-center justify-center shrink-0">
                              <span className="text-[7px] font-bold text-[var(--text-secondary)]">{att.fileType}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{att.fileName}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">
                                {att.sizeBytes < 1024 * 1024
                                  ? `${(att.sizeBytes / 1024).toFixed(1)} KB`
                                  : `${(att.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                                {" · "}{att.fileType}{" · "}{att.source === "briefing_room" ? "Briefing Room" : att.source}
                              </p>
                            </div>
                            {att.previewUrl ? (
                              <a
                                href={att.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-5 px-2 rounded-[4px] border border-[var(--navy)] text-[var(--navy)] text-[9px] font-semibold hover:bg-[var(--accent-light)] transition-colors shrink-0"
                              >
                                Visualizar
                              </a>
                            ) : (
                              <span className="h-5 px-2 rounded-[4px] bg-[var(--accent)] text-[var(--text-muted)] text-[9px] font-semibold shrink-0">
                                local
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {req.attachments.some((a) => a.storageStatus === "local_only") && (
                        <p className="text-[10px] text-[var(--text-subtle)] mt-1.5">
                          Arquivo registrado localmente nesta sessão. Upload permanente será conectado ao storage.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)] flex-wrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); openConversion(req); }}
                      className="h-8 px-4 rounded-[7px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[12px] font-medium transition-colors"
                    >
                      Criar projeto
                    </button>
                    {isMaster && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteModal(req); }}
                        className="ml-auto h-8 px-4 rounded-[7px] border border-[#FCA5A5] text-[var(--danger)] hover:bg-[var(--danger-bg)] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5"
                      >
                        Apagar solicitação
                        <span className="h-3.5 px-1 rounded-[3px] bg-[var(--danger)] text-white text-[8px] font-bold leading-[14px]">ADMIN</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Conversion Panel ── */}
              {isConverting && convForm && (
                <ConversionPanel
                  req={req}
                  clientName={getClient(req.clientId)?.name ?? "Cliente"}
                  form={convForm}
                  onPatch={patchForm}
                  onConfirm={() => handleConfirmConversion(req)}
                  onCancel={cancelConversion}
                />
              )}

              {/* ── Success State ── */}
              {isExpanded && createdProjectId && (
                <SuccessPanel
                  req={req}
                  projectId={createdProjectId}
                  projectName={projects.find((p) => p.id === createdProjectId)?.name ?? "Projeto"}
                  clientId={req.clientId}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Delete confirmation modal (master only) ── */}
      {isMaster && deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}
        >
          <div
            className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-[460px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-[var(--danger-bg)] flex items-center justify-center text-[var(--danger)] text-[16px] shrink-0">⚠</div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Apagar solicitação definitivamente?</h2>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
              Esta ação remove a solicitação, briefing, conversa, escopo, estimativa, anexos
              registrados e histórico associado a esta solicitação. Esta ação não pode ser desfeita.
            </p>
            {deleteTarget.linkedProjectId && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3 mb-3">
                <p className="text-[12px] text-[#92400E] leading-relaxed">
                  Esta solicitação já gerou um projeto. O projeto será mantido.
                </p>
              </div>
            )}
            <div className="bg-[var(--bg)] rounded-[8px] px-3 py-2 mb-4">
              <p className="text-[12px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.title}</span>
                {" · "}{getClient(deleteTarget.clientId)?.name ?? deleteTarget.clientId}
              </p>
            </div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
              Digite <span className="font-bold text-[var(--danger)]">APAGAR</span> para confirmar
            </label>
            <input
              autoFocus
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
              placeholder="APAGAR"
              className="w-full h-9 px-3 text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--danger)] mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}
                className="h-9 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] text-[13px] font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirm.trim().toUpperCase() !== "APAGAR"}
                className="h-9 px-4 rounded-[7px] bg-[var(--danger)] hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
              >
                Apagar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Proposal Edit Modal (master + PM) ── */}
      {isEditorRole && proposalEditId && (() => {
        const req = all.find((r) => r.id === proposalEditId);
        const draft = proposalDrafts[proposalEditId];
        if (!req || !draft) return null;
        const clientLabel = req.prospectName ?? req.extractedSummary?.clientName ?? req.v2Scope?.businessName ?? "Cliente";
        return (
          <ProposalEditModal
            clientLabel={clientLabel}
            clientEmail={req.prospectEmail}
            draft={draft}
            onClose={() => setProposalEditId(null)}
            onSave={(d) => saveProposalDraft(proposalEditId, d)}
            onSend={() => markProposalSent(proposalEditId)}
          />
        );
      })()}

      {/* ── Demo reset confirmation modal (master only) ── */}
      {isMaster && showDemoReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowDemoReset(false)}
        >
          <div
            className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-[440px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-[var(--danger-bg)] flex items-center justify-center text-[var(--danger)] text-[16px] shrink-0">⟲</div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Limpar solicitações de demonstração?</h2>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-4">
              Isso apagará apenas as solicitações de demonstração
              {" "}({demoRequestCount}). Clientes, projetos e demais dados não serão afetados.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDemoReset(false)}
                className="h-9 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] text-[13px] font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={runDemoReset}
                className="h-9 px-4 rounded-[7px] bg-[var(--danger)] hover:bg-[#B91C1C] text-white text-[13px] font-medium transition-colors"
              >
                Apagar solicitações de teste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── V2 Scope Panel ────────────────────────────────────────────────────────────

function V2ScopePanel({ scope, estimate }: { scope: BriefingScope; estimate?: LiveEstimate }) {
  const fmtBRL = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

  const CONF_LABEL: Record<string, string> = {
    low: "Estimativa inicial", medium: "Estimativa aprox.", high: "Estimativa confiável",
  };
  const CONF_STYLE: Record<string, string> = {
    low: "bg-[var(--warning-bg)] text-[var(--warning)]",
    medium: "bg-[var(--accent-light)] text-[var(--navy)]",
    high: "bg-[var(--success-bg)] text-[var(--success)]",
  };

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Escopo V2 — Briefing conversacional</span>
        <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[9px] font-semibold">automático</span>
      </div>

      {/* Services + quantities grid */}
      <div className="grid grid-cols-2 gap-4">
        {scope.wantsSocialMedia && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Social Media</div>
            <div className="space-y-0.5 text-[11px] text-[var(--text-primary)]">
              {scope.social?.platforms.length
                ? <div><span className="text-[var(--text-muted)]">Canais:</span> {scope.social.platforms.join(", ")}</div>
                : null}
              {/* Mesma fonte que a sala de briefing pública — o painel interno
                  e a tela do cliente não podem discordar sobre o que foi
                  vendido. Era aqui que "Posts: 28/mês" aparecia cru. */}
              {scope.social?.postsPerWeek !== undefined
                ? <LinhaDoEscopo linha={linhaDeVolume("Posts", scope.social.postsPerWeek * 4)} />
                : null}
              {scope.social?.storiesPerWeek !== undefined && scope.social.storiesPerWeek > 0
                ? <LinhaDoEscopo linha={linhaDeVolume("Stories", scope.social.storiesPerWeek * 4)} />
                : null}
              {scope.social?.reelsPerMonth !== undefined && scope.social.reelsPerMonth > 0
                ? <LinhaDoEscopo linha={linhaDeVolume("Reels", scope.social.reelsPerMonth)} />
                : null}
              {(() => { const v = linhaDeVideo(scope.social); return v ? <LinhaDoEscopo linha={v} /> : null; })()}
              {scope.social?.hasPhotos !== undefined
                ? <div><span className="text-[var(--text-muted)]">Fotos:</span> {scope.social.hasPhotos ? "Disponíveis" : "Sem produção"}</div>
                : null}
              {scope.social?.needsCopy !== undefined
                ? <div><span className="text-[var(--text-muted)]">Copy:</span> {scope.social.needsCopy ? "Pela Dioli" : "Pelo cliente"}</div>
                : null}
            </div>
          </div>
        )}
        {scope.wantsPaidTraffic && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Tráfego Pago</div>
            <div className="space-y-0.5 text-[11px] text-[var(--text-primary)]">
              {scope.traffic?.monthlyAdBudget
                ? <div><span className="text-[var(--text-muted)]">Verba:</span> {scope.traffic.monthlyAdBudget}</div>
                : <div className="text-[var(--text-muted)]">Verba não informada</div>}
            </div>
          </div>
        )}
        {scope.branding?.requested && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Identidade Visual</div>
            {scope.branding?.wantsRebrand
              ? <div className="text-[11px] text-[var(--text-primary)]">Rebranding solicitado</div>
              : <div className="text-[11px] text-[var(--text-primary)]">Criação de marca</div>}
          </div>
        )}
        {scope.objectives.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
            <div className="flex flex-wrap gap-1">
              {scope.objectives.map((o) => (
                <span key={o} className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-medium">{o}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        {(() => {
          // "A definir" saiu daqui: pontual e recorrente cobram diferente, e a
          // ausência de escolha era exibida como se fosse uma.
          const m = linhaDeModalidade(scope);
          return (
            <span className="text-[var(--text-muted)]">
              Modalidade: <strong className={m.alerta ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}>{m.value}</strong>
              {m.detalhe ? <span className="block text-[10px] text-[var(--text-muted)] max-w-[420px] leading-[1.45]">{m.detalhe}</span> : null}
            </span>
          );
        })()}
        {scope.branding?.hasBrandBook && (
          <span className="text-[var(--text-muted)]">Brand Book: <strong className="text-[var(--text-primary)]">Disponível</strong></span>
        )}
        {scope.budgetRange && (
          <span className="text-[var(--text-muted)]">Orçamento: <strong className="text-[var(--text-primary)]">{scope.budgetRange}</strong></span>
        )}
        {scope.deadline && (
          <span className="text-[var(--text-muted)]">Prazo: <strong className="text-[var(--text-primary)]">{scope.deadline}</strong></span>
        )}
      </div>

      {/* Estimate */}
      {estimate && estimate.confidence !== "none" && (
        <div className="border-t border-[var(--border)] pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Estimativa live</span>
            <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${CONF_STYLE[estimate.confidence] ?? ""}`}>
              {CONF_LABEL[estimate.confidence]}
            </span>
          </div>
          <div className="space-y-1">
            {estimate.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">{item.label}</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {precoDoItemEmTexto(item, fmtBRL)}{item.minPrice !== null ? `/${item.unit}` : ""}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] text-[11px]">
              <span className="font-semibold text-[var(--text-primary)]">Total estimado</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analysis Panel ────────────────────────────────────────────────────────────

function AnalysisPanel({ analysis }: { analysis: BriefingAnalysis }) {
  const [proposalOpen, setProposalOpen] = useState(false);
  const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Análise do briefing</span>
        <span className="text-[10px] text-[var(--text-muted)]">
          Processado em {new Date(analysis.processedAt).toLocaleDateString("pt-BR")}
        </span>
      </div>

      {/* Executive summary */}
      <div className="bg-[var(--bg)] rounded-[8px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">O que entendemos</div>
        <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{analysis.executiveSummary}</p>
      </div>

      {/* 2-col: goal + needs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Objetivo principal</div>
          <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{analysis.clientGoal}</p>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Necessidades diagnosticadas</div>
          <ul className="space-y-0.5">
            {analysis.diagnosedNeeds.map((n) => (
              <li key={n} className="text-[11px] text-[var(--text-primary)] flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[var(--navy)] shrink-0 mt-1.5" />{n}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Serviços recomendados</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.recommendedServices.map((s) => (
              <span key={s} className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[11px] font-medium">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Prazo estimado</div>
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{analysis.estimatedTimeline}</span>
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Entregáveis sugeridos</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {analysis.suggestedDeliverables.map((d) => (
            <div key={d} className="flex items-start gap-1.5 text-[11px] text-[var(--text-primary)]">
              <span className="text-[var(--success)] shrink-0">✓</span>{d}
            </div>
          ))}
        </div>
      </div>

      {/* Investment */}
      <div className="bg-[var(--bg)] rounded-[8px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Faixa de investimento</div>
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-[17px] font-bold text-[var(--text-primary)]">{fmt(analysis.priceRange.min)}</span>
          <span className="text-[13px] text-[var(--text-muted)]">–</span>
          <span className="text-[17px] font-bold text-[var(--text-primary)]">{fmt(analysis.priceRange.max)}</span>
          <span className="text-[11px] text-[var(--text-muted)] ml-1">estimado</span>
        </div>
        <div className="space-y-1.5 border-t border-[var(--border)] pt-2.5">
          {analysis.lineItems.map((item) => (
            <div key={item.service} className="flex items-center justify-between gap-4 text-[11px]">
              <div className="text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{item.service}</span>
                {" — "}{item.description}
              </div>
              <span className="text-[var(--text-primary)] font-medium shrink-0">
                {fmt(item.minPrice)}–{fmt(item.maxPrice)}/{item.unit}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-[var(--text-subtle)] mt-2">*Valores estimados. Sujeitos a detalhamento de escopo.</p>
      </div>

      {/* Missing info */}
      {analysis.missingInfo.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3">
          <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Informações faltantes</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingInfo.map((m) => (
              <span key={m} className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[#92400E] text-[10px] font-medium">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Next questions */}
      {analysis.nextQuestions.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Próximas perguntas para o cliente</div>
          <ol className="space-y-1">
            {analysis.nextQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-primary)]">
                <span className="text-[var(--navy)] font-semibold shrink-0 w-4">{i + 1}.</span>{q}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Proposal draft collapsible */}
      <div className="border border-[var(--border)] rounded-[8px] overflow-hidden">
        <button
          onClick={() => setProposalOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg)] hover:bg-[var(--accent)] transition-colors text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">Rascunho de proposta</span>
            <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[9px] font-semibold">
              PM deve revisar antes de enviar
            </span>
          </div>
          <span className="text-[12px] text-[var(--text-muted)] shrink-0 ml-4">{proposalOpen ? "▲" : "▼"}</span>
        </button>
        {proposalOpen && (
          <div className="bg-white px-4 py-3">
            <pre className="text-[11px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-mono overflow-y-auto max-h-[400px]">
              {analysis.proposalDraft}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Conversion Panel ──────────────────────────────────────────────────────────

function ConversionPanel({
  req, clientName, form, onPatch, onConfirm, onCancel,
}: {
  req: ClientRequest;
  clientName: string;
  form: ConversionForm;
  onPatch: (p: Partial<ConversionForm>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    onConfirm();
  }

  function toggleDept(d: string) {
    const next = form.selectedDepts.includes(d)
      ? form.selectedDepts.filter((x) => x !== d)
      : [...form.selectedDepts, d];
    onPatch({ selectedDepts: next });
  }

  function addMaterial() {
    const m = form.newMaterial.trim();
    if (!m || form.materials.includes(m)) return;
    onPatch({ materials: [...form.materials, m], newMaterial: "" });
  }

  function removeMaterial(i: number) {
    onPatch({ materials: form.materials.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 py-5 space-y-5">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">Criar projeto</div>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Baseado em: {req.title} · {clientName}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Cancelar
        </button>
      </div>

      {/* Row 1: name + priority + deadline */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">
            Nome do projeto
          </label>
          <input
            type="text"
            value={form.projectName}
            onChange={(e) => onPatch({ projectName: e.target.value })}
            className="w-full h-9 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">
            Prioridade
          </label>
          <select
            value={form.priority}
            onChange={(e) => onPatch({ priority: e.target.value as Priority })}
            className="w-full h-9 px-2 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)]"
          >
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">
            Prazo
          </label>
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => onPatch({ deadline: e.target.value })}
            className="w-full h-9 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)]"
          />
        </div>
      </div>

      {/* Goal */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">
          Objetivo do projeto
        </label>
        <input
          type="text"
          value={form.goal}
          onChange={(e) => onPatch({ goal: e.target.value })}
          placeholder="Ex.: ganhar novos clientes e aumentar vendas"
          className="w-full h-9 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] transition-colors"
        />
      </div>

      {/* Departments */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
          Departamentos envolvidos
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_CONVERSION_DEPTS.map((d) => {
            const checked = form.selectedDepts.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDept(d)}
                className={`h-7 px-3 rounded-[6px] text-[12px] font-medium border transition-colors ${
                  checked
                    ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-white"
                    : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                }`}
              >
                {checked ? "✓ " : ""}{DEPT_LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scope */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">
          Escopo inicial (vai para o briefing)
        </label>
        <textarea
          value={form.scope}
          onChange={(e) => onPatch({ scope: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] resize-none leading-relaxed"
        />
      </div>

      {/* Material requests */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
          Materiais necessários do cliente
        </label>
        <div className="space-y-1.5 mb-2">
          {form.materials.map((m, i) => (
            <div key={i} className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-[7px] px-3 py-1.5">
              <span className="flex-1 text-[12px] text-[var(--text-primary)]">{m}</span>
              <button
                onClick={() => removeMaterial(i)}
                className="text-[var(--text-subtle)] hover:text-[var(--danger)] text-[11px] transition-colors shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.newMaterial}
            onChange={(e) => onPatch({ newMaterial: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addMaterial()}
            placeholder="Adicionar material (Enter para confirmar)..."
            className="flex-1 h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] transition-colors"
          />
          <button
            onClick={addMaterial}
            disabled={!form.newMaterial.trim()}
            className="h-8 px-3 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] text-[12px] disabled:opacity-40 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Confirm action */}
      <div className="flex items-center gap-3 pt-1 border-t border-[var(--border)]">
        <button
          onClick={handleConfirm}
          disabled={!form.projectName.trim() || !form.deadline || submitting}
          className="h-9 px-5 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-medium transition-colors inline-flex items-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Criando…
            </>
          ) : "Confirmar e criar projeto"}
        </button>
        <button
          onClick={onCancel}
          className="h-9 px-4 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[12px] font-medium transition-colors"
        >
          Cancelar
        </button>
        <p className="text-[11px] text-[var(--text-subtle)] ml-auto">
          Cria projeto + briefing + {form.materials.length} material(is) + tarefa PM
        </p>
      </div>
    </div>
  );
}

// ── Success Panel ─────────────────────────────────────────────────────────────

function SuccessPanel({
  req, projectId, projectName, clientId,
}: {
  req: ClientRequest;
  projectId: string;
  projectName: string;
  clientId: string;
}) {
  return (
    <div className="border-t border-[#BBF7D0] bg-[#F0FDF4] px-5 py-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--success-bg)] flex items-center justify-center shrink-0 text-[var(--success)] font-bold text-[14px]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#15803D] mb-0.5">Projeto criado e proposta enviada ao portal!</div>
          <p className="text-[12px] text-[var(--success)]">{projectName}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              href={`/agency/projects/${projectId}`}
              className="h-7 px-3 rounded-[6px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[11px] font-medium transition-colors inline-flex items-center"
            >
              Ver projeto →
            </Link>
            <Link
              href={`/agency/clients/${clientId}`}
              className="h-7 px-3 rounded-[6px] border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium transition-colors inline-flex items-center"
            >
              Brand Hub
            </Link>
            <Link
              href="/agency/control-room"
              className="h-7 px-3 rounded-[6px] border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium transition-colors inline-flex items-center"
            >
              Sala de Controle
            </Link>
          </div>
        </div>
      </div>

      {/* Portal link — the most important thing to share with the client */}
      <div className="bg-white border border-[#BBF7D0] rounded-[10px] px-4 py-3">
        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">
          Link do portal do cliente — envie por WhatsApp ou e-mail
        </p>
        <SecurePortalLinkButton
          clientId={clientId}
          label="Gerar e copiar link seguro →"
          className="w-full h-9 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-60 text-white text-[12px] font-semibold transition-colors"
        />
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
          O cliente vê a proposta, aprova, e os agentes começam automaticamente.
        </p>
      </div>
    </div>
  );
}

// ── Proposal Edit Modal ───────────────────────────────────────────────────────

function ProposalEditModal({
  clientLabel,
  clientEmail,
  draft,
  onClose,
  onSave,
  onSend,
}: {
  clientLabel: string;
  clientEmail?: string;
  draft: ProposalDraft;
  onClose: () => void;
  onSave: (d: ProposalDraft) => void;
  onSend: () => void;
}) {
  const [items, setItems] = useState<EditableItem[]>(() =>
    draft.items.map((it, i) => ({ ...it, _key: it._key ?? String(i) }))
  );
  const [note, setNote]   = useState(draft.noteToClient);
  const [sent, setSent]   = useState(false);

  const fmtBRL = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  const totalMin = items.reduce((s, it) => s + (Number(it.minPrice) || 0), 0);
  const totalMax = items.reduce((s, it) => s + (Number(it.maxPrice) || 0), 0);

  function patchItem(key: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it) => it._key === key ? { ...it, ...patch } : it));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { _key: String(Date.now()), label: "Novo item", detail: "", minPrice: 0, maxPrice: 0, unit: "mês" },
    ]);
  }

  function handleSave() {
    onSave({ items, noteToClient: note });
    onClose();
  }

  function handleSend() {
    if (sent) return;
    onSave({ items, noteToClient: note });
    setSent(true);
    setTimeout(() => { onSend(); }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] border border-[var(--border)] shadow-[0_12px_40px_rgba(0,0,0,0.16)] w-full max-w-[640px] mt-8 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Editar proposta</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Para: <span className="font-medium text-[var(--text-primary)]">{clientLabel}</span>
              {clientEmail && <span className="text-[var(--text-muted)]"> · {clientEmail}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--accent)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-[16px]"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Role badge */}
          <div className="flex items-center gap-2">
            <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[9px] font-semibold">
              Revisão obrigatória antes de enviar ao cliente
            </span>
          </div>

          {/* Line items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Itens da proposta</span>
              <button
                onClick={addItem}
                className="h-6 px-2.5 rounded-[5px] border border-[var(--border)] text-[10px] font-semibold text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors"
              >
                + Adicionar item
              </button>
            </div>
            <div className="border border-[var(--border)] rounded-[8px] overflow-hidden divide-y divide-[var(--border)]">
              {items.length === 0 && (
                <div className="px-4 py-3 text-[12px] text-[var(--text-muted)] text-center">Nenhum item. Adicione um acima.</div>
              )}
              {items.map((it) => (
                <div key={it._key} className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      value={it.label}
                      onChange={(e) => patchItem(it._key, { label: e.target.value })}
                      placeholder="Nome do serviço"
                      className="flex-1 text-[13px] font-medium text-[var(--text-primary)] bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--navy)] outline-none py-0.5 transition-colors"
                    />
                    <button
                      onClick={() => removeItem(it._key)}
                      className="shrink-0 w-6 h-6 rounded-full text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] flex items-center justify-center transition-colors text-[14px]"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    value={it.detail}
                    onChange={(e) => patchItem(it._key, { detail: e.target.value })}
                    placeholder="Descrição (opcional)"
                    className="w-full text-[11px] text-[var(--text-secondary)] bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--navy)] outline-none py-0.5 transition-colors"
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[var(--text-muted)] shrink-0">Mín R$</span>
                      <input
                        type="number"
                        value={it.minPrice ?? ""}
                        onChange={(e) => patchItem(it._key, { minPrice: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 text-[12px] font-semibold text-[var(--text-primary)] bg-[var(--bg)] border border-[var(--border)] rounded-[5px] px-2 py-1 outline-none focus:border-[var(--navy)]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[var(--text-muted)] shrink-0">Máx R$</span>
                      <input
                        type="number"
                        value={it.maxPrice ?? ""}
                        onChange={(e) => patchItem(it._key, { maxPrice: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 text-[12px] font-semibold text-[var(--text-primary)] bg-[var(--bg)] border border-[var(--border)] rounded-[5px] px-2 py-1 outline-none focus:border-[var(--navy)]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[var(--text-muted)] shrink-0">/</span>
                      <input
                        value={it.unit}
                        onChange={(e) => patchItem(it._key, { unit: e.target.value })}
                        className="w-16 text-[11px] text-[var(--text-secondary)] bg-[var(--bg)] border border-[var(--border)] rounded-[5px] px-2 py-1 outline-none focus:border-[var(--navy)]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            {items.length > 0 && (
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Total estimado</span>
                <span className="text-[13px] font-bold text-[var(--navy)]">
                  {fmtBRL(totalMin)} – {fmtBRL(totalMax)}
                </span>
              </div>
            )}
          </div>

          {/* Note to client */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">
              Mensagem personalizada para o cliente (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Olá, [Nome]! Com base no briefing que nos enviou, preparamos duas opções de proposta…"
              rows={4}
              className="w-full text-[12px] text-[var(--text-primary)] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] px-3 py-2.5 outline-none focus:border-[var(--navy)] resize-none leading-relaxed"
            />
          </div>

          {/* Send feedback */}
          {sent && (
            <div className="bg-[var(--success-bg)] border border-[#86EFAC] rounded-[8px] px-4 py-3 flex items-center gap-2.5">
              <span className="text-[var(--success)] font-bold text-[16px]">✓</span>
              <div>
                <p className="text-[12px] font-semibold text-[#15803D]">Proposta marcada como enviada</p>
                <p className="text-[11px] text-[#166534] mt-0.5">
                  Status atualizado para "Aguardando cliente".
                  {clientEmail
                    ? " Integração de e-mail disponível em breve para envio automático."
                    : " Envie manualmente por WhatsApp ou e-mail ao cliente."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-elevated)] rounded-b-[14px]">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--accent)] text-[13px] font-medium transition-colors"
          >
            Fechar
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="h-9 px-4 rounded-[8px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[13px] font-medium transition-colors"
            >
              Salvar rascunho
            </button>
            <button
              onClick={handleSend}
              disabled={sent || items.length === 0}
              className="h-9 px-5 rounded-[8px] bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors inline-flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 8l12-6-6 12-1.5-5.5L2 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              {sent ? "Enviada ✓" : "Enviar proposta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
