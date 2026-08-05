"use client";

// ─── useReservaDeBarra ────────────────────────────────────────────────────────
//
// Mede a barra fixa e escreve a altura REAL na variável que o layout usa para
// reservar o espaço (`--acao-altura`, ver `.acao-shell` em app/globals.css).
//
// Por que medir em vez de digitar um número: a altura da barra depende do
// conteúdo (no celular ela quebra em duas linhas, e uma mensagem de erro
// acrescenta uma terceira). Qualquer constante escrita à mão fica certa hoje e
// errada na primeira frase nova — e "errada" aqui significa a barra cobrindo o
// fim do conteúdo, que é exatamente o defeito da §6.1 do DESIGN.md.
//
// Uso:
//   const { casca, barra } = useReservaDeBarra();
//   <div ref={casca} className="acao-shell">
//     <div className="acao-reserva">…conteúdo…</div>
//     <div ref={barra} className="acao-barra fixed bottom-0 …">…</div>
//   </div>
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export function useReservaDeBarra<C extends HTMLElement, B extends HTMLElement>() {
  const casca = useRef<C | null>(null);
  const barra = useRef<B | null>(null);

  useEffect(() => {
    const alvo = barra.current;
    const dono = casca.current;
    if (!alvo || !dono) return;

    const sincronizar = () => {
      const altura = alvo.getBoundingClientRect().height;
      if (altura > 0) dono.style.setProperty("--acao-altura", `${Math.ceil(altura)}px`);
    };
    sincronizar();

    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(sincronizar);
    observador.observe(alvo);
    return () => observador.disconnect();
  });

  return { casca, barra };
}
