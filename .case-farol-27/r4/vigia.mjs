import { chromium } from "playwright";
const B="https://www.diolidigital.com.br", P="cmt7savmn001u0xpajd03nq73";
const b=await chromium.launch(); const ctx=await b.newContext({storageState:".case-farol-27/r4/.cookie.json"});
for(let i=0;i<40;i++){
  const r=await ctx.request.get(`${B}/api/projects/${P}`); const d=await r.json();
  console.log(new Date().toISOString().slice(11,19), d.executionStatus, "tent",d.executionAttempts,
    "entregas",(d.deliverables||[]).length, "|", (d.executionError||"").slice(0,110));
  if(d.executionStatus==="done"||d.executionStatus==="blocked") break;
  await new Promise(s=>setTimeout(s,60000));
}
await b.close();
