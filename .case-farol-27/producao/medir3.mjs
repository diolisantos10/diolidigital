import { readFileSync } from "node:fs";
// Assinatura semantica de uma pergunta: as PALAVRAS-CHAVE do que ela pede.
// A regua de faixas ("ate R$150 / 150-500 / ...") e citada palavra por palavra
// por mais que a frase em volta seja reescrita -> e a identidade da pergunta.
const TEMAS = [
  ["faixa de investimento (a regua dos 5 degraus)", /at[ée]\s*r\$\s*150/i],
  ["verba de midia dos anuncios",                   /verba (mensal )?(de m[íi]dia|que voc[êe]s t[êe]m)/i],
  ["quais canais/plataformas",                      /quais canais|instagram, facebook, tiktok/i],
  ["ritmo de posts",                                /quantas postagens|quantas vezes por semana|ritmo/i],
  ["stories",                                       /stories/i],
  ["reels/videos",                                  /reels|v[íi]deos curtos/i],
  ["contrato mensal x pontual",                     /contrato mensal|campanha pontual/i],
  ["publico-alvo",                                  /p[úu]blico-?alvo|cliente ideal/i],
  ["objetivo",                                      /principal objetivo|quer alcan[çc]ar/i],
  ["nome do negocio",                               /nome do seu neg[óo]cio|nome da (sua )?empresa/i],
  ["o que precisa / desafio",                       /est[áa] precisando|maior desafio|podemos ajudar/i],
];
for (const [rot, arq] of [
  ["ANTES   (3770124, rodada 1)", "transcricao-ANTES.json"],
  ["RODADA2 (274bd18)",           "transcricao-DEPOIS.json"],
  ["AGORA   (d91cc47, rodada 3)", "transcricao-R3.json"],
]) {
  let d; try { d = JSON.parse(readFileSync(new URL("./"+arq, import.meta.url),"utf8")); } catch { console.log(`\n-- ${rot}: sem transcricao`); continue; }
  const falas = d.transcricao.map(x=>x.casa).filter(Boolean);
  const distintos = new Set(); const seq = [];
  for (const f of falas) {
    const hits = TEMAS.filter(([,re])=>re.test(f)).map(([n])=>n);
    const t = hits[0] ?? "(outro/sem pergunta identificada)";
    distintos.add(t); seq.push(t);
  }
  const cont = {}; seq.forEach(t=>cont[t]=(cont[t]||0)+1);
  let max=0,cur=0,prev=null,ini=0,mIni=0,mTema=null;
  seq.forEach((t,i)=>{ if(t===prev){cur++;} else {cur=1;ini=i;prev=t;} if(cur>max){max=cur;mIni=ini;mTema=t;} });
  const ult = d.transcricao.at(-1);
  console.log(`\n── ${rot}`);
  console.log(`   turnos respondidos pela casa      : ${falas.length}`);
  console.log(`   perguntas DISTINTAS               : ${distintos.size}`);
  console.log(`   alguma se repete?                 : ${Object.values(cont).some(n=>n>1) ? "SIM" : "nao"}`);
  console.log(`   maior sequencia CONSECUTIVA igual : ${max} turnos (${mIni+1}–${mIni+max}) — "${mTema}"`);
  console.log(`   fim da conversa                   : ${ult.casa ? "respondeu" : "BARRADA (price_leak)"}`);
  console.log(`   distribuicao:`);
  Object.entries(cont).sort((a,b)=>b[1]-a[1]).forEach(([t,n])=>console.log(`      ${String(n).padStart(2)}x  ${t}`));
}
