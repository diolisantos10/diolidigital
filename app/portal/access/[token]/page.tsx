"use client";

// ── Client Portal — the agency ↔ client communication room ──────────────────
// A premium, branded, mobile-first space where the client sees results, tracks
// delivery, approves materials, connects their tools (Drive, Meta, Analytics…),
// and talks to the team. Token-authenticated (no login), personalised with the
// client's business name under the Dioli brand.

import { use, useCallback, useEffect, useState } from "react";
import { ChatDrawer } from "@/components/agency/portal/FloatingChat";

// ── Types ────────────────────────────────────────────────────────────────────

interface PipelineStep {
  id: string;
  departmentKey: string;
  department: string;
  approvedAt: string;
  version: number;
}
interface PortalApproval {
  id: string;
  department: string;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
}
interface DeptContent { label: string; headline: string | null; bullets: string[]; approvedAt: string | null }
interface PortalData {
  id: string | null;
  businessName: string;
  status: string;
  segment?: string;
  targetAudience?: string;
  socialPlatforms?: string[];
  services: string[];
  objectives: string[];
  departments?: Record<string, DeptContent>;
  createdAt: string | null;
  pipeline: PipelineStep[];
  approvals: PortalApproval[];
}

interface PortalPost {
  id: string;
  caption: string;
  networks: string[];
  format: string;
  pillar: string | null;
  mediaUrl: string | null;
  scheduledFor: string | null;
  status: string;
}

type SectionId = string;

// A contracted service → its dedicated tab. Matches on keywords in the service
// label, maps to the department canvas that feeds its content, and defines the
// service-specific metric tiles (live once the client connects the accounts).
interface ServiceTab {
  id: string; label: string; icon: string; match: RegExp; deptKey: string;
  metrics: { label: string; hint: string }[];
  planTitle: string;
}
const SERVICE_TABS: ServiceTab[] = [
  {
    id: "social", label: "Social Media", icon: "◆", match: /social|redes|instagram|conte[úu]do/i, deptKey: "social",
    metrics: [
      { label: "Alcance", hint: "Conecte o Instagram" },
      { label: "Seguidores", hint: "Conecte o Instagram" },
      { label: "Engajamento", hint: "Conecte o Instagram" },
      { label: "Stories/sem", hint: "Conecte o Instagram" },
    ],
    planTitle: "Seu plano de conteúdo",
  },
  {
    id: "traffic", label: "Tráfego Pago", icon: "▲", match: /tr[áa]fego|ads|an[úu]ncio|m[íi]dia\s*paga/i, deptKey: "traffic",
    metrics: [
      { label: "Investimento", hint: "Conecte o Meta Ads" },
      { label: "Cliques", hint: "Conecte o Meta Ads" },
      { label: "Conversões", hint: "Conecte o Meta/Analytics" },
      { label: "CTR", hint: "Conecte o Meta Ads" },
    ],
    planTitle: "Sua estratégia de anúncios",
  },
  {
    id: "design", label: "Identidade Visual", icon: "✦", match: /identidade|design|marca|logo|visual/i, deptKey: "design",
    metrics: [],
    planTitle: "Direção visual da sua marca",
  },
];

// ── Token sanitiser (paste artifacts) ────────────────────────────────────────

function sanitizePortalToken(raw: string): string {
  let t = raw.trim().replace(/^`+|`+$/g, "").trim();
  t = t.replace(/\.+$/, "");
  return t;
}

// ── Config ───────────────────────────────────────────────────────────────────

const DEPT_ORDER = ["strategy", "social", "design", "traffic", "analytics", "quality"];
const DEPT_NAMES: Record<string, string> = {
  strategy: "Estratégia", social: "Social Media", design: "Design",
  traffic: "Tráfego Pago", analytics: "Analytics", quality: "Revisão de Qualidade",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Recebido", waiting_strategy: "Diagnóstico estratégico",
  waiting_social: "Planejamento de conteúdo", waiting_design: "Desenvolvimento visual",
  waiting_traffic: "Configuração de tráfego", waiting_analytics: "Configuração de analytics",
  waiting_quality: "Revisão final", in_progress: "Em execução", completed: "Concluído",
};
const ACTION_LABEL: Record<string, string> = {
  approve: "Aprovar", request_revision: "Pedir revisão", reject: "Rejeitar",
};

// Marketing-agency integrations the client connects so the agency can pull data
// and materials. `href` opens the OAuth flow when configured; otherwise the card
// shows a "em breve" state. Google sign-in already exists, so Drive is first.
const INTEGRATIONS: {
  key: string; name: string; desc: string; category: string; color: string; initials: string; href?: string;
}[] = [
  { key: "gdrive",    name: "Google Drive",     desc: "Repositório de fotos, vídeos e materiais", category: "Arquivos", color: "#1FA463", initials: "GD" },
  { key: "onedrive",  name: "OneDrive",         desc: "Alternativa de repositório (Microsoft)", category: "Arquivos", color: "#0364B8", initials: "OD" },
  { key: "instagram", name: "Instagram",        desc: "Alcance, seguidores e engajamento", category: "Social", color: "#E1306C", initials: "IG" },
  { key: "facebook",  name: "Facebook",         desc: "Página, alcance e engajamento", category: "Social", color: "#1877F2", initials: "FB" },
  { key: "tiktok",    name: "TikTok",           desc: "Visualizações, seguidores e engajamento", category: "Social", color: "#010101", initials: "TT" },
  { key: "linkedin",  name: "LinkedIn",         desc: "Página da empresa e engajamento B2B", category: "Social", color: "#0A66C2", initials: "IN" },
  { key: "youtube",   name: "YouTube",          desc: "Inscritos, visualizações e retenção", category: "Social", color: "#FF0000", initials: "YT" },
  { key: "pinterest", name: "Pinterest",        desc: "Pins, alcance e tráfego", category: "Social", color: "#E60023", initials: "PT" },
  { key: "meta",      name: "Meta Business",    desc: "Facebook + Instagram Ads e páginas", category: "Tráfego", color: "#0668E1", initials: "MB" },
  { key: "gads",      name: "Google Ads",       desc: "Campanhas e desempenho de anúncios", category: "Tráfego", color: "#4285F4", initials: "GA" },
  { key: "tiktokads", name: "TikTok Ads",       desc: "Campanhas de mídia no TikTok", category: "Tráfego", color: "#010101", initials: "TA" },
  { key: "ganalytics",name: "Google Analytics", desc: "Tráfego e conversões do site", category: "Analytics", color: "#E8710A", initials: "GA" },
];

// Visual metadata for every social network the client might run — so a
// contracted platform always renders with its colour/initials, ready to connect.
const PLATFORM_META: Record<string, { label: string; color: string; initials: string }> = {
  instagram: { label: "Instagram", color: "#E1306C", initials: "IG" },
  facebook:  { label: "Facebook",  color: "#1877F2", initials: "FB" },
  tiktok:    { label: "TikTok",    color: "#010101", initials: "TT" },
  linkedin:  { label: "LinkedIn",  color: "#0A66C2", initials: "IN" },
  youtube:   { label: "YouTube",   color: "#FF0000", initials: "YT" },
  pinterest: { label: "Pinterest", color: "#E60023", initials: "PT" },
  twitter:   { label: "X (Twitter)", color: "#111", initials: "X" },
  threads:   { label: "Threads",   color: "#111", initials: "@" },
};
const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function platformMeta(name: string) {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  for (const k of Object.keys(PLATFORM_META)) if (key.includes(k)) return PLATFORM_META[k];
  return { label: name, color: "#6B6B65", initials: name.slice(0, 2).toUpperCase() };
}

// ── Brand mark ───────────────────────────────────────────────────────────────

function DioliMark({ light = true }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-[7px]"
            style={{ background: light ? "rgba(154,245,240,0.15)" : "#070A1F" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="3.4" stroke={light ? "#9AF5F0" : "#fff"} strokeWidth="1.4" />
          <circle cx="6" cy="6" r="1" fill={light ? "#9AF5F0" : "#fff"} />
        </svg>
      </span>
      <span className="text-[14px] font-bold tracking-tight" style={{ color: light ? "#fff" : "#070A1F" }}>
        Dioli<span style={{ color: "#9AF5F0" }}>Digital</span>
      </span>
    </div>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────────────

function MetricTile({ label, value, hint, locked }: { label: string; value: string; hint?: string; locked?: boolean }) {
  return (
    <div className="bg-white rounded-[14px] border border-[#ECEBE7] px-4 py-3.5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tabular-nums ${locked ? "text-[#D0D0CC]" : "text-[#1A1A1A]"}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-[#B7B7B1] mt-0.5">{hint}</div>}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  const token = sanitizePortalToken(rawToken);

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("overview");

  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [posts, setPosts] = useState<PortalPost[]>([]);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/brain/portal-data?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.reason === "expired" ? "expired" : json.reason === "revoked" ? "revoked" : "invalid");
        return;
      }
      setData(await res.json());
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Editorial calendar — the posts the agency programmed for this client.
  // Read-only here; the agency edits them in the Planner.
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`/api/social-posts?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const json = await res.json();
          setPosts(Array.isArray(json.posts) ? json.posts : []);
        }
      } catch { /* portal still works without the calendar */ }
    })();
  }, [token]);

  async function handleDecision(approvalId: string, action: "approve" | "request_revision" | "reject") {
    if (submitting) return;
    setSubmitting(approvalId);
    setActionError(null);
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, approvalRequestId: approvalId, action, comment: comments[approvalId]?.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `Falha HTTP ${res.status}`);
      }
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Erro ao registrar decisão.");
    } finally {
      setSubmitting(null);
    }
  }

  // ── Error / loading gates ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#E5E5E2] border-t-[#070A1F] animate-spin" />
          <p className="text-[13px] text-[#9B9B95]">Abrindo seu portal…</p>
        </div>
      </div>
    );
  }
  if (error || !data) {
    const messages: Record<string, { title: string; body: string }> = {
      expired: { title: "Link expirado", body: "Este link de acesso expirou. Solicite um novo à equipe Dioli." },
      revoked: { title: "Acesso revogado", body: "Este link foi desativado. Entre em contato com a equipe Dioli." },
      invalid: { title: "Link inválido", body: "Este link não é válido. Verifique o link recebido ou solicite um novo." },
      network: { title: "Erro de conexão", body: "Não foi possível verificar o acesso. Tente novamente em instantes." },
    };
    const msg = messages[error ?? "invalid"] ?? messages.invalid;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F7] px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mx-auto mb-4 text-xl">⚠</div>
          <h1 className="text-[18px] font-semibold text-[#1A1A1A] mb-2">{msg.title}</h1>
          <p className="text-[13px] text-[#6B6B65] leading-relaxed">{msg.body}</p>
        </div>
      </div>
    );
  }

  const completedDepts = new Set(data.pipeline.map((p) => p.departmentKey));
  const currentStatus = STATUS_LABEL[data.status] ?? data.status;
  const progress = Math.round((completedDepts.size / DEPT_ORDER.length) * 100);
  const pendingApprovals = data.approvals.filter((a) => a.status === "pending");
  const allComments = data.approvals.flatMap((a) => a.comments);

  // A dedicated tab for each contracted service, in order, deduped.
  const activeServiceTabs = SERVICE_TABS.filter((t) => data.services.some((s) => t.match.test(s)));
  const seenSvc = new Set<string>();
  const serviceTabs = activeServiceTabs.filter((t) => (seenSvc.has(t.id) ? false : (seenSvc.add(t.id), true)));
  const navTabs = [
    { id: "overview", label: "Visão Geral", icon: "◎" },
    ...serviceTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
    { id: "approvals", label: "Aprovações", icon: "✓" },
    { id: "materials", label: "Materiais", icon: "↑" },
    { id: "integrations", label: "Integrações", icon: "⚡" },
  ];

  // ── Shell ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Branded header */}
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0B0F2A 0%, #070A1F 55%, #0A0E24 100%)" }}>
        <div className="absolute inset-0 opacity-[0.15]" style={{ background: "radial-gradient(600px 200px at 80% -20%, #9AF5F0, transparent)" }} />
        <div className="relative max-w-[860px] mx-auto px-5 pt-5 pb-16 sm:pb-20">
          <div className="flex items-center justify-between">
            <DioliMark />
            <span className="text-[11px] font-medium text-white/45">Portal do Cliente</span>
          </div>
          <div className="mt-7 sm:mt-9 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold"
                    style={{ background: "rgba(154,245,240,0.12)", color: "#9AF5F0" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#9AF5F0] animate-pulse" /> {currentStatus}
              </span>
              <h1 className="text-[26px] sm:text-[32px] font-bold text-white mt-2.5 tracking-tight leading-tight truncate">
                {data.businessName}
              </h1>
              <p className="text-[13px] text-white/55 mt-1">Sua central de projeto com a Dioli — resultados, aprovações e comunicação num só lugar.</p>
            </div>
            {/* Single chat entry — talk to the team by text, voice or attachment */}
            <button
              onClick={() => setChatOpen(true)}
              aria-label="Falar com a equipe"
              style={{ touchAction: "manipulation", background: "rgba(154,245,240,0.14)", border: "1px solid rgba(154,245,240,0.22)" }}
              className="shrink-0 inline-flex items-center gap-2 h-11 pl-3.5 pr-4 rounded-full text-white font-semibold text-[13px] transition-transform hover:scale-[1.03]"
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-3.5 3V14H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#9AF5F0" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:block">Falar com a equipe</span>
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            </button>
          </div>
        </div>
      </header>

      {/* Section nav (sticky, mobile-scrollable) */}
      <div className="sticky top-0 z-20 bg-[#FAF9F7]/90 backdrop-blur border-b border-[#ECEBE7] -mt-10 sm:-mt-12">
        <div className="max-w-[860px] mx-auto px-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2.5">
            {navTabs.map((s) => {
              const active = section === s.id;
              const badge = s.id === "approvals" ? pendingApprovals.length : 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 h-9 px-3.5 rounded-[9px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                    active ? "bg-[#070A1F] text-white shadow-[0_2px_8px_rgba(7,10,31,0.2)]" : "text-[#6B6B65] hover:bg-[#F0EFEB]"
                  }`}
                  style={{ touchAction: "manipulation" }}
                >
                  <span className={active ? "text-[#9AF5F0]" : "text-[#B7B7B1]"}>{s.icon}</span>
                  {s.label}
                  {badge > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold bg-[#F59E0B] text-white">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-[860px] mx-auto px-4 sm:px-5 py-6 pb-24">

        {/* ── VISÃO GERAL ── */}
        {section === "overview" && (
          <div className="space-y-6">
            {/* Results */}
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[14px] font-bold text-[#1A1A1A]">Seus resultados</h2>
                <button onClick={() => setSection("integrations")} className="text-[11px] font-semibold text-[#12B5AC] hover:underline">
                  Conectar contas →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <MetricTile label="Alcance" value="—" hint="Conecte o Instagram" locked />
                <MetricTile label="Seguidores" value="—" hint="Conecte o Instagram" locked />
                <MetricTile label="Engajamento" value="—" hint="Conecte o Instagram" locked />
                <MetricTile label="Progresso" value={`${progress}%`} hint={`${completedDepts.size}/${DEPT_ORDER.length} etapas`} />
              </div>
              <div className="mt-2.5 bg-gradient-to-r from-[#E6FBFA] to-[#F0FDFC] border border-[#C7EFEC] rounded-[12px] px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-[12px] text-[#0E5F5A] leading-snug">
                  <span className="font-semibold">Veja seus números em tempo real.</span> Conecte suas redes e o Analytics para acompanhar alcance, engajamento e conversões aqui.
                </p>
                <button onClick={() => setSection("integrations")} className="shrink-0 h-8 px-3 rounded-[8px] bg-[#0E5F5A] text-white text-[12px] font-semibold hover:bg-[#0B4E4A] transition-colors">
                  Conectar
                </button>
              </div>
            </section>

            {/* Delivery pipeline */}
            <section className="bg-white rounded-[14px] border border-[#ECEBE7] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-bold text-[#1A1A1A]">Andamento da entrega</h2>
                <span className="text-[12px] font-semibold text-[#12B5AC] tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#F0EFEB] overflow-hidden mb-4">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#12B5AC,#9AF5F0)" }} />
              </div>
              <div className="space-y-2.5">
                {DEPT_ORDER.map((key, idx) => {
                  const step = data.pipeline.find((p) => p.departmentKey === key);
                  const done = completedDepts.has(key);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${done ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0EFEB] text-[#B7B7B1]"}`}>
                        {done ? "✓" : idx + 1}
                      </div>
                      <span className={`text-[13px] ${done ? "text-[#1A1A1A] font-medium" : "text-[#9B9B95]"}`}>{DEPT_NAMES[key] ?? key}</span>
                      {step?.approvedAt && <span className="ml-auto text-[11px] text-[#B7B7B1]">{new Date(step.approvedAt).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Services */}
            {data.services.length > 0 && (
              <section>
                <h2 className="text-[14px] font-bold text-[#1A1A1A] mb-2.5">Serviços contratados</h2>
                <div className="flex flex-wrap gap-2">
                  {data.services.map((s, i) => (
                    <span key={i} className="h-8 px-3.5 rounded-[9px] bg-white border border-[#ECEBE7] text-[#1A1A1A] text-[12px] font-medium flex items-center shadow-[0_1px_2px_rgba(7,10,31,0.03)]">{s}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Sobre o negócio — o que a Dioli entendeu do cliente */}
            {(data.segment || data.targetAudience || data.objectives.length > 0) && (
              <section className="bg-white rounded-[14px] border border-[#ECEBE7] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <h2 className="text-[14px] font-bold text-[#1A1A1A] mb-3">Sobre o seu negócio</h2>
                <div className="space-y-3">
                  {data.segment && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Segmento</div>
                      <p className="text-[13px] text-[#1A1A1A] mt-0.5">{data.segment}</p>
                    </div>
                  )}
                  {data.targetAudience && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Público-alvo</div>
                      <p className="text-[13px] text-[#1A1A1A] mt-0.5">{data.targetAudience}</p>
                    </div>
                  )}
                  {data.objectives.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Objetivos</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {data.objectives.map((o, i) => (
                          <span key={i} className="h-7 px-3 rounded-full bg-[#F0EFEB] text-[#3A3A38] text-[11px] font-medium flex items-center">{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {pendingApprovals.length > 0 && (
              <button onClick={() => setSection("approvals")} className="w-full bg-[#FFFBEB] border border-[#FCE7A0] rounded-[12px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#FEF9E0] transition-colors">
                <div>
                  <p className="text-[13px] font-semibold text-[#9B7B2D]">{pendingApprovals.length} {pendingApprovals.length === 1 ? "item aguarda" : "itens aguardam"} sua aprovação</p>
                  <p className="text-[11px] text-[#B08D3E] mt-0.5">Toque para revisar e aprovar</p>
                </div>
                <span className="text-[#9B7B2D] text-[18px]">→</span>
              </button>
            )}
          </div>
        )}

        {/* ── ABAS POR SERVIÇO (dinâmicas) ── */}
        {serviceTabs.map((tab) => {
          if (section !== tab.id) return null;
          const dept = data.departments?.[tab.deptKey];
          return (
            <div key={tab.id} className="space-y-6">
              <div>
                <h2 className="text-[18px] font-bold text-[#1A1A1A]">{tab.label}</h2>
                <p className="text-[13px] text-[#6B6B65] mt-0.5">Métricas, plano e entregas de {tab.label.toLowerCase()} num só lugar.</p>
              </div>

              {tab.metrics.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[14px] font-bold text-[#1A1A1A]">Resultados</h3>
                    <button onClick={() => setSection("integrations")} className="text-[11px] font-semibold text-[#12B5AC] hover:underline">Conectar contas →</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {tab.metrics.map((m) => <MetricTile key={m.label} label={m.label} value="—" hint={m.hint} locked />)}
                  </div>
                </section>
              )}

              {/* Contracted networks — each ready to connect (Social tab) */}
              {tab.id === "social" && (data.socialPlatforms?.length ?? 0) > 0 && (
                <section>
                  <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-2.5">Suas redes</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {data.socialPlatforms!.map((p) => {
                      const m = platformMeta(p);
                      return (
                        <div key={p} className="bg-white rounded-[12px] border border-[#ECEBE7] px-3.5 py-3 flex items-center gap-2.5 shadow-[0_1px_2px_rgba(7,10,31,0.03)]">
                          <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: m.color }}>{m.initials}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{m.label}</p>
                            <button onClick={() => setSection("integrations")} className="text-[11px] font-medium text-[#12B5AC] hover:underline">Conectar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Editorial calendar — what's coming up (Social tab) */}
              {tab.id === "social" && (
                <section>
                  <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-2.5">Calendário editorial</h3>
                  {posts.length === 0 ? (
                    <div className="bg-white rounded-[12px] border border-[#ECEBE7] px-4 py-6 text-center">
                      <p className="text-[13px] text-[#9B9B95]">Seu calendário está sendo montado — em breve você verá aqui os posts programados.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...posts]
                        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))
                        .slice(0, 12)
                        .map((p) => (
                          <div key={p.id} className="bg-white rounded-[12px] border border-[#ECEBE7] px-3.5 py-3 flex items-center gap-3 shadow-[0_1px_2px_rgba(7,10,31,0.03)]">
                            <div className="w-[46px] shrink-0 text-center">
                              {p.scheduledFor ? (
                                <>
                                  <div className="text-[15px] font-bold text-[#1A1A1A] leading-none">{new Date(p.scheduledFor).getDate()}</div>
                                  <div className="text-[9px] uppercase text-[#9B9B95] mt-0.5">{PT_MONTHS[new Date(p.scheduledFor).getMonth()]}</div>
                                </>
                              ) : <div className="text-[11px] text-[#C7C7C0]">—</div>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-[#1A1A1A] truncate">{p.caption || <span className="italic text-[#9B9B95]">Conteúdo programado</span>}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[11px] text-[#9B9B95] capitalize">{p.format}</span>
                                {p.pillar && <><span className="text-[#D7D7D2]">·</span><span className="text-[11px] text-[#9B9B95]">{p.pillar}</span></>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {p.networks.slice(0, 4).map((n) => {
                                const m = platformMeta(n);
                                return <span key={n} className="w-[18px] h-[18px] rounded-full text-white text-[8px] font-bold flex items-center justify-center" style={{ background: m.color }} title={m.label}>{m.initials}</span>;
                              })}
                            </div>
                            <span className="shrink-0 h-[20px] px-2 rounded-full text-[10px] font-semibold flex items-center"
                                  style={p.status === "published" ? { background: "#DCFCE7", color: "#16A34A" } : { background: "#DBEAFE", color: "#1D4ED8" }}>
                              {p.status === "published" ? "Publicado" : "Programado"}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              )}

              <section className="bg-white rounded-[14px] border border-[#ECEBE7] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-[14px] font-bold text-[#1A1A1A]">{tab.planTitle}</h3>
                  {dept && <span className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold flex items-center">✓ Aprovado</span>}
                </div>
                {dept && (dept.headline || dept.bullets.length > 0) ? (
                  <>
                    {dept.headline && <p className="text-[13px] text-[#3A3A38] leading-relaxed mb-2">{dept.headline}</p>}
                    {dept.bullets.length > 0 && (
                      <ul className="space-y-1.5">
                        {dept.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-[#6B6B65]"><span className="text-[#12B5AC] mt-0.5 shrink-0">•</span>{b}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-[#9B9B95]">A equipe está preparando seu plano de {tab.label.toLowerCase()} — em breve aparece aqui.</p>
                )}
              </section>

              {tab.metrics.length > 0 && (
                <div className="bg-gradient-to-r from-[#E6FBFA] to-[#F0FDFC] border border-[#C7EFEC] rounded-[12px] px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] text-[#0E5F5A] leading-snug"><span className="font-semibold">Quer ver seus números aqui?</span> Conecte suas contas e acompanhe {tab.label.toLowerCase()} em tempo real.</p>
                  <button onClick={() => setSection("integrations")} className="shrink-0 h-8 px-3 rounded-[8px] bg-[#0E5F5A] text-white text-[12px] font-semibold hover:bg-[#0B4E4A] transition-colors">Conectar</button>
                </div>
              )}
            </div>
          );
        })}

        {/* ── APROVAÇÕES ── */}
        {section === "approvals" && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-bold text-[#1A1A1A]">Aprovações</h2>
            {pendingApprovals.length === 0 ? (
              <div className="bg-white rounded-[14px] border border-[#ECEBE7] p-8 text-center">
                <div className="w-11 h-11 rounded-full bg-[#DCFCE7] text-[#16A34A] text-xl flex items-center justify-center mx-auto mb-3">✓</div>
                <p className="text-[14px] font-semibold text-[#1A1A1A]">Tudo aprovado</p>
                <p className="text-[12px] text-[#9B9B95] mt-1">Nenhum material aguardando sua revisão no momento.</p>
              </div>
            ) : (
              pendingApprovals.map((ap) => (
                <div key={ap.id} className="bg-white rounded-[14px] border border-[#E5C76B] p-4 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#9B7B2D] text-[10px] font-bold uppercase tracking-[0.04em]">Aguardando você</span>
                    <p className="text-[14px] font-semibold text-[#1A1A1A]">{ap.department}</p>
                  </div>
                  <textarea
                    value={comments[ap.id] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [ap.id]: e.target.value }))}
                    placeholder="Comentário (opcional)…"
                    rows={2}
                    className="w-full px-3 py-2 text-[13px] bg-[#FAF9F7] border border-[#E5E5E2] rounded-[9px] outline-none focus:border-[#9B7B2D] resize-none mb-2.5"
                    style={{ fontSize: "16px" }}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "request_revision", "reject"] as const).map((action) => (
                      <button
                        key={action}
                        disabled={submitting === ap.id}
                        onClick={() => void handleDecision(ap.id, action)}
                        style={{ touchAction: "manipulation" }}
                        className={`h-9 px-4 rounded-[8px] text-[13px] font-semibold transition-opacity disabled:opacity-50 ${
                          action === "approve" ? "bg-[#16A34A] text-white hover:opacity-90"
                          : action === "request_revision" ? "bg-[#F0F0ED] text-[#1A1A1A] hover:bg-[#E5E5E2]"
                          : "bg-white border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]"}`}
                      >
                        {submitting === ap.id ? "Enviando…" : ACTION_LABEL[action]}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
            {actionError && <p className="text-[12px] text-[#DC2626]">{actionError}</p>}

            {allComments.length > 0 && (
              <div className="bg-white rounded-[14px] border border-[#ECEBE7] p-5">
                <h3 className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Histórico da equipe</h3>
                <div className="space-y-3">
                  {allComments.map((c) => (
                    <div key={c.id} className="border-l-2 border-[#E5E5E2] pl-3">
                      <p className="text-[12px] font-semibold text-[#1A1A1A]">{c.authorName}</p>
                      <p className="text-[12px] text-[#6B6B65] mt-0.5">{c.body}</p>
                      <p className="text-[10px] text-[#B7B7B1] mt-1">{new Date(c.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MATERIAIS ── */}
        {section === "materials" && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-bold text-[#1A1A1A]">Materiais</h2>
            <p className="text-[13px] text-[#6B6B65] -mt-1">O que a equipe precisa de você para avançar. A forma mais fácil é conectar seu Google Drive — a gente acessa a pasta e você não precisa reenviar nada.</p>
            <div className="bg-white rounded-[14px] border border-[#ECEBE7] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-[13px] font-bold shrink-0" style={{ background: "#1FA463" }}>GD</span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[#1A1A1A]">Conecte seu Google Drive</p>
                  <p className="text-[12px] text-[#6B6B65] mt-0.5 leading-snug">Crie uma pasta "Dioli Digital" e conecte aqui. A equipe acessa fotos, vídeos e documentos direto — sem uploads manuais.</p>
                  <button onClick={() => setSection("integrations")} className="mt-2.5 h-9 px-4 rounded-[8px] bg-[#070A1F] text-white text-[13px] font-semibold hover:bg-[#0D1230] transition-colors">
                    Conectar Drive →
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[14px] border border-[#ECEBE7] p-5">
              <h3 className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Enviar por link</h3>
              <p className="text-[12px] text-[#6B6B65]">Prefere mandar um link (WeTransfer, Drive, Dropbox)? <button onClick={() => setChatOpen(true)} className="text-[#12B5AC] font-semibold hover:underline">Fale com a equipe</button> e anexe o link direto no chat.</p>
            </div>
          </div>
        )}

        {/* ── INTEGRAÇÕES ── */}
        {section === "integrations" && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-bold text-[#1A1A1A]">Integrações</h2>
            <p className="text-[13px] text-[#6B6B65] -mt-1">Conecte suas contas para a Dioli acessar materiais e trazer seus resultados em tempo real para este portal. Você controla o acesso e pode revogar quando quiser.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {INTEGRATIONS.map((it) => (
                <div key={it.key} className="bg-white rounded-[14px] border border-[#ECEBE7] p-4 shadow-[0_1px_3px_rgba(7,10,31,0.04)] flex items-start gap-3">
                  <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-[12px] font-bold shrink-0" style={{ background: it.color }}>{it.initials}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#1A1A1A]">{it.name}</p>
                      <span className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] bg-[#F0EFEB] rounded px-1.5 py-0.5">{it.category}</span>
                    </div>
                    <p className="text-[12px] text-[#6B6B65] mt-0.5 leading-snug">{it.desc}</p>
                    <button
                      disabled
                      className="mt-2.5 h-8 px-3.5 rounded-[8px] border border-[#E5E5E2] text-[#9B9B95] text-[12px] font-semibold cursor-not-allowed"
                      title="Disponível em breve"
                    >
                      Conectar · em breve
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#B7B7B1] text-center">🔒 Conexões seguras via OAuth. A Dioli nunca vê suas senhas.</p>
          </div>
        )}

      </main>

      <footer className="max-w-[860px] mx-auto px-5 pb-8 text-center">
        <p className="text-[10px] text-[#C0C0BC]">Acesso seguro via link único · Dioli Digital</p>
      </footer>

      {/* One chat entry — opened from the header button */}
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} token={token} authorName={data.businessName} />

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
