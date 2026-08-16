// Reprodução MEDIDA da "barra branca no topo atrapalhando as telas" (CEO,
// 15/08/2026) — ver ficha de despacho, defeito 1.
//
// POR QUE ESTE SCRIPT EXISTE ASSIM: uma rodada anterior declarou "não
// reproduzi" olhando só /briefing com screenshot `fullPage: true`. Isso é o
// furo, não a prova — `fullPage: true` (o que `scripts/shot.mjs` faz)
// ACHATA elemento `fixed`/`sticky`: uma barra que gruda no topo e cobre
// conteúdo desaparece do print de página inteira, porque o print de página
// inteira desenha a barra fixa numa posição só (o topo do documento) e o
// resto do documento por baixo, sem nunca simular rolagem de verdade.
// Screenshot de página inteira NÃO é prova de ausência de barra fixa.
//
// Por isso aqui: (1) screenshot de VIEWPORT, não de página inteira; (2) uma
// medição de DOM que não depende de olho — computa `position`, `top` e a
// luminância do fundo de cada elemento fixo/sticky que encosta no topo.
//
// Uso:
//   node scripts/repro-barra-branca.mjs [--base http://localhost:3000] [--login]
//     [--email master@dioli.studio] [--password ...] [--portal-token ...]
//
// Saída de imagem: process.env.SHOT_DIR (obrigatório respeitar).

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { login: false, base: "http://localhost:3000" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--login") out.login = true;
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--email") out.email = argv[++i];
    else if (a === "--password") out.password = argv[++i];
    else if (a === "--portal-token") out.portalToken = argv[++i];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const BASE = args.base;
const EMAIL = args.email || "master@dioli.studio";
// A senha nunca é constante pública no repositório (scripts/seed-db.mjs).
// Só existe se: (a) passada explicitamente, ou (b) a env que o próprio seed
// usa para fixar a senha do master foi exportada nesta sessão.
const PASSWORD = args.password || process.env.SEED_MASTER_PASSWORD || process.env.DIOLI_MASTER_PASSWORD || null;
const PORTAL_TOKEN = args.portalToken || process.env.PORTAL_ACCESS_TOKEN || null;

const outDir = process.env.SHOT_DIR;
if (!outDir) {
  console.error("SHOT_DIR não definido — este script não escolhe destino de imagem por conta própria.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Mesmo executável do scripts/shot.mjs — não reinventar.
const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];
let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

// ── Rotas ────────────────────────────────────────────────────────────────
// A ficha pedia "/portal/me". Essa rota não existe no app (conferido em
// .next/dev/types/routes.d.ts): a única página do segmento é
// `/portal/access/[token]`, e a URL "limpa" pós-login de cliente é
// `/portal/access/me` (o literal "me" aciona o modo cookie — ver
// app/portal/access/[token]/page.tsx:173). Uso essa rota real no lugar da
// que não existe; registro a correção na devolução, não escondo.
const ROUTES = [
  { path: "/", slug: "home", auth: null },
  { path: "/briefing", slug: "briefing", auth: null },
  { path: "/auth/signin", slug: "auth-signin", auth: null },
  { path: "/planos", slug: "planos", auth: null },
  { path: "/contato", slug: "contato", auth: null },
  { path: "/vitrine", slug: "vitrine", auth: null },
  { path: "/agency/dashboard", slug: "agency-dashboard", auth: "staff" },
  { path: "/portal/access/me", slug: "portal-me", auth: "portal" },
];

// Celular primeiro — é a prioridade da casa (CLAUDE.md / DESIGN.md).
const WIDTHS = [
  { label: "375", width: 375, height: 812 },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 900 },
];

// ── Medição no navegador ─────────────────────────────────────────────────
// Luminância relativa sRGB (WCAG). > 0.8 é "claro/branco" para efeito desta
// suspeita — o mesmo corte que separa `--bg`/`--card` (bem acima de 0.8) de
// `--sidebar`/navy (bem abaixo).
function scanTopoFn() {
  function luminancia(r, g, b) {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function seletorDe(el) {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      el.className && typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
        : "";
    return el.tagName.toLowerCase() + id + cls;
  }

  // Um elemento só é candidato a "barra que atrapalha" se o retângulo dele
  // de fato ocupa pixels visíveis da viewport ATUAL. Gaveta lateral fechada
  // (`translate-x(-100%)`) tem `position:fixed` e passa em todo o resto do
  // filtro — mas o retângulo dela vive em x negativo, fora da tela. Caso real
  // (16/08/2026): `aside#agency-nav` fechado, x −224..0, foi contado como
  // "cobrindo 100%" de 19 elementos porque a conta de sobreposição (abaixo)
  // só olhava o eixo Y. Esta função é o primeiro filtro: fora da viewport em
  // X OU em Y não é candidato, ponto.
  function foraDaViewport(rect) {
    return rect.right <= 0 || rect.left >= window.innerWidth || rect.bottom <= 0 || rect.top >= window.innerHeight;
  }
  // Visibilidade "de verdade": display/visibility já eliminam o óbvio, mas
  // opacidade zero e clique-atravessa-com-fundo-transparente também tornam um
  // elemento invisível ao olho, mesmo com `position:fixed` e retângulo válido.
  function invisivel(cs) {
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    if (parseFloat(cs.opacity) === 0) return true;
    if (cs.pointerEvents === "none") {
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const alpha = m ? (m[1].split(",").map((s) => parseFloat(s.trim()))[3] ?? 1) : 1;
      if (alpha === 0) return true;
    }
    return false;
  }

  const achados = [];
  const barraEls = []; // {el, rect} — mantido à parte de `achados` (que só tem dados serializáveis) para a medição de sobreposição, abaixo.
  const todos = document.querySelectorAll("body *");
  for (const el of todos) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (invisivel(cs)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.top > 0) continue; // não encosta no topo
    if (rect.width === 0 || rect.height === 0) continue;
    if (foraDaViewport(rect)) continue; // fora da tela (rolou, ou -translate-x-full) — não é o que o olho vê agora

    const bg = cs.backgroundColor; // "rgba(r, g, b, a)" ou "rgb(r, g, b)"
    const m = bg.match(/rgba?\(([^)]+)\)/);
    let luz = null;
    let alpha = 1;
    if (m) {
      const partes = m[1].split(",").map((s) => parseFloat(s.trim()));
      const [r, g, b, a] = partes;
      alpha = a === undefined ? 1 : a;
      luz = luminancia(r, g, b);
    }
    const transparente = alpha === 0;
    const claro = luz !== null && !transparente && luz > 0.8;
    const faixaVaziaAlta = transparente && rect.height > 8;
    if (!claro && !faixaVaziaAlta) continue;

    barraEls.push({ el, rect });
    achados.push({
      seletor: seletorDe(el),
      posicao: cs.position,
      alturaPx: Math.round(rect.height),
      larguraPx: Math.round(rect.width),
      topPx: Math.round(rect.top),
      backgroundColor: bg,
      zIndex: cs.zIndex,
      luminancia: luz === null ? null : Number(luz.toFixed(3)),
      motivo: claro ? "claro/branco (luminância > 0.8)" : "faixa vazia (transparente, altura > 8px)",
    });
  }

  // ── Sobreposição: a barra existe, mas ela ATRAPALHA? ──────────────────────
  // Ficha (rodada 3, PEÇA 2): "o que é DEFEITO é a barra cobrir conteúdo que a
  // pessoa não consegue revelar". Barra clara colada no topo, por si, é
  // comportamento normal de barra fixa (§6.2) — só varre em `scrollY = 0`
  // (topo absoluto, chamado antes de qualquer rolagem programática neste
  // script): é o quadro que a pessoa vê ao abrir a tela, sem poder "rolar para
  // trás" para revelar o que está embaixo.
  //
  // "Folha de texto": elemento cujo NÓ DIRETO tem texto (não herdado de um
  // filho-elemento) — assim `<p>Olá</p>` conta, mas o `<div>` que o envolve
  // não conta de novo pelo mesmo texto. Evita reportar o mesmo texto duas
  // vezes (pai e filho) e é a leitura mais simples de "as folhas".
  function textoProprio(el) {
    let t = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) t += node.textContent;
    }
    return t.trim();
  }

  const cobertos = [];
  if (barraEls.length > 0) {
    for (const cand of todos) {
      // Conteúdo DENTRO da própria barra (ex.: o texto do topbar) não conta
      // como "coberto pela barra" — é a barra, não o que ela esconde.
      let dentroDeBarra = false;
      for (const b of barraEls) {
        if (b.el === cand || b.el.contains(cand)) { dentroDeBarra = true; break; }
      }
      if (dentroDeBarra) continue;

      const txt = textoProprio(cand);
      if (!txt) continue;
      const csCand = getComputedStyle(cand);
      if (invisivel(csCand)) continue;
      const rectCand = cand.getBoundingClientRect();
      if (rectCand.width === 0 || rectCand.height === 0) continue;
      if (foraDaViewport(rectCand)) continue; // texto fora da tela não é "coberto", é ausente

      for (const b of barraEls) {
        // Sobreposição de VERDADE exige interseção nos DOIS eixos, não só em
        // Y. Dois retângulos podem compartilhar toda a faixa vertical e ainda
        // assim não se tocar — foi exatamente esse buraco que fez a gaveta
        // lateral fechada (`aside#agency-nav`, x −224..0, fora da viewport em
        // X) ser lida como "cobrindo 100%" de 19 folhas de texto que
        // começavam em x ≈ 240px, bem à direita dela. A área de interseção
        // real é o retângulo comum aos dois; se a largura OU a altura comum
        // for ≤ 0, não há sobreposição nenhuma, mesmo que o outro eixo bata.
        const larguraComum = Math.min(rectCand.right, b.rect.right) - Math.max(rectCand.left, b.rect.left);
        const alturaComum = Math.min(rectCand.bottom, b.rect.bottom) - Math.max(rectCand.top, b.rect.top);
        if (larguraComum <= 0 || alturaComum <= 0) continue;
        const areaComum = larguraComum * alturaComum;
        const areaCand = rectCand.width * rectCand.height;
        const pctCoberto = Math.round((areaComum / areaCand) * 100);
        if (pctCoberto <= 0) continue;
        cobertos.push({
          seletor: seletorDe(cand),
          texto: txt.slice(0, 60),
          pctCoberto,
          barraSeletor: seletorDe(b.el),
        });
      }
    }
  }
  const sobreposicao = {
    scrollYNaMedicao: window.scrollY,
    barras: barraEls.map((b) => ({
      seletor: seletorDe(b.el),
      rect: { top: Math.round(b.rect.top), bottom: Math.round(b.rect.bottom) },
    })),
    cobertos,
    veredito: barraEls.length === 0 ? "SEM_BARRA" : cobertos.length > 0 ? "ATRAPALHA" : "NÃO ATRAPALHA",
  };

  const headers = Array.from(document.querySelectorAll("header")).map((h) => {
    const r = h.getBoundingClientRect();
    return { alturaPx: Math.round(r.height), topPx: Math.round(r.top), seletor: seletorDe(h) };
  });

  // Faixa vazia acima do primeiro conteúdo visível: primeiro filho direto de
  // <body> com altura renderizada > 0.
  let gap = null;
  let el2 = document.body.firstElementChild;
  while (el2) {
    const cs2 = getComputedStyle(el2);
    if (cs2.display !== "none" && cs2.visibility !== "hidden") {
      const r2 = el2.getBoundingClientRect();
      if (r2.height > 0) {
        gap = { seletor: seletorDe(el2), gapAcimaPx: Math.round(r2.top) };
        break;
      }
    }
    el2 = el2.nextElementSibling;
  }

  return { achados, headers, gap, scrollY: window.scrollY, sobreposicao };
}

// ── Fluxo de login ───────────────────────────────────────────────────────
async function loginStaff(context) {
  const page = await context.newPage();
  await page.goto(BASE + "/auth/signin", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.fill("#email", EMAIL).catch(() => {});
  await page.fill("#password", PASSWORD).catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForURL((u) => u.pathname.startsWith("/agency"), { timeout: 15000 }).catch(() => {});
  const ok = page.url().includes("/agency");
  await page.close();
  return ok;
}

async function loginPortal(context) {
  const page = await context.newPage();
  await page
    .goto(BASE + "/portal/access?token=" + encodeURIComponent(PORTAL_TOKEN), {
      waitUntil: "networkidle",
      timeout: 45000,
    })
    .catch(() => {});
  await page.close();
}

// ── Execução ─────────────────────────────────────────────────────────────
const resumo = []; // { rota, largura, status: "ACHADO"|"NADA"|"PULADA", detalhe, sobreposicao }

// Em `/agency/dashboard` o modal de boas-vindas ("Guia do Master",
// `div.fixed.inset-0.z-[120]`) cobre a tela e envenena a medição de
// sobreposição — tudo abaixo dele leria como "coberto pelo modal", não pela
// barra fixa que estamos medindo. Fecha antes de medir, e diz que fechou.
async function fecharModalBoasVindas(page) {
  const modal = page.locator('div.fixed.inset-0.z-\\[120\\]');
  const visivel = (await modal.count()) > 0 && (await modal.first().isVisible().catch(() => false));
  if (!visivel) return false;

  const botaoEntendi = page.getByRole("button", { name: /entendi,\s*come/i }).first();
  if ((await botaoEntendi.count()) > 0) {
    await botaoEntendi.click().catch(() => {});
  } else {
    // Fallback: qualquer botão dentro do modal (ex.: o "×" de fechar).
    await modal.locator("button").first().click().catch(() => {});
  }
  await page.waitForTimeout(200);
  return true;
}

async function medirRota(context, route, width) {
  const page = await context.newPage();
  // Contextos de staff/portal são reaproveitados nas 3 larguras (para não
  // logar de novo a cada medição) — quem fixa a largura de VERDADE é a
  // página, não o contexto. Sem isto, as duas rotas autenticadas seriam
  // sempre medidas no viewport de criação do contexto, e a exigência de
  // medir nas 3 larguras (375 prioridade, 768, 1440) furaria exatamente nas
  // rotas que mais importam.
  await page.setViewportSize({ width: width.width, height: width.height });
  const url = BASE + route.path;
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
  await page.waitForTimeout(600);
  const httpStatus = resp?.status ? resp.status() : resp?.err ? `erro: ${resp.err.message}` : "?";

  let modalFechado = false;
  if (route.slug === "agency-dashboard") {
    modalFechado = await fecharModalBoasVindas(page);
    if (modalFechado) console.log("   (modal 'Guia do Master' estava aberto — fechado antes de medir)");
  }

  // 1) screenshot no topo (viewport, NUNCA fullPage — ver cabeçalho do arquivo)
  //    scrollY aqui é 0 (topo absoluto, sem rolagem programática ainda) — é
  //    o quadro exato que a medição de sobreposição (item 1 da PEÇA 2) exige.
  const fileTopo = `${outDir}/${route.slug}-${width.label}-topo.png`;
  await page.screenshot({ path: fileTopo, fullPage: false });
  const medTopo = await page.evaluate(scanTopoFn);

  // 2) rola e mede de novo — barra fixa só se revela com rolagem, e a
  //    rolagem tem que ser instantânea (§6.1 do DESIGN.md: `scroll-behavior:
  //    smooth` faria a medição acontecer antes de a página chegar ao destino)
  await page.evaluate(() => window.scrollBy({ top: 600, left: 0, behavior: "instant" }));
  await page.waitForTimeout(150);
  const fileRolado = `${outDir}/${route.slug}-${width.label}-rolado.png`;
  await page.screenshot({ path: fileRolado, fullPage: false });
  const medRolado = await page.evaluate(scanTopoFn);

  await page.close();

  const achados = [
    ...medTopo.achados.map((a) => ({ ...a, momento: "topo" })),
    ...medRolado.achados.map((a) => ({ ...a, momento: "rolado" })),
  ];
  // Dedup por seletor+momento já é suficiente (mesmo elemento não muda seletor).

  console.log(`\n── ${route.path}  @  ${width.label}px  ──  HTTP ${httpStatus}`);
  console.log(`   headers no DOM: ${medTopo.headers.length}`, medTopo.headers.length ? JSON.stringify(medTopo.headers) : "");
  console.log(`   faixa acima do 1º conteúdo (topo da rolagem): ${medTopo.gap ? `${medTopo.gap.gapAcimaPx}px em ${medTopo.gap.seletor}` : "não medido"}`);

  // Sobreposição (item novo da PEÇA 2, rodada 3) — medida em scrollY=0, com
  // `medTopo.sobreposicao` (calculado dentro de `scanTopoFn`, ver ali).
  const sob = medTopo.sobreposicao;
  console.log(`   SOBREPOSIÇÃO (scrollY=${sob.scrollYNaMedicao}): ${sob.veredito}`);
  if (sob.veredito === "ATRAPALHA") {
    for (const c of sob.cobertos) {
      console.log(`     coberto ${c.pctCoberto}% por ${c.barraSeletor} → ${c.seletor} "${c.texto}"`);
    }
  }

  if (achados.length === 0) {
    console.log("   NADA — nenhum elemento fixo/sticky claro/vazio encostado no topo, no topo nem após rolar 600px.");
    resumo.push({ rota: route.path, largura: width.label, status: "NADA", sobreposicao: sob.veredito });
  } else {
    console.log(`   ACHADO — ${achados.length} elemento(s):`);
    for (const a of achados) {
      console.log(
        `     [${a.momento}] ${a.seletor} — ${a.posicao}, ${a.larguraPx}x${a.alturaPx}px, top:${a.topPx}px, bg:${a.backgroundColor}, z:${a.zIndex}, luminância:${a.luminancia} — ${a.motivo}`
      );
    }
    resumo.push({ rota: route.path, largura: width.label, status: "ACHADO", achados, sobreposicao: sob.veredito });
  }

  return { httpStatus, achados, sobreposicao: sob.veredito };
}

async function main() {
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

  let staffOk = false;
  let staffContext = null;
  let portalContext = null;

  try {
    // Contexto autenticado de staff, reaproveitado nas 3 larguras.
    if (args.login) {
      if (!PASSWORD) {
        console.log(
          "LOGIN INDISPONÍVEL: falta a senha de master@dioli.studio. Ela não é constante pública " +
            "(scripts/seed-db.mjs) — passe --password <senha> ou exporte SEED_MASTER_PASSWORD/" +
            "DIOLI_MASTER_PASSWORD com o valor usado no boot do seed. Seguindo só com rotas públicas."
        );
      } else {
        staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
        staffOk = await loginStaff(staffContext);
        if (!staffOk) {
          console.log(
            `LOGIN INDISPONÍVEL: autenticação de master@dioli.studio falhou (credencial errada ou conta ` +
              `sem senha fixa nesta base). Seguindo só com rotas públicas.`
          );
          await staffContext.close();
          staffContext = null;
        } else {
          console.log(`✓ Login de staff OK (${EMAIL})`);
        }
      }
    } else {
      console.log("Sem --login: rotas de staff (/agency/dashboard) puladas nesta rodada.");
    }

    if (PORTAL_TOKEN) {
      portalContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      await loginPortal(portalContext);
      console.log("✓ Cookie de acesso do portal obtido via --portal-token");
    } else {
      console.log(
        "LOGIN INDISPONÍVEL: falta token de acesso do portal (/portal/access/me exige cookie de cliente; " +
          "o seed desta base não cria cliente demo — 'sistema limpo, sem dados demo'). Passe --portal-token " +
          "<token> de um Client real, ou crie um projeto/cliente e gere o link do portal. Rota pulada."
      );
    }

    for (const width of WIDTHS) {
      for (const route of ROUTES) {
        if (route.auth === "staff") {
          if (!staffOk) {
            console.log(`\n── ${route.path}  @  ${width.label}px  ──  PULADA (sem sessão de staff)`);
            resumo.push({ rota: route.path, largura: width.label, status: "PULADA", detalhe: "sem sessão de staff" });
            continue;
          }
          await medirRota(staffContext, route, width);
          continue;
        }
        if (route.auth === "portal") {
          if (!portalContext) {
            console.log(`\n── ${route.path}  @  ${width.label}px  ──  PULADA (sem token de portal)`);
            resumo.push({ rota: route.path, largura: width.label, status: "PULADA", detalhe: "sem token de portal" });
            continue;
          }
          await medirRota(portalContext, route, width);
          continue;
        }
        // Rota pública: contexto novo e limpo por medição, para não vazar
        // estado (ex.: modal já aberto) de uma rota para a próxima.
        const ctx = await browser.newContext({ viewport: { width: width.width, height: width.height }, deviceScaleFactor: 2 });
        await medirRota(ctx, route, width);
        await ctx.close();
      }
    }
  } finally {
    if (staffContext) await staffContext.close();
    if (portalContext) await portalContext.close();
    await browser.close();
  }

  // ── Resumo final ─────────────────────────────────────────────────────
  console.log("\n\n════════════════════ RESUMO ════════════════════");
  const porStatus = { ACHADO: 0, NADA: 0, PULADA: 0 };
  let atrapalha = 0;
  for (const r of resumo) {
    porStatus[r.status] = (porStatus[r.status] || 0) + 1;
    if (r.sobreposicao === "ATRAPALHA") atrapalha++;
    const linha = `${r.status.padEnd(7)} ${r.rota.padEnd(22)} @ ${r.largura.padStart(4)}px`;
    const sobTag = r.sobreposicao ? `  sobreposição:${r.sobreposicao}` : "";
    console.log(r.status === "ACHADO" ? `${linha}  (${r.achados.length} elemento(s))${sobTag}` : `${linha}${sobTag}`);
  }
  console.log("──────────────────────────────────────────────");
  console.log(`ACHADO (barra clara/vazia no topo): ${porStatus.ACHADO}   NADA: ${porStatus.NADA}   PULADA: ${porStatus.PULADA}`);
  console.log(`ATRAPALHA (conteúdo coberto e irrevelável em scrollY=0): ${atrapalha}`);
  console.log("════════════════════════════════════════════════");

  // O gate desta rodada continua sendo "achou barra clara?" — a pergunta que
  // este script sempre respondeu. "Atrapalha?" é medição nova, reportada
  // acima, e NÃO vira código de saída aqui: a ficha da rodada 3 pede
  // MEDIÇÃO, não veredito automático de conserto. Quem decide se o número de
  // ATRAPALHA abre uma rodada de conserto é o PM, lendo esta saída.
  process.exit(porStatus.ACHADO > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
