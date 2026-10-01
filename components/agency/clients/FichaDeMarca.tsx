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

// ── CAMPOS DE DUAS METADES (01/10/2026) ─────────────────────────────────────
// "Como vocês falam" e "Exemplos do que ficou certo/errado" só ficam completos
// com as DUAS metades (`METADES` em `ficha-de-marca.ts`). A tela mandava um
// texto só, que ia para a primeira metade — já preenchida —, o campo continuava
// "não informado" e nada avisava. Agora cada metade tem a sua caixa.
const METADES_DA_TELA: Record<string, { chave: string; rotulo: string }[]> = {
  voz: [
    { chave: "dizemos", rotulo: "Uma frase do jeito que vocês falam" },
    { chave: "naoDizemos", rotulo: "Uma frase do jeito que vocês NUNCA falariam" },
  ],
  referencias: [
    { chave: "aprovada", rotulo: "Um exemplo que ficou certo (a cara da marca)" },
    { chave: "reprovada", rotulo: "Um exemplo que ficou errado (não é a marca)" },
  ],
};

export function FichaDeMarca({ clientId }: { clientId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [metades, setMetades] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

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

  function temConteudo(campo: string): boolean {
    const partes = METADES_DA_TELA[campo];
    return partes ? partes.some((m) => (metades[m.chave] ?? "").trim()) : !!rascunho.trim();
  }

  async function salvar(campo: string) {
    if (!temConteudo(campo)) return;
    const partes = METADES_DA_TELA[campo];
    const valor = partes
      ? Object.fromEntries(partes.map((m) => [m.chave, (metades[m.chave] ?? "").trim()]))
      : rascunho.trim();
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/marca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campos: { [campo]: valor } }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { error?: string; ignorados?: string[] };
      // Falha agora APARECE: antes o clique em Salvar não dizia nada, dando
      // certo ou não.
      if (!r.ok) {
        setAviso({ ok: false, texto: `Não salvou: ${corpo.ignorados?.join("; ") || corpo.error || `erro ${r.status}`}` });
        return;
      }
      setEditando(null);
      setRascunho("");
      setMetades({});
      setAviso({ ok: true, texto: "Salvo." });
      await carregar();
    } catch {
      setAviso({ ok: false, texto: "Não salvou: falha de rede. Tente de novo." });
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

      {aviso && (
        <p
          role="status"
          className={`px-5 py-2 text-[12px] border-b border-[var(--border)] ${
            aviso.ok ? "text-[var(--success)] bg-[var(--success-bg)]" : "text-[var(--warning)] bg-[var(--warning-bg)]"
          }`}
        >
          {aviso.texto}
        </p>
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
                    {METADES_DA_TELA[c.campo] ? (
                      METADES_DA_TELA[c.campo]!.map((m) => (
                        <label key={m.chave} className="flex flex-col gap-1">
                          <span className="text-[12px] font-medium text-[var(--text-secondary)]">{m.rotulo}</span>
                          <textarea
                            value={metades[m.chave] ?? ""}
                            onChange={(e) => setMetades((v) => ({ ...v, [m.chave]: e.target.value }))}
                            rows={2}
                            className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                          />
                        </label>
                      ))
                    ) : (
                      <textarea
                        value={rascunho}
                        onChange={(e) => setRascunho(e.target.value)}
                        rows={3}
                        placeholder={c.pergunta ?? "Escreva o que o cliente respondeu"}
                        className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void salvar(c.campo)}
                        disabled={salvando || !temConteudo(c.campo)}
                        className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--text-primary)] text-white disabled:opacity-40"
                      >
                        {salvando ? "Salvando…" : "Salvar"}
                      </button>
                      <button
                        onClick={() => { setEditando(null); setRascunho(""); setMetades({}); setAviso(null); }}
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
                  onClick={() => { setEditando(c.campo); setRascunho(c.valor); setMetades({}); setAviso(null); }}
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
