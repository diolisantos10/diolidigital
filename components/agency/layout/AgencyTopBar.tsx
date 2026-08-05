"use client";

// ─── AgencyTopBar — a navegação fixa do painel no celular ─────────────────────
//
// Substitui o botão flutuante que existia aqui (`MobileMenuButton`: 32×32 navy
// colado em `top-3.5 left-4`). O problema não era o botão estar fixo — era ele
// ser SOLTO: um quadrado opaco de 32px sobre uma área que rola cobre um PEDAÇO
// da linha, e a palavra sai cortada ("econciliar telas dos carrosséis").
//
// Barra de largura total resolve por forma: o conteúdo passa por trás de uma
// superfície opaca inteira e o olho lê "cabeçalho", não "defeito". A altura e a
// safe-area vêm de `.agency-barra-topo` (app/globals.css) — as MESMAS variáveis
// que `.agency-conteudo` usa para reservar o espaço. Ver DESIGN.md §6.1.
// ─────────────────────────────────────────────────────────────────────────────

import { DioliLogo } from "@/components/brand/DioliLogo";

export function AgencyTopBar({
  aberto,
  navId,
  onAbrir,
}: {
  aberto: boolean;
  navId: string;
  onAbrir: () => void;
}) {
  return (
    <header
      // z-20: abaixo do backdrop (z-30) e da gaveta (z-40) — abrir o menu cobre
      // a barra, como em qualquer painel com gaveta lateral.
      className="agency-barra-topo md:hidden fixed inset-x-0 top-0 z-20 flex items-center gap-2 px-3 bg-[var(--bg)] border-b border-[var(--border)]"
    >
      <button
        onClick={onAbrir}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        aria-controls={navId}
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[7px] text-[var(--text-primary)] hover:bg-[var(--accent)] transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <DioliLogo variant="full" tone="dark" markSize={18} />
    </header>
  );
}
