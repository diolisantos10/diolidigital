"use client";

import { useState } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
  type ClientRequestStatus,
  type ClientRequest,
  type BriefingAnalysis,
} from "@/lib/agency/client-requests";
import type { BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import type { SDRHandoff } from "@/lib/agency/sdr-agent";
import { processBriefing } from "@/lib/agency/briefing-processor";
import type { Priority } from "@/lib/agency/mock-data";
import { DEMO_CLIENT_ID } from "@/lib/agency/demo-client";

// ── CopyLinkButton ────────────────────────────────────────────────────────────

function CopyLinkButton({ path }: { path: string }) {
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
      className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] bg-white text-[11px] font-medium text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A] transition-colors whitespace-nowrap"
    >
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

// ── SDRHandoffPanel / Brain Review Panel ─────────────────────────────────────

function SDRHandoffPanel({ handoff }: { handoff: SDRHandoff }) {
  const brain = handoff.brainReasoningOutput;
  const flow  = handoff.cognitiveFlowSummary;
  const qg    = handoff.qualityGateResult;

  const qgColors = {
    PASS:    { bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]", badge: "bg-[#16A34A]" },
    WARNING: { bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]", badge: "bg-[#D97706]" },
    FAIL:    { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]", badge: "bg-[#DC2626]" },
  } as const;

  return (
    <div className="space-y-3">
      {/* Brain Review Panel header */}
      <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[8px] px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-semibold text-[#7C3AED] uppercase tracking-[0.06em]">
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
              <p className="text-[10px] font-semibold text-[#5B21B6] mb-1">Diagnóstico Brain</p>
              <p className="text-[11px] text-[#4C1D95] leading-relaxed">{brain.intentionDetected}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-[#9B9B95]">Confiança:</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  brain.confidenceLevel === "high" ? "bg-[#DCFCE7] text-[#16A34A]"
                  : brain.confidenceLevel === "medium" ? "bg-[#EEF0FF] text-[#5B5BD6]"
                  : "bg-[#FEF3C7] text-[#D97706]"
                }`}>
                  {brain.confidenceLevel === "high" ? "Alta" : brain.confidenceLevel === "medium" ? "Média" : "Baixa"}
                </span>
              </div>
            </div>

            {/* Known facts */}
            {brain.knownFacts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#5B21B6] mb-1">Fatos Conhecidos</p>
                <div className="flex flex-wrap gap-1">
                  {brain.knownFacts.map((f, i) => (
                    <span key={i} className="h-5 px-2 rounded-[4px] bg-[#EDE9FE] text-[#5B21B6] text-[10px]">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Unknown facts */}
            {brain.unknownFacts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#D97706] mb-0.5">Incógnitas</p>
                {brain.unknownFacts.slice(0, 4).map((u, i) => (
                  <p key={i} className="text-[11px] text-[#92400E]">? {u}</p>
                ))}
              </div>
            )}

            {/* Risks */}
            {brain.risks.length > 0 && (
              <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[6px] px-3 py-2">
                <p className="text-[10px] font-semibold text-[#D97706] mb-0.5">Riscos</p>
                {brain.risks.map((r, i) => (
                  <p key={i} className="text-[11px] text-[#92400E]">⚠ {r}</p>
                ))}
              </div>
            )}

            {/* Opportunities */}
            {brain.opportunities.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#16A34A] mb-0.5">Oportunidades</p>
                {brain.opportunities.map((o, i) => (
                  <p key={i} className="text-[11px] text-[#166534]">✓ {o}</p>
                ))}
              </div>
            )}

            {/* Recommended dept/services */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Departamento recomendado</p>
                <span className="h-5 px-2 rounded-full bg-[#EDE9FE] text-[#7C3AED] text-[10px] font-medium">
                  {brain.recommendedDepartment}
                </span>
              </div>
              {brain.recommendedServices.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Serviços recomendados</p>
                  <div className="flex flex-wrap gap-1">
                    {brain.recommendedServices.map((s, i) => (
                      <span key={i} className="h-5 px-2 rounded-full bg-[#EDE9FE] text-[#7C3AED] text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Diagnóstico</p>
              <p className="text-[11px] text-[#4C1D95] leading-relaxed">{handoff.diagnosis}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Budget</p>
              <p className="text-[11px] text-[#4C1D95]">{handoff.budgetFit}</p>
            </div>
          </>
        )}

        {/* Recommended PM action */}
        <div className="bg-[#EDE9FE] rounded-[6px] px-3 py-2">
          <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Ação recomendada para o PM</p>
          <p className="text-[11px] text-[#4C1D95] leading-relaxed">
            {brain?.nextAction ?? handoff.recommendedPMAction}
          </p>
        </div>
      </div>

      {/* Cognitive Flow Summary */}
      {flow && (
        <div className="bg-[#F0F0FF] border border-[#C7C7FF] rounded-[8px] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-[#5B5BD6] uppercase tracking-[0.06em]">Fluxo Cognitivo</p>
            <span className="text-[11px] font-bold text-[#5B5BD6]">{flow.stepsCompleted}/{flow.totalSteps} passos · {flow.completionRate}%</span>
          </div>
          <div className="w-full bg-[#E0E0F8] rounded-full h-1.5 mb-2">
            <div
              className="bg-[#5B5BD6] h-1.5 rounded-full transition-all"
              style={{ width: `${flow.completionRate}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-1">
            {flow.steps.map((step) => (
              <div key={step.stepId} className="flex items-center gap-1 text-[9px]">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  step.completed ? "bg-[#5B5BD6]" : "bg-[#D0D0CC]"
                }`} />
                <span className={step.completed ? "text-[#5B5BD6]" : "text-[#C0C0BC]"} title={step.summary}>
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
            <span className="text-[10px] text-[#6B6B65]">
              {qg.passCount} pass · {qg.warningCount} warn · {qg.failCount} fail
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {qg.items.map((item) => (
              <div key={item.id} className="flex items-start gap-1 text-[10px]" title={item.detail}>
                <span className={`shrink-0 font-bold ${
                  item.status === "PASS" ? "text-[#16A34A]"
                  : item.status === "WARNING" ? "text-[#D97706]"
                  : "text-[#DC2626]"
                }`}>
                  {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                </span>
                <span className="text-[#6B6B65] leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy fields: objections + tradeoffs */}
      {(handoff.objectionsHandled.length > 0 || handoff.tradeoffsAccepted.length > 0 || handoff.unresolvedRisks.length > 0) && (
        <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[8px] px-4 py-3 space-y-2">
          {handoff.objectionsHandled.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Objeções tratadas</p>
              {handoff.objectionsHandled.map((o, i) => (
                <p key={i} className="text-[11px] text-[#4C1D95]">• {o}</p>
              ))}
            </div>
          )}
          {handoff.tradeoffsAccepted.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#5B21B6] mb-0.5">Concessões aceitas</p>
              {handoff.tradeoffsAccepted.map((t, i) => (
                <p key={i} className="text-[11px] text-[#4C1D95]">• {t}</p>
              ))}
            </div>
          )}
          {handoff.unresolvedRisks.length > 0 && (
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[6px] px-3 py-2">
              <p className="text-[10px] font-semibold text-[#D97706] mb-0.5">Riscos não resolvidos</p>
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
    updateClientRequest, setRequestAnalysis, createProject, createBriefing, addMaterialRequest,
    deleteClientRequest, deleteClientRequestsByClient,
  } = useAgencyStore();

  // Destructive controls are master-only — never shown to other internal roles
  // and never reachable from the client portal.
  const isMaster = currentRole === "master";

  const [activeFilter, setActiveFilter]   = useState<ClientRequestStatus | "all">("all");
  const [sourceFilter, setSourceFilter]   = useState<"all" | "public_briefing" | "client_portal">("all");
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convForm, setConvForm]         = useState<ConversionForm | null>(null);
  // requestId → created projectId (success state per request)
  const [createdProjects, setCreatedProjects] = useState<Record<string, string>>({});
  const [processingId,    setProcessingId]    = useState<string | null>(null);
  const [rawOpenId,       setRawOpenId]       = useState<string | null>(null);
  // Delete confirmation: the request pending permanent deletion (modal target)
  const [deleteTarget,    setDeleteTarget]    = useState<ClientRequest | null>(null);
  const [deleteConfirm,   setDeleteConfirm]   = useState("");
  // Demo reset confirmation (Sushi Cazza test requests)
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
    const client = getClient(req.clientId);

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
      clientId: req.clientId,
      goal:     convForm.goal || req.rawText.slice(0, 120),
      type:     deriveProjectType(req.extractedSummary.services),
      stage:    "briefing",
      priority: convForm.priority,
      deadline: convForm.deadline,
      agents:   agentIds,
      initialTasks: [
        {
          title: `Analisar solicitação e preparar proposta — ${client?.name ?? "Cliente"}`,
          description: `Solicitação convertida do portal. Escopo: ${convForm.scope.slice(0, 200)}`,
          agentId: "pm_agent",
          dueDate: pmDueDate,
        },
      ],
    });

    // 2. Create briefing
    createBriefing({
      projectId,
      clientId:  req.clientId,
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
          clientId:  req.clientId,
          projectId,
          title:     mat.trim(),
          description: "Necessário para início do projeto",
          status: "pending",
        });
      }
    }

    // 4. Update client request status
    updateClientRequest(req.id, { status: "in_progress", linkedProjectId: projectId });

    // 5. Record success
    setCreatedProjects((prev) => ({ ...prev, [req.id]: projectId }));
    setConvertingId(null);
    setConvForm(null);
  }

  function patchForm(patch: Partial<ConversionForm>) {
    setConvForm((f) => (f ? { ...f, ...patch } : f));
  }

  function handleProcessBriefing(req: ClientRequest) {
    setProcessingId(req.id);
    const client = getClient(req.clientId);
    const analysis = processBriefing(req, client?.name ?? "Cliente");
    setRequestAnalysis(req.id, analysis);
    updateClientRequest(req.id, { status: "proposal_pending" });
    setProcessingId(null);
  }

  // Demo test requests = anything tied to the fixed Sushi Cazza demo client.
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Solicitações de Clientes</h1>
          <p className="text-[13px] text-[#9B9B95] mt-0.5">
            Briefings recebidos pelo portal — analise e transforme em projetos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal-demo/sushi-cazza"
            className="h-7 px-3 rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB] text-[#D97706] hover:border-[#F59E0B] text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
            Testar como cliente Sushi Cazza
          </Link>
          {isMaster && demoRequestCount > 0 && (
            <button
              onClick={() => setShowDemoReset(true)}
              className="h-7 px-3 rounded-[6px] border border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] hover:border-[#F87171] text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5"
              title="Apaga apenas as solicitações de teste do Sushi Cazza"
            >
              <span className="text-[10px]">⟲</span>
              Resetar teste Sushi Cazza ({demoRequestCount})
              <span className="h-3.5 px-1 rounded-[3px] bg-[#DC2626] text-white text-[8px] font-bold leading-[14px]">ADMIN</span>
            </button>
          )}
          {newCount > 0 && (
            <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[12px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6]" />
              {newCount} nova{newCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Public briefing link (ADMIN only) */}
      <div className="flex items-center gap-3 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">
            Link público para novo cliente
          </div>
          <code className="text-[12px] text-[#1A1A1A] font-mono">/briefing</code>
          <span className="text-[11px] text-[#9B9B95] ml-2">— envie este link a um novo prospect</span>
        </div>
        <CopyLinkButton path="/briefing" />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2">
        {[
          { label: "Todos",                                  value: "all" as const },
          { label: `Prospects (${prospectCount})`,           value: "public_briefing" as const },
          { label: "Portal de clientes",                     value: "client_portal" as const },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSourceFilter(opt.value)}
            className={`h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors ${
              sourceFilter === opt.value
                ? "bg-[#1A1A1A] text-white"
                : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"
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
                  ? "bg-[#1A1A1A] text-white"
                  : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"
              }`}
            >
              {f.label}{count > 0 && <span className="opacity-60 ml-0.5"> ({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhuma solicitação</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5">
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
              className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              {/* ── Header row ── */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#F7F7F6] transition-colors"
                onClick={() => {
                  if (isConverting) return;
                  setExpandedId(isExpanded ? null : req.id);
                }}
              >
                {req.status === "new" && (
                  <span className="w-2 h-2 rounded-full bg-[#5B5BD6] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#1A1A1A]">{req.title}</span>
                    <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                      {REQUEST_STATUS_LABEL[req.status]}
                    </span>
                    {createdProjectId && (
                      <span className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold">
                        Projeto criado
                      </span>
                    )}
                    {req.v2Scope && (
                      <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-semibold">
                        V2 conversacional
                      </span>
                    )}
                    {req.source === "public_briefing" && (
                      <span className="h-5 px-2 rounded-full bg-[#EFF6FF] text-[#2563EB] text-[10px] font-semibold">
                        briefing público
                      </span>
                    )}
                    {req.sdrHandoff && (
                      <span className="h-5 px-2 rounded-full bg-[#EDE9FE] text-[#7C3AED] text-[10px] font-semibold">
                        ✦ SDR
                      </span>
                    )}
                    {req.attachments.length > 0 && (
                      <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-semibold">
                        {req.attachments.length} arquivo{req.attachments.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] text-[#6B6B65] font-medium">{clientName}</span>
                    {req.extractedSummary.services.length > 0 && (
                      <>
                        <span className="text-[#D0D0CC]">·</span>
                        <span className="text-[12px] text-[#9B9B95]">
                          {req.extractedSummary.services.slice(0, 2).join(", ")}
                        </span>
                      </>
                    )}
                    <span className="text-[#D0D0CC]">·</span>
                    <span className="text-[11px] text-[#C0C0BC]">
                      {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
                {req.missingInfo.length > 0 && (
                  <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold shrink-0">
                    {req.missingInfo.length} info{req.missingInfo.length !== 1 ? "s" : ""} ausente{req.missingInfo.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[#C0C0BC] text-[12px] shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && !isConverting && !createdProjectId && (
                <div className="border-t border-[#F0F0ED] px-5 py-5 space-y-5">
                  {/* Raw text — collapsible when analysis exists */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Texto original</div>
                      {req.analysis && (
                        <button
                          onClick={() => setRawOpenId(rawOpenId === req.id ? null : req.id)}
                          className="text-[10px] text-[#5B5BD6] hover:underline font-medium"
                        >
                          {rawOpenId === req.id ? "▲ Ocultar" : "▼ Ver briefing completo"}
                        </button>
                      )}
                    </div>
                    {(!req.analysis || rawOpenId === req.id) && (
                      <p className="text-[13px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap bg-[#F7F7F6] rounded-[8px] px-4 py-3 max-h-[200px] overflow-y-auto">
                        {req.rawText}
                      </p>
                    )}
                  </div>

                  {/* Prospect contact info */}
                  {req.source === "public_briefing" && (
                    <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[8px] px-4 py-3">
                      <div className="text-[10px] font-semibold text-[#2563EB] uppercase tracking-[0.05em] mb-2">
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
                    <V2ScopePanel scope={req.v2Scope} estimate={req.v2Estimate} />
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
                            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Serviços</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.services.map((s) => (
                                <span key={s} className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-medium">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.channels.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Canais</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.channels.map((c) => (
                                <span key={c} className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.objectives.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
                            <div className="flex flex-wrap gap-1.5">
                              {req.extractedSummary.objectives.map((o) => (
                                <span key={o} className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-medium">{o}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {req.extractedSummary.urgency && (
                          <div>
                            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Urgência</div>
                            <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[11px] font-medium inline-block">
                              {req.extractedSummary.urgency}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Missing info */}
                      {req.missingInfo.length > 0 && (
                        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3">
                          <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">Informações ausentes</div>
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
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
                        Arquivos anexados ({req.attachments.length})
                      </div>
                      <div className="space-y-1.5">
                        {req.attachments.map((att) => (
                          <div key={att.id} className="flex items-center gap-3 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] px-3 py-2">
                            <div className="w-7 h-7 rounded-[5px] bg-white border border-[#E5E5E2] flex items-center justify-center shrink-0">
                              <span className="text-[7px] font-bold text-[#6B6B65]">{att.fileType}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-[#1A1A1A] truncate">{att.fileName}</p>
                              <p className="text-[10px] text-[#9B9B95]">
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
                                className="h-5 px-2 rounded-[4px] border border-[#5B5BD6] text-[#5B5BD6] text-[9px] font-semibold hover:bg-[#EEF0FF] transition-colors shrink-0"
                              >
                                Visualizar
                              </a>
                            ) : (
                              <span className="h-5 px-2 rounded-[4px] bg-[#F0F0ED] text-[#9B9B95] text-[9px] font-semibold shrink-0">
                                local
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {req.attachments.some((a) => a.storageStatus === "local_only") && (
                        <p className="text-[10px] text-[#C0C0BC] mt-1.5">
                          Arquivo registrado localmente nesta sessão. Upload permanente será conectado ao storage.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[#F0F0ED] flex-wrap">
                    {req.status === "new" && (
                      <button
                        onClick={() => updateClientRequest(req.id, { status: "under_review" })}
                        className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                      >
                        Analisar
                      </button>
                    )}
                    {/* Prospect approval actions */}
                    {req.source === "public_briefing" && req.status !== "approved" && req.status !== "rejected" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateClientRequest(req.id, { status: "approved" }); }}
                        className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[12px] font-medium transition-colors"
                      >
                        Aprovar como cliente
                      </button>
                    )}
                    {req.source === "public_briefing" && req.status !== "rejected" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateClientRequest(req.id, { status: "rejected" }); }}
                        className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:border-[#DC2626] hover:text-[#DC2626] text-[12px] font-medium transition-colors"
                      >
                        Recusar
                      </button>
                    )}
                    {!req.analysis ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleProcessBriefing(req); }}
                        disabled={processingId === req.id}
                        className="h-8 px-4 rounded-[7px] border border-[#7C3AED] text-[#7C3AED] hover:bg-[#F5F3FF] disabled:opacity-50 text-[12px] font-medium transition-colors"
                      >
                        {processingId === req.id ? "Processando…" : "✦ Processar briefing"}
                      </button>
                    ) : (
                      <span className="h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold flex items-center gap-1">
                        ✓ Briefing processado
                      </span>
                    )}
                    {req.v2Scope && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateClientRequest(req.id, { status: "proposal_pending" }); }}
                          className="h-8 px-4 rounded-[7px] border border-[#16A34A] text-[#16A34A] hover:bg-[#DCFCE7] text-[12px] font-medium transition-colors"
                        >
                          Preparar proposta
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateClientRequest(req.id, { status: "waiting_client" }); }}
                          className="h-8 px-4 rounded-[7px] border border-[#D97706] text-[#D97706] hover:bg-[#FEF3C7] text-[12px] font-medium transition-colors"
                        >
                          Solicitar complemento
                        </button>
                      </>
                    )}
                    {req.sdrHandoff && req.status !== "waiting_strategy" && req.status !== "completed" && req.status !== "rejected" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateClientRequest(req.id, { status: "waiting_strategy" }); }}
                        className="h-8 px-4 rounded-[7px] border border-[#7C3AED] text-[#7C3AED] hover:bg-[#F5F3FF] text-[12px] font-medium transition-colors"
                      >
                        ⟶ Enviar para Estratégia
                      </button>
                    )}
                    {req.status === "waiting_strategy" && (
                      <Link
                        href="/agency/strategy"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 px-4 rounded-[7px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[12px] font-medium transition-colors inline-flex items-center"
                      >
                        Na fila de Estratégia →
                      </Link>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openConversion(req); }}
                      className="h-8 px-4 rounded-[7px] border border-[#5B5BD6] text-[#5B5BD6] hover:bg-[#EEF0FF] text-[12px] font-medium transition-colors"
                    >
                      Criar projeto
                    </button>
                    {req.status !== "completed" && req.status !== "rejected" && (
                      <select
                        value={req.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateClientRequest(req.id, { status: e.target.value as ClientRequestStatus })}
                        className="ml-auto h-8 px-2 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
                      >
                        {(["new", "under_review", "proposal_pending", "waiting_strategy", "in_progress", "waiting_client", "approved", "completed", "rejected"] as ClientRequestStatus[]).map((s) => (
                          <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    )}
                    {/* Master-only destructive control */}
                    {isMaster && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteModal(req); }}
                        className={`h-8 px-4 rounded-[7px] border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5 ${
                          req.status === "completed" || req.status === "rejected" ? "ml-auto" : ""
                        }`}
                      >
                        Apagar solicitação
                        <span className="h-3.5 px-1 rounded-[3px] bg-[#DC2626] text-white text-[8px] font-bold leading-[14px]">ADMIN</span>
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
            className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-[460px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] text-[16px] shrink-0">⚠</div>
              <h2 className="text-[16px] font-semibold text-[#1A1A1A]">Apagar solicitação definitivamente?</h2>
            </div>
            <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-3">
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
            <div className="bg-[#F7F7F6] rounded-[8px] px-3 py-2 mb-4">
              <p className="text-[12px] text-[#6B6B65]">
                <span className="font-semibold text-[#1A1A1A]">{deleteTarget.title}</span>
                {" · "}{getClient(deleteTarget.clientId)?.name ?? deleteTarget.clientId}
              </p>
            </div>
            <label className="block text-[11px] font-medium text-[#6B6B65] mb-1.5">
              Digite <span className="font-bold text-[#DC2626]">APAGAR</span> para confirmar
            </label>
            <input
              autoFocus
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
              placeholder="APAGAR"
              className="w-full h-9 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#DC2626] mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}
                className="h-9 px-4 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] text-[13px] font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirm.trim().toUpperCase() !== "APAGAR"}
                className="h-9 px-4 rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
              >
                Apagar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Demo reset confirmation modal (master only) ── */}
      {isMaster && showDemoReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowDemoReset(false)}
        >
          <div
            className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-[440px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] text-[16px] shrink-0">⟲</div>
              <h2 className="text-[16px] font-semibold text-[#1A1A1A]">Resetar teste Sushi Cazza?</h2>
            </div>
            <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-4">
              Isso apagará apenas as solicitações de teste do Sushi Cazza
              {" "}({demoRequestCount}). Clientes, projetos e demais dados não serão afetados.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDemoReset(false)}
                className="h-9 px-4 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] text-[13px] font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={runDemoReset}
                className="h-9 px-4 rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[13px] font-medium transition-colors"
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
    low: "bg-[#FEF3C7] text-[#D97706]",
    medium: "bg-[#EEF0FF] text-[#5B5BD6]",
    high: "bg-[#DCFCE7] text-[#16A34A]",
  };

  return (
    <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#1A1A1A]">Escopo V2 — Briefing conversacional</span>
        <span className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[9px] font-semibold">automático</span>
      </div>

      {/* Services + quantities grid */}
      <div className="grid grid-cols-2 gap-4">
        {scope.wantsSocialMedia && (
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Social Media</div>
            <div className="space-y-0.5 text-[11px] text-[#1A1A1A]">
              {scope.social?.platforms.length
                ? <div><span className="text-[#9B9B95]">Canais:</span> {scope.social.platforms.join(", ")}</div>
                : null}
              {scope.social?.postsPerWeek !== undefined
                ? <div><span className="text-[#9B9B95]">Posts:</span> {scope.social.postsPerWeek * 4}/mês</div>
                : null}
              {scope.social?.storiesPerWeek !== undefined && scope.social.storiesPerWeek > 0
                ? <div><span className="text-[#9B9B95]">Stories:</span> {scope.social.storiesPerWeek * 4}/mês</div>
                : null}
              {scope.social?.reelsPerMonth !== undefined && scope.social.reelsPerMonth > 0
                ? <div><span className="text-[#9B9B95]">Reels:</span> {scope.social.reelsPerMonth}/mês</div>
                : null}
              {scope.social?.hasPhotos !== undefined
                ? <div><span className="text-[#9B9B95]">Fotos:</span> {scope.social.hasPhotos ? "Disponíveis" : "Sem produção"}</div>
                : null}
              {scope.social?.needsCopy !== undefined
                ? <div><span className="text-[#9B9B95]">Copy:</span> {scope.social.needsCopy ? "Pela Dioli" : "Pelo cliente"}</div>
                : null}
            </div>
          </div>
        )}
        {scope.wantsPaidTraffic && (
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Tráfego Pago</div>
            <div className="space-y-0.5 text-[11px] text-[#1A1A1A]">
              {scope.traffic?.monthlyAdBudget
                ? <div><span className="text-[#9B9B95]">Verba:</span> {scope.traffic.monthlyAdBudget}</div>
                : <div className="text-[#9B9B95]">Verba não informada</div>}
            </div>
          </div>
        )}
        {scope.branding.requested && (
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Identidade Visual</div>
            {scope.branding.wantsRebrand
              ? <div className="text-[11px] text-[#1A1A1A]">Rebranding solicitado</div>
              : <div className="text-[11px] text-[#1A1A1A]">Criação de marca</div>}
          </div>
        )}
        {scope.objectives.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Objetivos</div>
            <div className="flex flex-wrap gap-1">
              {scope.objectives.map((o) => (
                <span key={o} className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-medium">{o}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        {scope.serviceMode && (
          <span className="text-[#9B9B95]">
            Modalidade: <strong className="text-[#1A1A1A]">{scope.serviceMode === "monthly" ? "Mensal" : scope.serviceMode === "one_off" ? "Pontual" : "A definir"}</strong>
          </span>
        )}
        {scope.branding.hasBrandBook && (
          <span className="text-[#9B9B95]">Brand Book: <strong className="text-[#1A1A1A]">Disponível</strong></span>
        )}
        {scope.budgetRange && (
          <span className="text-[#9B9B95]">Orçamento: <strong className="text-[#1A1A1A]">{scope.budgetRange}</strong></span>
        )}
        {scope.deadline && (
          <span className="text-[#9B9B95]">Prazo: <strong className="text-[#1A1A1A]">{scope.deadline}</strong></span>
        )}
      </div>

      {/* Estimate */}
      {estimate && estimate.confidence !== "none" && (
        <div className="border-t border-[#E5E5E2] pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Estimativa live</span>
            <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${CONF_STYLE[estimate.confidence] ?? ""}`}>
              {CONF_LABEL[estimate.confidence]}
            </span>
          </div>
          <div className="space-y-1">
            {estimate.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-[#6B6B65]">{item.label}</span>
                <span className="text-[#1A1A1A] font-medium">
                  {fmtBRL(item.minPrice)}–{fmtBRL(item.maxPrice)}/{item.unit}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-[#E5E5E2] text-[11px]">
              <span className="font-semibold text-[#1A1A1A]">Total estimado</span>
              <span className="font-semibold text-[#1A1A1A]">
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
        <span className="text-[12px] font-semibold text-[#1A1A1A]">Análise do briefing</span>
        <span className="text-[10px] text-[#9B9B95]">
          Processado em {new Date(analysis.processedAt).toLocaleDateString("pt-BR")}
        </span>
      </div>

      {/* Executive summary */}
      <div className="bg-[#F7F7F6] rounded-[8px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">O que entendemos</div>
        <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{analysis.executiveSummary}</p>
      </div>

      {/* 2-col: goal + needs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Objetivo principal</div>
          <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{analysis.clientGoal}</p>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Necessidades diagnosticadas</div>
          <ul className="space-y-0.5">
            {analysis.diagnosedNeeds.map((n) => (
              <li key={n} className="text-[11px] text-[#1A1A1A] flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#5B5BD6] shrink-0 mt-1.5" />{n}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Serviços recomendados</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.recommendedServices.map((s) => (
              <span key={s} className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[11px] font-medium">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Prazo estimado</div>
          <span className="text-[12px] font-semibold text-[#1A1A1A]">{analysis.estimatedTimeline}</span>
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Entregáveis sugeridos</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {analysis.suggestedDeliverables.map((d) => (
            <div key={d} className="flex items-start gap-1.5 text-[11px] text-[#1A1A1A]">
              <span className="text-[#16A34A] shrink-0">✓</span>{d}
            </div>
          ))}
        </div>
      </div>

      {/* Investment */}
      <div className="bg-[#F7F7F6] rounded-[8px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Faixa de investimento</div>
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-[17px] font-bold text-[#1A1A1A]">{fmt(analysis.priceRange.min)}</span>
          <span className="text-[13px] text-[#9B9B95]">–</span>
          <span className="text-[17px] font-bold text-[#1A1A1A]">{fmt(analysis.priceRange.max)}</span>
          <span className="text-[11px] text-[#9B9B95] ml-1">estimado</span>
        </div>
        <div className="space-y-1.5 border-t border-[#E5E5E2] pt-2.5">
          {analysis.lineItems.map((item) => (
            <div key={item.service} className="flex items-center justify-between gap-4 text-[11px]">
              <div className="text-[#6B6B65]">
                <span className="font-medium text-[#1A1A1A]">{item.service}</span>
                {" — "}{item.description}
              </div>
              <span className="text-[#1A1A1A] font-medium shrink-0">
                {fmt(item.minPrice)}–{fmt(item.maxPrice)}/{item.unit}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-[#C0C0BC] mt-2">*Valores estimados. Sujeitos a detalhamento de escopo.</p>
      </div>

      {/* Missing info */}
      {analysis.missingInfo.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-4 py-3">
          <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">Informações faltantes</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingInfo.map((m) => (
              <span key={m} className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Next questions */}
      {analysis.nextQuestions.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Próximas perguntas para o cliente</div>
          <ol className="space-y-1">
            {analysis.nextQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[#1A1A1A]">
                <span className="text-[#5B5BD6] font-semibold shrink-0 w-4">{i + 1}.</span>{q}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Proposal draft collapsible */}
      <div className="border border-[#E5E5E2] rounded-[8px] overflow-hidden">
        <button
          onClick={() => setProposalOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#F7F7F6] hover:bg-[#F0F0ED] transition-colors text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-[#1A1A1A]">Rascunho de proposta</span>
            <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[9px] font-semibold">
              PM deve revisar antes de enviar
            </span>
          </div>
          <span className="text-[12px] text-[#9B9B95] shrink-0 ml-4">{proposalOpen ? "▲" : "▼"}</span>
        </button>
        {proposalOpen && (
          <div className="bg-white px-4 py-3">
            <pre className="text-[11px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap font-mono overflow-y-auto max-h-[400px]">
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
    <div className="border-t border-[#E5E5E2] bg-[#F7F7F6] px-5 py-5 space-y-5">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#1A1A1A]">Criar projeto</div>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">
            Baseado em: {req.title} · {clientName}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-[12px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors"
        >
          Cancelar
        </button>
      </div>

      {/* Row 1: name + priority + deadline */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
            Nome do projeto
          </label>
          <input
            type="text"
            value={form.projectName}
            onChange={(e) => onPatch({ projectName: e.target.value })}
            className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
            Prioridade
          </label>
          <select
            value={form.priority}
            onChange={(e) => onPatch({ priority: e.target.value as Priority })}
            className="w-full h-9 px-2 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6]"
          >
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
            Prazo
          </label>
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => onPatch({ deadline: e.target.value })}
            className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6]"
          />
        </div>
      </div>

      {/* Goal */}
      <div>
        <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
          Objetivo do projeto
        </label>
        <input
          type="text"
          value={form.goal}
          onChange={(e) => onPatch({ goal: e.target.value })}
          placeholder="Ex.: ganhar novos clientes e aumentar vendas"
          className="w-full h-9 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] transition-colors"
        />
      </div>

      {/* Departments */}
      <div>
        <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
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
                    ? "bg-[#1A1A1A] border-[#1A1A1A] text-white"
                    : "bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95]"
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
        <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">
          Escopo inicial (vai para o briefing)
        </label>
        <textarea
          value={form.scope}
          onChange={(e) => onPatch({ scope: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] resize-none leading-relaxed"
        />
      </div>

      {/* Material requests */}
      <div>
        <label className="block text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
          Materiais necessários do cliente
        </label>
        <div className="space-y-1.5 mb-2">
          {form.materials.map((m, i) => (
            <div key={i} className="flex items-center gap-2 bg-white border border-[#E5E5E2] rounded-[7px] px-3 py-1.5">
              <span className="flex-1 text-[12px] text-[#1A1A1A]">{m}</span>
              <button
                onClick={() => removeMaterial(i)}
                className="text-[#C0C0BC] hover:text-[#DC2626] text-[11px] transition-colors shrink-0"
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
            className="flex-1 h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] transition-colors"
          />
          <button
            onClick={addMaterial}
            disabled={!form.newMaterial.trim()}
            className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] text-[12px] disabled:opacity-40 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Confirm action */}
      <div className="flex items-center gap-3 pt-1 border-t border-[#E5E5E2]">
        <button
          onClick={onConfirm}
          disabled={!form.projectName.trim() || !form.deadline}
          className="h-9 px-5 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-medium transition-colors"
        >
          Confirmar e criar projeto
        </button>
        <button
          onClick={onCancel}
          className="h-9 px-4 rounded-[8px] border border-[#E5E5E2] text-[#6B6B65] hover:text-[#1A1A1A] text-[12px] font-medium transition-colors"
        >
          Cancelar
        </button>
        <p className="text-[11px] text-[#C0C0BC] ml-auto">
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
    <div className="border-t border-[#BBF7D0] bg-[#F0FDF4] px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0 text-[#16A34A] font-bold text-[14px]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#15803D] mb-0.5">Projeto criado com sucesso!</div>
          <p className="text-[12px] text-[#16A34A]">{projectName}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              href={`/agency/projects/${projectId}`}
              className="h-7 px-3 rounded-[6px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[11px] font-medium transition-colors inline-flex items-center"
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
              href="/agency/departments/strategy"
              className="h-7 px-3 rounded-[6px] border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium transition-colors inline-flex items-center"
            >
              Abrir Estratégia
            </Link>
            <Link
              href="/agency/departments/project-management"
              className="h-7 px-3 rounded-[6px] border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium transition-colors inline-flex items-center"
            >
              Gestão de Projetos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
