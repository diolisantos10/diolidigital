"use client";

// PERGUNTAS AO CLIENTE — a tela única do que só o cliente sabe (bloco C,
// CEO 04/10/2026). Mora no topo da aba Marca, acima da ficha onde a resposta
// é digitada. Só lista FATO (preço, endereço, horário, @, cardápio): o resto
// a agência completa. "Copiar mensagem" monta o texto para a equipe mandar —
// a casa não envia nada sozinha.

import { useEffect, useState } from "react";

interface Pergunta { fato: string; rotulo: string; pergunta: string; respondida: boolean; detalhe: string }

export default function PerguntasAoCliente({ clientId }: { clientId: string }) {
  const [dados, setDados] = useState<{ perguntas: Pergunta[]; abertas: number; mensagem: string } | null>(null);
  const [erro, setErro] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch(`/api/agency/clients/${clientId}/perguntas`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDados)
      .catch(() => setErro(true));
  }, [clientId]);

  const copiar = async () => {
    if (!dados?.mensagem) return;
    await navigator.clipboard.writeText(dados.mensagem).catch(() => undefined);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <section id="perguntas-ao-cliente" className="rounded-[12px] border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Perguntas ao cliente</h2>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Só o que a agência não pode deduzir. O resto a agência completa a partir do brand book.
          </p>
        </div>
        {dados && dados.abertas > 0 && (
          <button
            type="button"
            onClick={() => void copiar()}
            style={{ touchAction: "manipulation" }}
            className="h-11 px-4 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-semibold"
          >
            {copiado ? "Copiado ✓" : `Copiar mensagem (${dados.abertas})`}
          </button>
        )}
      </div>

      {erro && <p className="mt-3 text-[12px] text-[var(--warning)]">Não deu para medir as perguntas agora.</p>}
      {!erro && !dados && <p className="mt-3 text-[12px] text-[var(--text-muted)]">Medindo…</p>}
      {dados && dados.abertas === 0 && (
        <p className="mt-3 text-[13px] text-[var(--success)]">Nada para perguntar: os cinco fatos estão na ficha.</p>
      )}
      {dados && dados.abertas > 0 && (
        <ul className="mt-3 space-y-2">
          {dados.perguntas.map((p) => (
            <li key={p.fato} className="rounded-[8px] bg-[var(--bg)] px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                <span aria-hidden className={p.respondida ? "text-[var(--success)]" : "text-[var(--warning)]"}>
                  {p.respondida ? "✓" : "?"}
                </span>
                {p.rotulo}
                <span className="sr-only">{p.respondida ? "respondida" : "falta"}</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">
                {p.respondida ? p.detalhe : p.pergunta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
