// Cliente HTTP de produção com sessão reaproveitada (o login tem teto de 5/5min).
// A senha NUNCA é escrita em disco: vem do ambiente, e só o cookie é guardado.
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const B = "https://www.diolidigital.com.br";
const JAR = ".case-farol-27/r4/.cookie.json";
const b = await chromium.launch();
let ctx;
if (existsSync(JAR)) ctx = await b.newContext({ storageState: JAR });
else {
  ctx = await b.newContext();
  const s = await ctx.request.post(`${B}/api/auth/signin`, { data:{ email: process.env.U, password: process.env.P }});
  console.error("signin", s.status());
  if (s.status() !== 200) { await b.close(); process.exit(1); }
  await ctx.storageState({ path: JAR });
}
const args = process.argv.slice(2);
const N = Number(process.env.N || 3000);
for (const spec of args) {
  const [method, path, ...rest] = spec.split(" ");
  const body = rest.join(" ");
  const opts = body ? { data: JSON.parse(body), headers: { "content-type":"application/json" } } : {};
  const r = await ctx.request.fetch(B + path, { method, ...opts });
  const t = await r.text();
  console.log(`\n=== ${method} ${path} -> ${r.status()} (${t.length}b) ===`);
  console.log(t.slice(0, N));
  if (process.env.OUT) writeFileSync(process.env.OUT, t);
}
await b.close();
