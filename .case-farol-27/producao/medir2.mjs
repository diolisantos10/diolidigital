import { readFileSync } from "node:fs";
// A régua de faixas é a IDENTIDADE SEMÂNTICA da pergunta: ela cita os mesmos
// cinco degraus, palavra por palavra, por mais que a frase em volta mude.
const REGUA = /at[ée]\s*r\$\s*150/i;
for (const [rot,arq] of [["ANTES  (deploy 3770124)","transcricao-ANTES.json"],["DEPOIS (deploy 274bd18)","transcricao-DEPOIS.json"]]) {
  const d = JSON.parse(readFileSync(new URL("./"+arq, import.meta.url),"utf8"));
  const falas = d.transcricao.map(x=>x.casa).filter(Boolean);
  const mark = falas.map(f=>REGUA.test(f));
  let max=0,cur=0,ini=0,melhorIni=0;
  mark.forEach((m,i)=>{ if(m){ if(cur===0) ini=i; cur++; if(cur>max){max=cur;melhorIni=ini;} } else cur=0; });
  const ult = d.transcricao.at(-1);
  console.log(`\n── ${rot}`);
  console.log(`   turnos respondidos pela casa            : ${falas.length}`);
  console.log(`   turnos que fazem a MESMA pergunta de faixa: ${mark.filter(Boolean).length}`);
  console.log(`   maior sequência CONSECUTIVA dela        : ${max}  (turnos ${melhorIni+1}–${melhorIni+max})`);
  console.log(`   a conversa chegou ao fim?               : ${ult.casa ? "sim" : "NÃO — barrada com reason="+(JSON.parse(JSON.stringify(ult)).casa===null?"price_leak":"?")}`);
}
