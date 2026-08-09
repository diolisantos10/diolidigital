"use client";

// A FICHA DE MARCA na ficha do cliente.
//
// Pedido do CEO em 09/08/2026: *"em cada ficha do cliente precisa ter uma aba
// dedicada exclusivamente para Branding, com todos os campos preenchidos sobre
// branding avançado."*
//
// ── A REGRA DURA DESTA TELA ────────────────────────────────────────────────
//
// **Campo vazio aparece escrito "não informado".** Nunca em branco, nunca um
// traço, nunca um zero. Um campo vazio desenhado igual a um preenchido é a tela
// mentindo por omissão — o defeito central do raio-X de 08/08, e o que fez a
// casa achar que sabia da marca o que ela não sabia.
//
// E no topo aparece **quantos faltam e o que a falta impede**, porque contar
// campo vazio na mão é trabalho que a tela deveria ter feito.

import { useCallback, useEffect, useState } from "react";

interface Campo {
  campo: string;
  rotulo: string;
  estado: "definido" | "lacuna" | "herdado_default";
  valor: string;
  pergunta: string | null;
}

interface Resumo {
  definidos: number;
  total: number;
  faltam: number;
  oQueAFaltaImpede: string | null;
}

interface Ficha {
  campos: Campo[];
  resumo: Resumo;
  naoConstituida: boolean;
  proximasPerguntas: Campo[];
}

const CORES: Record<Campo["estado"], string> = {
  definido: "bg-[var(--success-bg)] text-[var(--success)]",
  lacuna: "bg-[var(--warning-bg)] text-[var(--warning)]",
  herdado_default: "bg-[var(--bg)] text-[var(--text-muted)]",
};

const NOME_DO_ESTADO: Record<Campo["estado"], string> = {
  definido: "definido",
  lacuna: "não informado",
  herdado_default: "padrão da casa",
};

export function FichaDeMarca({ clientId }: { clientId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/marca`);
      if (!r.ok) throw new Error(`${r.status}`);
      setFicha((await r.json()) as Ficha);
      setErro(null);
    } catch {
      // Erro de leitura NÃO vira ficha vazia: ficha vazia se parece com "nada a
      // declarar", e isto aqui é o oposto disso.
      setErro("não consegui ler a ficha de marca deste cliente");
    }
  }, [clientId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(campo: string) {
    if (!rascunho.trim()) return;
    setSalvando(true);
    try {
      await fetch(`/api/agency/clients/${clientId}/marca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campos: { [campo]: rascunho.trim() } }),
      });
      setEditando(null);
      setRascunho("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  if (erro) {
    return (
      <div className="bg-white rounded-[12px] border border-[var(--border)] p-5">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Marca</h2>
        <p className="mt-2 text-[13px] text-[var(--warning)]">{erro}</p>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="bg-white rounded-[12px] border border-[var(--border)] p-5">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Marca</h2>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">Carregando a ficha…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Marca</h2>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            ficha.resumo.faltam === 0 ? CORES.definido : CORES.lacuna
          }`}>
            {ficha.resumo.definidos}/{ficha.resumo.total}
          </span>
        </div>
      </div>

      {/* O que a falta impede — antes da lista, não depois dela. */}
      {ficha.resumo.oQueAFaltaImpede && (
        <div className="px-5 py-3 bg-[var(--warning-bg)] border-b border-[var(--border)]">
          <p className="text-[12px] text-[var(--warning)] leading-relaxed">
            <strong>Faltam {ficha.resumo.faltam}.</strong> {ficha.resumo.oQueAFaltaImpede}
          </p>
        </div>
      )}

      <ul className="divide-y divide-[var(--border)]">
        {ficha.campos.map((c) => (
          <li key={c.campo} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{c.rotulo}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CORES[c.estado]}`}>
                    {NOME_DO_ESTADO[c.estado]}
                  </span>
                </div>

                {c.estado === "definido" ? (
                  <p className="mt-1 text-[12.5px] text-[var(--text-secondary)] leading-relaxed break-words">{c.valor}</p>
                ) : (
                  /* Vazio se ANUNCIA. Nunca em branco, nunca um traço. */
                  <p className="mt-1 text-[12.5px] text-[var(--text-muted)] italic">
                    não informado{c.pergunta ? ` — pergunte: "${c.pergunta}"` : ""}
                  </p>
                )}

                {editando === c.campo && (
                  <div className="mt-2 flex flex-col gap-2">
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      rows={3}
                      placeholder={c.pergunta ?? "Escreva o que o cliente respondeu"}
                      className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void salvar(c.campo)}
                        disabled={salvando || !rascunho.trim()}
                        className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--text-primary)] text-white disabled:opacity-40"
                      >
                        {salvando ? "Salvando…" : "Salvar"}
                      </button>
                      <button
                        onClick={() => { setEditando(null); setRascunho(""); }}
                        className="h-7 px-3 rounded-[6px] text-[12px] text-[var(--text-secondary)]"
                      >
                        Cancelar
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Escreva o que <strong>o cliente</strong> respondeu. Se ele não respondeu, deixe em branco —
                      preencher por ele vira regra falsa, e a peça vai obedecer.
                    </p>
                  </div>
                )}
              </div>

              {editando !== c.campo && (
                <button
                  onClick={() => { setEditando(c.campo); setRascunho(c.valor); }}
                  className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)]"
                >
                  {c.estado === "definido" ? "Editar" : "Preencher"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
