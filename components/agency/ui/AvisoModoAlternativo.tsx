"use client";

// ─── AvisoModoAlternativo ─────────────────────────────────────────────────────
//
// O banner de "isto NÃO saiu da IA".
//
// Quando uma geração por IA falha, as telas de agente caem num gerador por
// regras (mock). Até 05/08/2026, cinco delas caíam **em silêncio** — só um
// `console.warn`, que ninguém lê — e entregavam o texto de reserva com a mesma
// cara do resultado real. É o pior defeito de confiança do produto: o CEO abre
// a tela na frente do cliente e apresenta como raciocínio da IA algo que é uma
// tabela de regras.
//
// §7.3 do DESIGN.md: "se uma geração por IA falhar e cair em conteúdo de
// fallback/regras, avise o usuário — nunca faça passar por resultado real".
// O molde saiu do `operations-agent`, a única tela que já fazia certo.
//
// Uso:
//   {usouReserva && <AvisoModoAlternativo oQue="Diagnóstico" motivo={erroDaIa} />}
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

export default function AvisoModoAlternativo({
  oQue,
  motivo,
  className = "",
}: {
  /** O que foi gerado — "Diagnóstico", "Plano de campanha", "Roteiro"… */
  oQue: string;
  /** Motivo técnico, quando existir. Fica como detalhe, nunca como manchete. */
  motivo?: string | null;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`rounded-[8px] bg-[var(--warning-bg)] border border-[#FDE68A] px-4 py-2.5 flex items-start gap-2 ${className}`}
    >
      <span aria-hidden className="text-[14px] leading-none mt-0.5">⚠️</span>
      <div className="min-w-0">
        <p className="text-[12px] text-[#92400E] leading-snug">
          {oQue} gerado em <strong>modo alternativo</strong> — por regras, sem IA.
          Revise antes de mostrar ao cliente. Conecte um provedor em{" "}
          <Link href="/agency/integrations" className="underline font-medium">
            Integrações
          </Link>{" "}
          para o raciocínio real.
        </p>
        {motivo && (
          <p className="text-[11px] text-[#92400E]/80 leading-snug mt-1 break-words">
            Motivo: {motivo}
          </p>
        )}
      </div>
    </div>
  );
}
