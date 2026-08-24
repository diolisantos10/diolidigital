import { chromium } from "playwright";
const B="https://www.diolidigital.com.br";
const b=await chromium.launch(); const ctx=await b.newContext({storageState:".case-farol-27/r4/.cookie.json"});
const r=await ctx.request.post(`${B}/api/generate-image`,{
  headers:{ "content-type":"application/json", origin:B, referer:`${B}/agency/design-agent` },
  data:{ prompt:"Post de Instagram para uma padaria e café brasileira chamada Farol 27: croissant e cappuccino sobre balcão de madeira, luz da manhã, tons quentes, estilo fotográfico, sem texto.", size:"1024x1024", quality:"medium" },
  timeout: 180000,
});
const t=await r.text();
console.log("status", r.status(), "tam", t.length);
console.log(t.slice(0,300).replace(/data:image[^"]{0,80}[^"]*/,"<base64 da imagem>"));
await b.close();
