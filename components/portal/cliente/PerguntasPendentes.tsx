"use client";

// PERGUNTAS PENDENTES — o que a agência NÃO consegue deduzir e só o cliente sabe
// (cardápio, preços, endereço, horário, @ das redes). Mora no topo da Visão Geral.
//
// A regra de quais perguntas existem é do servidor (`perguntasAoCliente`); aqui só
// se mostra e se envia. Sem pergunta aberta, não renderiza nada — a agência que
// finaliza não deixa o cliente olhando uma caixa vazia.
//
// O portal tem seu próprio sistema visual (`cp-*`, `--cp-*`); `Card`/`Textarea` do
// shadcn não estão instalados, então reaproveitamos `cp-card` e as peças de `pecas.tsx`.

import { useCallback, useEffect, useState } from "react";
import { Carregando, Erro, TituloDeSecao } from "./pecas";

export interface PerguntaAoClienteNaTela {
  fato: string;
  rotulo: string;
  pergunta: string;
}

const LIMITE = 2000;

/** `aoContar`: o portal soma no "N coisas dependem de você" do topo. */
export function PerguntasPendentes({ token, aoContar }: { token: string; aoContar?: (n: number) => void }) {
  const [perguntas, setPerguntas] = useState<PerguntaAoClienteNaTela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroDoEnvio, setErroDoEnvio] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      // Sem token na URL quando o cookie httpOnly já autentica.
      const url = token ? `/api/portal/perguntas?token=${encodeURIComponent(token)}` : "/api/portal/perguntas";
      const res = await fetch(url);
      const dados = (await res.json().catch(() => ({}))) as { perguntas?: PerguntaAoClienteNaTela[]; error?: string };
      if (!res.ok) {
        setErro(dados.error ?? "Não consegui buscar as perguntas da equipe agora.");
        return;
      }
      setPerguntas(Array.isArray(dados.perguntas) ? dados.perguntas : []);
    } catch {
      setErro("A conexão caiu ao buscar as perguntas da equipe. Tente de novo em instantes.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { aoContar?.(perguntas.length); }, [perguntas.length, aoContar]);

  async function enviar(fato: string) {
    const resposta = (textos[fato] ?? "").trim();
    if (!resposta) return;
    setEnviando(fato);
    setErroDoEnvio((e) => ({ ...e, [fato]: "" }));
    try {
      const res = await fetch("/api/portal/perguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fato, resposta, ...(token ? { token } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { gravado?: boolean; error?: string };
      if (!res.ok || !j.gravado) {
        setErroDoEnvio((e) => ({ ...e, [fato]: j.error ?? "Não consegui registrar sua resposta agora. Tente de novo." }));
        return;
      }
      setPerguntas((ps) => ps.filter((p) => p.fato !== fato));
    } catch {
      setErroDoEnvio((e) => ({ ...e, [fato]: "A conexão caiu. Sua resposta NÃO foi registrada — tente de novo." }));
    } finally {
      setEnviando(null);
    }
  }

  if (carregando) return <Carregando texto="Buscando o que a equipe precisa de você…" />;
  if (erro) return <Erro titulo="Não deu para ver as perguntas" texto={erro} aoTentarDeNovo={() => void carregar()} />;
  if (perguntas.length === 0) return null;

  return (
    <article className="cp-card" style={{ marginBottom: 13 }} aria-label="Perguntas da equipe para você">
      <TituloDeSecao
        sobretitulo="A EQUIPE PRECISA DE VOCÊ"
        titulo={perguntas.length === 1 ? "Uma informação só você sabe" : `${perguntas.length} informações que só você sabe`}
      />
      <ul style={{ marginTop: 13, listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {perguntas.map((p) => {
          const id = `pergunta-${p.fato}`;
          const texto = textos[p.fato] ?? "";
          const msg = erroDoEnvio[p.fato];
          return (
            <li key={p.fato} style={{ border: "1px solid var(--cp-line)", borderRadius: 10, padding: "12px 14px" }}>
              <label htmlFor={id} style={{ display: "block", fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
                {p.pergunta}
              </label>
              <textarea
                id={id}
                value={texto}
                maxLength={LIMITE}
                rows={3}
                aria-describedby={msg ? `${id}-erro` : undefined}
                aria-invalid={msg ? true : undefined}
                onChange={(e) => setTextos((t) => ({ ...t, [p.fato]: e.target.value }))}
                style={{
                  display: "block", width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  border: "1px solid var(--cp-line)", fontSize: 16, resize: "vertical",
                }}
              />
              {msg && (
                <small id={`${id}-erro`} role="alert" style={{ display: "block", marginTop: 6, color: "var(--cp-muted)" }}>
                  {msg}
                </small>
              )}
              <button
                type="button"
                onClick={() => void enviar(p.fato)}
                disabled={enviando !== null || texto.trim().length === 0}
                style={{
                  marginTop: 10, minHeight: 44, padding: "0 20px", borderRadius: 8,
                  border: "1px solid var(--cp-navy)", background: "var(--cp-navy)", color: "var(--cp-card)",
                  fontWeight: 700, touchAction: "manipulation",
                  opacity: enviando !== null || texto.trim().length === 0 ? 0.5 : 1,
                }}
              >
                {enviando === p.fato ? "Enviando…" : "Enviar"}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
