"use client";

// ─── A TELA QUE O CLIENTE VÊ QUANDO O PORTAL NÃO ABRE ────────────────────────
//
// Ela substitui DUAS coisas que existiam antes, e as duas eram becos:
//
//   • o 404 padrão do Next em `/portal/invalid` — *"404 · This page could not
//     be found."*, em inglês, sem marca, sem uma palavra e sem botão. É onde
//     caía quem abria um link de portal truncado ou copiado pela metade;
//   • o cartão `cp-erro` de duas linhas ("Link expirado. Peça um novo à equipe
//     Dioli."), que explica e **não dá ferramenta nenhuma** — "peça um novo" é
//     uma tarefa jogada no colo do cliente, não um próximo passo.
//
// O desenho não é novo: é a linguagem `cp-*` da referência aprovada do portal
// (mesma barra de marca, mesmo cartão branco, mesma cor de ação). O que muda é
// o conteúdo obrigatório — o que houve, que não é culpa de quem lê, e O QUE
// FAZER AGORA, numerado, com o canal aberto num toque.
//
// O cartão é NEUTRO de propósito, não vermelho: link com prazo vencendo é o
// mecanismo funcionando, não erro do cliente. Vermelho aqui faria a pessoa
// achar que fez algo errado.

import {
  LINK_DO_WHATSAPP,
  textoDoBloqueio,
  type ContextoDoBloqueio,
  type MotivoDoBloqueio,
} from "./acesso";

function IconeDoLink() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 4 8M8 12h4M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeDaRede() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 18.5h.01M5.5 13.5a9 9 0 0 1 13 0M2 9.5a14 14 0 0 1 20 0M9 17a4.5 4.5 0 0 1 6 0M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AcessoBloqueado({
  motivo,
  contexto = "entrada",
  aoTentarDeNovo,
}: {
  motivo: MotivoDoBloqueio;
  contexto?: ContextoDoBloqueio;
  /** Só existe quando tentar de novo pode resolver (queda de rede). */
  aoTentarDeNovo?: () => void;
}) {
  const t = textoDoBloqueio(motivo, contexto);

  return (
    <div className="cp-shell">
      {/* A marca aparece ANTES da má notícia: quem recebe um beco em branco
          conclui que a agência sumiu. O wordmark não some no celular aqui
          (ver a regra de `.cp-bloqueio-topo` em portal-cliente.css). */}
      <header className="cp-topbar cp-bloqueio-topo">
        <div className="cp-dioli">
          <i aria-hidden>O°</i>
          <b>Dioli</b>
        </div>
      </header>

      <main className="cp-main cp-bloqueio-main">
        <section className="cp-bloqueio" role="alert" aria-live="polite">
          <i aria-hidden>{motivo === "rede" ? <IconeDaRede /> : <IconeDoLink />}</i>
          <h1>{t.titulo}</h1>
          <p>{t.corpo}</p>

          <div className="cp-bloqueio-passos">
            <small>O que fazer agora</small>
            <ol>
              {t.passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>

          <div className="cp-bloqueio-acoes">
            {aoTentarDeNovo && (
              <button type="button" className="principal" onClick={aoTentarDeNovo} style={{ touchAction: "manipulation" }}>
                Tentar de novo
              </button>
            )}
            <a
              className={aoTentarDeNovo ? undefined : "principal"}
              href={LINK_DO_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.acao}
            </a>
          </div>

          <small className="cp-bloqueio-rodape">
            Portal seguro da Dioli — área exclusiva da sua marca. É por isso que o acesso tem prazo.
          </small>
        </section>
      </main>
    </div>
  );
}

export default AcessoBloqueado;
