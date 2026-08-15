"use client";

// "Zerar a agência" — a inauguração, com botão.
//
// Ordem do CEO (15/08/2026): zerar todo dado de cliente para percorrer a
// esteira etapa por etapa a partir do SDR. A rota `/api/admin/reset` já fazia
// isso e **só aceitava chamada técnica** — o CEO teria de montar uma requisição
// à mão. Ferramenta que só o desenvolvedor consegue disparar não é ferramenta
// do CEO.
//
// POR QUE A CONFERÊNCIA VEM ANTES, SEMPRE: o botão começa mostrando o que SERÁ
// apagado, contado do banco de verdade (GET, que não apaga nada). Zerar
// produção olhando um número real é decisão; zerar olhando um "tem certeza?" é
// aposta.
//
// POR QUE AINDA EXIGE DIGITAR A FRASE: é a única ação desta casa que destrói
// dado de cliente sem volta. As outras chaves (papel `master` no servidor e a
// variável `ALLOW_PRODUCTION_RESET`) o CEO não vê; esta ele sente. Um clique
// distraído não pode zerar a agência.

import { useCallback, useEffect, useState } from "react";

const FRASE = "ZERAR A AGENCIA";

type Contagem = Record<string, number>;

export function ZerarAAgencia() {
  const [permitido, setPermitido] = useState(true);
  const [antes, setAntes]         = useState<Contagem | null>(null);
  const [aberto, setAberto]       = useState(false);
  const [digitado, setDigitado]   = useState("");
  const [erro, setErro]           = useState<string | null>(null);
  const [ocupado, setOcupado]     = useState(false);
  const [pronto, setPronto]       = useState<Contagem | null>(null);
  const [liberadoNoAmbiente, setLiberadoNoAmbiente] = useState<boolean | null>(null);

  const conferir = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/reset");
      if (r.status === 401 || r.status === 403) { setPermitido(false); return; }
      if (!r.ok) return;
      const corpo = await r.json();
      setAntes(corpo.willDelete ?? null);
      // A rota diz se a variavel de ambiente esta ligada. Dizer isso ANTES
      // evita o CEO digitar a frase, clicar, e so entao descobrir que faltava
      // uma chave que ele nao ve.
      setLiberadoNoAmbiente(corpo.resetEnabled === true);
    } catch {
      setPermitido(false);
    }
  }, []);

  useEffect(() => { conferir(); }, [conferir]);

  if (!permitido) return null;

  const linhas = Object.entries(antes ?? {})
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  async function zerar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/reset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_OPERATIONAL_DATA", mode: "inauguracao" }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        // O motivo vem do servidor. O mais comum é a variável de ambiente
        // ausente — e dizer isso em português evita meia hora de procura.
        setErro(corpo?.error ?? "não foi possível zerar");
        setOcupado(false);
        return;
      }
      setPronto(corpo.after ?? {});
      setAberto(false);
      setDigitado("");
      setOcupado(false);
      await conferir();
    } catch {
      setErro("não foi possível falar com o servidor");
      setOcupado(false);
    }
  }

  return (
    <section className="bg-white rounded-[12px] border border-red-200 p-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-red-800">Zerar a agência</h2>
        <span className="text-[12px] text-[var(--text-muted)]">inauguração — não tem volta</span>
      </div>

      <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
        Apaga <strong>tudo que é de cliente</strong>: cadastro, solicitações,
        projetos, entregas, conversas, mídias, integrações do cliente e o login
        de portal dele. A agência continua de pé — seu acesso, sua equipe, suas
        chaves e a conta da Meta da casa não são tocadas.
      </p>

      {linhas.length > 0 ? (
        <div className="mt-3 text-[12px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[8px] p-3">
          <div className="font-medium mb-1">O que existe hoje e vai sair:</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {linhas.map(([chave, total]) => (
              <span key={chave} className="mono-num">{total} {chave}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          {antes === null ? "Conferindo o que existe hoje…" : "Não há dado de cliente — a agência já está zerada."}
        </p>
      )}

      {liberadoNoAmbiente === false && (
        <p className="mt-3 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-[8px] p-3">
          Falta uma chave no servidor: <strong>ALLOW_PRODUCTION_RESET</strong> precisa
          existir e valer <strong>true</strong> no Railway. Sem ela o botão recusa —
          e é assim mesmo: zerar produção exige uma volta a mais.
        </p>
      )}

      {pronto && (
        <p className="mt-3 text-[13px] text-green-800 bg-green-50 border border-green-200 rounded-[8px] p-3">
          Agência zerada. Pode começar pelo SDR.
        </p>
      )}

      <button
        onClick={() => { setAberto(true); setErro(null); }}
        disabled={linhas.length === 0}
        className="mt-4 text-[13px] px-3.5 py-2 rounded-[8px] bg-red-700 text-white disabled:opacity-40"
      >
        Zerar a agência
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[520px] p-6 shadow-lg">
            <h3 className="text-[16px] font-semibold text-red-800">Isto não tem volta</h3>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              Todo dado de cliente será apagado. A única recuperação é a cópia de
              segurança do dia — confirme com o Diretor que ela existe antes de
              seguir.
            </p>

            <label className="block mt-4 text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Digite <strong>{FRASE}</strong> para liberar o botão:
            </label>
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              className="w-full border border-[var(--border)] rounded-[8px] px-3 py-2 text-[13px]"
              placeholder={FRASE}
            />

            {erro && (
              <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-3">
                {erro}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setAberto(false); setDigitado(""); }}
                className="text-[13px] px-3.5 py-2 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
              <button
                onClick={zerar}
                disabled={ocupado || digitado.trim().toUpperCase() !== FRASE}
                className="text-[13px] px-3.5 py-2 rounded-[8px] bg-red-700 text-white disabled:opacity-40"
              >
                {ocupado ? "Zerando…" : "Zerar agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
