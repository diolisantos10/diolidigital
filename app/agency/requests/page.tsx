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
import { processBriefing } from "@/lib/agency/briefing-processor";
import type { Priority } from "@/lib/agency/mock-data";

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
    clientRequests, clients, projects,
    updateClientRequest, setRequestAnalysis, createProject, createBriefing, addMaterialRequest,
  } = useAgencyStore();

  const [activeFilter, setActiveFilter] = useState<ClientRequestStatus | "all">("all");
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convForm, setConvForm]         = useState<ConversionForm | null>(null);
  // requestId → created projectId (success state per request)
  const [createdProjects, setCreatedProjects] = useState<Record<string, string>>({});
  const [processingId,    setProcessingId]    = useState<string | null>(null);
  const [rawOpenId,       setRawOpenId]       = useState<string | null>(null);

  const all    = clientRequests ?? [];
  const filtered = all.filter((r) => activeFilter === "all" || r.status === activeFilter);
  const newCount = all.filter((r) => r.status === "new").length;

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
          {newCount > 0 && (
            <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[12px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6]" />
              {newCount} nova{newCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
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
          const clientName = getClient(req.clientId)?.name ?? req.clientId;

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
                        {(["new", "under_review", "proposal_pending", "in_progress", "waiting_client", "completed", "rejected"] as ClientRequestStatus[]).map((s) => (
                          <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
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
