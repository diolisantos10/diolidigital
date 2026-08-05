"use client";

// Ideação de conteúdo com IA — um lote de pautas ancoradas no cliente, que a
// equipe joga direto no calendário.

import { useState } from "react";
import { CascaDeModal } from "./CascaDeModal";

export interface Idea { title: string; angle: string; format: string; pillar: string }

export function IdeasPanel({
  clientId, clientName, onClose, onPick,
}: {
  clientId: string | null;
  clientName: string;
  onClose: () => void;
  onPick: (idea: Idea) => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState("");

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social-posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ideas", clientId, brief: brief.trim() || null, count: 6 }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ? `IA: ${json.error}` : "Não foi possível gerar."); return; }
      setIdeas(Array.isArray(json.ideas) ? json.ideas : []);
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CascaDeModal titulo="✨ Ideias de conteúdo" descricao={`Para ${clientName}`} onClose={onClose}>
      <div className="space-y-4 px-5 py-4">
        <div className="flex gap-2">
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) void run(); }}
            placeholder="Direcionamento (opcional): ex. lançamento, datas comemorativas…"
            aria-label="Direcionamento para as ideias"
            className="h-9 flex-1 rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
            style={{ border: "1px solid var(--border)" }}
          />
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="h-9 shrink-0 rounded-[8px] px-4 text-[12.5px] font-semibold text-white disabled:opacity-60"
            style={{ background: "#0E5F5A" }}
          >
            {loading ? "Gerando…" : ideas.length ? "Gerar mais" : "Gerar ideias"}
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-[8px] bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        )}

        {loading && ideas.length === 0 && (
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Gerando ideias…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[74px] animate-pulse rounded-[12px] bg-[var(--accent)]" />
            ))}
          </div>
        )}

        {ideas.length === 0 && !loading && !error && (
          <div className="py-8 text-center text-[13px] text-[var(--text-muted)]">
            Toque em <span className="font-semibold text-[#0E5F5A]">Gerar ideias</span> e a IA sugere pautas específicas para este cliente.
          </div>
        )}

        <div className="space-y-2">
          {ideas.map((idea, i) => (
            <div key={i} className="rounded-[12px] border border-[var(--border)] px-3.5 py-3 transition-colors hover:border-[var(--border-strong)]">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{idea.title}</p>
                  {idea.angle && <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">{idea.angle}</p>}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="flex h-[18px] items-center rounded-full bg-[var(--accent)] px-2 text-[11px] font-medium capitalize text-[var(--text-secondary)]">{idea.format}</span>
                    {idea.pillar && <span className="flex h-[18px] items-center rounded-full bg-[var(--accent-light)] px-2 text-[11px] font-medium text-[#0E5F5A]">{idea.pillar}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick(idea)}
                  className="h-8 shrink-0 rounded-[8px] px-3 text-[12px] font-semibold text-white hover:opacity-90"
                  style={{ background: "var(--primary)" }}
                >
                  Usar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CascaDeModal>
  );
}
