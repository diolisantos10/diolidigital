import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const B = "https://www.diolidigital.com.br";
const PEDIDO = "cmt7iu3l4001q0xtho1f7cxtw";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:2400}, locale:"pt-BR" });
const api = await ctx.request.post(`${B}/api/auth/signin`, { data:{ email: process.env.U, password: process.env.P }});
console.log("signin:", api.status(), (await api.text()).slice(0,200).replace(/./g, c=>c));
const p = await ctx.newPage();
await p.goto(`${B}/agency/inbox`, { waitUntil:"networkidle", timeout:120000 }).catch(e=>console.log("nav:",String(e).slice(0,120)));
await p.waitForTimeout(5000);
let t = (await p.innerText("body").catch(()=>"" )).replace(/\s+/g," ");
console.log("=== INBOX ===\n" + t.slice(0,3000));
// tentar abrir o pedido especifico
for (const url of [`${B}/agency/inbox?pedido=${PEDIDO}`, `${B}/agency/inbox/${PEDIDO}`]) {
  await p.goto(url, { waitUntil:"networkidle", timeout:120000 }).catch(()=>{});
  await p.waitForTimeout(4000);
  const x = (await p.innerText("body").catch(()=>"" )).replace(/\s+/g," ");
  console.log(`\n=== ${url} ===\n` + x.slice(0,4000));
  const m = x.match(/proposta\/[A-Za-z0-9_\-]+/g);
  if (m) console.log("LINKS:", [...new Set(m)]);
  writeFileSync(".case-farol-27/r4/inbox.txt", x);
}
await b.close();
