"use client";

// ── A PÁGINA DA PROPOSTA — onde o cliente responde "cliente aceitou?" ────────
//
// O cursograma da casa tem UM ponto de decisão depois da precificação, e até
// 24/08/2026 ele não tinha tela. A rota do aceite existia, era testada, estava
// no ar — e nenhuma página a chamava. A produção somava zero clientes com
// projeto porque ninguém tinha onde clicar "aceito".
//
// ── POR QUE UMA PÁGINA PRÓPRIA, E NÃO UMA ABA DO PORTAL ────────────────────
//
// O portal de 11 abas (`/portal/access/[token]`) precisa de um `Client` para
// abrir: `resolvePortalClient` devolve `null` sem ele e TODA rota de dados
// responde 403. Neste ponto da esteira o `Client` ainda não existe — quem o
// cria é justamente o projeto que este aceite faz nascer. Pendurar o aceite lá
// seria exigir o efeito como condição da causa.
//
// ── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
//
//   • Não decide nada sozinha. Sem clique não há decisão: silêncio não é
//     aceite, e "não recusou" nunca vale como "aceitou".
//   • Não desenha botão quando o servidor diz que não há decisão a tomar
//     (`decidivel: false`). Quem manda é o estado do pedido, não a tela.
//   • Não mostra id, valor interno, nem nome de sistema. O corpo é o mesmo
//     texto que já foi para a conversa e para o e-mail.

import { use, useCallback, useEffect, useState } from "react";

type Proposta = {
  negocio: string;
  texto: string | null;
  decidivel: boolean;
  status: string;
  motivo?: string;
  jaAceito?: boolean;
  jaRecusado?: boolean;
};

const CAIXA: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "40px 20px 64px",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#1A1A1A",
  lineHeight: 1.6,
};

const BOTAO: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

export default function PropostaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dados, setDados] = useState<Proposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"aceito" | "recusado" | null>(null);
  const [resposta, setResposta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/briefing/proposta?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setErro(
          res.status === 403 || res.status === 404
            ? "Este link não está mais válido. Responda o e-mail do orçamento que a gente reenvia."
            : "Não consegui carregar sua proposta agora. Tente de novo em alguns minutos.",
        );
        return;
      }
      setDados((await res.json()) as Proposta);
    } catch {
      setErro("Não consegui carregar sua proposta agora. Tente de novo em alguns minutos.");
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(decisao: "aceito" | "recusado") {
    setEnviando(decisao);
    setErro(null);
    try {
      const res = await fetch("/api/portal/briefing/aceite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, decisao }),
      });
      const corpo = (await res.json()) as { mensagem?: string; error?: string };
      if (!res.ok) {
        setErro(corpo.error ?? "Não consegui registrar sua resposta. Tente de novo.");
        return;
      }
      setResposta(corpo.mensagem ?? "Resposta registrada.");
      await carregar();
    } catch {
      setErro("Não consegui registrar sua resposta. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }

  if (erro && !dados) {
    return (
      <main style={CAIXA}>
        <p style={{ fontSize: 17 }}>{erro}</p>
      </main>
    );
  }
  if (!dados) {
    return (
      <main style={CAIXA}>
        <p style={{ color: "#6B7280" }}>Carregando sua proposta…</p>
      </main>
    );
  }

  return (
    <main style={CAIXA}>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "#9B9B95", fontWeight: 600 }}>
        Sua proposta
      </p>
      <h1 style={{ margin: "6px 0 28px", fontSize: 28, lineHeight: 1.25 }}>
        {dados.negocio || "Seu projeto"}
      </h1>

      {dados.texto ? (
        <div style={{ whiteSpace: "pre-wrap", fontSize: 16, background: "#FAFAF8", border: "1px solid #EAEAE4", borderRadius: 12, padding: 24 }}>
          {dados.texto}
        </div>
      ) : (
        <p style={{ fontSize: 16 }}>
          {dados.motivo ?? "A proposta ainda está sendo montada."} Assim que estiver pronta, você recebe por e-mail.
        </p>
      )}

      {resposta && (
        <p style={{ marginTop: 24, fontSize: 16, background: "#DCFCE7", color: "#166534", borderRadius: 10, padding: "14px 18px" }}>
          {resposta}
        </p>
      )}

      {/* Botão só existe quando há decisão a tomar. A tela não inventa a
          pergunta: quem diz se o pedido está esperando resposta é o servidor. */}
      {dados.decidivel && dados.texto && !resposta && (
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void decidir("aceito")}
            disabled={enviando !== null}
            style={{ ...BOTAO, background: "#166534", color: "#fff", opacity: enviando ? 0.6 : 1 }}
          >
            {enviando === "aceito" ? "Registrando…" : "Aceitar e começar"}
          </button>
          <button
            type="button"
            onClick={() => void decidir("recusado")}
            disabled={enviando !== null}
            style={{ ...BOTAO, background: "#fff", color: "#6B7280", border: "1px solid #D6D6CE", opacity: enviando ? 0.6 : 1 }}
          >
            {enviando === "recusado" ? "Registrando…" : "Agora não"}
          </button>
        </div>
      )}

      {!dados.decidivel && !resposta && dados.texto && (
        <p style={{ marginTop: 24, fontSize: 15, color: "#6B7280" }}>
          {dados.jaAceito
            ? "Você já aceitou esta proposta — seu projeto está em montagem."
            : dados.jaRecusado
              ? "Você respondeu que não agora. Se mudar de ideia, é só responder o e-mail."
              : "Esta proposta não está aguardando decisão no momento."}
        </p>
      )}

      {erro && dados && (
        <p style={{ marginTop: 20, fontSize: 15, color: "#DC2626" }}>{erro}</p>
      )}
    </main>
  );
}
