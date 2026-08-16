// MEDE O QUE A PESSOA DE FATO ENXERGA NO /briefing — não o que existe no DOM.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ POR QUE ESTA FERRAMENTA EXISTE, E QUAL ERRO DE MÉTODO ELA CONSERTA
// ═══════════════════════════════════════════════════════════════════════════
//
// `scripts/medir-cartao-do-briefing.mjs` (B1) mede BOTÃO contra JANELA, com
// `getBoundingClientRect` + `elementFromPoint`. Isso responde "o controle está
// dentro do cartão e alguém o alcança com o dedo?" — e é o certo para o B1.
//
// **Não serve para conteúdo dentro de uma região que rola.** `getBoundingClientRect`
// devolve a posição do elemento na janela e NÃO sabe que um ancestral com
// `overflow` diferente de `visible` o está recortando. Um selo em y=441 dentro
// de um painel que termina em 446 tem 5px pintados de 16 — e a régua da janela
// diz "visível", com todas as letras.
//
// É o MESMO erro de método do B1 ("recortado não é rolável"), um commit depois,
// com outra cara: lá o cartão recortava o rodapé; aqui o painel recorta o selo.
//
// ── A REGRA DESTA MEDIÇÃO ──────────────────────────────────────────────────
// Sobe a cadeia inteira de ancestrais e INTERSETA todo ancestral cujo `overflow`
// não é `visible`. Só no fim corta pela janela. O que sobra é o retângulo
// pintado — em pixels, não em booleano.
//
// ── Como rodar ──────────────────────────────────────────────────────────────
//   npm run dev                                   # em outro terminal
//   node scripts/medir-a-vista-do-briefing.mjs
//   W=1440 H=900 node scripts/medir-a-vista-do-briefing.mjs
//   SHOT=docs/entregas/x/375x600.png node scripts/medir-a-vista-do-briefing.mjs
//
// O cenário é o do relato: 5 anexos que CHEGARAM e NÃO PUDERAM ser lidos
// (`extractedText` vazio), a IA fora do ar (`/api/sdr/chat` devolve `ok:false`),
// e o painel de materiais aberto. É o pior caso honesto: nada foi forjado.

import { chromium } from "playwright";

const alvo = process.env.ALVO || "http://localhost:3000/briefing";
const W = Number(process.env.W || 375);
const H = Number(process.env.H || 600);
const ARQUIVOS = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"];

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

// A IA fora do ar: é o caminho `respostaSemIa`, o que o auditor observou.
await p.route("**/api/sdr/chat", (rota) =>
  rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not_configured" }) }),
);
// O upload SOBE e o arquivo é OPACO: `extractedText` vazio → "Anexado · não lido".
await p.route("**/api/sdr/upload", async (rota) => {
  const nome = /name="file"; filename="([^"]+)"/.exec(rota.request().postData() || "")?.[1] ?? "arquivo.pdf";
  await rota.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true, fileName: nome, fileType: "PDF", sizeBytes: 245_000,
      mimeType: "application/pdf", extractedText: "",
    }),
  });
});

await p.goto(alvo, { waitUntil: "networkidle" });
await p.waitForTimeout(1000);

await p.getByRole("button", { name: /Anexar/i }).click();
await p.waitForTimeout(400);

await p.setInputFiles(
  'input[type="file"]',
  ARQUIVOS.map((name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") })),
);
await p.waitForTimeout(2000);

/** O retângulo PINTADO de um elemento: recortado por todo ancestral que rola. */
const REGUA = `
function retanguloPintado(el) {
  if (!el) return null;
  const b = el.getBoundingClientRect();
  // ATENÇÃO: nada de crase aqui dentro — este bloco é uma template string.
  // SEGUNDA ARMADILHA DO MÉTODO, e ela custou uma medição errada hoje:
  // conteúdo dentro de um <details> FECHADO continua devolvendo um
  // getBoundingClientRect com altura — o Chromium o esconde por
  // content-visibility, não por display:none. A régua dizia "16 de 16
  // pintados" para cinco selos que ninguém enxergava. checkVisibility é o
  // que sabe disso; sem ela, fechar a lista viraria um conserto no papel.
  if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) {
    return { caixa: { top: 0, bottom: 0 }, alturaTotal: Math.round(b.height), alturaPintada: 0, inteiro: false, oculto: true, cortadoPor: ["oculto (details fechado / visibility)"] };
  }
  let caixa = { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  const cortes = [];
  let p = el.parentElement;
  while (p) {
    const cs = getComputedStyle(p);
    // 'visible' é o único valor que NÃO recorta. auto/scroll/hidden/clip recortam.
    if (cs.overflowY !== "visible" || cs.overflowX !== "visible") {
      const r = p.getBoundingClientRect();
      if (r.top > caixa.top || r.bottom < caixa.bottom) {
        cortes.push((p.className || p.tagName).toString().slice(0, 40));
      }
      caixa.top = Math.max(caixa.top, r.top);
      caixa.bottom = Math.min(caixa.bottom, r.bottom);
      caixa.left = Math.max(caixa.left, r.left);
      caixa.right = Math.min(caixa.right, r.right);
    }
    p = p.parentElement;
  }
  // E só no FIM a janela.
  caixa.top = Math.max(caixa.top, 0);
  caixa.left = Math.max(caixa.left, 0);
  caixa.bottom = Math.min(caixa.bottom, innerHeight);
  caixa.right = Math.min(caixa.right, innerWidth);
  const alturaPintada = Math.max(0, Math.round(caixa.bottom - caixa.top));
  const larguraPintada = Math.max(0, Math.round(caixa.right - caixa.left));
  return {
    caixa: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    alturaTotal: Math.round(b.height),
    alturaPintada: larguraPintada > 0 ? alturaPintada : 0,
    inteiro: larguraPintada > 0 && alturaPintada >= Math.round(b.height) - 1,
    cortadoPor: cortes,
  };
}
`;

const medir = async () =>
  p.evaluate(`(() => {
    ${REGUA}
    const txt = (el) => (el?.textContent || "").replace(/\\s+/g, " ").trim();
    const achar = (sel, re) => [...document.querySelectorAll(sel)].find((e) => re.test(txt(e)));

    const selos = [...document.querySelectorAll("span")]
      .filter((s) => /^(Anexado · não lido|Lido|Falhou|Lendo…)$/.test(txt(s)))
      .map((s, i) => ({ i, texto: txt(s), ...retanguloPintado(s) }));

    const linhas = [...document.querySelectorAll("p")]
      .filter((e) => /\\.pdf$/.test(txt(e)))
      .map((e) => ({ nome: txt(e), ...retanguloPintado(e) }));

    const resumo = document.querySelector("summary");
    // A zona de arrastar é a caixa tracejada, não um texto qualquer: buscar por
    // frase pegava um ancestral gigante e devolvia "parcial" para o que pinta 0.
    const dropzone = document.querySelector('div[class*="border-dashed"]');
    const bolhas = [...document.querySelectorAll("[data-bolha], p, div")]
      .filter((e) => /^📎 \\d+ arquivo/.test(txt(e)))
      .slice(0, 1);
    const vaga = [...document.querySelectorAll("p, div")]
      .filter((e) => /^(O que chegou está registrado|Nada ficou guardado|Recebi e li o material)/.test(txt(e)))
      .slice(-1);

    const painel = document.querySelector("summary")?.closest("div.overflow-y-auto");
    return {
      janela: { w: innerWidth, h: innerHeight },
      scrollY: Math.round(scrollY),
      painel: painel ? { ...retanguloPintado(painel), rolagem: { topo: Math.round(painel.scrollTop), total: Math.round(painel.scrollHeight), visivel: Math.round(painel.clientHeight) } } : null,
      resumo: resumo ? { texto: txt(resumo), ...retanguloPintado(resumo) } : null,
      linhas, selos,
      dropzone: dropzone ? { texto: txt(dropzone).slice(0, 40), ...retanguloPintado(dropzone) } : null,
      bolhaDoLote: bolhas[0] ? { texto: txt(bolhas[0]).slice(0, 50), ...retanguloPintado(bolhas[0]) } : null,
      bolhaVaga: vaga[0] ? { texto: txt(vaga[0]).slice(0, 50), ...retanguloPintado(vaga[0]) } : null,
    };
  })()`);

const noTopo = await medir();
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: false });

// A lista de anexos ABERTA por um toque: é onde os selos por arquivo aparecem.
// `.first()`: há um segundo <summary> ("Materiais") no painel do pedido, à direita.
await p.locator("summary").first().click();
await p.waitForTimeout(400);
const comAListaAberta = await medir();

// O painel rolado até o FIM: é onde o auditor mediu a dropzone.
await p.evaluate(() => {
  const painel = document.querySelector("summary")?.closest("div.overflow-y-auto");
  if (painel) painel.scrollTop = painel.scrollHeight;
});
await p.waitForTimeout(300);
const noFim = await medir();
if (process.env.SHOT_ABERTA) await p.screenshot({ path: process.env.SHOT_ABERTA, fullPage: false });

const px = (r) => (r ? `${String(r.alturaPintada).padStart(3)}/${String(r.alturaTotal).padEnd(3)}` : "  —    ");
const linha = (rot, r) => `  ${rot.padEnd(26)} ${px(r)}  ${r && r.alturaPintada === 0 ? "⛔ ZERO PIXEL" : r?.inteiro ? "✅ inteiro" : "⚠️ parcial"}`;

for (const [rotulo, m] of [
  ["lista FECHADA (como abre)", noTopo],
  ["lista ABERTA (um toque)", comAListaAberta],
  ["lista aberta · painel no FIM", noFim],
]) {
  console.log(`\n=== ${W}×${H} · ${rotulo} · scrollY=${m.scrollY} ===`);
  console.log(`  painel ${m.painel?.caixa.top}–${m.painel?.caixa.bottom} · rolagem ${m.painel?.rolagem.topo}/${m.painel?.rolagem.total} (janela ${m.painel?.rolagem.visivel})`);
  console.log(linha("resumo <summary>", m.resumo), m.resumo ? `· "${m.resumo.texto}"` : "");
  m.selos.forEach((s, i) => console.log(linha(`selo #${i} (${s.texto})`, s)));
  console.log(`  selos legíveis: ${m.selos.filter((s) => s.inteiro).length} de ${m.selos.length}`);
  console.log(linha("dropzone", m.dropzone));
  console.log(linha("bolha do LOTE (nomes)", m.bolhaDoLote));
  console.log(linha("bolha VAGA (respostaSemIa)", m.bolhaVaga));
}

await nav.close();
