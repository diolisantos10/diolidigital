import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const B = "https://www.diolidigital.com.br";
const b = await chromium.launch();
const ctx = await b.newContext();
const s = await ctx.request.post(`${B}/api/auth/signin`, { data:{ email: process.env.U, password: process.env.P }});
console.log("signin", s.status());
for (const path of process.argv.slice(2)) {
  const r = await ctx.request.get(B + path);
  const t = await r.text();
  console.log(`\n=== GET ${path} -> ${r.status()} (${t.length}b) ===`);
  console.log(t.slice(0, Number(process.env.N || 3000)));
}
await b.close();
