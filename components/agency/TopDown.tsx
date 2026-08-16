"use client";

// TOP DOWN — o dispositivo do CEO, na tela.
//
// Ordem literal (15/08/2026): *"precisamos criar um botão para isso no
// sistema"*, *"chamado TOP DOWN"*, *"esse dispositivo só pode ser usado por
// mim"*.
//
// O QUE ELE É: a decisão que desce de cima e destrava, registrada com nome,
// data e porquê. O que ele NÃO é: uma chave que publica sozinha. Cada peça
// continua saindo só com a aprovação do cliente dono dela — e a tela diz isso
// em voz alta, porque ler TOP DOWN como "pode tudo" é exatamente o erro que a
// trava existe para impedir.
//
// A tela não decide quem pode: quem decide é o servidor (`/api/top-down`, só
// `master`). Se a resposta vier 403, o dispositivo simplesmente não aparece.
// Esconder botão nunca foi segurança; o portão é lá.

import { useCallback, useEffect, useState } from "react";

type Decisao = {
  chave: string;
  titulo: string;
  oQueLibera: string;
  oQueNaoLibera: string;
  aviso: string;
  ligada: boolean;
  motivo: string | null;
  decididoPor: string | null;
  em: string | null;
};

export function TopDown() {
  const [decisoes, setDecisoes] = useState<Decisao[] | null>(null);
  const [permitido, setPermitido] = useState(true);
  const [abrindo, setAbrindo]   = useState<Decisao | null>(null);
  const [motivo, setMotivo]     = useState("");
  const [erro, setErro]         = useState<string | null>(null);
  const [ocupado, setOcupado]   = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/top-down");
      if (r.status === 401 || r.status === 403) { setPermitido(false); return; }
      if (!r.ok) return;
      const corpo = await r.json();
      setDecisoes(corpo.decisoes);
    } catch {
      // Sem estado não se inventa estado: a seção some em vez de mostrar um
      // freio "solto" que ninguém conferiu.
      setPermitido(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (!permitido || !decisoes) return null;

  async function confirmar() {
    if (!abrindo) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/top-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: abrindo.chave, ligada: !abrindo.ligada, motivo }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(corpo?.error ?? "não foi possível registrar"); setOcupado(false); return; }
      setAbrindo(null);
      setMotivo("");
      setOcupado(false);
      await carregar();
    } catch {
      setErro("não foi possível falar com o servidor");
      setOcupado(false);
    }
  }

  return (
    <section className="bg-white rounded-[12px] border border-[var(--border)] p-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">TOP DOWN</h2>
        <span className="text-[12px] text-[var(--text-muted)]">
          decisões que só o CEO toma — registradas com data e motivo
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {decisoes.map((d) => (
          <div key={d.chave} className="border border-[var(--border)] rounded-[10px] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">{d.titulo}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      d.ligada
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]"
                    }`}
                  >
                    {d.ligada ? "liberado" : "barrado"}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">{d.oQueLibera}</p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">{d.oQueNaoLibera}</p>

                {d.decididoPor && (
                  <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                    Decidido por <strong>{d.decididoPor}</strong>
                    {d.em ? ` em ${new Date(d.em).toLocaleString("pt-BR")}` : ""}
                    {d.motivo ? ` — "${d.motivo}"` : ""}
                  </p>
                )}
              </div>

              <button
                onClick={() => { setAbrindo(d); setMotivo(""); setErro(null); }}
                className="shrink-0 text-[13px] px-3.5 py-2 rounded-[8px] bg-[var(--navy,#0f172a)] text-white"
              >
                {d.ligada ? "Barrar" : "Liberar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {abrindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[520px] p-6 shadow-lg">
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              {abrindo.ligada ? "Barrar" : "Liberar"}: {abrindo.titulo}
            </h3>

            {/* O que a casa sabe e o CEO precisa saber ANTES de virar. Um
                dispositivo que destrava sem dizer o que expõe é uma armadilha. */}
            {!abrindo.ligada && (
              <p className="mt-3 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-[8px] p-3">
                {abrindo.aviso}
              </p>
            )}

            <label className="block mt-4 text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Por quê? (fica registrado com o seu nome e a data)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full border border-[var(--border)] rounded-[8px] px-3 py-2 text-[13px]"
              placeholder="Ex.: liberar a peça de teste da casa antes do App Review."
            />

            {erro && (
              <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-3">
                {erro}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setAbrindo(null)}
                className="text-[13px] px-3.5 py-2 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={ocupado || !motivo.trim()}
                className="text-[13px] px-3.5 py-2 rounded-[8px] bg-[var(--navy,#0f172a)] text-white disabled:opacity-40"
              >
                {ocupado ? "Registrando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
