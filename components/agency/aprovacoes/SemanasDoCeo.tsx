"use client";

// SEMANAS PARA O CEO APROVAR — no topo de Aprovações (bloco B, 04/10/2026).
//
// O Diego aprova pelo celular. Antes: 7 toques por marca, saindo do menu
// (menu → Agenda geral → "Aprovar semana" → lista → marca → Aprovar →
// Confirmar), e nada avisava que havia semana esperando. Agora: menu →
// Aprovações → "Aprovar semana" → "Confirmar" = 4 toques, e a marca já vem
// escolhida, com o número de peças.
//
// Quem grava é o mesmo `POST /api/social-posts/aprovacao-ceo` de sempre: ele
// reconfere o modo da marca e as peças na hora. Nada novo aprova nada.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Semana { clientId: string; nome: string; de: string; ate: string; pecas: number }
type Estado = "parado" | "confirmando" | "gravando" | { ok: string } | { erro: string };

const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** `aoContar`: a página soma no "N aguardando" do topo — sem isso o topo
 *  diria "tudo em dia" com uma semana esperando logo abaixo. */
export function SemanasDoCeo({ aoContar }: { aoContar?: (n: number) => void } = {}) {
  const [semanas, setSemanas] = useState<Semana[] | null>(null);
  const [estado, setEstado] = useState<Record<string, Estado>>({});

  const ler = useCallback(() => {
    fetch("/api/agency/aprovacoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { semanas?: Semana[] } | null) => { const l = d?.semanas ?? []; setSemanas(l); aoContar?.(l.length); })
      .catch(() => setSemanas([]));
  }, [aoContar]);
  useEffect(() => { ler(); }, [ler]);

  const aprovar = async (s: Semana) => {
    setEstado((e) => ({ ...e, [s.clientId]: "gravando" }));
    const r = await fetch("/api/social-posts/aprovacao-ceo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: s.clientId, de: s.de, ate: s.ate }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { aprovados?: number; agendados?: number; error?: string } | null;
    if (!r?.ok) {
      setEstado((e) => ({ ...e, [s.clientId]: { erro: d?.error ?? "Não deu para aprovar agora. Tente de novo." } }));
      return;
    }
    setEstado((e) => ({ ...e, [s.clientId]: { ok: `Aprovada: ${d?.aprovados ?? 0} peça(s), ${d?.agendados ?? 0} agendada(s).` } }));
  };

  if (!semanas || semanas.length === 0) return null;

  return (
    <section aria-label="Semanas para você aprovar">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-[var(--warning)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Semanas para você aprovar
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">{semanas.length}</span>
      </div>
      <div className="space-y-3">
        {semanas.map((s) => {
          const e = estado[s.clientId] ?? "parado";
          return (
            <div key={s.clientId} className="bg-white border border-[var(--border)] rounded-[10px] p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{s.nome}</div>
                  <div className="text-[13px] text-[var(--text-secondary)]">
                    {s.pecas} peça{s.pecas !== 1 ? "s" : ""} · semana de {curta(s.de)} a {curta(s.ate)}
                  </div>
                </div>
                {typeof e === "object" && "ok" in e ? (
                  <div className="text-[13px] font-medium text-[var(--success)]">✓ {e.ok}</div>
                ) : (
                  <div className="flex gap-2">
                    <Link
                      href="/agency/planner"
                      className="h-11 px-4 inline-flex items-center justify-center rounded-[8px] border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] flex-1 sm:flex-none"
                    >
                      Ver peças
                    </Link>
                    {e === "parado" || (typeof e === "object" && "erro" in e) ? (
                      <button
                        onClick={() => setEstado((x) => ({ ...x, [s.clientId]: "confirmando" }))}
                        style={{ touchAction: "manipulation" }}
                        className="h-11 px-4 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-semibold flex-1 sm:flex-none"
                      >
                        Aprovar semana
                      </button>
                    ) : (
                      <button
                        onClick={() => void aprovar(s)}
                        disabled={e === "gravando"}
                        style={{ touchAction: "manipulation" }}
                        className="h-11 px-4 rounded-[8px] bg-[var(--success)] text-white text-[13px] font-semibold flex-1 sm:flex-none disabled:opacity-60"
                      >
                        {e === "gravando" ? "Aprovando…" : `Confirmar ${s.pecas}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {e === "confirmando" && (
                <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                  Aprovar agenda a publicação das {s.pecas} peças nas datas do calendário.
                </p>
              )}
              {typeof e === "object" && "erro" in e && (
                <p className="mt-2 text-[12px] text-[var(--danger)]">{e.erro}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
