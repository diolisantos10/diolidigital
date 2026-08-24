import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const r = JSON.parse(readFileSync(".case-farol-27/resumo.json","utf8"));
const B = "http://localhost:3111";
const nav = chromium.launch();
const b = await nav;
const ctx = await b.newContext({ viewport:{width:1440,height:2200}, locale:"pt-BR" });
// login pela rota real da casa
const api = await ctx.request.post(`${B}/api/auth/signin`, { data:{ email:r.login.email, password:r.login.senha }});
console.log("signin:", api.status());
const p = await ctx.newPage();
const txt = {};
for (const [nome, url] of [["ficha", `${B}${r.paginaDoCliente}`], ["portal", `${B}${r.portalDoCliente}`]]) {
  await p.goto(url, { waitUntil:"networkidle", timeout:120000 }).catch(e=>console.log(nome,"nav:",String(e).slice(0,80)));
  await p.waitForTimeout(4000);
  await p.screenshot({ path:`.case-farol-27/shots/r3-${nome}.png`, fullPage:true });
  txt[nome] = (await p.innerText("body").catch(()=> "")).replace(/\s+/g," ");
  console.log(`\n=== ${nome} (${url}) ===\n` + txt[nome].slice(0, 1400));
}
writeFileSync(".case-farol-27/texto-das-telas.json", JSON.stringify(txt,null,1));
await b.close();
