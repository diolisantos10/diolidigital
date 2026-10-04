"use client";

// O painel "Falta para publicar" (CEO, 04/10/2026): o que impede ESTE cliente
// de publicar hoje, item por item, cada um com o botão que resolve. A regra
// mora no servidor (`lib/agency/esteira/falta-para-publicar.ts`); aqui só se
// desenha o que ele mediu.

import { useEffect, useState } from "react";

interface Item {
  chave: string;
  rotulo: string;
  pronto: boolean;
  detalhe: string;
  quemResolve: "equipe" | "ceo" | "control_room";
  acao: { rotulo: string; destino: string } | null;
}

const QUEM: Record<Item["quemResolve"], string> = {
  equipe: "Equipe, pela tela",
  ceo: "Diego (CEO)",
  control_room: "Control Room",
};

export default function FaltaParaPublicar({ clientId }: { clientId: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [resumo, setResumo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/agency/clients/${clientId}/falta-para-publicar`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { itens?: Item[]; resumo?: string; error?: string };
        if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
        setItens(j.itens ?? []);
        setResumo(j.resumo ?? "");
      })
      .catch(() => setErro("Não consegui medir o que falta para publicar."));
  }, [clientId]);

  return (
    <section id="falta-para-publicar" className="rounded-[12px] border border-[var(--border)] bg-white p-5">
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Falta para publicar</h2>
      {erro ? (
        <p className="mt-2 text-[12px] text-[var(--warning)]">{erro}</p>
      ) : !itens ? (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">Medindo…</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{resumo}</p>
          <ul className="mt-3 space-y-2">
            {itens.map((i) => (
              <li
                key={i.chave}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--bg)] px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 basis-[240px]">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                    <span aria-hidden className={i.pronto ? "text-[var(--success)]" : "text-[var(--warning)]"}>
                      {i.pronto ? "✓" : "●"}
                    </span>
                    {i.rotulo}
                    <span className="sr-only">{i.pronto ? "pronto" : "falta"}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">{i.detalhe}</span>
                  {!i.pronto && <span className="block text-[11px] text-[var(--text-muted)]">Quem resolve: {QUEM[i.quemResolve]}</span>}
                </span>
                {!i.pronto && i.acao && (
                  <a
                    href={i.acao.destino}
                    className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-white sm:w-auto"
                  >
                    {i.acao.rotulo}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
