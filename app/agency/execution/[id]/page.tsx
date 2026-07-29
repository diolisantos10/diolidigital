"use client";

// DB-backed project execution view. The destination after a scope is approved:
// shows the project, the work each department generated automatically, and the
// task breakdown — all read from the database (not the Zustand store), so a
// freshly-created DB project renders correctly instead of 404ing.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { PortalChat } from "@/components/agency/portal/PortalChat";

interface DeptWork {
  department: string;
  label: string;
  status: string;
  gate: string | null;
  approvedAt: string | null;
  headline: string | null;
  bullets: string[];
}
interface TaskRow {
  id: string; title: string; description: string | null; status: string; agentId: string | null;
}
interface ExecutionData {
  project: { id: string; name: string; goal: string | null; stage: string; clientName: string | null; createdAt: string };
  tasks: TaskRow[];
  departments: DeptWork[];
  clientRequestId?: string;
}

const GATE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  PASS:    { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "PASS" },
  WARNING: { bg: "bg-[var(--warning-bg)]", text: "text-[var(--warning)]", label: "WARNING" },
  FAIL:    { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "FAIL" },
  BLOCKED: { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "BLOCKED" },
};

const TASK_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:     { bg: "bg-[var(--accent)]", text: "text-[var(--text-muted)]", label: "A fazer" },
  in_progress: { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]", label: "Em andamento" },
  done:        { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "Concluída" },
  blocked:     { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "Bloqueada" },
};

export default function ProjectExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ExecutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}/execution`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "Projeto não encontrado." : "Erro ao carregar o projeto.");
          return;
        }
        const json = (await res.json()) as ExecutionData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Erro de conexão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const doneTasks = data?.tasks.filter((t) => t.status === "done").length ?? 0;
  const totalTasks = data?.tasks.length ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg, #F5F5F3)" }}>
      <div className="px-8 py-8 space-y-6 max-w-[920px] mx-auto pb-24">
        <AgencyHeader
          title={data?.project.name ?? "Projeto"}
          eyebrow={data?.project.clientName ?? undefined}
          subtitle={data?.project.goal ?? "Execução do projeto"}
          actions={
            <Link
              href="/agency/requests"
              className="h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] text-[13px] font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              ← Solicitações
            </Link>
          }
        />

        {loading && (
          <div className="text-center py-24 text-[13px] text-[var(--text-muted)]">Carregando projeto…</div>
        )}

        {!loading && error && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[12px] px-6 py-5">
            <p className="text-[14px] font-semibold text-[#991B1B]">{error}</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-[var(--border)] rounded-[12px] px-4 py-3">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Estágio</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)] mt-0.5 capitalize">{data.project.stage}</div>
              </div>
              <div className="bg-white border border-[var(--border)] rounded-[12px] px-4 py-3">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Departamentos</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)] mt-0.5">{data.departments.length} entregues</div>
              </div>
              <div className="bg-white border border-[var(--border)] rounded-[12px] px-4 py-3">
                <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Tarefas</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)] mt-0.5">{doneTasks}/{totalTasks} concluídas</div>
              </div>
            </div>

            {/* Department work — what the agents generated */}
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Trabalho dos departamentos</h2>
              {data.departments.length === 0 ? (
                <div className="bg-white border border-[var(--border)] rounded-[12px] px-5 py-6 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">Os canvases dos departamentos ainda não foram gerados para este projeto.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.departments.map((d) => {
                    const gate = d.gate ? GATE_STYLE[d.gate.toUpperCase()] : null;
                    return (
                      <div key={d.department} className="bg-white border border-[var(--border)] rounded-[12px] p-5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-[14px] font-semibold text-[var(--text-primary)]">{d.label}</span>
                            {gate && (
                              <span className={`h-5 px-2 rounded-full text-[10px] font-bold flex items-center ${gate.bg} ${gate.text}`}>
                                {gate.label}
                              </span>
                            )}
                          </div>
                          <span className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-semibold flex items-center">
                            ✓ Aprovado
                          </span>
                        </div>
                        {d.headline && (
                          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-2">{d.headline}</p>
                        )}
                        {d.bullets.length > 0 && (
                          <ul className="space-y-1">
                            {d.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                                <span className="text-[var(--navy)] mt-0.5 shrink-0">•</span>
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tasks */}
            {data.tasks.length > 0 && (
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Tarefas do projeto</h2>
                <div className="bg-white border border-[var(--border)] rounded-[12px] divide-y divide-[var(--border)]">
                  {data.tasks.map((t) => {
                    const st = TASK_STATUS_STYLE[t.status] ?? TASK_STATUS_STYLE.pending;
                    return (
                      <div key={t.id} className="flex items-start gap-3 px-5 py-3">
                        <span className={`h-5 px-2 rounded-full text-[10px] font-semibold flex items-center shrink-0 mt-0.5 ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[var(--text-primary)]">{t.title}</p>
                          {t.description && <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{t.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversation with the client */}
            {data.clientRequestId && (
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Conversa com o cliente</h2>
                <PortalChat clientRequestId={data.clientRequestId} height={300} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
