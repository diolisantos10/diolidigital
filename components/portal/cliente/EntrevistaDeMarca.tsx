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

export interface MetadeDeMarca {
  chave: string;
  rotulo: string;
  pergunta: string;
}

export interface PerguntaDeMarca {
  campo: string;
  pergunta: string;
  rotulo: string;
  /** Quando o campo é um PAR, as metades que ainda faltam — uma caixa para
   *  cada. A tela tinha uma caixa só, e a segunda metade (a que permite
   *  reprovar peça) não tinha por onde entrar: o servidor gravava
   *  `reprovadas: []` fixo e a marca nunca se constituía. */
  metades?: MetadeDeMarca[];
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
  /** As metades de um campo de par, por chave. Estado próprio porque as duas
   *  viajam JUNTAS: mandar só a primeira reproduz o defeito que a segunda
   *  metade existe para fechar. */
  const [metades, setMetades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  if (!aberto) return null;

  const atual = perguntas[indice];
  const partes = atual?.metades ?? [];
  const ehPar = partes.length > 0;
  const respondeu = ehPar ? partes.some((m) => (metades[m.chave] ?? "").trim()) : !!resposta.trim();

  function avancar() {
    setResposta("");
    setMetades({});
    if (indice + 1 < perguntas.length) setIndice(indice + 1);
    else setRecado("Você respondeu tudo o que faltava por agora. Obrigado.");
  }

  async function responder(valor: string) {
    if (!atual || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const corpo = ehPar && valor
        ? { campo: atual.campo, metades }
        : { campo: atual.campo, resposta: valor };
      const res = await fetch(`/api/portal/marca${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setResposta("");
      setMetades({});
      setRecado(valor ? "Guardado. Obrigado." : "Sem problema — deixamos em aberto.");
      aoGravar();
      avancar();
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

        {atual && ehPar ? (
          <>
            {partes.map((m, i) => (
              <div className="cp-request-field" key={m.chave}>
                <label htmlFor={`resposta-de-marca-${m.chave}`}>
                  <b>{m.rotulo}</b> — {m.pergunta}
                </label>
                <textarea
                  id={`resposta-de-marca-${m.chave}`}
                  autoFocus={i === 0}
                  value={metades[m.chave] ?? ""}
                  onChange={(e) => setMetades({ ...metades, [m.chave]: e.target.value })}
                  placeholder="Escreva com suas palavras. Não precisa ficar bonito."
                />
              </div>
            ))}
            <div className="cp-request-field">
              <small>
                Pode responder só uma agora — eu guardo e volto a perguntar a
                outra. Mas é a segunda que me deixa reprovar peça antes de você
                ver; sem ela, nada é publicado no seu nome.
              </small>
            </div>
          </>
        ) : atual ? (
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
            disabled={!atual || enviando || !respondeu}
            onClick={() => void responder(ehPar ? "par" : resposta.trim())}
            style={{ touchAction: "manipulation" }}
          >
            {enviando ? "Guardando…" : "Guardar e seguir →"}
          </button>
        </footer>
      </section>
    </div>
  );
}
