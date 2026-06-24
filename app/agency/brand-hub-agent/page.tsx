"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { BrandExtraction } from "@/lib/types/brand-extraction";

// ─── Brand Hub Agent — Brand Intelligence Department ──────────────────────────
//
// Generates a Brand Health Analysis from the client's Brand Brain.
// Client-level (not project-level) — selects a client, not a project.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#C2530A"; // orange — Brand Hub color

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "overview" | "strengths" | "gaps" | "suggestions";

interface BrandAnalysis {
  healthScore: number;
  healthLabel: string;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  consistencyAlerts: string[];
  toneAssessment: string;
  summary: string;
}

const STEPS = [
  "Lendo Brand Brain do cliente…",
  "Avaliando posicionamento e tom…",
  "Verificando consistência de marca…",
  "Identificando lacunas…",
  "Gerando recomendações…",
];

const MOCK_ANALYSIS: BrandAnalysis = {
  healthScore: 6,
  healthLabel: "Em desenvolvimento",
  strengths: [
    "Posicionamento claro e diferenciado no mercado",
    "Tom de voz bem definido e consistente com o segmento",
    "Canais preferidos identificados com justificativa estratégica",
  ],
  gaps: [
    "Brand Brain incompleto — campos de referências visuais não preenchidos",
    "Regras de marca precisam ser mais específicas e acionáveis",
    "Paleta de cores não documentada com valores hex",
  ],
  suggestions: [
    "Completar os campos de tipografia e referências visuais no Brand Brain",
    "Criar um mini-manual de identidade visual com exemplos do que fazer e evitar",
    "Documentar 3-5 exemplos reais de tom de voz aplicado em diferentes formatos",
    "Definir regras específicas de uso do logo em diferentes contextos",
  ],
  consistencyAlerts: [
    "Tom de voz descrito pode conflitar com o estilo visual declarado — revisar alinhamento",
  ],
  toneAssessment: "O tom de voz está bem descrito em nível conceitual, mas precisa de exemplos práticos para garantir consistência na execução pelos agentes.",
  summary: "A marca está em desenvolvimento — tem fundamentos sólidos de posicionamento e tom, mas precisa completar a documentação visual e adicionar exemplos práticos para garantir consistência na execução.",
};

function HealthBadge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 8 ? { bg: "#DCFCE7", text: "#16A34A", dot: "#16A34A" } :
    score >= 5 ? { bg: "#FFF7ED", text: "#C2530A", dot: "#C2530A" } :
                 { bg: "#FEE2E2", text: "#DC2626", dot: "#DC2626" };
  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-[22px] font-bold border-[3px]" style={{ borderColor: color.dot, color: color.text, backgroundColor: color.bg }}>
        {score}
      </div>
      <div>
        <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Saúde da Marca</div>
        <div className="text-[15px] font-semibold" style={{ color: color.text }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandHubAgentPage() {
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeTab, setActiveTab] = useState<OutputTab>("overview");
  const [stepIndex, setStepIndex] = useState(0);
  const [analysis, setAnalysis] = useState<BrandAnalysis | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveSkipped, setSaveSkipped] = useState(false);

  // ── Brand Book Upload state ───────────────────────────────────────────────
  const [bbFile, setBbFile] = useState<File | null>(null);
  const [bbUploading, setBbUploading] = useState(false);
  const [bbExtraction, setBbExtraction] = useState<BrandExtraction | null>(null);
  const [bbError, setBbError] = useState<string | null>(null);
  const bbInputRef = useRef<HTMLInputElement>(null);

  const { clients, projects } = useAgencyStore();
  const { createDeliverable } = useDbDeliverables();

  // ── Derived ──────────────────────────────────────────────────────────────────
  const linkedClient = linkedClientId ? clients.find((c) => c.id === linkedClientId) : null;
  const agentCtx = linkedClient ? getClientAgentContext(linkedClient) : null;
  const clientProjects = linkedClientId ? projects.filter((p) => p.clientId === linkedClientId) : [];
  const brandBrainReadiness = agentCtx?.brandBrainReadiness ?? 0;

  // ── Actions ───────────────────────────────────────────────────────────────────
  async function handleRun() {
    if (!linkedClient) return;
    setAgentState("generating");
    setStepIndex(0);
    setSaved(false);
    setSaveSkipped(false);

    const stepDelays = [800, 1800, 3000, 4500];
    stepDelays.forEach((ms, i) => {
      setTimeout(() => setStepIndex(i + 1), ms);
    });

    let finalAnalysis: BrandAnalysis;
    try {
      const res = await fetch("/api/agents/brand/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: linkedClient.name,
          industry:   linkedClient.industry,
          brandBrain: linkedClient.brandBrain ?? null,
        }),
      });

      const data = (await res.json()) as { ok: boolean; analysis?: BrandAnalysis; error?: string };

      if (!data.ok || !data.analysis) {
        console.warn("[brand-hub-agent] AI unavailable, using mock fallback:", data.error);
        finalAnalysis = MOCK_ANALYSIS;
      } else {
        finalAnalysis = data.analysis;
      }
    } catch (err) {
      console.warn("[brand-hub-agent] fetch error, falling back to mock:", err);
      finalAnalysis = MOCK_ANALYSIS;
    }

    setAnalysis(finalAnalysis);
    setAgentState("output_ready");
    setActiveTab("overview");
    setStepIndex(4);
  }

  async function handleSave() {
    if (!analysis || saved) return;

    // Deliverables need a projectId — use first project if available
    const targetProject = clientProjects[0];
    if (!targetProject) {
      setSaveSkipped(true);
      return;
    }

    await createDeliverable({
      projectId: targetProject.id,
      name: `Brand Health Report — ${linkedClient?.name ?? "Cliente"}`,
      type: "document",
      status: "in_review",
    });
    setSaved(true);
  }

  function handleReset() {
    setAgentState("idle");
    setAnalysis(null);
    setStepIndex(0);
    setSaved(false);
    setSaveSkipped(false);
  }

  async function handleBrandBookUpload(file: File) {
    setBbFile(file);
    setBbError(null);
    setBbExtraction(null);
    setBbUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/brain/analyze-brand-book", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; extraction?: BrandExtraction; error?: string };
      if (!data.ok || !data.extraction) {
        setBbError(data.error ?? "Erro ao analisar o arquivo.");
      } else {
        setBbExtraction(data.extraction);
      }
    } catch {
      setBbError("Erro de rede ao enviar o arquivo.");
    } finally {
      setBbUploading(false);
    }
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
    { id: "overview", label: "Visão Geral" },
    { id: "strengths", label: "Pontos Fortes" },
    { id: "gaps", label: "Lacunas" },
    { id: "suggestions", label: "Sugestões" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Brand Hub Agent"
        subtitle="Departamento de Marca — analisa o Brand Brain do cliente e gera um relatório completo de saúde de marca com pontos fortes, lacunas e sugestões acionáveis."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase" style={{ backgroundColor: "#FFF7ED", color: ACCENT }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
            Departamento de Marca
          </span>
          <span className="text-[12px] text-[#9B9B95]">v1 · brand health report</span>
          {linkedClient && (
            <Link href={`/agency/clients/${linkedClient.id}`} className="text-[12px] text-[#070A1F] hover:underline">
              ← {linkedClient.name}
            </Link>
          )}
          {agentState === "output_ready" && linkedClientId && (
            <div className="ml-auto flex items-center gap-2">
              {saved ? (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Salvo — 1 entrega em revisão
                </span>
              ) : saveSkipped ? (
                <span className="text-[12px] text-[#9B9B95]">Nenhum projeto — entrega não salva</span>
              ) : (
                <button
                  onClick={handleSave}
                  className="h-7 px-3 rounded-[6px] text-[12px] font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  Salvar 1 entrega no projeto
                </button>
              )}
            </div>
          )}
        </div>

        {/* Brand Book Upload — full width */}
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <div className="px-5 py-4 border-b border-[#E5E5E2] flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Importar Brand Book</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Envie qualquer arquivo — PDF, imagem, DOCX ou PPTX — e Claude extrai a identidade da marca automaticamente.</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: "#FFF7ED", color: ACCENT }}>PDF · PPT · DOCX · Imagem</span>
          </div>

          <div className="px-5 py-4">
            {/* Drop zone */}
            {!bbExtraction && !bbUploading && (
              <div
                className="border-2 border-dashed border-[#E5E5E2] rounded-[8px] px-6 py-8 text-center cursor-pointer hover:border-[#C2530A]/40 hover:bg-[#FFF7ED]/40 transition-all"
                onClick={() => bbInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBrandBookUpload(f); }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#FFF7ED" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 13V4M7 7l3-3 3 3" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-[#1A1A1A] mb-1">Arraste aqui ou clique para selecionar</p>
                <p className="text-[12px] text-[#9B9B95]">PDF, PNG, JPG, WEBP, DOCX, PPTX — máximo 20 MB</p>
                <input
                  ref={bbInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.doc,.pptx,.ppt"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBrandBookUpload(f); }}
                />
              </div>
            )}

            {/* Uploading */}
            {bbUploading && (
              <div className="flex items-center gap-4 px-4 py-5 rounded-[8px] bg-[#FFF7ED] border border-[#FDBA74]">
                <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">Analisando {bbFile?.name}…</p>
                  <p className="text-[12px] text-[#9B9B95]">Claude está lendo o documento. Pode levar até 90 s para PDFs grandes.</p>
                </div>
              </div>
            )}

            {/* Error */}
            {bbError && !bbUploading && (
              <div className="rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-4 py-3 flex items-start gap-3">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0 mt-0.5"><circle cx="7.5" cy="7.5" r="6" stroke="#DC2626" strokeWidth="1.3"/><path d="M7.5 5v3M7.5 10h.01" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#DC2626]">{bbError}</p>
                </div>
                <button onClick={() => { setBbError(null); setBbFile(null); }} className="shrink-0 text-[11px] text-[#DC2626] hover:underline">Tentar novamente</button>
              </div>
            )}

            {/* Extracted data */}
            {bbExtraction && !bbUploading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#16A34A" strokeWidth="1.3"/><path d="M4 6.5l1.5 1.5 3.5-3.5" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-[12px] font-semibold text-[#16A34A]">Identidade extraída — {bbFile?.name}</span>
                  </div>
                  <button onClick={() => { setBbExtraction(null); setBbFile(null); setBbError(null); }} className="text-[11px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">Limpar</button>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-[#FAFAF9] rounded-[8px] border border-[#E5E5E2] px-4 py-3">
                  {bbExtraction.brandName && <div className="text-[12px]"><span className="text-[#9B9B95]">Marca: </span><span className="font-medium text-[#1A1A1A]">{bbExtraction.brandName}</span></div>}
                  {bbExtraction.tagline && <div className="text-[12px]"><span className="text-[#9B9B95]">Tagline: </span><span className="text-[#1A1A1A]">{bbExtraction.tagline}</span></div>}
                  {bbExtraction.typography && <div className="text-[12px]"><span className="text-[#9B9B95]">Tipografia: </span><span className="text-[#1A1A1A]">{bbExtraction.typography}</span></div>}
                  {bbExtraction.tone && <div className="text-[12px]"><span className="text-[#9B9B95]">Tom: </span><span className="text-[#1A1A1A]">{bbExtraction.tone}</span></div>}
                  {bbExtraction.targetAudience && <div className="col-span-2 text-[12px]"><span className="text-[#9B9B95]">Público: </span><span className="text-[#1A1A1A]">{bbExtraction.targetAudience}</span></div>}
                  {bbExtraction.positioning && <div className="col-span-2 text-[12px]"><span className="text-[#9B9B95]">Posicionamento: </span><span className="text-[#1A1A1A]">{bbExtraction.positioning}</span></div>}
                </div>

                {/* Color swatches */}
                {(bbExtraction.primaryColor || bbExtraction.secondaryColor || bbExtraction.accentColor) && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-[#9B9B95]">Paleta:</span>
                    {[
                      { label: "Primária", hex: bbExtraction.primaryColor },
                      { label: "Secundária", hex: bbExtraction.secondaryColor },
                      { label: "Destaque", hex: bbExtraction.accentColor },
                    ].filter(c => c.hex).map((c) => (
                      <div key={c.label} className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-[4px] border border-[#E5E5E2] shrink-0" style={{ backgroundColor: c.hex }} />
                        <span className="text-[11px] text-[#6B6B65]">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                )}

                {bbExtraction.values && bbExtraction.values.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {bbExtraction.values.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-[#F0F0ED] text-[#6B6B65]">{v}</span>
                    ))}
                  </div>
                )}

                {bbExtraction.summary && (
                  <p className="text-[12px] text-[#6B6B65] leading-relaxed">{bbExtraction.summary}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
          {/* ── LEFT: Setup ── */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[#E5E5E2]">
              <p className="text-[13px] font-semibold text-[#1A1A1A]">Configuração do Relatório</p>
              <p className="text-[12px] text-[#9B9B95] mt-0.5">Selecione um cliente para analisar o Brand Brain e gerar o relatório de saúde de marca.</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Client selector */}
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                  Cliente <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={linkedClientId ?? ""}
                  onChange={(e) => { setLinkedClientId(e.target.value || null); setAnalysis(null); setSaved(false); setSaveSkipped(false); setAgentState("idle"); }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Brain status */}
              {linkedClient && (
                <div className={`rounded-[8px] border px-3 py-2.5 ${brandBrainReadiness < 5 ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#FFF7ED] border-[#FDBA74]"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color: ACCENT }}>●</span>
                      <span className="text-[11px] font-semibold text-[#1A1A1A]">
                        {brandBrainReadiness < 5 ? "Brand Brain incompleto" : "Brand Brain ativo"}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FFF7ED", color: ACCENT }}>
                      {brandBrainReadiness}/13
                    </span>
                  </div>
                  {brandBrainReadiness < 5 ? (
                    <p className="text-[11px] text-[#D97706] leading-snug">Brand Brain incompleto — a análise usará os campos disponíveis. Complete o Brand Brain para um relatório mais preciso.</p>
                  ) : (
                    <div className="space-y-0.5 mt-1">
                      {linkedClient.brandBrain?.positioning && (
                        <div className="flex gap-2"><span className="text-[10px] text-[#9B9B95] w-14 shrink-0">Posição</span><span className="text-[11px] text-[#1A1A1A] truncate">{linkedClient.brandBrain.positioning.slice(0, 60)}…</span></div>
                      )}
                      {linkedClient.brandBrain?.toneOfVoice && (
                        <div className="flex gap-2"><span className="text-[10px] text-[#9B9B95] w-14 shrink-0">Tom</span><span className="text-[11px] text-[#1A1A1A] truncate">{linkedClient.brandBrain.toneOfVoice.slice(0, 60)}…</span></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Client context */}
              {linkedClient && (
                <div className="rounded-[8px] bg-[#FAFAF9] border border-[#E5E5E2] px-3 py-3 space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Segmento</span>
                    <span className="text-[11px] text-[#1A1A1A]">{linkedClient.industry}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] text-[#9B9B95] w-16 shrink-0">Projetos</span>
                    <span className="text-[11px] text-[#1A1A1A]">{clientProjects.length} ativo(s)</span>
                  </div>
                  {clientProjects.length === 0 && (
                    <p className="text-[11px] text-[#D97706] mt-1">Sem projetos — a entrega não poderá ser salva.</p>
                  )}
                </div>
              )}

              {/* What gets generated */}
              {linkedClient && (
                <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-3 py-3">
                  <p className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-[0.05em] mb-2">Será gerado</p>
                  <ul className="space-y-1">
                    {["Health Score da marca", "Pontos fortes identificados", "Lacunas e gaps", "Sugestões concretas", "Alertas de consistência", "Avaliação do tom de voz"].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[12px] text-[#1A1A1A]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Run / Generating / Reset */}
              {agentState === "idle" && (
                <button
                  disabled={!linkedClient}
                  onClick={handleRun}
                  className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: linkedClient ? ACCENT : "#9CA3AF" }}
                >
                  {!linkedClient ? "Selecione um cliente para começar" : "Gerar Brand Health Report"}
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: ACCENT }}>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset} className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-all">
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Output ── */}

          {/* Idle — no client */}
          {agentState === "idle" && !linkedClient && (
            <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#FFF7ED" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke={ACCENT} strokeWidth="1.8" />
                  <path d="M7 10c0-1.65 1.35-3 3-3s3 1.35 3 3-1.35 3-3 3" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="1.2" fill={ACCENT} />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[#1A1A1A] mb-1">Departamento de Marca</p>
              <p className="text-[13px] text-[#9B9B95] max-w-sm mx-auto">Selecione um cliente para analisar o Brand Brain e gerar um relatório completo de saúde de marca.</p>
            </div>
          )}

          {/* Idle — ready */}
          {agentState === "idle" && linkedClient && (
            <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: "#FFF7ED" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="8" stroke={ACCENT} strokeWidth="1.8" />
                  <path d="M8 11c0-1.65 1.35-3 3-3s3 1.35 3 3-1.35 3-3 3" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="11" cy="11" r="1.4" fill={ACCENT} />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#1A1A1A] mb-2">Pronto para analisar</p>
              <p className="text-[13px] text-[#6B6B65] max-w-sm mx-auto leading-relaxed">
                {linkedClient.name} · {linkedClient.industry}. O Brand Hub Agent vai analisar o Brand Brain e gerar um relatório completo de saúde de marca.
              </p>
            </div>
          )}

          {/* Generating */}
          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[#DCFCE7]" : i === stepIndex ? "" : "bg-[#F0F0ED]"}`} style={i === stepIndex ? { backgroundColor: "#FFF7ED" } : {}}>
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : i === stepIndex ? (
                        <span className="w-2.5 h-2.5 border-2 rounded-full animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C0C0BC]" />
                      )}
                    </span>
                    <span className={`text-[13px] ${i <= stepIndex ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output ready */}
          {agentState === "output_ready" && analysis && (
            <div className="space-y-4">
              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E5E2] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "text-white" : "text-[#6B6B65] hover:bg-[#F7F7F6]"}`}
                    style={activeTab === t.id ? { backgroundColor: ACCENT } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {activeTab === "overview" && (
                <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-5 space-y-5">
                  <HealthBadge score={analysis.healthScore} label={analysis.healthLabel} />
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Resumo da Marca</div>
                    <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{analysis.summary}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Avaliação do Tom de Voz</div>
                    <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{analysis.toneAssessment}</p>
                  </div>
                  {analysis.consistencyAlerts.length > 0 && (
                    <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                      <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">Alertas de Consistência</div>
                      <ul className="space-y-1">
                        {analysis.consistencyAlerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[#D97706]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#D97706] shrink-0" />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Strengths */}
              {activeTab === "strengths" && (
                <div className="bg-white rounded-[10px] border border-[#BBF7D0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="text-[11px] font-semibold text-[#16A34A] uppercase tracking-[0.05em] mb-3">Pontos Fortes da Marca</div>
                  <ul className="space-y-2">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-[3px] shrink-0">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-7" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                        <span className="text-[13px] text-[#1A1A1A] leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {activeTab === "gaps" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[10px] border border-[#FECACA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[#DC2626] uppercase tracking-[0.05em] mb-3">Lacunas Identificadas</div>
                    <ul className="space-y-2">
                      {analysis.gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-[#6B6B65]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />{g}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {analysis.consistencyAlerts.length > 0 && (
                    <div className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                      <div className="text-[11px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-2">Alertas de Consistência</div>
                      <ul className="space-y-1.5">
                        {analysis.consistencyAlerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[#6B6B65]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#D97706] shrink-0" />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Suggestions */}
              {activeTab === "suggestions" && (
                <div className="space-y-2">
                  {analysis.suggestions.map((s, i) => (
                    <div key={i} className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-3 flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-px text-white" style={{ backgroundColor: ACCENT }}>{i + 1}</span>
                      <span className="text-[13px] text-[#1A1A1A] leading-snug">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Save footer */}
              <div className="flex items-center justify-between bg-[#F7F7F6] rounded-[12px] border border-[#E5E5E2] px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">Salvar relatório como entrega revisável</p>
                  <p className="text-[12px] text-[#9B9B95]">
                    {clientProjects.length > 0
                      ? `Será salvo no projeto: ${clientProjects[0].name}`
                      : "Nenhum projeto ativo — não é possível salvar."}
                  </p>
                </div>
                {saved ? (
                  <span className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[#DCFCE7] text-[#16A34A]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Salvo no projeto
                  </span>
                ) : saveSkipped ? (
                  <span className="text-[12px] text-[#9B9B95] italic">Nenhum projeto disponível</span>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={clientProjects.length === 0}
                    className="h-9 px-5 rounded-[8px] text-white text-[13px] font-medium transition-colors hover:opacity-90 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: ACCENT }}
                  >
                    Salvar entrega →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
