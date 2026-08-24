import { chromium } from "playwright";
const B="https://www.diolidigital.com.br";
const b=await chromium.launch(); const ctx=await b.newContext({storageState:".case-farol-27/r4/.cookie.json"});
const [path, json] = process.argv.slice(2);
const r=await ctx.request.post(B+path,{ headers:{ "content-type":"application/json", origin:B, referer:B+"/agency" }, data: JSON.parse(json), timeout: 300000 });
const t=await r.text(); console.log(r.status(), t.slice(0, Number(process.env.N||1500)));
await b.close();
