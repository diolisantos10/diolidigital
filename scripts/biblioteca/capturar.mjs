// capturar.mjs — A BIBLIOTECA DAS PLATAFORMAS É CAPTURADA, NÃO LEMBRADA.
//
// Ordem do CEO (03/08/2026), no dia em que a Meta restringiu a conta de
// anúncios da agência: os especialistas de Meta, Google e TikTok precisam de
// uma biblioteca DENTRO do sistema, com os documentos das próprias
// plataformas — não com o que um modelo lembra deles. Memória de modelo
// envelhece e alucina; documento capturado tem data, origem e hash.
//
// Uso:
//   node scripts/biblioteca/capturar.mjs meta          # captura uma plataforma
//   node scripts/biblioteca/capturar.mjs               # captura todas
//   node scripts/biblioteca/capturar.mjs meta --diff   # só relata o que mudou
//   node scripts/biblioteca/capturar.mjs meta --slug=graph-api-changelog,app-modos-dev-vs-live
//                                                     # recaptura só as fontes citadas
//                                                     # (o modo de RETENTATIVA: manifesto
//                                                     #  com ~100 fontes leva ~35 min inteiro,
//                                                     #  e uma lacuna do dia anterior não
//                                                     #  justifica varrer tudo de novo)
//
// Cada plataforma tem um manifesto `docs/plataformas/<p>/fontes.json`:
//   [{ "slug": "padroes-de-publicidade", "titulo": "…", "url": "https://…" }]
//
// O resultado vai para `docs/plataformas/<p>/fontes/<slug>.md`, com cabeçalho
// de origem (url, data, hash). Página é renderizada com Chromium (Playwright):
// os centros de ajuda dessas empresas são aplicações JavaScript — um curl
// devolve casca vazia e a "biblioteca" viraria decoração.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const BASE = path.join(RAIZ, "docs", "plataformas");

/** Abaixo disso a captura é considerada FALHA: página de erro, casca de JS ou
 *  bloqueio de robô. Guardar isso como "fonte" seria pior que não guardar.
 *
 *  A medida é de CONTEÚDO ÚTIL, não de tamanho bruto: menu de navegação vem em
 *  linhas curtas, uma por item, e uma página que é só menu somava caracteres
 *  suficientes para passar (achado da auditoria de 03/08/2026 — a página de
 *  música do TikTok passou com ~1.100 caracteres de documento real). Linha
 *  parágrafo-de-verdade tem mais de 60 caracteres. */
const MINIMO_DE_CARACTERES_UTEIS = 1200;
function caracteresUteis(texto) {
  return texto.split("\n").filter((l) => l.trim().length > 60)
    .reduce((n, l) => n + l.length, 0);
}

const soDiff = process.argv.includes("--diff");
const alvo = process.argv[2] && !process.argv[2].startsWith("--") ? [process.argv[2]] : null;
const filtroSlug = (() => {
  const arg = process.argv.find((a) => a.startsWith("--slug="));
  if (!arg) return null;
  const lista = arg.slice("--slug=".length).split(",").map((s) => s.trim()).filter(Boolean);
  return lista.length > 0 ? new Set(lista) : null;
})();

const plataformas = (alvo ?? readdirSync(BASE, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name))
  .filter((p) => existsSync(path.join(BASE, p, "fontes.json")));

if (plataformas.length === 0) {
  console.error("Nenhum manifesto fontes.json encontrado em docs/plataformas/*/");
  process.exit(1);
}

const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
// Em ambiente com proxy de saída (sessão remota), o Chromium precisa ser
// apontado para ele — a CA do proxy já está no NSS do sistema.
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({
  executablePath,
  proxy,
  // Diagnóstico de 03/08/2026: o egress desta sessão remota derruba o
  // ClientHello do TLS 1.3 do Chrome (chave pós-quântica o torna grande e
  // fragmentado). Com TLS 1.2 o handshake passa — e a verificação de
  // certificado continua LIGADA. Só se aplica quando há proxy.
  args: proxy ? ["--ssl-version-max=tls1.2"] : [],
});
const contexto = await browser.newContext({
  locale: "pt-BR",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});

let falhas = 0;
const mudancas = [];

for (const plat of plataformas) {
  const manifesto = JSON.parse(readFileSync(path.join(BASE, plat, "fontes.json"), "utf8"));
  const pastaFontes = path.join(BASE, plat, "fontes");
  mkdirSync(pastaFontes, { recursive: true });

  for (const fonte of manifesto) {
    if (filtroSlug && !filtroSlug.has(fonte.slug)) continue;
    const destino = path.join(pastaFontes, `${fonte.slug}.md`);
    const pagina = await contexto.newPage();
    let texto = "";
    try {
      await pagina.goto(fonte.url, { waitUntil: "networkidle", timeout: 60_000 });
      // Segunda espera curta: os help centers hidratam depois do networkidle.
      await pagina.waitForTimeout(2500);
      texto = await pagina.evaluate(() => {
        // Tira o que não é conteúdo. O que sobra é o documento.
        for (const sel of ["nav", "header", "footer", "script", "style", "noscript", "[role=navigation]", "[aria-hidden=true]"]) {
          document.querySelectorAll(sel).forEach((e) => e.remove());
        }
        const principal = document.querySelector("main, article, [role=main]") ?? document.body;
        return principal.innerText;
      });
    } catch (e) {
      console.error(`✗ ${plat}/${fonte.slug}: ${e.message?.slice(0, 120)}`);
      falhas++;
      await pagina.close();
      continue;
    }
    await pagina.close();

    texto = texto.replace(/\n{3,}/g, "\n\n").trim();
    const uteis = caracteresUteis(texto);
    if (uteis < MINIMO_DE_CARACTERES_UTEIS) {
      console.error(`✗ ${plat}/${fonte.slug}: só ${uteis} caracteres ÚTEIS (${texto.length} brutos) — menu, casca ou bloqueio. NÃO gravado.`);
      falhas++;
      continue;
    }

    const hash = createHash("sha256").update(texto).digest("hex").slice(0, 16);
    const anterior = existsSync(destino) ? readFileSync(destino, "utf8") : null;
    const hashAnterior = anterior?.match(/^hash: (\w+)/m)?.[1] ?? null;

    if (hashAnterior && hashAnterior !== hash) {
      mudancas.push(`${plat}/${fonte.slug} (${fonte.titulo})`);
    }

    if (!soDiff) {
      const corpo = [
        "---",
        `titulo: ${JSON.stringify(fonte.titulo)}`,
        `url: ${fonte.url}`,
        `capturado_em: ${new Date().toISOString().slice(0, 10)}`,
        `hash: ${hash}`,
        "---",
        "",
        `> Documento oficial capturado da plataforma. A fonte é a URL acima;`,
        `> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.`,
        "",
        texto,
      ].join("\n");
      writeFileSync(destino, corpo);
    }
    const marcador = hashAnterior === null ? "novo" : hashAnterior === hash ? "sem mudança" : "MUDOU";
    console.log(`✓ ${plat}/${fonte.slug}: ${texto.length} caracteres [${marcador}]`);
  }
}

await browser.close();

if (mudancas.length > 0) {
  console.log(`\n⚠ MUDANÇAS DETECTADAS (${mudancas.length}):`);
  for (const m of mudancas) console.log(`  - ${m}`);
}
if (falhas > 0) {
  console.error(`\n${falhas} captura(s) falharam — a biblioteca está INCOMPLETA nesses pontos e isso precisa aparecer no relato, não sumir.`);
  process.exit(2);
}
