"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import { getClientAgentContext } from "@/lib/agency/workspace";
import type { BrandExtraction } from "@/lib/types/brand-extraction";
import { comoTexto, temSubstancia } from "@/lib/agency/esteira/conteudo";
import AvisoModoAlternativo from "@/components/agency/ui/AvisoModoAlternativo";

// ─── Brand Hub Agent — Brand Intelligence Department ──────────────────────────
//
// Generates a Brand Health Analysis from the client's Brand Brain.
// Client-level (not project-level) — selects a client, not a project.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#0E7C75"; // orange — Brand Hub color

type AgentState = "idle" | "generating" | "output_ready";
type OutputTab = "overview" | "strengths" | "gaps" | "suggestions";

/** O que a rota `marca/do-brand-book` devolve. `aindaFalta` NÃO é opcional na
 *  leitura desta tela: é ele que impede a tela de dar a entender que mandar o
 *  PDF fecha a ficha. */
interface AplicacaoDoBrandBook {
  ok: boolean;
  aplicados: { campo: string; rotulo: string; deOnde: string }[];
  naoTocados: { campo: string; rotulo: string }[];
  foraDoAlcance: { campo: string; rotulo: string; porque: string }[];
  recado: string;
  andou?: { de: number; para: number; total: number };
  aindaFalta: {
    definidos: number;
    total: number;
    aindaNoDiaZero: boolean;
    proximasPerguntas: { campo: string; pergunta: string | null }[];
  };
}

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
    score >= 8 ? { bg: "#DCFCE7", text: "var(--success)", dot: "var(--success)" } :
    score >= 5 ? { bg: "#E6FBFA", text: "#0E7C75", dot: "#0E7C75" } :
                 { bg: "#FEE2E2", text: "var(--danger)", dot: "var(--danger)" };
  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-[22px] font-bold border-[3px]" style={{ borderColor: color.dot, color: color.text, backgroundColor: color.bg }}>
        {score}
      </div>
      <div>
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Saúde da Marca</div>
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
  // Análise veio do conteúdo de reserva, não da IA — DESIGN.md §7.3.
  const [motivoDaReserva, setMotivoDaReserva] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveSkipped, setSaveSkipped] = useState(false);

  // ── Brand Book Upload state ───────────────────────────────────────────────
  const [bbFile, setBbFile] = useState<File | null>(null);
  const [bbUploading, setBbUploading] = useState(false);
  const [bbExtraction, setBbExtraction] = useState<BrandExtraction | null>(null);
  // ── A EXTRAÇÃO APLICADA À FICHA (15/08/2026) ─────────────────────────────
  // Até aqui a extração morria neste estado: a tela mostrava paleta, tom e
  // público, e nada disso chegava ao `BrandBrain`. O CEO mandou o brand book do
  // CityJobs, viu a análise e a ficha continuou em 22%.
  const [bbAplicando, setBbAplicando] = useState(false);
  const [bbResultado, setBbResultado] = useState<AplicacaoDoBrandBook | null>(null);
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
    setMotivoDaReserva(null);

    const stepDelays = [800, 1800, 3000, 4500];
    stepDelays.forEach((ms, i) => {
      setTimeout(() => setStepIndex(i + 1), ms);
    });

    let finalAnalysis: BrandAnalysis;
    let motivo: string | null = null;
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
        // Cair em reserva é aceitável; cair em SILÊNCIO não. DESIGN.md §7.3.
        console.warn("[brand-hub-agent] AI unavailable, using mock fallback:", data.error);
        finalAnalysis = MOCK_ANALYSIS;
        motivo = data.error ?? "a IA não respondeu";
      } else {
        finalAnalysis = data.analysis;
      }
    } catch (err) {
      console.warn("[brand-hub-agent] fetch error, falling back to mock:", err);
      finalAnalysis = MOCK_ANALYSIS;
      motivo = err instanceof Error ? err.message : "falha de conexão com o serviço de IA";
    }

    setMotivoDaReserva(motivo);
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

    const nome = `Relatório de Saúde de Marca — ${linkedClient?.name ?? "Cliente"}`;
    const content = comoTexto(analysis, { titulo: nome });
    await createDeliverable({
      projectId: targetProject.id,
      name: nome,
      type: "document",
      status: "in_review",
      ...(temSubstancia(content) ? { content } : {}),
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
    setBbResultado(null);
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

  /**
   * Aplica a extração à ficha de marca do cliente.
   *
   * A rota é separada do `PUT` de propósito: aqui a extração PROPÕE. Campo que
   * o dono já respondeu volta em `naoTocados` e não é sobrescrito.
   */
  async function aplicarBrandBookNaFicha() {
    if (!linkedClientId || !bbExtraction || !bbFile) return;
    setBbAplicando(true);
    setBbResultado(null);
    try {
      const res = await fetch(`/api/agency/clients/${linkedClientId}/marca/do-brand-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracao: bbExtraction, arquivo: bbFile.name }),
      });
      const data = (await res.json()) as AplicacaoDoBrandBook & { error?: string };
      if (!res.ok) {
        setBbError(data.error ?? "Não consegui aplicar à ficha.");
        return;
      }
      setBbResultado(data);
    } catch {
      setBbError("Erro de rede ao aplicar à ficha.");
    } finally {
      setBbAplicando(false);
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
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      <AgencyHeader
        title="Brand Hub Agent"
        subtitle="Departamento de Marca — analisa o Brand Brain do cliente e gera um relatório completo de saúde de marca com pontos fortes, lacunas e sugestões acionáveis."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
            Departamento de Marca
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">v1 · relatório de saúde de marca</span>
          {linkedClient && (
            <Link href={`/agency/clients/${linkedClient.id}`} className="text-[12px] text-[var(--navy)] hover:underline">
              ← {linkedClient.name}
            </Link>
          )}
          {agentState === "output_ready" && linkedClientId && (
            <div className="ml-auto flex items-center gap-2">
              {saved ? (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--success-bg)] text-[var(--success)] border border-[#BBF7D0]">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Salvo — 1 entrega em revisão
                </span>
              ) : saveSkipped ? (
                <span className="text-[12px] text-[var(--text-muted)]">Nenhum projeto — entrega não salva</span>
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
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Importar Brand Book</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Envie qualquer arquivo — PDF, imagem, DOCX ou PPTX — e Claude extrai a identidade da marca automaticamente.</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>PDF · PPT · DOCX · Imagem</span>
          </div>

          <div className="px-5 py-4">
            {/* Drop zone */}
            {!bbExtraction && !bbUploading && (
              <div
                className="border-2 border-dashed border-[var(--border)] rounded-[8px] px-6 py-8 text-center cursor-pointer hover:border-[#0E7C75]/40 hover:bg-[#E6FBFA]/40 transition-all"
                onClick={() => bbInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBrandBookUpload(f); }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#E6FBFA" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 13V4M7 7l3-3 3 3" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-[var(--text-primary)] mb-1">Arraste aqui ou clique para selecionar</p>
                <p className="text-[12px] text-[var(--text-muted)]">PDF, PNG, JPG, WEBP, DOCX, PPTX — máximo 20 MB</p>
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
              <div className="flex items-center gap-4 px-4 py-5 rounded-[8px] bg-[#E6FBFA] border border-[#FDBA74]">
                <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Analisando {bbFile?.name}…</p>
                  <p className="text-[12px] text-[var(--text-muted)]">Claude está lendo o documento. Pode levar até 90 s para PDFs grandes.</p>
                </div>
              </div>
            )}

            {/* Error */}
            {bbError && !bbUploading && (
              <div className="rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-4 py-3 flex items-start gap-3">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0 mt-0.5"><circle cx="7.5" cy="7.5" r="6" stroke="#DC2626" strokeWidth="1.3"/><path d="M7.5 5v3M7.5 10h.01" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[var(--danger)]">{bbError}</p>
                </div>
                <button onClick={() => { setBbError(null); setBbFile(null); }} className="shrink-0 text-[11px] text-[var(--danger)] hover:underline">Tentar novamente</button>
              </div>
            )}

            {/* Extracted data */}
            {bbExtraction && !bbUploading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#16A34A" strokeWidth="1.3"/><path d="M4 6.5l1.5 1.5 3.5-3.5" stroke="#16A34A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-[12px] font-semibold text-[var(--success)]">Identidade extraída — {bbFile?.name}</span>
                  </div>
                  <button onClick={() => { setBbExtraction(null); setBbFile(null); setBbError(null); }} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Limpar</button>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-[var(--bg-elevated)] rounded-[8px] border border-[var(--border)] px-4 py-3">
                  {bbExtraction.brandName && <div className="text-[12px]"><span className="text-[var(--text-muted)]">Marca: </span><span className="font-medium text-[var(--text-primary)]">{bbExtraction.brandName}</span></div>}
                  {bbExtraction.tagline && <div className="text-[12px]"><span className="text-[var(--text-muted)]">Tagline: </span><span className="text-[var(--text-primary)]">{bbExtraction.tagline}</span></div>}
                  {bbExtraction.typography && <div className="text-[12px]"><span className="text-[var(--text-muted)]">Tipografia: </span><span className="text-[var(--text-primary)]">{bbExtraction.typography}</span></div>}
                  {bbExtraction.tone && <div className="text-[12px]"><span className="text-[var(--text-muted)]">Tom: </span><span className="text-[var(--text-primary)]">{bbExtraction.tone}</span></div>}
                  {bbExtraction.targetAudience && <div className="col-span-2 text-[12px]"><span className="text-[var(--text-muted)]">Público: </span><span className="text-[var(--text-primary)]">{bbExtraction.targetAudience}</span></div>}
                  {bbExtraction.positioning && <div className="col-span-2 text-[12px]"><span className="text-[var(--text-muted)]">Posicionamento: </span><span className="text-[var(--text-primary)]">{bbExtraction.positioning}</span></div>}
                </div>

                {/* Color swatches */}
                {(bbExtraction.primaryColor || bbExtraction.secondaryColor || bbExtraction.accentColor) && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-[var(--text-muted)]">Paleta:</span>
                    {[
                      { label: "Primária", hex: bbExtraction.primaryColor },
                      { label: "Secundária", hex: bbExtraction.secondaryColor },
                      { label: "Destaque", hex: bbExtraction.accentColor },
                    ].filter(c => c.hex).map((c) => (
                      <div key={c.label} className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-[4px] border border-[var(--border)] shrink-0" style={{ backgroundColor: c.hex }} />
                        <span className="text-[11px] text-[var(--text-secondary)]">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                )}

                {bbExtraction.values && bbExtraction.values.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {bbExtraction.values.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--accent)] text-[var(--text-secondary)]">{v}</span>
                    ))}
                  </div>
                )}

                {bbExtraction.summary && (
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{bbExtraction.summary}</p>
                )}

                {/* ── APLICAR À FICHA ──────────────────────────────────────
                    Sem este botão a análise acima é decoração: ela some quando
                    a aba fecha. E o texto ao lado diz, ANTES do clique, que o
                    PDF não fecha a ficha — para o CEO não aplicar esperando
                    100% e receber 33%. */}
                {!bbResultado && (
                  <div className="flex items-start gap-3 pt-1">
                    <button
                      onClick={aplicarBrandBookNaFicha}
                      disabled={!linkedClientId || bbAplicando}
                      className="shrink-0 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--accent-strong,#0B3D91)] text-white disabled:opacity-50 transition-opacity"
                    >
                      {bbAplicando ? "Aplicando…" : "Aplicar à ficha de marca"}
                    </button>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {linkedClientId
                        ? "Preenche cor, tipografia, público e posicionamento. O que você já respondeu não é sobrescrito — e os campos de voz, palavras proibidas e quem aprova continuam faltando, porque não vêm de brand book nenhum."
                        : "Escolha o cliente antes de aplicar."}
                    </p>
                  </div>
                )}

                {bbResultado && (
                  <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {bbResultado.andou
                        ? `Ficha de marca: ${bbResultado.andou.de} → ${bbResultado.andou.para} de ${bbResultado.andou.total} campos.`
                        : "Nada foi aplicado."}
                    </p>
                    {bbResultado.aplicados.length > 0 && (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Aplicados: {bbResultado.aplicados.map((a) => a.rotulo).join(" · ")}
                      </p>
                    )}
                    {bbResultado.naoTocados.length > 0 && (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Não tocados (você já tinha respondido): {bbResultado.naoTocados.map((n) => n.rotulo).join(" · ")}
                      </p>
                    )}
                    {/* A parte que a tela NÃO pode omitir. */}
                    <div className="pt-1 border-t border-[var(--border)]">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)] mt-2">
                        O brand book não fecha a ficha — faltam {bbResultado.aindaFalta.total - bbResultado.aindaFalta.definidos} campo(s), e eles são decisão sua:
                      </p>
                      <ul className="mt-1 space-y-1">
                        {bbResultado.foraDoAlcance.map((f) => (
                          <li key={f.campo} className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            <span className="text-[var(--text-secondary)]">{f.rotulo}</span> — {f.porque}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
          {/* ── LEFT: Setup ── */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Configuração do Relatório</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Selecione um cliente para analisar o Brand Brain e gerar o relatório de saúde de marca.</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Client selector */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Cliente <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={linkedClientId ?? ""}
                  onChange={(e) => { setLinkedClientId(e.target.value || null); setAnalysis(null); setSaved(false); setSaveSkipped(false); setAgentState("idle"); }}
                  disabled={agentState === "generating"}
                  className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:bg-white transition-colors disabled:opacity-50"
                >
                  <option value="">— selecione um cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Brain status */}
              {linkedClient && (
                <div className={`rounded-[8px] border px-3 py-2.5 ${brandBrainReadiness < 5 ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#E6FBFA] border-[#FDBA74]"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color: ACCENT }}>●</span>
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                        {brandBrainReadiness < 5 ? "Brand Brain incompleto" : "Brand Brain ativo"}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#E6FBFA", color: ACCENT }}>
                      {brandBrainReadiness}/13
                    </span>
                  </div>
                  {brandBrainReadiness < 5 ? (
                    <p className="text-[11px] text-[var(--warning)] leading-snug">Brand Brain incompleto — a análise usará os campos disponíveis. Complete o Brand Brain para um relatório mais preciso.</p>
                  ) : (
                    <div className="space-y-0.5 mt-1">
                      {linkedClient.brandBrain?.positioning && (
                        <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">Posição</span><span className="text-[11px] text-[var(--text-primary)] truncate">{linkedClient.brandBrain.positioning.slice(0, 60)}…</span></div>
                      )}
                      {linkedClient.brandBrain?.toneOfVoice && (
                        <div className="flex gap-2"><span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">Tom</span><span className="text-[11px] text-[var(--text-primary)] truncate">{linkedClient.brandBrain.toneOfVoice.slice(0, 60)}…</span></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Client context */}
              {linkedClient && (
                <div className="rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-3 space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0">Segmento</span>
                    <span className="text-[11px] text-[var(--text-primary)]">{linkedClient.industry}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0">Projetos</span>
                    <span className="text-[11px] text-[var(--text-primary)]">{clientProjects.length} ativo(s)</span>
                  </div>
                  {clientProjects.length === 0 && (
                    <p className="text-[11px] text-[var(--warning)] mt-1">Sem projetos — a entrega não poderá ser salva.</p>
                  )}
                </div>
              )}

              {/* What gets generated */}
              {linkedClient && (
                <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
                  <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.05em] mb-2">Será gerado</p>
                  <ul className="space-y-1">
                    {["Nota de saúde da marca", "Pontos fortes identificados", "Lacunas e gaps", "Sugestões concretas", "Alertas de consistência", "Avaliação do tom de voz"].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
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
                  {!linkedClient ? "Selecione um cliente para começar" : "Gerar Relatório de Saúde de Marca"}
                </button>
              )}
              {agentState === "generating" && (
                <button disabled className="w-full h-9 rounded-[7px] text-[13px] font-medium text-white opacity-70 cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: ACCENT }}>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando…
                </button>
              )}
              {agentState === "output_ready" && (
                <button onClick={handleReset} className="w-full h-9 rounded-[7px] text-[13px] font-medium bg-transparent border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] transition-all">
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Output ── */}

          {/* Idle — no client */}
          {agentState === "idle" && !linkedClient && (
            <div className="bg-white rounded-[10px] border border-dashed border-[var(--border)] px-8 py-16 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke={ACCENT} strokeWidth="1.8" />
                  <path d="M7 10c0-1.65 1.35-3 3-3s3 1.35 3 3-1.35 3-3 3" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="1.2" fill={ACCENT} />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Departamento de Marca</p>
              <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto">Selecione um cliente para analisar o Brand Brain e gerar um relatório completo de saúde de marca.</p>
            </div>
          )}

          {/* Idle — ready */}
          {agentState === "idle" && linkedClient && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-14 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: "#E6FBFA" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="8" stroke={ACCENT} strokeWidth="1.8" />
                  <path d="M8 11c0-1.65 1.35-3 3-3s3 1.35 3 3-1.35 3-3 3" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="11" cy="11" r="1.4" fill={ACCENT} />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">Pronto para analisar</p>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                {linkedClient.name} · {linkedClient.industry}. O Brand Hub Agent vai analisar o Brand Brain e gerar um relatório completo de saúde de marca.
              </p>
            </div>
          )}

          {/* Generating */}
          {agentState === "generating" && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-8 py-12">
              <div className="max-w-md mx-auto space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIndex ? "opacity-100" : "opacity-30"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < stepIndex ? "bg-[var(--success-bg)]" : i === stepIndex ? "" : "bg-[var(--accent)]"}`} style={i === stepIndex ? { backgroundColor: "#E6FBFA" } : {}}>
                      {i < stepIndex ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : i === stepIndex ? (
                        <span className="w-2.5 h-2.5 border-2 rounded-full animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                      )}
                    </span>
                    <span className={`text-[13px] ${i <= stepIndex ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output ready */}
          {agentState === "output_ready" && analysis && (
            <div className="space-y-4">
              {motivoDaReserva && (
                <AvisoModoAlternativo oQue="Análise de marca" motivo={motivoDaReserva} />
              )}

              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-[8px] p-1 overflow-x-auto">
                {OUTPUT_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`h-7 px-3 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg)]"}`}
                    style={activeTab === t.id ? { backgroundColor: ACCENT } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {activeTab === "overview" && (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-5 space-y-5">
                  <HealthBadge score={analysis.healthScore} label={analysis.healthLabel} />
                  <div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Resumo da Marca</div>
                    <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{analysis.summary}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Avaliação do Tom de Voz</div>
                    <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{analysis.toneAssessment}</p>
                  </div>
                  {analysis.consistencyAlerts.length > 0 && (
                    <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                      <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Alertas de Consistência</div>
                      <ul className="space-y-1">
                        {analysis.consistencyAlerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--warning)]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" />{a}
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
                  <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-[0.05em] mb-3">Pontos Fortes da Marca</div>
                  <ul className="space-y-2">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-[3px] shrink-0">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-7" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                        <span className="text-[13px] text-[var(--text-primary)] leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {activeTab === "gaps" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-[10px] border border-[#FECACA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    <div className="text-[11px] font-semibold text-[var(--danger)] uppercase tracking-[0.05em] mb-3">Lacunas Identificadas</div>
                    <ul className="space-y-2">
                      {analysis.gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
                          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />{g}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {analysis.consistencyAlerts.length > 0 && (
                    <div className="bg-white rounded-[10px] border border-[#FDE68A] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                      <div className="text-[11px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-2">Alertas de Consistência</div>
                      <ul className="space-y-1.5">
                        {analysis.consistencyAlerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" />{a}
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
                    <div key={i} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-3 flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-px text-white" style={{ backgroundColor: ACCENT }}>{i + 1}</span>
                      <span className="text-[13px] text-[var(--text-primary)] leading-snug">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Save footer */}
              <div className="flex items-center justify-between bg-[var(--bg)] rounded-[12px] border border-[var(--border)] px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Salvar relatório como entrega revisável</p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {clientProjects.length > 0
                      ? `Será salvo no projeto: ${clientProjects[0].name}`
                      : "Nenhum projeto ativo — não é possível salvar."}
                  </p>
                </div>
                {saved ? (
                  <span className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[var(--success-bg)] text-[var(--success)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Salvo no projeto
                  </span>
                ) : saveSkipped ? (
                  <span className="text-[12px] text-[var(--text-muted)] italic">Nenhum projeto disponível</span>
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
