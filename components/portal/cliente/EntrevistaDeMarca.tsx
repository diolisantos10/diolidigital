"use client";

// ── A ENTREVISTA DE MARCA — a porta que faltava ─────────────────────────────
//
// A rota `/api/portal/marca` existia desde a construção do Brand Hub e **nenhuma
// tela a chamava**: o cliente não tinha por onde responder. O Brand Hub da
// referência aprovada pede "evolução do preenchimento da marca" e um botão
// "Continuar entrevista de marca" — este é o outro lado dele.
//
// As regras vêm da própria rota, e são dela, não desta tela:
//   • uma pergunta por vez — questionário longo é questionário abandonado;
//   • "não sei" é resposta VÁLIDA e não grava nada. O campo continua em lacuna,
//     que é a verdade. Resposta no chute vira regra falsa que a peça obedece
//     para sempre;
//   • salva a cada resposta — ele responde três no ponto de ônibus e volta.

import { useState } from "react";
import { mensagemDeErro } from "@/components/agency/ui/mensagemDeErro";

export interface PerguntaDeMarca {
  campo: string;
  pergunta: string;
  rotulo: string;
}

export function EntrevistaDeMarca({
  aberto, token, perguntas, aoFechar, aoGravar,
}: {
  aberto: boolean;
  token: string;
  perguntas: PerguntaDeMarca[];
  aoFechar: () => void;
  /** Avisa a aba que o progresso mudou, para a barra acompanhar sem recarregar. */
  aoGravar: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  if (!aberto) return null;

  const atual = perguntas[indice];

  async function responder(valor: string) {
    if (!atual || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/portal/marca${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo: atual.campo, resposta: valor }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setResposta("");
      setRecado(valor ? "Guardado. Obrigado." : "Sem problema — deixamos em aberto.");
      aoGravar();
      if (indice + 1 < perguntas.length) setIndice(indice + 1);
      else setRecado("Você respondeu tudo o que faltava por agora. Obrigado.");
    } catch (e) {
      // Quem lê isto é o CLIENTE PAGANTE — nunca "HTTP 500" na tela dele.
      setErro(mensagemDeErro(e, "guardar sua resposta").mensagem);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="cp-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Entrevista de marca"
    >
      <section className="cp-request-modal">
        <header>
          <div className="cp-pm-avatar" aria-hidden>✦</div>
          <div>
            <small>ENTREVISTA DE MARCA</small>
            <h2>{atual ? atual.rotulo : "Tudo respondido"}</h2>
            <p>
              {atual
                ? `Pergunta ${indice + 1} de ${perguntas.length}. Cada resposta é guardada na hora — pode parar quando quiser.`
                : "Não há nada em aberto agora. Se algo mudar no seu negócio, é só avisar seu Project Manager."}
            </p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar">×</button>
        </header>

        {atual ? (
          <div className="cp-request-field">
            <label htmlFor="resposta-de-marca">{atual.pergunta}</label>
            <textarea
              id="resposta-de-marca"
              autoFocus
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Escreva com suas palavras. Não precisa ficar bonito."
            />
            <small>
              Não sabe responder? Diga “não sei” no botão abaixo — o campo fica em
              aberto, e isso é melhor que um chute virando regra.
            </small>
          </div>
        ) : (
          <div className="cp-upload-state">
            <i aria-hidden>✓</i>
            <h3>Sua marca está documentada</h3>
            <p>Obrigado. Isso melhora tudo o que a equipe produz para você.</p>
          </div>
        )}

        {erro && (
          <div className="cp-request-context" role="alert">
            <i className="cp-icon" aria-hidden>!</i>
            <span><b>Não consegui guardar</b><small>{erro}</small></span>
          </div>
        )}
        {!erro && recado && (
          <div className="cp-request-context" role="status">
            <i className="cp-icon" aria-hidden>✓</i>
            <span><b>{recado}</b><small>Você pode fechar e continuar depois.</small></span>
          </div>
        )}

        <footer>
          <button onClick={() => void responder("")} disabled={!atual || enviando} style={{ touchAction: "manipulation" }}>
            Não sei
          </button>
          <span>Suas respostas viram regra para tudo o que produzimos.</span>
          <button
            className="primary"
            disabled={!atual || enviando || !resposta.trim()}
            onClick={() => void responder(resposta.trim())}
            style={{ touchAction: "manipulation" }}
          >
            {enviando ? "Guardando…" : "Guardar e seguir →"}
          </button>
        </footer>
      </section>
    </div>
  );
}
