"use client";

// Uma peça em formato de linha — a vista densa (lista e painel do dia).
// Mesma linha nos dois lugares de propósito: era aqui que a deriva entrava,
// com a lista mostrando um conjunto de dados e o painel outro.

import { horaDe, rotuloDeFormato } from "./tipos";
import { Miniatura, NetworkDot, StatusPill, SinalDeVisibilidade } from "./Indicadores";

export interface PecaDaLinha {
  id: string; caption: string; networks: string[]; status: string; format: string;
  pillar: string | null; mediaUrl: string | null; telas: string[];
  scheduledFor: string | null; visibility: string; clientId: string | null;
  permalink: string | null; lastError: string | null;
}

export function LinhaDePeca({
  post, subtitulo, onClick, modoSelecao, selecionado, comData,
}: {
  post: PecaDaLinha;
  /** Normalmente o nome do cliente. */
  subtitulo?: string;
  onClick: () => void;
  modoSelecao?: boolean;
  selecionado?: boolean;
  /** Na lista do mês mostra dia/mês; no painel de um dia só a hora. */
  comData?: boolean;
}) {
  const d = post.scheduledFor ? new Date(post.scheduledFor) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={modoSelecao ? !!selecionado : undefined}
      className="w-full flex items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
      style={{ background: selecionado ? "var(--accent-light)" : undefined }}
    >
      {modoSelecao && (
        <span
          className="mt-1 shrink-0 w-4 h-4 rounded-[4px] flex items-center justify-center text-[10px] text-white"
          style={{
            background: selecionado ? "var(--navy)" : "var(--card)",
            border: "1px solid var(--border-strong)",
          }}
          aria-hidden="true"
        >
          {selecionado ? "✓" : ""}
        </span>
      )}

      {comData && (
        <div className="w-[38px] shrink-0 text-center">
          <div className="text-[16px] font-bold leading-none text-[var(--text-primary)]">
            {d ? d.getDate() : "—"}
          </div>
          <div className="mt-0.5 text-[11px] uppercase text-[var(--text-muted)]">
            {d ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") : ""}
          </div>
        </div>
      )}

      <Miniatura src={post.mediaUrl} tamanho={48} formato={post.format} telas={post.telas.length} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[var(--text-primary)] line-clamp-2">
            {post.caption || <span className="italic text-[var(--text-muted)]">Sem legenda</span>}
          </p>
          <StatusPill status={post.status} sm />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {post.scheduledFor && (
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{horaDe(post.scheduledFor)}</span>
          )}
          <span className="text-[11px] text-[var(--text-muted)]">{rotuloDeFormato(post.format)}</span>
          {subtitulo && (
            <>
              <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">{subtitulo}</span>
            </>
          )}
          <span className="flex items-center gap-1">
            {post.networks.map((n) => <NetworkDot key={n} id={n} sm />)}
          </span>
          <SinalDeVisibilidade visibility={post.visibility} comTexto />
        </div>
        {post.lastError && (
          <p className="mt-1 line-clamp-2 rounded-[6px] bg-[var(--danger-bg)] px-2 py-1 text-[11px] text-[var(--danger)]">
            Falha na publicação: {post.lastError}
          </p>
        )}
      </div>
    </button>
  );
}
