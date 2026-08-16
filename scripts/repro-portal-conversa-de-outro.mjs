// ── A REPRODUÇÃO NO NAVEGADOR, VERSIONADA ──────────────────────────────────
//
// A rodada 1 AFIRMOU que "tela e chat nunca divergem dentro de uma mesma
// visita" e não deixou artefato nenhum no commit. O `qualidade` recusou, com
// razão: sem script, sem log, sem trace, aquilo não é refutação — é afirmação.
// Este arquivo é o artefato. A saída dele fica em
// `docs/entregas/portal-15-08/reproducao-navegador.json`.
//
// Ele anda os quatro cenários, inclusive o que a rodada 1 NÃO tinha andado e é
// o que acontece de verdade: **duas abas**. A divergência não é dentro de uma
// visita — é ENTRE visitas, porque o cookie é do domínio e o chat da aba antiga
// continua polindo de 8 em 8 segundos sem token.
//
// Nenhum dado real de cliente: dois clientes de mentira, semeados na hora.
//
// Como rodar:
//   printf 'DATABASE_URL="file:./dev.db"\nJWT_SECRET=dev\n' > .env
//   npx prisma db push && node scripts/repro-portal-conversa-de-outro.mjs --semear
//   npm run dev &
//   node scripts/repro-portal-conversa-de-outro.mjs

import { chromium } from "playwright";
import { createClient } from "@libsql/client";

const BASE = process.env.BASE ?? "http://localhost:3000";

async function semear() {
  const db = createClient({ url: `file:${process.cwd()}/dev.db` });
  const q = (sql, args = []) => db.execute({ sql, args });
  const now = new Date().toISOString();
  await q(`INSERT OR REPLACE INTO AgencyWorkspace (id,name,slug,createdAt) VALUES ('w-r','Dioli','repro',?)`, [now]);
  for (const [id, nome] of [["cli-alfa", "Agência ALFA (cliente A)"], ["cli-beta", "Loja BETA (cliente B)"]]) {
    await q(`INSERT OR REPLACE INTO Client (id,workspaceId,name,portalToken,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`,
      [id, "w-r", nome, "pt-" + id, now, now]);
  }
  await q(`INSERT OR REPLACE INTO ClientRequestDb
    (id,workspaceId,clientId,businessName,segment,services,objectives,status,rawContext,createdAt,updatedAt)
    VALUES ('req-alfa','w-r','cli-alfa','Agência ALFA','agência','[]','[]','in_progress','x',?,?)`, [now, now]);
  await q(`DELETE FROM PortalMessage`);
  await q(`INSERT INTO PortalMessage (id,clientRequestId,clientId,authorRole,authorName,body,readByTeam,readByClient,createdAt)
    VALUES ('m-a1','req-alfa','cli-alfa','team','Equipe Dioli','SEGREDO-DO-ALFA combinacao comercial',1,0,'2026-08-08T13:28:00.000Z')`);
  await q(`INSERT INTO PortalMessage (id,clientRequestId,clientId,authorRole,authorName,body,readByTeam,readByClient,createdAt)
    VALUES ('m-b1',NULL,'cli-beta','client','Loja BETA','recado-da-beta',0,1,?)`, [now]);
  await q(`DELETE FROM PortalAccess`);
  await q(`INSERT INTO PortalAccess (id,token,clientId,clientRequestId,grantedAt,accessCount,createdAt)
    VALUES ('pa-a','TOKENALFA','cli-alfa','req-alfa',?,0,?)`, [now, now]);
  await q(`INSERT INTO PortalAccess (id,token,clientId,clientRequestId,grantedAt,accessCount,createdAt)
    VALUES ('pa-b','TOKENBETA','cli-beta',NULL,?,0,?)`, [now, now]);
  console.log("semeado: TOKENALFA / TOKENBETA");
}

async function lerPortal(page) {
  const marca = await page.locator(".cp-client-head small").first().textContent().catch(() => null);
  await page.getByRole("button", { name: /Project Manager/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const texto = await page.locator(".fixed").last().innerText().catch(() => "");
  return {
    marcaNaTela: (marca || "").trim(),
    chatMostraSegredoDoAlfa: /SEGREDO-DO-ALFA/.test(texto),
    chatMostraRecadoDaBeta: /recado-da-beta/.test(texto),
    chatRecusouComSeguranca: /não consegui abrir esta conversa com segurança/i.test(texto),
  };
}

async function main() {
  const registro = [];
  const browser = await chromium.launch();

  // ── 1 a 3: uma visita de cada vez, contextos isolados ────────────────────
  for (const [rotulo, cookieToken, caminho] of [
    ["1) portal do ALFA, cookie do ALFA (caso limpo)", "TOKENALFA", "/portal/access/TOKENALFA"],
    ["2) portal do BETA com o cookie do ALFA guardado", "TOKENALFA", "/portal/access/TOKENBETA"],
    ["3) /me com o cookie do ALFA (sessão legítima por cookie)", "TOKENALFA", "/portal/access/me"],
  ]) {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "dioli_portal", value: cookieToken, domain: "localhost", path: "/", httpOnly: true }]);
    const page = await ctx.newPage();
    await page.goto(BASE + caminho, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    registro.push({ rotulo, urlFinal: page.url().replace(BASE, ""), ...(await lerPortal(page)) });
    await ctx.close();
  }

  // ── 4: DUAS ABAS no MESMO contexto — o cenário que a rodada 1 não andou ──
  // O cookie é do DOMÍNIO: quando a aba 2 abre o portal do BETA, a aba 1 (que
  // está em /me e pole o chat sem token) passa a resolver o BETA. O selo da
  // aba 1 continua sendo o do ALFA — e é ele que faz a conversa fechar.
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "dioli_portal", value: "TOKENALFA", domain: "localhost", path: "/", httpOnly: true }]);

  const aba1 = await ctx.newPage();
  await aba1.goto(`${BASE}/portal/access/me`, { waitUntil: "networkidle" });
  await aba1.getByRole("button", { name: /Project Manager/i }).first().click().catch(() => {});
  await aba1.waitForTimeout(2000);
  const antes = await aba1.locator(".fixed").last().innerText().catch(() => "");

  const aba2 = await ctx.newPage();
  await aba2.goto(`${BASE}/portal/access/TOKENBETA`, { waitUntil: "networkidle" });
  await aba2.waitForTimeout(1500);

  // O chat da aba 1 pole de 8 em 8 segundos. Esperamos duas voltas.
  await aba1.bringToFront();
  await aba1.waitForTimeout(18000);
  const depois = await aba1.locator(".fixed").last().innerText().catch(() => "");

  registro.push({
    rotulo: "4) DUAS ABAS — aba 1 em /me (cookie ALFA), aba 2 abre o portal do BETA",
    cookieDepois: (await ctx.cookies()).find((c) => c.name === "dioli_portal")?.value ?? null,
    aba1AntesMostravaSegredoDoAlfa: /SEGREDO-DO-ALFA/.test(antes),
    aba1DepoisMostraSegredoDoAlfa: /SEGREDO-DO-ALFA/.test(depois),
    aba1DepoisMostraRecadoDaBeta: /recado-da-beta/.test(depois),
    aba1DepoisRecusouComSeguranca: /não consegui abrir esta conversa com segurança/i.test(depois),
  });

  await browser.close();
  console.log(JSON.stringify({ medidoEm: new Date().toISOString(), base: BASE, cenarios: registro }, null, 2));
}

if (process.argv.includes("--semear")) await semear();
else await main();
