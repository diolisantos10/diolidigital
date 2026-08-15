"use client";

// O BOTÃO "RETOMAR PROCESSO" — agora com o motor por trás (Marco 6).
//
// Idempotente por construção: retomar duas vezes devolve zero na segunda, e a
// tela diz isso com todas as letras. Quem não é PM/Diretor recebe o 403 do
// servidor — o botão não se esconde, explica (barrar com tela muda ensina a
// pessoa a achar que o sistema quebrou).

import { useState } from "react";

export default function RetomarProcesso() {
  const [correlationId, setCorrelationId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function retomar() {
    if (!correlationId.trim() || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/v2/retomar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correlationId: correlationId.trim() }),
      });
      const dados = (await res.json()) as { efeitosDevolvidos?: number; error?: string };
      if (!res.ok) {
        setResultado(dados.error ?? "Não foi possível retomar.");
      } else if ((dados.efeitosDevolvidos ?? 0) === 0) {
        setResultado("Nada para retomar nesta correlação — a fila está limpa (e isso é sucesso).");
      } else {
        setResultado(`${dados.efeitosDevolvidos} efeito(s) devolvido(s) à fila. O relógio da V2 processa na próxima batida.`);
      }
    } catch {
      setResultado("Falha de rede ao retomar — tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={correlationId}
          onChange={(e) => setCorrelationId(e.target.value)}
          placeholder="correlationId do processo travado"
          className="flex-1 px-3 py-2 text-[13px] bg-white border border-[var(--border-strong)] rounded-[10px] outline-none focus:border-[#070A1F]"
        />
        <button
          onClick={() => void retomar()}
          disabled={enviando || !correlationId.trim()}
          className="h-9 px-4 rounded-[10px] text-[13px] font-semibold bg-[#070A1F] text-white hover:opacity-90 disabled:opacity-50"
          style={{ touchAction: "manipulation" }}
        >
          {enviando ? "Retomando…" : "Retomar processo"}
        </button>
      </div>
      {resultado && <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{resultado}</p>}
      <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
        Devolve à fila os efeitos que falharam ou morreram desta correlação — as mesmas linhas, nunca duplicadas.
        Ação de PM/Diretor, registrada como execução humana.
      </p>
    </div>
  );
}
