// quadro-em-aba-escondida.ts — a página não pode ficar presa em "Carregando…"
// só porque a aba está em segundo plano.
//
// ── O DEFEITO (04/10/2026, medido) ───────────────────────────────────────────
// O CEO abriu a ficha de um cliente com a janela em segundo plano e a página
// ficou mais de 30 s em "Carregando o cliente…". Reproduzido: o conteúdo JÁ
// tinha chegado ao navegador — a ficha inclusive — e ficava escondido atrás
// do `loading.tsx`.
//
// A causa está no React 19 que o Next 16 usa: a função que troca o
// "carregando" pelo conteúdo pronto (`$RC`, no streaming) espera um QUADRO DE
// ANIMAÇÃO (`requestAnimationFrame`) antes de revelar. Aba escondida não ganha
// quadro nenhum — e a página espera até alguém olhar para ela.
//
// ── O CONSERTO ──────────────────────────────────────────────────────────────
// Um script mínimo, no <head>, ANTES do streaming: enquanto a aba estiver
// escondida, `requestAnimationFrame` vira um temporizador. Aba visível: o de
// sempre, intocado. Os ids do temporizador saem NEGATIVOS para o
// `cancelAnimationFrame` saber qual dos dois cancelar (os do navegador são
// sempre positivos).

/** O script, como texto — vai inline no <head> do layout raiz. */
export const SCRIPT_DO_QUADRO_EM_ABA_ESCONDIDA = `(function(){var w=window,r=w.requestAnimationFrame,c=w.cancelAnimationFrame;if(!r||!c||w.__quadroEmAbaEscondida)return;w.__quadroEmAbaEscondida=1;w.requestAnimationFrame=function(f){if(document.visibilityState!=="hidden")return r.call(w,f);return -w.setTimeout(function(){f(performance.now())},16)};w.cancelAnimationFrame=function(i){if(i<0)return w.clearTimeout(-i);return c.call(w,i)}})();`;
