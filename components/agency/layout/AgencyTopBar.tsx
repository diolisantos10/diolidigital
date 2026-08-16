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
//
// ─── 16/08/2026 — A SUPERFÍCIE SÓ APARECE QUANDO TEM O QUE COBRIR ─────────────
//
// Medido a 375px, LOGADO, em 4 rotas do painel (`/agency/dashboard`, `/clients`,
// `/leads`, `/pipeline`), lendo o pixel em x=340:
//
//     y0–50  rgb(247,248,250)   ← a barra
//     y51    rgb(230,233,238)   ← a borda
//     y52–68 rgb(247,248,250)   ← o respiro
//
// **A barra tinha exatamente a cor do fundo da página** (`--bg` nos dois lados).
// Ela nunca leu como "cabeçalho": leu como 68px de página vazia cortada por um
// risco solto — 11% de uma tela de 600px, em TODA rota do painel, para carregar
// um botão de 36px e o logo. Foi isso que o CEO chamou de "faixa branca no topo
// atrapalhando toda a interface".
//
// O conserto NÃO é apagar a barra: sem ela o celular perde a única entrada da
// navegação, e o botão solto traz de volta o defeito do texto cortado. É fazer a
// superfície custar o que ela vale:
//
//  1. altura passa a ser a do botão (44px, não 52px) e o respiro encolhe;
//  2. **fundo e borda só existem quando há conteúdo passando por baixo.** Em
//     `scrollY === 0` não há o que cobrir — a barra fica transparente e o risco
//     some. Ao primeiro pixel rolado a superfície opaca volta INTEIRA, que é
//     exatamente o instante em que ela foi criada para proteger.
//
// A propriedade que produziu este componente continua de pé, e é ela que o teste
// trava: rolando, o conteúdo NUNCA encosta em pixel transparente.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { DioliLogo } from "@/components/brand/DioliLogo";

/** A superfície da barra, isolada do React para ter as duas metades no teste.
 *
 *  `rolado === true`  → há conteúdo passando por baixo: fundo OPACO + borda.
 *                       É a propriedade que fez esta barra existir.
 *  `rolado === false` → não há o que cobrir: transparente e sem borda.
 *
 *  ⚠️ A reserva de espaço (`.agency-conteudo`) **não** depende disto — ela é
 *  CSS e vale sempre. É por isso que ficar transparente no topo não traz de
 *  volta o texto cortado: em `scrollY === 0` não existe conteúdo sob a barra. */
export function superficieDaBarra(rolado: boolean): string {
  return rolado
    ? "bg-[var(--bg)] border-b border-[var(--border)]"
    : "bg-transparent border-b border-transparent";
}

export function AgencyTopBar({
  aberto,
  navId,
  onAbrir,
}: {
  aberto: boolean;
  navId: string;
  onAbrir: () => void;
}) {
  // `rolado` é o que decide se a superfície existe. Começa em `false` e é
  // conferido no primeiro efeito — navegação que restaura a posição de rolagem
  // monta a barra já com conteúdo por baixo, e nesse caso ela tem de nascer
  // opaca.
  const [rolado, setRolado] = useState(false);

  useEffect(() => {
    const medir = () => setRolado(window.scrollY > 0);
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    return () => window.removeEventListener("scroll", medir);
  }, []);

  return (
    <header
      // z-20: abaixo do backdrop (z-30) e da gaveta (z-40) — abrir o menu cobre
      // a barra, como em qualquer painel com gaveta lateral.
      className={[
        "agency-barra-topo md:hidden fixed inset-x-0 top-0 z-20",
        // SEM transição de cor, e é de propósito: um fade de 150ms deixaria a
        // barra semi-transparente durante o primeiro pixel rolado — justo o
        // instante em que ela precisa cobrir. Como o fundo opaco é a MESMA cor
        // da página, a troca instantânea não pisca; o que aparece é só a borda.
        "flex items-center gap-2 px-3",
        superficieDaBarra(rolado),
      ].join(" ")}
      // O teste lê isto em vez de reimplementar a regra do scroll.
      data-rolado={rolado ? "true" : "false"}
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
