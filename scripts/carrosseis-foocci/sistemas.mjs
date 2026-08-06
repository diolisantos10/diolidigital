// SEIS SISTEMAS DE LAYOUT — um por carrossel.
//
// O pedido do CEO (05/08, 01:01 e 14:00): "Achei todos os criativos muito
// parecidos. TODOS! Dos 6 carroseis." e "peguem as nossas artes, os nossos
// carrosséis e comparem com o que vocês estão entregando".
//
// A comparação, medida: as 36 telas em produção têm luminância mediana entre
// 6 e 15 (0–255). O feed real do @foocci_ vai de 2 a 252, com ~1 em cada 3
// telas CLARA. E o molde de produção (lib/agency/design/molde.ts:281) tem UMA
// composição só: foto + degradê + bloco de texto embaixo. 36 vezes.
//
// Cada device usado aqui foi VISTO no feed real (12 posts / 30 telas baixados
// via /api/meta/feed em 06/08/2026): recorte orgânico branco, faixa clara,
// cards de comparação, lista com ícone, mockup de aparelho, monograma "F"
// como grafismo, numeração discreta laranja, tipografia ora Bold ora Regular.
// Nada aqui é invenção de estilo: é o vocabulário dele, redistribuído.
//
// A COPY NÃO É TOCADA. Ela vem inteira de copy.mjs.

export const LARANJA = "#F86106";   // medido no feed real (mediana de 9.927 px)
export const ESCURO = "#0A0A0B";
export const CREME = "#F6F1EA";
export const BRANCO = "#FFFFFF";
export const FONTE = "'Outfit', 'Work Sans', 'DejaVu Sans', sans-serif";

export const L = 1080, A = 1350;
/** Faixa que a interface do Instagram cobre. Texto não entra. */
export const SEGURO_TOPO = 40, SEGURO_BASE = 56;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Pinta o trecho `destaque` de laranja DENTRO do título. Marcação de cor —
 *  não altera um caractere do texto. Quebra de linha do original vira <br>. */
export function pintar(texto, destaque) {
  const bruto = esc(texto).replace(/\n/g, "<br>");
  if (!destaque) return bruto;
  const alvo = esc(destaque);
  const i = bruto.indexOf(alvo);
  if (i < 0) return bruto;
  return bruto.slice(0, i) + `<em class="hl">${alvo}</em>` + bruto.slice(i + alvo.length);
}

/** O wordmark. Renderizado como TEXTO na geométrica da marca — é o que a arte
 *  em produção já faz. Declarado: não é o arquivo oficial do logo. */
export function marca(cor = BRANCO, tamanho = 34) {
  return `<span class="marca" style="color:${cor};font-size:${tamanho}px">Foocci</span>`;
}

export const BASE_CSS = `
  @font-face{font-family:'Outfit';src:url('file:///root/.fonts/Outfit-Regular.ttf');font-weight:400}
  @font-face{font-family:'Outfit';src:url('file:///root/.fonts/Outfit-Bold.ttf');font-weight:700}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${L}px;height:${A}px;overflow:hidden}
  body{font-family:${FONTE};-webkit-font-smoothing:antialiased;background:${ESCURO}}
  .peca{position:relative;width:${L}px;height:${A}px;overflow:hidden}
  .foto{position:absolute;inset:0;background-size:cover;background-position:center}
  .hl{color:${LARANJA};font-style:normal}
  .marca{font-weight:700;font-style:italic;letter-spacing:-.5px}
  .cta{display:inline-block;background:${LARANJA};color:#fff;font-weight:700;
       font-size:27px;letter-spacing:.6px;padding:26px 42px;border-radius:999px;line-height:1.25}
  .site{font-size:25px;opacity:.75;margin-top:26px}
`;

export function documento(css, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${BASE_CSS}${css}</style></head><body><div class="peca">${corpo}</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 1 — "DOSSIÊ".  Prova numérica. Filete vertical laranja, índice
// "01/06" no alto à direita, telas de número em BRANCO CHAPADO.
// ═══════════════════════════════════════════════════════════════════════════
export function sistema1(t, i, foto) {
  const claro = i === 1 || i === 3;             // T2 e T4: as telas de número
  const tinta = claro ? "#0A0A0B" : "#FFF";
  const css = `
    .fundo{position:absolute;inset:0;background:${claro ? BRANCO : ESCURO}}
    .veu{position:absolute;inset:0;background:
      linear-gradient(to top,rgba(10,10,11,.94) 0%,rgba(10,10,11,.72) 38%,rgba(10,10,11,.18) 78%)}
    .topo{position:absolute;top:${SEGURO_TOPO + 22}px;left:78px;right:78px;
          display:flex;align-items:center;justify-content:space-between}
    .idx{font-weight:700;font-size:24px;letter-spacing:5px;color:${LARANJA}}
    .bloco{position:absolute;left:78px;right:78px;bottom:${SEGURO_BASE + 62}px;
           border-left:7px solid ${LARANJA};padding-left:40px;color:${tinta}}
    /* Telas de número: bloco no eixo vertical, e a nota de rodapé COLADA nele.
       Antes o bloco começava em 230px e a nota ia para o pé da peça — sobrava
       um vão morto no meio e a ressalva ficava órfã do número que ela ressalva. */
    .bloco.meio{bottom:auto;top:50%;transform:translateY(-50%)}
    .bloco.meio .nota{position:static;margin-top:34px;left:auto;right:auto;bottom:auto;max-width:78%}
    h1{font-weight:700;font-size:88px;line-height:1.03;letter-spacing:-2.4px}
    .realce{color:${LARANJA};font-weight:700;font-size:40px;line-height:1.2;margin-top:30px}
    .num{color:${LARANJA};font-weight:700;font-size:124px;line-height:1;
         letter-spacing:-4px;margin-top:34px}
    .apoio{font-size:33px;line-height:1.42;margin-top:26px;max-width:82%;
           opacity:${claro ? ".72" : ".88"}}
    .nota{position:absolute;left:125px;right:78px;bottom:${SEGURO_BASE + 8}px;
          font-size:17px;line-height:1.45;opacity:.5;color:${tinta}}
    .lista{margin-top:38px;display:flex;flex-direction:column;gap:16px}
    .item{display:flex;align-items:center;gap:22px;font-size:31px}
    .bola{flex:0 0 auto;width:54px;height:54px;border-radius:50%;background:${LARANJA};
          color:#fff;font-weight:700;font-size:26px;display:flex;align-items:center;
          justify-content:center}
  `;
  const corpo = `
    <div class="fundo"></div>
    ${!claro && foto ? `<div class="foto" style="background-image:url('${foto}')"></div><div class="veu"></div>` : ""}
    <div class="topo">${marca(claro ? ESCURO : BRANCO)}<span class="idx">0${i + 1} / 06</span></div>
    <div class="bloco ${claro ? "meio" : ""}">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      ${t.realce ? `<div class="realce">${esc(t.realce)}</div>` : ""}
      ${t.numero ? `<div class="num">${esc(t.numero)}</div>` : ""}
      ${t.lista ? `<div class="lista">${t.lista.map((x, k) =>
        `<div class="item"><span class="bola">${k + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : ""}
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.cta ? `<div style="margin-top:40px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
      ${t.nota && claro ? `<div class="nota">${esc(t.nota)}</div>` : ""}
    </div>
    ${t.nota && !claro ? `<div class="nota">${esc(t.nota)}</div>` : ""}`;
  return documento(css, corpo);
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 2 — "RECORTE".  O painel branco de borda orgânica entrando pela
// lateral (a assinatura mais forte do feed real). Índice em pontinhos.
// ═══════════════════════════════════════════════════════════════════════════
export function sistema2(t, i, foto) {
  const comRecorte = i === 0 || i === 2 || i === 4;
  const tinta = comRecorte ? "#0A0A0B" : "#FFF";
  const raios = [
    "0 46% 62% 0 / 0 34% 66% 0",
    "0 58% 40% 0 / 0 52% 48% 0",
    "0 38% 52% 0 / 0 44% 56% 0",
  ][Math.floor(i / 2) % 3];
  const css = `
    .fundo{position:absolute;inset:0;background:${ESCURO}}
    .veu{position:absolute;inset:0;background:
      linear-gradient(to right,rgba(10,10,11,.93) 0%,rgba(10,10,11,.62) 52%,rgba(10,10,11,.15) 100%)}
    .recorte{position:absolute;top:-40px;bottom:-40px;left:-60px;width:${comRecorte ? 760 : 0}px;
             background:${BRANCO};border-radius:${raios}}
    .conteudo{position:absolute;left:86px;top:${SEGURO_TOPO + 118}px;
              width:${comRecorte ? 560 : 700}px;color:${tinta}}
    h1{font-weight:700;font-size:76px;line-height:1.08;letter-spacing:-1.9px}
    .apoio{font-size:31px;line-height:1.44;margin-top:30px;opacity:${comRecorte ? ".68" : ".86"}}
    .logo{position:absolute;top:${SEGURO_TOPO + 26}px;left:86px}
    .dots{position:absolute;bottom:${SEGURO_BASE + 22}px;left:86px;display:flex;gap:12px}
    .dot{width:11px;height:11px;border-radius:50%;background:${comRecorte ? "rgba(10,10,11,.22)" : "rgba(255,255,255,.3)"}}
    .dot.on{background:${LARANJA};width:34px;border-radius:6px}
    .lista{margin-top:36px;display:flex;flex-direction:column;gap:14px}
    .item{display:flex;align-items:center;gap:20px;font-size:29px;line-height:1.25}
    .bola{flex:0 0 auto;width:50px;height:50px;border-radius:50%;background:${LARANJA};
          color:#fff;font-weight:700;font-size:24px;display:flex;align-items:center;justify-content:center}
    ${MOCKUP_CSS(comRecorte ? "claro" : "escuro")}
    .zap{position:absolute;right:64px;bottom:${SEGURO_BASE + 60}px}
  `;
  const corpo = `
    <div class="fundo"></div>
    ${foto ? `<div class="foto" style="background-image:url('${foto}')"></div><div class="veu"></div>` : ""}
    <div class="recorte"></div>
    <div class="logo">${marca(comRecorte ? ESCURO : BRANCO)}</div>
    <div class="conteudo">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.lista ? `<div class="lista">${t.lista.map((x, k) =>
        `<div class="item"><span class="bola">${k + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : ""}
      ${t.cta ? `<div style="margin-top:44px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
    </div>
    ${t.conversa ? `<div class="zap">${mockupConversa(t)}</div>` : ""}
    <div class="dots">${[0, 1, 2, 3, 4, 5].map((k) =>
      `<span class="dot ${k === i ? "on" : ""}"></span>`).join("")}</div>`;
  return documento(css, corpo);
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 3 — "FAIXA".  Divisão horizontal rígida: bloco de cor em cima,
// foto embaixo (e o inverso). Logo no RODAPÉ. Cards de comparação.
// ═══════════════════════════════════════════════════════════════════════════
export function sistema3(t, i, foto) {
  // 0 faixa creme em cima · 1 faixa escura em cima · 2 creme total ·
  // 3 foto cheia · 4 faixa creme em cima · 5 escuro CTA
  const modo = [0, 1, 2, 3, 0, 5][i];
  const cremeTotal = modo === 2;
  const faixaClara = modo === 0;
  const fotoCheia = modo === 3 || modo === 5;
  const alturaFaixa = t.lista || t.cards ? 100 : 54;
  const tinta = cremeTotal || faixaClara ? "#0A0A0B" : "#FFF";
  const css = `
    .fundo{position:absolute;inset:0;background:${cremeTotal ? CREME : ESCURO}}
    .faixa{position:absolute;top:0;left:0;right:0;height:${cremeTotal ? 100 : alturaFaixa}%;
           background:${faixaClara || cremeTotal ? CREME : ESCURO}}
    .veu{position:absolute;inset:0;background:
      linear-gradient(to top,rgba(10,10,11,.92) 0%,rgba(10,10,11,.55) 45%,rgba(10,10,11,.1) 85%)}
    .conteudo{position:absolute;left:80px;right:80px;
              ${fotoCheia ? `bottom:${SEGURO_BASE + 120}px` : `top:${SEGURO_TOPO + 130}px`};
              color:${tinta}}
    h1{font-weight:700;font-size:80px;line-height:1.06;letter-spacing:-2.1px;max-width:${fotoCheia ? "92%" : "88%"}}
    .apoio{font-size:31px;line-height:1.42;margin-top:28px;max-width:80%;opacity:${tinta === "#FFF" ? ".86" : ".66"}}
    .rodape{position:absolute;left:80px;right:80px;bottom:${SEGURO_BASE + 18}px;
            display:flex;align-items:center;justify-content:space-between;
            color:${fotoCheia || !faixaClara && !cremeTotal ? "#FFF" : "#0A0A0B"}}
    .idx{font-size:22px;letter-spacing:4px;opacity:.55;font-weight:700}
    .cards{margin-top:38px;display:flex;flex-direction:column;gap:14px}
    .card{border:2px solid ${LARANJA}33;background:${cremeTotal ? "rgba(10,10,11,.04)" : "rgba(255,255,255,.06)"};
          border-radius:20px;padding:22px 26px;display:flex;align-items:center;gap:22px}
    .cifra{flex:0 0 auto;width:52px;height:52px;border-radius:14px;border:2px solid ${LARANJA};
           color:${LARANJA};font-weight:700;font-size:26px;display:flex;align-items:center;justify-content:center}
    .ct{font-weight:700;font-size:30px;line-height:1.2}
    .cd{font-size:23px;opacity:.62;margin-top:4px;line-height:1.3}
    .lista{margin-top:36px;display:flex;flex-direction:column;gap:14px}
    .item{display:flex;align-items:center;gap:20px;font-size:30px}
    .bola{flex:0 0 auto;width:52px;height:52px;border-radius:50%;background:${LARANJA};
          color:#fff;font-weight:700;font-size:25px;display:flex;align-items:center;justify-content:center}
    /* A tela toda-creme saía com a metade de baixo vazia. Faixa de foto no pé,
       abaixo de qualquer letra. */
    .pe{position:absolute;left:0;right:0;bottom:0;height:${cremeTotal && foto ? 380 : 0}px;overflow:hidden}
    .pe .foto{background-position:center 46%;transform:scale(1.25)}
  `;
  const corpo = `
    <div class="fundo"></div>
    ${foto && !cremeTotal ? `<div class="foto" style="background-image:url('${foto}')"></div>${fotoCheia ? `<div class="veu"></div>` : ""}` : ""}
    ${!cremeTotal && !fotoCheia ? `<div class="faixa"></div>` : ""}
    ${cremeTotal ? `<div class="faixa"></div>` : ""}
    ${cremeTotal && foto ? `<div class="pe"><div class="foto" style="background-image:url('${foto}')"></div></div>` : ""}
    <div class="conteudo">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      ${t.cards ? `<div class="cards">${t.cards.map(([a, b]) =>
        `<div class="card"><span class="cifra">$</span><span><div class="ct">${esc(a)}</div>
         <div class="cd">${esc(b)}</div></span></div>`).join("")}</div>` : ""}
      ${t.lista ? `<div class="lista">${t.lista.map((x, k) =>
        `<div class="item"><span class="bola">${k + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : ""}
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.cta ? `<div style="margin-top:42px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
    </div>
    <div class="rodape">${marca(fotoCheia || (!faixaClara && !cremeTotal) ? BRANCO : ESCURO, 30)}
      <span class="idx">${i + 1} · 6</span></div>`;
  return documento(css, corpo);
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 4 — "APARELHO".  O celular é o herói, fundo claro. Índice em barra
// segmentada no topo. Coluna de texto estreita à esquerda.
// ═══════════════════════════════════════════════════════════════════════════
export function sistema4(t, i, foto) {
  const claro = i === 0 || i === 2 || i === 4;
  const tinta = claro ? "#0A0A0B" : "#FFF";
  const css = `
    .fundo{position:absolute;inset:0;background:${claro ? CREME : ESCURO}}
    .veu{position:absolute;inset:0;background:
      linear-gradient(to right,rgba(10,10,11,.94) 0%,rgba(10,10,11,.7) 46%,rgba(10,10,11,.2) 100%)}
    .barra{position:absolute;top:${SEGURO_TOPO + 20}px;left:80px;right:80px;display:flex;gap:9px}
    .seg{flex:1;height:5px;border-radius:3px;background:${claro ? "rgba(10,10,11,.14)" : "rgba(255,255,255,.2)"}}
    .seg.on{background:${LARANJA}}
    .logo{position:absolute;top:${SEGURO_TOPO + 54}px;left:80px}
    /* A coluna de 560px picotava a manchete da capa em seis linhas curtas
       ("Uma / campanha / mal feita no / WhatsApp / derruba o número / do seu /
       restaurante."). Sem foto atrás, ela pode respirar. */
    .conteudo{position:absolute;left:80px;top:${SEGURO_TOPO + 168}px;
              width:${t.lista ? 920 : t.conversa ? 540 : claro ? 860 : 640}px;color:${tinta}}
    h1{font-weight:700;font-size:${t.lista ? 62 : 70}px;line-height:1.09;letter-spacing:-1.7px}
    .apoio{font-size:30px;line-height:1.44;margin-top:28px;opacity:${claro ? ".66" : ".85"}}
    .lista{margin-top:40px;display:flex;flex-direction:column;gap:15px;width:840px}
    .item{display:flex;align-items:center;gap:22px;border:2px solid ${claro ? "rgba(10,10,11,.1)" : "rgba(255,255,255,.12)"};
          border-radius:20px;padding:22px 26px;font-size:30px;font-weight:700}
    .ico{flex:0 0 auto;width:54px;height:54px;border-radius:15px;border:2px solid ${LARANJA};
         display:flex;align-items:center;justify-content:center}
    .ico svg{width:28px;height:28px;stroke:${LARANJA};fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    ${MOCKUP_CSS(claro ? "claro" : "escuro")}
    .zap{position:absolute;right:${i === 4 ? 56 : 70}px;bottom:${SEGURO_BASE + 40}px}
    /* A foto das telas claras deixa de ser fundo a 50% ATRÁS do texto — ali ela
       só sujava a leitura das listas — e vira uma faixa no PÉ, fora do caminho
       de qualquer letra. */
    .rodapefoto{position:absolute;left:0;right:0;bottom:0;height:${claro && !t.conversa ? 470 : 0}px;overflow:hidden}
    /* Enquadrado no aparelho, não no vazio da mesa: no 1º corte a faixa pegava
       só a toalha clara e virava uma tarja bege sem assunto. */
    .rodapefoto .foto{background-position:center 78%;transform:scale(1.15)}
  `;
  const ICONES = [
    `<path d="M17 3a8 8 0 1 1-9.9 12A9 9 0 0 0 17 3z"/>`,                 // lua
    `<path d="M3 17h18M6 17V9m5 8V5m5 12v-6"/>`,                          // teto
    `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,             // relógio
    `<path d="M3 8h4l3 8 4-12 3 8h4"/>`,                                  // intervalo
  ];
  const corpo = `
    <div class="fundo"></div>
    ${!claro && foto ? `<div class="foto" style="background-image:url('${foto}')"></div><div class="veu"></div>`
      : claro && foto && !t.conversa
        ? `<div class="rodapefoto"><div class="foto" style="background-image:url('${foto}')"></div></div>` : ""}
    <div class="barra">${[0, 1, 2, 3, 4, 5].map((k) => `<span class="seg ${k <= i ? "on" : ""}"></span>`).join("")}</div>
    <div class="logo">${marca(claro ? ESCURO : BRANCO)}</div>
    <div class="conteudo">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      ${t.lista ? `<div class="lista">${t.lista.map((x, k) =>
        `<div class="item"><span class="ico"><svg viewBox="0 0 24 24">${ICONES[k % 4]}</svg></span>
         <span>${esc(x)}</span></div>`).join("")}</div>` : ""}
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.cta ? `<div style="margin-top:44px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
    </div>
    ${t.conversa ? `<div class="zap">${mockupConversa(t)}</div>` : ""}`;
  return documento(css, corpo);
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 5 — "EDITORIAL".  Respiro. Título GRANDE em peso REGULAR (o feed
// real faz isso em "Pedido perdido não avisa"). Logo no TOPO-CENTRO. Índice
// fantasma gigante no rodapé.
// ═══════════════════════════════════════════════════════════════════════════
export function sistema5(t, i, foto) {
  const claro = i === 1 || i === 3;
  const tinta = claro ? "#0A0A0B" : "#FFF";
  // Nas telas CLARAS deste sistema não havia foto nenhuma: sobrava meia peça de
  // branco morto e nenhuma cor da marca. Entra uma FAIXA de foto no pé (o
  // "horizonte"), que preenche sem tirar o silêncio — e o filete passa a ser
  // laranja, para a tela não sair sem a cor do cliente.
  const faixa = claro && foto ? 430 : 0;
  const css = `
    .fundo{position:absolute;inset:0;background:${claro ? BRANCO : ESCURO}}
    .veu{position:absolute;inset:0;background:
      linear-gradient(to bottom,rgba(10,10,11,.86) 0%,rgba(10,10,11,.5) 42%,rgba(10,10,11,.9) 100%)}
    .horizonte{position:absolute;left:0;right:0;bottom:0;height:${faixa}px;overflow:hidden}
    .horizonte .foto{background-position:center 62%}
    .logo{position:absolute;top:${SEGURO_TOPO + 24}px;left:0;right:0;text-align:center}
    .conteudo{position:absolute;left:96px;right:96px;
              top:${SEGURO_TOPO + (claro ? 210 : 300)}px;color:${tinta}}
    h1{font-weight:400;font-size:92px;line-height:1.07;letter-spacing:-3px}
    h1 .hl{font-weight:700}
    .risco{height:2px;background:${LARANJA};width:150px;margin:44px 0 0}
    .apoio{font-size:32px;line-height:1.46;margin-top:34px;max-width:74%;
           opacity:${claro ? ".6" : ".8"};font-weight:400}
    /* line-height .86 cortava a base do glifo: parecia número truncado, não
       grafismo. Caixa inteira, e acima da faixa de foto. */
    .fantasma{position:absolute;right:78px;bottom:${SEGURO_BASE + (claro ? faixa + 26 : 42)}px;
              font-size:158px;font-weight:700;line-height:1;color:transparent;
              -webkit-text-stroke:2px ${LARANJA};opacity:.32;letter-spacing:0}
    /* Nas telas claras o rodapé caía DENTRO da faixa de foto — e a faixa é uma
       cozinha em alta-luz: texto branco sobre branco, invisível. Sobe para
       cima da faixa e vira tinta escura. */
    .rodape{position:absolute;left:96px;
            bottom:${claro && faixa ? faixa + 22 : SEGURO_BASE + 16}px;
            color:${tinta};font-size:21px;letter-spacing:2px;opacity:.5}
  `;
  const corpo = `
    <div class="fundo"></div>
    ${!claro && foto ? `<div class="foto" style="background-image:url('${foto}')"></div><div class="veu"></div>` : ""}
    ${faixa ? `<div class="horizonte"><div class="foto" style="background-image:url('${foto}')"></div></div>` : ""}
    <div class="logo">${marca(claro ? ESCURO : BRANCO, 32)}</div>
    <div class="conteudo">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      <div class="risco"></div>
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.cta ? `<div style="margin-top:46px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
    </div>
    <div class="fantasma">0${i + 1}</div>
    <div class="rodape">FOOCCI.COM.BR</div>`;
  return documento(css, corpo);
}

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA 6 — "MONOGRAMA".  O "F" gigante como grafismo e um ARCO de foto.
// Logo no rodapé-centro. Índice em cápsula. Termina CLARO (o único CTA claro).
// ═══════════════════════════════════════════════════════════════════════════
export function sistema6(t, i, foto) {
  const claro = i === 1 || i === 3 || i === 5;
  const tinta = claro ? "#0A0A0B" : "#FFF";
  // O ARCO desce para o RODAPÉ nas telas claras. No 1º passe ele ficava no
  // topo-direita e a manchete "Quatro categorias, quatro fornecedores, quatro
  // contratos" ENTRAVA nele — texto por cima de foto clara, ilegível. Foto que
  // atropela manchete não é estilo, é defeito.
  const arcoEmbaixo = claro;
  const css = `
    .fundo{position:absolute;inset:0;background:${claro ? CREME : ESCURO}}
    .arco{position:absolute;${arcoEmbaixo
      ? "right:-190px;bottom:-230px;width:760px;height:760px"
      : "right:-140px;top:-120px;width:820px;height:820px"};
          border-radius:50%;overflow:hidden}
    .arco .foto{border-radius:50%}
    .arcoveu{position:absolute;inset:0;border-radius:50%;
             background:radial-gradient(circle at 40% 40%,rgba(10,10,11,0) 40%,
             rgba(10,10,11,${claro ? ".25" : ".75"}) 100%)}
    .efe{position:absolute;${claro ? "left:-120px;bottom:-200px" : "right:-90px;bottom:-190px"};
         font-size:660px;font-weight:700;
         font-style:italic;color:${LARANJA};opacity:${claro ? ".12" : ".16"};line-height:.8}
    .capsula{position:absolute;top:${SEGURO_TOPO + 22}px;right:78px;border:2px solid ${tinta};
             opacity:.55;border-radius:999px;padding:9px 22px;font-size:21px;font-weight:700;
             letter-spacing:3px;color:${tinta}}
    .conteudo{position:absolute;left:82px;right:82px;top:${SEGURO_TOPO + 150}px;color:${tinta}}
    h1{font-weight:700;font-size:84px;line-height:1.05;letter-spacing:-2.3px;
       max-width:${arcoEmbaixo ? "100%" : "88%"}}
    .num{color:${LARANJA};font-weight:700;font-size:118px;line-height:1;letter-spacing:-4px;margin-top:28px;
         max-width:${arcoEmbaixo ? "100%" : "88%"}}
    .apoio{font-size:31px;line-height:1.44;margin-top:26px;
           max-width:${arcoEmbaixo ? "72%" : "66%"};opacity:${claro ? ".66" : ".85"}}
    .lista{margin-top:44px;display:flex;flex-direction:column;gap:15px;
           max-width:${arcoEmbaixo ? "660px" : "100%"}}
    .item{display:flex;align-items:center;gap:22px;font-size:31px;font-weight:700;
          border-left:5px solid ${LARANJA};padding:16px 0 16px 26px;
          background:linear-gradient(to right,${claro ? "rgba(10,10,11,.06)" : "rgba(255,255,255,.06)"},transparent)}
    .n{color:${LARANJA};font-weight:700;font-size:26px;min-width:38px}
    .rodape{position:absolute;left:0;right:0;bottom:${SEGURO_BASE + 16}px;text-align:center}
  `;
  const corpo = `
    <div class="fundo"></div>
    ${foto ? `<div class="arco"><div class="foto" style="background-image:url('${foto}')"></div>
      <div class="arcoveu"></div></div>` : ""}
    <div class="efe">F</div>
    <div class="capsula">0${i + 1}/06</div>
    <div class="conteudo">
      <h1>${pintar(t.titulo, t.destaque)}</h1>
      ${t.numero ? `<div class="num">${esc(t.numero)}</div>` : ""}
      ${t.lista ? `<div class="lista">${t.lista.map((x, k) =>
        `<div class="item"><span class="n">0${k + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : ""}
      ${t.apoio ? `<p class="apoio">${esc(t.apoio).replace(/\n/g, "<br>")}</p>` : ""}
      ${t.cta ? `<div style="margin-top:44px"><span class="cta">${esc(t.cta)}</span>
        <div class="site">${esc(t.site)}</div></div>` : ""}
    </div>
    <div class="rodape">${marca(tinta, 32)}</div>`;
  return documento(css, corpo);
}

// ─── O mockup de conversa (device do feed real) ─────────────────────────────
function MOCKUP_CSS() {
  return `
    .fone{width:430px;background:#fff;border-radius:36px;padding:16px;
          box-shadow:0 34px 80px rgba(0,0,0,.45);border:8px solid #15151a}
    .fcab{display:flex;align-items:center;gap:12px;padding:6px 6px 14px;
          border-bottom:1px solid #ececec}
    .fav{width:30px;height:30px;border-radius:50%;background:${LARANJA}}
    .fnome{font-size:19px;font-weight:700;color:#111}
    .fcorpo{padding:14px 6px 6px;display:flex;flex-direction:column;gap:10px}
    .bal{max-width:88%;font-size:18px;line-height:1.36;padding:12px 15px;border-radius:16px;color:#111}
    .bal.cliente{align-self:flex-start;background:#f1f1f3;border-top-left-radius:5px}
    .bal.loja{align-self:flex-end;background:#e7f6e4;border-top-right-radius:5px}
    .bal.botao{align-self:flex-end;background:${LARANJA};color:#fff;font-weight:700;font-size:17px}
    .bal.selo{align-self:flex-start;background:transparent;color:#1f9d4d;font-size:16px;font-weight:700;padding:4px 2px}
  `;
}
function mockupConversa(t) {
  return `<div class="fone">
    <div class="fcab"><span class="fav"></span><span class="fnome">${esc(t.conversaTopo || "Seu restaurante")}</span></div>
    <div class="fcorpo">${t.conversa.map(([quem, txt]) =>
      `<div class="bal ${quem}">${esc(txt).replace(/\n/g, "<br>")}</div>`).join("")}</div>
  </div>`;
}

export const SISTEMAS = [sistema1, sistema2, sistema3, sistema4, sistema5, sistema6];
