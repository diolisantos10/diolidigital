"use client";

// O INTERRUPTOR DA ESTEIRA — e por que ele é um BOTÃO, não um curl.
//
// ─── O padrão que este componente quebra (16/08/2026) ───────────────────────
//
// Cinco rodadas seguidas desta casa terminaram com "produzir é livre, mas o
// último metro exige uma credencial que só um humano tem". Ligar a esteira da
// agência era mais um: a única forma era `POST /api/v2/assistido` com
// `acao: "ligar_agencia"` — ou seja, o CEO teria que rodar um curl para a
// agência começar a trabalhar.
//
// ─── E por que ele NÃO liga sozinho no deploy ───────────────────────────────
//
// Porque a lei da casa é explícita: ligar é DECISÃO REGISTRADA DO DONO, nunca
// efeito de deploy. A flag grava `decididoPor` com o id de quem clicou. Um
// deploy que ligasse a esteira poria a agência a gastar IA em nome de um
// cliente sem ninguém ter decidido nada — e sem nome para responder por isso.
//
// O escopo é a AGÊNCIA, não o cliente: era a allowlist por `clientId` que
// morria a cada reset e a cada cliente novo, calada.

import { useState } from "react";

export default function LigarAEsteira({ ligada }: { ligada: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [ligadaAgora, setLigadaAgora] = useState(ligada);

  async function virar(ligar: boolean) {
    if (enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/v2/assistido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ligar_agencia", ligar }),
      });
      const dados = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !dados.ok) {
        setResultado(dados.error ?? "Não foi possível mudar a chave.");
        return;
      }
      setLigadaAgora(ligar);
      setResultado(
        ligar
          ? "Esteira LIGADA para a agência. A partir da próxima passada do relógio, todo briefing que entrar pela porta pública é levado à cadeia sozinho — e termina em card de aprovação, nunca publicado."
          : "Esteira DESLIGADA. Nenhum briefing novo é processado; os que já entraram continuam na fila, visíveis, com idade.",
      );
    } catch {
      setResultado("Falha de rede — a chave NÃO foi mudada. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded px-2 py-0.5 text-[11px] font-medium"
          style={ligadaAgora ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}
        >
          {ligadaAgora ? "esteira LIGADA" : "esteira DESLIGADA"}
        </span>
        <button
          onClick={() => void virar(!ligadaAgora)}
          disabled={enviando}
          className="h-9 px-4 rounded-[10px] text-[13px] font-semibold bg-[#070A1F] text-white hover:opacity-90 disabled:opacity-50"
          style={{ touchAction: "manipulation" }}
        >
          {enviando ? "Mudando…" : ligadaAgora ? "Desligar a esteira" : "Ligar a esteira da agência"}
        </button>
      </div>
      {resultado && <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{resultado}</p>}
      <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
        A autorização é da AGÊNCIA, não de um cliente: ela sobrevive ao reset e a cliente novo — era a lista por cliente
        que quebrava calada. Fica registrado quem ligou e quando. Desligar é o rollback, e é imediato.
      </p>
    </div>
  );
}
