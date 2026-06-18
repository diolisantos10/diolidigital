"use client";

import { use, useCallback, useEffect, useState } from "react";

interface PipelineStep {
  id: string;
  departmentKey: string;
  department: string;
  approvedAt: string;
  version: number;
}

interface PortalData {
  id: string;
  businessName: string;
  status: string;
  services: string[];
  objectives: string[];
  createdAt: string;
  pipeline: PipelineStep[];
  approvals: Array<{
    id: string;
    department: string;
    status: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
  }>;
}

// Strip common copy/paste artifacts from the raw URL path segment.
// Only touches boundaries — interior of the token is never mutated.
// Handles: surrounding whitespace, leading/trailing backticks (markdown
// code-fence artifacts), and trailing periods (sentence-end paste).
function sanitizePortalToken(raw: string): string {
  let t = raw.trim().replace(/^`+|`+$/g, "").trim();
  t = t.replace(/\.+$/, "");
  return t;
}

const DEPT_ORDER = ["strategy", "social", "design", "traffic", "analytics", "quality"];

const STATUS_LABEL: Record<string, string> = {
  new:               "Recebido",
  waiting_strategy:  "Diagnóstico estratégico",
  waiting_social:    "Planejamento de conteúdo",
  waiting_design:    "Desenvolvimento visual",
  waiting_traffic:   "Configuração de tráfego",
  waiting_analytics: "Configuração de analytics",
  waiting_quality:   "Revisão final de qualidade",
  in_progress:       "Em execução",
  completed:         "Concluído",
};

const ACTION_LABEL: Record<string, string> = {
  approve:          "Aprovar",
  request_revision: "Pedir revisão",
  reject:           "Rejeitar",
};

export default function PortalAccessTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  const token = sanitizePortalToken(rawToken);
  const [data,    setData]    = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // Client decision state — per-approval comment drafts + submit status.
  const [comments,   setComments]   = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone,  setActionDone]  = useState<string | null>(null);

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

  async function handleDecision(approvalId: string, action: "approve" | "request_revision" | "reject") {
    if (submitting) return;
    setSubmitting(approvalId);
    setActionError(null);
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          approvalRequestId: approvalId,
          action,
          comment: comments[approvalId]?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `Falha HTTP ${res.status}`);
      }
      setActionDone(approvalId);
      setComments((c) => ({ ...c, [approvalId]: "" }));
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F7]">
        <div className="w-5 h-5 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    const messages: Record<string, { title: string; body: string }> = {
      expired:  { title: "Link expirado",       body: "Este link de acesso expirou. Solicite um novo link à equipe Dioli." },
      revoked:  { title: "Acesso revogado",      body: "Este link foi desativado. Entre em contato com a equipe Dioli." },
      invalid:  { title: "Link inválido",        body: "Este link não é válido. Verifique o link recebido ou solicite um novo." },
      network:  { title: "Erro de conexão",      body: "Não foi possível verificar o acesso. Tente novamente em instantes." },
    };
    const msg = messages[error ?? "invalid"] ?? messages.invalid;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F7] px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mx-auto mb-4 text-xl">
            ⚠
          </div>
          <h1 className="text-[18px] font-semibold text-[#1A1A1A] mb-2">{msg.title}</h1>
          <p className="text-[13px] text-[#6B6B65] leading-relaxed">{msg.body}</p>
        </div>
      </div>
    );
  }

  const completedDepts = new Set(data.pipeline.map((p) => p.departmentKey));
  const currentStatus = STATUS_LABEL[data.status] ?? data.status;

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <div className="max-w-[600px] mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">
              Dioli Digital
            </span>
          </div>
          <h1 className="text-[22px] font-semibold text-[#1A1A1A]">{data.businessName}</h1>
          <p className="text-[13px] text-[#6B6B65] mt-1">{currentStatus}</p>
        </div>

        {/* Services */}
        {data.services.length > 0 && (
          <div className="mb-6 bg-white border border-[#E5E5E2] rounded-[12px] p-4">
            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
              Serviços contratados
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.services.map((s, i) => (
                <span key={i} className="h-6 px-2.5 rounded-full bg-[#F0F0ED] text-[#1A1A1A] text-[11px] font-medium flex items-center">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline */}
        <div className="mb-6 bg-white border border-[#E5E5E2] rounded-[12px] p-4">
          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">
            Pipeline de entrega
          </p>
          <div className="space-y-2.5">
            {DEPT_ORDER.map((key, idx) => {
              const step = data.pipeline.find((p) => p.departmentKey === key);
              const done = completedDepts.has(key);
              const deptName = step?.department ?? {
                strategy: "Estratégia", social: "Social Media", design: "Design",
                traffic: "Tráfego Pago", analytics: "Analytics", quality: "Revisão de Qualidade",
              }[key] ?? key;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    done ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
                  }`}>
                    {done ? "✓" : idx + 1}
                  </div>
                  <span className={`text-[13px] ${done ? "text-[#1A1A1A] font-medium" : "text-[#9B9B95]"}`}>
                    {deptName}
                  </span>
                  {step?.approvedAt && (
                    <span className="ml-auto text-[11px] text-[#9B9B95]">
                      {new Date(step.approvedAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending approvals — the client decides here */}
        {data.approvals.some((ap) => ap.status === "pending") && (
          <div className="mb-6 bg-white border border-[#E5C76B] rounded-[12px] p-4">
            <p className="text-[11px] font-semibold text-[#9B7B2D] uppercase tracking-[0.05em] mb-3">
              Aguardando sua aprovação
            </p>
            <div className="space-y-4">
              {data.approvals.filter((ap) => ap.status === "pending").map((ap) => (
                <div key={ap.id} className="border border-[#EFE8D0] rounded-[10px] p-3.5">
                  <p className="text-[13px] font-medium text-[#1A1A1A] mb-2">{ap.department}</p>
                  <textarea
                    value={comments[ap.id] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [ap.id]: e.target.value }))}
                    placeholder="Comentário (opcional)…"
                    rows={2}
                    className="w-full px-3 py-2 text-[12px] bg-[#FAF9F7] border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#9B7B2D] resize-none mb-2.5"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "request_revision", "reject"] as const).map((action) => (
                      <button
                        key={action}
                        disabled={submitting === ap.id}
                        onClick={() => void handleDecision(ap.id, action)}
                        className={`h-8 px-3.5 rounded-[7px] text-[12px] font-medium transition-opacity disabled:opacity-50 ${
                          action === "approve"
                            ? "bg-[#16A34A] text-white hover:opacity-90"
                            : action === "request_revision"
                              ? "bg-[#F0F0ED] text-[#1A1A1A] hover:bg-[#E5E5E2]"
                              : "bg-white border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]"
                        }`}
                      >
                        {submitting === ap.id ? "Enviando…" : ACTION_LABEL[action]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {actionError && (
              <p className="text-[12px] text-[#DC2626] mt-3">{actionError}</p>
            )}
          </div>
        )}

        {actionDone && !data.approvals.some((ap) => ap.id === actionDone && ap.status === "pending") && (
          <div className="mb-6 bg-[#DCFCE7] border border-[#BBF7D0] rounded-[12px] px-4 py-3">
            <p className="text-[12px] font-medium text-[#15803D]">
              ✓ Decisão registrada — a equipe Dioli foi notificada.
            </p>
          </div>
        )}

        {/* Client-visible approvals / comments */}
        {data.approvals.length > 0 && (
          <div className="bg-white border border-[#E5E5E2] rounded-[12px] p-4">
            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">
              Atualizações da equipe
            </p>
            <div className="space-y-3">
              {data.approvals.flatMap((ap) =>
                ap.comments.map((c) => (
                  <div key={c.id} className="border-l-2 border-[#E5E5E2] pl-3">
                    <p className="text-[12px] font-medium text-[#1A1A1A]">{c.authorName}</p>
                    <p className="text-[12px] text-[#6B6B65] mt-0.5">{c.body}</p>
                    <p className="text-[10px] text-[#9B9B95] mt-1">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-[#C0C0BC] mt-8">
          Acesso seguro via link único · Dioli Digital
        </p>
      </div>
    </div>
  );
}
