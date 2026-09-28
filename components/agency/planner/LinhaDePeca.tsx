"use client";

// Uma peça em formato de linha — a vista densa (lista e painel do dia).
// Mesma linha nos dois lugares de propósito: era aqui que a deriva entrava,
// com a lista mostrando um conjunto de dados e o painel outro.
//
// "Publicar agora" (27/09/2026): a linha vira `role="button"` em vez de
// `<button>` porque agora carrega um botão de verdade dentro dela — e
// `<button>` dentro de `<button>` é HTML inválido. O contrato de teclado
// (Enter/Espaço) é feito à mão (DESIGN.md §4.3). A ESCRITA não mora aqui: quem
// grava é a tela dona da decisão, via `onPublicar` — esta linha é reusada em
// duas vistas (lista e painel do dia) e função de escrita presa ao
// componente se multiplicaria pelos dois usos (DESIGN.md §7.6).

import { useState } from "react";
import { horaDe, rotuloDeFormato } from "./tipos";
import { Miniatura, NetworkDot, StatusPill, SinalDeVisibilidade } from "./Indicadores";

export interface PecaDaLinha {
  id: string; caption: string; networks: string[]; status: string; format: string;
  pillar: string | null; mediaUrl: string | null; telas: string[];
  scheduledFor: string | null; visibility: string; clientId: string | null;
  permalink: string | null; lastError: string | null;
}

type EstagioPublicar = "idle" | "confirmando" | "publicando";

export function LinhaDePeca({
  post, subtitulo, onClick, modoSelecao, selecionado, comData, onPublicar,
}: {
  post: PecaDaLinha;
  /** Normalmente o nome do cliente. */
  subtitulo?: string;
  onClick: () => void;
  modoSelecao?: boolean;
  selecionado?: boolean;
  /** Na lista do mês mostra dia/mês; no painel de um dia só a hora. */
  comData?: boolean;
  /** Só aparece "Publicar agora" quando isto existe E o status é "scheduled". */
  onPublicar?: (postId: string) => Promise<{ ok: true } | { ok: false; motivo: string }>;
}) {
  const d = post.scheduledFor ? new Date(post.scheduledFor) : null;
  const [estagio, setEstagio] = useState<EstagioPublicar>("idle");
  const [erroPublicar, setErroPublicar] = useState<string | null>(null);

  async function confirmarPublicacao() {
    if (!onPublicar || estagio !== "confirmando") return;
    setEstagio("publicando");
    setErroPublicar(null);
    const r = await onPublicar(post.id);
    setEstagio("idle");
    if (!r.ok) setErroPublicar(r.motivo);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Só reage ao Enter/Espaço da PRÓPRIA linha — se o evento borbulhou de
        // um botão interno (ex.: "Publicar agora"), o botão já cuidou de si.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      aria-pressed={modoSelecao ? !!selecionado : undefined}
      className="w-full flex cursor-pointer items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
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

        {/* ── Publicar agora ──────────────────────────────────────────────
            Um evento de clique (mouse ou Enter/Espaço num botão) borbulha
            como "click" mesmo quando ativado pelo teclado — por isso o
            stopPropagation aqui basta para impedir que a linha inteira
            também dispare `onClick` (que abriria a peça para editar). */}
        {post.status === "scheduled" && onPublicar && (
          <div
            className="mt-2 flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {estagio === "idle" && (
              <button
                type="button"
                onClick={() => setEstagio("confirmando")}
                className="inline-flex h-11 items-center justify-center rounded-[8px] px-4 text-[12.5px] font-semibold text-white sm:h-9"
                style={{ background: "var(--primary)" }}
              >
                Publicar agora
              </button>
            )}
            {estagio === "confirmando" && (
              <>
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  Publicar agora no Instagram do cliente?
                </span>
                <button
                  type="button"
                  onClick={() => void confirmarPublicacao()}
                  className="inline-flex h-11 items-center justify-center rounded-[8px] px-4 text-[12.5px] font-semibold text-white sm:h-9"
                  style={{ background: "var(--primary)" }}
                >
                  Sim, publicar
                </button>
                <button
                  type="button"
                  onClick={() => setEstagio("idle")}
                  className="inline-flex h-11 items-center justify-center rounded-[8px] px-4 text-[12.5px] font-medium text-[var(--text-secondary)] sm:h-9"
                  style={{ border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
              </>
            )}
            {estagio === "publicando" && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex h-11 items-center rounded-[8px] px-4 text-[12.5px] font-semibold text-[var(--text-secondary)] sm:h-9"
                style={{ border: "1px solid var(--border)", opacity: 0.7 }}
              >
                Publicando…
              </span>
            )}
            {erroPublicar && (
              <p role="alert" className="w-full rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                {erroPublicar}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
