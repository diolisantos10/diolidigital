"use client";

// A ESCOLHA DE PROVEDOR DE IA POR CLIENTE — a tela que manda de verdade.
//
// Substitui a seção "IAs dos Agentes", que gravava e não era lida por ninguém.
// Esta grava em `ClientAiProvider`, que `lib/ai/generate.ts` consulta em TODA
// chamada de IA da casa. Trocar aqui muda o provedor da próxima produção
// daquele cliente — e só dele.
//
// O que a tela é obrigada a dizer, e diz:
//   • quais provedores TÊM chave (fixar um sem chave é programar a próxima
//     produção do cliente para falhar — a rota recusa, e a tela avisa antes);
//   • que "sem reserva" é o padrão, e o que isso significa quando o provedor cai;
//   • que cliente sem fixação segue a preferência da casa.

import { useEffect, useState, useCallback } from "react";

interface ClienteNaTela {
  clientId: string;
  nome: string;
  provider: string | null;
  model: string | null;
  estrito: boolean;
  motivo: string | null;
  decididoPor: string | null;
  atualizadoEm: string | null;
}

interface Resposta {
  provedores: string[];
  conectados: Record<string, boolean>;
  padraoDaCasa: string | null;
  clientes: ClienteNaTela[];
}

const ROTULO: Record<string, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini — faixa gratuita",
  deepseek: "DeepSeek",
  perplexity: "Perplexity",
};

export default function ProvedorPorCliente() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/agency/provedor-do-cliente");
      if (res.status === 401 || res.status === 403) { setSemPermissao(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDados(await res.json());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(clientId: string, patch: { provider?: string | null; estrito?: boolean }) {
    setSalvando(clientId);
    setErro(null);
    const atual = dados?.clientes.find((c) => c.clientId === clientId);
    try {
      const res = await fetch("/api/agency/provedor-do-cliente", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          provider: patch.provider !== undefined ? patch.provider : atual?.provider ?? null,
          estrito: patch.estrito !== undefined ? patch.estrito : atual?.estrito ?? true,
          motivo: "definido na tela de Integrações",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(json.error ?? `HTTP ${res.status}`); return; }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(null);
    }
  }

  if (semPermissao) return null;

  return (
    <div id="ia-por-cliente" className="bg-white border border-[var(--border)] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-[var(--border)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">IA por cliente</h2>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          Qual inteligência atende cada cliente. Vale para a próxima produção — e só para o cliente escolhido.
        </p>
      </div>

      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--accent)]">
        <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
          Serve para <strong>testar um provedor na agência antes de levar a cliente pagante</strong>.
          Cliente sem escolha segue o padrão da casa
          {dados?.padraoDaCasa ? <> (<span className="font-mono">{dados.padraoDaCasa}</span>)</> : null}.
          Por padrão a escolha é <strong>sem reserva</strong>: se o provedor escolhido cair, a casa
          diz que não conseguiu em vez de deixar outro atender por baixo — o cliente nunca
          recebe uma peça de padrão diferente sem que ninguém saiba.
        </p>
      </div>

      {erro && (
        <div className="px-5 py-2.5 text-[11.5px] bg-[#FFF5F5] border-b border-[#FEE2E2] text-[var(--danger)]">
          {erro}
        </div>
      )}

      {carregando && !dados && (
        <div className="px-5 py-6 text-[12px] text-[var(--text-muted)]">Carregando…</div>
      )}

      {dados && dados.clientes.length === 0 && (
        <div className="px-5 py-6 text-[12px] text-[var(--text-muted)]">Nenhum cliente cadastrado ainda.</div>
      )}

      <div className="divide-y divide-[var(--border)]">
        {dados?.clientes.map((c) => {
          const fixado = c.provider !== null;
          const semChave = fixado && dados.conectados[c.provider!] === false;
          return (
            <div key={c.clientId} className="px-5 py-3.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 sm:w-[190px] sm:shrink-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{c.nome}</div>
                  <div className="text-[10.5px] text-[var(--text-muted)]">
                    {fixado ? `fixado${c.decididoPor ? ` · ${c.decididoPor}` : ""}` : "padrão da casa"}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <select
                    value={c.provider ?? ""}
                    disabled={salvando === c.clientId}
                    onChange={(e) => void salvar(c.clientId, { provider: e.target.value || null })}
                    className="w-full border border-[var(--border)] rounded-[7px] px-3 py-1.5 text-[12px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--navy)]/30 disabled:opacity-50"
                  >
                    <option value="">Padrão da casa (sem fixação)</option>
                    {dados.provedores.map((p) => (
                      <option key={p} value={p} disabled={!dados.conectados[p]}>
                        {ROTULO[p] ?? p}{dados.conectados[p] ? "" : " · sem chave"}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={c.estrito}
                    disabled={!fixado || salvando === c.clientId}
                    onChange={(e) => void salvar(c.clientId, { estrito: e.target.checked })}
                  />
                  Sem reserva
                </label>
              </div>

              {semChave && (
                <p className="mt-1.5 text-[11px] text-[var(--danger)]">
                  ⚠ &ldquo;{c.provider}&rdquo; está fixado neste cliente e <strong>não tem chave conectada</strong>.
                  A produção deste cliente vai falhar até a chave entrar — nenhum outro provedor assume.
                </p>
              )}
              {fixado && !c.estrito && (
                <p className="mt-1.5 text-[11px] text-[var(--warning)]">
                  ⚠ Com reserva ligada, outro provedor pode atender por baixo se este cair —
                  o número que você medir não será só deste provedor.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
