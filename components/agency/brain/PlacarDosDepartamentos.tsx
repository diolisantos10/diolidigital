"use client";

// PLACAR DOS DEPARTAMENTOS — Dioli Brain, do BANCO (bloco F, 04/10/2026).
// Substitui os seis painéis que liam cópias do navegador e marcavam
// "Engine / Quality Gate / Governança: ativo" como constante. Aqui só entra o
// que é medido: execuções reais em 30 dias e quantas checagens do portão
// rodam de verdade. Sem execução, o card diz isso — não mostra zero bonito.

import { useEffect, useState } from "react";

interface Placar {
  id: string;
  nome: string;
  execucoes: { total: number; ok: number; reserva: number; erro: number; ultimaEm: string | null; custoUsd: number };
  portao: { total: number; comMecanismo: number; soTexto: number; bloqueantesSoTexto: number };
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro" }
  | { fase: "ok"; janela: number; lista: Placar[] };

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function PlacarDosDepartamentos() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    fetch("/api/brain/departamentos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { janelaDias: number; departamentos: Placar[] }) =>
        setEstado({ fase: "ok", janela: d.janelaDias, lista: d.departamentos }),
      )
      .catch(() => setEstado({ fase: "erro" }));
  }, []);

  return (
    <section aria-label="Placar dos departamentos" className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em]">
        Departamentos — o que rodou de verdade
      </div>
      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
        Execuções registradas no banco e checagens do portão que rodam por código. Nada aqui é estimado.
      </p>
      {estado.fase === "carregando" && <p className="mt-3 text-[12px] text-[var(--text-muted)]">Lendo do banco…</p>}
      {estado.fase === "erro" && <p className="mt-3 text-[12px] text-[var(--warning)]">Não deu para ler o placar agora.</p>}
      {estado.fase === "ok" && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {estado.lista.map((d) => (
            <div key={d.id} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
              <div className="text-[13px] font-semibold text-white">{d.nome}</div>
              {d.execucoes.total === 0 ? (
                <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                  Nenhuma execução nos últimos {estado.janela} dias.
                </p>
              ) : (
                <div className="mt-2 text-[12px] text-[var(--text-secondary)] space-y-0.5">
                  <div>
                    <span className="text-white font-semibold">{d.execucoes.total}</span> execuções em {estado.janela} dias
                  </div>
                  <div>
                    {d.execucoes.ok} ok · {d.execucoes.reserva} pela reserva ·{" "}
                    <span className={d.execucoes.erro ? "text-[var(--warning)]" : ""}>{d.execucoes.erro} com erro</span>
                  </div>
                  <div>
                    Última: {d.execucoes.ultimaEm ? data(d.execucoes.ultimaEm) : "—"} · custo US$ {d.execucoes.custoUsd.toFixed(2)}
                  </div>
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-white/[0.06] text-[11px] text-[var(--text-secondary)]">
                Portão: <span className="text-white">{d.portao.comMecanismo} de {d.portao.total}</span> checagens rodam por código
                {d.portao.bloqueantesSoTexto > 0 && (
                  <span className="text-[var(--warning)]"> · {d.portao.bloqueantesSoTexto} bloqueante(s) só no texto</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
