"use client";

/**
 * ─── A TELA QUE APARECE QUANDO UMA TELA QUEBRA ──────────────────────────────
 *
 * Até 06/08/2026 este arquivo NÃO EXISTIA em lugar nenhum do `app/`. A
 * consequência é a que o CEO viu: um `TypeError` num único componente da página
 * de Integrações (`PLATFORM_META["user"]` → `undefined.emoji`) fazia o React
 * desmontar a árvore inteira e entregar uma **página em branco**, sem uma
 * palavra explicando o que houve nem um caminho de volta. O navegador dele
 * mostrou "This page couldn't load".
 *
 * Consertar o `TypeError` conserta AQUELA tela. Este arquivo conserta a CLASSE
 * do problema: a partir daqui, qualquer erro de render em qualquer uma das
 * quatro superfícies vira mensagem em português, com botão de tentar de novo e
 * caminho de saída — o §7.3 do DESIGN.md, que exige tratamento de erro em toda
 * tela que depende de dados, deixa de depender de cada autor lembrar dele.
 *
 * O boundary fica na RAIZ de propósito: o defeito nasceu no painel da agência,
 * mas o portal do cliente (quem paga), o briefing público (primeira impressão)
 * e a vitrine correriam o mesmo risco. Regra da §6.1 aplicada a estado de erro:
 * quem protege é o layout, não cada componente.
 */

import { useEffect } from "react";

export default function ErroDeTela({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // O detalhe técnico vai para o console — nunca para a cara do usuário.
    console.error("[erro de tela]", error);
  }, [error]);

  const tentarDeNovo = unstable_retry ?? reset;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div
        role="alert"
        className="w-full max-w-[440px] rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--danger-bg)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 6.5v4M10 13.5h.01M10 2.5l7.5 13H2.5L10 2.5z"
              stroke="var(--danger)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="font-display mt-4 text-[18px] font-semibold text-[var(--text-primary)]">
          Esta tela não conseguiu carregar
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          O conteúdo travou no meio do caminho. Nada do seu trabalho foi perdido — o
          problema é só na exibição. Tente de novo; se insistir, avise a equipe com o
          código abaixo.
        </p>

        {error.digest && (
          <p className="mt-3 rounded-[7px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
            código {error.digest}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => tentarDeNovo?.()}
            className="h-9 rounded-[7px] bg-[var(--navy)] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tentar de novo
          </button>
          <button
            onClick={() => window.location.reload()}
            className="h-9 rounded-[7px] border border-[var(--border)] px-4 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)]"
          >
            Recarregar a página
          </button>
        </div>
      </div>
    </div>
  );
}
