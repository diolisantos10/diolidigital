"use client";

// DetalheDaPeca — o post aberto como o cliente vai vê-lo no ar.
//
// Pedido literal do CEO (04/08/2026): o cliente não aprova texto — aprova A
// IMAGEM e A LEGENDA, "exatamente igual ao da Meta". Ao tocar num post do
// calendário, este overlay abre a peça inteira: o carrossel navegável tela a
// tela (swipe no celular, setas no desktop, indicador de posição estilo
// Instagram), a legenda completa e os metadados que situam a peça (formato,
// pilar, data, estado).
//
// O carrossel (`CarrosselDeTelas`) é exportado separado porque a MESMA
// experiência aparece no card de aprovação (AprovacoesDoCliente) — dois lugares,
// um componente, zero deriva.

import { useCallback, useEffect, useRef, useState } from "react";
import { urlDeMidiaDoPortal } from "@/lib/agency/portal/midia";
import { proporcaoDaPeca } from "@/lib/agency/portal/proporcao-da-peca";

export interface PecaAberta {
  id: string;
  caption: string;
  format: string;
  pillar: string | null;
  scheduledFor: string | null;
  /** A capa (mediaUrl) — usada sozinha quando não há telas. */
  capa: string | null;
  /** Todas as telas do carrossel, na ordem de publicação. */
  telas: string[];
}

export function rotuloDeFormatoDaPeca(f: string): string {
  if (f === "carousel" || f === "carrossel") return "Carrossel";
  if (f === "reel" || f === "video") return "Reels";
  if (f === "story") return "Story";
  if (f === "arquivo") return "Arquivo";
  return "Feed";
}

function dataLegivel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

// ── O carrossel navegável ────────────────────────────────────────────────────

export function CarrosselDeTelas({
  telas,
  token,
  alt,
  format,
}: {
  /** URLs /api/media/… na ordem de publicação (≥ 1). */
  telas: string[];
  /** Vazio em modo cookie — a credencial não entra no DOM (A4). */
  token: string;
  alt: string;
  /**
   * O `SocialPost.format` da peça — é ele que dá a PROPORÇÃO do quadro.
   *
   * Sem isto, o cartão mostrava tudo em `aspect-square object-cover`: um Story
   * (1080×1920) perdia ~44% da altura, e o que sumia era o topo e a base — o
   * TÍTULO e a ASSINATURA DA MARCA. O cliente aprovava uma peça vendo uma
   * versão dela que a casa nunca publicaria.
   */
  format?: string | null;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);

  // A posição vem do scroll REAL: o swipe do dedo e o clique na seta terminam
  // no mesmo lugar, então o indicador nunca mente.
  const aoRolar = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    setAtual(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  function irPara(i: number) {
    const el = trilho.current;
    if (!el) return;
    const alvo = Math.max(0, Math.min(telas.length - 1, i));
    el.scrollTo({ left: alvo * el.clientWidth, behavior: "smooth" });
  }

  const varias = telas.length > 1;

  return (
    <div className="relative">
      <div
        ref={trilho}
        onScroll={aoRolar}
        className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar rounded-none"
        style={{ scrollbarWidth: "none" }}
        aria-roledescription="carrossel"
        aria-label={`${alt} — ${telas.length} ${telas.length === 1 ? "tela" : "telas"}`}
      >
        {telas.map((t, i) => (
          <div key={i} className="w-full shrink-0 snap-center bg-[var(--accent)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlDeMidiaDoPortal(t, token) ?? undefined}
              alt={`${alt} — tela ${i + 1} de ${telas.length}`}
              loading={i === 0 ? "eager" : "lazy"}
              className={`${proporcaoDaPeca(format)} w-full object-cover`}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {varias && (
        <>
          {/* Contador estilo Instagram — some quando só há uma tela */}
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[rgba(7,10,31,0.65)] px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {atual + 1}/{telas.length}
          </span>

          <button
            type="button"
            onClick={() => irPara(atual - 1)}
            disabled={atual === 0}
            aria-label="Tela anterior"
            style={{ touchAction: "manipulation" }}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[15px] text-[var(--text-primary)] shadow-sm transition-opacity disabled:opacity-0"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => irPara(atual + 1)}
            disabled={atual === telas.length - 1}
            aria-label="Próxima tela"
            style={{ touchAction: "manipulation" }}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[15px] text-[var(--text-primary)] shadow-sm transition-opacity disabled:opacity-0"
          >
            ›
          </button>

          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {telas.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => irPara(i)}
                aria-label={`Ir para a tela ${i + 1}`}
                aria-current={i === atual ? "true" : undefined}
                style={{ touchAction: "manipulation" }}
                className={`h-1.5 rounded-full transition-all ${
                  i === atual ? "w-4 bg-white" : "w-1.5 bg-white/55"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── O overlay ────────────────────────────────────────────────────────────────

export function DetalheDaPeca({
  peca,
  token,
  estado,
  onFechar,
}: {
  peca: PecaAberta;
  token: string;
  /** O selo de estado já na língua do cliente (mesma fonte do calendário). */
  estado?: { texto: string; fundo: string; cor: string } | null;
  onFechar: () => void;
}) {
  const fechar = useRef<HTMLButtonElement>(null);

  // ESC fecha; o scroll do fundo trava enquanto o overlay está aberto; o foco
  // entra no diálogo (Tab não continua navegando a página coberta).
  useEffect(() => {
    fechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [onFechar]);

  const telas = peca.telas.length > 0 ? peca.telas : peca.capa ? [peca.capa] : [];
  const data = dataLegivel(peca.scheduledFor);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Peça: ${rotuloDeFormatoDaPeca(peca.format)}${data ? ` de ${data}` : ""}`}
    >
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onFechar}
        className="absolute inset-0 bg-[rgba(7,10,31,0.62)] backdrop-blur-[2px]"
      />

      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-white shadow-[0_24px_60px_rgba(7,10,31,0.35)] sm:max-w-[440px] sm:rounded-[16px]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-[6px] bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              {rotuloDeFormatoDaPeca(peca.format)}
            </span>
            {data && (
              <span className="truncate text-[12px] text-[var(--text-secondary)]">{data}</span>
            )}
          </div>
          <button
            ref={fechar}
            type="button"
            onClick={onFechar}
            aria-label="Fechar peça"
            style={{ touchAction: "manipulation" }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto">
          {telas.length > 0 ? (
            <CarrosselDeTelas telas={telas} token={token} alt={rotuloDeFormatoDaPeca(peca.format)} format={peca.format} />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-[var(--accent)] px-6 text-center">
              <span className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                A arte desta peça ainda está em produção — a legenda já está pronta abaixo.
              </span>
            </div>
          )}

          <div className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {estado && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: estado.fundo, color: estado.cor }}
                >
                  {estado.texto}
                </span>
              )}
              {peca.pillar && (
                <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  {peca.pillar}
                </span>
              )}
            </div>

            {peca.caption ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text-primary)]">
                {peca.caption}
              </p>
            ) : (
              <p className="text-[13px] italic text-[var(--text-muted)]">Legenda em produção.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
